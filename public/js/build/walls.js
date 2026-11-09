import { GeoBuilder, rng, col, jitter, distToSegment2, clamp } from '../util.js';
import { getHeight, pathAt } from '../terrain.js';
import { MAT, PAL, L, finish } from './common.js';
import { ROOF_COLORS } from './houses.js';

export const WALL_STYLES = ['muretto', 'mura', 'castello', 'staccionata', 'siepe'];
const SPEC = {
  muretto: { H: 1.15, ht: 0.24 },
  mura: { H: 2.3, ht: 0.38 },
  castello: { H: 3.1, ht: 0.55 },
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

function ribbon(S, pts, fr, i0, i1, half, yb, yt, colorFn, layer) {
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
    S.quad(Lb[k], Lb[k + 1], Lt[k + 1], Lt[k], c, layer);
    S.quad(Rb[k + 1], Rb[k], Rt[k], Rt[k + 1], c.clone().multiplyScalar(0.95), layer);
    S.quad(Lt[k], Lt[k + 1], Rt[k + 1], Rt[k], c.clone().multiplyScalar(1.04), layer);
  }
  const e = m - 1;
  S.quad(Rb[0], Lb[0], Lt[0], Rt[0], colorFn(i0), layer);
  S.quad(Lb[e], Rb[e], Rt[e], Lt[e], colorFn(i1), layer);
}

function looseStones(S, r, pts, fr, hs, i0, i1, half, H, colors) {
  for (let i = i0; i < i1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
    const { nx, nz, tx, tz, ang } = fr[i];
    const my = (hs[i] + hs[i + 1]) / 2;
    for (const side of [-1, 1]) {
      if (r() < 0.4) continue;
      const along = r.range(-0.2, 0.2);
      S.add('box',
        [mx + tx * along + nx * side * (half + 0.015), my + r.range(0.15, H - 0.2), mz + tz * along + nz * side * (half + 0.015)],
        [r.range(0.22, 0.42), r.range(0.13, 0.24), 0.06],
        jitter(r.pick(colors), r, 0.1), [0, ang, 0], L.STONE);
    }
  }
}

function merlons(S, pts, fr, hs, i0, i1, half, top, color, size = 0.42) {
  let acc = 0.45;
  for (let i = i0; i < i1; i++) {
    acc += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (acc < size * 2.1) continue;
    acc = 0;
    const [x, z] = pts[i];
    const { nx, nz, ang } = fr[i];
    for (const side of [-1, 1]) {
      S.add('box', [x + nx * side * (half - 0.08), hs[i] + top + size / 2, z + nz * side * (half - 0.08)], [size, size * 1.05, 0.18], color, [0, ang, 0], L.ASHLAR);
    }
  }
}

function roundTower(ctx, x, z, ground, R, H, stone, roof) {
  const { S, D, r } = ctx;
  S.add('cyl16', [x, (ground - 1 + ground + H) / 2, z], [R, H + 1, R], stone, null, L.ASHLAR);
  S.add('cyl16', [x, ground + H + 0.2, z], [R + 0.15, 0.4, R + 0.15], stone, null, L.ASHLAR);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    S.add('box', [x + Math.cos(a) * (R + 0.05), ground + H + 0.6, z + Math.sin(a) * (R + 0.05)], [0.3, 0.42, 0.25], stone, [0, -a, 0], L.ASHLAR);
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    D.add('box', [x + Math.cos(a) * R, ground + H * (0.4 + i * 0.2), z + Math.sin(a) * R], [0.12, 0.4, 0.1], PAL.white, [0, -a + Math.PI / 2, 0]);
  }
  if (roof) {
    S.add('cone12', [x, ground + H + 0.4 + R * 1.1, z], [R + 0.25, R * 2.2, R + 0.25], roof.color, null, roof.layer);
  }
}

function muretto(ctx) {
  const { S, r, pts, fr, hs, runs, H } = ctx;
  const { ht } = SPEC.muretto;
  for (const [i0, i1] of runs) {
    const cols = [];
    for (let i = i0; i <= i1; i++) cols[i] = jitter(r() < 0.5 ? PAL.stone : PAL.stoneDark, r, 0.07);
    ribbon(S, pts, fr, i0, i1, ht, (i) => hs[i] - 1.0, (i) => hs[i] + H, (i) => cols[i], L.STONE);
    ribbon(S, pts, fr, i0, i1, ht + 0.07, (i) => hs[i] + H, (i) => hs[i] + H + 0.14, () => PAL.stoneLight, L.ASHLAR);
    looseStones(S, r, pts, fr, hs, i0, i1, ht, H, [PAL.stoneDark, PAL.stoneLight]);
    for (const i of [i0, i1]) {
      const [x, z] = pts[i];
      const top = hs[i] + H + 0.45;
      S.add('box', [x, (hs[i] - 1 + top) / 2, z], [0.66, top - hs[i] + 1, 0.66], jitter(PAL.stone, r, 0.05), [0, fr[i].ang, 0], L.STONE);
      S.add('box', [x, top + 0.06, z], [0.8, 0.12, 0.8], PAL.stoneLight, [0, fr[i].ang, 0], L.ASHLAR);
      S.add('octa', [x, top + 0.3, z], [0.2, 0.26, 0.2], PAL.stoneLight, [0, fr[i].ang, 0], L.ASHLAR);
    }
  }
}

// City walls (mura) and castle walls (castello) share most of the drawing.
function fortified(ctx, castle) {
  const { S, D, r, pts, fr, hs, runs, pathGap, H } = ctx;
  const { ht } = SPEC[castle ? 'castello' : 'mura'];
  const stone = ctx.stone || jitter(col(castle ? '#c2b8a6' : '#c9bca3'), r, 0.04);
  const n = pts.length;
  const roofKey = ROOF_COLORS[ctx.data.roofCol] ? ctx.data.roofCol : (r() < 0.5 ? 'blu' : 'ardesia');
  const roof = castle && (ctx.data.top ? ctx.data.top === 'cono' : r() < 0.55) ? { color: col(ROOF_COLORS[roofKey].hex), layer: ROOF_COLORS[roofKey].layer } : null;
  runs.forEach(([i0, i1], ri) => {
    const cols = [];
    for (let i = i0; i <= i1; i++) cols[i] = jitter(stone, r, 0.05);
    ribbon(S, pts, fr, i0, i1, ht, (i) => hs[i] - 1.0, (i) => hs[i] + H, (i) => cols[i], L.ASHLAR);
    if (castle) ribbon(S, pts, fr, i0, i1, ht + 0.16, (i) => hs[i] - 1.0, (i) => hs[i] + 0.9, (i) => cols[i].clone().multiplyScalar(0.92), L.STONE);
    ribbon(S, pts, fr, i0, i1, ht + 0.06, (i) => hs[i] + H * 0.62, (i) => hs[i] + H * 0.62 + 0.12, () => PAL.stoneLight, L.ASHLAR);
    ribbon(S, pts, fr, i0, i1, ht + 0.06, (i) => hs[i] + H, (i) => hs[i] + H + 0.1, () => PAL.stoneLight, L.COBBLE);
    merlons(S, pts, fr, hs, i0, i1, ht + 0.06, H + 0.1, stone);
    if (!castle) looseStones(S, r, pts, fr, hs, i0, i1, ht, H * 0.6, [PAL.stoneDark, PAL.stoneLight]);
    if (castle) {
      for (let i = i0 + 2; i < i1 - 1; i += 4) {
        const [x, z] = pts[i];
        for (const side of [-1, 1]) D.add('box', [x + fr[i].nx * side * (ht + 0.17), hs[i] + H * 0.45, z + fr[i].nz * side * (ht + 0.17)], [0.1, 0.42, 0.05], PAL.white, [0, fr[i].ang, 0]);
      }
    }
    for (const i of [i0, i1]) {
      const [x, z] = pts[i];
      const ang = fr[i].ang;
      const wallEnd = i === 0 || i === n - 1;
      if (castle && wallEnd) continue;
      const size = wallEnd ? 1.35 : castle ? 1.2 : 0.95;
      const top = hs[i] + H + (wallEnd ? 1.1 : 0.6);
      S.add('box', [x, (hs[i] - 1 + top) / 2, z], [size, top - hs[i] + 1, size], jitter(stone, r, 0.04), [0, ang, 0], L.ASHLAR);
      S.add('box', [x, top + 0.07, z], [size + 0.14, 0.14, size + 0.14], PAL.stoneLight, [0, ang, 0], L.ASHLAR);
      if (wallEnd) {
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          S.add('box', [x + Math.cos(ang) * sx * 0.5 + Math.sin(ang) * sz * 0.5, top + 0.36, z - Math.sin(ang) * sx * 0.5 + Math.cos(ang) * sz * 0.5], [0.3, 0.44, 0.3], stone, [0, ang, 0], L.ASHLAR);
        }
        D.add('box', [x + fr[i].nx * (size / 2 + 0.01), top - 0.7, z + fr[i].nz * (size / 2 + 0.01)], [0.12, 0.4, 0.04], PAL.white, [0, ang + Math.PI / 2, 0]);
      }
    }
    const next = runs[ri + 1];
    if (next && pathGap(i1, next[0])) {
      const [ax, az] = pts[i1], [bx, bz] = pts[next[0]];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4.5) {
        const y = Math.max(hs[i1], hs[next[0]]) + H;
        const ang = Math.atan2(-(bz - az), bx - ax);
        S.add('box', [(ax + bx) / 2, y - 0.25, (az + bz) / 2], [len, 0.7, ht * 2], stone, [0, ang, 0], L.ASHLAR);
        S.add('box', [(ax + bx) / 2, y + 0.15, (az + bz) / 2], [len + 0.1, 0.12, ht * 2 + 0.12], PAL.stoneLight, [0, ang, 0], L.ASHLAR);
      }
    }
  });
  // Castle walls get towers at both ends and on every sharp bend
  if (castle) {
    const R = 1.15 * clamp(ctx.data.h ?? 1, 0.8, 1.5);
    const towers = [0];
    let last = 0;
    for (let i = 2; i < n - 2; i++) {
      const a = Math.atan2(pts[i][1] - pts[i - 2][1], pts[i][0] - pts[i - 2][0]);
      const b = Math.atan2(pts[i + 2][1] - pts[i][1], pts[i + 2][0] - pts[i][0]);
      let d = Math.abs(a - b);
      if (d > Math.PI) d = Math.PI * 2 - d;
      let len = 0;
      for (let k = last + 1; k <= i; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      if ((d > 0.5 && len > 3.2) || len > 11) { towers.push(i); last = i; }
    }
    const closedLoop = Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 0.3;
    if (!closedLoop) towers.push(n - 1);
    ctx.towers = towers.map((i) => ({ x: pts[i][0], z: pts[i][1], r: R }));
    for (const i of towers) roundTower(ctx, pts[i][0], pts[i][1], hs[i], R, H + 1.4, stone, roof);
  }
}

function staccionata(ctx) {
  const { S, r, pts, hs, runs, H } = ctx;
  const k = H / 0.95;
  for (const [i0, i1] of runs) {
    const posts = [i0];
    let acc = 0;
    for (let i = i0 + 1; i <= i1; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc >= 1.0 || i === i1) { posts.push(i); acc = 0; }
    }
    for (const i of posts) {
      const [x, z] = pts[i];
      S.add('box', [x, hs[i] + 0.35 * k, z], [0.13, 1.1 * k, 0.13], jitter(PAL.wood, r, 0.08), null, L.WOOD);
      S.add('pyr4', [x, hs[i] + 0.96 * k, z], [0.15, 0.12, 0.15], PAL.wood, null, L.WOOD);
    }
    for (let p = 0; p < posts.length - 1; p++) {
      const a = posts[p], b = posts[p + 1];
      const [ax, az] = pts[a], [bx, bz] = pts[b];
      const len = Math.hypot(bx - ax, bz - az);
      const dy = hs[b] - hs[a];
      const ang = Math.atan2(-(bz - az), bx - ax);
      for (const h of [0.42, 0.78]) {
        S.add('box', [(ax + bx) / 2, (hs[a] + hs[b]) / 2 + h * k, (az + bz) / 2], [Math.hypot(len, dy), 0.08, 0.05], jitter(PAL.woodLight, r, 0.08), [0, ang, Math.atan2(dy, len)], L.WOOD);
      }
    }
  }
}

function siepe(ctx) {
  const { S, r, pts, fr, hs, runs, H } = ctx;
  const { ht } = SPEC.siepe;
  const green = [col('#3f6b35'), col('#4a7a3c'), col('#365f30')];
  const bloom = r() < 0.4 ? r.pick(PAL.bloom) : null;
  for (const [i0, i1] of runs) {
    ribbon(S, pts, fr, i0, i1, ht, (i) => hs[i] - 0.3, (i) => hs[i] + H - 0.1, () => green[0], L.LEAF);
    for (let i = i0; i <= i1; i++) {
      const [x, z] = pts[i];
      S.add('ico', [x, hs[i] + H - 0.08, z], [ht + 0.1, 0.22, ht + 0.1], r.pick(green), [r(), r() * 3, 0], L.LEAF);
      for (const side of [-1, 1]) {
        if (r() < 0.6) S.add('ico', [x + fr[i].nx * side * ht, hs[i] + r.range(0.2, H - 0.2), z + fr[i].nz * side * ht], [0.16, 0.18, 0.16], r.pick(green), [r(), r(), 0], L.LEAF);
        if (bloom && r() < 0.4) S.add('octa', [x + fr[i].nx * side * (ht + 0.08), hs[i] + r.range(0.3, H), z + fr[i].nz * side * (ht + 0.08)], [0.06, 0.06, 0.06], bloom, null, L.LEAF);
      }
    }
  }
}

const STYLE_FN = {
  muretto, mura: (c) => fortified(c, false), castello: (c) => fortified(c, true), staccionata, siepe,
};

export function buildWall(data, opts = {}) {
  const style = STYLE_FN[data.style] ? data.style : 'muretto';
  const pts = data.pts;
  if (!pts || pts.length < 2) return null;
  const n = pts.length;
  const env = opts.env || {};
  const hs = pts.map(([x, z]) => getHeight(x, z));
  const onPath = pts.map(([x, z]) => pathAt(x, z) > 0.35);
  const open = pts.map(([x, z], i) => onPath[i] || (env.blockedAt ? env.blockedAt(x, z) : false));
  const runs = closedRuns(open, n);
  const H = SPEC[style].H * clamp(data.h ?? 1, 0.5, 2);
  const ctx = {
    S: new GeoBuilder(L.STONE), D: new GeoBuilder(), r: rng(data.seed), data,
    pts, fr: frames(pts), hs, runs, H, towers: [],
    stone: data.stone ? col(data.stone) : null,
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
  // Pieces a walker bumps into: the closed stretches and the towers
  const segs = [];
  for (const [i0, i1] of runs) for (let i = i0; i < i1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  const solids = [{ type: 'segs', segs, half }, ...ctx.towers.map((t) => ({ type: 'circle', x: t.x, z: t.z, r: t.r }))];
  return {
    group,
    solids,
    bounds: { x: cx, z: cz, r: rad + half + 1.5 },
    meta: { style, half, towers: ctx.towers },
    hitDist: (x, z) => {
      let best = Infinity;
      for (let i = 0; i < n - 1; i++) best = Math.min(best, distToSegment2(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      for (const t of ctx.towers) best = Math.min(best, Math.max(Math.hypot(x - t.x, z - t.z) - t.r + half, 0));
      return Math.max(best - half, 0);
    },
  };
}
