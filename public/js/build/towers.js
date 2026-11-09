import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder, rng, col, jitter, taperedCylinder } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, finish, addGlow } from './common.js';

export const TOWER_STYLES = ['saracena', 'quadrata', 'campanile', 'faro'];
export const TOWER_RADIUS = { saracena: 1.35, quadrata: 1.25, campanile: 0.95, faro: 1.1 };

const STONES = ['#cdb898', '#b9b3a6', '#d4b483', '#c2ad8f'];

function flagMesh(ghost, r) {
  const F = new GeoBuilder();
  F.add('box', [0.4, 0, 0], [0.76, 0.48, 0.02], PAL.white);
  F.add('box', [0.4, 0, 0], [0.76, 0.1, 0.035], PAL.red);
  F.add('box', [0.4, 0, 0], [0.1, 0.48, 0.035], PAL.red);
  const g = finish([[F, MAT.solid]], ghost);
  const m = g.children[0];
  m.userData.phase = r() * 10;
  return m;
}

function slit(B, a, rr, y, w = 0.14, h = 0.48) {
  B.add('box', [Math.cos(a) * rr, y, Math.sin(a) * rr], [w, h, 0.12], PAL.white, [0, -a + Math.PI / 2, 0]);
}

function saracena(ctx, yb) {
  const { S, L, D, r } = ctx;
  const H = r.range(4.2, 6.2);
  const R = r.range(1.0, 1.25);
  const stone = jitter(col(r.pick(STONES)), r, 0.04);
  const top = r();
  const rTop = R * 0.84;
  const radAt = (y) => R + (rTop - R) * ((y - yb) / (H - yb));
  S.add(taperedCylinder(rTop, R, 14), [0, (yb + H) / 2, 0], [1, H - yb, 1], stone);
  if (r() < 0.6) S.add(taperedCylinder(R, R * 1.25, 14), [0, (yb + 1.3) / 2, 0], [1, 1.3 - yb, 1], stone.clone().multiplyScalar(0.94));
  const band = H * r.range(0.55, 0.7);
  S.add('cyl16', [0, band, 0], [radAt(band) + 0.07, 0.14, radAt(band) + 0.07], PAL.stoneLight);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    S.add('box', [Math.cos(a) * rTop * 1.05, H - 0.12, Math.sin(a) * rTop * 1.05], [0.2, 0.26, 0.2], stone, [0, -a, 0]);
  }
  S.add('cyl16', [0, H + 0.27, 0], [rTop * 1.2, 0.55, rTop * 1.2], jitter(stone, r, 0.04));
  let roofTop = H + 0.55;
  if (top < 0.2) {
    S.add('cone12', [0, H + 1.15, 0], [rTop * 1.3, 1.3, rTop * 1.3], r.pick(PAL.terracotta));
    roofTop = H + 1.8;
  } else {
    const n = 7, ruined = top > 0.85;
    for (let i = 0; i < n; i++) {
      if (ruined && r() < 0.35) continue;
      const a = (i / n) * Math.PI * 2 + 0.26;
      const mh = ruined ? r.range(0.15, 0.45) : 0.42;
      S.add('box', [Math.cos(a) * rTop * 1.04, H + 0.55 + mh / 2, Math.sin(a) * rTop * 1.04], [0.3, mh, 0.42], stone, [0, -a, 0]);
    }
  }
  const doorY = 1.55;
  const dr = radAt(doorY);
  S.add('box', [0, doorY, dr - 0.02], [0.5, 0.85, 0.1], PAL.door);
  S.add('arch', [0, doorY + 0.42, dr - 0.02], [0.25, 0.2, 0.1], PAL.door);
  S.add('box', [0, doorY - 0.47, dr + 0.08], [0.62, 0.08, 0.28], PAL.stoneLight);
  for (let s = 0; s < 4; s++) S.add('box', [0, 0.12 + s * 0.27, dr + 0.65 - s * 0.14], [0.55, 0.08, 0.22], PAL.wood);
  for (const [a, f] of [[1.7, 0.45], [3.6, 0.5], [5.2, 0.42], [0.6, 0.82], [2.9, 0.84], [4.5, 0.8]]) {
    slit(r() < 0.5 ? L : D, a, radAt(H * f), H * f);
  }
  return { top: roofTop, flagAt: top >= 0.2 && top <= 0.85 && r() < 0.7 ? H + 0.55 : null };
}

function quadrata(ctx, yb) {
  const { S, L, D, r } = ctx;
  const H = r.range(4.5, 6.6);
  const s = r.range(1.7, 2.1);
  const stone = jitter(col(r.pick(STONES)), r, 0.05);
  const light = stone.clone().lerp(PAL.white, 0.35);
  S.add('box', [0, (yb + H) / 2, 0], [s, H - yb, s], stone);
  // Corner stones, alternating long and short
  for (let y = 0.15, k = 0; y < H - 0.2; y += 0.32, k++) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = k % 2 ? 0.36 : 0.2, lz = k % 2 ? 0.2 : 0.36;
      S.add('box', [sx * (s / 2 - lx / 2 + 0.02), y, sz * (s / 2 - lz / 2 + 0.02)], [lx, 0.24, lz], light);
    }
  }
  S.add('box', [0, H * 0.6, 0], [s + 0.12, 0.14, s + 0.12], light);
  const faces = [[0, s / 2], [Math.PI, -s / 2], [Math.PI / 2, s / 2], [-Math.PI / 2, -s / 2]];
  for (const [rot, off] of faces) {
    const along = Math.abs(rot) === Math.PI / 2;
    const at = (u, y, o) => (along ? [off + Math.sign(off) * o, y, u] : [u, y, off + Math.sign(off) * o]);
    for (const [y, pair] of [[H * 0.42, false], [H * 0.78, true]]) {
      for (const u of pair ? [-0.22, 0.22] : [0]) {
        const B = r() < 0.5 ? L : D;
        B.add('box', at(u, y, 0.02), [0.26, 0.5, 0.06], PAL.white, [0, rot, 0]);
        B.add('arch', at(u, y + 0.25, 0.02), [0.13, 0.12, 0.06], PAL.white, [0, rot, 0]);
      }
      if (pair) S.add('box', at(0, H * 0.78, 0.03), [0.06, 0.62, 0.06], light, [0, rot, 0]);
    }
  }
  S.add('box', [0, 0.6, s / 2 + 0.02], [0.6, 1.0, 0.08], PAL.door);
  S.add('arch', [0, 1.1, s / 2 + 0.02], [0.3, 0.25, 0.08], PAL.door);
  let roofTop;
  if (r() < 0.5) {
    S.add('box', [0, H + 0.08, 0], [s + 0.3, 0.16, s + 0.3], light);
    S.add('pyr4', [0, H + 0.7, 0], [s + 0.45, 1.2, s + 0.45], r.pick(PAL.terracotta));
    roofTop = H + 1.3;
  } else {
    S.add('box', [0, H - 0.1, 0], [s + 0.24, 0.2, s + 0.24], stone);
    const n = 4;
    for (const [rot, off] of faces) {
      for (let k = 0; k < n; k++) {
        const u = -s / 2 + 0.16 + (k * (s - 0.32)) / (n - 1);
        const along = Math.abs(rot) === Math.PI / 2;
        const p = along ? [off + Math.sign(off) * 0.08, H + 0.32, u] : [u, H + 0.32, off + Math.sign(off) * 0.08];
        S.add('box', p, [0.3, 0.44, 0.22], stone, [0, rot, 0]);
      }
    }
    roofTop = H + 0.55;
  }
  return { top: roofTop, flagAt: roofTop < H + 1 && r() < 0.6 ? H + 0.1 : null };
}

function campanile(ctx, yb) {
  const { S, r } = ctx;
  const H = r.range(6.5, 8.5);
  const s = r.range(1.2, 1.5);
  const brick = r() < 0.5;
  const body = brick ? jitter(col('#b5654a'), r, 0.05) : jitter(col('#e9dcc0'), r, 0.04);
  const trim = brick ? col('#e8dcc4') : PAL.stoneLight;
  const bel = H - 1.2;
  S.add('box', [0, (yb + bel) / 2, 0], [s, bel - yb, s], body);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.add('box', [sx * (s / 2 - 0.06), bel / 2, sz * (s / 2 - 0.06)], [0.16, bel, 0.16], body.clone().multiplyScalar(0.9));
  }
  for (const y of [bel * 0.35, bel * 0.7, bel]) S.add('box', [0, y, 0], [s + 0.12, 0.1, s + 0.12], trim);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.add('box', [sx * (s / 2 - 0.11), bel + 0.6, sz * (s / 2 - 0.11)], [0.22, 1.2, 0.22], body);
  }
  S.add('box', [0, H + 0.06, 0], [s + 0.16, 0.14, s + 0.16], trim);
  S.add('box', [0, H - 0.12, 0], [s, 0.22, s], body);
  S.add('ico1', [0, bel + 0.5, 0], [0.22, 0.3, 0.22], PAL.gold);
  S.add('box', [0, bel + 0.85, 0], [0.04, 0.3, 0.04], PAL.iron);
  if (r() < 0.5) {
    S.add('pyr4', [0, H + 0.8, 0], [s + 0.1, 1.4, s + 0.1], brick ? PAL.terracotta[1] : PAL.slate);
  } else {
    S.add('cyl8', [0, H + 0.35, 0], [s * 0.42, 0.5, s * 0.42], trim);
    S.add('cone8', [0, H + 1.0, 0], [s * 0.5, 0.9, s * 0.5], brick ? PAL.terracotta[1] : PAL.slate);
  }
  S.add('ico', [0, H + 1.55, 0], [0.08, 0.08, 0.08], PAL.gold);
  S.add('box', [0, H + 1.8, 0], [0.05, 0.42, 0.05], PAL.iron);
  S.add('box', [0, H + 1.86, 0], [0.24, 0.05, 0.05], PAL.iron);
  if (r() < 0.65) {
    S.add('cyl16', [0, bel - 0.7, s / 2 + 0.02], [0.32, 0.04, 0.32], PAL.white, [Math.PI / 2, 0, 0]);
    S.add('box', [0, bel - 0.62, s / 2 + 0.05], [0.03, 0.22, 0.02], PAL.iron);
    S.add('box', [0.07, bel - 0.7, s / 2 + 0.05], [0.16, 0.03, 0.02], PAL.iron);
  }
  S.add('box', [0, 0.55, s / 2 + 0.02], [0.5, 0.9, 0.06], PAL.door);
  S.add('arch', [0, 1.0, s / 2 + 0.02], [0.25, 0.2, 0.06], PAL.door);
  return { top: H + 2, flagAt: null };
}

function faro(ctx, yb, group, ghost) {
  const { S, L, r } = ctx;
  const H = r.range(5.8, 7.4);
  const R0 = 0.9, R1 = 0.62;
  const stripe = r() < 0.6 ? PAL.red : col('#2b2d33');
  const bands = 6;
  const radAt = (y) => R0 + (R1 - R0) * (y / H);
  S.add(taperedCylinder(radAt(0), R0 * 1.05, 16), [0, yb / 2, 0], [1, -yb + 0.01, 1], PAL.white);
  for (let i = 0; i < bands; i++) {
    const y0 = (i * H) / bands, y1 = ((i + 1) * H) / bands;
    S.add(taperedCylinder(radAt(y1), radAt(y0), 16), [0, (y0 + y1) / 2, 0], [1, y1 - y0, 1], i % 2 ? stripe : PAL.white);
  }
  S.add('cyl16', [0, H + 0.04, 0], [R1 + 0.38, 0.1, R1 + 0.38], PAL.iron);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    S.add('box', [Math.cos(a) * (R1 + 0.33), H + 0.25, Math.sin(a) * (R1 + 0.33)], [0.03, 0.36, 0.03], PAL.iron);
    S.add('box', [Math.cos(a + 0.2) * (R1 + 0.33), H + 0.43, Math.sin(a + 0.2) * (R1 + 0.33)], [0.03, 0.03, 0.4], PAL.iron, [0, -a - 0.2, 0]);
  }
  S.add('cyl12', [0, H + 0.14, 0], [R1 * 0.75, 0.12, R1 * 0.75], PAL.iron);
  L.add('cyl12', [0, H + 0.55, 0], [R1 * 0.62, 0.7, R1 * 0.62], PAL.white);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    S.add('box', [Math.cos(a) * R1 * 0.62, H + 0.55, Math.sin(a) * R1 * 0.62], [0.04, 0.72, 0.04], PAL.iron);
  }
  S.add('cone12', [0, H + 1.12, 0], [R1 * 0.8, 0.5, R1 * 0.8], stripe);
  S.add('ico', [0, H + 1.45, 0], [0.09, 0.09, 0.09], PAL.iron);
  S.add('box', [0, 0.55, radAt(0.5) + 0.02], [0.42, 0.9, 0.08], PAL.door);
  if (r() < 0.6) {
    S.add('box', [1.35, 0.45, -0.2], [1.3, 0.9, 1.1], PAL.white);
    S.add('pyr4', [1.35, 1.15, -0.2], [1.45, 0.5, 1.25], PAL.terracotta[0]);
    L.add('box', [1.35, 0.5, 0.36], [0.3, 0.36, 0.04], PAL.white);
  }
  addGlow(group, 0, H + 0.55, 0, 2.6, ghost);
  if (!ghost) {
    const beamGeo = new THREE.ConeGeometry(1.4, 16, 12, 1, true).translate(0, -8, 0).rotateZ(Math.PI / 2);
    const beam = new THREE.Group();
    const a = new THREE.Mesh(beamGeo, MAT.beam);
    const b = new THREE.Mesh(beamGeo, MAT.beam);
    b.rotation.y = Math.PI;
    beam.add(a, b);
    beam.position.y = H + 0.55;
    beam.userData.beam = true;
    group.add(beam);
  }
  return { top: H + 1.5, flagAt: null };
}

const STYLE_FN = { saracena, quadrata, campanile, faro };

export function buildTower(data, opts = {}) {
  const style = STYLE_FN[data.style] ? data.style : 'saracena';
  const r = rng(data.seed);
  const R = TOWER_RADIUS[style];
  const groundAt = () => {
    let hi = getHeight(data.x, data.z), lo = hi;
    for (let a = 0; a < 8; a++) {
      const h = getHeight(data.x + Math.cos(a * 0.785) * R, data.z + Math.sin(a * 0.785) * R);
      hi = Math.max(hi, h);
      lo = Math.min(lo, h);
    }
    return { hi, lo };
  };
  const g = groundAt();
  const yb = g.lo - g.hi - 0.8;
  const ctx = { S: new GeoBuilder(), L: new GeoBuilder(), D: new GeoBuilder(), r };
  const shell = new THREE.Group();
  const info = STYLE_FN[style](ctx, yb, shell, opts.ghost);
  if (info.flagAt != null) ctx.S.add('cyl8', [0, info.flagAt + 0.65, 0], [0.04, 1.3, 0.04], PAL.iron);
  const group = finish([[ctx.S, MAT.solid], [ctx.L, MAT.glassLit], [ctx.D, MAT.glassDark]], opts.ghost);
  for (const c of [...shell.children]) group.add(c);
  const anim = [];
  if (info.flagAt != null) {
    const flag = flagMesh(opts.ghost, r);
    flag.position.y = info.flagAt + 1.05;
    group.add(flag);
    anim.push((t) => { flag.rotation.y = Math.sin(t * 1.6 + flag.userData.phase) * 0.35; });
  }
  const beam = group.children.find((c) => c.userData.beam);
  if (beam) anim.push((t) => { beam.rotation.y = t * 0.8; });
  group.position.set(data.x, g.hi, data.z);
  group.rotation.y = data.ang || 0;
  return {
    group,
    bounds: { x: data.x, z: data.z, r: R + 0.4 },
    meta: { top: g.hi + info.top },
    animate: anim.length ? (t) => anim.forEach((f) => f(t)) : null,
    hitDist: (x, z) => Math.max(Math.hypot(x - data.x, z - data.z) - R + 0.1, 0),
    groundY: () => groundAt().hi,
  };
}
