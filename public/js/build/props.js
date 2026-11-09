import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder, rng, col, jitter, clamp } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, L, finish, addGlow, addLightPool } from './common.js';

export const PROP_STYLES = [
  'lampione', 'pozzo', 'panchina', 'vasi', 'fontana', 'bancarella', 'botti', 'carretto',
  'falo', 'gazebo', 'orto', 'statua', 'cristallo', 'gatto', 'pecora', 'barca',
];
export const PROP_RADIUS = {
  lampione: 0.35, pozzo: 0.75, panchina: 0.65, vasi: 0.55, barca: 1.0, fontana: 1.2, bancarella: 1.0,
  botti: 0.6, carretto: 0.9, falo: 0.6, gazebo: 1.4, orto: 1.3, statua: 0.6, cristallo: 0.7, gatto: 0.3, pecora: 0.5,
};

function lampione(ctx) {
  const { S, Lmp, group, ghost } = ctx;
  S.add('box', [0, 0.1, 0], [0.26, 0.2, 0.26], PAL.iron, null, L.PLAIN);
  S.add('cyl8', [0, 1.0, 0], [0.045, 1.7, 0.045], PAL.iron, null, L.PLAIN);
  S.add('box', [0.18, 1.82, 0], [0.4, 0.04, 0.04], PAL.iron, null, L.PLAIN);
  S.add('pyr4', [0.36, 1.82, 0], [0.24, 0.12, 0.24], PAL.iron, null, L.PLAIN);
  Lmp.add('box', [0.36, 1.66, 0], [0.16, 0.22, 0.16], PAL.white);
  S.add('box', [0.36, 1.54, 0], [0.2, 0.03, 0.2], PAL.iron, null, L.PLAIN);
  addGlow(group, 0.36, 1.66, 0, 1.5, ghost);
  addLightPool(group, 0.36, 0.06, 0, 2.2, ghost);
}

function pozzo(ctx) {
  const { S, r } = ctx;
  const stone = jitter(PAL.stone, r, 0.05);
  S.add('cyl12', [0, 0.3, 0], [0.58, 0.8, 0.58], stone, null, L.STONE);
  S.add('cyl12', [0, 0.72, 0], [0.64, 0.08, 0.64], PAL.stoneLight, null, L.ASHLAR);
  S.add('cyl12', [0, 0.69, 0], [0.46, 0.04, 0.46], col('#2f4a5c'), null, L.PLAIN);
  for (const sx of [-1, 1]) S.add('box', [sx * 0.5, 1.1, 0], [0.09, 0.8, 0.09], PAL.wood, null, L.WOOD);
  S.add('cyl8', [0, 1.3, 0], [0.04, 1.05, 0.04], PAL.woodLight, [0, 0, Math.PI / 2], L.WOOD);
  S.add('box', [0, 1.62, 0.2], [1.2, 0.04, 0.48], PAL.terracotta[0], [-0.45, 0, 0], L.TILE);
  S.add('box', [0, 1.62, -0.2], [1.2, 0.04, 0.48], PAL.terracotta[1], [0.45, 0, 0], L.TILE);
  S.add('cyl8', [0.08, 1.02, 0], [0.09, 0.16, 0.09], PAL.woodLight, null, L.WOOD);
}

function panchina(ctx) {
  const { S, r } = ctx;
  const wood = jitter(PAL.woodLight, r, 0.06);
  for (const sx of [-0.45, 0.45]) S.add('box', [sx, 0.2, 0], [0.1, 0.4, 0.36], PAL.stoneLight, null, L.ASHLAR);
  for (const z of [-0.1, 0.02, 0.14]) S.add('box', [0, 0.42, z], [1.15, 0.04, 0.1], wood, null, L.WOOD);
  for (const y of [0.6, 0.76]) S.add('box', [0, y, -0.17], [1.15, 0.09, 0.03], wood, [0.15, 0, 0], L.WOOD);
  for (const sx of [-0.45, 0.45]) S.add('box', [sx, 0.6, -0.18], [0.06, 0.4, 0.04], PAL.iron, [0.15, 0, 0], L.PLAIN);
}

function vasi(ctx) {
  const { S, r } = ctx;
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, rad = i === 0 ? 0 : r.range(0.22, 0.38);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const s = r.range(0.7, 1.2);
    S.add('cyl8', [x, 0.13 * s, z], [0.13 * s, 0.26 * s, 0.13 * s], jitter(PAL.pot, r, 0.08), null, L.BRICK);
    S.add('cyl8', [x, 0.27 * s, z], [0.15 * s, 0.04, 0.15 * s], PAL.pot.clone().multiplyScalar(0.85), null, L.BRICK);
    if (r() < 0.3) {
      S.add('cyl8', [x, 0.45 * s, z], [0.02, 0.3 * s, 0.02], PAL.wood, null, L.BARK);
      S.add('ico', [x, 0.66 * s, z], [0.2 * s, 0.2 * s, 0.2 * s], PAL.leaf[1], null, L.LEAF);
      for (let k = 0; k < 4; k++) S.add('octa', [x + r.range(-0.15, 0.15) * s, 0.66 * s + r.range(-0.1, 0.12), z + r.range(-0.15, 0.15) * s], [0.05, 0.06, 0.05], col('#f5d33a'), null, L.PLAIN);
    } else {
      S.add('ico', [x, 0.36 * s, z], [0.16 * s, 0.13 * s, 0.16 * s], r.pick(PAL.leaf), null, L.LEAF);
      const bloom = r.pick(PAL.bloom);
      for (let k = 0; k < 5; k++) S.add('octa', [x + r.range(-0.12, 0.12) * s, 0.42 * s, z + r.range(-0.12, 0.12) * s], [0.05, 0.05, 0.05], bloom, null, L.LEAF);
    }
  }
}

function fontana(ctx) {
  const { S, W, r, group, anim, ghost } = ctx;
  const stone = jitter(PAL.stoneLight, r, 0.04);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    S.add('box', [Math.cos(a) * 1.0, 0.25, Math.sin(a) * 1.0], [0.8, 0.5, 0.2], stone, [0, -a + Math.PI / 2, 0], L.ASHLAR);
  }
  S.add('cyl16', [0, 0.05, 0], [1.0, 0.1, 1.0], stone, null, L.ASHLAR);
  W.add('cyl16', [0, 0.38, 0], [0.95, 0.04, 0.95], PAL.white);
  S.add('cyl8', [0, 0.7, 0], [0.16, 1.2, 0.16], stone, null, L.ASHLAR);
  S.add('cyl12', [0, 1.1, 0], [0.48, 0.12, 0.48], stone, null, L.ASHLAR);
  W.add('cyl12', [0, 1.17, 0], [0.42, 0.03, 0.42], PAL.white);
  S.add('ico', [0, 1.35, 0], [0.12, 0.18, 0.12], stone, null, L.ASHLAR);
  if (!ghost) {
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 8, 1, true), MAT.water);
    jet.position.y = 1.65;
    jet.rotation.x = Math.PI;
    group.add(jet);
    const ph = r() * 10;
    anim.push((t) => { jet.scale.y = 0.85 + Math.sin(t * 6 + ph) * 0.15; });
  }
}

function bancarella(ctx) {
  const { S, r } = ctx;
  const colors = r.pick([['#c8202e', '#f6f3ec'], ['#2f6fa8', '#f6f3ec'], ['#3d8a5a', '#f2e6c8'], ['#e0a526', '#f6f3ec']]).map(col);
  S.add('box', [0, 0.45, 0], [1.4, 0.08, 0.7], PAL.woodLight, null, L.WOOD);
  for (const [x, z] of [[-0.65, 0.3], [0.65, 0.3], [-0.65, -0.3], [0.65, -0.3]]) S.add('box', [x, 0.75, z], [0.06, 1.5, 0.06], PAL.wood, null, L.WOOD);
  for (let k = 0; k < 7; k++) S.add('box', [-0.6 + k * 0.2, 1.55, 0.05], [0.2, 0.04, 0.95], colors[k % 2], [0.25, 0, 0], L.PLAIN);
  const fruit = ['#f5a623', '#e0473c', '#f5d33a', '#7cb342', '#8e44ad'].map(col);
  for (let c = 0; c < 3; c++) {
    S.add('box', [-0.45 + c * 0.45, 0.56, 0.05], [0.38, 0.14, 0.4], PAL.woodLight, null, L.WOOD);
    const f = r.pick(fruit);
    for (let k = 0; k < 6; k++) S.add('ico', [-0.45 + c * 0.45 + r.range(-0.13, 0.13), 0.66, 0.05 + r.range(-0.13, 0.13)], [0.06, 0.06, 0.06], f, null, L.PLAIN);
  }
}

function botti(ctx) {
  const { S, r } = ctx;
  const spots = [[0, 0, 0], [0.55, 0, 0.1], [0.27, 0.62, 0.05]];
  for (const [x, y, z] of spots) {
    S.add('cyl12', [x, y + 0.3, z], [0.27, 0.6, 0.27], jitter(PAL.woodLight, r, 0.06), null, L.WOOD);
    for (const h of [0.08, 0.52]) S.add('cyl12', [x, y + h, z], [0.285, 0.05, 0.285], PAL.iron, null, L.PLAIN);
  }
}

function carretto(ctx) {
  const { S, r } = ctx;
  S.add('box', [0, 0.55, 0], [1.3, 0.1, 0.8], PAL.woodLight, null, L.WOOD);
  for (const sz of [-1, 1]) S.add('box', [0, 0.72, sz * 0.38], [1.3, 0.25, 0.05], PAL.wood, null, L.WOOD);
  S.add('box', [-0.63, 0.72, 0], [0.05, 0.25, 0.8], PAL.wood, null, L.WOOD);
  for (const sz of [-1, 1]) {
    S.add('cyl12', [0.15, 0.35, sz * 0.48], [0.35, 0.06, 0.35], PAL.wood, [Math.PI / 2, 0, 0], L.WOOD);
    S.add('cyl8', [0.15, 0.35, sz * 0.5], [0.07, 0.08, 0.07], PAL.iron, [Math.PI / 2, 0, 0], L.PLAIN);
  }
  for (const sz of [-1, 1]) S.add('box', [1.05, 0.5, sz * 0.25], [0.9, 0.05, 0.05], PAL.wood, [0, 0, -0.15], L.WOOD);
  for (let k = 0; k < 5; k++) S.add('ico', [r.range(-0.4, 0.4), 0.72, r.range(-0.2, 0.2)], [0.16, 0.14, 0.16], col('#d4b064'), [r(), r(), 0], L.LEAF);
}

function falo(ctx) {
  const { S, r, group, anim, ghost } = ctx;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    S.add('dode', [Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45], [0.12, 0.1, 0.12], jitter(PAL.stoneDark, r, 0.1), [r(), r(), 0], L.ROCK);
  }
  for (let i = 0; i < 4; i++) S.add('cyl8', [0, 0.12, 0], [0.05, 0.6, 0.05], PAL.wood, [1.2, (i / 4) * Math.PI, 0], L.BARK);
  if (ghost) return;
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.03, 0.55 - i * 0.1, 7), MAT.fire);
    f.position.set((i - 1) * 0.06, 0.35, (i % 2) * 0.05);
    group.add(f);
    flames.push(f);
  }
  // The fire glows day and night
  const glow = new THREE.Sprite(MAT.glow.clone());
  glow.material.color.set('#ffb35c');
  glow.position.y = 0.45;
  glow.scale.setScalar(2.2);
  group.add(glow);
  addLightPool(group, 0, 0.05, 0, 2.6, false);
  const ph = r() * 10;
  anim.push((t) => {
    glow.material.opacity = 0.55 + Math.sin(t * 11 + ph) * 0.12;
    flames.forEach((f, i) => {
      f.scale.y = 0.8 + Math.sin(t * 9 + ph + i * 2) * 0.25;
      f.scale.x = f.scale.z = 0.9 + Math.sin(t * 7 + i) * 0.1;
    });
  });
}

function gazebo(ctx) {
  const { S, r } = ctx;
  const n = 6, R = 1.15;
  S.add('cyl12', [0, 0.08, 0], [R + 0.15, 0.16, R + 0.15], PAL.stoneLight, null, L.ASHLAR);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    S.add('cyl8', [Math.cos(a) * R, 0.9, Math.sin(a) * R], [0.06, 1.5, 0.06], PAL.white, null, L.WOOD);
    if (i) S.add('box', [Math.cos(a + Math.PI / n) * R * 0.87, 0.45, Math.sin(a + Math.PI / n) * R * 0.87], [R, 0.05, 0.05], PAL.white, [0, -a - Math.PI / n + Math.PI / 2, 0], L.WOOD);
  }
  S.add(new THREE.ConeGeometry(R + 0.3, 0.8, n, 1).toNonIndexed(), [0, 2.05, 0], [1, 1, 1], r() < 0.5 ? col('#3f5fa8') : col('#5c9c86'), null, L.SLATE);
  S.add('ico', [0, 2.5, 0], [0.08, 0.1, 0.08], PAL.gold, null, L.PLAIN);
}

function orto(ctx) {
  const { S, r } = ctx;
  S.add('box', [0, 0.05, 0], [2.2, 0.14, 1.6], col('#6b4f36'), null, L.DIRT);
  for (const [x, z, sx, sz] of [[0, 0.82, 2.3, 0.06], [0, -0.82, 2.3, 0.06], [1.12, 0, 0.06, 1.6], [-1.12, 0, 0.06, 1.6]]) S.add('box', [x, 0.12, z], [sx, 0.22, sz], PAL.wood, null, L.WOOD);
  const crops = [['#4f8a3a', '#e0473c'], ['#5a9a3e', null], ['#3d7a35', '#f5a623'], ['#6aa548', '#8e44ad']];
  for (let row = 0; row < 4; row++) {
    const [leaf, fruit] = r.pick(crops);
    for (let k = 0; k < 6; k++) {
      const x = -0.85 + k * 0.34, z = -0.55 + row * 0.37;
      S.add('ico', [x, 0.2, z], [0.12, 0.12, 0.12], col(leaf), [r(), r(), 0], L.LEAF);
      if (fruit && r() < 0.6) S.add('ico', [x + 0.05, 0.22, z + 0.04], [0.045, 0.045, 0.045], col(fruit), null, L.PLAIN);
    }
  }
  S.add('box', [1.05, 0.55, 0.9], [0.06, 1.1, 0.06], PAL.wood, null, L.WOOD);
  S.add('box', [1.05, 0.95, 0.9], [0.5, 0.05, 0.05], PAL.wood, null, L.WOOD);
  S.add('ico', [1.05, 1.2, 0.9], [0.12, 0.14, 0.12], col('#d4b064'), null, L.LEAF);
}

// A calm stone figure on a pedestal (original, abstract shapes).
function statua(ctx) {
  const { S, r } = ctx;
  const stone = jitter(col('#e8e2d6'), r, 0.03);
  S.add('box', [0, 0.3, 0], [0.8, 0.6, 0.8], PAL.stoneLight, null, L.ASHLAR);
  S.add('box', [0, 0.65, 0], [0.9, 0.1, 0.9], PAL.stoneLight, null, L.ASHLAR);
  S.add('cone8', [0, 1.2, 0], [0.32, 1.0, 0.32], stone, null, L.PLASTER);
  S.add('ico1', [0, 1.85, 0], [0.16, 0.19, 0.16], stone, null, L.PLASTER);
  S.add('box', [0.18, 1.45, 0.05], [0.08, 0.5, 0.08], stone, [0, 0, -0.6], L.PLASTER);
  S.add('box', [-0.2, 1.35, 0.05], [0.08, 0.4, 0.08], stone, [0, 0, 0.4], L.PLASTER);
  S.add('ico', [0.36, 1.68, 0.05], [0.09, 0.09, 0.09], PAL.gold, null, L.PLAIN);
}

function cristallo(ctx) {
  const { S, C, r, group, ghost, anim } = ctx;
  for (let i = 0; i < 5; i++) S.add('dode', [r.range(-0.4, 0.4), 0.08, r.range(-0.4, 0.4)], [0.2, 0.12, 0.2], jitter(PAL.stoneDark, r, 0.1), [r(), r(), 0], L.ROCK);
  const n = r.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = i ? r.range(0.12, 0.35) : 0;
    const h = i ? r.range(0.4, 0.8) : r.range(0.9, 1.3);
    C.add('octa', [Math.cos(a) * rad, h / 2, Math.sin(a) * rad], [0.13, h / 2, 0.13], PAL.white, [r.range(-0.3, 0.3), r() * 3, r.range(-0.3, 0.3)]);
  }
  if (!ghost) {
    const s = new THREE.Sprite(MAT.glow.clone());
    s.material.color.set('#7fe3ff');
    s.material.opacity = 0.6;
    s.position.y = 0.6;
    s.scale.setScalar(2.2);
    group.add(s);
    const ph = r() * 10;
    anim.push((t) => { s.material.opacity = 0.45 + Math.sin(t * 2 + ph) * 0.2; });
  }
}

// Little animals: a sitting cat and a sheep (simple blocky shapes).
function gatto(ctx) {
  const { S, r, group, anim } = ctx;
  const fur = col(r.pick(['#3b3a3a', '#d98e4a', '#f2efe8', '#8a7f72']));
  S.add('box', [0, 0.15, 0], [0.18, 0.22, 0.3], fur, [-0.3, 0, 0], L.PLAIN);
  S.add('box', [0, 0.32, 0.12], [0.16, 0.14, 0.14], fur, null, L.PLAIN);
  for (const sx of [-1, 1]) S.add('pyr4', [sx * 0.05, 0.42, 0.12], [0.05, 0.07, 0.04], fur, null, L.PLAIN);
  for (const sx of [-1, 1]) S.add('box', [sx * 0.035, 0.34, 0.19], [0.02, 0.02, 0.01], col('#9be36b'), null, L.PLAIN);
  const tail = new GeoBuilder(L.PLAIN);
  tail.add('box', [0, 0, -0.12], [0.04, 0.04, 0.24], fur, null);
  const t = finish([[tail, MAT.solid]], ctx.ghost).children[0];
  t.position.set(0, 0.06, -0.12);
  group.add(t);
  const ph = r() * 10;
  anim.push((time) => { t.rotation.y = Math.sin(time * 2.2 + ph) * 0.6; });
}

function pecora(ctx) {
  const { S, r, group, anim } = ctx;
  const wool = col('#f1ece2'), dark = col('#3b3a3a');
  S.add('ico1', [0, 0.42, 0], [0.32, 0.26, 0.42], wool, null, L.LEAF);
  for (const [x, z] of [[-0.14, 0.2], [0.14, 0.2], [-0.14, -0.2], [0.14, -0.2]]) S.add('box', [x, 0.12, z], [0.06, 0.26, 0.06], dark, null, L.PLAIN);
  const head = new GeoBuilder(L.PLAIN);
  head.add('box', [0, 0, 0.1], [0.16, 0.16, 0.22], dark, null);
  head.add('ico', [0, 0.08, 0.02], [0.13, 0.08, 0.1], wool, null, L.LEAF);
  const h = finish([[head, MAT.solid]], ctx.ghost).children[0];
  h.position.set(0, 0.5, 0.36);
  group.add(h);
  const ph = r() * 10;
  anim.push((t) => { h.rotation.x = 0.3 + Math.max(0, Math.sin(t * 0.7 + ph)) * 0.6; });
}

const HULLS = ['#2f6fa8', '#3d8a5a', '#c0392b', '#e0a526', '#1f4f7a'];
function barca(ctx) {
  const { S, r } = ctx;
  const white = col('#f4f1ea'), st = col(r.pick(HULLS));
  const hull = r() < 0.5 ? white : st;
  const stripe = hull === white ? st : white;
  S.layer = L.WOOD;
  S.add('box', [0, 0.1, 0], [1.7, 0.32, 0.72], hull);
  S.add('box', [0.85, 0.1, 0], [0.51, 0.32, 0.51], hull, [0, Math.PI / 4, 0]);
  S.add('box', [0, 0.23, 0], [1.72, 0.07, 0.74], stripe);
  S.add('box', [0.85, 0.23, 0], [0.53, 0.07, 0.53], stripe, [0, Math.PI / 4, 0]);
  S.add('box', [-0.05, 0.27, 0], [1.4, 0.04, 0.56], PAL.woodLight);
  S.add('box', [-0.2, 0.36, 0], [0.18, 0.16, 0.56], PAL.woodLight);
  S.add('box', [-0.9, 0.3, 0], [0.12, 0.3, 0.12], PAL.iron, null, L.PLAIN);
  if (r() < 0.5) {
    S.add('cyl8', [0.35, 0.95, 0], [0.03, 1.4, 0.03], PAL.wood);
    S.add('box', [0.15, 0.9, 0], [0.04, 0.9, 0.5], PAL.white, [0, Math.PI / 2, 0.15], L.PLAIN);
  }
}

const STYLE_FN = { lampione, pozzo, panchina, vasi, fontana, bancarella, botti, carretto, falo, gazebo, orto, statua, cristallo, gatto, pecora, barca };

export function propRadius(d) {
  return (PROP_RADIUS[d.style] ?? 0.5) * clamp(d.s ?? 1, 0.4, 2.5);
}

export function buildProp(d, opts = {}) {
  const style = STYLE_FN[d.style] ? d.style : 'lampione';
  const r = rng(d.seed);
  const k = clamp(d.s ?? 1, 0.4, 2.5);
  const holder = [];
  const ctx = {
    S: new GeoBuilder(L.PLAIN), Lmp: new GeoBuilder(), W: new GeoBuilder(), C: new GeoBuilder(),
    r, ghost: opts.ghost, anim: [], group: { add: (o) => holder.push(o) },
  };
  STYLE_FN[style](ctx);
  const group = finish([[ctx.S, MAT.solid], [ctx.Lmp, MAT.lamp], [ctx.W, MAT.water], [ctx.C, MAT.crystal]], opts.ghost);
  const inner = new THREE.Group();
  for (const c of [...group.children]) inner.add(c);
  for (const c of holder) inner.add(c);
  inner.scale.setScalar(k);
  group.add(inner);
  const water = style === 'barca';
  const groundY = () => (water ? 0 : getHeight(d.x, d.z) - 0.02);
  group.position.set(d.x, groundY(), d.z);
  group.rotation.y = d.ang || 0;
  const R = propRadius({ ...d, style });
  if (water) {
    const ph = r() * 10, base = group.rotation.y;
    ctx.anim.push((t) => {
      group.position.y = Math.sin(t * 1.3 + ph) * 0.05 - 0.02;
      group.rotation.z = Math.sin(t * 1.1 + ph) * 0.05;
      group.rotation.x = Math.sin(t * 0.9 + ph * 2) * 0.03;
      group.rotation.y = base + Math.sin(t * 0.2 + ph) * 0.12;
    });
  }
  const small = style === 'gatto' || style === 'vasi';
  return {
    group,
    bounds: { x: d.x, z: d.z, r: R + 0.3 },
    solids: small ? [] : [{ type: 'circle', x: d.x, z: d.z, r: Math.max(R * 0.8, 0.2) }],
    animate: ctx.anim.length ? (t) => ctx.anim.forEach((f) => f(t)) : null,
    hitDist: (x, z) => Math.max(Math.hypot(x - d.x, z - d.z) - R + 0.1, 0),
    groundY,
  };
}
