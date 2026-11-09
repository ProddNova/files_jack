import * as THREE from '../vendor/three.module.min.js';
import { rng, newSeed, clamp } from './util.js';
import {
  createTerrain, raycastTerrain, getHeight, paintPath, restorePath,
  encodePath, decodePath, snapshotPath, setPath,
} from './terrain.js';
import { BUILDERS, disposeGroup, pickTreeType, FLOWER_NAMES } from './builders.js';
import { createWorld } from './world.js';
import { CameraRig } from './controls.js';
import * as audio from './audio.js';

const SAVE_KEY = 'borgo-di-mare-v1';
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const loading = $('#loading');

// ---------- Renderer ----------

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  loading.textContent = 'Il tuo browser non supporta WebGL 😢';
  throw err;
}
const lowPower = (navigator.hardwareConcurrency || 4) <= 2;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 800);
const rig = new CameraRig(camera);
const world = createWorld(scene, { lowPower });
scene.add(createTerrain());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

// ---------- UI helpers ----------

const toastEl = $('#toast');
let toastTimer = 0;
function toast(text, ms = 2600) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ---------- Objects, undo and save ----------

const objects = [];
const undoStack = [];
let saveTimer = 0;

function attach(obj) {
  const built = BUILDERS[obj.kind](obj.data, false);
  if (!built) return false;
  Object.assign(obj, built);
  obj.flag = built.group.children.find((c) => c.userData.flag) || null;
  scene.add(obj.group);
  objects.push(obj);
  return true;
}

const pops = [];
const BUILDINGS = new Set(['house', 'tower', 'wall']);

function addObj(kind, data, animate = false) {
  const obj = { kind, data };
  if (!attach(obj)) return null;
  if (animate) {
    if (BUILDINGS.has(kind)) obj.group.scale.y = 0.01;
    else obj.group.scale.setScalar(0.01);
    pops.push({ obj, t: 0 });
  }
  return obj;
}

// Small bounce when something appears
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t = Math.min(1, p.t + dt / 0.38);
    const k = Math.max(0.01, easeOutBack(p.t));
    if (BUILDINGS.has(p.obj.kind)) p.obj.group.scale.y = k;
    else p.obj.group.scale.setScalar(k);
    if (p.t >= 1) pops.splice(i, 1);
  }
}

function removeObj(obj) {
  const i = objects.indexOf(obj);
  if (i < 0) return;
  objects.splice(i, 1);
  scene.remove(obj.group);
  disposeGroup(obj.group);
}

function pushAction(action) {
  if (!action.added.length && !action.removed.length && !(action.pathChanges && action.pathChanges.size) && !action.pathSnapshot) return;
  undoStack.push(action);
  if (undoStack.length > 80) undoStack.shift();
  scheduleSave();
}

function undo() {
  const a = undoStack.pop();
  if (!a) {
    toast('Niente da annullare');
    return;
  }
  for (const o of a.added) removeObj(o);
  for (const o of a.removed) attach(o);
  if (a.pathChanges) restorePath(a.pathChanges);
  if (a.pathSnapshot) setPath(a.pathSnapshot);
  audio.tick();
  scheduleSave();
}

const newAction = () => ({ added: [], removed: [], pathChanges: null, pathSnapshot: null });

// Removes trees and flowers that would end up inside something new.
function clearNatureUnder(hitDist, margin, action) {
  for (const o of objects.slice()) {
    if ((o.kind === 'tree' || o.kind === 'flower') && hitDist(o.data.x, o.data.z) < margin) {
      removeObj(o);
      action.removed.push(o);
    }
  }
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function save() {
  try {
    const payload = {
      v: 1,
      time: world.timeIndex,
      objects: objects.map((o) => ({ kind: o.kind, data: o.data })),
      path: encodePath(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch { /* storage full or blocked: the game still works */ }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}

window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch { /* ignore */ }
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return false;
    for (const o of p.objects || []) {
      if (BUILDERS[o.kind]) addObj(o.kind, o.data);
    }
    if (p.path) decodePath(p.path);
    if (typeof p.time === 'number') world.setTime(p.time);
    return true;
  } catch {
    return false;
  }
}

function starterIsland() {
  const r = rng(2025);
  const groves = [
    { cx: -8, cz: -9, rad: 7, n: 34, types: ['pine', 'pine', 'cypress', 'olive'] },
    { cx: 10, cz: -4, rad: 4, n: 12, types: ['olive', 'olive', 'lemon'] },
    { cx: -14, cz: 8, rad: 4, n: 9, types: ['olive', 'cypress'] },
  ];
  for (const g of groves) {
    for (let i = 0; i < g.n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * g.rad;
      const x = round2(g.cx + Math.cos(a) * d), z = round2(g.cz + Math.sin(a) * d);
      if (getHeight(x, z) < 0.6 || !treeSpotFree(x, z, 1.1)) continue;
      addObj('tree', { x, z, seed: r.int(1, 1e9), type: r.pick(g.types) });
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2, d = r.range(6, 16);
    const x = round2(Math.cos(a) * d), z = round2(Math.sin(a) * d);
    if (getHeight(x, z) < 0.6) continue;
    addObj('flower', { x, z, seed: r.int(1, 1e9), variant: r.int(0, FLOWER_NAMES.length - 1) });
  }
}

// ---------- Ghost preview ----------

let ghost = null;
let ghostWanted = null;

function wantGhost(kind, data) {
  ghostWanted = kind ? { kind, data } : { kind: null };
}

function refreshGhost() {
  if (!ghostWanted) return;
  if (ghost) {
    scene.remove(ghost);
    disposeGroup(ghost);
    ghost = null;
  }
  if (ghostWanted.kind) {
    const b = BUILDERS[ghostWanted.kind](ghostWanted.data, true);
    if (b) {
      ghost = b.group;
      scene.add(ghost);
    }
  }
  ghostWanted = null;
}

// ---------- Brush cursor ----------

const cursor = new THREE.Mesh(
  new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthTest: false, fog: false }),
);
cursor.renderOrder = 20;
cursor.visible = false;
scene.add(cursor);

function showCursor(p, radius) {
  if (!p) {
    cursor.visible = false;
    return;
  }
  cursor.visible = true;
  cursor.position.set(p.x, p.y + 0.06, p.z);
  cursor.scale.setScalar(radius);
}

// ---------- Tools ----------

const valid = (p, minH = -0.25) => p && p.y > minH;

function treeSpotFree(x, z, spacing) {
  for (const o of objects) {
    if (o.kind === 'tree' || o.kind === 'flower') {
      if (Math.hypot(o.data.x - x, o.data.z - z) < spacing) return false;
    } else if (o.hitDist(x, z) < 0.35) {
      return false;
    }
  }
  return true;
}

// Smooths a finger stroke and spaces the points evenly.
function cleanStroke(pts) {
  let p = pts.slice();
  for (let it = 0; it < 2; it++) {
    if (p.length < 3) break;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  const out = [p[0]];
  const spacing = 0.45;
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    let [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= spacing) {
      const t = (spacing - acc) / seg;
      ax += (bx - ax) * t;
      az += (bz - az) * t;
      out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az);
      acc = 0;
    }
    acc += seg;
  }
  const last = p[p.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 0.15) out.push(last);
  return out.map(([x, z]) => [round2(x), round2(z)]);
}

function strokeLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

const tools = {
  camera: {
    hint: 'Un dito ruota la vista · pizzica per lo zoom · due dita per spostarti',
    radius: 0,
    start() {}, move() {}, end() {}, cancel() {},
  },

  wall: {
    hint: 'Trascina il dito per tirare su un muretto a secco',
    radius: 0.5,
    pts: null, seed: 0, lastTick: 0,
    start(p) {
      if (!valid(p)) return;
      this.pts = [[p.x, p.z]];
      this.seed = newSeed();
    },
    move(p) {
      if (!this.pts || !valid(p)) return;
      const [lx, lz] = this.pts[this.pts.length - 1];
      if (Math.hypot(p.x - lx, p.z - lz) < 0.35 || this.pts.length > 500) return;
      this.pts.push([p.x, p.z]);
      if (this.pts.length - this.lastTick > 4) {
        this.lastTick = this.pts.length;
        audio.tick();
      }
      if (this.pts.length >= 2) wantGhost('wall', { pts: cleanStroke(this.pts), seed: this.seed });
    },
    end() {
      if (!this.pts) return;
      let pts = cleanStroke(this.pts);
      this.pts = null;
      this.lastTick = 0;
      wantGhost(null);
      if (pts.length < 2 || strokeLength(pts) < 1) return;
      const [sx, sz] = pts[0], [ex, ez] = pts[pts.length - 1];
      if (strokeLength(pts) > 5 && Math.hypot(sx - ex, sz - ez) < 1.0) pts = [...pts, [sx, sz]];
      const action = newAction();
      const obj = addObj('wall', { pts, seed: this.seed }, true);
      if (!obj) return;
      clearNatureUnder(obj.hitDist, 0.5, action);
      action.added.push(obj);
      pushAction(action);
      audio.pop(0.8);
    },
    cancel() {
      this.pts = null;
      wantGhost(null);
    },
  },

  house: {
    hint: 'Tocca per una casa, o trascina per scegliere la larghezza della facciata',
    radius: 1.2,
    a: null, data: null,
    start(p) {
      if (!valid(p)) return;
      this.a = p.clone();
      this.data = { x: round2(p.x), z: round2(p.z), w: 2.4, ang: round2(rig.theta), seed: newSeed() };
      wantGhost('house', { ...this.data });
    },
    move(p) {
      if (!this.a || !p) return;
      const dx = p.x - this.a.x, dz = p.z - this.a.z;
      const len = Math.hypot(dx, dz);
      const d = this.data;
      if (len > 0.6) {
        d.w = round2(clamp(len, 1.4, 7));
        let ang = Math.atan2(-dz, dx);
        // Keep the front door looking at the camera
        const camX = Math.sin(rig.theta), camZ = Math.cos(rig.theta);
        if (Math.sin(ang) * camX + Math.cos(ang) * camZ < 0) ang += Math.PI;
        d.ang = round2(ang);
        d.x = round2(this.a.x + dx / 2);
        d.z = round2(this.a.z + dz / 2);
      } else {
        d.w = 2.4;
        d.ang = round2(rig.theta);
        d.x = round2(this.a.x);
        d.z = round2(this.a.z);
      }
      wantGhost('house', { ...d });
    },
    end() {
      if (!this.a) return;
      const data = this.data;
      this.a = null;
      wantGhost(null);
      if (getHeight(data.x, data.z) < -0.2) return;
      const action = newAction();
      const obj = addObj('house', data, true);
      if (!obj) return;
      clearNatureUnder(obj.hitDist, 0.3, action);
      action.added.push(obj);
      pushAction(action);
      audio.pop(1);
    },
    cancel() {
      this.a = null;
      wantGhost(null);
    },
  },

  tower: {
    hint: 'Tocca dove vuoi una torre di avvistamento',
    radius: 1.3,
    data: null,
    start(p) {
      if (!valid(p)) return;
      this.data = { x: round2(p.x), z: round2(p.z), seed: newSeed() };
      wantGhost('tower', { ...this.data });
    },
    move(p) {
      if (!this.data || !valid(p)) return;
      this.data.x = round2(p.x);
      this.data.z = round2(p.z);
      wantGhost('tower', { ...this.data });
    },
    end() {
      if (!this.data) return;
      const data = this.data;
      this.data = null;
      wantGhost(null);
      const action = newAction();
      const obj = addObj('tower', data, true);
      if (!obj) return;
      clearNatureUnder(obj.hitDist, 0.3, action);
      action.added.push(obj);
      pushAction(action);
      audio.pop(0.7);
    },
    cancel() {
      this.data = null;
      wantGhost(null);
    },
  },

  path: {
    hint: 'Trascina per lastricare una creuza in mattoni',
    radius: 0.85,
    changes: null, last: null,
    stamp(p) {
      paintPath(p.x, p.z, 0.85, 0.45, this.changes);
    },
    start(p) {
      if (!valid(p)) return;
      this.changes = new Map();
      this.last = p.clone();
      this.stamp(p);
    },
    move(p) {
      if (!this.changes || !valid(p)) return;
      const d = this.last.distanceTo(p);
      const steps = Math.ceil(d / 0.25);
      for (let i = 1; i <= steps; i++) this.stamp(this.last.clone().lerp(p, i / steps));
      this.last.copy(p);
    },
    end() {
      if (!this.changes) return;
      const action = newAction();
      action.pathChanges = this.changes;
      this.changes = null;
      pushAction(action);
    },
    cancel() {
      if (this.changes) restorePath(this.changes);
      this.changes = null;
    },
  },

  tree: {
    hint: 'Trascina per piantare ulivi, pini, cipressi e limoni',
    radius: 1.0,
    action: null, last: null,
    plant(p) {
      const x = round2(p.x + (Math.random() - 0.5) * 0.5);
      const z = round2(p.z + (Math.random() - 0.5) * 0.5);
      if (getHeight(x, z) < 0.3 || !treeSpotFree(x, z, 0.9)) return;
      const seed = newSeed();
      const obj = addObj('tree', { x, z, seed, type: pickTreeType(rng(seed ^ 0x5bd1)) }, true);
      if (obj) {
        this.action.added.push(obj);
        audio.pop(1.3);
      }
    },
    start(p) {
      if (!valid(p)) return;
      this.action = newAction();
      this.last = p.clone();
      this.plant(p);
    },
    move(p) {
      if (!this.action || !valid(p)) return;
      if (this.last.distanceTo(p) < 1.0) return;
      this.last.copy(p);
      this.plant(p);
    },
    end() {
      if (this.action) pushAction(this.action);
      this.action = null;
    },
    cancel() {
      this.end();
    },
  },

  flower: {
    hint: 'Trascina per far crescere cespugli fioriti',
    radius: 0.7,
    action: null, last: null, variant: 0,
    plant(p) {
      const x = round2(p.x + (Math.random() - 0.5) * 0.4);
      const z = round2(p.z + (Math.random() - 0.5) * 0.4);
      if (getHeight(x, z) < 0.25 || !treeSpotFree(x, z, 0.5)) return;
      const obj = addObj('flower', { x, z, seed: newSeed(), variant: this.variant }, true);
      if (obj) {
        this.action.added.push(obj);
        audio.pop(1.6);
      }
    },
    start(p) {
      if (!valid(p)) return;
      this.variant = Math.floor(Math.random() * FLOWER_NAMES.length);
      const name = FLOWER_NAMES[this.variant];
      toast(`🌺 ${name.charAt(0).toUpperCase()}${name.slice(1)}`, 1200);
      this.action = newAction();
      this.last = p.clone();
      this.plant(p);
    },
    move(p) {
      if (!this.action || !valid(p)) return;
      if (this.last.distanceTo(p) < 0.55) return;
      this.last.copy(p);
      this.plant(p);
    },
    end() {
      if (this.action) pushAction(this.action);
      this.action = null;
    },
    cancel() {
      this.end();
    },
  },

  erase: {
    hint: 'Trascina sopra quello che vuoi togliere',
    radius: 0.9,
    action: null,
    rub(p) {
      for (const o of objects.slice()) {
        if (o.hitDist(p.x, p.z) < 0.5) {
          removeObj(o);
          this.action.removed.push(o);
          audio.tick();
        }
      }
      paintPath(p.x, p.z, 0.9, -0.5, this.action.pathChanges);
    },
    start(p) {
      if (!p) return;
      this.action = newAction();
      this.action.pathChanges = new Map();
      this.rub(p);
    },
    move(p) {
      if (this.action && p) this.rub(p);
    },
    end() {
      if (this.action) pushAction(this.action);
      this.action = null;
    },
    cancel() {
      this.end();
    },
  },
};

let toolName = 'house';
function setTool(name) {
  if (!tools[name]) return;
  tools[toolName].cancel();
  toolName = name;
  for (const b of document.querySelectorAll('#toolbar button')) {
    b.classList.toggle('active', b.dataset.tool === name);
  }
  cursor.visible = false;
  toast(tools[name].hint);
}

// ---------- Input ----------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  return raycastTerrain(raycaster.ray);
}

const pointers = new Map();
let mode = 'idle';
let toolPointer = null;
let gesture = null;

function gestureInfo() {
  const [a, b] = [...pointers.values()];
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    if (e.pointerType === 'mouse' && e.button === 2) mode = 'orbit';
    else if (e.pointerType === 'mouse' && e.button === 1) mode = 'pan';
    else if (toolName === 'camera') mode = 'orbit';
    else {
      mode = 'tool';
      toolPointer = e.pointerId;
      const p = pick(e.clientX, e.clientY);
      showCursor(p, tools[toolName].radius);
      tools[toolName].start(p);
    }
  } else if (pointers.size === 2) {
    if (mode === 'tool') tools[toolName].cancel();
    cursor.visible = false;
    mode = 'gesture';
    gesture = gestureInfo();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) {
    if (e.pointerType === 'mouse' && toolName !== 'camera') showCursor(pick(e.clientX, e.clientY), tools[toolName].radius);
    return;
  }
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  prev.x = e.clientX;
  prev.y = e.clientY;
  if (mode === 'tool' && e.pointerId === toolPointer) {
    const p = pick(e.clientX, e.clientY);
    showCursor(p, tools[toolName].radius);
    tools[toolName].move(p);
  } else if (mode === 'orbit') {
    rig.rotate(dx, dy);
  } else if (mode === 'pan') {
    rig.pan(dx, dy);
  } else if (mode === 'gesture' && pointers.size >= 2) {
    const g = gestureInfo();
    if (gesture.dist > 10) rig.zoom(g.dist / gesture.dist);
    let da = g.angle - gesture.angle;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    rig.twist(da);
    rig.pan(g.mx - gesture.mx, g.my - gesture.my);
    gesture = g;
  }
});

function pointerEnd(e, cancelled) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (mode === 'tool' && e.pointerId === toolPointer) {
    if (cancelled) tools[toolName].cancel();
    else tools[toolName].end(pick(e.clientX, e.clientY));
    toolPointer = null;
    if (e.pointerType !== 'mouse') cursor.visible = false;
    mode = 'idle';
  }
  if (mode === 'gesture' && pointers.size < 2) mode = pointers.size ? 'blocked' : 'idle';
  if (pointers.size === 0) mode = 'idle';
}

canvas.addEventListener('pointerup', (e) => pointerEnd(e, false));
canvas.addEventListener('pointercancel', (e) => pointerEnd(e, true));
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !pointers.size) cursor.visible = false;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  rig.zoom(Math.exp(-e.deltaY * 0.0012));
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Stop iOS Safari from zooming the page itself
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault());
}
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchend', () => audio.unlock(), { passive: true });

// ---------- Buttons ----------

for (const b of document.querySelectorAll('#toolbar button')) {
  b.addEventListener('click', () => setTool(b.dataset.tool));
}

$('#btn-undo').addEventListener('click', undo);

const timeBtn = $('#btn-time');
function showTimeIcon() {
  timeBtn.textContent = world.times[world.timeIndex].icon;
}
timeBtn.addEventListener('click', () => {
  const t = world.setTime(world.timeIndex + 1);
  showTimeIcon();
  toast(`${t.icon} ${t.name}`, 1400);
  scheduleSave();
});

const soundBtn = $('#btn-sound');
function showSound() {
  soundBtn.textContent = audio.isMuted() ? '🔇' : '🔊';
}
soundBtn.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.isMuted());
  showSound();
});

$('#btn-clear').addEventListener('click', () => {
  if (!objects.length) {
    toast("L'isola è già vuota");
    return;
  }
  if (!window.confirm("Vuoi svuotare l'isola? Potrai comunque annullare.")) return;
  const action = newAction();
  action.pathSnapshot = snapshotPath();
  for (const o of objects.slice()) {
    removeObj(o);
    action.removed.push(o);
  }
  setPath(new Float32Array(action.pathSnapshot.length));
  pushAction(action);
  toast('Isola pulita. ↶ per tornare indietro');
});

$('#btn-photo').addEventListener('click', () => {
  cursor.visible = false;
  renderer.render(scene, camera);
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'borgo-di-mare.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Il mio Borgo di Mare' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'borgo-di-mare.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
});

// ---------- Start ----------

if (!load()) starterIsland();
showTimeIcon();
showSound();
setTool('house');

// Lowers the resolution a bit if the phone struggles, so it stays smooth.
let frameAvg = 16;
let perfCheck = 0;
function adaptQuality(dtMs) {
  frameAvg += (dtMs - frameAvg) * 0.05;
  perfCheck += dtMs;
  if (perfCheck < 2500) return;
  perfCheck = 0;
  if (frameAvg > 30 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
  }
}

const clock = new THREE.Clock();
let elapsed = 0;
let first = true;
function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  elapsed += dt;
  rig.update(dt);
  world.update(dt, elapsed, camera, rig.target);
  refreshGhost();
  updatePops(dt);
  for (const o of objects) {
    if (o.flag) o.flag.rotation.y = Math.sin(elapsed * 1.6 + o.flag.userData.phase) * 0.35;
  }
  if (cursor.visible) cursor.material.opacity = 0.55 + Math.sin(elapsed * 5) * 0.2;
  renderer.render(scene, camera);
  if (!first) adaptQuality(rawDt * 1000);
  if (first) {
    first = false;
    loading.classList.add('hide');
    setTimeout(() => loading.remove(), 700);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging from the console
window.borgo = { objects, rig, world, setTool, undo };
