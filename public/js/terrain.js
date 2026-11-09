import * as THREE from '../vendor/three.module.min.js';
import { fbm, noise2, smoothstep, clamp, lerp, col } from './util.js';

export const SIZE = 72;
export const SEG = 180;
export const ISLAND_R = 24;
const STEP = SIZE / SEG;
const HALF = SIZE / 2;
const N = SEG + 1;

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
  return lerp(-2.6, top, land);
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
  path1: col('#c9a07a'),
  path2: col('#b5876a'),
};

const tmp = new THREE.Color();

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
  tmp.lerp(C.rock, smoothstep(0.45, 0.85, slope));
  baseColors[i * 3] = tmp.r;
  baseColors[i * 3 + 1] = tmp.g;
  baseColors[i * 3 + 2] = tmp.b;
}

let geometry, colorAttr;

export function createTerrain() {
  const pos = new Float32Array(N * N * 3);
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      const x = -HALF + ix * STEP, z = -HALF + iz * STEP;
      const h = shapeHeight(x, z);
      heights[i] = h;
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
    }
  }
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      const hx = heights[iz * N + Math.min(ix + 1, SEG)] - heights[iz * N + Math.max(ix - 1, 0)];
      const hz = heights[Math.min(iz + 1, SEG) * N + ix] - heights[Math.max(iz - 1, 0) * N + ix];
      const slope = Math.sqrt(hx * hx + hz * hz) / (2 * STEP);
      computeBaseColor(i, pos[i * 3], pos[i * 3 + 2], heights[i], slope);
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
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  colorAttr = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3);
  geometry.setAttribute('color', colorAttr);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  refreshColors(0, 0, SEG, SEG);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// Path color depends on the vertex, so the creuza looks like laid bricks.
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

export function getHeight(x, z) {
  const fx = clamp((x + HALF) / STEP, 0, SEG - 0.0001);
  const fz = clamp((z + HALF) / STEP, 0, SEG - 0.0001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const a = heights[iz * N + ix], b = heights[iz * N + ix + 1];
  const c = heights[(iz + 1) * N + ix], d = heights[(iz + 1) * N + ix + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function inBounds(x, z) {
  return Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1;
}

// Walks along the ray until it goes under the ground, then refines.
const _p = new THREE.Vector3();
export function raycastTerrain(ray) {
  let prevT = 0;
  const maxT = 260;
  let t = 0.5;
  let stepLen = 0.3;
  while (t < maxT) {
    ray.at(t, _p);
    if (Math.abs(_p.x) > HALF + 40 || Math.abs(_p.z) > HALF + 40) {
      if (_p.y < -3) return null;
    }
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

// Paints (amount > 0) or removes (amount < 0) the path around a point.
// `changes` keeps the old values so the stroke can be undone.
export function paintPath(x, z, radius, amount, changes) {
  const cx = (x + HALF) / STEP, cz = (z + HALF) / STEP;
  const r = radius / STEP;
  const x0 = clamp(Math.floor(cx - r), 0, SEG), x1 = clamp(Math.ceil(cx + r), 0, SEG);
  const z0 = clamp(Math.floor(cz - r), 0, SEG), z1 = clamp(Math.ceil(cz + r), 0, SEG);
  let touched = false;
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const d = Math.hypot(ix - cx, iz - cz) / r;
      if (d > 1) continue;
      const i = iz * N + ix;
      if (heights[i] < -0.1) continue;
      const f = 1 - smoothstep(0.55, 1, d);
      const nv = clamp(pathW[i] + amount * f, 0, 1);
      if (nv === pathW[i]) continue;
      if (changes && !changes.has(i)) changes.set(i, pathW[i]);
      pathW[i] = nv;
      touched = true;
    }
  }
  if (touched) refreshColors(x0, z0, x1, z1);
  return touched;
}

export function restorePath(changes) {
  for (const [i, v] of changes) pathW[i] = v;
  refreshAllColors();
}

export function encodePath() {
  let s = '';
  for (let i = 0; i < pathW.length; i++) s += String.fromCharCode(Math.round(pathW[i] * 255));
  return btoa(s);
}

export function decodePath(b64) {
  try {
    const s = atob(b64);
    if (s.length !== pathW.length) return false;
    for (let i = 0; i < s.length; i++) pathW[i] = s.charCodeAt(i) / 255;
    refreshAllColors();
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
