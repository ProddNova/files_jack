import * as THREE from '../vendor/three.module.min.js';
import { rng, round2 } from './util.js';
import {
  createTerrain, raycastTerrain, getHeight, restorePath, encodePath, decodePath,
  snapshotPath, setPath, encodeHeights, decodeHeights, restoreHeights, snapshotHeights,
  setHeights, resetHeights,
} from './terrain.js';
import { BUILDERS, disposeGroup, FLOWER_NAMES, isNature } from './builders.js';
import { footprint, pointIn } from './placement.js';
import { createWorld } from './world.js';
import { createDecor } from './decor.js';
import { CameraRig } from './controls.js';
import { setupInput } from './input.js';
import { createTools, TOOL_DEFS } from './tools.js';
import * as audio from './audio.js';

const SAVE_KEY = 'borgo-di-mare-v1';
const PREFS_KEY = 'borgo-prefs';
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const loading = $('#loading');

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } },
};

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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 800);
const rig = new CameraRig(camera);
scene.add(createTerrain());
const world = createWorld(scene, { lowPower });
const decor = createDecor(scene, { lowPower });

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

// ---------- Objects ----------

const objects = [];
const undoStack = [];
const pops = [];
const RISE = new Set(['house', 'tower', 'wall']);

// Walls open a gap where they meet a house.
const env = {
  blockedAt: (x, z) => objects.some((o) => o.kind === 'house' && pointIn(o.fp, x, z, 0.15)),
};

function build(obj) {
  const built = BUILDERS[obj.kind](obj.data, { env });
  if (!built) return false;
  Object.assign(obj, built);
  obj.fp = footprint(obj.kind, obj.data);
  return true;
}

function attach(obj) {
  if (!build(obj)) return false;
  scene.add(obj.group);
  objects.push(obj);
  return true;
}

function add(kind, data, { animate = false } = {}) {
  const obj = { kind, data };
  if (!attach(obj)) return null;
  if (animate) {
    if (RISE.has(kind)) obj.group.scale.y = 0.01;
    else obj.group.scale.setScalar(0.01);
    pops.push({ obj, t: 0 });
  }
  return obj;
}

function remove(obj) {
  const i = objects.indexOf(obj);
  if (i < 0) return;
  objects.splice(i, 1);
  scene.remove(obj.group);
  disposeGroup(obj.group);
}

function rebuild(obj) {
  scene.remove(obj.group);
  disposeGroup(obj.group);
  build(obj);
  scene.add(obj.group);
}

function refreshAll() {
  for (const o of objects) if (o.kind === 'wall') rebuild(o);
  decor.refresh(objects);
}

function inBox(o, box, m = 1) {
  const b = o.bounds;
  return b && b.x + b.r > box.x0 - m && b.x - b.r < box.x1 + m && b.z + b.r > box.z0 - m && b.z - b.r < box.z1 + m;
}

function afterTerrain(box) {
  for (const o of objects) if (o.kind !== 'wall' && inBox(o, box)) rebuild(o);
}

function liveReground(p, R) {
  for (const o of objects) {
    if (!o.groundY || !o.bounds) continue;
    if (Math.hypot(o.bounds.x - p.x, o.bounds.z - p.z) < R + o.bounds.r) o.group.position.y = o.groundY();
  }
}

const newAction = () => ({ added: [], removed: [], pathChanges: null, pathSnapshot: null, heightChanges: null, heightSnapshot: null });

function commit(a) {
  const empty = !a.added.length && !a.removed.length && !(a.pathChanges && a.pathChanges.size)
    && !a.pathSnapshot && !(a.heightChanges && a.heightChanges.size) && !a.heightSnapshot;
  if (empty) return;
  undoStack.push(a);
  if (undoStack.length > 80) undoStack.shift();
  refreshAll();
  scheduleSave();
}

function undo() {
  const a = undoStack.pop();
  if (!a) {
    toast('Niente da annullare', 1200);
    return;
  }
  for (const o of a.added) remove(o);
  if (a.heightChanges) afterTerrain(restoreHeights(a.heightChanges));
  if (a.heightSnapshot) setHeights(a.heightSnapshot);
  if (a.pathChanges) restorePath(a.pathChanges);
  if (a.pathSnapshot) setPath(a.pathSnapshot);
  for (const o of a.removed) attach(o);
  if (a.heightSnapshot) for (const o of objects) rebuild(o);
  refreshAll();
  audio.tick();
  scheduleSave();
}

// ---------- Ghost preview ----------

let ghost = null;
let ghostWanted = null;
function setGhost(kind, data, ok = true) {
  ghostWanted = kind ? { kind, data, ok } : { kind: null };
}
function refreshGhost() {
  if (!ghostWanted) return;
  if (ghost) {
    scene.remove(ghost);
    disposeGroup(ghost);
    ghost = null;
  }
  if (ghostWanted.kind) {
    const b = BUILDERS[ghostWanted.kind](ghostWanted.data, { ghost: ghostWanted.ok ? 'ok' : 'bad', env });
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

// ---------- Save ----------

let saveTimer = 0;
function save() {
  const order = [...objects.filter((o) => o.kind !== 'wall'), ...objects.filter((o) => o.kind === 'wall')];
  storage.set(SAVE_KEY, JSON.stringify({
    v: 2,
    time: world.timeIndex,
    objects: order.map((o) => ({ kind: o.kind, data: o.data })),
    path: encodePath(),
    heights: encodeHeights(),
  }));
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
  const raw = storage.get(SAVE_KEY);
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    if (!p || (p.v !== 1 && p.v !== 2)) return false;
    if (p.heights) decodeHeights(p.heights);
    if (p.path) decodePath(p.path);
    const list = (p.objects || []).filter((o) => BUILDERS[o.kind]);
    for (const o of list) if (o.kind !== 'wall') add(o.kind, o.data);
    for (const o of list) if (o.kind === 'wall') add(o.kind, o.data);
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
    { cx: -14, cz: 8, rad: 4, n: 9, types: ['olive', 'cypress', 'palm'] },
    { cx: 12, cz: 12, rad: 3, n: 5, types: ['palm'] },
  ];
  for (const g of groves) {
    for (let i = 0; i < g.n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * g.rad;
      const x = round2(g.cx + Math.cos(a) * d), z = round2(g.cz + Math.sin(a) * d);
      if (getHeight(x, z) < 0.6) continue;
      if (objects.some((o) => Math.hypot(o.data.x - x, o.data.z - z) < 1.1)) continue;
      add('tree', { x, z, seed: r.int(1, 1e9), type: r.pick(g.types) });
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, d = r.range(6, 16);
    const x = round2(Math.cos(a) * d), z = round2(Math.sin(a) * d);
    if (getHeight(x, z) < 0.6) continue;
    add('flower', { x, z, seed: r.int(1, 1e9), variant: r.int(0, FLOWER_NAMES.length - 1) });
  }
  // A lighthouse on the far shore
  for (let rad = 16; rad < 30; rad += 0.5) {
    const x = Math.cos(4.0) * rad, z = Math.sin(4.0) * rad;
    if (getHeight(x, z) < 0.5) {
      const bx = Math.cos(4.0) * (rad - 2), bz = Math.sin(4.0) * (rad - 2);
      add('tower', { x: round2(bx), z: round2(bz), seed: 4242, style: 'faro', ang: 0 });
      break;
    }
  }
}

// ---------- Tools and input ----------

const prefs = (() => {
  try { return JSON.parse(storage.get(PREFS_KEY)) || {}; } catch { return {}; }
})();
const variants = prefs.variants || {};
const variant = (tool) => {
  const def = TOOL_DEFS.find((t) => t.id === tool);
  const v = variants[tool];
  return def.variants && def.variants.some(([id]) => id === v) ? v : def.variants?.[0][0];
};
const savePrefs = () => storage.set(PREFS_KEY, JSON.stringify({ variants, helpSeen: prefs.helpSeen }));

const G = {
  objects, rig, audio, toast, variant, env,
  add, remove, attach, newAction, commit, refreshAll, afterTerrain, liveReground,
  ghost: setGhost,
};
const tools = createTools(G);
let toolName = 'house';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  return raycastTerrain(raycaster.ray);
}

const input = setupInput(canvas, {
  rig,
  pick,
  tool: () => tools[toolName],
  onTouch: () => audio.unlock(),
  showCursor(p) {
    const t = tools[toolName];
    if (!p || !t) { cursor.visible = false; return; }
    cursor.visible = true;
    cursor.position.set(p.x, Math.max(p.y, toolName === 'prop' || toolName === 'erase' ? 0 : p.y) + 0.06, p.z);
    cursor.scale.setScalar(t.radius);
  },
  hideCursor() { cursor.visible = false; },
});
document.addEventListener('touchend', () => audio.unlock(), { passive: true });

// ---------- Toolbar and variant chips ----------

const toolbar = $('#toolbar');
const chips = $('#chips');

function renderChips() {
  const def = TOOL_DEFS.find((t) => t.id === toolName);
  chips.innerHTML = '';
  chips.classList.toggle('empty', !def.variants);
  if (!def.variants) return;
  const current = variant(toolName);
  for (const [id, label] of def.variants) {
    const b = document.createElement('button');
    b.className = 'chip' + (id === current ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      variants[toolName] = id;
      savePrefs();
      renderChips();
      audio.tick();
    });
    chips.appendChild(b);
  }
  chips.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function setTool(name) {
  input.cancel();
  setGhost(null);
  toolName = name;
  for (const b of toolbar.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tool === name);
  cursor.visible = false;
  renderChips();
  toast(TOOL_DEFS.find((t) => t.id === name).hint);
}

for (const t of TOOL_DEFS) {
  const b = document.createElement('button');
  b.dataset.tool = t.id;
  b.setAttribute('aria-label', t.label);
  b.innerHTML = `<span>${t.icon}</span><small>${t.label}</small>`;
  b.addEventListener('click', () => setTool(t.id));
  toolbar.appendChild(b);
}

// ---------- Buttons ----------

$('#btn-undo').addEventListener('click', undo);
$('#btn-center').addEventListener('click', () => rig.recenter());

const timeBtn = $('#btn-time');
const showTimeIcon = () => { timeBtn.textContent = world.times[world.timeIndex].icon; };
timeBtn.addEventListener('click', () => {
  const t = world.setTime(world.timeIndex + 1);
  showTimeIcon();
  toast(`${t.icon} ${t.name}`, 1200);
  scheduleSave();
});

const soundBtn = $('#btn-sound');
const showSound = () => { soundBtn.textContent = audio.isMuted() ? '🔇' : '🔊'; };
soundBtn.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.isMuted());
  showSound();
});

$('#btn-clear').addEventListener('click', () => {
  if (!window.confirm("Vuoi svuotare l'isola? Potrai comunque annullare.")) return;
  const a = newAction();
  a.pathSnapshot = snapshotPath();
  a.heightSnapshot = snapshotHeights();
  for (const o of objects.slice()) {
    remove(o);
    a.removed.push(o);
  }
  setPath(new Float32Array(a.pathSnapshot.length));
  resetHeights();
  commit(a);
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

const help = $('#help');
const openHelp = () => help.classList.add('show');
$('#btn-help').addEventListener('click', openHelp);
$('#help-close').addEventListener('click', () => {
  help.classList.remove('show');
  prefs.helpSeen = true;
  savePrefs();
});

// ---------- Start ----------

if (!load()) starterIsland();
refreshAll();
showTimeIcon();
showSound();
setTool('house');
if (!prefs.helpSeen) setTimeout(openHelp, 600);

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

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
  input.update(dt);
  rig.update(dt);
  world.update(dt, elapsed, camera, rig.target);
  decor.update(elapsed, world.night);
  refreshGhost();
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t = Math.min(1, p.t + dt / 0.38);
    const k = Math.max(0.01, easeOutBack(p.t));
    if (RISE.has(p.obj.kind)) p.obj.group.scale.y = k;
    else p.obj.group.scale.setScalar(k);
    if (p.t >= 1) pops.splice(i, 1);
  }
  for (const o of objects) if (o.animate) o.animate(elapsed);
  if (cursor.visible) {
    const t = tools[toolName];
    cursor.material.color.set(t && t.valid === false ? '#ff6b5a' : '#ffffff');
    cursor.material.opacity = 0.55 + Math.sin(elapsed * 5) * 0.2;
  }
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
window.borgo = { objects, rig, world, setTool, undo, tools, variants, renderer };
