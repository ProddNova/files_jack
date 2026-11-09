import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder, rng, col, jitter, taperedCylinder, clamp } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, L, finish, addGlow } from './common.js';
import { ROOF_COLORS } from './houses.js';

export const TOWER_STYLES = ['saracena', 'quadrata', 'campanile', 'faro', 'torrione', 'torretta', 'mastio'];
export const TOWER_BASE_R = { saracena: 1.35, quadrata: 1.25, campanile: 0.95, faro: 1.1, torrione: 2.0, torretta: 0.85, mastio: 2.2 };
export const TOWER_TOPS = {
  saracena: ['merli', 'cono', 'piatto', 'rovina'],
  quadrata: ['merli', 'piramide', 'piatto'],
  campanile: ['piramide', 'cono'],
  faro: ['cono'],
  torrione: ['merli', 'cono'],
  torretta: ['cono', 'merli'],
  mastio: ['merli', 'piramide'],
};
export const STONES = {
  calda: '#cdb898', grigia: '#b9b3a6', ocra: '#d4b483', chiara: '#e6dccb', scura: '#8f877b', rosa: '#d9b3a0',
};

export function towerRadius(data) {
  return (TOWER_BASE_R[data.style] ?? 1.3) * clamp(data.r ?? 1, 0.6, 1.8);
}

const merlonRing = (S, n, rad, y, h, color, w = 0.3, d = 0.42, skip = null) => {
  for (let i = 0; i < n; i++) {
    if (skip && skip(i)) continue;
    const a = (i / n) * Math.PI * 2 + 0.26;
    S.add('box', [Math.cos(a) * rad, y + h / 2, Math.sin(a) * rad], [w, h, d], color, [0, -a, 0], L.ASHLAR);
  }
};

function slit(B, a, rr, y, w = 0.14, h = 0.48) {
  B.add('box', [Math.cos(a) * rr, y, Math.sin(a) * rr], [w, h, 0.12], PAL.white, [0, -a + Math.PI / 2, 0]);
}

function topOf(ctx, def) {
  const list = TOWER_TOPS[ctx.style];
  return ctx.data.top && list.includes(ctx.data.top) ? ctx.data.top : def;
}

function roofOf(ctx, def) {
  const key = ROOF_COLORS[ctx.data.roofCol] ? ctx.data.roofCol : def;
  return { color: col(ROOF_COLORS[key].hex), layer: ROOF_COLORS[key].layer };
}

function saracena(ctx) {
  const { S, L: Lit, D, r, yb, sh, sr, stone } = ctx;
  const H = r.range(4.2, 6.2) * sh;
  const R = r.range(1.0, 1.25) * sr;
  const rnd = r();
  const top = topOf(ctx, rnd < 0.2 ? 'cono' : rnd > 0.85 ? 'rovina' : 'merli');
  const rTop = R * 0.84;
  const radAt = (y) => R + (rTop - R) * ((y - yb) / (H - yb));
  S.add(taperedCylinder(rTop, R, 16), [0, (yb + H) / 2, 0], [1, H - yb, 1], stone, null, L.ASHLAR);
  if (r() < 0.6) S.add(taperedCylinder(R, R * 1.25, 16), [0, (yb + 1.3) / 2, 0], [1, 1.3 - yb, 1], stone.clone().multiplyScalar(0.94), null, L.STONE);
  const band = H * r.range(0.55, 0.7);
  S.add('cyl16', [0, band, 0], [radAt(band) + 0.07, 0.14, radAt(band) + 0.07], PAL.stoneLight, null, L.ASHLAR);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    S.add('box', [Math.cos(a) * rTop * 1.05, H - 0.12, Math.sin(a) * rTop * 1.05], [0.2, 0.26, 0.2], stone, [0, -a, 0], L.ASHLAR);
  }
  S.add('cyl16', [0, H + 0.27, 0], [rTop * 1.2, 0.55, rTop * 1.2], jitter(stone, r, 0.04), null, L.ASHLAR);
  let roofTop = H + 0.55;
  if (top === 'cono') {
    const rs = roofOf(ctx, 'coppi');
    S.add('cone12', [0, H + 1.2, 0], [rTop * 1.3, 1.4, rTop * 1.3], rs.color, null, rs.layer);
    roofTop = H + 1.9;
  } else if (top === 'merli' || top === 'rovina') {
    const ruined = top === 'rovina';
    for (let i = 0; i < 8; i++) {
      if (ruined && r() < 0.35) continue;
      const a = (i / 8) * Math.PI * 2 + 0.26;
      const mh = ruined ? r.range(0.15, 0.45) : 0.42;
      S.add('box', [Math.cos(a) * rTop * 1.04, H + 0.55 + mh / 2, Math.sin(a) * rTop * 1.04], [0.3, mh, 0.42], stone, [0, -a, 0], L.ASHLAR);
    }
  } else {
    S.add('cyl16', [0, H + 0.62, 0], [rTop * 1.2, 0.14, rTop * 1.2], PAL.stoneLight, null, L.ASHLAR);
  }
  const doorY = 1.55;
  const dr = radAt(doorY);
  S.add('box', [0, doorY, dr - 0.02], [0.5, 0.85, 0.1], PAL.door, null, L.WOOD);
  S.add('arch', [0, doorY + 0.42, dr - 0.02], [0.25, 0.2, 0.1], PAL.door, null, L.WOOD);
  S.add('box', [0, doorY - 0.47, dr + 0.08], [0.62, 0.08, 0.28], PAL.stoneLight, null, L.ASHLAR);
  for (let s = 0; s < 4; s++) S.add('box', [0, 0.12 + s * 0.27, dr + 0.65 - s * 0.14], [0.55, 0.08, 0.22], PAL.wood, null, L.WOOD);
  for (const [a, f] of [[1.7, 0.45], [3.6, 0.5], [5.2, 0.42], [0.6, 0.82], [2.9, 0.84], [4.5, 0.8]]) slit(r() < 0.5 ? Lit : D, a, radAt(H * f), H * f);
  return { top: roofTop, flagAt: top === 'merli' && r() < 0.7 ? H + 0.55 : null };
}

function squareShaft(ctx, s, H, stone, light, quoin = true) {
  const { S, yb } = ctx;
  S.add('box', [0, (yb + H) / 2, 0], [s, H - yb, s], stone, null, L.ASHLAR);
  if (!quoin) return;
  for (let y = 0.15, k = 0; y < H - 0.2; y += 0.32, k++) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = k % 2 ? 0.36 : 0.2, lz = k % 2 ? 0.2 : 0.36;
      S.add('box', [sx * (s / 2 - lx / 2 + 0.02), y, sz * (s / 2 - lz / 2 + 0.02)], [lx, 0.24, lz], light, null, L.ASHLAR);
    }
  }
}

function squareFaces(s) {
  return [[0, s / 2], [Math.PI, -s / 2], [Math.PI / 2, s / 2], [-Math.PI / 2, -s / 2]].map(([rot, off]) => {
    const side = Math.abs(rot) === Math.PI / 2;
    return { rot, at: (u, y, o) => (side ? [off + Math.sign(off) * o, y, u] : [u, y, off + Math.sign(off) * o]) };
  });
}

function squareMerlons(S, s, y, color, n = 4) {
  for (const f of squareFaces(s)) {
    for (let k = 0; k < n; k++) {
      const u = -s / 2 + 0.16 + (k * (s - 0.32)) / (n - 1);
      S.add('box', f.at(u, y, -0.08), [0.3, 0.44, 0.22], color, [0, f.rot, 0], L.ASHLAR);
    }
  }
}

function quadrata(ctx) {
  const { S, L: Lit, D, r, sh, sr, stone } = ctx;
  const H = r.range(4.5, 6.6) * sh;
  const s = r.range(1.7, 2.1) * sr;
  const light = stone.clone().lerp(PAL.white, 0.35);
  squareShaft(ctx, s, H, stone, light);
  S.add('box', [0, H * 0.6, 0], [s + 0.12, 0.14, s + 0.12], light, null, L.ASHLAR);
  for (const f of squareFaces(s)) {
    for (const [y, pair] of [[H * 0.42, false], [H * 0.78, true]]) {
      for (const u of pair ? [-0.22, 0.22] : [0]) {
        const B = r() < 0.5 ? Lit : D;
        B.add('box', f.at(u, y, 0.02), [0.26, 0.5, 0.06], PAL.white, [0, f.rot, 0]);
        B.add('arch', f.at(u, y + 0.25, 0.02), [0.13, 0.12, 0.06], PAL.white, [0, f.rot, 0]);
      }
      if (pair) S.add('box', f.at(0, H * 0.78, 0.03), [0.06, 0.62, 0.06], light, [0, f.rot, 0], L.ASHLAR);
    }
  }
  S.add('box', [0, 0.6, s / 2 + 0.02], [0.6, 1.0, 0.08], PAL.door, null, L.WOOD);
  S.add('arch', [0, 1.1, s / 2 + 0.02], [0.3, 0.25, 0.08], PAL.door, null, L.WOOD);
  const top = topOf(ctx, r() < 0.5 ? 'piramide' : 'merli');
  if (top === 'piramide') {
    const rs = roofOf(ctx, 'coppi');
    S.add('box', [0, H + 0.08, 0], [s + 0.3, 0.16, s + 0.3], light, null, L.ASHLAR);
    S.add('pyr4', [0, H + 0.7, 0], [s + 0.45, 1.2, s + 0.45], rs.color, null, rs.layer);
    return { top: H + 1.3, flagAt: null };
  }
  S.add('box', [0, H - 0.1, 0], [s + 0.24, 0.2, s + 0.24], stone, null, L.ASHLAR);
  if (top === 'merli') squareMerlons(S, s, H + 0.32, stone);
  else S.add('box', [0, H + 0.22, 0], [s + 0.24, 0.24, s + 0.24], light, null, L.ASHLAR);
  return { top: H + 0.55, flagAt: r() < 0.6 ? H + 0.1 : null };
}

function campanile(ctx) {
  const { S, r, yb, sh, sr } = ctx;
  const H = r.range(6.5, 8.5) * sh;
  const s = r.range(1.2, 1.5) * sr;
  const brick = ctx.data.stone == null ? r() < 0.5 : false;
  const body = brick ? jitter(col('#b5654a'), r, 0.05) : ctx.stone;
  const bodyLayer = brick ? L.BRICK : L.ASHLAR;
  const trim = brick ? col('#e8dcc4') : PAL.stoneLight;
  const bel = H - 1.2;
  S.add('box', [0, (yb + bel) / 2, 0], [s, bel - yb, s], body, null, bodyLayer);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.add('box', [sx * (s / 2 - 0.06), bel / 2, sz * (s / 2 - 0.06)], [0.16, bel, 0.16], body.clone().multiplyScalar(0.9), null, bodyLayer);
  }
  for (const y of [bel * 0.35, bel * 0.7, bel]) S.add('box', [0, y, 0], [s + 0.12, 0.1, s + 0.12], trim, null, L.ASHLAR);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.add('box', [sx * (s / 2 - 0.11), bel + 0.6, sz * (s / 2 - 0.11)], [0.22, 1.2, 0.22], body, null, bodyLayer);
  }
  S.add('box', [0, H + 0.06, 0], [s + 0.16, 0.14, s + 0.16], trim, null, L.ASHLAR);
  S.add('box', [0, H - 0.12, 0], [s, 0.22, s], body, null, bodyLayer);
  S.add('ico1', [0, bel + 0.5, 0], [0.22, 0.3, 0.22], PAL.gold, null, L.PLAIN);
  S.add('box', [0, bel + 0.85, 0], [0.04, 0.3, 0.04], PAL.iron, null, L.PLAIN);
  const rs = roofOf(ctx, brick ? 'scuro' : 'ardesia');
  if (topOf(ctx, r() < 0.5 ? 'piramide' : 'cono') === 'piramide') {
    S.add('pyr4', [0, H + 0.8, 0], [s + 0.1, 1.4, s + 0.1], rs.color, null, rs.layer);
  } else {
    S.add('cyl8', [0, H + 0.35, 0], [s * 0.42, 0.5, s * 0.42], trim, null, L.ASHLAR);
    S.add('cone8', [0, H + 1.0, 0], [s * 0.5, 0.9, s * 0.5], rs.color, null, rs.layer);
  }
  S.add('ico', [0, H + 1.55, 0], [0.08, 0.08, 0.08], PAL.gold, null, L.PLAIN);
  S.add('box', [0, H + 1.8, 0], [0.05, 0.42, 0.05], PAL.iron, null, L.PLAIN);
  S.add('box', [0, H + 1.86, 0], [0.24, 0.05, 0.05], PAL.iron, null, L.PLAIN);
  if (r() < 0.65) {
    S.add('cyl16', [0, bel - 0.7, s / 2 + 0.02], [0.32, 0.04, 0.32], PAL.white, [Math.PI / 2, 0, 0], L.PLAIN);
    S.add('box', [0, bel - 0.62, s / 2 + 0.05], [0.03, 0.22, 0.02], PAL.iron, null, L.PLAIN);
    S.add('box', [0.07, bel - 0.7, s / 2 + 0.05], [0.16, 0.03, 0.02], PAL.iron, null, L.PLAIN);
  }
  S.add('box', [0, 0.55, s / 2 + 0.02], [0.5, 0.9, 0.06], PAL.door, null, L.WOOD);
  S.add('arch', [0, 1.0, s / 2 + 0.02], [0.25, 0.2, 0.06], PAL.door, null, L.WOOD);
  return { top: H + 2, flagAt: null };
}

function faro(ctx, group) {
  const { S, L: Lit, r, yb, sh, sr } = ctx;
  const H = r.range(5.8, 7.4) * sh;
  const R0 = 0.9 * sr, R1 = 0.62 * sr;
  const stripe = r() < 0.6 ? PAL.red : col('#2b2d33');
  const bands = 6;
  const radAt = (y) => R0 + (R1 - R0) * (y / H);
  S.add(taperedCylinder(radAt(0), R0 * 1.05, 16), [0, yb / 2, 0], [1, -yb + 0.01, 1], PAL.white, null, L.PLASTER);
  for (let i = 0; i < bands; i++) {
    const y0 = (i * H) / bands, y1 = ((i + 1) * H) / bands;
    S.add(taperedCylinder(radAt(y1), radAt(y0), 16), [0, (y0 + y1) / 2, 0], [1, y1 - y0, 1], i % 2 ? stripe : PAL.white, null, L.PLASTER);
  }
  S.add('cyl16', [0, H + 0.04, 0], [R1 + 0.38, 0.1, R1 + 0.38], PAL.iron, null, L.PLAIN);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    S.add('box', [Math.cos(a) * (R1 + 0.33), H + 0.25, Math.sin(a) * (R1 + 0.33)], [0.03, 0.36, 0.03], PAL.iron, null, L.PLAIN);
    S.add('box', [Math.cos(a + 0.2) * (R1 + 0.33), H + 0.43, Math.sin(a + 0.2) * (R1 + 0.33)], [0.03, 0.03, 0.4], PAL.iron, [0, -a - 0.2, 0], L.PLAIN);
  }
  S.add('cyl12', [0, H + 0.14, 0], [R1 * 0.75, 0.12, R1 * 0.75], PAL.iron, null, L.PLAIN);
  Lit.add('cyl12', [0, H + 0.55, 0], [R1 * 0.62, 0.7, R1 * 0.62], PAL.white);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    S.add('box', [Math.cos(a) * R1 * 0.62, H + 0.55, Math.sin(a) * R1 * 0.62], [0.04, 0.72, 0.04], PAL.iron, null, L.PLAIN);
  }
  S.add('cone12', [0, H + 1.12, 0], [R1 * 0.8, 0.5, R1 * 0.8], stripe, null, L.PLAIN);
  S.add('ico', [0, H + 1.45, 0], [0.09, 0.09, 0.09], PAL.iron, null, L.PLAIN);
  S.add('box', [0, 0.55, radAt(0.5) + 0.02], [0.42, 0.9, 0.08], PAL.door, null, L.WOOD);
  if (r() < 0.6) {
    S.add('box', [1.35 * sr, 0.45, -0.2], [1.3, 0.9, 1.1], PAL.white, null, L.PLASTER);
    S.add('pyr4', [1.35 * sr, 1.15, -0.2], [1.45, 0.5, 1.25], PAL.terracotta[0], null, L.TILE);
    Lit.add('box', [1.35 * sr, 0.5, 0.36], [0.3, 0.36, 0.04], PAL.white);
  }
  addGlow(group, 0, H + 0.55, 0, 2.6, ctx.ghost);
  if (!ctx.ghost) {
    const beamGeo = new THREE.ConeGeometry(1.4, 16, 12, 1, true).translate(0, -8, 0).rotateZ(Math.PI / 2);
    const beam = new THREE.Group();
    const a = new THREE.Mesh(beamGeo, MAT.beam);
    const b = new THREE.Mesh(beamGeo, MAT.beam);
    b.rotation.y = Math.PI;
    beam.add(a, b);
    beam.position.y = H + 0.55;
    group.add(beam);
    ctx.anim.push((t) => { beam.rotation.y = t * 0.8; });
  }
  return { top: H + 1.5, flagAt: null };
}

// Big round tower of a castle, with a sloped base and an overhanging parapet.
function torrione(ctx) {
  const { S, L: Lit, D, r, yb, sh, sr, stone } = ctx;
  const H = r.range(4.6, 6.0) * sh;
  const R = 1.75 * sr;
  const light = stone.clone().lerp(PAL.white, 0.3);
  S.add(taperedCylinder(R, R, 20), [0, (1.4 + H) / 2, 0], [1, H - 1.4, 1], stone, null, L.ASHLAR);
  S.add(taperedCylinder(R, R * 1.18, 20), [0, (yb + 1.4) / 2, 0], [1, 1.4 - yb, 1], stone.clone().multiplyScalar(0.93), null, L.STONE);
  S.add('cyl16', [0, 1.42, 0], [R + 0.08, 0.14, R + 0.08], light, null, L.ASHLAR);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    S.add('box', [Math.cos(a) * (R + 0.08), H - 0.15, Math.sin(a) * (R + 0.08)], [0.22, 0.3, 0.26], stone, [0, -a, 0], L.ASHLAR);
  }
  S.add('cyl16', [0, H + 0.3, 0], [R + 0.25, 0.6, R + 0.25], stone, null, L.ASHLAR);
  for (let i = 0; i < 9; i++) slit(r() < 0.4 ? Lit : D, (i / 9) * Math.PI * 2 + 0.2, R + 0.01, 1.8 + (i % 3) * (H - 2.4) / 3);
  const top = topOf(ctx, r() < 0.6 ? 'merli' : 'cono');
  if (top === 'cono') {
    const rs = roofOf(ctx, r() < 0.5 ? 'blu' : 'ardesia');
    S.add('cone12', [0, H + 0.6 + R * 1.1, 0], [R + 0.3, R * 2.2, R + 0.3], rs.color, null, rs.layer);
    S.add('box', [0, H + 0.6 + R * 2.3, 0], [0.05, 0.6, 0.05], PAL.gold, null, L.PLAIN);
    return { top: H + R * 2.4 + 0.9, flagAt: H + 0.6 + R * 2.2 };
  }
  merlonRing(S, 12, R + 0.18, H + 0.6, 0.45, stone, 0.38, 0.3);
  return { top: H + 1.1, flagAt: H + 0.6 };
}

// Slim turret with a tall pointed roof: fairy-tale silhouette.
function torretta(ctx) {
  const { S, L: Lit, D, r, yb, sh, sr, stone } = ctx;
  const H = r.range(5.0, 7.0) * sh;
  const R = 0.72 * sr;
  S.add(taperedCylinder(R, R * 1.06, 14), [0, (yb + H) / 2, 0], [1, H - yb, 1], stone, null, L.ASHLAR);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    S.add('box', [Math.cos(a) * (R + 0.06), H - 0.12, Math.sin(a) * (R + 0.06)], [0.14, 0.22, 0.16], stone, [0, -a, 0], L.ASHLAR);
  }
  S.add('cyl16', [0, H + 0.15, 0], [R + 0.14, 0.32, R + 0.14], stone.clone().lerp(PAL.white, 0.2), null, L.ASHLAR);
  for (const f of [0.35, 0.6, 0.85]) {
    const a = r() * Math.PI * 2;
    const B = r() < 0.6 ? Lit : D;
    B.add('box', [Math.cos(a) * R, H * f, Math.sin(a) * R], [0.2, 0.36, 0.08], PAL.white, [0, -a + Math.PI / 2, 0]);
  }
  const top = topOf(ctx, 'cono');
  if (top === 'cono') {
    const rs = roofOf(ctx, r() < 0.5 ? 'blu' : r() < 0.5 ? 'viola' : 'ardesia');
    S.add('cone12', [0, H + 0.3 + R * 1.5, 0], [R + 0.22, R * 3.0 + 0.3, R + 0.22], rs.color, null, rs.layer);
    S.add('ico', [0, H + 0.45 + R * 3.0, 0], [0.08, 0.08, 0.08], PAL.gold, null, L.PLAIN);
    return { top: H + R * 3.2 + 0.6, flagAt: H + 0.4 + R * 3.0 };
  }
  merlonRing(S, 7, R + 0.06, H + 0.3, 0.36, stone, 0.22, 0.2);
  return { top: H + 0.7, flagAt: null };
}

// Square keep with four little corner turrets.
function mastio(ctx) {
  const { S, L: Lit, D, r, yb, sh, sr, stone } = ctx;
  const H = r.range(6.4, 8.0) * sh;
  const s = 3.0 * sr;
  const light = stone.clone().lerp(PAL.white, 0.3);
  squareShaft(ctx, s, H, stone, light, false);
  S.add('box', [0, 0.5, 0], [s + 0.3, 1.0 - yb + 0.5, s + 0.3], stone.clone().multiplyScalar(0.92), null, L.STONE);
  for (const y of [H * 0.35, H * 0.68]) S.add('box', [0, y, 0], [s + 0.1, 0.14, s + 0.1], light, null, L.ASHLAR);
  for (const f of squareFaces(s)) {
    for (const [y, n] of [[H * 0.5, 2], [H * 0.82, 3]]) {
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (s / (n + 0.5));
        const B = r() < 0.5 ? Lit : D;
        B.add('box', f.at(u - 0.12, y, 0.02), [0.18, 0.55, 0.06], PAL.white, [0, f.rot, 0]);
        B.add('box', f.at(u + 0.12, y, 0.02), [0.18, 0.55, 0.06], PAL.white, [0, f.rot, 0]);
        S.add('box', f.at(u, y + 0.34, 0.03), [0.6, 0.1, 0.08], light, [0, f.rot, 0], L.ASHLAR);
      }
    }
  }
  S.add('box', [0, 0.85, s / 2 + 0.05], [0.8, 1.3, 0.1], PAL.door, null, L.WOOD);
  S.add('arch', [0, 1.5, s / 2 + 0.05], [0.4, 0.32, 0.1], PAL.door, null, L.WOOD);
  for (let k = 0; k < 4; k++) S.add('box', [0, 0.08 + k * 0.12, s / 2 + 0.35 + (3 - k) * 0.2], [1.2, 0.12, 0.25], PAL.stoneLight, null, L.ASHLAR);
  S.add('box', [0, H - 0.1, 0], [s + 0.3, 0.24, s + 0.3], stone, null, L.ASHLAR);
  const top = topOf(ctx, 'merli');
  const rs = roofOf(ctx, r() < 0.5 ? 'ardesia' : 'blu');
  if (top === 'piramide') {
    S.add('pyr4', [0, H + 1.1, 0], [s + 0.4, 2.2, s + 0.4], rs.color, null, rs.layer);
  } else {
    squareMerlons(S, s + 0.3, H + 0.3, stone, 6);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = sx * (s / 2), z = sz * (s / 2);
    S.add('cyl12', [x, H + 0.4, z], [0.42, 1.6, 0.42], stone, null, L.ASHLAR);
    S.add('cone12', [x, H + 1.75, z], [0.52, 1.1, 0.52], rs.color, null, rs.layer);
  }
  return { top: H + (top === 'piramide' ? 2.3 : 2.4), flagAt: top === 'merli' ? H + 0.4 : null };
}

const STYLE_FN = { saracena, quadrata, campanile, faro, torrione, torretta, mastio };

export function buildTower(data, opts = {}) {
  const style = STYLE_FN[data.style] ? data.style : 'saracena';
  const r = rng(data.seed);
  const R = towerRadius({ ...data, style });
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
  const stone = STONES[data.stone] ? col(STONES[data.stone]) : jitter(col(r.pick(Object.values(STONES).slice(0, 4))), r, 0.04);
  const ctx = {
    S: new GeoBuilder(L.ASHLAR), L: new GeoBuilder(), D: new GeoBuilder(), r, data, style,
    yb: g.lo - g.hi - 0.8, sh: clamp(data.h ?? 1, 0.5, 2.2), sr: clamp(data.r ?? 1, 0.6, 1.8),
    stone, ghost: opts.ghost, anim: [],
  };
  const shell = new THREE.Group();
  const info = STYLE_FN[style](ctx, shell);
  if (info.flagAt != null) ctx.S.add('cyl8', [0, info.flagAt + 0.65, 0], [0.04, 1.3, 0.04], PAL.iron, null, L.PLAIN);
  const group = finish([[ctx.S, MAT.solid], [ctx.L, MAT.glassLit], [ctx.D, MAT.glassDark]], opts.ghost);
  for (const c of [...shell.children]) group.add(c);
  if (info.flagAt != null) {
    const F = new GeoBuilder(L.PLAIN);
    F.add('box', [0.4, 0, 0], [0.76, 0.48, 0.02], PAL.white);
    F.add('box', [0.4, 0, 0], [0.76, 0.1, 0.035], PAL.red);
    F.add('box', [0.4, 0, 0], [0.1, 0.48, 0.035], PAL.red);
    const flag = finish([[F, MAT.solid]], opts.ghost).children[0];
    flag.position.y = info.flagAt + 1.05;
    const ph = r() * 10;
    group.add(flag);
    ctx.anim.push((t) => { flag.rotation.y = Math.sin(t * 1.6 + ph) * 0.35; });
  }
  group.position.set(data.x, g.hi, data.z);
  group.rotation.y = data.ang || 0;
  return {
    group,
    bounds: { x: data.x, z: data.z, r: R + 0.4 },
    meta: { top: g.hi + info.top, radius: R },
    animate: ctx.anim.length ? (t) => ctx.anim.forEach((f) => f(t)) : null,
    hitDist: (x, z) => Math.max(Math.hypot(x - data.x, z - data.z) - R + 0.1, 0),
    groundY: () => groundAt().hi,
  };
}
