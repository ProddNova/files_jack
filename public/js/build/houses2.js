// More buildings: houses, palaces, churches and two fairy-tale ones.
// Shares the facade helpers of houses.js (windows, doors, roofs...).
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder, col, jitter } from '../util.js';
import { MAT, PAL, L, finish, boxFaces, addGlow } from './common.js';
import {
  roofGable, roofHip, roofFlat, roofStyle, chimney, windowAt, doorAt, balconyAt, awningAt,
  quoins, windowCount, facadeColor, pickRoof, FACADES, SHUTTERS,
} from './houses.js';

export const EXTRA_LIMITS = {
  torrecasa: { w: [1.6, 3.4], d: [1.6, 3.4], floors: [3, 8] },
  rustico: { w: [2, 5.5], d: [1.8, 4], floors: [1, 3] },
  graticcio: { w: [2, 5], d: [1.8, 4], floors: [1, 4] },
  pescatori: { w: [1.2, 2.8], d: [1.4, 3], floors: [2, 5] },
  locanda: { w: [2.6, 6], d: [2, 4], floors: [2, 4] },
  fienile: { w: [2.5, 6.5], d: [2, 4.5], floors: [1, 3] },
  serra: { w: [2, 6], d: [1.6, 4], floors: [1, 2] },
  loggia: { w: [3, 8], d: [2.6, 5], floors: [2, 5] },
  comune: { w: [3.5, 7.5], d: [2.8, 5], floors: [2, 4] },
  villa: { w: [5, 10], d: [2.6, 5], floors: [1, 3] },
  mercato: { w: [3, 8], d: [2.4, 5.5], floors: [1, 3] },
  cappella: { w: [1.6, 3.2], d: [2.2, 5], floors: [1, 4] },
  duomo: { w: [5, 9], d: [7, 14], floors: [1, 4] },
  mago: { w: [1.6, 3.2], d: [1.6, 3.2], floors: [3, 8] },
  albero: { w: [2, 3.8], d: [2, 3.8], floors: [1, 5] },
};

export const EXTRA_ROOFS = {
  torrecasa: ['hip', 'merli', 'gable'],
  rustico: ['gable', 'hip'],
  graticcio: ['gable', 'hip'],
  pescatori: ['gable', 'flat'],
  locanda: ['gable', 'hip'],
  fienile: ['gable'],
  serra: ['gable'],
  loggia: ['hip', 'gable', 'flat'],
  comune: ['merli', 'hip'],
  villa: ['hip', 'flat'],
  mercato: ['hip', 'gable'],
  cappella: ['gable'],
  duomo: ['gable'],
  mago: ['cono'],
  albero: ['gable'],
};

// Default depth/floors (and extra footprint) from the width and the seed.
export const EXTRA_DIMS = {
  torrecasa: (w, r) => ({ d: w * r.range(0.85, 1.05), floors: r.int(4, 6) }),
  rustico: (w, r) => ({ d: w * r.range(0.6, 0.8), floors: r.int(1, 2), oz: 0.3, ed: 0.6 }),
  graticcio: (w, r) => ({ d: w * r.range(0.65, 0.85), floors: r.int(2, 3) }),
  pescatori: (w, r) => ({ d: w * r.range(0.9, 1.2), floors: r.int(3, 4) }),
  locanda: (w, r) => ({ d: w * r.range(0.6, 0.75), floors: r.int(2, 3), oz: 0.65, ed: 1.3 }),
  fienile: (w, r) => ({ d: w * r.range(0.65, 0.8), floors: 2 }),
  serra: (w, r) => ({ d: w * r.range(0.5, 0.7), floors: 1 }),
  loggia: (w, r) => ({ d: w * r.range(0.6, 0.75), floors: r.int(3, 4) }),
  comune: (w, r) => ({ d: w * r.range(0.6, 0.75), floors: 3 }),
  villa: (w, r) => ({ d: w * r.range(0.4, 0.5), floors: 2, oz: 0.45, ed: 0.9 }),
  mercato: (w, r) => ({ d: w * r.range(0.55, 0.75), floors: 1 }),
  cappella: (w) => ({ d: w * 1.5, floors: 2 }),
  duomo: (w) => ({ d: w * 1.6, floors: 2 }),
  mago: (w, r) => ({ d: w, floors: r.int(4, 6) }),
  albero: (w, r) => ({ d: w, floors: r.int(2, 3) }),
};

function foundation(ctx, w, d, base = 0.18, color = PAL.foundation) {
  ctx.S.add('box', [0, (ctx.fBottom + base) / 2, 0], [w + 0.12, base - ctx.fBottom, d + 0.12], color, null, L.STONE);
}

// Merlons along the edges of a rectangle (swallowtail if `tail`).
function rectMerlons(S, w, d, y, color, tail = false) {
  const edges = [[w, d / 2, 0], [w, -d / 2, 0], [d, w / 2, Math.PI / 2], [d, -w / 2, Math.PI / 2]];
  for (const [len, off, rot] of edges) {
    const n = Math.max(2, Math.round(len / 0.55));
    for (let k = 0; k <= n; k++) {
      const u = -len / 2 + (k * len) / n;
      const p = rot ? [off, y, u] : [u, y, off];
      S.add('box', [p[0], y + 0.2, p[2]], [0.26, 0.4, 0.26], color, [0, rot, 0], L.ASHLAR);
      if (tail) {
        for (const s of [-1, 1]) {
          const q = rot ? [off, y + 0.47, u + s * 0.08] : [u + s * 0.08, y + 0.47, off];
          S.add('pyr4', q, [0.1, 0.16, 0.26], color, [0, rot, 0], L.ASHLAR);
        }
      }
    }
  }
}

function railing(S, x0, x1, z, y, h = 0.36) {
  const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 0.22));
  for (let k = 0; k <= n; k++) S.add('box', [x0 + ((x1 - x0) * k) / n, y + h / 2, z], [0.04, h, 0.04], PAL.wood, null, L.WOOD);
  S.add('box', [(x0 + x1) / 2, y + h, z], [Math.abs(x1 - x0) + 0.05, 0.05, 0.06], PAL.wood, null, L.WOOD);
}

// ---------- Houses ----------

// Medieval tower-house: tall stone body, small arched windows, a wooden gallery on top.
function torrecasa(ctx, dims) {
  const { S, r } = ctx;
  const { w, d, floors } = dims;
  const stone = ctx.data.facade ? col(ctx.data.facade) : jitter(col(r.pick(['#c9b79a', '#bfb2a0', '#d2c2a4'])), r, 0.04);
  const fh = 0.9, base = 0.15, H = floors * fh, yt = base + H;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + H / 2, 0], [w, H, d], stone, null, L.ASHLAR);
  for (let f = 2; f < floors; f += 2) S.add('box', [0, base + f * fh, 0], [w + 0.06, 0.07, d + 0.06], stone.clone().lerp(PAL.white, 0.3), null, L.ASHLAR);
  const faces = boxFaces(w, d);
  faces.forEach((f) => {
    const n = f.len > 2.4 ? 2 : 1;
    for (let fl = 1; fl < floors - 1; fl++) {
      for (let k = 0; k < n; k++) windowAt(ctx, f, (k - (n - 1) / 2) * (f.len / n), base + fl * fh + fh * 0.55, { ww: 0.24, wh: 0.4, frame: PAL.stoneLight, arch: true, lit: 0.5 });
    }
  });
  doorAt(ctx, faces[0], 0, base, { dw: 0.5, dh: 0.8, color: PAL.door, frame: PAL.stoneLight, arch: true });
  // Wooden gallery on the last floor, all around
  const gy = base + (floors - 1) * fh;
  S.add('box', [0, gy, 0], [w + 0.7, 0.08, d + 0.7], PAL.wood, null, L.WOOD);
  railing(S, -w / 2 - 0.33, w / 2 + 0.33, d / 2 + 0.33, gy);
  railing(S, -w / 2 - 0.33, w / 2 + 0.33, -d / 2 - 0.33, gy);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.add('box', [sx * (w / 2 + 0.25), gy - 0.2, sz * (d / 2 + 0.25)], [0.08, 0.4, 0.08], PAL.wood, null, L.WOOD);
  faces.forEach((f) => windowAt(ctx, f, 0, gy + fh * 0.5, { ww: 0.4, wh: 0.5, frame: PAL.wood, shutter: PAL.wood, lit: 0.6 }));
  const top = pickRoof(ctx, 'torrecasa', 'hip');
  if (top === 'merli') {
    S.add('box', [0, yt + 0.08, 0], [w + 0.16, 0.16, d + 0.16], stone, null, L.ASHLAR);
    rectMerlons(S, w, d, yt + 0.16, stone, r() < 0.5);
    return yt + 0.7;
  }
  const rs = roofStyle(ctx, r() < 0.5 ? 'ardesia' : 'coppi');
  const roof = top === 'gable' ? roofGable(S, w, d, yt, Math.min(w, d) * 0.45, 0.45, rs, stone) : roofHip(S, w, d, yt, Math.min(w, d) * 0.4, 0.45, rs);
  return roof.top;
}

// Stone farmhouse with an outside staircase up to the living floor.
function rustico(ctx, dims) {
  const { S, r } = ctx;
  const { w, d, floors } = dims;
  const stone = ctx.data.facade ? col(ctx.data.facade) : jitter(col(r.pick(['#b9a993', '#a8998a', '#c4b49c'])), r, 0.05);
  const fh = 0.95, base = 0.1, H = floors * fh, yt = base + H;
  const shutter = col(r.pick(['#6b4a32', '#7b5a3e', '#4f7a5a']));
  foundation(ctx, w, d, base);
  S.add('box', [0, base + H / 2, 0], [w, H, d], stone, null, L.STONE);
  for (let y = base + 0.2, k = 0; y < yt - 0.1; y += 0.34, k++) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = k % 2 ? 0.34 : 0.2, lz = k % 2 ? 0.2 : 0.34;
      S.add('box', [sx * (w / 2 - lx / 2 + 0.02), y, sz * (d / 2 - lz / 2 + 0.02)], [lx, 0.26, lz], stone.clone().lerp(PAL.white, 0.25), null, L.ASHLAR);
    }
  }
  const roofType = pickRoof(ctx, 'rustico', 'gable');
  const rs = roofStyle(ctx, r() < 0.6 ? 'coppi' : 'ardesia');
  const rh = Math.min(w, d) * 0.38;
  const roof = roofType === 'hip' ? roofHip(S, w, d, yt, rh, 0.3, rs) : roofGable(S, w, d, yt, rh, 0.3, rs, stone);
  chimney(ctx, roof, -roof.L * 0.3, roof.Sd * 0.1, yt, rh);
  const faces = boxFaces(w, d);
  // Ground floor: a wide cellar door; upper floor reached by the outside stairs
  doorAt(ctx, faces[0], -w / 2 + 0.6, base, { dw: 0.7, dh: 0.8, color: PAL.wood, frame: PAL.stoneLight, arch: true });
  faces.forEach((f, fi) => {
    const n = windowCount(f.len, 1.2);
    for (let fl = 0; fl < floors; fl++) {
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n);
        if (fi === 0 && (fl === 0 || (fl === 1 && k === n - 1))) continue;
        windowAt(ctx, f, u, base + fl * fh + fh * 0.55, { ww: 0.28, wh: 0.36, frame: PAL.stoneLight, shutter, sill: PAL.stoneLight, pot: r() < 0.3 });
      }
    }
  });
  if (floors >= 2) {
    const steps = 7, rise = fh / steps;
    for (let k = 0; k < steps; k++) {
      S.add('box', [-w / 2 + 1.25 + k * 0.28, base + (k + 1) * rise / 2, d / 2 + 0.3], [0.28, (k + 1) * rise, 0.55], stone.clone().multiplyScalar(0.95), null, L.STONE);
    }
    const lx = -w / 2 + 1.25 + steps * 0.28 + 0.25;
    S.add('box', [lx, base + fh / 2, d / 2 + 0.3], [0.6, fh, 0.55], stone.clone().multiplyScalar(0.95), null, L.STONE);
    doorAt(ctx, faces[0], lx, base + fh, { dw: 0.46, dh: 0.78, color: PAL.door, frame: PAL.stoneLight });
    railing(S, -w / 2 + 1.2, lx + 0.3, d / 2 + 0.55, base + fh);
  }
  for (let k = 0; k < 6; k++) S.add('cyl8', [w / 2 + 0.2, 0.1 + (k % 3) * 0.14, -d / 4 + Math.floor(k / 3) * 0.16 - 0.08], [0.07, 0.6, 0.07], PAL.woodLight, [0, 0, Math.PI / 2], L.BARK);
  return roof.top;
}

// Half-timbered house: every upper floor sticks out a little over the one below.
function graticcio(ctx, dims) {
  const { S, r } = ctx;
  const { w, d, floors } = dims;
  const plaster = ctx.data.facade ? col(ctx.data.facade) : col(r.pick(['#f1e9d8', '#efe4c9', '#e9dcc3', '#f4ecdf']));
  const beam = col(r.pick(['#4a3626', '#5a4030', '#3e2f24']));
  const fh = 0.95, base = 0.15, jut = 0.12;
  foundation(ctx, w, d, base);
  let topW = w, topD = d;
  for (let fl = 0; fl < floors; fl++) {
    const fw = w + fl * jut * 2, fd = d + fl * jut * 2;
    const y0 = base + fl * fh;
    S.add('box', [0, y0 + fh / 2, 0], [fw, fh, fd], fl === 0 ? col('#b9ab96') : plaster, null, fl === 0 ? L.STONE : L.PLASTER);
    if (fl > 0) {
      boxFaces(fw, fd).forEach((f) => {
        const n = Math.max(2, Math.round(f.len / 0.6));
        for (let k = 0; k <= n; k++) {
          const u = -f.len / 2 + (k * f.len) / n;
          const [x, z] = f.place(u, 0.015);
          S.add('box', [x, y0 + fh / 2, z], [0.08, fh, 0.03], beam, [0, f.rot, 0], L.WOOD);
          if (k < n && (k + fl) % 2 === 0) {
            const [bx, bz] = f.place(u + f.len / n / 2, 0.015);
            const ang = Math.atan2(fh, f.len / n) * ((k % 4 < 2) ? 1 : -1);
            S.add('box', [bx, y0 + fh / 2, bz], [Math.hypot(fh, f.len / n), 0.07, 0.03], beam, [0, f.rot, ang], L.WOOD);
          }
        }
        for (const y of [y0 + 0.04, y0 + fh - 0.04]) {
          const [x, z] = f.place(0, 0.02);
          S.add('box', [x, y, z], [f.len + 0.02, 0.08, 0.04], beam, [0, f.rot, 0], L.WOOD);
        }
      });
    }
    boxFaces(fw, fd).forEach((f) => {
      const n = windowCount(f.len, 1.2);
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n) + f.len / n / 4;
        if (fl === 0 && f.front && k === Math.floor((n - 1) / 2)) continue;
        windowAt(ctx, f, u, y0 + fh * 0.55, { ww: 0.3, wh: 0.36, frame: beam, lit: 0.65 });
      }
    });
    topW = fw; topD = fd;
  }
  doorAt(ctx, boxFaces(w, d)[0], 0, base, { dw: 0.48, dh: 0.8, color: beam, frame: PAL.stoneLight, arch: r() < 0.5 });
  const yt = base + floors * fh;
  const rs = roofStyle(ctx, r() < 0.5 ? 'paglia' : 'scuro');
  const rh = Math.min(topW, topD) * 0.7;
  const roof = pickRoof(ctx, 'graticcio', 'gable') === 'hip' ? roofHip(S, topW, topD, yt, rh, 0.3, rs) : roofGable(S, topW, topD, yt, rh, 0.3, rs, plaster);
  chimney(ctx, roof, roof.L * 0.25, -roof.Sd * 0.1, yt, rh);
  return roof.top;
}

// Narrow fisherman's house with a boat door, hanging nets and oars.
function pescatori(ctx, dims, group) {
  const { S, L: Lit, r } = ctx;
  const { w, d, floors } = dims;
  const facade = facadeColor(ctx, ['#e9a3a1', '#f6dc8e', '#9fc3d9', '#b9d3a8', '#f2a65a', '#e98b5e']);
  const shutter = col(r.pick(SHUTTERS));
  const fh = 0.9, base = 0.15, H = floors * fh, yt = base + H;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + H / 2, 0], [w, H, d], facade, null, L.PLASTER);
  for (let f = 1; f < floors; f++) S.add('box', [0, base + f * fh, 0], [w + 0.05, 0.05, d + 0.05], PAL.trim, null, L.ASHLAR);
  quoins(ctx, w, d, base, yt, PAL.trim, 0.12);
  const faces = boxFaces(w, d);
  doorAt(ctx, faces[0], 0, base, { dw: Math.min(1.0, w - 0.4), dh: 0.75, color: col('#3f5f78'), frame: PAL.trim, arch: true });
  faces.forEach((f) => {
    const n = Math.max(1, windowCount(f.len, 1.0));
    for (let fl = 1; fl < floors; fl++) {
      for (let k = 0; k < n; k++) windowAt(ctx, f, (k - (n - 1) / 2) * (f.len / n), base + fl * fh + fh * 0.55, { ww: 0.3, wh: 0.44, frame: PAL.trim, shutter, sill: PAL.trim, pot: r() < 0.3 });
    }
  });
  // Net drying on the side wall, with orange floats
  const side = faces[2];
  const netCol = col('#5a4a3a');
  for (let k = 0; k <= 6; k++) {
    const [x, z] = side.place(-0.6 + k * 0.2, 0.05);
    S.add('box', [x, base + 0.95, z], [0.015, 1.1, 0.015], netCol, [0, side.rot, 0], L.PLAIN);
  }
  for (let k = 0; k <= 5; k++) {
    const [x, z] = side.place(0, 0.05);
    S.add('box', [x, base + 0.4 + k * 0.22, z], [1.2, 0.015, 0.015], netCol, [0, side.rot, 0], L.PLAIN);
  }
  for (let k = 0; k < 4; k++) {
    const [x, z] = side.place(-0.5 + k * 0.33, 0.07);
    S.add('ico', [x, base + 1.5, z], [0.06, 0.06, 0.06], col('#e8692a'), null, L.PLAIN);
  }
  for (const s of [-1, 1]) S.add('box', [s * (w / 2 - 0.15), base + 0.7, d / 2 + 0.12], [0.06, 1.5, 0.05], PAL.woodLight, [0.18, 0, s * 0.1], L.WOOD);
  const [lx, lz] = faces[0].place(w / 2 - 0.15, 0.08);
  Lit.add('box', [lx, base + 1.0, lz], [0.12, 0.18, 0.12], PAL.white);
  addGlow(group, lx, base + 1.0, lz, 0.9, ctx.ghost);
  if (pickRoof(ctx, 'pescatori', r() < 0.4 ? 'flat' : 'gable') === 'flat') return roofFlat(ctx, w, d, yt, facade).top;
  return roofGable(S, w, d, yt, Math.min(w, d) * 0.4, 0.2, roofStyle(ctx, 'coppi'), facade).top;
}

// Inn: wooden gallery, hanging sign, tables with umbrellas out front.
function locanda(ctx, dims, group) {
  const { S, L: Lit, r } = ctx;
  const { w, d, floors } = dims;
  const facade = facadeColor(ctx, FACADES.casa);
  const shutter = col(r.pick(SHUTTERS));
  const fh = 0.95, base = 0.18, H = floors * fh, yt = base + H;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + H / 2, 0], [w, H, d], facade, null, L.PLASTER);
  S.add('box', [0, base + 0.3, 0], [w + 0.04, 0.6, d + 0.04], col('#b9ab96'), null, L.STONE);
  const faces = boxFaces(w, d);
  doorAt(ctx, faces[0], 0, base, { dw: 0.6, dh: 0.85, color: PAL.door, frame: PAL.trim, arch: true });
  faces.forEach((f) => {
    const n = windowCount(f.len);
    for (let fl = 0; fl < floors; fl++) {
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n);
        if (f.front && fl === 0 && Math.abs(u) < 0.5) continue;
        windowAt(ctx, f, u, base + fl * fh + fh * 0.55, { ww: 0.34, wh: 0.46, frame: PAL.trim, shutter, sill: PAL.trim, pot: r() < 0.4, lit: 0.8 });
      }
    }
  });
  // Wooden gallery on the first floor, held up by posts
  const gy = base + fh;
  S.add('box', [0, gy, d / 2 + 0.4], [w, 0.08, 0.8], PAL.wood, null, L.WOOD);
  for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) S.add('box', [x, gy / 2, d / 2 + 0.75], [0.1, gy, 0.1], PAL.wood, null, L.WOOD);
  railing(S, -w / 2, w / 2, d / 2 + 0.78, gy);
  // Hanging sign
  S.add('box', [w / 2 - 0.2, gy + 0.6, d / 2 + 0.35], [0.05, 0.05, 0.7], PAL.iron, null, L.PLAIN);
  S.add('box', [w / 2 - 0.2, gy + 0.32, d / 2 + 0.55], [0.04, 0.42, 0.5], col(r.pick(['#8e2a2a', '#2f5a3a', '#2f4a7a'])), null, L.WOOD);
  S.add('ico', [w / 2 - 0.17, gy + 0.32, d / 2 + 0.55], [0.03, 0.12, 0.12], PAL.gold, null, L.PLAIN);
  // Tables with umbrellas
  for (const x of [-w / 2 + 0.7, w / 2 - 0.7]) {
    const z = d / 2 + 1.05;
    S.add('cyl8', [x, 0.35, z], [0.3, 0.05, 0.3], PAL.woodLight, null, L.WOOD);
    S.add('cyl8', [x, 0.18, z], [0.04, 0.35, 0.04], PAL.iron, null, L.PLAIN);
    for (const a of [0, Math.PI]) S.add('box', [x + Math.cos(a) * 0.42, 0.2, z + Math.sin(a) * 0.42], [0.2, 0.4, 0.2], PAL.wood, null, L.WOOD);
    S.add('cyl8', [x, 0.85, z], [0.03, 1.0, 0.03], PAL.wood, null, L.WOOD);
    S.add('cone8', [x, 1.35, z], [0.62, 0.3, 0.62], r.pick([col('#e8e2d0'), col('#c8202e'), col('#2f6fa8')]), null, L.PLAIN);
  }
  for (const s of [-1, 1]) {
    const [x, z] = faces[0].place(s * 0.55, 0.1);
    Lit.add('box', [x, base + 0.95, z], [0.12, 0.16, 0.12], PAL.white);
    addGlow(group, x, base + 0.95, z, 0.9, ctx.ghost);
  }
  const rs = roofStyle(ctx, 'coppi');
  const rh = Math.min(w, d) * 0.38;
  const roof = pickRoof(ctx, 'locanda', 'gable') === 'hip' ? roofHip(S, w, d, yt, rh, 0.25, rs) : roofGable(S, w, d, yt, rh, 0.25, rs, facade);
  chimney(ctx, roof, roof.L * 0.25, roof.Sd * 0.1, yt, rh);
  return roof.top;
}

// Barn with plank walls, big doors and hay bales.
function fienile(ctx, dims) {
  const { S, r } = ctx;
  const { w, d, floors } = dims;
  const wood = ctx.data.facade ? col(ctx.data.facade) : col(r.pick(['#8e3b2a', '#7b5a3e', '#9a6b45']));
  const fh = 1.0, base = 0.1, H = floors * fh + 0.3, yt = base + H;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + 0.3, 0], [w + 0.04, 0.6, d + 0.04], col('#a8998a'), null, L.STONE);
  S.add('box', [0, base + 0.6 + (H - 0.6) / 2, 0], [w, H - 0.6, d], wood, null, L.WOOD);
  quoins(ctx, w, d, base + 0.6, yt, col('#e8dcc4'), 0.1, L.WOOD);
  const front = boxFaces(w, d)[0];
  const dw = Math.min(1.6, w * 0.45), dh = Math.min(1.6, H - 0.2);
  for (const s of [-1, 1]) {
    const [x, z] = front.place(s * dw / 4, 0.03);
    S.add('box', [x, base + dh / 2, z], [dw / 2 - 0.02, dh, 0.05], wood.clone().multiplyScalar(0.75), null, L.WOOD);
    for (const a of [1, -1]) S.add('box', [x, base + dh / 2, z + 0.03], [Math.hypot(dw / 2, dh) * 0.95, 0.07, 0.03], PAL.cream, [0, 0, a * Math.atan2(dh, dw / 2)], L.WOOD);
  }
  S.add('box', [0, base + dh + 0.05, d / 2 + 0.04], [dw + 0.15, 0.1, 0.06], PAL.cream, null, L.WOOD);
  if (floors >= 2) {
    S.add('box', [0, base + dh + 0.55, d / 2 + 0.02], [0.6, 0.6, 0.05], wood.clone().multiplyScalar(0.6), null, L.WOOD);
    S.add('box', [0, yt - 0.05, d / 2 + 0.4], [0.1, 0.1, 0.8], PAL.wood, null, L.WOOD);
  }
  const rs = roofStyle(ctx, r() < 0.5 ? 'paglia' : 'coppi');
  const roof = roofGable(S, w, d, yt, Math.min(w, d) * 0.45, 0.3, rs, wood);
  for (let k = 0; k < 3; k++) S.add('cyl12', [w / 2 + 0.45, 0.32, -d / 2 + 0.5 + k * 0.7], [0.32, 0.6, 0.32], col('#d4b064'), [Math.PI / 2, 0, 0], L.THATCH);
  S.add('box', [w / 2 + 0.45, 0.9, -d / 2 + 0.85], [0.55, 0.4, 0.9], col('#cfa95a'), null, L.THATCH);
  return roof.top;
}

// Greenhouse: thin white frame, glass panels and plants inside.
function serra(ctx, dims) {
  const { S, C: D, r } = ctx;
  const { w, d, floors } = dims;
  const H = 1.1 + floors * 0.4, base = 0.05;
  foundation(ctx, w, d, base + 0.25);
  const frame = col('#f2f2ee');
  const glass = PAL.white;
  boxFaces(w, d).forEach((f) => {
    const n = Math.max(2, Math.round(f.len / 0.5));
    for (let k = 0; k <= n; k++) {
      const [x, z] = f.place(-f.len / 2 + (k * f.len) / n, 0);
      S.add('box', [x, 0.3 + H / 2, z], [0.05, H, 0.05], frame, null, L.PLAIN);
    }
    const [gx, gz] = f.place(0, -0.01);
    D.add('box', [gx, 0.3 + H / 2, gz], [f.len - 0.02, H, 0.02], glass, [0, f.rot, 0]);
  });
  const yt = 0.3 + H, rh = d * 0.4;
  D.quad([-w / 2, yt, d / 2], [w / 2, yt, d / 2], [w / 2, yt + rh, 0], [-w / 2, yt + rh, 0], glass);
  D.quad([w / 2, yt, -d / 2], [-w / 2, yt, -d / 2], [-w / 2, yt + rh, 0], [w / 2, yt + rh, 0], glass);
  D.tri([w / 2, yt, d / 2], [w / 2, yt, -d / 2], [w / 2, yt + rh, 0], glass);
  D.tri([-w / 2, yt, -d / 2], [-w / 2, yt, d / 2], [-w / 2, yt + rh, 0], glass);
  const n = Math.max(2, Math.round(w / 0.5));
  for (let k = 0; k <= n; k++) {
    const x = -w / 2 + (k * w) / n;
    for (const s of [-1, 1]) S.add('box', [x, yt + rh / 2, s * d / 4], [0.05, 0.05, Math.hypot(d / 2, rh)], frame, [s * Math.atan2(rh, d / 2), 0, 0], L.PLAIN);
  }
  S.add('box', [0, yt + rh, 0], [w + 0.04, 0.06, 0.06], frame, null, L.PLAIN);
  for (let k = 0; k < Math.round(w * 3); k++) {
    const x = -w / 2 + 0.3 + r() * (w - 0.6), z = (r() - 0.5) * (d - 0.6);
    S.add('ico', [x, 0.5, z], [0.18, 0.22, 0.18], r.pick(PAL.leaf), [r(), r(), 0], L.LEAF);
    if (r() < 0.5) S.add('octa', [x, 0.72, z], [0.06, 0.06, 0.06], r.pick(PAL.bloom), null, L.LEAF);
  }
  return yt + rh;
}

// ---------- Palaces ----------

// Palace with an open arcade on the ground floor.
function loggia(ctx, dims) {
  const { S, D, r } = ctx;
  const { w, d, floors } = dims;
  const facade = facadeColor(ctx, FACADES.palazzo);
  const stone = col('#d6cbb5');
  const shutter = col(r.pick(SHUTTERS));
  const fh = 1.0, base = 0.2, H = floors * fh, yt = base + H;
  const pd = 0.8;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + fh / 2, -pd / 2], [w, fh, d - pd], facade.clone().multiplyScalar(0.92), null, L.PLASTER);
  S.add('box', [0, 0.18, d / 2 - pd / 2], [w, 0.06, pd], stone, null, L.COBBLE);
  const n = Math.max(2, Math.round(w / 1.0));
  const span = w / n;
  const ar = span / 2 - 0.1;
  const ph = fh - ar - 0.12;
  for (let k = 0; k <= n; k++) {
    const x = -w / 2 + k * span;
    S.add('cyl8', [x, base + ph / 2, d / 2 - 0.12], [0.1, ph, 0.1], stone, null, L.MARBLE);
    S.add('box', [x, base + ph + 0.03, d / 2 - 0.12], [0.26, 0.06, 0.26], stone, null, L.MARBLE);
  }
  for (let k = 0; k < n; k++) {
    const xc = -w / 2 + (k + 0.5) * span;
    for (let i = 0; i < 8; i++) {
      const x = -ar + (i + 0.5) * (ar * 2 / 8);
      const yb = base + ph + Math.sqrt(Math.max(ar * ar - x * x, 0));
      S.add('box', [xc + x, (yb + base + fh) / 2, d / 2 - 0.12], [ar * 2 / 8 + 0.01, base + fh - yb, 0.24], facade, null, L.PLASTER);
    }
    const [dx] = [xc];
    (r() < 0.5 ? D : ctx.L).add('box', [dx, base + 0.45, d / 2 - pd + 0.02], [0.4, 0.7, 0.04], PAL.white);
  }
  S.add('box', [0, base + fh / 2 + (H - fh) / 2 + fh / 2, 0], [w, H - fh, d], facade, null, L.PLASTER);
  for (let f = 1; f < floors; f++) S.add('box', [0, base + f * fh, 0], [w + 0.07, 0.08, d + 0.07], PAL.trim, null, L.ASHLAR);
  S.add('box', [0, yt - 0.1, 0], [w + 0.28, 0.2, d + 0.28], PAL.trim, null, L.ASHLAR);
  boxFaces(w, d).forEach((f) => {
    const m = windowCount(f.len, 1.0);
    for (let fl = 1; fl < floors; fl++) {
      for (let k = 0; k < m; k++) windowAt(ctx, f, (k - (m - 1) / 2) * (f.len / m), base + fl * fh + fh * 0.55, { ww: 0.36, wh: fl === 1 ? 0.6 : 0.5, frame: PAL.trim, shutter, sill: PAL.trim, pediment: fl === 1, pot: r() < 0.25 });
    }
  });
  const roofType = pickRoof(ctx, 'loggia', 'hip');
  const rs = roofStyle(ctx, r() < 0.5 ? 'coppi' : 'ardesia');
  if (roofType === 'flat') return roofFlat(ctx, w, d, yt, facade).top;
  const rh = Math.min(w, d) * 0.3;
  const roof = roofType === 'gable' ? roofGable(S, w, d, yt, rh, 0.25, rs, facade) : roofHip(S, w, d, yt, rh, 0.25, rs);
  chimney(ctx, roof, roof.L * 0.25, roof.Sd * 0.1, yt, rh);
  return roof.top;
}

// Town hall: crenellated top, banners, a clock tower in the middle.
function comune(ctx, dims) {
  const { S, D, r } = ctx;
  const { w, d, floors } = dims;
  const brick = r() < 0.5;
  const body = ctx.data.facade ? col(ctx.data.facade) : brick ? col('#b5654a') : col('#d9c9a8');
  const stone = col('#cfc3ab');
  const fh = 1.05, base = 0.2, H = floors * fh, yt = base + H;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + fh / 2, 0], [w + 0.03, fh, d + 0.03], stone, null, L.ASHLAR);
  S.add('box', [0, base + fh + (H - fh) / 2, 0], [w, H - fh, d], body, null, brick ? L.BRICK : L.ASHLAR);
  S.add('box', [0, base + fh, 0], [w + 0.08, 0.1, d + 0.08], stone, null, L.ASHLAR);
  const faces = boxFaces(w, d);
  doorAt(ctx, faces[0], 0, base, { dw: 0.9, dh: 0.8, color: PAL.door, frame: stone, arch: true });
  faces.forEach((f) => {
    const m = windowCount(f.len, 1.1);
    for (let fl = 0; fl < floors; fl++) {
      for (let k = 0; k < m; k++) {
        const u = (k - (m - 1) / 2) * (f.len / m);
        if (fl === 0 && f.front && Math.abs(u) < 0.7) continue;
        const y = base + fl * fh + fh * 0.55;
        if (fl === 0) { windowAt(ctx, f, u, y, { ww: 0.3, wh: 0.4, frame: stone, arch: true, lit: 0.4 }); continue; }
        windowAt(ctx, f, u - 0.11, y, { ww: 0.18, wh: 0.5, frame: stone, arch: true, lit: 0.6 });
        windowAt(ctx, f, u + 0.11, y, { ww: 0.18, wh: 0.5, frame: stone, arch: true, lit: 0.6 });
      }
    }
  });
  balconyAt(ctx, faces[0], 0, base + fh + 0.1, Math.min(2.2, w * 0.4));
  for (const s of [-1, 1]) {
    const [x, z] = faces[0].place(s * (w / 2 - 0.5), 0.06);
    S.add('box', [x, base + fh * 1.6, z], [0.4, 1.0, 0.03], s > 0 ? PAL.red : col('#2f4a7a'), null, L.PLAIN);
    S.add('box', [x, base + fh * 1.2, z + 0.01], [0.4, 0.1, 0.035], PAL.gold, null, L.PLAIN);
  }
  S.add('box', [0, yt + 0.08, 0], [w + 0.2, 0.16, d + 0.2], stone, null, L.ASHLAR);
  if (pickRoof(ctx, 'comune', 'merli') === 'merli') rectMerlons(S, w + 0.1, d + 0.1, yt + 0.16, body, r() < 0.5);
  else roofHip(S, w, d, yt, Math.min(w, d) * 0.3, 0.25, roofStyle(ctx, 'coppi'));
  // Clock tower
  const ts = Math.min(1.3, w * 0.25), th = yt + 2.4;
  S.add('box', [0, (yt + th) / 2, 0], [ts, th - yt, ts], body, null, brick ? L.BRICK : L.ASHLAR);
  S.add('cyl16', [0, th - 0.65, ts / 2 + 0.02], [ts * 0.32, 0.04, ts * 0.32], PAL.white, [Math.PI / 2, 0, 0], L.PLAIN);
  S.add('box', [0, th - 0.58, ts / 2 + 0.05], [0.03, ts * 0.22, 0.02], PAL.iron, null, L.PLAIN);
  S.add('box', [0.06, th - 0.65, ts / 2 + 0.05], [ts * 0.16, 0.03, 0.02], PAL.iron, null, L.PLAIN);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) S.add('box', [sx * (ts / 2 - 0.1), th + 0.4, sz * (ts / 2 - 0.1)], [0.18, 0.8, 0.18], body, null, L.ASHLAR);
  S.add('ico1', [0, th + 0.4, 0], [0.18, 0.24, 0.18], PAL.gold, null, L.PLAIN);
  S.add('pyr4', [0, th + 1.15, 0], [ts + 0.2, 0.75, ts + 0.2], roofStyle(ctx, 'scuro').color, null, L.TILE);
  D.add('box', [0, th - 1.4, ts / 2 + 0.01], [0.16, 0.4, 0.04], PAL.white);
  return th + 1.6;
}

// Villa: central block with a columned porch and pediment, two lower wings.
function villa(ctx, dims) {
  const { S, r } = ctx;
  const { w, d, floors } = dims;
  const facade = facadeColor(ctx, ['#f4efe4', '#f6e3c6', '#efd9b0', '#e9c37a', '#f3d9d0']);
  const trim = PAL.trim;
  const shutter = col(r.pick(SHUTTERS));
  const fh = 1.0, base = 0.3;
  const cw = w * 0.42, ww = (w - cw) / 2, wd = d * 0.78;
  const Hc = (floors + 1) * fh, Hw = floors * fh;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + Hc / 2, 0], [cw, Hc, d], facade, null, L.PLASTER);
  for (const s of [-1, 1]) S.add('box', [s * (cw / 2 + ww / 2), base + Hw / 2, -(d - wd) / 2], [ww, Hw, wd], facade, null, L.PLASTER);
  for (let f = 1; f <= floors; f++) S.add('box', [0, base + f * fh, 0], [cw + 0.06, 0.08, d + 0.06], trim, null, L.ASHLAR);
  quoins(ctx, cw, d, base, base + Hc, trim, 0.2, L.ASHLAR);
  // Porch with columns and a triangular pediment
  const pw = cw * 0.8, ph = Hc * 0.62 + base;
  S.add('box', [0, base - 0.05, d / 2 + 0.45], [pw + 0.4, 0.12, 0.95], PAL.stoneLight, null, L.MARBLE);
  for (let k = 0; k < 3; k++) S.add('box', [0, base - 0.12 - k * 0.1, d / 2 + 0.95 + k * 0.2], [pw * 0.6, 0.1, 0.25], PAL.stoneLight, null, L.MARBLE);
  for (let k = 0; k < 4; k++) {
    const x = -pw / 2 + (k * pw) / 3;
    S.add('cyl12', [x, base + (ph - base) / 2, d / 2 + 0.75], [0.11, ph - base, 0.11], PAL.white, null, L.MARBLE);
  }
  S.add('box', [0, ph + 0.08, d / 2 + 0.45], [pw + 0.3, 0.16, 0.95], trim, null, L.MARBLE);
  const tz = d / 2 + 0.92, ty = ph + 0.16, th = pw * 0.22;
  S.tri([-pw / 2 - 0.15, ty, tz], [pw / 2 + 0.15, ty, tz], [0, ty + th, tz], trim, L.MARBLE);
  S.quad([pw / 2 + 0.15, ty, tz], [pw / 2 + 0.15, ty, d / 2], [0, ty + th, d / 2], [0, ty + th, tz], roofStyle(ctx, 'coppi').color, L.TILE);
  S.quad([-pw / 2 - 0.15, ty, d / 2], [-pw / 2 - 0.15, ty, tz], [0, ty + th, tz], [0, ty + th, d / 2], roofStyle(ctx, 'coppi').color, L.TILE);
  const faces = boxFaces(cw, d);
  doorAt(ctx, faces[0], 0, base, { dw: 0.6, dh: 1.0, color: PAL.door, frame: trim, arch: true });
  faces.forEach((f) => {
    const m = windowCount(f.len, 1.0);
    for (let fl = 0; fl <= floors; fl++) {
      for (let k = 0; k < m; k++) {
        const u = (k - (m - 1) / 2) * (f.len / m);
        if (fl === 0 && f.front && Math.abs(u) < 0.5) continue;
        windowAt(ctx, f, u, base + fl * fh + fh * 0.55, { ww: 0.34, wh: 0.6, frame: trim, shutter, sill: trim });
      }
    }
  });
  for (const s of [-1, 1]) {
    // Wing front, shifted to where the wing stands
    const f = boxFaces(ww, wd)[0];
    const face = { ...f, place: (uu, out) => { const [px, pz] = f.place(uu, out); return [px + s * (cw / 2 + ww / 2), pz - (d - wd) / 2]; } };
    const m = windowCount(f.len, 0.9);
    for (let fl = 0; fl < floors; fl++) {
      for (let k = 0; k < m; k++) windowAt(ctx, face, (k - (m - 1) / 2) * (f.len / m), base + fl * fh + fh * 0.55, { ww: 0.34, wh: 0.6, frame: trim, shutter, sill: trim });
    }
    // Balustrade on the wing roof
    const yb = base + Hw;
    const cx = s * (cw / 2 + ww / 2), cz = -(d - wd) / 2;
    S.add('box', [cx, yb + 0.04, cz], [ww + 0.06, 0.08, wd + 0.06], trim, null, L.MARBLE);
    for (let k = 0; k <= Math.round(ww / 0.18); k++) S.add('cyl8', [cx - ww / 2 + k * 0.18, yb + 0.25, cz + wd / 2], [0.04, 0.32, 0.04], PAL.white, null, L.MARBLE);
    S.add('box', [cx, yb + 0.43, cz + wd / 2], [ww, 0.06, 0.1], trim, null, L.MARBLE);
  }
  const yt = base + Hc;
  if (pickRoof(ctx, 'villa', 'hip') === 'flat') return roofFlat(ctx, cw, d, yt, facade).top;
  const roof = roofHip(S, cw, d, yt, Math.min(cw, d) * 0.32, 0.25, roofStyle(ctx, 'coppi'));
  chimney(ctx, roof, 0, roof.Sd * 0.1, yt, Math.min(cw, d) * 0.32);
  return roof.top;
}

// Covered market: columns and arches around an open hall, stalls inside.
function mercato(ctx, dims) {
  const { S, r } = ctx;
  const { w, d, floors } = dims;
  const stone = ctx.data.facade ? col(ctx.data.facade) : col(r.pick(['#d6cbb5', '#cdbfa6', '#e3d8c2']));
  const ph = 1.5 + (floors - 1) * 0.5, base = 0.12;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + 0.02, 0], [w, 0.04, d], PAL.stoneLight, null, L.COBBLE);
  const nx = Math.max(2, Math.round(w / 1.1)), nz = Math.max(2, Math.round(d / 1.1));
  const pts = [];
  for (let k = 0; k <= nx; k++) for (const s of [-1, 1]) pts.push([-w / 2 + (k * w) / nx, s * d / 2]);
  for (let k = 1; k < nz; k++) for (const s of [-1, 1]) pts.push([s * w / 2, -d / 2 + (k * d) / nz]);
  for (const [x, z] of pts) {
    S.add('box', [x, base + ph / 2, z], [0.22, ph, 0.22], stone, null, L.ASHLAR);
    S.add('box', [x, base + ph, z], [0.32, 0.08, 0.32], stone, null, L.ASHLAR);
  }
  const bandH = 0.5;
  for (const [len, off, rot] of [[w, d / 2, 0], [w, -d / 2, 0], [d, w / 2, Math.PI / 2], [d, -w / 2, Math.PI / 2]]) {
    const n = rot ? nz : nx, span = len / n, ar = span / 2 - 0.12;
    for (let k = 0; k < n; k++) {
      const c = -len / 2 + (k + 0.5) * span;
      for (let i = 0; i < 6; i++) {
        const x = -ar + (i + 0.5) * (ar * 2 / 6);
        const yb = base + ph - 0.25 + Math.sqrt(Math.max(ar * ar - x * x, 0)) * 0.5;
        const p = rot ? [off, 0, c + x] : [c + x, 0, off];
        S.add('box', [p[0], (yb + base + ph + bandH) / 2, p[2]], [rot ? 0.24 : ar * 2 / 6 + 0.01, base + ph + bandH - yb, rot ? ar * 2 / 6 + 0.01 : 0.24], stone, null, L.ASHLAR);
      }
    }
  }
  S.add('box', [0, base + ph + bandH / 2, 0], [w + 0.1, bandH, d + 0.1], stone.clone().multiplyScalar(0.97), null, L.ASHLAR);
  const fruit = ['#f5a623', '#e0473c', '#f5d33a', '#7cb342', '#8e44ad'].map(col);
  for (let k = 0; k < Math.max(2, Math.round(w / 1.6)); k++) {
    const x = -w / 2 + 0.9 + k * 1.6;
    if (x > w / 2 - 0.6) break;
    S.add('box', [x, 0.5, 0], [0.9, 0.06, 0.6], PAL.woodLight, null, L.WOOD);
    for (const [lx, lz] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) S.add('box', [x + lx, 0.27, lz], [0.05, 0.45, 0.05], PAL.wood, null, L.WOOD);
    const f = r.pick(fruit);
    for (let i = 0; i < 8; i++) S.add('ico', [x + r.range(-0.35, 0.35), 0.58, r.range(-0.2, 0.2)], [0.06, 0.06, 0.06], f, null, L.PLAIN);
  }
  const yt = base + ph + bandH;
  const rs = roofStyle(ctx, 'coppi');
  const roof = pickRoof(ctx, 'mercato', 'hip') === 'gable' ? roofGable(S, w, d, yt, Math.min(w, d) * 0.3, 0.3, rs, stone) : roofHip(S, w, d, yt, Math.min(w, d) * 0.28, 0.3, rs);
  return roof.top;
}

// ---------- Churches ----------

// Small white chapel with a bell gable over the front.
function cappella(ctx, dims) {
  const { S, L: Lit, r } = ctx;
  const { w, d, floors } = dims;
  const plaster = ctx.data.facade ? col(ctx.data.facade) : col(r.pick(['#f6f2ea', '#f2e6d0', '#efe3c8']));
  const base = 0.2, Hn = 1.5 + floors * 0.45;
  foundation(ctx, w, d, base);
  S.add('box', [0, base + Hn / 2, 0], [w, Hn, d], plaster, null, L.PLASTER);
  quoins(ctx, w, d, base, base + Hn, PAL.stoneLight, 0.14, L.ASHLAR);
  const rs = roofStyle(ctx, r() < 0.7 ? 'coppi' : 'ardesia');
  const rh = w * 0.42;
  roofGable(S, w, d, base + Hn, rh, 0.15, rs, plaster);
  // Bell gable on the front
  const bw = w * 0.5, by = base + Hn + rh * 0.55, bh = 1.0;
  S.add('box', [0, by + bh / 2, d / 2 - 0.1], [bw, bh, 0.22], plaster, null, L.PLASTER);
  S.add('arch', [0, by + bh, d / 2 - 0.1], [bw / 2, bw * 0.35, 0.22], plaster, null, L.PLASTER);
  S.add('box', [0, by + 0.5, d / 2 - 0.1], [bw * 0.45, 0.55, 0.24], col('#2c2c30'), null, L.PLAIN);
  S.add('ico1', [0, by + 0.5, d / 2 - 0.1], [0.12, 0.15, 0.12], PAL.gold, null, L.PLAIN);
  S.add('box', [0, by + bh + bw * 0.35 + 0.2, d / 2 - 0.1], [0.04, 0.35, 0.04], PAL.iron, null, L.PLAIN);
  S.add('box', [0, by + bh + bw * 0.35 + 0.27, d / 2 - 0.1], [0.18, 0.04, 0.04], PAL.iron, null, L.PLAIN);
  const front = boxFaces(w, d)[0];
  doorAt(ctx, front, 0, base, { dw: 0.5, dh: 0.75, color: PAL.door, frame: PAL.stoneLight, arch: true });
  S.add('cyl16', [0, base + Hn * 0.8, d / 2 + 0.01], [0.2, 0.04, 0.2], PAL.stoneLight, [Math.PI / 2, 0, 0], L.ASHLAR);
  Lit.add('cyl16', [0, base + Hn * 0.8, d / 2 + 0.03], [0.14, 0.04, 0.14], PAL.white, [Math.PI / 2, 0, 0]);
  for (const f of boxFaces(w, d).slice(2)) {
    for (const u of [-0.25, 0.25]) {
      const [x, z] = f.place(u * d, 0.03);
      Lit.add('box', [x, base + Hn * 0.55, z], [0.16, 0.5, 0.04], PAL.white, [0, f.rot, 0]);
      Lit.add('arch', [x, base + Hn * 0.55 + 0.25, z], [0.08, 0.08, 0.04], PAL.white, [0, f.rot, 0]);
    }
  }
  S.add('cyl12', [0, base + Hn * 0.4, -d / 2], [w * 0.36, Hn * 0.8, w * 0.36], plaster, null, L.PLASTER);
  S.add('cone12', [0, base + Hn * 0.8 + 0.25, -d / 2], [w * 0.38, 0.5, w * 0.38], rs.color, null, rs.layer);
  return by + bh + bw * 0.35 + 0.5;
}

// Cathedral: tall nave, lower aisles, marble front with three portals, a dome, two bell towers.
function duomo(ctx, dims) {
  const { S, L: Lit, D, r } = ctx;
  const { w, d, floors } = dims;
  const marble = ctx.data.facade ? col(ctx.data.facade) : col(r.pick(['#f1ece2', '#ece4d4', '#f4efe6']));
  const dark = col('#4a4d55');
  const striped = r() < 0.5;
  const base = 0.3, Hn = 3.2 + floors * 0.6, cw = w * 0.44, aw = (w - cw) / 2, Ha = Hn * 0.6;
  const rs = roofStyle(ctx, 'ardesia');
  const domeRs = roofStyle(ctx, ctx.data.roofCol ? ctx.data.roofCol : 'rame');
  foundation(ctx, w, d, base);
  for (let k = 0; k < 4; k++) S.add('box', [0, base - 0.08 - k * 0.12, d / 2 + 0.25 + k * 0.25], [w * 0.7, 0.12, 0.3], PAL.stoneLight, null, L.MARBLE);
  S.add('box', [0, base + Hn / 2, 0], [cw, Hn, d], marble, null, L.MARBLE);
  for (const s of [-1, 1]) {
    S.add('box', [s * (cw / 2 + aw / 2), base + Ha / 2, 0], [aw, Ha, d - 0.3], marble.clone().multiplyScalar(0.97), null, L.MARBLE);
    const x0 = s * cw / 2, x1 = s * (cw / 2 + aw + 0.15), y0 = base + Ha + 0.5, y1 = base + Ha;
    const a = [x0, y0, d / 2 - 0.15], b = [x1, y1, d / 2 - 0.15], c = [x1, y1, -d / 2 + 0.15], e = [x0, y0, -d / 2 + 0.15];
    if (s > 0) S.quad(a, b, c, e, rs.color, rs.layer); else S.quad(b, a, e, c, rs.color, rs.layer);
    for (let k = 0; k < 4; k++) {
      const z = -d / 2 + 0.8 + k * (d - 1.6) / 3;
      Lit.add('box', [s * (cw / 2 + aw + 0.01), base + Ha * 0.55, z], [0.04, Ha * 0.45, 0.3], PAL.white);
      Lit.add('box', [s * (cw / 2 + 0.01), base + Ha + (Hn - Ha) * 0.5, z], [0.04, (Hn - Ha) * 0.4, 0.28], PAL.white);
    }
  }
  roofGable(S, cw, d, base + Hn, cw * 0.4, 0.15, rs, marble, [0, 0, 0]);
  // Front: stripes and three portals, rose window
  const fz = d / 2 + 0.02;
  if (striped) for (let y = base + 0.4; y < base + Hn; y += 0.5) S.add('box', [0, y, fz], [cw + 0.01, 0.16, 0.04], dark, null, L.MARBLE);
  const front = { len: w, place: (u, out) => [u, out + d / 2], rot: 0, front: true };
  doorAt(ctx, front, 0, base, { dw: 0.9, dh: 1.3, color: PAL.door, frame: PAL.stoneLight, arch: true });
  for (const s of [-1, 1]) doorAt(ctx, { ...front, place: (u, out) => [u, out + d / 2 - 0.15] }, s * (cw / 2 + aw / 2), base, { dw: 0.55, dh: 0.9, color: PAL.door, frame: PAL.stoneLight, arch: true });
  const ry = base + Hn * 0.72;
  S.add('cyl16', [0, ry, fz + 0.02], [0.62, 0.05, 0.62], PAL.stoneLight, [Math.PI / 2, 0, 0], L.MARBLE);
  Lit.add('cyl16', [0, ry, fz + 0.05], [0.5, 0.05, 0.5], PAL.white, [Math.PI / 2, 0, 0]);
  for (let s = 0; s < 6; s++) S.add('box', [0, ry, fz + 0.08], [1.0, 0.04, 0.02], PAL.stoneLight, [0, 0, (s * Math.PI) / 6], L.MARBLE);
  // Dome over the crossing
  const dzc = -d * 0.18, dr = cw * 0.55, dy = base + Hn;
  S.add('cyl16', [0, dy + 0.6, dzc], [dr, 1.2, dr], marble, null, L.MARBLE);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    D.add('box', [Math.cos(a) * dr, dy + 0.6, dzc + Math.sin(a) * dr], [0.18, 0.6, 0.06], PAL.white, [0, -a + Math.PI / 2, 0]);
  }
  S.add('ico1', [0, dy + 1.2, dzc], [dr + 0.05, dr * 1.05, dr + 0.05], domeRs.color, null, domeRs.layer);
  S.add('cyl8', [0, dy + 1.25 + dr, dzc], [0.22, 0.5, 0.22], marble, null, L.MARBLE);
  S.add('cone8', [0, dy + 1.7 + dr, dzc], [0.26, 0.4, 0.26], domeRs.color, null, domeRs.layer);
  S.add('box', [0, dy + 2.1 + dr, dzc], [0.05, 0.4, 0.05], PAL.gold, null, L.PLAIN);
  S.add('box', [0, dy + 2.18 + dr, dzc], [0.22, 0.05, 0.05], PAL.gold, null, L.PLAIN);
  // Two bell towers on the front corners
  const ts = Math.min(1.2, aw * 0.9), th = base + Hn + 2.2;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - ts / 2), z = d / 2 - ts / 2;
    S.add('box', [x, (ctx.fBottom + th) / 2, z], [ts, th - ctx.fBottom, ts], marble, null, L.MARBLE);
    if (striped) for (let y = base + 0.4; y < th - 1; y += 0.5) S.add('box', [x, y, z], [ts + 0.02, 0.16, ts + 0.02], dark, null, L.MARBLE);
    D.add('box', [x, th - 0.6, z + ts / 2 + 0.01], [ts * 0.45, 0.6, 0.04], PAL.white);
    D.add('box', [x + s * (ts / 2 + 0.01), th - 0.6, z], [0.04, 0.6, ts * 0.45], PAL.white);
    S.add('box', [x, th + 0.06, z], [ts + 0.14, 0.12, ts + 0.14], PAL.stoneLight, null, L.MARBLE);
    S.add('pyr4', [x, th + 0.8, z], [ts + 0.05, 1.4, ts + 0.05], rs.color, null, rs.layer);
  }
  return dy + 2.4 + dr;
}

// ---------- Fairy tale ----------

// Crooked wizard tower: stacked, slightly twisted floors, a glowing crystal on top.
function mago(ctx, dims, group) {
  const { S, L: Lit, r } = ctx;
  const { w, floors } = dims;
  const R = w / 2;
  const stone = ctx.data.facade ? col(ctx.data.facade) : jitter(col(r.pick(['#8f8aa0', '#9a8f86', '#7f8a96'])), r, 0.05);
  const rs = roofStyle(ctx, 'viola');
  let x = 0, z = 0, y = 0.1;
  S.add('cyl12', [0, (ctx.fBottom + y) / 2, 0], [R * 1.1, y - ctx.fBottom, R * 1.1], stone.clone().multiplyScalar(0.9), null, L.STONE);
  for (let f = 0; f < floors; f++) {
    const rr = R * (1 - f * 0.05);
    const h = 0.9;
    const lean = r.range(-0.07, 0.07);
    S.add('cyl12', [x, y + h / 2, z], [rr, h, rr], f % 2 ? stone : stone.clone().multiplyScalar(0.92), [lean, r() * 3, -lean], L.ASHLAR);
    S.add('cyl12', [x, y + h, z], [rr + 0.06, 0.08, rr + 0.06], PAL.wood, null, L.WOOD);
    const a = r() * Math.PI * 2;
    (r() < 0.8 ? Lit : ctx.D).add('box', [x + Math.cos(a) * rr, y + h * 0.55, z + Math.sin(a) * rr], [0.22, 0.34, 0.08], PAL.white, [0, -a + Math.PI / 2, 0]);
    y += h;
    x += r.range(-0.08, 0.08);
    z += r.range(-0.08, 0.08);
  }
  const rTop = R * (1 - floors * 0.05) + 0.2;
  S.add('cone12', [x + 0.1, y + rTop * 1.6, z], [rTop, rTop * 3.2, rTop], rs.color, [0.18, 0, 0.12], rs.layer);
  S.add('box', [0, 0.5, R - 0.02], [0.45, 0.8, 0.1], PAL.door, null, L.WOOD);
  S.add('arch', [0, 0.9, R - 0.02], [0.225, 0.2, 0.1], PAL.door, null, L.WOOD);
  if (!ctx.ghost) {
    const C = new GeoBuilder();
    C.add('octa', [0, 0, 0], [0.18, 0.4, 0.18], PAL.white);
    const crystal = finish([[C, MAT.crystal]], false).children[0];
    const cy = y + rTop * 3.2 + 0.4;
    crystal.position.set(x + 0.45, cy, z + 0.3);
    group.add(crystal);
    addGlow(group, x + 0.45, cy, z + 0.3, 2.4, false);
    group.children[group.children.length - 1].material = MAT.glow.clone();
    group.children[group.children.length - 1].material.color.set('#b58cff');
    group.children[group.children.length - 1].material.opacity = 0.7;
    ctx.anim.push((t) => { crystal.rotation.y = t; crystal.position.y = cy + Math.sin(t * 1.5) * 0.12; });
  }
  return y + rTop * 3.2 + 0.8;
}

// Tree house: a big tree with a cabin on a deck, reached by a ladder.
function albero(ctx, dims, group) {
  const { S, L: Lit, r } = ctx;
  const { w, floors } = dims;
  const Ht = 2.0 + floors * 0.45;
  const bark = col('#6b5444');
  S.add(new THREE.CylinderGeometry(0.32, 0.55, 1, 10).toNonIndexed(), [0, (ctx.fBottom + Ht + 1.5) / 2, 0], [1, Ht + 1.5 - ctx.fBottom, 1], bark, null, L.BARK);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    S.add('box', [Math.cos(a) * 0.45, 0.15, Math.sin(a) * 0.45], [0.7, 0.25, 0.2], bark, [0, -a, 0.35], L.BARK);
  }
  const deckY = Ht * 0.8, R = w * 0.55;
  S.add('cyl12', [0, deckY, 0], [R, 0.1, R], PAL.woodLight, null, L.WOOD);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.78;
    S.add('box', [Math.cos(a) * R * 0.5, deckY - 0.4, Math.sin(a) * R * 0.5], [0.08, 0.9, 0.08], PAL.wood, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], L.WOOD);
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    S.add('box', [Math.cos(a) * (R - 0.05), deckY + 0.22, Math.sin(a) * (R - 0.05)], [0.04, 0.4, 0.04], PAL.wood, null, L.WOOD);
  }
  S.add('cyl16', [0, deckY + 0.42, 0], [R - 0.05, 0.04, R - 0.05], PAL.wood, null, L.WOOD);
  const cw = Math.min(1.4, w * 0.6);
  S.add('box', [0.1, deckY + 0.55, -0.1], [cw, 1.0, cw * 0.85], PAL.woodLight, null, L.WOOD);
  roofGable(S, cw, cw * 0.85, deckY + 1.05, cw * 0.45, 0.15, roofStyle(ctx, 'paglia'), PAL.woodLight, [0.1, 0, -0.1]);
  Lit.add('box', [0.1, deckY + 0.6, -0.1 + cw * 0.425 + 0.01], [0.3, 0.3, 0.04], PAL.white);
  S.add('box', [0.45, deckY + 0.45, -0.1 + cw * 0.425 + 0.01], [0.3, 0.7, 0.04], PAL.door, null, L.WOOD);
  for (const s of [-1, 1]) S.add('box', [s * 0.18, deckY / 2, R + 0.1], [0.05, deckY + 0.1, 0.05], PAL.wood, [0.12, 0, 0], L.WOOD);
  for (let k = 0; k < Math.floor(deckY / 0.28); k++) S.add('box', [0, 0.2 + k * 0.28, R + 0.1 - (0.2 + k * 0.28 - deckY / 2) * 0.12], [0.4, 0.04, 0.05], PAL.wood, null, L.WOOD);
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2, d = r.range(0.3, w * 0.6);
    S.add('ico1', [Math.cos(a) * d, Ht + 1.2 + r.range(-0.3, 0.6), Math.sin(a) * d], [r.range(0.7, 1.1), r.range(0.5, 0.8), r.range(0.7, 1.1)], r.pick(PAL.leaf), [r(), r(), 0], L.LEAF);
  }
  addGlow(group, 0.1, deckY + 0.6, -0.1 + cw * 0.425 + 0.15, 0.9, ctx.ghost);
  return Ht + 2;
}

export const EXTRA_STYLES = {
  torrecasa, rustico, graticcio, pescatori, locanda, fienile, serra,
  loggia, comune, villa, mercato, cappella, duomo, mago, albero,
};
