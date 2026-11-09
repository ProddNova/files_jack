import { GeoBuilder, rng, col, clamp } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, L, finish } from './common.js';

const LEAF = {
  olive: ['#8f9e6b', '#7f9160', '#a3ad7b', '#93a26e'].map(col),
  oliveTrunk: col('#6b6254'),
  pine: ['#3f6d38', '#4d7d40', '#456f3a'].map(col),
  pineTrunk: col('#7a5a44'),
  cypress: ['#2f5a35', '#36633b'].map(col),
  bush: ['#4f7d36', '#5a8a3e', '#46733a'].map(col),
  palm: ['#5f9a3e', '#6aa548', '#548c37'].map(col),
  palmTrunk: col('#8a7458'),
  lemon: col('#f5d33a'),
};

const FLOWERS = [
  { name: 'Buganvillea', colors: ['#d23c8c', '#e0569f', '#b8307a'] },
  { name: 'Gerani', colors: ['#e0473c', '#f05a4a', '#c93a33'] },
  { name: 'Ginestra', colors: ['#f2c230', '#f7d54d', '#e8b51f'] },
  { name: 'Lavanda', colors: ['#8c6bc8', '#7b5cb8', '#9d7fd6'], spikes: true },
  { name: 'Margherite', colors: ['#f7f4ea', '#ffffff', '#f2eddc'] },
];

export const FLOWER_NAMES = FLOWERS.map((f) => f.name);
export const TREE_TYPES = ['olive', 'pine', 'cypress', 'lemon', 'palm', 'abete', 'quercia', 'betulla', 'salice', 'cactus', 'bush', 'rock'];

export function pickTreeType(r) {
  const v = r();
  if (v < 0.35) return 'olive';
  if (v < 0.55) return 'pine';
  if (v < 0.75) return 'cypress';
  if (v < 0.87) return 'lemon';
  return 'palm';
}

function olive(S, r, s) {
  const lean = r.range(-0.25, 0.25);
  S.add('cyl8', [0, 0.25 * s, 0], [0.14 * s, 1.1 * s, 0.14 * s], LEAF.oliveTrunk, [lean, 0, lean * 0.6], L.BARK);
  S.add('cyl8', [0.12 * s, 0.85 * s, 0], [0.08 * s, 0.6 * s, 0.08 * s], LEAF.oliveTrunk, [0, 0, -0.5], L.BARK);
  S.add('cyl8', [-0.1 * s, 0.8 * s, 0.05], [0.07 * s, 0.5 * s, 0.07 * s], LEAF.oliveTrunk, [0.3, 0, 0.6], L.BARK);
  const blobs = r.int(4, 6);
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2, rad = r.range(0.15, 0.55) * s;
    S.add('ico', [Math.cos(a) * rad, (1.05 + r.range(0, 0.45)) * s, Math.sin(a) * rad],
      [0.5 * s * r.range(0.8, 1.1), 0.38 * s, 0.5 * s * r.range(0.8, 1.1)], r.pick(LEAF.olive), [r(), r() * 3, 0]);
  }
}

function pine(S, r, s) {
  const lean = r.range(-0.18, 0.18);
  S.add('cyl8', [0, 1.1 * s, 0], [0.11 * s, 2.6 * s, 0.11 * s], LEAF.pineTrunk, [lean, 0, -lean * 0.5], L.BARK);
  const top = 2.35 * s;
  S.add('dode', [lean * 1.2 * s, top, 0], [1.25 * s, 0.42 * s, 1.15 * s], r.pick(LEAF.pine), [0, r() * 3, 0]);
  S.add('dode', [lean * 1.2 * s + 0.3 * s, top + 0.28 * s, 0.2 * s], [0.75 * s, 0.32 * s, 0.7 * s], r.pick(LEAF.pine), [0, r() * 3, 0]);
  S.add('dode', [lean * 1.2 * s - 0.45 * s, top - 0.1 * s, -0.25 * s], [0.6 * s, 0.26 * s, 0.6 * s], r.pick(LEAF.pine), [0, r() * 3, 0]);
}

function cypress(S, r, s) {
  S.add('cyl8', [0, 0.1, 0], [0.1 * s, 0.6, 0.1 * s], LEAF.pineTrunk, null, L.BARK);
  const tall = r.range(1.3, 1.8);
  S.add('ico', [0, 1.4 * s * tall / 1.55, 0], [0.45 * s, 1.4 * s * tall / 1.55, 0.45 * s], r.pick(LEAF.cypress), [0, r() * 3, 0]);
  S.add('ico', [0, 2.55 * s * tall / 1.55, 0], [0.25 * s, 0.7 * s, 0.25 * s], r.pick(LEAF.cypress), [0, r() * 3, 0]);
}

function lemon(S, r, s) {
  S.add('cyl8', [0, 0.25, 0], [0.09 * s, 0.9 * s, 0.09 * s], LEAF.oliveTrunk, null, L.BARK);
  S.add('ico', [0, 0.95 * s, 0], [0.6 * s, 0.52 * s, 0.6 * s], r.pick(LEAF.bush), [0, r() * 3, 0]);
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2, e = r.range(-0.4, 0.9);
    S.add('octa', [Math.cos(a) * Math.cos(e) * 0.58 * s, 0.95 * s + Math.sin(e) * 0.48 * s, Math.sin(a) * Math.cos(e) * 0.58 * s],
      [0.075 * s, 0.09 * s, 0.075 * s], LEAF.lemon);
  }
}

function palm(S, r, s) {
  const segs = 6;
  const bend = r.range(0.04, 0.12) * (r() < 0.5 ? -1 : 1);
  let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const h = 0.48 * s;
    const tilt = bend * i;
    S.add('cyl8', [x, y + h / 2, 0], [0.13 * s - i * 0.008, h, 0.13 * s - i * 0.008], i % 2 ? LEAF.palmTrunk : LEAF.palmTrunk.clone().multiplyScalar(0.85), [0, 0, -tilt], L.BARK);
    x += Math.sin(tilt) * h;
    y += Math.cos(tilt) * h;
  }
  const leaves = 8;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + r() * 0.3;
    const len = r.range(0.95, 1.25) * s;
    S.add('box', [x + Math.sin(a) * len * 0.42, y - 0.12 * s, Math.cos(a) * len * 0.42], [0.26 * s, 0.03, len], r.pick(LEAF.palm), [0.42, a, 0]);
  }
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    S.add('box', [x + Math.sin(a) * 0.25 * s, y + 0.08 * s, Math.cos(a) * 0.25 * s], [0.18 * s, 0.03, 0.6 * s], r.pick(LEAF.palm), [-0.35, a, 0]);
  }
  S.add('ico', [x, y - 0.18 * s, 0], [0.2 * s, 0.14 * s, 0.2 * s], col('#9c6b2e'), null, L.BARK);
}

function bush(S, r, s) {
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = r.range(0, 0.35) * s;
    S.add('ico1', [Math.cos(a) * rad, 0.3 * s, Math.sin(a) * rad], [r.range(0.3, 0.45) * s, r.range(0.28, 0.4) * s, r.range(0.3, 0.45) * s], r.pick(LEAF.bush), [r(), r() * 3, 0], L.LEAF);
  }
}

const ROCKS = ['#a39b8d', '#8f877b', '#b3aa9a'].map(col);
function rock(S, r, s) {
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = i ? r.range(0.4, 0.7) * s : 0;
    const k = (i ? r.range(0.35, 0.55) : r.range(0.6, 0.9)) * s;
    S.add('dode', [Math.cos(a) * rad, k * 0.35, Math.sin(a) * rad], [k * r.range(0.9, 1.3), k * r.range(0.6, 0.9), k], r.pick(ROCKS), [r(), r() * 3, r()], L.ROCK);
  }
}

function abete(S, r, s) {
  S.add('cyl8', [0, 0.3 * s, 0], [0.12 * s, 0.9 * s, 0.12 * s], LEAF.pineTrunk, null, L.BARK);
  const green = [col('#2e5a3a'), col('#365f3c'), col('#2a5236')];
  const tiers = r.int(4, 5);
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i / (tiers + 0.5);
    S.add('cone8', [0, (0.7 + i * 0.55) * s, 0], [0.95 * k * s, 0.9 * s, 0.95 * k * s], r.pick(green), [0, r() * 3, 0]);
  }
}

function quercia(S, r, s) {
  S.add('cyl8', [0, 0.55 * s, 0], [0.2 * s, 1.3 * s, 0.2 * s], col('#5e4b3b'), null, L.BARK);
  for (const a of [0.6, 2.6, 4.4]) S.add('cyl8', [Math.cos(a) * 0.25 * s, 1.15 * s, Math.sin(a) * 0.25 * s], [0.09 * s, 0.7 * s, 0.09 * s], col('#5e4b3b'), [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7], L.BARK);
  const green = [col('#4f7d36'), col('#5a8a3e'), col('#46733a'), col('#638f45')];
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, d = r.range(0.2, 0.75) * s;
    S.add('ico1', [Math.cos(a) * d, (1.7 + r.range(-0.2, 0.45)) * s, Math.sin(a) * d], [0.62 * s, 0.5 * s, 0.62 * s], r.pick(green), [r(), r(), 0], L.LEAF);
  }
}

function betulla(S, r, s) {
  const white = col('#ece8df');
  S.add('cyl8', [0, 1.0 * s, 0], [0.08 * s, 2.2 * s, 0.08 * s], white, [r.range(-0.08, 0.08), 0, r.range(-0.08, 0.08)], L.PLASTER);
  for (let i = 0; i < 6; i++) S.add('box', [0, (0.3 + i * 0.32) * s, 0.075 * s], [0.1 * s, 0.03, 0.02], col('#2e2b28'), [0, r() * 3, 0], L.PLAIN);
  const green = [col('#8fb35a'), col('#9cc066'), col('#7ea64e')];
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2, d = r.range(0.1, 0.4) * s;
    S.add('ico', [Math.cos(a) * d, (1.8 + r.range(0, 0.7)) * s, Math.sin(a) * d], [0.36 * s, 0.42 * s, 0.36 * s], r.pick(green), [r(), r(), 0], L.LEAF);
  }
}

function salice(S, r, s) {
  S.add('cyl8', [0, 0.6 * s, 0], [0.16 * s, 1.4 * s, 0.16 * s], col('#6b5c47'), [0.1, 0, 0], L.BARK);
  const green = [col('#9ab85a'), col('#8aad4f'), col('#a5c264')];
  S.add('ico1', [0, 1.6 * s, 0], [0.9 * s, 0.45 * s, 0.9 * s], green[0], null, L.LEAF);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.2, d = r.range(0.55, 0.85) * s;
    const len = r.range(0.8, 1.3) * s;
    S.add('box', [Math.cos(a) * d, 1.6 * s - len / 2, Math.sin(a) * d], [0.16 * s, len, 0.05], r.pick(green), [0, -a, 0], L.LEAF);
  }
}

function cactus(S, r, s) {
  const green = col(r.pick(['#5b8a3a', '#4f7d36', '#6a9944']));
  const h = r.range(1.2, 1.9) * s;
  S.add('cyl8', [0, h / 2, 0], [0.16 * s, h, 0.16 * s], green, null, L.EVERGREEN);
  S.add('ico', [0, h, 0], [0.16 * s, 0.1 * s, 0.16 * s], green, null, L.EVERGREEN);
  for (const side of [-1, 1]) {
    if (r() < 0.3) continue;
    const y = r.range(0.4, 0.75) * h;
    S.add('cyl8', [side * 0.24 * s, y, 0], [0.1 * s, 0.1 * s, 0.1 * s], green, [0, 0, Math.PI / 2], L.EVERGREEN);
    S.add('cyl8', [side * 0.32 * s, y + 0.25 * s, 0], [0.1 * s, 0.5 * s, 0.1 * s], green, null, L.EVERGREEN);
  }
  if (r() < 0.5) S.add('octa', [0, h + 0.08 * s, 0], [0.08, 0.08, 0.08], col('#e0569f'), null, L.EVERGREEN);
}

const TREE_FN = { olive, pine, cypress, lemon, palm, abete, quercia, betulla, salice, cactus, bush, rock };
// These keep their leaves green in autumn
const EVERGREEN = new Set(['olive', 'pine', 'cypress', 'lemon', 'palm', 'abete', 'cactus']);

export function buildTree(d, opts = {}) {
  const r = rng(d.seed);
  const s = r.range(0.8, 1.25) * clamp(d.s ?? 1, 0.4, 2.5);
  const S = new GeoBuilder(EVERGREEN.has(d.type) ? L.EVERGREEN : L.LEAF);
  const rotY = d.ang ?? r() * Math.PI * 2;
  (TREE_FN[d.type] || olive)(S, r, s);
  const group = finish([[S, MAT.solid]], opts.ghost);
  const groundY = () => getHeight(d.x, d.z) - 0.05;
  group.position.set(d.x, groundY(), d.z);
  group.rotation.y = rotY;
  return {
    group,
    bounds: { x: d.x, z: d.z, r: 0.6 * s },
    solids: d.type === 'rock' ? [{ type: 'circle', x: d.x, z: d.z, r: 0.6 * s }] : [{ type: 'circle', x: d.x, z: d.z, r: 0.15 * s }],
    hitDist: (x, z) => Math.max(Math.hypot(x - d.x, z - d.z) - 0.4 * s, 0),
    groundY,
  };
}

export function buildFlower(d, opts = {}) {
  const r = rng(d.seed);
  const kind = FLOWERS[clamp(d.variant | 0, 0, FLOWERS.length - 1)];
  const S = new GeoBuilder(L.EVERGREEN);
  const k = clamp(d.s ?? 1, 0.4, 2.5);
  if (kind.spikes) {
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, rad = r.range(0, 0.3);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad, h = r.range(0.3, 0.45);
      S.add('box', [x, h / 2, z], [0.03, h, 0.03], LEAF.bush[0]);
      S.add('octa', [x, h + 0.06, z], [0.05, 0.12, 0.05], col(r.pick(kind.colors)));
    }
    S.add('ico', [0, 0.06, 0], [0.34, 0.14, 0.34], LEAF.bush[1]);
  } else {
    const blobs = r.int(2, 3);
    for (let i = 0; i < blobs; i++) {
      const a = r() * Math.PI * 2, rad = r.range(0.05, 0.25);
      S.add('ico', [Math.cos(a) * rad, 0.2, Math.sin(a) * rad], [r.range(0.22, 0.32), r.range(0.2, 0.28), r.range(0.22, 0.32)], r.pick(LEAF.bush), [r(), r() * 3, 0]);
    }
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, e = r.range(0.1, 1.2);
      S.add('octa', [Math.cos(a) * Math.cos(e) * 0.32, 0.2 + Math.sin(e) * 0.25, Math.sin(a) * Math.cos(e) * 0.32],
        [0.07, 0.07, 0.07], col(r.pick(kind.colors)), [r(), r(), 0]);
    }
  }
  const group = finish([[S, MAT.solid]], opts.ghost);
  const groundY = () => getHeight(d.x, d.z) - 0.03;
  group.position.set(d.x, groundY(), d.z);
  group.rotation.y = d.ang ?? r() * Math.PI * 2;
  group.scale.setScalar(k);
  return {
    group,
    bounds: { x: d.x, z: d.z, r: 0.4 * k },
    hitDist: (x, z) => Math.max(Math.hypot(x - d.x, z - d.z) - 0.3, 0),
    groundY,
  };
}
