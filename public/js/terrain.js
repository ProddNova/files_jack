import * as THREE from '../vendor/three.module.min.js';
import { fbm, noise2, smoothstep, clamp, lerp, col } from './util.js';
import { terrainize } from './shaders.js';

export const SIZE = 72;
export const SEG = 180;
export const ISLAND_R = 24;
export const STEP = SIZE / SEG;
const HALF = SIZE / 2;
const N = SEG + 1;
export const MIN_H = -2.6;
export const MAX_H = 10;

// Five kinds of paving, each with its own texture layer and tint.
export const PATH_TYPES = [
  { id: 'ciottoli', name: 'Ciottoli', color: '#c8ab8a' },
  { id: 'mattoni', name: 'Mattoni', color: '#b8664c' },
  { id: 'lastricato', name: 'Lastricato', color: '#cfc8ba' },
  { id: 'sterrato', name: 'Sterrato', color: '#a88663' },
  { id: 'ghiaia', name: 'Ghiaia', color: '#d6cdb9' },
];
const K = PATH_TYPES.length;
const PATH_COLORS = PATH_TYPES.map((p) => col(p.color));

const baseH = new Float32Array(N * N);
const heights = new Float32Array(N * N);
const baseColors = new Float32Array(N * N * 3);
const baseSplat = new Float32Array(N * N * 3);
export const pathW = new Float32Array(N * N);
const pathC = new Float32Array(N * N * K);

// ---------- Scenarios ----------

const P = (o) => {
  const base = {
    deep: '#7f8a72', wetSand: '#c8b07a', sand: '#ead7a4', grass1: '#8db35a', grass2: '#6d9a45',
    dry: '#b8b56a', maquis: '#5f8540', rock: '#a59d8e', rockDark: '#8a8276', snow: '#f2f5f8', ash: '#5e5753',
  };
  const out = {};
  for (const [k, v] of Object.entries({ ...base, ...o })) out[k] = typeof v === 'string' ? col(v) : v;
  return out;
};

export const SCENARIOS = {
  riviera: { name: 'Riviera', icon: '🏖️', season: 'estate', pal: P({}) },
  arcipelago: { name: 'Arcipelago', icon: '🏝️', season: 'estate', pal: P({ sand: '#f0e2b6' }) },
  laguna: { name: 'Laguna', icon: '🛶', season: 'primavera', sandTop: 0.42, pal: P({ grass1: '#93b565', grass2: '#7aa05a', sand: '#d9cfa8', wetSand: '#b9ab7f', deep: '#6f7f6a' }) },
  monti: { name: 'Monti innevati', icon: '🏔️', season: 'inverno', snowLine: 3.4, pal: P({ grass1: '#7ea34f', grass2: '#5d8a3e', maquis: '#4b6e38', rock: '#8d8c88', rockDark: '#6f6e6b' }) },
  autunno: { name: 'Bosco d\'autunno', icon: '🍂', season: 'autunno', pal: P({ grass1: '#a3a556', grass2: '#8c8a45', dry: '#c9a45a', maquis: '#7a6a3a' }) },
  deserto: { name: 'Oasi nel deserto', icon: '🏜️', season: 'estate', desert: true, pal: P({ sand: '#e3c38d', wetSand: '#c9a46f', grass1: '#7fa05a', rock: '#c08a5a', rockDark: '#a5714a' }) },
  vulcano: { name: 'Isola vulcanica', icon: '🌋', season: 'estate', volcano: true, pal: P({ sand: '#5b5450', wetSand: '#47423f', grass1: '#6f8f45', grass2: '#56763a', rock: '#4a4542', rockDark: '#3a3532', deep: '#3a3a38' }) },
  // Mainland worlds: land all around, to the horizon
  campagna: { name: 'Campagna col fiume', icon: '🌾', season: 'estate', mainland: true, sandTop: 0.12, pal: P({ grass1: '#9cbb5c', grass2: '#7ea24a', dry: '#c2b765', sand: '#cdbb8a', wetSand: '#9f8f6a', deep: '#5f6b55' }) },
  colline: { name: 'Colline', icon: '🌄', season: 'estate', mainland: true, sandTop: 0.12, pal: P({ grass1: '#a5b85c', grass2: '#86a048', dry: '#cbb56a', maquis: '#5d7d3c', sand: '#cdbb8a' }) },
  valle: { name: 'Valle alpina', icon: '⛰️', season: 'estate', mainland: true, sandTop: 0.12, pal: P({ grass1: '#7fae4f', grass2: '#5f913f', maquis: '#4a6e36', rock: '#8f8d88', rockDark: '#6e6c69', sand: '#b8b09a', wetSand: '#8f887a' }) },
  lago: { name: 'Lago tra i colli', icon: '🏞️', season: 'primavera', mainland: true, sandTop: 0.32, pal: P({ grass1: '#93b862', grass2: '#73994c', sand: '#d6c9a0', wetSand: '#a99c78', deep: '#5a6a5e' }) },
};

let scenario = 'riviera';
let islandSeed = 0;
let off = {};
export let lavaInfo = null;
export let oasis = null;

export function getIslandSeed() { return islandSeed; }
export function getScenario() { return scenario; }

function setSeedOffsets(seed) {
  islandSeed = seed;
  const r = (k) => Math.abs((Math.sin((seed || 1) * 12.9898 + k * 78.233) * 43758.5453) % 1);
  const a1 = r(3) * Math.PI * 2, a2 = a1 + 2 + r(4) * 2;
  off = {
    a: seed ? r(1) * 100 : 0, b: seed ? r(2) * 100 : 0,
    hx: seed ? Math.cos(a1) * (5 + r(5) * 6) : -8, hz: seed ? Math.sin(a1) * (5 + r(5) * 6) : -9,
    kx: seed ? Math.cos(a2) * (6 + r(6) * 7) : 10, kz: seed ? Math.sin(a2) * (6 + r(6) * 7) : -4,
    big: seed ? 3 + r(7) * 3.5 : 4.6, small: seed ? 1 + r(8) * 2.5 : 2.0,
    ang: r(9) * Math.PI * 2,
    c1: (r(10) - 0.5) * 10, c2: (r(11) - 0.5) * 10, c3: (r(12) - 0.5) * 10,
    blobs: Array.from({ length: 5 }, (_, i) => {
      const a = r(20 + i) * Math.PI * 2 + i * 1.3, d = i === 0 ? 0 : 9 + r(30 + i) * 11;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, r: i === 0 ? 10 : 5 + r(40 + i) * 4 };
    }),
    mesas: [0, 1].map((i) => {
      const a = r(50 + i) * Math.PI * 2;
      return { x: Math.cos(a) * (10 + r(52 + i) * 6), z: Math.sin(a) * (10 + r(52 + i) * 6) };
    }),
    vx: (r(60) - 0.5) * 6, vz: (r(61) - 0.5) * 6,
    coastAng: r(70) * Math.PI * 2,
    isles: [0, 1, 2].map((i) => {
      const a = r(80 + i) * Math.PI * 2;
      const d = 140 + r(84 + i) * 160;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, r: 14 + r(88 + i) * 22, h: 8 + r(92 + i) * 22 };
    }),
  };
}

function coastLand(x, z, R = ISLAND_R) {
  const ang = Math.atan2(z, x);
  const coast = 1 + 0.16 * (fbm(Math.cos(ang) * 1.7 + 4 + off.a, Math.sin(ang) * 1.7 + 9 + off.b, 3) - 0.5) * 2;
  const r = Math.sqrt(x * x + z * z) / (R * coast);
  return { land: smoothstep(1.02, 0.72, r), r };
}

const hills = (x, z, amp = 2.6) => (fbm(x * 0.055 + 11 + off.a, z * 0.055 - 3 + off.b, 4) - 0.45) * amp;

// ---------- Far landscape (the view to the horizon) ----------

const ridged = (x, z, oct = 5) => 1 - Math.abs(2 * fbm(x + off.a * 0.37, z + off.b * 0.37, oct) - 1);
const angDiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
// Slow, wide rolling ground shared by the editable map and its surroundings
const plain = (x, z, amp) => 0.75 + (fbm(x * 0.012 + off.a, z * 0.012 + off.b, 3) - 0.45) * amp;
// A river winding across the land (distance to its center line)
const riverDist = (x, z) => Math.abs(z - (9 * Math.sin(x * 0.045 + off.a) + 4 * Math.sin(x * 0.11 + off.b) + off.c1 * 0.6));
const carveRiver = (h, x, z, w = 2.0) => lerp(h, -0.75, smoothstep(w * 1.6, w * 0.7, riverDist(x, z)));
// Big mountains far away, higher the farther they are
const mountains = (x, z, d, from, to, height) => {
  const k = smoothstep(from, to, d);
  if (k <= 0) return 0;
  return (ridged(x * 0.0065, z * 0.0065) ** 1.6 * 0.85 + fbm(x * 0.02, z * 0.02, 3) * 0.25) * height * k;
};

// Islands: open sea all around, a few far islands and a mountain coast on one side
function seaVista(x, z) {
  const d = Math.hypot(x, z);
  let h = lerp(MIN_H, -22, smoothstep(36, 110, d));
  const arc = smoothstep(1.25, 0.55, angDiff(Math.atan2(z, x), off.coastAng));
  if (arc > 0) {
    const shore = 330 + (fbm(Math.atan2(z, x) * 2.5 + off.a, 3.3, 3) - 0.5) * 140;
    const land = smoothstep(shore - 25, shore + 25, d) * arc;
    if (land > 0) h = lerp(h, 3 + mountains(x, z, d, shore - 40, shore + 260, 95), land);
  }
  for (const s of off.isles) {
    const q = Math.hypot(x - s.x, z - s.z) / s.r;
    if (q < 1.6) h = Math.max(h, lerp(-6, s.h * (1 - q * 0.55) + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 6, smoothstep(1.6, 0.9, q)));
  }
  return h;
}

const VISTAS = {
  campagna(x, z) {
    const d = Math.hypot(x, z);
    return carveRiver(plain(x, z, 3.0) + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 8 * smoothstep(40, 160, d) + mountains(x, z, d, 260, 700, 140), x, z, 2.4);
  },
  colline(x, z) {
    const d = Math.hypot(x, z);
    const roll = (fbm(x * 0.022 + off.a, z * 0.022 + off.b, 4) - 0.4) * 22 * smoothstep(30, 110, d);
    return plain(x, z, 4) + Math.max(roll, -2) + mountains(x, z, d, 300, 750, 110);
  },
  valle(x, z) {
    // A valley along off.ang: the sides climb into high, snowy peaks
    const c = Math.cos(off.ang), sn = Math.sin(off.ang);
    const across = Math.abs(-x * sn + z * c);
    const along = x * c + z * sn;
    const side = smoothstep(18, 140, across);
    const peaks = (ridged(x * 0.009, z * 0.009) ** 1.4 * 0.8 + 0.25) * 95 * side;
    const stream = Math.abs(-x * sn + z * c - 3 * Math.sin(along * 0.08 + off.b));
    return lerp(plain(x, z, 1.5) + side * 6 + peaks, -0.6, smoothstep(2.6, 1.1, stream));
  },
  lago(x, z) {
    const d = Math.hypot(x, z);
    const lx = Math.cos(off.coastAng) * 70, lz = Math.sin(off.coastAng) * 70;
    const dl = Math.hypot(x - lx, z - lz) / (48 + (noise2(x * 0.03, z * 0.03) - 0.5) * 30);
    const land = plain(x, z, 3) + (fbm(x * 0.025, z * 0.025, 3) - 0.4) * 14 * smoothstep(36, 120, d) + mountains(x, z, d, 220, 650, 120);
    return lerp(land, -2.2, smoothstep(1.0, 0.75, dl));
  },
};

export function isMainland() { return !!SCENARIOS[scenario].mainland; }
export function vistaHeight(x, z) { return (VISTAS[scenario] || seaVista)(x, z); }

// The editable map melts into the far landscape near its edge
function mainlandShape(local) {
  return (x, z) => {
    const e = smoothstep(26, 35.6, Math.max(Math.abs(x), Math.abs(z)));
    const far = VISTAS[scenario](x, z);
    return e >= 1 ? far : lerp(local(x, z, far), far, e);
  };
}

const SHAPES = {
  campagna: mainlandShape((x, z) => carveRiver(plain(x, z, 3.0) + Math.max(hills(x, z, 1.2), -0.3), x, z, 2.4)),
  colline: mainlandShape((x, z) => plain(x, z, 4) + Math.max(hills(x, z, 5.5), -0.6) + off.big * 0.9 * Math.exp(-((x - off.hx) ** 2 + (z - off.hz) ** 2) / 90)),
  valle: mainlandShape((x, z, far) => far + Math.max(hills(x, z, 1.0), -0.2)),
  lago: mainlandShape((x, z, far) => far + Math.max(hills(x, z, 1.6), -0.3) * smoothstep(-1, 1.5, far)),
  riviera(x, z) {
    const { land } = coastLand(x, z);
    const bigHill = off.big * Math.exp(-((x - off.hx) ** 2 + (z - off.hz) ** 2) / 70);
    const knoll = off.small * Math.exp(-((x - off.kx) ** 2 + (z - off.kz) ** 2) / 40);
    return lerp(MIN_H, 0.9 + Math.max(hills(x, z), -0.4) + bigHill + knoll, land);
  },
  arcipelago(x, z) {
    let land = 0, top = 0;
    for (const b of off.blobs) {
      const d = Math.hypot(x - b.x, z - b.z);
      const wob = 1 + (noise2(x * 0.15 + b.x, z * 0.15 + b.z) - 0.5) * 0.5;
      const l = smoothstep(1.0, 0.6, d / (b.r * wob));
      if (l > land) { land = l; top = 0.8 + Math.max(hills(x, z, 2.0), -0.3) + 2.4 * Math.exp(-(d * d) / (b.r * b.r * 0.4)) * (b.r / 10); }
    }
    return lerp(MIN_H, top, land);
  },
  laguna(x, z) {
    const { land } = coastLand(x, z, 26);
    let top = 0.6 + (fbm(x * 0.08 + off.a, z * 0.08, 3) - 0.5) * 0.5;
    const c = Math.min(
      Math.abs(z - (6 * Math.sin(x * 0.13 + off.a) + off.c1)),
      Math.abs(z - (5 * Math.sin(x * 0.11 + off.b) + off.c2 + 9)),
      Math.abs(x - (5 * Math.sin(z * 0.12 + off.a) + off.c3)),
    );
    top = lerp(top, -0.9, smoothstep(1.4, 0.7, c));
    return lerp(MIN_H, top, land);
  },
  monti(x, z) {
    const { land, r } = coastLand(x, z, 26);
    const ang = Math.atan2(z, x);
    let da = Math.abs(ang - off.ang); if (da > Math.PI) da = Math.PI * 2 - da;
    const gap = 1 - 0.8 * Math.exp(-(da * da) / 0.12);
    const ridged = 1 - Math.abs(2 * fbm(x * 0.09 + off.a, z * 0.09 + off.b, 5) - 1);
    const ring = Math.exp(-((r - 0.6) ** 2) / 0.035) * (5 + ridged * 4) * gap;
    let top = 0.8 + ring + Math.max(hills(x, z, 1.5), -0.3);
    top = lerp(top, -1.3, smoothstep(0.3, 0.14, r));
    return lerp(MIN_H, top, land);
  },
  autunno(x, z) {
    const { land } = coastLand(x, z);
    const bigHill = off.big * 1.1 * Math.exp(-((x - off.hx) ** 2 + (z - off.hz) ** 2) / 90);
    const knoll = (off.small + 1) * Math.exp(-((x - off.kx) ** 2 + (z - off.kz) ** 2) / 50);
    return lerp(MIN_H, 1.0 + Math.max(hills(x, z, 3.6), -0.4) + bigHill + knoll, land);
  },
  deserto(x, z) {
    const { land } = coastLand(x, z, 25);
    const dunes = (Math.sin(x * 0.32 + fbm(x * 0.05, z * 0.05, 3) * 3) * 0.5 + 0.5) * 0.9
      + (Math.sin(z * 0.21 + x * 0.08) * 0.5 + 0.5) * 0.45;
    let top = 0.8 + dunes;
    for (const m of off.mesas) {
      const d = Math.hypot(x - m.x, z - m.z) * (1 + (noise2(x * 0.3, z * 0.3) - 0.5) * 0.3);
      top += smoothstep(4.0, 3.0, d) * 3.2;
    }
    const d0 = Math.hypot(x - off.vx, z - off.vz);
    top = lerp(top, -0.9, smoothstep(4.2, 2.2, d0));
    return lerp(MIN_H, top, land);
  },
  vulcano(x, z) {
    const { land, r } = coastLand(x, z, 25);
    const dc = Math.hypot(x - off.vx * 0.5, z - off.vz * 0.5) / 25;
    const cone = 9.2 * Math.pow(Math.max(0, 1 - dc / 0.85), 1.5);
    const crater = smoothstep(0.16, 0.08, dc) * 3.4;
    const ridges = (fbm(x * 0.2 + off.a, z * 0.2, 4) - 0.5) * 1.4 * (cone / 9.2);
    return lerp(MIN_H, 0.6 + cone - crater + ridges + Math.max(hills(x, z, 1.2), -0.3) * (1 - cone / 9.2), land);
  },
};

const tmp = new THREE.Color();
let geometry, posAttr, norAttr, colorAttr, splatAttr, pathAttr;
export let heightTexture = null;
let heightHalf = null;

function idx(ix, iz) {
  return clamp(iz, 0, SEG) * N + clamp(ix, 0, SEG);
}

// Ground color and texture mix at a point: used by the map and by the far
// landscape next to it, so the two match at the edge.
export function groundColor(x, z, h, slope, out) {
  const S = SCENARIOS[scenario];
  const C = S.pal;
  const n = noise2(x * 0.35, z * 0.35);
  const n2 = noise2(x * 0.11 + 50, z * 0.11 - 20);
  const top = S.sandTop ?? 0.8, low = top * 0.5625;
  let sandW = h < low ? 1 : smoothstep(top, low, h);
  if (h < -0.15) {
    tmp.copy(C.wetSand).lerp(C.deep, smoothstep(-0.15, -2.2, h));
  } else if (h < low) {
    tmp.copy(C.sand).lerp(C.wetSand, smoothstep(0.2, -0.15, h) * 0.6);
  } else {
    tmp.copy(C.grass1).lerp(C.grass2, n);
    tmp.lerp(C.dry, smoothstep(0.55, 0.8, n2) * 0.7);
    tmp.multiplyScalar(0.93 + noise2(x * 1.3, z * 1.3) * 0.14);
    tmp.lerp(C.maquis, smoothstep(2.8, 5.0, h) * 0.6);
    tmp.lerp(C.sand, smoothstep(top, low, h));
  }
  if (S.desert) {
    // Sand everywhere, green only around the oasis pond
    const near = oasis ? smoothstep(7.5, 4.5, Math.hypot(x - oasis.x, z - oasis.z)) : 0;
    const k = 1 - near * (h < 2 ? 1 : 0);
    sandW = Math.max(sandW, k);
    tmp.lerp(C.sand.clone().multiplyScalar(0.94 + n * 0.12), k);
  }
  if (S.volcano && h > 2.8) {
    const ash = smoothstep(2.8, 4.2, h);
    tmp.lerp(C.ash, ash);
    sandW = Math.max(sandW, ash);
  }
  if (S.snowLine && h > S.snowLine) {
    const snow = smoothstep(S.snowLine, S.snowLine + 1.2, h);
    tmp.lerp(C.snow, snow);
    sandW = Math.max(sandW, snow);
  }
  const rockMix = smoothstep(0.55, 1.0, slope) * (S.snowLine && h > S.snowLine + 1 ? 0.5 : 1);
  if (rockMix > 0) tmp.lerp(noise2(x * 0.9, z * 0.9) > 0.5 ? C.rock : C.rockDark, rockMix);
  out.color.copy(tmp);
  out.grass = (1 - sandW) * (1 - rockMix);
  out.sand = sandW * (1 - rockMix);
  out.rock = rockMix;
  return out;
}

const gc = { color: new THREE.Color(), grass: 0, sand: 0, rock: 0 };
function computeBaseColor(i, x, z, h, slope) {
  groundColor(x, z, h, slope, gc);
  baseSplat[i * 3] = gc.grass;
  baseSplat[i * 3 + 1] = gc.sand;
  baseSplat[i * 3 + 2] = gc.rock;
  baseColors[i * 3] = gc.color.r;
  baseColors[i * 3 + 1] = gc.color.g;
  baseColors[i * 3 + 2] = gc.color.b;
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
      heightHalf[i] = THREE.DataUtils.toHalfFloat(heights[i]);
    }
  }
  posAttr.needsUpdate = true;
  norAttr.needsUpdate = true;
  heightTexture.needsUpdate = true;
  refreshColors(x0, z0, x1, z1);
}

function generateHeights(seed, scen) {
  scenario = SCENARIOS[scen] ? scen : 'riviera';
  setSeedOffsets(seed);
  const shape = SHAPES[scenario];
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      const h = shape(-HALF + ix * STEP, -HALF + iz * STEP);
      baseH[i] = h;
      heights[i] = h;
    }
  }
  oasis = scenario === 'deserto' ? { x: off.vx, z: off.vz } : null;
  lavaInfo = null;
  if (scenario === 'vulcano') {
    const cx = off.vx * 0.5, cz = off.vz * 0.5;
    let lo = Infinity;
    for (let a = 0; a < 12; a++) lo = Math.min(lo, getHeight(cx + Math.cos(a) * 1.6, cz + Math.sin(a) * 1.6));
    lavaInfo = { x: cx, z: cz, y: lo + 0.25, r: 2.6 };
  }
}

// Builds a brand new island shape (clears paths too).
export function newIsland(seed, scen = scenario) {
  generateHeights(seed, scen);
  pathC.fill(0);
  pathW.fill(0);
  refreshRegion(0, 0, SEG, SEG);
}

export function createTerrain(seed = 0, scen = 'riviera') {
  generateHeights(seed, scen);
  const pos = new Float32Array(N * N * 3);
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      pos[i * 3] = -HALF + ix * STEP;
      pos[i * 3 + 1] = heights[i];
      pos[i * 3 + 2] = -HALF + iz * STEP;
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
  splatAttr = new THREE.BufferAttribute(new Float32Array(N * N * 4), 4);
  pathAttr = new THREE.BufferAttribute(new Float32Array(N * N * 4), 4);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', norAttr);
  geometry.setAttribute('color', colorAttr);
  geometry.setAttribute('aSplat', splatAttr);
  geometry.setAttribute('aPath', pathAttr);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), HALF * 1.5);

  heightHalf = new Uint16Array(N * N);
  heightTexture = new THREE.DataTexture(heightHalf, N, N, THREE.RedFormat, THREE.HalfFloatType);
  heightTexture.wrapS = heightTexture.wrapT = THREE.ClampToEdgeWrapping;
  heightTexture.magFilter = THREE.LinearFilter;
  heightTexture.minFilter = THREE.LinearFilter;
  refreshRegion(0, 0, SEG, SEG);

  const mat = terrainize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 }));
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// World xz -> height texture uv: uv = xz * scale + offset
export const HEIGHT_UV = { scale: 1 / (STEP * N), offset: (HALF / STEP + 0.5) / N };

// Paths tint the ground and switch its texture to the paving of their kind.
function refreshColors(x0, z0, x1, z1) {
  const arr = colorAttr.array, sp = splatAttr.array, pa = pathAttr.array;
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * N + ix;
      const total = pathW[i];
      const w = smoothstep(0.05, 0.7, total);
      let r = 0, g = 0, b = 0;
      for (let t = 0; t < K; t++) {
        const f = total > 0 ? pathC[i * K + t] / total : t === 0 ? 1 : 0;
        r += PATH_COLORS[t].r * f; g += PATH_COLORS[t].g * f; b += PATH_COLORS[t].b * f;
        if (t < 4) pa[i * 4 + t] = f;
      }
      arr[i * 3] = lerp(baseColors[i * 3], r, w);
      arr[i * 3 + 1] = lerp(baseColors[i * 3 + 1], g, w);
      arr[i * 3 + 2] = lerp(baseColors[i * 3 + 2], b, w);
      sp[i * 4] = baseSplat[i * 3] * (1 - w);
      sp[i * 4 + 1] = baseSplat[i * 3 + 1] * (1 - w);
      sp[i * 4 + 2] = baseSplat[i * 3 + 2] * (1 - w);
      sp[i * 4 + 3] = w;
    }
  }
  colorAttr.needsUpdate = true;
  splatAttr.needsUpdate = true;
  pathAttr.needsUpdate = true;
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

// Paints (amount > 0) a path of a given kind, or removes paths (amount < 0).
// Painting over another kind slowly turns it into the new one.
// `changes` keeps the old values so the stroke can be undone.
export function paintPath(x, z, radius, amount, changes, type = 0) {
  const b = brushBox(x, z, radius);
  let touched = false;
  for (let iz = b.z0; iz <= b.z1; iz++) {
    for (let ix = b.x0; ix <= b.x1; ix++) {
      const d = Math.hypot(ix - b.cx, iz - b.cz) / b.r;
      if (d > 1) continue;
      const i = iz * N + ix;
      if (heights[i] < -0.1 && amount > 0) continue;
      const f = (1 - smoothstep(0.55, 1, d)) * Math.abs(amount);
      if (f <= 0) continue;
      const o = i * K;
      if (changes && !changes.has(i)) changes.set(i, pathC.slice(o, o + K));
      let total = 0;
      if (amount > 0) {
        for (let t = 0; t < K; t++) {
          pathC[o + t] = t === type ? Math.min(1, pathC[o + t] + f) : Math.max(0, pathC[o + t] - f * 1.2);
          total += pathC[o + t];
        }
        if (total > 1) for (let t = 0; t < K; t++) pathC[o + t] /= total;
      } else {
        for (let t = 0; t < K; t++) pathC[o + t] = Math.max(0, pathC[o + t] - f);
      }
      total = 0;
      for (let t = 0; t < K; t++) total += pathC[o + t];
      pathW[i] = Math.min(1, total);
      touched = true;
    }
  }
  if (touched) refreshColors(b.x0, b.z0, b.x1, b.z1);
  return touched;
}

export function restorePath(changes) {
  for (const [i, v] of changes) {
    pathC.set(v, i * K);
    let total = 0;
    for (let t = 0; t < K; t++) total += v[t];
    pathW[i] = Math.min(1, total);
  }
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
  const bytes = new Uint8Array(pathC.length);
  for (let i = 0; i < pathC.length; i++) bytes[i] = Math.round(pathC[i] * 255);
  return bytesToB64(bytes);
}

function applyPathArray(arr, scale) {
  if (arr.length === N * N) {
    // Older saves: one channel, all cobbles
    pathC.fill(0);
    for (let i = 0; i < N * N; i++) pathC[i * K] = arr[i] * scale;
  } else if (arr.length === N * N * K) {
    for (let i = 0; i < arr.length; i++) pathC[i] = arr[i] * scale;
  } else return false;
  for (let i = 0; i < N * N; i++) {
    let t = 0;
    for (let k = 0; k < K; k++) t += pathC[i * K + k];
    pathW[i] = Math.min(1, t);
  }
  refreshAllColors();
  return true;
}

export function decodePath(b64) {
  try {
    return applyPathArray(b64ToBytes(b64), 1 / 255);
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
  return pathC.slice();
}

export function setPath(arr) {
  applyPathArray(arr, 1);
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
