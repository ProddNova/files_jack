import * as THREE from '../vendor/three.module.min.js';
import { fbm, noise2, smoothstep, clamp, lerp, col } from './util.js';

export const SIZE = 72;
export const SEG = 180;
export const ISLAND_R = 24;
export const STEP = SIZE / SEG;
const HALF = SIZE / 2;
const N = SEG + 1;
export const MIN_H = -2.6;
export const MAX_H = 9;

const baseH = new Float32Array(N * N);
const heights = new Float32Array(N * N);
const baseColors = new Float32Array(N * N * 3);
export const pathW = new Float32Array(N * N);

function shapeHeight(x, z) {
  const ang = Math.atan2(z, x);
  const coast = 1 + 0.16 * (fbm(Math.cos(ang) * 1.7 + 4, Math.sin(ang) * 1.7 + 9, 3) - 0.5) * 2;
  const r = Math.sqrt(x * x + z * z) / (ISLAND_R * coast);
  const land = smoothstep(1.02, 0.72, r);
  const hills = (fbm(x * 0.055 + 11, z * 0.055 - 3, 4) - 0.45) * 2.6;
  const bigHill = 4.6 * Math.exp(-((x + 8) ** 2 + (z + 9) ** 2) / 70);
  const knoll = 2.0 * Math.exp(-((x - 10) ** 2 + (z + 4) ** 2) / 40);
  const top = 0.9 + Math.max(hills, -0.4) + bigHill + knoll;
  return lerp(MIN_H, top, land);
}

const C = {
  deep: col('#7f8a72'),
  wetSand: col('#c8b07a'),
  sand: col('#ead7a4'),
  grass1: col('#8db35a'),
  grass2: col('#6d9a45'),
  dry: col('#b8b56a'),
  maquis: col('#5f8540'),
  rock: col('#a59d8e'),
  rockDark: col('#8a8276'),
  path1: col('#c9a07a'),
  path2: col('#b5876a'),
};

const tmp = new THREE.Color();
let geometry, posAttr, norAttr, colorAttr;
export let heightTexture = null;
let heightBytes = null;

function idx(ix, iz) {
  return clamp(iz, 0, SEG) * N + clamp(ix, 0, SEG);
}

function computeBaseColor(i, x, z, h, slope) {
  const n = noise2(x * 0.35, z * 0.35);
  const n2 = noise2(x * 0.11 + 50, z * 0.11 - 20);
  if (h < -0.15) {
    tmp.copy(C.wetSand).lerp(C.deep, smoothstep(-0.15, -2.2, h));
  } else if (h < 0.45) {
    tmp.copy(C.sand).lerp(C.wetSand, smoothstep(0.2, -0.15, h) * 0.6);
  } else {
    tmp.copy(C.grass1).lerp(C.grass2, n);
    tmp.lerp(C.dry, smoothstep(0.55, 0.8, n2) * 0.7);
    tmp.multiplyScalar(0.93 + noise2(x * 1.3, z * 1.3) * 0.14);
    tmp.lerp(C.maquis, smoothstep(2.8, 5.0, h) * 0.6);
    tmp.lerp(C.sand, smoothstep(0.8, 0.45, h));
  }
  const rockMix = smoothstep(0.55, 1.0, slope);
  if (rockMix > 0) tmp.lerp(noise2(x * 0.9, z * 0.9) > 0.5 ? C.rock : C.rockDark, rockMix);
  baseColors[i * 3] = tmp.r;
  baseColors[i * 3 + 1] = tmp.g;
  baseColors[i * 3 + 2] = tmp.b;
}

// Updates positions, normals and colors of a block of the grid.
function refreshRegion(x0, z0, x1, z1) {
  x0 = clamp(x0 - 1, 0, SEG); z0 = clamp(z0 - 1, 0, SEG);
  x1 = clamp(x1 + 1, 0, SEG); z1 = clamp(z1 + 1, 0, SEG);
  const pos = posAttr.array, nor = norAttr.array;
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * N + ix;
      pos[i * 3 + 1] = heights[i];
      const dx = heights[idx(ix - 1, iz)] - heights[idx(ix + 1, iz)];
      const dz = heights[idx(ix, iz - 1)] - heights[idx(ix, iz + 1)];
      const ny = 2 * STEP;
      const len = Math.hypot(dx, ny, dz);
      nor[i * 3] = dx / len;
      nor[i * 3 + 1] = ny / len;
      nor[i * 3 + 2] = dz / len;
      const slope = Math.hypot(dx, dz) / (2 * STEP);
      computeBaseColor(i, -HALF + ix * STEP, -HALF + iz * STEP, heights[i], slope);
      heightBytes[i] = Math.round(clamp((heights[i] + 3) / 6, 0, 1) * 255);
    }
  }
  posAttr.needsUpdate = true;
  norAttr.needsUpdate = true;
  heightTexture.needsUpdate = true;
  refreshColors(x0, z0, x1, z1);
}

export function createTerrain() {
  const pos = new Float32Array(N * N * 3);
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      const x = -HALF + ix * STEP, z = -HALF + iz * STEP;
      const h = shapeHeight(x, z);
      baseH[i] = h;
      heights[i] = h;
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
    }
  }
  const index = new Uint32Array(SEG * SEG * 6);
  let k = 0;
  for (let iz = 0; iz < SEG; iz++) {
    for (let ix = 0; ix < SEG; ix++) {
      const a = iz * N + ix, b = (iz + 1) * N + ix, c = a + 1, d = b + 1;
      index[k++] = a; index[k++] = b; index[k++] = c;
      index[k++] = c; index[k++] = b; index[k++] = d;
    }
  }
  geometry = new THREE.BufferGeometry();
  posAttr = new THREE.BufferAttribute(pos, 3);
  norAttr = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3);
  colorAttr = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', norAttr);
  geometry.setAttribute('color', colorAttr);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), HALF * 1.5);

  heightBytes = new Uint8Array(N * N);
  heightTexture = new THREE.DataTexture(heightBytes, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  heightTexture.magFilter = THREE.LinearFilter;
  heightTexture.minFilter = THREE.LinearFilter;
  refreshRegion(0, 0, SEG, SEG);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// World xz -> height texture uv: uv = xz * scale + offset
export const HEIGHT_UV = { scale: 1 / (STEP * N), offset: (HALF / STEP + 0.5) / N };

// Path color alternates per vertex, so the creuza looks like laid bricks.
function refreshColors(x0, z0, x1, z1) {
  const arr = colorAttr.array;
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * N + ix;
      const w = smoothstep(0.05, 0.6, pathW[i]);
      const pc = ((ix + iz) & 1) === 0 ? C.path1 : C.path2;
      arr[i * 3] = lerp(baseColors[i * 3], pc.r, w);
      arr[i * 3 + 1] = lerp(baseColors[i * 3 + 1], pc.g, w);
      arr[i * 3 + 2] = lerp(baseColors[i * 3 + 2], pc.b, w);
    }
  }
  colorAttr.needsUpdate = true;
}

export function refreshAllColors() {
  refreshColors(0, 0, SEG, SEG);
}

function bilinear(arr, x, z) {
  const fx = clamp((x + HALF) / STEP, 0, SEG - 0.0001);
  const fz = clamp((z + HALF) / STEP, 0, SEG - 0.0001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const a = arr[iz * N + ix], b = arr[iz * N + ix + 1];
  const c = arr[(iz + 1) * N + ix], d = arr[(iz + 1) * N + ix + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function getHeight(x, z) {
  return bilinear(heights, x, z);
}

export function pathAt(x, z) {
  return bilinear(pathW, x, z);
}

export function inBounds(x, z) {
  return Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1;
}

// Walks along the ray until it goes under the ground, then refines.
const _p = new THREE.Vector3();
export function raycastTerrain(ray) {
  let prevT = 0;
  let t = 0.5;
  let stepLen = 0.3;
  while (t < 260) {
    ray.at(t, _p);
    if ((Math.abs(_p.x) > HALF + 40 || Math.abs(_p.z) > HALF + 40) && _p.y < -3) return null;
    if (_p.y <= getHeight(_p.x, _p.z)) {
      let lo = prevT, hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        ray.at(mid, _p);
        if (_p.y <= getHeight(_p.x, _p.z)) hi = mid; else lo = mid;
      }
      ray.at(hi, _p);
      if (!inBounds(_p.x, _p.z)) return null;
      return _p.clone();
    }
    prevT = t;
    t += stepLen;
    stepLen = Math.min(stepLen * 1.02, 1.0);
  }
  return null;
}

function brushBox(x, z, radius) {
  const cx = (x + HALF) / STEP, cz = (z + HALF) / STEP, r = radius / STEP;
  return {
    cx, cz, r,
    x0: clamp(Math.floor(cx - r), 0, SEG), x1: clamp(Math.ceil(cx + r), 0, SEG),
    z0: clamp(Math.floor(cz - r), 0, SEG), z1: clamp(Math.ceil(cz + r), 0, SEG),
  };
}

// Paints (amount > 0) or removes (amount < 0) the path around a point.
// `changes` keeps the old values so the stroke can be undone.
export function paintPath(x, z, radius, amount, changes) {
  const b = brushBox(x, z, radius);
  let touched = false;
  for (let iz = b.z0; iz <= b.z1; iz++) {
    for (let ix = b.x0; ix <= b.x1; ix++) {
      const d = Math.hypot(ix - b.cx, iz - b.cz) / b.r;
      if (d > 1) continue;
      const i = iz * N + ix;
      if (heights[i] < -0.1 && amount > 0) continue;
      const f = 1 - smoothstep(0.55, 1, d);
      const nv = clamp(pathW[i] + amount * f, 0, 1);
      if (nv === pathW[i]) continue;
      if (changes && !changes.has(i)) changes.set(i, pathW[i]);
      pathW[i] = nv;
      touched = true;
    }
  }
  if (touched) refreshColors(b.x0, b.z0, b.x1, b.z1);
  return touched;
}

export function restorePath(changes) {
  for (const [i, v] of changes) pathW[i] = v;
  refreshAllColors();
}

// Raises, lowers or flattens the ground. Returns true if anything moved.
export function sculpt(x, z, radius, amount, mode, target, changes) {
  const b = brushBox(x, z, radius);
  let touched = false;
  for (let iz = b.z0; iz <= b.z1; iz++) {
    for (let ix = b.x0; ix <= b.x1; ix++) {
      if (ix < 3 || iz < 3 || ix > SEG - 3 || iz > SEG - 3) continue;
      const d = Math.hypot(ix - b.cx, iz - b.cz) / b.r;
      if (d > 1) continue;
      const i = iz * N + ix;
      const f = 1 - smoothstep(0.2, 1, d);
      let h = heights[i];
      if (mode === 'raise') h += amount * f;
      else if (mode === 'lower') h -= amount * f;
      else h += (target - h) * Math.min(1, amount * 4 * f);
      h = clamp(h, MIN_H, MAX_H);
      if (Math.abs(h - heights[i]) < 1e-5) continue;
      if (changes && !changes.has(i)) changes.set(i, heights[i]);
      heights[i] = h;
      touched = true;
    }
  }
  if (touched) refreshRegion(b.x0, b.z0, b.x1, b.z1);
  return touched;
}

export function restoreHeights(changes) {
  let x0 = SEG, z0 = SEG, x1 = 0, z1 = 0;
  for (const [i, v] of changes) {
    heights[i] = v;
    const ix = i % N, iz = Math.floor(i / N);
    x0 = Math.min(x0, ix); x1 = Math.max(x1, ix);
    z0 = Math.min(z0, iz); z1 = Math.max(z1, iz);
  }
  if (x1 >= x0) refreshRegion(x0, z0, x1, z1);
  return { x0: -HALF + x0 * STEP, z0: -HALF + z0 * STEP, x1: -HALF + x1 * STEP, z1: -HALF + z1 * STEP };
}

// Bounding box (world units) of a set of changed grid cells.
export function changesBox(changes) {
  let x0 = SEG, z0 = SEG, x1 = 0, z1 = 0;
  for (const i of changes.keys()) {
    const ix = i % N, iz = Math.floor(i / N);
    x0 = Math.min(x0, ix); x1 = Math.max(x1, ix);
    z0 = Math.min(z0, iz); z1 = Math.max(z1, iz);
  }
  return { x0: -HALF + x0 * STEP, z0: -HALF + z0 * STEP, x1: -HALF + x1 * STEP, z1: -HALF + z1 * STEP };
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodePath() {
  const bytes = new Uint8Array(pathW.length);
  for (let i = 0; i < pathW.length; i++) bytes[i] = Math.round(pathW[i] * 255);
  return bytesToB64(bytes);
}

export function decodePath(b64) {
  try {
    const bytes = b64ToBytes(b64);
    if (bytes.length !== pathW.length) return false;
    for (let i = 0; i < bytes.length; i++) pathW[i] = bytes[i] / 255;
    refreshAllColors();
    return true;
  } catch {
    return false;
  }
}

// Heights are saved as the difference from the original island, in centimeters.
export function encodeHeights() {
  const d = new Int16Array(heights.length);
  let any = false;
  for (let i = 0; i < heights.length; i++) {
    d[i] = Math.round((heights[i] - baseH[i]) * 100);
    if (d[i]) any = true;
  }
  return any ? bytesToB64(new Uint8Array(d.buffer)) : '';
}

export function decodeHeights(b64) {
  try {
    const bytes = b64ToBytes(b64);
    if (bytes.length !== heights.length * 2) return false;
    const d = new Int16Array(bytes.buffer);
    for (let i = 0; i < heights.length; i++) heights[i] = baseH[i] + d[i] / 100;
    refreshRegion(0, 0, SEG, SEG);
    return true;
  } catch {
    return false;
  }
}

export function snapshotPath() {
  return pathW.slice();
}

export function setPath(arr) {
  pathW.set(arr);
  refreshAllColors();
}

export function snapshotHeights() {
  return heights.slice();
}

export function setHeights(arr) {
  heights.set(arr);
  refreshRegion(0, 0, SEG, SEG);
}

export function resetHeights() {
  heights.set(baseH);
  refreshRegion(0, 0, SEG, SEG);
}
