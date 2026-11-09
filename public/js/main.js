import * as THREE from '../vendor/three.module.min.js';
import { rng, round2, newSeed } from './util.js';
import {
  createTerrain, raycastTerrain, getHeight, restorePath, encodePath, decodePath, heightTexture, HEIGHT_UV,
  snapshotPath, setPath, encodeHeights, decodeHeights, restoreHeights, snapshotHeights, setHeights, resetHeights,
  newIsland, getIslandSeed, ISLAND_R,
} from './terrain.js';
import { BUILDERS, disposeGroup, FLOWER_NAMES, isNature } from './builders.js';
import { footprint, pointIn } from './placement.js';
import { createWorld } from './world.js';
import { createTextureArray } from './textures.js';
import { TEX } from './shaders.js';
import { createPost } from './post.js';
import { createDecor } from './decor.js';
import { createLife } from './life.js';
import { CameraRig } from './controls.js';
import { setupInput } from './input.js';
import { createTools, TOOL_DEFS, translateData } from './tools.js';
import { createEditor } from './editor.js';
import { createWalk } from './walk.js';
import * as audio from './audio.js';

const SLOT_KEYS = ['borgo-di-mare-v1', 'borgo-slot-2', 'borgo-slot-3'];
const PREFS_KEY = 'borgo-prefs';
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const loading = $('#loading');

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

const prefs = (() => {
  try { return JSON.parse(storage.get(PREFS_KEY)) || {}; } catch { return {}; }
})();
prefs.variants = prefs.variants || {};
const savePrefs = () => storage.set(PREFS_KEY, JSON.stringify(prefs));

// ---------- Renderer ----------

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  loading.textContent = 'Il tuo browser non supporta WebGL 😢';
  throw err;
}
const lowPower = (navigator.hardwareConcurrency || 4) <= 2;
if (!prefs.quality) prefs.quality = lowPower ? 'bassa' : 'alta';
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 800);
const rig = new CameraRig(camera);
TEX.uTex.value = createTextureArray(renderer, lowPower ? 256 : 512);
scene.add(createTerrain(0));
TEX.uHeight.value = heightTexture;
TEX.uHUV.value.set(HEIGHT_UV.scale, HEIGHT_UV.offset);
const world = createWorld(scene, { lowPower, renderer });
const decor = createDecor(scene, { lowPower });
const life = createLife(scene);
const post = createPost(renderer, scene, camera);
let usePost = true;

const QUALITY = {
  alta: { dpr: 2, post: true, shadow: 2048, label: 'Alta' },
  media: { dpr: 1.5, post: true, shadow: 2048, label: 'Media' },
  bassa: { dpr: 1, post: false, shadow: 1024, label: 'Bassa' },
};
function applyQuality() {
  const q = QUALITY[prefs.quality] || QUALITY.alta;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  usePost = q.post;
  world.setShadowSize(q.shadow);
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h);
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

function draw() {
  if (usePost) post.render();
  else renderer.render(scene, camera);
}

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
let undoStack = [];
const pops = [];
const RISE = new Set(['house', 'tower', 'wall', 'bridge']);

// Walls open a gap where they meet a house (a city gate fills that gap).
const env = {
  blockedAt: (x, z) => objects.some((o) => o.kind === 'house' && pointIn(o.fp, x, z, 0.15)),
};

function build(obj) {
  const built = BUILDERS[obj.kind](obj.data, { env });
  if (!built) return false;
  obj.solids = null;
  obj.animate = null;
  obj.surfaceAt = null;
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
  if (obj === selected) deselect();
}

function rebuild(obj) {
  if (!objects.includes(obj)) return;
  scene.remove(obj.group);
  disposeGroup(obj.group);
  build(obj);
  scene.add(obj.group);
}

function refreshAll() {
  for (const o of objects) if (o.kind === 'wall') rebuild(o);
  decor.refresh(objects);
  life.refresh(objects);
  updateSelection();
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

const newAction = () => ({ added: [], removed: [], edits: [], pathChanges: null, pathSnapshot: null, heightChanges: null, heightSnapshot: null });

function commit(a) {
  const empty = !a.added.length && !a.removed.length && !a.edits.length && !(a.pathChanges && a.pathChanges.size)
    && !a.pathSnapshot && !(a.heightChanges && a.heightChanges.size) && !a.heightSnapshot;
  if (empty) return;
  undoStack.push(a);
  if (undoStack.length > 100) undoStack.shift();
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
  for (const e of a.edits.slice().reverse()) {
    e.obj.data = e.before;
    rebuild(e.obj);
  }
  if (a.heightChanges) afterTerrain(restoreHeights(a.heightChanges));
  if (a.heightSnapshot) setHeights(a.heightSnapshot);
  if (a.pathChanges) restorePath(a.pathChanges);
  if (a.pathSnapshot) setPath(a.pathSnapshot);
  for (const o of a.removed) attach(o);
  if (a.heightSnapshot) for (const o of objects) rebuild(o);
  refreshAll();
  if (selected) editor.refresh();
  audio.tick();
  scheduleSave();
}

// ---------- Selection and editing ----------

let selected = null;
const selMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const selLineMat = new THREE.LineBasicMaterial({ color: '#ffd166', transparent: true, depthTest: false });
const selGroup = new THREE.Group();
scene.add(selGroup);

function clearSelGroup() {
  for (const c of [...selGroup.children]) {
    selGroup.remove(c);
    c.geometry.dispose();
  }
}

// A soft yellow shape on the ground under the selected object.
function updateSelection() {
  clearSelGroup();
  if (!selected) return;
  const fp = selected.fp;
  const pts = [];
  if (fp.type === 'rect') {
    const c = Math.cos(fp.ang), s = Math.sin(fp.ang);
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push(new THREE.Vector3(fp.x + lx * fp.hw * c + lz * fp.hd * s, 0, fp.z - lx * fp.hw * s + lz * fp.hd * c));
    }
  } else if (fp.type === 'circle') {
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push(new THREE.Vector3(fp.x + Math.cos(a) * fp.r, 0, fp.z + Math.sin(a) * fp.r));
    }
  } else {
    for (const [x, z] of fp.pts) pts.push(new THREE.Vector3(x, 0, z));
  }
  for (const p of pts) p.y = Math.max(getHeight(p.x, p.z), 0) + 0.08;
  const closed = fp.type !== 'line';
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = closed ? new THREE.LineLoop(geo, selLineMat) : new THREE.Line(geo, selLineMat);
  line.renderOrder = 31;
  selGroup.add(line);
  if (closed) {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), selMat);
    mesh.position.y = Math.max(...pts.map((p) => p.y));
    mesh.renderOrder = 30;
    selGroup.add(mesh);
  } else {
    for (const p of pts) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(fp.half + 0.25, 12).rotateX(-Math.PI / 2), selMat);
      dot.position.copy(p);
      dot.renderOrder = 30;
      selGroup.add(dot);
    }
  }
}

function select(obj) {
  const handler = currentHandler();
  if (handler && handler.draft) handler.cancel();
  selected = obj;
  editor.openEdit(obj);
  updateSelection();
  audio.tick();
}

function deselect() {
  if (!selected && editor.mode !== 'edit') return;
  selected = null;
  if (editor.mode === 'edit') editor.close();
  clearSelGroup();
}

function liveEdit(obj, data) {
  obj.data = data;
  rebuild(obj);
  if (obj === selected) updateSelection();
}

function commitEdit(obj, before) {
  if (JSON.stringify(before) === JSON.stringify(obj.data)) return;
  const a = newAction();
  a.edits.push({ obj, before, after: obj.data });
  commit(a);
}

function duplicate(obj) {
  const off = Math.max(1.2, (obj.bounds?.r || 1) * 1.1);
  const data = translateData(obj.data, off, off * 0.4);
  const a = newAction();
  const copy = add(obj.kind, data, { animate: true });
  if (!copy) return;
  a.added.push(copy);
  commit(a);
  select(copy);
  toast('⧉ Copia creata: trascinala dove vuoi', 1600);
}

function deleteObj(obj) {
  const a = newAction();
  remove(obj);
  a.removed.push(obj);
  commit(a);
  deselect();
  audio.tick();
}

// The object under a point (buildings win over plants).
function objectAt(p, kind) {
  let best = null, bd = Infinity;
  for (const o of objects) {
    if (kind && o.kind !== kind) continue;
    const d = o.hitDist(p.x, p.z) + (isNature(o.kind) ? 0.25 : 0);
    if (d < 0.3 && d < bd) { bd = d; best = o; }
  }
  return best;
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

// ---------- Save, load, islands ----------

let saveTimer = 0;
function serialize() {
  const order = [...objects.filter((o) => o.kind !== 'wall'), ...objects.filter((o) => o.kind === 'wall')];
  return {
    v: 3,
    seed: getIslandSeed(),
    time: world.timeIndex,
    objects: order.map((o) => ({ kind: o.kind, data: o.data })),
    path: encodePath(),
    heights: encodeHeights(),
  };
}
function save() {
  if (!storage.set(SLOT_KEYS[prefs.slot || 0], JSON.stringify(serialize()))) toast('Memoria piena: esporta l\'isola dal menu ⚙️');
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

function clearWorld() {
  deselect();
  for (const o of objects.slice()) remove(o);
  undoStack = [];
}

function applySave(p) {
  clearWorld();
  newIsland(p.seed || 0);
  if (p.heights) decodeHeights(p.heights);
  if (p.path) decodePath(p.path);
  const list = (p.objects || []).filter((o) => BUILDERS[o.kind]);
  for (const o of list) if (o.kind !== 'wall') add(o.kind, o.data);
  for (const o of list) if (o.kind === 'wall') add(o.kind, o.data);
  if (typeof p.time === 'number') world.setTime(p.time);
  refreshAll();
}

function loadSlot(i) {
  const raw = storage.get(SLOT_KEYS[i]);
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p && p.v >= 1 && p.v <= 3) { applySave(p); return true; }
    } catch { /* fall through to a fresh island */ }
  }
  freshIsland(i === 0 ? 0 : newSeed());
  return false;
}

function starterNature(seed) {
  const r = rng((seed + 2025) >>> 0);
  let trees = 0;
  for (let i = 0; i < 500 && trees < 55; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (ISLAND_R - 3);
    const x = round2(Math.cos(a) * d), z = round2(Math.sin(a) * d);
    const h = getHeight(x, z);
    if (h < 1.3 || r() > 0.55) continue;
    if (objects.some((o) => Math.hypot(o.data.x - x, o.data.z - z) < 1.2)) continue;
    const type = h > 3.2 ? r.pick(['pine', 'cypress', 'pine']) : h > 2 ? r.pick(['olive', 'cypress', 'pine', 'bush']) : r.pick(['olive', 'olive', 'lemon', 'palm', 'bush']);
    add('tree', { x, z, seed: r.int(1, 1e9), type });
    trees++;
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = r.range(5, 18);
    const x = round2(Math.cos(a) * d), z = round2(Math.sin(a) * d);
    if (getHeight(x, z) < 0.6) continue;
    add('flower', { x, z, seed: r.int(1, 1e9), variant: r.int(0, FLOWER_NAMES.length - 1) });
  }
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    for (let rad = ISLAND_R + 6; rad > 8; rad -= 0.5) {
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (getHeight(x, z) > 0 && getHeight(x, z) < 0.5) {
        add('tree', { x: round2(x), z: round2(z), seed: r.int(1, 1e9), type: 'rock', s: r.range(0.8, 1.6) });
        break;
      }
    }
  }
  const fa = r() * Math.PI * 2;
  for (let rad = 16; rad < 32; rad += 0.5) {
    const x = Math.cos(fa) * rad, z = Math.sin(fa) * rad;
    if (getHeight(x, z) < 0.5) {
      add('tower', { x: round2(Math.cos(fa) * (rad - 2)), z: round2(Math.sin(fa) * (rad - 2)), seed: 4242, style: 'faro', ang: 0 });
      break;
    }
  }
}

function freshIsland(seed) {
  clearWorld();
  newIsland(seed);
  starterNature(seed);
  refreshAll();
}

// ---------- Tools and input ----------

const variant = (toolId) => {
  const def = TOOL_DEFS.find((t) => t.id === toolId);
  if (!def.variants) return { id: toolId, use: toolId };
  return def.variants.find((v) => v.id === prefs.variants[toolId]) || def.variants[0];
};

let toolName = TOOL_DEFS.some((t) => t.id === prefs.tool) ? prefs.tool : 'borgo';
const editor = createEditor({ liveEdit, commitEdit, duplicate, deleteObj, deselect: () => deselect() }, $('#panel'));

const G = {
  objects, rig, audio, toast, env, prefs,
  add, remove, attach, newAction, commit, refreshAll, afterTerrain, liveReground,
  setGhost, variant, objectAt, select, deselect, liveEdit, commitEdit,
  get selected() { return selected; },
  openDraft: (h) => { deselect(); editor.openDraft(h); },
  closePanel: () => editor.close(),
};
const handlerFor = createTools(G);
const currentHandler = () => handlerFor(toolName);

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  return raycastTerrain(raycaster.ray);
}

const helpEl = $('#help');
const menuEl = $('#menu');
const walk = createWalk({ camera, canvas, objects, audio, onExit: () => { input.reset(); toast('Bentornato in vista dall\'alto', 1400); } });

const input = setupInput(canvas, {
  rig,
  pick,
  tool: currentHandler,
  onTouch: () => audio.unlock(),
  blocked: () => walk.active || helpEl.classList.contains('show') || menuEl.classList.contains('show'),
  showCursor(p) {
    const t = currentHandler();
    if (!p || !t || t.mode) { cursor.visible = false; return; }
    cursor.visible = true;
    cursor.position.set(p.x, Math.max(p.y, 0) + 0.06, p.z);
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
  const current = variant(toolName).id;
  for (const v of def.variants) {
    const b = document.createElement('button');
    b.className = 'chip' + (v.id === current ? ' active' : '');
    b.textContent = v.label;
    b.addEventListener('click', () => {
      const h = currentHandler();
      if (h && h.draft) h.cancel();
      prefs.variants[toolName] = v.id;
      savePrefs();
      renderChips();
      audio.tick();
    });
    chips.appendChild(b);
  }
  chips.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function setTool(name) {
  const prev = currentHandler();
  if (prev && prev.draft) prev.cancel();
  input.cancel();
  setGhost(null);
  deselect();
  toolName = name;
  prefs.tool = name;
  savePrefs();
  for (const b of toolbar.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tool === name);
  cursor.visible = false;
  renderChips();
  toast(TOOL_DEFS.find((t) => t.id === name).hint, 2400);
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

$('#btn-walk').addEventListener('click', () => {
  const h = currentHandler();
  if (h && h.draft) h.cancel();
  deselect();
  setGhost(null);
  cursor.visible = false;
  walk.enter(rig.target.x, rig.target.z, rig.theta);
  toast('🚶 Joystick per camminare (fino in fondo = corri) · trascina per guardarti intorno', 3200);
});

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function sharePhoto() {
  cursor.visible = false;
  draw();
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
    downloadBlob(blob, 'borgo-di-mare.png');
  }, 'image/png');
}
$('#btn-photo').addEventListener('click', sharePhoto);

// ---------- Help ----------

const openHelp = () => helpEl.classList.add('show');
$('#btn-help').addEventListener('click', openHelp);
$('#help-close').addEventListener('click', () => {
  helpEl.classList.remove('show');
  prefs.helpSeen = 3;
  savePrefs();
});

// ---------- Menu ----------

function setAuto(on) {
  prefs.autoCycle = on;
  world.autoCycle = on;
  savePrefs();
}
function setWeather(id) {
  prefs.weather = id;
  const w = world.setWeather(id);
  audio.unlock();
  audio.setRain(w.id === 'pioggia');
  savePrefs();
}
function setTilt(on) {
  prefs.tilt = on;
  post.setTilt(on);
  savePrefs();
}

function renderMenu() {
  const body = $('#menu-body');
  body.innerHTML = '';
  const section = (title) => {
    const s = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = title;
    s.appendChild(h);
    body.appendChild(s);
    return s;
  };
  const row = (parent, label, buttons) => {
    const r = document.createElement('div');
    r.className = 'mrow';
    if (label) {
      const l = document.createElement('span');
      l.textContent = label;
      r.appendChild(l);
    }
    const box = document.createElement('div');
    box.className = 'mbtns';
    for (const [text, active, fn] of buttons) {
      const b = document.createElement('button');
      b.className = 'mbtn' + (active ? ' active' : '');
      b.textContent = text;
      b.addEventListener('click', () => { fn(); if (menuEl.classList.contains('show')) renderMenu(); });
      box.appendChild(b);
    }
    r.appendChild(box);
    parent.appendChild(r);
  };

  const isl = section('🏝️ Isole');
  row(isl, 'Salvataggio', [0, 1, 2].map((i) => [`Isola ${i + 1}`, (prefs.slot || 0) === i, () => {
    if ((prefs.slot || 0) === i) return;
    save();
    prefs.slot = i;
    savePrefs();
    loadSlot(i);
    toast(`🏝️ Isola ${i + 1}`, 1200);
  }]));
  row(isl, null, [
    ['🌱 Nuova isola', false, () => {
      if (!window.confirm('Creare una nuova isola in questo salvataggio? Quella attuale verrà sostituita.')) return;
      freshIsland(newSeed());
      save();
      closeMenu();
      toast('🌱 Ecco una nuova isola tutta da costruire');
    }],
    ['🗑️ Svuota', false, () => { closeMenu(); clearIsland(); }],
  ]);
  row(isl, null, [['📤 Esporta', false, exportIsland], ['📥 Importa', false, () => $('#import-file').click()]]);

  const atm = section('🌤️ Atmosfera');
  row(atm, 'Ora', world.times.map((t, i) => [t.icon + ' ' + t.name, world.timeIndex === i, () => { world.setTime(i); showTimeIcon(); scheduleSave(); }]));
  row(atm, 'Ciclo giorno e notte', [['Automatico', !!prefs.autoCycle, () => setAuto(true)], ['Fermo', !prefs.autoCycle, () => setAuto(false)]]);
  row(atm, 'Meteo', world.weathers.map((w) => [w.icon + ' ' + w.name, (prefs.weather || 'sereno') === w.id, () => setWeather(w.id)]));

  const gfx = section('🎨 Grafica');
  row(gfx, 'Qualità', Object.entries(QUALITY).map(([k, q]) => [q.label, prefs.quality === k, () => { prefs.quality = k; savePrefs(); applyQuality(); }]));
  row(gfx, 'Effetto miniatura', [['Sì', !!prefs.tilt, () => setTilt(true)], ['No', !prefs.tilt, () => setTilt(false)]]);

  const ctl = section('👆 Comandi');
  row(ctl, 'Piazzamento', [
    ['Con conferma ✓', !prefs.quick, () => { prefs.quick = false; savePrefs(); }],
    ['Rapido', !!prefs.quick, () => { prefs.quick = true; savePrefs(); }],
  ]);
  row(ctl, 'Suono', [['🔊 Sì', !audio.isMuted(), () => { audio.unlock(); audio.setMuted(false); }], ['🔇 No', audio.isMuted(), () => audio.setMuted(true)]]);
  row(ctl, null, [['❔ Guida completa', false, () => { closeMenu(); openHelp(); }]]);
}

function openMenu() {
  renderMenu();
  menuEl.classList.add('show');
}
function closeMenu() {
  menuEl.classList.remove('show');
}
$('#btn-menu').addEventListener('click', openMenu);
$('#menu-close').addEventListener('click', closeMenu);

function clearIsland() {
  if (!window.confirm("Vuoi svuotare l'isola? Potrai comunque annullare.")) return;
  const a = newAction();
  a.pathSnapshot = snapshotPath();
  a.heightSnapshot = snapshotHeights();
  deselect();
  for (const o of objects.slice()) {
    remove(o);
    a.removed.push(o);
  }
  setPath(new Float32Array(a.pathSnapshot.length));
  resetHeights();
  commit(a);
  toast('Isola pulita. ↶ per tornare indietro');
}

function exportIsland() {
  const text = JSON.stringify(serialize());
  const blob = new Blob([text], { type: 'application/json' });
  const name = `borgo-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'La mia isola di Borgo di Mare' }).catch(() => {});
  } else {
    downloadBlob(blob, name);
  }
}

$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!p || !Array.isArray(p.objects)) throw new Error('bad');
    if (!window.confirm('Caricare questa isola nel salvataggio attuale?')) return;
    applySave(p);
    save();
    closeMenu();
    toast('📥 Isola importata');
  } catch {
    toast('Questo file non sembra un\'isola di Borgo di Mare');
  }
});

// ---------- Start ----------

applyQuality();
loadSlot(prefs.slot || 0);
showTimeIcon();
world.autoCycle = !!prefs.autoCycle;
if (prefs.weather && prefs.weather !== 'sereno') world.setWeather(prefs.weather);
post.setTilt(!!prefs.tilt);
setTool(toolName);
if (prefs.helpSeen !== 3) setTimeout(openHelp, 600);

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

// If the phone struggles, step the quality down once, so it stays smooth.
let frameAvg = 16;
let perfCheck = 0;
let lowered = 0;
function adaptQuality(dtMs) {
  frameAvg += (dtMs - frameAvg) * 0.05;
  perfCheck += dtMs;
  if (perfCheck < 3000) return;
  perfCheck = 0;
  if (frameAvg > 34 && lowered < 2 && prefs.quality !== 'bassa') {
    lowered++;
    prefs.quality = prefs.quality === 'alta' ? 'media' : 'bassa';
    savePrefs();
    applyQuality();
    toast('Grafica ridotta per restare fluido (cambiala dal menu ⚙️)', 2600);
  }
}

const clock = new THREE.Clock();
let elapsed = 0;
let first = true;
function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  elapsed += dt;
  if (walk.active) walk.update(dt);
  else {
    input.update(dt);
    rig.update(dt);
  }
  const focus = walk.active ? walk.position : rig.target;
  world.update(dt, elapsed, camera, focus);
  decor.update(elapsed, world.night);
  life.update(dt, elapsed, world.night);
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
    const t = currentHandler();
    cursor.material.color.set(t && t.valid === false ? '#ff6b5a' : '#ffffff');
    cursor.material.opacity = 0.55 + Math.sin(elapsed * 5) * 0.2;
  }
  if (selGroup.children.length) selMat.opacity = 0.2 + Math.sin(elapsed * 4) * 0.1;
  selGroup.visible = !walk.active;
  post.setBloom(world.night);
  draw();
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
window.borgo = { objects, rig, world, setTool, undo, prefs, renderer, walk, select, editor, get tool() { return currentHandler(); } };
