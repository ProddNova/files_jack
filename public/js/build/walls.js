import { GeoBuilder, rng, col, jitter, distToSegment2 } from '../util.js';
import { getHeight, pathAt } from '../terrain.js';
import { MAT, PAL, finish } from './common.js';

export const WALL_STYLES = ['muretto', 'mura', 'staccionata', 'siepe'];
const SPEC = {
  muretto: { H: 1.15, ht: 0.24 },
  mura: { H: 2.3, ht: 0.38 },
  staccionata: { H: 0.95, ht: 0.1 },
  siepe: { H: 0.95, ht: 0.32 },
};

export function wallHalf(style) {
  return (SPEC[style] || SPEC.muretto).ht;
}

function frames(pts) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return { nx: -tz, nz: tx, tx, tz, ang: Math.atan2(-tz, tx) };
  });
}

// Splits the wall into closed stretches, leaving gaps over paths and houses.
function closedRuns(open, n) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < n - 1; i++) {
    const closed = !open[i] && !open[i + 1];
    if (closed && start < 0) start = i;
    if (!closed && start >= 0) { runs.push([start, i]); start = -1; }
  }
  if (start >= 0) runs.push([start, n - 1]);
  return runs;
}

function ribbon(S, pts, fr, i0, i1, half, yb, yt, colorFn) {
  const Lb = [], Lt = [], Rb = [], Rt = [];
  for (let i = i0; i <= i1; i++) {
    const [x, z] = pts[i];
    const { nx, nz } = fr[i];
    const b = yb(i), t = yt(i);
    Lb.push([x + nx * half, b, z + nz * half]);
    Lt.push([x + nx * half, t, z + nz * half]);
    Rb.push([x - nx * half, b, z - nz * half]);
    Rt.push([x - nx * half, t, z - nz * half]);
  }
  const m = Lb.length;
  for (let k = 0; k < m - 1; k++) {
    const c = colorFn(i0 + k);
    S.quad(Lb[k], Lb[k + 1], Lt[k + 1], Lt[k], c);
    S.quad(Rb[k + 1], Rb[k], Rt[k], Rt[k + 1], c.clone().multiplyScalar(0.94));
    S.quad(Lt[k], Lt[k + 1], Rt[k + 1], Rt[k], c.clone().multiplyScalar(1.05));
  }
  const e = m - 1;
  S.quad(Rb[0], Lb[0], Lt[0], Rt[0], colorFn(i0));
  S.quad(Lb[e], Rb[e], Rt[e], Lt[e], colorFn(i1));
}

function looseStones(S, r, pts, fr, hs, i0, i1, half, H, colors) {
  for (let i = i0; i < i1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
    const { nx, nz, tx, tz, ang } = fr[i];
    const my = (hs[i] + hs[i + 1]) / 2;
    for (const side of [-1, 1]) {
      const count = r.int(1, 2);
      for (let k = 0; k < count; k++) {
        const along = r.range(-0.2, 0.2);
        S.add('box',
          [mx + tx * along + nx * side * (half + 0.015), my + r.range(0.15, H - 0.2), mz + tz * along + nz * side * (half + 0.015)],
          [r.range(0.22, 0.42), r.range(0.13, 0.24), 0.06],
          jitter(r.pick(colors), r, 0.1), [0, ang, 0]);
      }
    }
  }
}

// Merlons spaced evenly along the top of a stretch.
function merlons(S, pts, fr, hs, i0, i1, half, top, color) {
  let acc = 0.45;
  for (let i = i0; i < i1; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    acc += seg;
    if (acc < 0.9) continue;
    acc = 0;
    const [x, z] = pts[i];
    const { nx, nz, ang } = fr[i];
    for (const side of [-1, 1]) {
      S.add('box', [x + nx * side * (half - 0.08), hs[i] + top + 0.22, z + nz * side * (half - 0.08)], [0.42, 0.44, 0.18], color, [0, ang, 0]);
    }
  }
}

function muretto(ctx) {
  const { S, r, pts, fr, hs, runs } = ctx;
  const { H, ht } = SPEC.muretto;
  for (const [i0, i1] of runs) {
    const cols = [];
    for (let i = i0; i <= i1; i++) cols[i] = jitter(r() < 0.5 ? PAL.stone : PAL.stoneDark, r, 0.07);
    ribbon(S, pts, fr, i0, i1, ht, (i) => hs[i] - 1.0, (i) => hs[i] + H, (i) => cols[i]);
    ribbon(S, pts, fr, i0, i1, ht + 0.07, (i) => hs[i] + H, (i) => hs[i] + H + 0.14, () => PAL.stoneLight);
    looseStones(S, r, pts, fr, hs, i0, i1, ht, H, [PAL.stoneDark, PAL.stoneLight]);
    for (const i of [i0, i1]) {
      const [x, z] = pts[i];
      const top = hs[i] + H + 0.45;
      S.add('box', [x, (hs[i] - 1 + top) / 2, z], [0.66, top - hs[i] + 1, 0.66], jitter(PAL.stone, r, 0.05), [0, fr[i].ang, 0]);
      S.add('box', [x, top + 0.06, z], [0.8, 0.12, 0.8], PAL.stoneLight, [0, fr[i].ang, 0]);
      S.add('octa', [x, top + 0.3, z], [0.2, 0.26, 0.2], PAL.stoneLight, [0, fr[i].ang, 0]);
    }
  }
}

function mura(ctx) {
  const { S, r, pts, fr, hs, runs, pathGap } = ctx;
  const { H, ht } = SPEC.mura;
  const stone = jitter(col('#c9bca3'), r, 0.04);
  const n = pts.length;
  runs.forEach(([i0, i1], ri) => {
    const cols = [];
    for (let i = i0; i <= i1; i++) cols[i] = jitter(stone, r, 0.05);
    ribbon(S, pts, fr, i0, i1, ht, (i) => hs[i] - 1.0, (i) => hs[i] + H, (i) => cols[i]);
    ribbon(S, pts, fr, i0, i1, ht + 0.06, (i) => hs[i] + H * 0.62, (i) => hs[i] + H * 0.62 + 0.12, () => PAL.stoneLight);
    ribbon(S, pts, fr, i0, i1, ht + 0.06, (i) => hs[i] + H, (i) => hs[i] + H + 0.1, () => PAL.stoneLight);
    merlons(S, pts, fr, hs, i0, i1, ht + 0.06, H + 0.1, stone);
    looseStones(S, r, pts, fr, hs, i0, i1, ht, H * 0.6, [PAL.stoneDark, PAL.stoneLight]);
    for (const i of [i0, i1]) {
      const [x, z] = pts[i];
      const ang = fr[i].ang;
      const wallEnd = i === 0 || i === n - 1;
      const size = wallEnd ? 1.35 : 0.95;
      const top = hs[i] + H + (wallEnd ? 1.1 : 0.55);
      S.add('box', [x, (hs[i] - 1 + top) / 2, z], [size, top - hs[i] + 1, size], jitter(stone, r, 0.04), [0, ang, 0]);
      S.add('box', [x, top + 0.07, z], [size + 0.14, 0.14, size + 0.14], PAL.stoneLight, [0, ang, 0]);
      if (wallEnd) {
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          S.add('box', [x + Math.cos(ang) * sx * 0.5 + Math.sin(ang) * sz * 0.5, top + 0.36, z - Math.sin(ang) * sx * 0.5 + Math.cos(ang) * sz * 0.5], [0.3, 0.44, 0.3], stone, [0, ang, 0]);
        }
        ctx.D.add('box', [x + fr[i].nx * (size / 2 + 0.01), top - 0.7, z + fr[i].nz * (size / 2 + 0.01)], [0.12, 0.4, 0.04], PAL.white, [0, ang + Math.PI / 2, 0]);
      }
    }
    // Archway over a path crossing the wall
    const next = runs[ri + 1];
    if (next && pathGap(i1, next[0])) {
      const [ax, az] = pts[i1], [bx, bz] = pts[next[0]];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4.5) {
        const y = Math.max(hs[i1], hs[next[0]]) + H;
        const ang = Math.atan2(-(bz - az), bx - ax);
        S.add('box', [(ax + bx) / 2, y - 0.2, (az + bz) / 2], [len, 0.6, ht * 2], stone, [0, ang, 0]);
        S.add('box', [(ax + bx) / 2, y + 0.15, (az + bz) / 2], [len + 0.1, 0.12, ht * 2 + 0.12], PAL.stoneLight, [0, ang, 0]);
      }
    }
  });
}

function staccionata(ctx) {
  const { S, r, pts, hs, runs } = ctx;
  for (const [i0, i1] of runs) {
    const posts = [i0];
    let acc = 0;
    for (let i = i0 + 1; i <= i1; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc >= 1.0 || i === i1) { posts.push(i); acc = 0; }
    }
    for (const i of posts) {
      const [x, z] = pts[i];
      S.add('box', [x, hs[i] + 0.35, z], [0.13, 1.1, 0.13], jitter(PAL.wood, r, 0.08));
      S.add('pyr4', [x, hs[i] + 0.96, z], [0.15, 0.12, 0.15], PAL.wood);
    }
    for (let k = 0; k < posts.length - 1; k++) {
      const a = posts[k], b = posts[k + 1];
      const [ax, az] = pts[a], [bx, bz] = pts[b];
      const len = Math.hypot(bx - ax, bz - az);
      const dy = hs[b] - hs[a];
      const ang = Math.atan2(-(bz - az), bx - ax);
      for (const h of [0.42, 0.78]) {
        S.add('box', [(ax + bx) / 2, (hs[a] + hs[b]) / 2 + h, (az + bz) / 2], [Math.hypot(len, dy), 0.08, 0.05], jitter(PAL.woodLight, r, 0.08), [0, ang, Math.atan2(dy, len)]);
      }
    }
  }
}

function siepe(ctx) {
  const { S, r, pts, fr, hs, runs } = ctx;
  const { H, ht } = SPEC.siepe;
  const green = [col('#3f6b35'), col('#4a7a3c'), col('#365f30')];
  const bloom = r() < 0.4 ? r.pick(PAL.bloom) : null;
  for (const [i0, i1] of runs) {
    ribbon(S, pts, fr, i0, i1, ht, (i) => hs[i] - 0.3, (i) => hs[i] + H - 0.1, () => green[0]);
    for (let i = i0; i <= i1; i++) {
      const [x, z] = pts[i];
      S.add('ico', [x, hs[i] + H - 0.08, z], [ht + 0.1, 0.22, ht + 0.1], r.pick(green), [r(), r() * 3, 0]);
      for (const side of [-1, 1]) {
        if (r() < 0.6) S.add('ico', [x + fr[i].nx * side * ht, hs[i] + r.range(0.2, H - 0.2), z + fr[i].nz * side * ht], [0.16, 0.18, 0.16], r.pick(green), [r(), r(), 0]);
        if (bloom && r() < 0.4) S.add('octa', [x + fr[i].nx * side * (ht + 0.08), hs[i] + r.range(0.3, H), z + fr[i].nz * side * (ht + 0.08)], [0.06, 0.06, 0.06], bloom);
      }
    }
  }
}

const STYLE_FN = { muretto, mura, staccionata, siepe };

export function buildWall(data, opts = {}) {
  const style = STYLE_FN[data.style] ? data.style : 'muretto';
  const pts = data.pts;
  if (!pts || pts.length < 2) return null;
  const n = pts.length;
  const env = opts.env || {};
  const hs = pts.map(([x, z]) => getHeight(x, z));
  const onPath = pts.map(([x, z]) => pathAt(x, z) > 0.35);
  const open = pts.map(([x, z], i) => onPath[i] || (env.blockedAt ? env.blockedAt(x, z) : false));
  const ctx = {
    S: new GeoBuilder(), D: new GeoBuilder(), r: rng(data.seed),
    pts, fr: frames(pts), hs, runs: closedRuns(open, n),
    pathGap: (a, b) => onPath.slice(a, b + 1).some(Boolean),
  };
  STYLE_FN[style](ctx);
  const group = finish([[ctx.S, MAT.solid], [ctx.D, MAT.glassDark]], opts.ghost);
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= n; cz /= n;
  let rad = 0;
  for (const [x, z] of pts) rad = Math.max(rad, Math.hypot(x - cx, z - cz));
  const half = SPEC[style].ht;
  return {
    group,
    bounds: { x: cx, z: cz, r: rad + half + 0.8 },
    meta: { style, half },
    hitDist: (x, z) => {
      let best = Infinity;
      for (let i = 0; i < n - 1; i++) best = Math.min(best, distToSegment2(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      return Math.max(best - half, 0);
    },
  };
}
