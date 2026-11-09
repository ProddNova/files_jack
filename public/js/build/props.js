import { GeoBuilder, rng, col, jitter } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, finish, addGlow, addLightPool } from './common.js';

export const PROP_STYLES = ['lampione', 'pozzo', 'panchina', 'vasi', 'barca'];
export const PROP_RADIUS = { lampione: 0.35, pozzo: 0.75, panchina: 0.65, vasi: 0.55, barca: 1.0 };

function lampione(ctx) {
  const { S, Lmp, group, ghost } = ctx;
  S.add('box', [0, 0.1, 0], [0.26, 0.2, 0.26], PAL.iron);
  S.add('cyl8', [0, 1.0, 0], [0.045, 1.7, 0.045], PAL.iron);
  S.add('box', [0.18, 1.82, 0], [0.4, 0.04, 0.04], PAL.iron);
  S.add('pyr4', [0.36, 1.82, 0], [0.24, 0.12, 0.24], PAL.iron);
  Lmp.add('box', [0.36, 1.66, 0], [0.16, 0.22, 0.16], PAL.white);
  S.add('box', [0.36, 1.54, 0], [0.2, 0.03, 0.2], PAL.iron);
  addGlow(group, 0.36, 1.66, 0, 1.5, ghost);
  addLightPool(group, 0.36, 0.06, 0, 2.2, ghost);
}

function pozzo(ctx) {
  const { S, r } = ctx;
  const stone = jitter(PAL.stone, r, 0.05);
  S.add('cyl12', [0, 0.3, 0], [0.58, 0.8, 0.58], stone);
  S.add('cyl12', [0, 0.72, 0], [0.64, 0.08, 0.64], PAL.stoneLight);
  S.add('cyl12', [0, 0.69, 0], [0.46, 0.04, 0.46], col('#2f4a5c'));
  for (const sx of [-1, 1]) S.add('box', [sx * 0.5, 1.1, 0], [0.09, 0.8, 0.09], PAL.wood);
  S.add('cyl8', [0, 1.3, 0], [0.04, 1.05, 0.04], PAL.woodLight, [0, 0, Math.PI / 2]);
  S.add('box', [0, 1.62, 0.2], [1.2, 0.04, 0.48], PAL.terracotta[0], [-0.45, 0, 0]);
  S.add('box', [0, 1.62, -0.2], [1.2, 0.04, 0.48], PAL.terracotta[1], [0.45, 0, 0]);
  S.add('cyl8', [0.08, 1.02, 0], [0.09, 0.16, 0.09], PAL.woodLight);
}

function panchina(ctx) {
  const { S, r } = ctx;
  const wood = jitter(PAL.woodLight, r, 0.06);
  for (const sx of [-0.45, 0.45]) S.add('box', [sx, 0.2, 0], [0.1, 0.4, 0.36], PAL.stoneLight);
  for (const z of [-0.1, 0.02, 0.14]) S.add('box', [0, 0.42, z], [1.15, 0.04, 0.1], wood);
  for (const y of [0.6, 0.76]) S.add('box', [0, y, -0.17], [1.15, 0.09, 0.03], wood, [0.15, 0, 0]);
  for (const sx of [-0.45, 0.45]) S.add('box', [sx, 0.6, -0.18], [0.06, 0.4, 0.04], PAL.iron, [0.15, 0, 0]);
}

function vasi(ctx) {
  const { S, r } = ctx;
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, rad = i === 0 ? 0 : r.range(0.22, 0.38);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const s = r.range(0.7, 1.2);
    S.add('cyl8', [x, 0.13 * s, z], [0.13 * s, 0.26 * s, 0.13 * s], jitter(PAL.pot, r, 0.08));
    S.add('cyl8', [x, 0.27 * s, z], [0.15 * s, 0.04, 0.15 * s], PAL.pot.clone().multiplyScalar(0.85));
    if (r() < 0.3) {
      S.add('cyl8', [x, 0.45 * s, z], [0.02, 0.3 * s, 0.02], PAL.wood);
      S.add('ico', [x, 0.66 * s, z], [0.2 * s, 0.2 * s, 0.2 * s], PAL.leaf[1]);
      for (let k = 0; k < 4; k++) S.add('octa', [x + r.range(-0.15, 0.15) * s, 0.66 * s + r.range(-0.1, 0.12), z + r.range(-0.15, 0.15) * s], [0.05, 0.06, 0.05], col('#f5d33a'));
    } else {
      S.add('ico', [x, 0.36 * s, z], [0.16 * s, 0.13 * s, 0.16 * s], r.pick(PAL.leaf));
      const bloom = r.pick(PAL.bloom);
      for (let k = 0; k < 5; k++) S.add('octa', [x + r.range(-0.12, 0.12) * s, 0.42 * s, z + r.range(-0.12, 0.12) * s], [0.05, 0.05, 0.05], bloom);
    }
  }
}

const HULLS = ['#2f6fa8', '#3d8a5a', '#c0392b', '#e0a526', '#1f4f7a'];
function barca(ctx) {
  const { S, r } = ctx;
  const white = col('#f4f1ea'), st = col(r.pick(HULLS));
  const hull = r() < 0.5 ? white : st;
  const stripe = hull === white ? st : white;
  S.add('box', [0, 0.1, 0], [1.7, 0.32, 0.72], hull);
  S.add('box', [0.85, 0.1, 0], [0.51, 0.32, 0.51], hull, [0, Math.PI / 4, 0]);
  S.add('box', [0, 0.23, 0], [1.72, 0.07, 0.74], stripe);
  S.add('box', [0.85, 0.23, 0], [0.53, 0.07, 0.53], stripe, [0, Math.PI / 4, 0]);
  S.add('box', [-0.05, 0.27, 0], [1.4, 0.04, 0.56], PAL.woodLight);
  S.add('box', [-0.2, 0.36, 0], [0.18, 0.16, 0.56], PAL.woodLight);
  S.add('box', [-0.9, 0.3, 0], [0.12, 0.3, 0.12], PAL.iron);
  if (r() < 0.5) {
    S.add('cyl8', [0.35, 0.95, 0], [0.03, 1.4, 0.03], PAL.wood);
    S.add('box', [0.15, 0.9, 0], [0.04, 0.9, 0.5], PAL.white, [0, Math.PI / 2, 0.15]);
  }
}

const STYLE_FN = { lampione, pozzo, panchina, vasi, barca };

export function buildProp(d, opts = {}) {
  const style = STYLE_FN[d.style] ? d.style : 'lampione';
  const r = rng(d.seed);
  const ctx = { S: new GeoBuilder(), Lmp: new GeoBuilder(), r, ghost: opts.ghost, group: null };
  const holder = { children: [] };
  ctx.group = { add: (o) => holder.children.push(o) };
  STYLE_FN[style](ctx);
  const group = finish([[ctx.S, MAT.solid], [ctx.Lmp, MAT.lamp]], opts.ghost);
  for (const c of holder.children) group.add(c);
  const water = style === 'barca';
  const groundY = () => (water ? 0 : getHeight(d.x, d.z) - 0.02);
  group.position.set(d.x, groundY(), d.z);
  group.rotation.y = d.ang || 0;
  const R = PROP_RADIUS[style];
  let animate = null;
  if (water) {
    const ph = r() * 10, base = group.rotation.y;
    animate = (t) => {
      group.position.y = Math.sin(t * 1.3 + ph) * 0.05 - 0.02;
      group.rotation.z = Math.sin(t * 1.1 + ph) * 0.05;
      group.rotation.x = Math.sin(t * 0.9 + ph * 2) * 0.03;
      group.rotation.y = base + Math.sin(t * 0.2 + ph) * 0.12;
    };
  }
  return {
    group,
    bounds: { x: d.x, z: d.z, r: R + 0.3 },
    hitDist: (x, z) => Math.max(Math.hypot(x - d.x, z - d.z) - R + 0.1, 0),
    groundY,
    animate,
  };
}
