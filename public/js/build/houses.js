import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder, rng, col, jitter, clamp } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, L, finish, boxFaces, groundRange } from './common.js';
import { EXTRA_STYLES, EXTRA_LIMITS, EXTRA_ROOFS, EXTRA_DIMS } from './houses2.js';

export const FACADES = {
  casa: ['#f0b64f', '#e98b5e', '#f4c9a3', '#d8654f', '#f6dc8e', '#e9a3a1', '#f1e4c8', '#cf7d4c', '#f2a65a', '#e7c27d'],
  palazzo: ['#c8553d', '#e0a33a', '#d98e6c', '#e9c37a', '#b8483a', '#d6b25e'],
  villetta: ['#f4efe4', '#f6e3c6', '#e8eef0', '#f3d9d0', '#e9f0dc', '#fbe9b7'],
};
export const FACADE_CHOICES = ['#f0b64f', '#e98b5e', '#f4c9a3', '#d8654f', '#f6dc8e', '#e9a3a1', '#f4efe4', '#c8553d', '#9fc3d9', '#b9d3a8', '#d7c3e6', '#8f877b'];
export const ROOF_COLORS = {
  coppi: { hex: '#b6533b', layer: L.TILE, label: 'Coppi' },
  scuro: { hex: '#8e3b2a', layer: L.TILE, label: 'Coppi scuri' },
  ardesia: { hex: '#5f636c', layer: L.SLATE, label: 'Ardesia' },
  rame: { hex: '#5c9c86', layer: L.SLATE, label: 'Rame' },
  blu: { hex: '#3f5fa8', layer: L.SLATE, label: 'Blu' },
  viola: { hex: '#6b4f8f', layer: L.SLATE, label: 'Viola' },
  paglia: { hex: '#c9a35c', layer: L.THATCH, label: 'Paglia' },
};
export const SHUTTERS = ['#3d6e4c', '#466f58', '#35624a', '#4f7a5a', '#4d7f86', '#6b8f71'];
export const AWNINGS = [['#c8202e', '#f6f3ec'], ['#2f6fa8', '#f6f3ec'], ['#3d8a5a', '#f2e6c8'], ['#e0a526', '#f6f3ec']];

export const HOUSE_STYLES = ['casa', 'palazzo', 'villetta', 'chiesa', 'porta', 'mulino', ...Object.keys(EXTRA_LIMITS)];

// Which roofs make sense for each style (first one = default list order).
export const ROOF_TYPES = {
  casa: ['gable', 'hip', 'flat'],
  palazzo: ['hip', 'gable', 'flat'],
  villetta: ['gable', 'flat'],
  chiesa: ['gable', 'dome'],
  porta: ['merli', 'cono', 'piramide'],
  mulino: ['cono'],
  ...EXTRA_ROOFS,
};

// Size limits for the editor sliders.
export const HOUSE_LIMITS = {
  casa: { w: [1.4, 6], d: [1.2, 5], floors: [1, 6] },
  palazzo: { w: [3, 8], d: [2.5, 6], floors: [2, 7] },
  villetta: { w: [2, 5.5], d: [1.6, 4.5], floors: [1, 3] },
  chiesa: { w: [2.6, 5], d: [3.5, 9], floors: [1, 5] },
  porta: { w: [3, 7], d: [1.4, 3.2], floors: [1, 5] },
  mulino: { w: [1.6, 3.2], d: [1.6, 3.2], floors: [2, 6] },
  ...EXTRA_LIMITS,
};

// Size of a house from its saved data. Player edits (d, floors) win over the
// random defaults that come from the seed.
export function houseDims(data) {
  const style = HOUSE_LIMITS[data.style] ? data.style : 'casa';
  const lim = HOUSE_LIMITS[style];
  const r = rng((data.seed ^ 0x9e3779b9) >>> 0);
  const w = clamp(data.w, lim.w[0], lim.w[1]);
  let d, floors, porch = false, ox = 0, oz = 0, ew = 0, ed = 0;
  if (style === 'palazzo') {
    d = w * r.range(0.6, 0.8); floors = r.int(4, 5);
  } else if (style === 'villetta') {
    d = w * r.range(0.6, 0.85); floors = r.int(1, 2); porch = r() < 0.6;
  } else if (style === 'chiesa') {
    d = w * 1.65; floors = 2; ox = 0.55; ew = 1.1;
  } else if (style === 'porta') {
    d = 2.0; floors = 3;
  } else if (style === 'mulino') {
    d = w; floors = 3;
  } else if (EXTRA_DIMS[style]) {
    ({ d, floors, ox = 0, oz = 0, ew = 0, ed = 0 } = EXTRA_DIMS[style](w, r));
  } else {
    d = w * r.range(0.55, 0.85); floors = (w < 2.4 ? 3 : 2) + r.int(0, 2);
  }
  if (data.d != null) d = data.d;
  if (data.floors != null) floors = data.floors;
  d = clamp(d, lim.d[0], lim.d[1]);
  floors = clamp(Math.round(floors), lim.floors[0], lim.floors[1]);
  if (style === 'mulino' || style === 'mago' || style === 'albero') d = w;
  if (porch) { oz = 0.55; ed = 1.1; }
  return { style, w, d, floors, porch, ox, oz, ew, ed, flat: false };
}

// Footprint as a rotated rectangle in world space.
export function houseRect(data) {
  const dims = houseDims(data);
  const c = Math.cos(data.ang), s = Math.sin(data.ang);
  return {
    x: data.x + dims.ox * c + dims.oz * s,
    z: data.z - dims.ox * s + dims.oz * c,
    hw: (dims.w + dims.ew) / 2,
    hd: (dims.d + dims.ed) / 2,
    ang: data.ang,
    dims,
  };
}

// ---------- Roofs ----------

export function roofMap(w, d, off = [0, 0, 0]) {
  const ridgeX = w >= d;
  const P = ridgeX
    ? (u, y, v) => [u + off[0], y + off[1], v + off[2]]
    : (u, y, v) => [v + off[0], y + off[1], -u + off[2]];
  return { ridgeX, P, L: ridgeX ? w : d, Sd: ridgeX ? d : w };
}

export function roofStyle(ctx, fallbackKey) {
  const key = ROOF_COLORS[ctx.data.roofCol] ? ctx.data.roofCol : fallbackKey;
  return { color: col(ROOF_COLORS[key].hex), layer: ROOF_COLORS[key].layer };
}

// Two sloped faces plus the underside, so it also looks right from the street.
export function roofGable(S, w, d, yt, rh, o, rs, gableCol, off) {
  const { ridgeX, P, L: Lw, Sd } = roofMap(w, d, off);
  const Lr = Lw + 2 * o, Sr = Sd + 2 * o;
  const c2 = rs.color.clone().multiplyScalar(0.9);
  const A1 = P(-Lr / 2, yt, Sr / 2), B1 = P(Lr / 2, yt, Sr / 2), C1 = P(Lr / 2, yt + rh, 0), D1 = P(-Lr / 2, yt + rh, 0);
  const A2 = P(Lr / 2, yt, -Sr / 2), B2 = P(-Lr / 2, yt, -Sr / 2), C2 = P(-Lr / 2, yt + rh, 0), D2 = P(Lr / 2, yt + rh, 0);
  S.quad(A1, B1, C1, D1, rs.color, rs.layer);
  S.quad(A2, B2, C2, D2, c2, rs.layer);
  const t = 0.06;
  S.quad(D1.map((v, i) => v - (i === 1 ? t : 0)), C1.map((v, i) => v - (i === 1 ? t : 0)), B1.map((v, i) => v - (i === 1 ? t : 0)), A1.map((v, i) => v - (i === 1 ? t : 0)), PAL.wood, L.WOOD);
  S.quad(D2.map((v, i) => v - (i === 1 ? t : 0)), C2.map((v, i) => v - (i === 1 ? t : 0)), B2.map((v, i) => v - (i === 1 ? t : 0)), A2.map((v, i) => v - (i === 1 ? t : 0)), PAL.wood, L.WOOD);
  S.tri(P(Lw / 2, yt, Sr / 2), P(Lw / 2, yt, -Sr / 2), P(Lw / 2, yt + rh, 0), gableCol, L.PLASTER);
  S.tri(P(-Lw / 2, yt, -Sr / 2), P(-Lw / 2, yt, Sr / 2), P(-Lw / 2, yt + rh, 0), gableCol, L.PLASTER);
  S.add('box', P(0, yt + rh, 0), [Lr + 0.02, 0.09, 0.16], rs.color.clone().multiplyScalar(0.72), [0, ridgeX ? 0 : Math.PI / 2, 0], rs.layer);
  return { P, L: Lw, Sd, ridgeX, top: yt + rh };
}

export function roofHip(S, w, d, yt, rh, o, rs, off) {
  const { ridgeX, P, L: Lw, Sd } = roofMap(w, d, off);
  const Lr = Lw + 2 * o, Sr = Sd + 2 * o;
  const r = (Lr - Sr) / 2;
  const a = P(-Lr / 2, yt, Sr / 2), b = P(Lr / 2, yt, Sr / 2), c = P(Lr / 2, yt, -Sr / 2), dd = P(-Lr / 2, yt, -Sr / 2);
  const R1 = P(-r, yt + rh, 0), R2 = P(r, yt + rh, 0);
  const sh = [1, 0.88, 0.94, 0.84].map((k) => rs.color.clone().multiplyScalar(k));
  S.quad(a, b, R2, R1, sh[0], rs.layer);
  S.quad(c, dd, R1, R2, sh[1], rs.layer);
  S.tri(b, c, R2, sh[2], rs.layer);
  S.tri(dd, a, R1, sh[3], rs.layer);
  S.quad(dd, c, b, a, PAL.wood, L.WOOD);
  if (r > 0.05) S.add('box', P(0, yt + rh, 0), [r * 2 + 0.1, 0.09, 0.16], rs.color.clone().multiplyScalar(0.72), [0, ridgeX ? 0 : Math.PI / 2, 0], rs.layer);
  return { P, L: Lw, Sd, ridgeX, top: yt + rh };
}

export function roofFlat(ctx, w, d, yt, color) {
  const { S } = ctx;
  S.add('box', [0, yt + 0.02, 0], [w + 0.06, 0.08, d + 0.06], PAL.cream, null, L.COBBLE);
  for (const [px, pz, sx, sz] of [[0, d / 2, w + 0.06, 0.12], [0, -d / 2, w + 0.06, 0.12], [w / 2, 0, 0.12, d], [-w / 2, 0, 0.12, d]]) {
    S.add('box', [px, yt + 0.22, pz], [sx, 0.36, sz], color, null, L.PLASTER);
  }
  return { top: yt + 0.4 };
}

export function chimney(ctx, roof, u, v, yt, rh) {
  const yRoof = yt + rh * (1 - Math.abs(v) / (roof.Sd / 2 + 0.2));
  const p = roof.P(u, yRoof + 0.25, v);
  ctx.S.add('box', p, [0.28, 0.8, 0.28], PAL.chimney, null, L.BRICK);
  ctx.S.add('box', [p[0], p[1] + 0.43, p[2]], [0.38, 0.08, 0.38], PAL.trim, null, L.PLASTER);
}

// ---------- Facade pieces ----------

export function windowAt(ctx, face, u, y, o) {
  const { S, L: Lit, D, r } = ctx;
  const rot = [0, face.rot, 0];
  const { ww, wh } = o;
  if (o.frame) {
    const [fx, fz] = face.place(u, 0.012);
    S.add('box', [fx, y, fz], [ww + 0.16, wh + 0.14, 0.025], o.frame, rot, L.PLASTER);
    if (o.arch) S.add('arch', [fx, y + wh / 2 + 0.07, fz], [ww / 2 + 0.08, ww / 2 + 0.06, 0.025], o.frame, rot, L.PLASTER);
    if (o.pediment) S.add('box', [fx, y + wh / 2 + 0.16, fz], [ww + 0.3, 0.07, 0.06], o.frame, rot, L.ASHLAR);
  }
  const [gx, gz] = face.place(u, 0.03);
  const G = r() < (o.lit ?? 0.55) ? Lit : D;
  G.add('box', [gx, y, gz], [ww, wh, 0.04], PAL.white, rot);
  if (o.arch) G.add('arch', [gx, y + wh / 2, gz], [ww / 2, ww / 2 * 0.95, 0.04], PAL.white, rot);
  const [mx, mz] = face.place(u, 0.055);
  S.add('box', [mx, y, mz], [0.03, wh, 0.02], PAL.trim, rot, L.WOOD);
  S.add('box', [mx, y + wh * 0.12, mz], [ww, 0.03, 0.02], PAL.trim, rot, L.WOOD);
  if (o.shutter) {
    for (const side of [-1, 1]) {
      const [sx, sz] = face.place(u + side * (ww / 2 + 0.085), 0.05);
      S.add('box', [sx, y, sz], [0.15, wh + 0.04, 0.035], o.shutter, rot, L.WOOD);
    }
  }
  if (o.sill) {
    const [lx, lz] = face.place(u, 0.06);
    S.add('box', [lx, y - wh / 2 - 0.05, lz], [ww + 0.14, 0.05, 0.12], o.sill, rot, L.ASHLAR);
  }
  if (o.pot) {
    const [px, pz] = face.place(u, 0.11);
    S.add('box', [px, y - wh / 2 + 0.02, pz], [ww * 0.8, 0.1, 0.1], PAL.pot, rot, L.BRICK);
    const bloom = r.pick(PAL.bloom);
    for (const k of [-1, 0, 1]) {
      const [qx, qz] = face.place(u + k * ww * 0.27, 0.12);
      S.add('octa', [qx, y - wh / 2 + 0.11, qz], [0.075, 0.075, 0.075], k === 0 ? PAL.leaf[0] : bloom, null, L.LEAF);
    }
  }
}

export function doorAt(ctx, face, u, base, o) {
  const { S } = ctx;
  const rot = [0, face.rot, 0];
  const [fx, fz] = face.place(u, 0.012);
  S.add('box', [fx, base + o.dh / 2 + 0.04, fz], [o.dw + 0.18, o.dh + 0.1, 0.03], o.frame, rot, L.ASHLAR);
  if (o.arch) S.add('arch', [fx, base + o.dh + 0.09, fz], [o.dw / 2 + 0.09, o.dw / 2 + 0.06, 0.03], o.frame, rot, L.ASHLAR);
  const [dx, dz] = face.place(u, 0.035);
  S.add('box', [dx, base + o.dh / 2, dz], [o.dw, o.dh, 0.05], o.color, rot, L.WOOD);
  if (o.arch) S.add('arch', [dx, base + o.dh, dz], [o.dw / 2, o.dw / 2 * 0.9, 0.05], o.color, rot, L.WOOD);
  const [kx, kz] = face.place(u + o.dw * 0.3, 0.07);
  S.add('box', [kx, base + o.dh * 0.5, kz], [0.04, 0.04, 0.03], PAL.gold, rot, L.PLAIN);
  const [sx, sz] = face.place(u, 0.17);
  S.add('box', [sx, base - 0.02, sz], [o.dw + 0.3, 0.1, 0.3], PAL.stoneLight, rot, L.ASHLAR);
}

export function balconyAt(ctx, face, u, y, width) {
  const { S } = ctx;
  const rot = [0, face.rot, 0];
  const [bx, bz] = face.place(u, 0.2);
  S.add('box', [bx, y, bz], [width, 0.06, 0.4], PAL.trim, rot, L.ASHLAR);
  const [rx, rz] = face.place(u, 0.38);
  S.add('box', [rx, y + 0.34, rz], [width, 0.03, 0.03], PAL.iron, rot, L.PLAIN);
  const posts = Math.max(3, Math.round(width / 0.14));
  for (let k = 0; k <= posts; k++) {
    const [px, pz] = face.place(u - width / 2 + (k * width) / posts, 0.38);
    S.add('box', [px, y + 0.18, pz], [0.02, 0.3, 0.02], PAL.iron, rot, L.PLAIN);
  }
  for (const side of [-1, 1]) {
    const [sx, sz] = face.place(u + side * width / 2, 0.2);
    S.add('box', [sx, y + 0.34, sz], [0.03, 0.03, 0.38], PAL.iron, rot, L.PLAIN);
  }
}

export function awningAt(ctx, face, u, y, width, colors) {
  const { S } = ctx;
  const n = Math.max(4, Math.round(width / 0.17));
  for (let k = 0; k < n; k++) {
    const uk = u - width / 2 + (k + 0.5) * (width / n);
    const c = colors[k % 2];
    const [ax, az] = face.place(uk, 0.27);
    S.add('box', [ax, y - 0.1, az], [width / n + 0.002, 0.03, 0.56], c, [0.38, face.rot, 0], L.PLAIN);
    const [vx, vz] = face.place(uk, 0.53);
    S.add('box', [vx, y - 0.27, vz], [width / n + 0.002, 0.12, 0.02], c, [0, face.rot, 0], L.PLAIN);
  }
}

export function quoins(ctx, w, d, y0, y1, color, size = 0.16, layer = L.PLASTER) {
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    ctx.S.add('box', [sx * (w / 2 - size / 2 + 0.02), (y0 + y1) / 2, sz * (d / 2 - size / 2 + 0.02)], [size, y1 - y0, size], color, null, layer);
  }
}

export function windowCount(len, spacing = 0.95) {
  let n = Math.floor((len - 0.4) / spacing);
  if (n < 1) n = len >= 1.0 ? 1 : 0;
  return n;
}

export function facadeColor(ctx, list) {
  return ctx.data.facade ? col(ctx.data.facade) : col(ctx.r.pick(list));
}

export function pickRoof(ctx, style, rnd) {
  const types = ROOF_TYPES[style];
  if (ctx.data.roof && types.includes(ctx.data.roof)) return ctx.data.roof;
  return rnd;
}

// ---------- Styles ----------

function casa(ctx, dims) {
  const { S, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const facade = facadeColor(ctx, FACADES.casa);
  const trim = r() < 0.75 ? PAL.trim : PAL.cream;
  const shutter = col(r.pick(SHUTTERS));
  const rs = roofStyle(ctx, r() < 0.6 ? 'coppi' : 'ardesia');
  const roofType = pickRoof(ctx, 'casa', r() < 0.3 ? 'hip' : 'gable');
  const fh = 0.95, base = 0.18, H = floors * fh, yt = base + H;
  const shop = r() < 0.35 && w >= 2.2;
  const balc = r() < 0.5;
  const balcFloor = r.int(1, Math.max(1, floors - 1));
  const archDoor = r() < 0.4;

  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.12, base - fBottom, d + 0.12], PAL.foundation, null, L.STONE);
  S.add('box', [0, base + H / 2, 0], [w, H, d], facade, null, L.PLASTER);
  S.add('box', [0, base + 0.3, 0], [w + 0.04, 0.6, d + 0.04], facade.clone().multiplyScalar(0.8), null, L.PLASTER);
  for (let f = 1; f < floors; f++) S.add('box', [0, base + f * fh, 0], [w + 0.05, 0.06, d + 0.05], trim, null, L.ASHLAR);
  if (r() < 0.65) quoins(ctx, w, d, base, yt, trim);
  S.add('box', [0, yt - 0.07, 0], [w + 0.12, 0.16, d + 0.12], trim, null, L.ASHLAR);

  let roof;
  const rh = Math.min(w, d) * (roofType === 'hip' ? 0.32 : 0.36);
  if (roofType === 'flat') roof = roofFlat(ctx, w, d, yt, facade);
  else {
    roof = roofType === 'hip' ? roofHip(S, w, d, yt, rh, 0.2, rs) : roofGable(S, w, d, yt, rh, 0.2, rs, facade);
    const nCh = r.int(1, 2);
    for (let i = 0; i < nCh; i++) chimney(ctx, roof, (r() - 0.5) * roof.L * 0.4, roof.Sd * r.range(0.05, 0.2) * (i ? -1 : 1), yt, rh);
  }

  boxFaces(w, d).forEach((f) => {
    const n = windowCount(f.len);
    const doorIdx = f.front ? Math.floor((n - 1) / 2) : -1;
    for (let fl = 0; fl < floors; fl++) {
      const yy = base + fl * fh + fh * 0.55;
      if (f.front && fl === 0 && shop) {
        const doorU = -w / 2 + 0.45;
        doorAt(ctx, f, doorU, base, { dw: 0.45, dh: 0.8, color: PAL.door, frame: trim });
        const sw = w - 1.2, su = doorU + 0.45 + sw / 2;
        const [gx, gz] = f.place(su, 0.03);
        ctx.L.add('box', [gx, base + 0.5, gz], [sw, 0.66, 0.04], PAL.white, [0, f.rot, 0]);
        const [fx, fz] = f.place(su, 0.012);
        S.add('box', [fx, base + 0.5, fz], [sw + 0.12, 0.78, 0.03], PAL.wood, null, L.WOOD);
        awningAt(ctx, f, su, base + 0.98, sw + 0.2, r.pick(AWNINGS).map(col));
        continue;
      }
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n);
        if (fl === 0 && k === doorIdx) {
          doorAt(ctx, f, u, base, { dw: 0.48, dh: archDoor ? 0.7 : 0.86, color: r() < 0.5 ? PAL.door : PAL.doorGreen, frame: trim, arch: archDoor });
          continue;
        }
        windowAt(ctx, f, u, yy, { ww: 0.32, wh: 0.48, frame: trim, shutter, sill: trim, pot: fl > 0 && r() < 0.25 });
        if (balc && floors > 1 && f.front && fl === balcFloor && k === doorIdx) balconyAt(ctx, f, u, yy - 0.3, Math.min(0.95, f.len / n));
      }
    }
  });
  return roof.top;
}

function palazzo(ctx, dims) {
  const { S, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const facade = facadeColor(ctx, FACADES.palazzo);
  const stone = jitter(col('#c4b8a2'), r, 0.04);
  const trim = PAL.trim;
  const shutter = col(r.pick(SHUTTERS));
  const rs = roofStyle(ctx, r() < 0.5 ? 'coppi' : 'ardesia');
  const roofType = pickRoof(ctx, 'palazzo', 'hip');
  const fh = 1.0, base = 0.2, H = floors * fh, yt = base + H;

  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.14, base - fBottom, d + 0.14], PAL.foundation, null, L.STONE);
  S.add('box', [0, base + fh / 2, 0], [w + 0.03, fh, d + 0.03], stone, null, L.ASHLAR);
  S.add('box', [0, base + fh + (H - fh) / 2, 0], [w, H - fh, d], facade, null, L.PLASTER);
  for (let f = 1; f < floors; f++) S.add('box', [0, base + f * fh, 0], [w + 0.07, 0.08, d + 0.07], trim, null, L.ASHLAR);
  quoins(ctx, w, d, base + fh, yt, stone, 0.26, L.ASHLAR);
  S.add('box', [0, yt - 0.1, 0], [w + 0.3, 0.22, d + 0.3], trim, null, L.ASHLAR);
  S.add('box', [0, yt - 0.25, 0], [w + 0.16, 0.1, d + 0.16], trim.clone().multiplyScalar(0.92), null, L.ASHLAR);
  let roof;
  const rh = Math.min(w, d) * 0.3;
  if (roofType === 'flat') roof = roofFlat(ctx, w, d, yt, facade);
  else {
    roof = roofType === 'gable' ? roofGable(S, w, d, yt, rh * 1.2, 0.28, rs, facade) : roofHip(S, w, d, yt, rh, 0.28, rs);
    chimney(ctx, roof, -roof.L * 0.25, roof.Sd * 0.12, yt, rh);
    chimney(ctx, roof, roof.L * 0.25, -roof.Sd * 0.12, yt, rh);
  }
  boxFaces(w, d).forEach((f) => {
    const n = windowCount(f.len, 1.0);
    const mid = Math.floor((n - 1) / 2);
    for (let fl = 0; fl < floors; fl++) {
      const yy = base + fl * fh + fh * 0.55;
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n);
        if (fl === 0) {
          if (f.front && k === mid) doorAt(ctx, f, u, base, { dw: 0.7, dh: 0.75, color: PAL.door, frame: PAL.stoneLight, arch: true });
          else windowAt(ctx, f, u, yy, { ww: 0.34, wh: 0.4, frame: PAL.stoneLight, arch: true, lit: 0.4 });
          continue;
        }
        const nobile = fl === 1;
        windowAt(ctx, f, u, yy, { ww: 0.36, wh: nobile ? 0.62 : 0.52, frame: trim, shutter, sill: trim, pediment: nobile, pot: nobile && r() < 0.3 });
      }
      if (fl === 1 && f.front) balconyAt(ctx, f, 0, base + fh + 0.12, f.len - 0.5);
    }
  });
  return roof.top;
}

export function pergola(ctx, x0, x1, z0, z1, yb, h) {
  const { S, r } = ctx;
  for (const [px, pz] of [[x0, z1], [x1, z1], [x0, z0 + 0.1], [x1, z0 + 0.1]]) {
    S.add('box', [px, yb + h / 2, pz], [0.09, h, 0.09], PAL.woodLight, null, L.WOOD);
  }
  for (const pz of [z0 + 0.1, z1]) S.add('box', [(x0 + x1) / 2, yb + h, pz], [x1 - x0 + 0.2, 0.08, 0.08], PAL.wood, null, L.WOOD);
  const slats = Math.max(3, Math.round((x1 - x0) / 0.35));
  for (let k = 0; k <= slats; k++) {
    S.add('box', [x0 + (k * (x1 - x0)) / slats, yb + h + 0.07, (z0 + z1) / 2], [0.05, 0.05, z1 - z0 + 0.25], PAL.woodLight, null, L.WOOD);
  }
  const blobs = Math.round((x1 - x0) * 2.2);
  const bloom = r.pick(PAL.bloom);
  for (let k = 0; k < blobs; k++) {
    const bx = x0 + r() * (x1 - x0), bz = z0 + r() * (z1 - z0);
    S.add('ico', [bx, yb + h + 0.14, bz], [r.range(0.18, 0.3), 0.12, r.range(0.18, 0.3)], r.pick(PAL.leaf), [r(), r() * 3, 0], L.LEAF);
    if (r() < 0.6) S.add('octa', [bx + r.range(-0.1, 0.1), yb + h + 0.22, bz + r.range(-0.1, 0.1)], [0.07, 0.07, 0.07], bloom, null, L.LEAF);
  }
  for (const px of [x0, x1]) {
    for (let k = 0; k < 4; k++) S.add('ico', [px + r.range(-0.06, 0.06), yb + 0.25 + k * h / 4, z1 + 0.04], [0.11, 0.14, 0.11], r.pick(PAL.leaf), [r(), r(), 0], L.LEAF);
  }
}

function villetta(ctx, dims) {
  const { S, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const facade = facadeColor(ctx, FACADES.villetta);
  const shutter = col(r.pick(SHUTTERS));
  const fh = 0.95, base = 0.18, H = floors * fh, yt = base + H;
  const roofType = pickRoof(ctx, 'villetta', r() < 0.45 ? 'flat' : 'gable');
  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.12, base - fBottom, d + 0.12], PAL.foundation, null, L.STONE);
  S.add('box', [0, base + H / 2, 0], [w, H, d], facade, null, L.PLASTER);
  S.add('box', [0, base + 0.2, 0], [w + 0.03, 0.4, d + 0.03], col('#c9bfae'), null, L.STONE);
  let top;
  if (roofType === 'flat') {
    roofFlat(ctx, w, d, yt, facade);
    pergola(ctx, -w / 2 + 0.25, -w / 2 + Math.min(1.4, w * 0.5), -d / 2 + 0.25, d / 2 - 0.25, yt + 0.06, 0.85);
    top = yt + 1.0;
  } else {
    const rh = Math.min(w, d) * 0.34;
    const roof = roofGable(S, w, d, yt, rh, 0.25, roofStyle(ctx, 'coppi'), facade);
    chimney(ctx, roof, roof.L * 0.25, roof.Sd * 0.12, yt, rh);
    top = roof.top;
  }
  if (dims.porch) {
    S.add('box', [0, base - 0.04, d / 2 + 0.55], [w, 0.1, 1.1], PAL.stoneLight, null, L.COBBLE);
    pergola(ctx, -w / 2 + 0.1, w / 2 - 0.1, d / 2, d / 2 + 1.05, base, 1.0);
  }
  boxFaces(w, d).forEach((f) => {
    const n = windowCount(f.len, 1.05);
    const doorIdx = f.front ? Math.floor((n - 1) / 2) : -1;
    for (let fl = 0; fl < floors; fl++) {
      const yy = base + fl * fh + fh * 0.55;
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n);
        if (fl === 0 && k === doorIdx) {
          doorAt(ctx, f, u, base, { dw: 0.5, dh: 0.84, color: PAL.woodLight, frame: PAL.trim });
          continue;
        }
        windowAt(ctx, f, u, yy, { ww: 0.36, wh: 0.46, frame: PAL.trim, shutter, sill: PAL.trim, pot: r() < 0.35 });
      }
    }
  });
  return top;
}

function chiesa(ctx, dims) {
  const { S, L: Lit, D, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const base = 0.2;
  const Hn = 2.0 + w * 0.3 + (floors - 2) * 0.6;
  const plaster = ctx.data.facade ? col(ctx.data.facade) : col(r.pick(['#efe3c8', '#f2e6d0', '#e8d9bd']));
  const striped = r() < 0.7;
  const dark = col('#3c3f46');
  const rs = roofStyle(ctx, r() < 0.6 ? 'ardesia' : 'coppi');
  const roofType = pickRoof(ctx, 'chiesa', 'gable');
  const fz = d / 2 - 0.15;

  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.15, base - fBottom, d + 0.15], PAL.foundation, null, L.STONE);
  S.add('box', [0, base + Hn / 2, -0.15], [w - 0.1, Hn, d - 0.3], plaster, null, L.PLASTER);
  const bh = 0.24;
  let k = 0;
  for (let y = base; y < base + Hn - 0.01; y += bh, k++) {
    S.add('box', [0, y + bh / 2, fz], [w, bh, 0.3], striped ? (k % 2 ? dark : PAL.white) : plaster, null, striped ? L.ASHLAR : L.PLASTER);
  }
  const rh = w * 0.4;
  for (let y = base + Hn; ; y += bh, k++) {
    const width = w * (1 - (y - base - Hn) / rh);
    if (width < 0.25) break;
    S.add('box', [0, y + bh / 2, fz], [width, bh, 0.3], striped ? (k % 2 ? dark : PAL.white) : plaster, null, striped ? L.ASHLAR : L.PLASTER);
  }
  S.add('box', [0, base + Hn + rh + 0.15, fz + 0.1], [0.06, 0.5, 0.06], PAL.iron, null, L.PLAIN);
  S.add('box', [0, base + Hn + rh + 0.25, fz + 0.1], [0.3, 0.06, 0.06], PAL.iron, null, L.PLAIN);
  if (roofType === 'dome') {
    S.add('box', [0, base + Hn + 0.05, -0.15], [w - 0.1, 0.1, d - 0.3], PAL.stoneLight, null, L.ASHLAR);
    const dr = Math.min(w, d) * 0.36;
    S.add('cyl16', [0, base + Hn + 0.45, -0.3], [dr, 0.8, dr], plaster, null, L.PLASTER);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      D.add('box', [Math.cos(a) * dr, base + Hn + 0.45, -0.3 + Math.sin(a) * dr], [0.16, 0.4, 0.06], PAL.white, [0, -a + Math.PI / 2, 0]);
    }
    S.add('ico1', [0, base + Hn + 0.85, -0.3], [dr + 0.05, dr * 0.95, dr + 0.05], rs.color, null, rs.layer);
    S.add('cyl8', [0, base + Hn + 0.85 + dr, -0.3], [0.12, 0.35, 0.12], PAL.stoneLight, null, L.ASHLAR);
    S.add('box', [0, base + Hn + 1.25 + dr, -0.3], [0.04, 0.3, 0.04], PAL.gold, null, L.PLAIN);
  } else {
    roofGable(S, w - 0.1, d - 0.45, base + Hn, Math.min(w, d) * 0.36, 0.12, rs, plaster, [0, 0, -0.22]);
  }

  const ry = base + Hn * 0.82;
  S.add('cyl16', [0, ry, fz + 0.16], [0.44, 0.05, 0.44], PAL.stoneLight, [Math.PI / 2, 0, 0], L.ASHLAR);
  Lit.add('cyl16', [0, ry, fz + 0.19], [0.34, 0.05, 0.34], PAL.white, [Math.PI / 2, 0, 0]);
  for (let s = 0; s < 4; s++) S.add('box', [0, ry, fz + 0.22], [0.66, 0.035, 0.02], PAL.stoneLight, [0, 0, (s * Math.PI) / 4], L.ASHLAR);
  const front = boxFaces(w, d)[0];
  doorAt(ctx, front, 0, base, { dw: 0.7, dh: 0.95, color: PAL.door, frame: PAL.stoneLight, arch: true });
  S.add('box', [0, base - 0.1, d / 2 + 0.4], [w * 0.6, 0.12, 0.5], PAL.stoneLight, null, L.ASHLAR);

  const side = boxFaces(w - 0.1, d - 0.3);
  for (const f of [side[2], side[3]]) {
    for (const u of [-0.3, 0, 0.3]) {
      const [x, z] = f.place(u * (d - 0.3), 0.03);
      Lit.add('box', [x, base + Hn * 0.55, z - 0.15], [0.24, 0.7, 0.04], PAL.white, [0, f.rot, 0]);
      Lit.add('arch', [x, base + Hn * 0.55 + 0.35, z - 0.15], [0.12, 0.12, 0.04], PAL.white, [0, f.rot, 0]);
    }
  }
  S.add('cyl12', [0, base + Hn * 0.4, -d / 2 + 0.1], [w * 0.32, Hn * 0.8, w * 0.32], plaster, null, L.PLASTER);
  S.add('cone12', [0, base + Hn * 0.8 + 0.3, -d / 2 + 0.1], [w * 0.35, 0.6, w * 0.35], rs.color, null, rs.layer);

  const cx = w / 2 + 0.55, cz = -d / 2 + 0.65, cs = 1.0;
  const Hc = base + Hn + 3.2;
  const tower = striped ? PAL.white : plaster;
  S.add('box', [cx, (fBottom + Hc - 1.0) / 2, cz], [cs, Hc - 1.0 - fBottom, cs], tower, null, L.ASHLAR);
  if (striped) for (let y = base + 0.3; y < Hc - 1.0; y += bh * 2) S.add('box', [cx, y, cz], [cs + 0.02, bh, cs + 0.02], dark, null, L.ASHLAR);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.add('box', [cx + sx * (cs / 2 - 0.1), Hc - 0.5, cz + sz * (cs / 2 - 0.1)], [0.2, 1.0, 0.2], tower, null, L.ASHLAR);
  }
  S.add('box', [cx, Hc - 0.95, cz], [cs + 0.1, 0.1, cs + 0.1], PAL.stoneLight, null, L.ASHLAR);
  S.add('box', [cx, Hc + 0.05, cz], [cs + 0.16, 0.14, cs + 0.16], PAL.stoneLight, null, L.ASHLAR);
  S.add('ico1', [cx, Hc - 0.45, cz], [0.2, 0.26, 0.2], PAL.gold, null, L.PLAIN);
  S.add('pyr4', [cx, Hc + 0.65, cz], [cs + 0.15, 1.1, cs + 0.15], rs.color, null, rs.layer);
  S.add('box', [cx, Hc + 1.35, cz], [0.05, 0.45, 0.05], PAL.iron, null, L.PLAIN);
  S.add('box', [cx, Hc + 1.42, cz], [0.24, 0.05, 0.05], PAL.iron, null, L.PLAIN);
  if (r() < 0.6) {
    S.add('cyl16', [cx, Hc - 1.6, cz + cs / 2 + 0.02], [0.3, 0.04, 0.3], PAL.white, [Math.PI / 2, 0, 0], L.PLAIN);
    S.add('box', [cx, Hc - 1.52, cz + cs / 2 + 0.05], [0.03, 0.2, 0.02], PAL.iron, null, L.PLAIN);
    S.add('box', [cx + 0.06, Hc - 1.6, cz + cs / 2 + 0.05], [0.14, 0.03, 0.02], PAL.iron, null, L.PLAIN);
  }
  return Hc + 1.5;
}

// Fortified gate: two towers, an arched passage and a half-raised portcullis.
function porta(ctx, dims, group) {
  const { S, D, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const stone = ctx.data.facade ? col(ctx.data.facade) : jitter(col(r.pick(['#cdb898', '#c2b8a8', '#d4c3a3'])), r, 0.04);
  const light = stone.clone().lerp(PAL.white, 0.3);
  const H = 1.6 + floors * 0.8;
  const tw = Math.min(1.5, w * 0.32);
  const td = Math.max(tw, d + 0.4);
  const gw = w - 2 * tw;
  const ph = Math.min(1.9, H * 0.5);
  const ar = gw / 2;
  const top = pickRoof(ctx, 'porta', r() < 0.6 ? 'merli' : 'cono');
  const rs = roofStyle(ctx, 'ardesia');
  const round = r() < 0.5;
  // Block above the passage, with a stepped arch underneath
  S.add('box', [0, (ph + ar + H) / 2, 0], [gw + 0.02, H - ph - ar, d], stone, null, L.ASHLAR);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const xc = -ar + (i + 0.5) * (gw / n);
    const yb = ph + Math.sqrt(Math.max(ar * ar - xc * xc, 0));
    if (ph + ar - yb > 0.01) S.add('box', [xc, (yb + ph + ar) / 2, 0], [gw / n + 0.01, ph + ar - yb, d], stone, null, L.ASHLAR);
  }
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    for (const side of [-1, 1]) {
      S.add('box', [-Math.cos(a) * (ar + 0.08), ph + Math.sin(a) * (ar + 0.08), side * (d / 2 + 0.02)], [0.22, 0.14, 0.06], light, [0, 0, a - Math.PI / 2], L.ASHLAR);
    }
  }
  S.add('box', [0, 0.02, 0], [gw, 0.06, d + 0.4], PAL.stoneLight, null, L.COBBLE);
  // Portcullis
  const pcTop = ph + ar * 0.85, pcBottom = ph * 0.55;
  for (let x = -gw / 2 + 0.12; x < gw / 2 - 0.05; x += 0.2) {
    const yTop = Math.min(pcTop, ph + Math.sqrt(Math.max(ar * ar - x * x, 0)) - 0.02);
    D.add('box', [x, (pcBottom + yTop) / 2, d / 2 - 0.1], [0.05, yTop - pcBottom, 0.05], PAL.iron);
    D.add('cone8', [x, pcBottom - 0.08, d / 2 - 0.1], [0.04, 0.16, 0.04], PAL.iron, [Math.PI, 0, 0]);
  }
  for (let y = pcBottom + 0.15; y < pcTop; y += 0.25) D.add('box', [0, y, d / 2 - 0.1], [gw - 0.1, 0.04, 0.05], PAL.iron);
  // Battlements on the block
  for (let x = -gw / 2 + 0.2; x < gw / 2; x += 0.55) {
    for (const side of [-1, 1]) S.add('box', [x, H + 0.2, side * (d / 2 - 0.1)], [0.32, 0.4, 0.2], stone, null, L.ASHLAR);
  }
  // Flanking towers
  const th = H + 1.0;
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - tw / 2);
    if (round) {
      S.add('cyl16', [x, (fBottom + th) / 2, 0], [tw / 2 + 0.05, th - fBottom, td / 2], stone, null, L.ASHLAR);
    } else {
      S.add('box', [x, (fBottom + th) / 2, 0], [tw, th - fBottom, td], stone, null, L.ASHLAR);
      for (let y = 0.2; y < th - 0.2; y += 0.34) {
        for (const [qx, qz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) S.add('box', [x + qx * (tw / 2 - 0.1), y, qz * (td / 2 - 0.1)], [0.22, 0.24, 0.22], light, null, L.ASHLAR);
      }
    }
    S.add('box', [x, th + 0.06, 0], [tw + 0.2, 0.14, td + 0.2], light, null, L.ASHLAR);
    for (const y of [th * 0.45, th * 0.75]) {
      D.add('box', [x, y, td / 2 + 0.01], [0.12, 0.42, 0.04], PAL.white);
      D.add('box', [x, y, -td / 2 - 0.01], [0.12, 0.42, 0.04], PAL.white);
    }
    if (top === 'merli') {
      for (const [mx, mz] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]]) {
        S.add('box', [x + mx * (tw / 2 - 0.15), th + 0.38, mz * (td / 2 - 0.15)], [0.3, 0.42, 0.3], stone, null, L.ASHLAR);
      }
    } else if (top === 'cono') {
      S.add('cone12', [x, th + 1.0, 0], [tw * 0.72, 1.9, td * 0.72], rs.color, null, rs.layer);
      S.add('box', [x, th + 2.1, 0], [0.04, 0.4, 0.04], PAL.gold, null, L.PLAIN);
    } else {
      S.add('pyr4', [x, th + 0.6, 0], [tw + 0.25, 1.1, td + 0.25], rs.color, null, rs.layer);
    }
  }
  return th + (top === 'merli' ? 0.6 : 2.1);
}

// Windmill: round stone body, conical cap and sails that turn in the wind.
function mulino(ctx, dims, group) {
  const { S, L: Lit, D, r, fBottom } = ctx;
  const { w, floors } = dims;
  const R = w / 2;
  const H = 1.6 + floors * 0.9;
  const body = ctx.data.facade ? col(ctx.data.facade) : col(r.pick(['#efe7d8', '#e3d6bf', '#d9cdb8']));
  const rs = roofStyle(ctx, 'scuro');
  S.add(new THREE.CylinderGeometry(R * 0.82, R, 1, 16, 1).toNonIndexed(), [0, (fBottom + H) / 2, 0], [1, H - fBottom, 1], body, null, L.STONE);
  S.add('cyl16', [0, H + 0.05, 0], [R * 0.9, 0.12, R * 0.9], PAL.wood, null, L.WOOD);
  S.add('cone12', [0, H + 0.75, 0], [R * 0.95, 1.4, R * 0.95], rs.color, null, rs.layer);
  const front = R * 0.83;
  S.add('box', [0, 0.5, R - 0.02], [0.5, 0.95, 0.12], PAL.door, null, L.WOOD);
  S.add('arch', [0, 0.97, R - 0.02], [0.25, 0.2, 0.12], PAL.door, null, L.WOOD);
  for (const [a, y] of [[0.9, H * 0.45], [-1.1, H * 0.6], [2.6, H * 0.35], [0, H * 0.72]]) {
    const rr = R - (R - R * 0.82) * (y / H);
    (r() < 0.5 ? Lit : D).add('box', [Math.sin(a) * rr, y, Math.cos(a) * rr], [0.26, 0.36, 0.06], PAL.white, [0, a, 0]);
  }
  const hubY = H + 0.35;
  S.add('cyl8', [0, hubY, front + 0.25], [0.12, 0.6, 0.12], PAL.wood, [Math.PI / 2, 0, 0], L.WOOD);
  const sails = new GeoBuilder(L.WOOD);
  const len = H * 0.75 + 0.6;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    sails.add('box', [ca * len / 2, sa * len / 2, 0], [len, 0.07, 0.06], PAL.wood, [0, 0, a]);
    sails.add('box', [ca * (len * 0.6) - sa * 0.22, sa * (len * 0.6) + ca * 0.22, 0.02], [len * 0.75, 0.42, 0.02], PAL.white, [0, 0, a], L.PLAIN);
    for (let k = 1; k <= 4; k++) sails.add('box', [ca * (len * k / 5) - sa * 0.22, sa * (len * k / 5) + ca * 0.22, 0.03], [0.03, 0.46, 0.03], PAL.wood, [0, 0, a]);
  }
  sails.add('cyl8', [0, 0, 0], [0.18, 0.2, 0.18], PAL.iron, [Math.PI / 2, 0, 0], L.PLAIN);
  const sailMesh = finish([[sails, MAT.solid]], ctx.ghost).children[0];
  sailMesh.position.set(0, hubY, front + 0.55);
  group.add(sailMesh);
  ctx.anim.push((t) => { sailMesh.rotation.z = t * 0.6; });
  return H + 1.5;
}

const STYLE_FN = { casa, palazzo, villetta, chiesa, porta, mulino, ...EXTRA_STYLES };

export function buildHouse(data, opts = {}) {
  const style = STYLE_FN[data.style] ? data.style : 'casa';
  const d0 = { ...data, style };
  const rect = houseRect(d0);
  const dims = rect.dims;
  const groundY = () => groundRange(getHeight, rect.x, rect.z, data.ang, rect.hw, rect.hd);
  const g = groundY();
  const y0 = g.hi;
  const extra = new THREE.Group();
  const ctx = {
    S: new GeoBuilder(), L: new GeoBuilder(), D: new GeoBuilder(), C: new GeoBuilder(), r: rng(data.seed),
    fBottom: g.lo - y0 - 0.6, data: d0, ghost: opts.ghost, anim: [],
  };
  const top = STYLE_FN[style](ctx, dims, extra);
  const group = finish([[ctx.S, MAT.solid], [ctx.L, MAT.glassLit], [ctx.D, MAT.glassDark], [ctx.C, MAT.glassClear]], opts.ghost);
  for (const c of [...extra.children]) group.add(c);
  group.position.set(data.x, y0, data.z);
  group.rotation.y = data.ang;
  const c = Math.cos(data.ang), s = Math.sin(data.ang);
  const local = (x, z) => {
    const dx = x - rect.x, dz = z - rect.z;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  // What blocks a walker: a gate is open in the middle
  let solids = null;
  if (style === 'porta') {
    const tw = Math.min(1.5, dims.w * 0.32);
    solids = [-1, 1].map((sx) => {
      const lx = sx * (dims.w / 2 - tw / 2);
      return { type: 'rect', x: data.x + lx * c, z: data.z - lx * s, hw: tw / 2, hd: Math.max(tw, dims.d + 0.4) / 2, ang: data.ang };
    });
  }
  return {
    group,
    rect,
    solids,
    bounds: { x: rect.x, z: rect.z, r: Math.hypot(rect.hw, rect.hd) },
    meta: { y0, top: y0 + top, w: dims.w, d: dims.d, floors: dims.floors, style },
    animate: ctx.anim.length ? (t) => ctx.anim.forEach((f) => f(t)) : null,
    hitDist: (x, z) => {
      const [lx, lz] = local(x, z);
      return Math.hypot(Math.max(Math.abs(lx) - rect.hw, 0), Math.max(Math.abs(lz) - rect.hd, 0));
    },
    groundY: () => groundY().hi,
  };
}
