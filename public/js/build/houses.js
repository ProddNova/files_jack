import { GeoBuilder, rng, col, jitter, clamp } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, finish, boxFaces, groundRange } from './common.js';

const FACADES = {
  casa: ['#f0b64f', '#e98b5e', '#f4c9a3', '#d8654f', '#f6dc8e', '#e9a3a1', '#f1e4c8', '#cf7d4c', '#f2a65a', '#e7c27d'],
  palazzo: ['#c8553d', '#e0a33a', '#d98e6c', '#e9c37a', '#b8483a', '#d6b25e'],
  villetta: ['#f4efe4', '#f6e3c6', '#e8eef0', '#f3d9d0', '#e9f0dc', '#fbe9b7'],
};
const SHUTTERS = ['#3d6e4c', '#466f58', '#35624a', '#4f7a5a', '#4d7f86', '#6b8f71'];
const AWNINGS = [['#c8202e', '#f6f3ec'], ['#2f6fa8', '#f6f3ec'], ['#3d8a5a', '#f2e6c8'], ['#e0a526', '#f6f3ec']];

export const HOUSE_STYLES = ['casa', 'palazzo', 'villetta', 'chiesa'];

// Size of a house, decided only by style, width and seed: placement and drawing agree.
// ox/oz: where the real footprint center is, relative to the house origin.
export function houseDims(style, w, seed) {
  const r = rng((seed ^ 0x9e3779b9) >>> 0);
  if (style === 'palazzo') {
    const W = clamp(w, 3, 7);
    return { w: W, d: clamp(W * r.range(0.6, 0.8), 3, 4.6), floors: r.int(4, 5), ox: 0, oz: 0, ew: 0, ed: 0 };
  }
  if (style === 'villetta') {
    const W = clamp(w, 2, 4.8);
    const porch = r() < 0.6;
    return { w: W, d: clamp(W * r.range(0.6, 0.85), 1.8, 3.4), floors: r.int(1, 2), porch, flat: r() < 0.45, ox: 0, oz: porch ? 0.55 : 0, ew: 0, ed: porch ? 1.1 : 0 };
  }
  if (style === 'chiesa') {
    const W = clamp(w, 2.6, 4.4);
    return { w: W, d: W * 1.65, floors: 0, ox: 0.55, oz: 0, ew: 1.1, ed: 0 };
  }
  const W = clamp(w, 1.4, 5.5);
  return { w: W, d: clamp(W * r.range(0.55, 0.85), 1.6, 3.6), floors: clamp((W < 2.4 ? 3 : 2) + r.int(0, 2), 2, 5), ox: 0, oz: 0, ew: 0, ed: 0 };
}

// Footprint as a rotated rectangle in world space.
export function houseRect(data) {
  const dims = houseDims(data.style || 'casa', data.w, data.seed);
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

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function faceNormal(a, b, c, k) {
  const u = sub(b, a), v = sub(c, a);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l * k, n[1] / l * k, n[2] / l * k];
}
const add3 = (a, n) => [a[0] + n[0], a[1] + n[1], a[2] + n[2]];

// Thin raised strips on a roof face: rows (slate) or channels (terracotta tiles).
function roofTexture(S, A, B, C, D, color, channels) {
  const n = faceNormal(A, B, C, 0.014);
  if (channels) {
    const len = Math.hypot(...sub(B, A));
    const cols = Math.max(2, Math.floor(len / 0.2));
    for (let k = 1; k < cols; k++) {
      const t = k / cols, t2 = t + 0.035 / len;
      S.quad(add3(lerp3(A, B, t), n), add3(lerp3(A, B, t2), n), add3(lerp3(D, C, t2), n), add3(lerp3(D, C, t), n), color);
    }
  } else {
    const len = Math.hypot(...sub(D, A));
    const rows = Math.max(2, Math.floor(len / 0.24));
    for (let k = 1; k < rows; k++) {
      const t = k / rows, t2 = t + 0.03 / len;
      S.quad(add3(lerp3(A, D, t), n), add3(lerp3(B, C, t), n), add3(lerp3(B, C, t2), n), add3(lerp3(A, D, t2), n), color);
    }
  }
}

function roofMap(w, d, off = [0, 0, 0]) {
  const ridgeX = w >= d;
  const P = ridgeX
    ? (u, y, v) => [u + off[0], y + off[1], v + off[2]]
    : (u, y, v) => [v + off[0], y + off[1], -u + off[2]];
  return { ridgeX, P, L: ridgeX ? w : d, Sd: ridgeX ? d : w };
}

function roofGable(S, w, d, yt, rh, o, color, gableCol, off) {
  const { ridgeX, P, L, Sd } = roofMap(w, d, off);
  const Lr = L + 2 * o, Sr = Sd + 2 * o;
  const c2 = color.clone().multiplyScalar(0.86);
  const terracotta = color.r > color.b * 1.3;
  const A1 = P(-Lr / 2, yt, Sr / 2), B1 = P(Lr / 2, yt, Sr / 2), C1 = P(Lr / 2, yt + rh, 0), D1 = P(-Lr / 2, yt + rh, 0);
  const A2 = P(Lr / 2, yt, -Sr / 2), B2 = P(-Lr / 2, yt, -Sr / 2), C2 = P(-Lr / 2, yt + rh, 0), D2 = P(Lr / 2, yt + rh, 0);
  S.quad(A1, B1, C1, D1, color);
  S.quad(A2, B2, C2, D2, c2);
  roofTexture(S, A1, B1, C1, D1, color.clone().multiplyScalar(0.8), terracotta);
  roofTexture(S, A2, B2, C2, D2, c2.clone().multiplyScalar(0.8), terracotta);
  S.tri(P(L / 2, yt, Sr / 2), P(L / 2, yt, -Sr / 2), P(L / 2, yt + rh, 0), gableCol);
  S.tri(P(-L / 2, yt, -Sr / 2), P(-L / 2, yt, Sr / 2), P(-L / 2, yt + rh, 0), gableCol);
  S.add('box', P(0, yt + rh, 0), [Lr + 0.02, 0.09, 0.16], color.clone().multiplyScalar(0.72), [0, ridgeX ? 0 : Math.PI / 2, 0]);
  return { P, L, Sd, ridgeX, top: yt + rh };
}

function roofHip(S, w, d, yt, rh, o, color, off) {
  const { ridgeX, P, L, Sd } = roofMap(w, d, off);
  const Lr = L + 2 * o, Sr = Sd + 2 * o;
  const r = (Lr - Sr) / 2;
  const terracotta = color.r > color.b * 1.3;
  const a = P(-Lr / 2, yt, Sr / 2), b = P(Lr / 2, yt, Sr / 2), c = P(Lr / 2, yt, -Sr / 2), dd = P(-Lr / 2, yt, -Sr / 2);
  const R1 = P(-r, yt + rh, 0), R2 = P(r, yt + rh, 0);
  const shades = [1, 0.86, 0.93, 0.8].map((k) => color.clone().multiplyScalar(k));
  S.quad(a, b, R2, R1, shades[0]);
  S.quad(c, dd, R1, R2, shades[1]);
  S.tri(b, c, R2, shades[2]);
  S.tri(dd, a, R1, shades[3]);
  roofTexture(S, a, b, R2, R1, shades[0].clone().multiplyScalar(0.8), terracotta);
  roofTexture(S, c, dd, R1, R2, shades[1].clone().multiplyScalar(0.8), terracotta);
  if (r > 0.05) S.add('box', P(0, yt + rh, 0), [r * 2 + 0.1, 0.09, 0.16], color.clone().multiplyScalar(0.72), [0, ridgeX ? 0 : Math.PI / 2, 0]);
  return { P, L, Sd, ridgeX, top: yt + rh };
}

// ---------- Facade pieces ----------

function windowAt(ctx, face, u, y, o) {
  const { S, L, D, r } = ctx;
  const rot = [0, face.rot, 0];
  const { ww, wh } = o;
  if (o.frame) {
    const [fx, fz] = face.place(u, 0.012);
    S.add('box', [fx, y, fz], [ww + 0.16, wh + 0.14, 0.025], o.frame, rot);
    if (o.arch) S.add('arch', [fx, y + wh / 2 + 0.07, fz], [ww / 2 + 0.08, ww / 2 + 0.06, 0.025], o.frame, rot);
    if (o.pediment) S.add('box', [fx, y + wh / 2 + 0.16, fz + 0], [ww + 0.3, 0.07, 0.06], o.frame, rot);
  }
  const [gx, gz] = face.place(u, 0.03);
  const G = r() < (o.lit ?? 0.55) ? L : D;
  G.add('box', [gx, y, gz], [ww, wh, 0.04], PAL.white, rot);
  if (o.arch) G.add('arch', [gx, y + wh / 2, gz], [ww / 2, ww / 2 * 0.95, 0.04], PAL.white, rot);
  if (o.shutter) {
    for (const side of [-1, 1]) {
      const [sx, sz] = face.place(u + side * (ww / 2 + 0.085), 0.05);
      S.add('box', [sx, y, sz], [0.15, wh + 0.04, 0.035], o.shutter, rot);
    }
  }
  if (o.sill) {
    const [lx, lz] = face.place(u, 0.06);
    S.add('box', [lx, y - wh / 2 - 0.05, lz], [ww + 0.14, 0.05, 0.12], o.sill, rot);
  }
  if (o.pot) {
    const [px, pz] = face.place(u, 0.11);
    S.add('box', [px, y - wh / 2 + 0.02, pz], [ww * 0.8, 0.1, 0.1], PAL.pot, rot);
    const bloom = r.pick(PAL.bloom);
    for (const k of [-1, 0, 1]) {
      const [qx, qz] = face.place(u + k * ww * 0.27, 0.12);
      S.add('octa', [qx, y - wh / 2 + 0.12, qz], [0.075, 0.075, 0.075], k === 0 ? PAL.leaf[0] : bloom);
    }
  }
}

function doorAt(ctx, face, u, base, o) {
  const { S } = ctx;
  const rot = [0, face.rot, 0];
  const [fx, fz] = face.place(u, 0.012);
  S.add('box', [fx, base + o.dh / 2 + 0.04, fz], [o.dw + 0.18, o.dh + 0.1, 0.03], o.frame, rot);
  if (o.arch) S.add('arch', [fx, base + o.dh + 0.09, fz], [o.dw / 2 + 0.09, o.dw / 2 + 0.06, 0.03], o.frame, rot);
  const [dx, dz] = face.place(u, 0.035);
  S.add('box', [dx, base + o.dh / 2, dz], [o.dw, o.dh, 0.05], o.color, rot);
  if (o.arch) S.add('arch', [dx, base + o.dh, dz], [o.dw / 2, o.dw / 2 * 0.9, 0.05], o.color, rot);
  const [kx, kz] = face.place(u + o.dw * 0.3, 0.07);
  S.add('box', [kx, base + o.dh * 0.5, kz], [0.04, 0.04, 0.03], PAL.gold, rot);
  const [sx, sz] = face.place(u, 0.17);
  S.add('box', [sx, base - 0.02, sz], [o.dw + 0.3, 0.1, 0.3], PAL.stoneLight, rot);
}

function balconyAt(ctx, face, u, y, width) {
  const { S } = ctx;
  const rot = [0, face.rot, 0];
  const [bx, bz] = face.place(u, 0.2);
  S.add('box', [bx, y, bz], [width, 0.06, 0.4], PAL.trim, rot);
  const [rx, rz] = face.place(u, 0.38);
  S.add('box', [rx, y + 0.34, rz], [width, 0.03, 0.03], PAL.iron, rot);
  const posts = Math.max(3, Math.round(width / 0.14));
  for (let k = 0; k <= posts; k++) {
    const [px, pz] = face.place(u - width / 2 + (k * width) / posts, 0.38);
    S.add('box', [px, y + 0.18, pz], [0.02, 0.3, 0.02], PAL.iron, rot);
  }
  for (const side of [-1, 1]) {
    const [sx, sz] = face.place(u + side * width / 2, 0.2);
    S.add('box', [sx, y + 0.34, sz], [0.03, 0.03, 0.38], PAL.iron, rot);
  }
}

function awningAt(ctx, face, u, y, width, colors) {
  const { S } = ctx;
  const n = Math.max(4, Math.round(width / 0.17));
  for (let k = 0; k < n; k++) {
    const uk = u - width / 2 + (k + 0.5) * (width / n);
    const c = colors[k % 2];
    const [ax, az] = face.place(uk, 0.27);
    S.add('box', [ax, y - 0.1, az], [width / n + 0.002, 0.03, 0.56], c, [0.38, face.rot, 0]);
    const [vx, vz] = face.place(uk, 0.53);
    S.add('box', [vx, y - 0.27, vz], [width / n + 0.002, 0.12, 0.02], c, [0, face.rot, 0]);
  }
}

function quoins(ctx, w, d, y0, y1, color, size = 0.16) {
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    ctx.S.add('box', [sx * (w / 2 - size / 2 + 0.02), (y0 + y1) / 2, sz * (d / 2 - size / 2 + 0.02)], [size, y1 - y0, size], color);
  }
}

function windowCount(len, spacing = 0.95) {
  let n = Math.floor((len - 0.4) / spacing);
  if (n < 1) n = len >= 1.0 ? 1 : 0;
  return n;
}

function chimney(ctx, roof, u, v, yt, rh) {
  const yRoof = yt + rh * (1 - Math.abs(v) / (roof.Sd / 2 + 0.2));
  const p = roof.P(u, yRoof + 0.25, v);
  ctx.S.add('box', p, [0.28, 0.8, 0.28], PAL.chimney);
  ctx.S.add('box', [p[0], p[1] + 0.43, p[2]], [0.38, 0.08, 0.38], PAL.trim);
}

// ---------- Styles ----------

function casa(ctx, dims) {
  const { S, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const facade = col(r.pick(FACADES.casa));
  const trim = r() < 0.75 ? PAL.trim : PAL.cream;
  const shutter = col(r.pick(SHUTTERS));
  const roofCol = r() < 0.6 ? r.pick(PAL.terracotta) : PAL.slate;
  const hip = r() < 0.3;
  const fh = 0.95, base = 0.18, H = floors * fh, yt = base + H;
  const shop = r() < 0.35 && w >= 2.2;
  const balc = r() < 0.5;
  const balcFloor = r.int(1, floors - 1);
  const archDoor = r() < 0.4;

  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.12, base - fBottom, d + 0.12], PAL.foundation);
  S.add('box', [0, base + H / 2, 0], [w, H, d], facade);
  S.add('box', [0, base + 0.3, 0], [w + 0.04, 0.6, d + 0.04], facade.clone().multiplyScalar(0.8));
  for (let f = 1; f < floors; f++) S.add('box', [0, base + f * fh, 0], [w + 0.05, 0.06, d + 0.05], trim);
  if (r() < 0.65) quoins(ctx, w, d, base, yt, trim);
  S.add('box', [0, yt - 0.07, 0], [w + 0.12, 0.16, d + 0.12], trim);

  const rh = Math.min(w, d) * (hip ? 0.32 : 0.36);
  const roof = hip ? roofHip(S, w, d, yt, rh, 0.2, roofCol) : roofGable(S, w, d, yt, rh, 0.2, roofCol, facade);
  const nCh = r.int(1, 2);
  for (let i = 0; i < nCh; i++) chimney(ctx, roof, (r() - 0.5) * roof.L * 0.4, roof.Sd * r.range(0.05, 0.2) * (i ? -1 : 1), yt, rh);

  boxFaces(w, d).forEach((f, fi) => {
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
        S.add('box', [fx, base + 0.5, fz], [sw + 0.12, 0.78, 0.03], PAL.wood);
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
        if (balc && f.front && fl === balcFloor && k === doorIdx) balconyAt(ctx, f, u, yy - 0.3, Math.min(0.95, f.len / n));
      }
    }
  });
  return roof.top;
}

function palazzo(ctx, dims) {
  const { S, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const facade = col(r.pick(FACADES.palazzo));
  const stone = jitter(col('#c4b8a2'), r, 0.04);
  const trim = PAL.trim;
  const shutter = col(r.pick(SHUTTERS));
  const roofCol = r() < 0.5 ? r.pick(PAL.terracotta) : PAL.slate;
  const fh = 1.0, base = 0.2, H = floors * fh, yt = base + H;

  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.14, base - fBottom, d + 0.14], PAL.foundation);
  S.add('box', [0, base + fh / 2, 0], [w + 0.03, fh, d + 0.03], stone);
  for (let k = 1; k <= 4; k++) S.add('box', [0, base + k * fh / 5, 0], [w + 0.045, 0.025, d + 0.045], stone.clone().multiplyScalar(0.78));
  S.add('box', [0, base + fh + (H - fh) / 2, 0], [w, H - fh, d], facade);
  for (let f = 1; f < floors; f++) S.add('box', [0, base + f * fh, 0], [w + 0.07, 0.08, d + 0.07], trim);
  quoins(ctx, w, d, base + fh, yt, stone, 0.26);
  S.add('box', [0, yt - 0.1, 0], [w + 0.3, 0.22, d + 0.3], trim);
  S.add('box', [0, yt - 0.25, 0], [w + 0.16, 0.1, d + 0.16], trim.clone().multiplyScalar(0.92));
  const rh = Math.min(w, d) * 0.3;
  const roof = roofHip(S, w, d, yt, rh, 0.28, roofCol);
  chimney(ctx, roof, -roof.L * 0.25, roof.Sd * 0.12, yt, rh);
  chimney(ctx, roof, roof.L * 0.25, -roof.Sd * 0.12, yt, rh);

  boxFaces(w, d).forEach((f) => {
    const n = windowCount(f.len, 1.0);
    const mid = Math.floor((n - 1) / 2);
    for (let fl = 0; fl < floors; fl++) {
      const yy = base + fl * fh + fh * 0.55;
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n);
        if (fl === 0) {
          if (f.front && k === mid) {
            doorAt(ctx, f, u, base, { dw: 0.7, dh: 0.75, color: PAL.door, frame: PAL.stoneLight, arch: true });
          } else {
            windowAt(ctx, f, u, yy, { ww: 0.34, wh: 0.4, frame: PAL.stoneLight, arch: true, lit: 0.4 });
          }
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

function pergola(ctx, x0, x1, z0, z1, yb, h) {
  const { S, r } = ctx;
  for (const [px, pz] of [[x0, z1], [x1, z1], [x0, z0 + 0.1], [x1, z0 + 0.1]]) {
    S.add('box', [px, yb + h / 2, pz], [0.09, h, 0.09], PAL.woodLight);
  }
  for (const pz of [z0 + 0.1, z1]) S.add('box', [(x0 + x1) / 2, yb + h, pz], [x1 - x0 + 0.2, 0.08, 0.08], PAL.wood);
  const slats = Math.max(3, Math.round((x1 - x0) / 0.35));
  for (let k = 0; k <= slats; k++) {
    S.add('box', [x0 + (k * (x1 - x0)) / slats, yb + h + 0.07, (z0 + z1) / 2], [0.05, 0.05, z1 - z0 + 0.25], PAL.woodLight);
  }
  const blobs = Math.round((x1 - x0) * 2.2);
  const bloom = r.pick(PAL.bloom);
  for (let k = 0; k < blobs; k++) {
    const bx = x0 + r() * (x1 - x0), bz = z0 + r() * (z1 - z0);
    S.add('ico', [bx, yb + h + 0.14, bz], [r.range(0.18, 0.3), 0.12, r.range(0.18, 0.3)], r.pick(PAL.leaf), [r(), r() * 3, 0]);
    if (r() < 0.6) S.add('octa', [bx + r.range(-0.1, 0.1), yb + h + 0.22, bz + r.range(-0.1, 0.1)], [0.07, 0.07, 0.07], bloom);
  }
  // Vines climbing the front posts
  for (const px of [x0, x1]) {
    for (let k = 0; k < 4; k++) S.add('ico', [px + r.range(-0.06, 0.06), yb + 0.25 + k * h / 4, z1 + 0.04], [0.11, 0.14, 0.11], r.pick(PAL.leaf), [r(), r(), 0]);
  }
}

function villetta(ctx, dims) {
  const { S, r, fBottom } = ctx;
  const { w, d, floors } = dims;
  const facade = col(r.pick(FACADES.villetta));
  const shutter = col(r.pick(SHUTTERS));
  const fh = 0.95, base = 0.18, H = floors * fh, yt = base + H;
  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.12, base - fBottom, d + 0.12], PAL.foundation);
  S.add('box', [0, base + H / 2, 0], [w, H, d], facade);
  S.add('box', [0, base + 0.2, 0], [w + 0.03, 0.4, d + 0.03], col('#c9bfae'));
  let top;
  if (dims.flat) {
    S.add('box', [0, yt + 0.02, 0], [w + 0.06, 0.08, d + 0.06], PAL.trim);
    for (const [px, pz, sx, sz] of [[0, d / 2, w + 0.06, 0.1], [0, -d / 2, w + 0.06, 0.1], [w / 2, 0, 0.1, d], [-w / 2, 0, 0.1, d]]) {
      S.add('box', [px, yt + 0.2, pz], [sx, 0.32, sz], facade);
    }
    pergola(ctx, -w / 2 + 0.25, -w / 2 + Math.min(1.4, w * 0.5), -d / 2 + 0.25, d / 2 - 0.25, yt + 0.06, 0.85);
    top = yt + 1.0;
  } else {
    const roof = roofGable(S, w, d, yt, Math.min(w, d) * 0.34, 0.25, r.pick(PAL.terracotta), facade);
    chimney(ctx, roof, roof.L * 0.25, roof.Sd * 0.12, yt, Math.min(w, d) * 0.34);
    top = roof.top;
  }
  if (dims.porch) {
    S.add('box', [0, base - 0.04, d / 2 + 0.55], [w, 0.1, 1.1], PAL.stoneLight);
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
  const { S, L, D, r, fBottom } = ctx;
  const { w, d } = dims;
  const base = 0.2;
  const Hn = 2.6 + w * 0.3;
  const plaster = col(r.pick(['#efe3c8', '#f2e6d0', '#e8d9bd']));
  const striped = r() < 0.7;
  const dark = col('#3c3f46');
  const roofCol = r() < 0.6 ? PAL.slate : PAL.terracotta[0];
  const fz = d / 2 - 0.15;

  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.15, base - fBottom, d + 0.15], PAL.foundation);
  S.add('box', [0, base + Hn / 2, -0.15], [w - 0.1, Hn, d - 0.3], plaster);
  const bh = 0.24;
  let k = 0;
  for (let y = base; y < base + Hn - 0.01; y += bh, k++) {
    S.add('box', [0, y + bh / 2, fz], [w, bh, 0.3], striped ? (k % 2 ? dark : PAL.white) : plaster);
  }
  const rh = w * 0.4;
  for (let y = base + Hn; ; y += bh, k++) {
    const width = w * (1 - (y - base - Hn) / rh);
    if (width < 0.25) break;
    S.add('box', [0, y + bh / 2, fz], [width, bh, 0.3], striped ? (k % 2 ? dark : PAL.white) : plaster);
  }
  S.add('box', [0, base + Hn + rh + 0.15, fz + 0.1], [0.06, 0.5, 0.06], PAL.iron);
  S.add('box', [0, base + Hn + rh + 0.25, fz + 0.1], [0.3, 0.06, 0.06], PAL.iron);
  roofGable(S, w - 0.1, d - 0.45, base + Hn, Math.min(w, d) * 0.36, 0.12, roofCol, plaster, [0, 0, -0.22]);

  // Rose window and portal
  const ry = base + Hn * 0.82;
  S.add('cyl16', [0, ry, fz + 0.16], [0.44, 0.05, 0.44], PAL.stoneLight, [Math.PI / 2, 0, 0]);
  L.add('cyl16', [0, ry, fz + 0.19], [0.34, 0.05, 0.34], PAL.white, [Math.PI / 2, 0, 0]);
  for (let s = 0; s < 4; s++) S.add('box', [0, ry, fz + 0.22], [0.66, 0.035, 0.02], PAL.stoneLight, [0, 0, (s * Math.PI) / 4]);
  const front = boxFaces(w, d)[0];
  doorAt(ctx, front, 0, base, { dw: 0.7, dh: 0.95, color: PAL.door, frame: PAL.stoneLight, arch: true });
  S.add('box', [0, base - 0.1, d / 2 + 0.4], [w * 0.6, 0.12, 0.5], PAL.stoneLight);

  // Tall arched side windows
  const side = boxFaces(w - 0.1, d - 0.3);
  for (const f of [side[2], side[3]]) {
    for (const u of [-0.3, 0, 0.3]) {
      const [x, z] = f.place(u * (d - 0.3), 0.03);
      D.add('box', [x, base + Hn * 0.55, z - 0.15], [0.24, 0.7, 0.04], PAL.white, [0, f.rot, 0]);
      D.add('arch', [x, base + Hn * 0.55 + 0.35, z - 0.15], [0.12, 0.12, 0.04], PAL.white, [0, f.rot, 0]);
    }
  }
  // Apse at the back
  S.add('cyl12', [0, base + Hn * 0.4, -d / 2 + 0.1], [w * 0.32, Hn * 0.8, w * 0.32], plaster);
  S.add('cone12', [0, base + Hn * 0.8 + 0.3, -d / 2 + 0.1], [w * 0.35, 0.6, w * 0.35], roofCol);

  // Bell tower with an open belfry
  const cx = w / 2 + 0.55, cz = -d / 2 + 0.65, cs = 1.0;
  const Hc = base + Hn + 3.2;
  const tower = striped ? PAL.white : plaster;
  S.add('box', [cx, (fBottom + Hc - 1.0) / 2, cz], [cs, Hc - 1.0 - fBottom, cs], tower);
  if (striped) {
    for (let y = base + 0.3; y < Hc - 1.0; y += bh * 2) S.add('box', [cx, y, cz], [cs + 0.02, bh, cs + 0.02], dark);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.add('box', [cx + sx * (cs / 2 - 0.1), Hc - 0.5, cz + sz * (cs / 2 - 0.1)], [0.2, 1.0, 0.2], tower);
  }
  S.add('box', [cx, Hc - 0.95, cz], [cs + 0.1, 0.1, cs + 0.1], PAL.stoneLight);
  S.add('box', [cx, Hc + 0.05, cz], [cs + 0.16, 0.14, cs + 0.16], PAL.stoneLight);
  S.add('ico1', [cx, Hc - 0.45, cz], [0.2, 0.26, 0.2], PAL.gold);
  S.add('pyr4', [cx, Hc + 0.65, cz], [cs + 0.15, 1.1, cs + 0.15], roofCol);
  S.add('box', [cx, Hc + 1.35, cz], [0.05, 0.45, 0.05], PAL.iron);
  S.add('box', [cx, Hc + 1.42, cz], [0.24, 0.05, 0.05], PAL.iron);
  if (r() < 0.6) {
    S.add('cyl16', [cx, Hc - 1.6, cz + cs / 2 + 0.02], [0.3, 0.04, 0.3], PAL.white, [Math.PI / 2, 0, 0]);
    S.add('box', [cx, Hc - 1.52, cz + cs / 2 + 0.05], [0.03, 0.2, 0.02], PAL.iron);
    S.add('box', [cx + 0.06, Hc - 1.6, cz + cs / 2 + 0.05], [0.14, 0.03, 0.02], PAL.iron);
  }
  return Hc + 1.5;
}

const STYLE_FN = { casa, palazzo, villetta, chiesa };

export function buildHouse(data, opts = {}) {
  const style = STYLE_FN[data.style] ? data.style : 'casa';
  const rect = houseRect({ ...data, style });
  const dims = rect.dims;
  const groundY = () => groundRange(getHeight, rect.x, rect.z, data.ang, rect.hw, rect.hd);
  const g = groundY();
  const y0 = g.hi;
  const ctx = { S: new GeoBuilder(), L: new GeoBuilder(), D: new GeoBuilder(), r: rng(data.seed), fBottom: g.lo - y0 - 0.6 };
  const top = STYLE_FN[style](ctx, dims);
  const group = finish([[ctx.S, MAT.solid], [ctx.L, MAT.glassLit], [ctx.D, MAT.glassDark]], opts.ghost);
  group.position.set(data.x, y0, data.z);
  group.rotation.y = data.ang;
  const c = Math.cos(data.ang), s = Math.sin(data.ang);
  return {
    group,
    rect,
    bounds: { x: rect.x, z: rect.z, r: Math.hypot(rect.hw, rect.hd) },
    meta: { y0, top: y0 + top, w: dims.w, d: dims.d, floors: dims.floors, style },
    hitDist: (x, z) => {
      const dx = x - rect.x, dz = z - rect.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      return Math.hypot(Math.max(Math.abs(lx) - rect.hw, 0), Math.max(Math.abs(lz) - rect.hd, 0));
    },
    groundY: () => groundY().hi,
  };
}
