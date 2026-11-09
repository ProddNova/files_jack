// Footprints, collisions and snapping: keeps buildings from overlapping and
// lines them up with neighbours, paths and walls.
import { houseDims, houseRect, TOWER_RADIUS, PROP_RADIUS, wallHalf } from './builders.js';
import { getHeight, pathAt } from './terrain.js';
import { angleDiff, distToSegment2, round2 } from './util.js';

export function footprint(kind, data) {
  if (kind === 'house') {
    const r = houseRect(data);
    return { type: 'rect', x: r.x, z: r.z, hw: r.hw, hd: r.hd, ang: data.ang };
  }
  if (kind === 'tower') return { type: 'circle', x: data.x, z: data.z, r: TOWER_RADIUS[data.style] ?? 1.3 };
  if (kind === 'prop') return { type: 'circle', x: data.x, z: data.z, r: PROP_RADIUS[data.style] ?? 0.5 };
  if (kind === 'wall') return { type: 'line', pts: data.pts, half: wallHalf(data.style) };
  return { type: 'circle', x: data.x, z: data.z, r: kind === 'tree' ? 0.45 : 0.3 };
}

function toLocal(r, x, z) {
  const dx = x - r.x, dz = z - r.z, c = Math.cos(r.ang), s = Math.sin(r.ang);
  return [dx * c - dz * s, dx * s + dz * c];
}

function fromLocal(r, lx, lz) {
  const c = Math.cos(r.ang), s = Math.sin(r.ang);
  return [r.x + lx * c + lz * s, r.z - lx * s + lz * c];
}

function inRect(r, x, z, m) {
  const [lx, lz] = toLocal(r, x, z);
  return Math.abs(lx) < r.hw + m && Math.abs(lz) < r.hd + m;
}

function rectRect(a, b, m) {
  const ca = Math.cos(a.ang), sa = Math.sin(a.ang), cb = Math.cos(b.ang), sb = Math.sin(b.ang);
  const axes = [[ca, -sa], [sa, ca], [cb, -sb], [sb, cb]];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra = a.hw * Math.abs(ca * ax - sa * az) + a.hd * Math.abs(sa * ax + ca * az);
    const rb = b.hw * Math.abs(cb * ax - sb * az) + b.hd * Math.abs(sb * ax + cb * az);
    if (Math.abs(dx * ax + dz * az) >= ra + rb + m) return false;
  }
  return true;
}

function rectCircle(r, c, m) {
  const [lx, lz] = toLocal(r, c.x, c.z);
  return Math.hypot(Math.max(Math.abs(lx) - r.hw, 0), Math.max(Math.abs(lz) - r.hd, 0)) < c.r + m;
}

function lineDist(l, x, z) {
  let best = Infinity;
  const p = l.pts;
  for (let i = 0; i < p.length - 1; i++) best = Math.min(best, distToSegment2(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  return best;
}

function lineRect(l, r, m) {
  const p = l.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
    for (let k = 0; k <= steps; k++) {
      if (inRect(r, ax + (bx - ax) * (k / steps), az + (bz - az) * (k / steps), l.half + m)) return true;
    }
  }
  return false;
}

export function overlaps(a, b, m = 0) {
  if (a.type === 'line' && b.type === 'line') return false;
  if (a.type === 'line') return b.type === 'rect' ? lineRect(a, b, m) : lineDist(a, b.x, b.z) < a.half + b.r + m;
  if (b.type === 'line') return overlaps(b, a, m);
  if (a.type === 'rect' && b.type === 'rect') return rectRect(a, b, m);
  if (a.type === 'rect') return rectCircle(a, b, m);
  if (b.type === 'rect') return rectCircle(b, a, m);
  return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + m;
}

export function pointIn(fp, x, z, m = 0) {
  if (fp.type === 'rect') return inRect(fp, x, z, m);
  if (fp.type === 'circle') return Math.hypot(x - fp.x, z - fp.z) < fp.r + m;
  return lineDist(fp, x, z) < fp.half + m;
}

// Which kinds stop a new object from being placed (trees and flowers just get cleared).
const BLOCKERS = {
  house: new Set(['house', 'tower', 'wall', 'prop']),
  tower: new Set(['house', 'tower', 'prop']),
  prop: new Set(['house', 'tower', 'wall', 'prop']),
  wall: new Set(),
};

function terrainOk(kind, data, fp) {
  if (kind === 'prop' && data.style === 'barca') {
    if (getHeight(data.x, data.z) > -0.45) return false;
    for (let a = 0; a < 6; a++) if (getHeight(data.x + Math.cos(a) * 0.9, data.z + Math.sin(a) * 0.9) > -0.15) return false;
    return true;
  }
  if (kind === 'house') {
    if (getHeight(fp.x, fp.z) < 0.15) return false;
    const c = Math.cos(fp.ang), s = Math.sin(fp.ang);
    for (const [lx, lz] of [[-fp.hw, -fp.hd], [fp.hw, -fp.hd], [fp.hw, fp.hd], [-fp.hw, fp.hd]]) {
      if (getHeight(fp.x + lx * c + lz * s, fp.z - lx * s + lz * c) < -0.5) return false;
    }
    // Houses keep the creuze free: they never sit on a path
    for (const [lx, lz] of [[0, 0], [fp.hw * 0.6, 0], [-fp.hw * 0.6, 0], [0, fp.hd * 0.6], [0, -fp.hd * 0.6]]) {
      if (pathAt(fp.x + lx * c + lz * s, fp.z - lx * s + lz * c) > 0.5) return false;
    }
    return true;
  }
  if (kind === 'tower') return getHeight(data.x, data.z) > -0.3 && pathAt(data.x, data.z) < 0.5;
  return getHeight(data.x, data.z) > 0.05;
}

export function blocker(kind, data, objects, ignore) {
  const fp = footprint(kind, data);
  const set = BLOCKERS[kind];
  if (!set) return null;
  const reach = fp.type === 'rect' ? Math.hypot(fp.hw, fp.hd) : fp.r || 0;
  for (const o of objects) {
    if (o === ignore || !set.has(o.kind)) continue;
    if (o.bounds && fp.type !== 'line' && Math.hypot(o.bounds.x - fp.x, o.bounds.z - fp.z) > o.bounds.r + reach + 0.3) continue;
    if (overlaps(fp, o.fp, 0.04)) return o;
  }
  return null;
}

// If the spot is taken, looks around in growing circles for the closest free one.
export function resolve(kind, data, objects, { ignore = null, maxR = 2.6 } = {}) {
  const ok = (d) => terrainOk(kind, d, footprint(kind, d)) && !blocker(kind, d, objects, ignore);
  if (ok(data)) return { data, ok: true, moved: false };
  for (let r = 0.25; r <= maxR; r += 0.25) {
    const steps = Math.max(8, Math.round(r * 10));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const d = { ...data, x: round2(data.x + Math.cos(a) * r), z: round2(data.z + Math.sin(a) * r) };
      if (ok(d)) return { data: d, ok: true, moved: true };
    }
  }
  return { data, ok: false, moved: false };
}

export function nearestPath(x, z, R) {
  let best = null;
  for (let dz = -R; dz <= R; dz += 0.35) {
    for (let dx = -R; dx <= R; dx += 0.35) {
      const d = Math.hypot(dx, dz);
      if (d > R || (best && d >= best.dist)) continue;
      if (pathAt(x + dx, z + dz) > 0.5) best = { x: x + dx, z: z + dz, dist: d };
    }
  }
  return best;
}

function nearestWall(x, z, objects, R) {
  let best = null;
  for (const o of objects) {
    if (o.kind !== 'wall') continue;
    const p = o.data.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const d = distToSegment2(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (d < R && (!best || d < best.dist)) best = { dist: d, a: p[i], b: p[i + 1], obj: o };
    }
  }
  return best;
}

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Lines a house up with what is around it. userAngle: the player chose the direction by dragging.
export function snapHouse(data, objects, userAngle) {
  const d = { ...data };
  const dims = houseDims(d.style || 'casa', d.w, d.seed);
  let near = null, nearD = Infinity;
  for (const o of objects) {
    if (o.kind !== 'house') continue;
    const dist = Math.hypot(o.data.x - d.x, o.data.z - d.z);
    if (dist < Math.hypot(dims.w, dims.d) / 2 + o.bounds.r + 1.0 && dist < nearD) { near = o; nearD = dist; }
  }
  if (near) {
    const H = near.data;
    const k = Math.round(angleDiff(d.ang, H.ang) / (Math.PI / 2));
    const target = norm(H.ang + k * (Math.PI / 2));
    if (!userAngle || Math.abs(angleDiff(target, d.ang)) < 0.35) {
      d.ang = round2(target);
      const Hd = houseDims(H.style || 'casa', H.w, H.seed);
      const swap = Math.abs(k) % 2 === 1;
      const mhw = (swap ? dims.d : dims.w) / 2, mhd = (swap ? dims.w : dims.d) / 2;
      const hw = Hd.w / 2, hd = Hd.d / 2;
      const frame = { x: H.x, z: H.z, ang: H.ang };
      let [lx, lz] = toLocal(frame, d.x, d.z);
      const gx = Math.abs(lx) - (hw + mhw), gz = Math.abs(lz) - (hd + mhd);
      if (gx >= gz && gx < 0.9) {
        lx = Math.sign(lx || 1) * (hw + mhw);
        if (Math.abs(lz - (hd - mhd)) < 0.9) lz = hd - mhd;
      } else if (gz > gx && gz < 0.9) {
        lz = Math.sign(lz || 1) * (hd + mhd);
        if (Math.abs(lx - (-hw + mhw)) < 0.9) lx = -hw + mhw;
        else if (Math.abs(lx - (hw - mhw)) < 0.9) lx = hw - mhw;
      }
      const [x, z] = fromLocal(frame, lx, lz);
      d.x = round2(x);
      d.z = round2(z);
      return { data: d, snap: 'house' };
    }
  }
  if (userAngle) return { data: d, snap: null };
  const p = nearestPath(d.x, d.z, 4);
  if (p && p.dist > 0.05) {
    const dx = (p.x - d.x) / p.dist, dz = (p.z - d.z) / p.dist;
    d.ang = round2(Math.atan2(dx, dz));
    const want = dims.d / 2 + 0.7;
    if (p.dist < want) {
      d.x = round2(p.x - dx * want);
      d.z = round2(p.z - dz * want);
    }
    return { data: d, snap: 'path' };
  }
  const w = nearestWall(d.x, d.z, objects, 3);
  if (w) {
    const tx = w.b[0] - w.a[0], tz = w.b[1] - w.a[1];
    let ang = Math.atan2(-tz, tx);
    const nx = Math.sin(ang), nz = Math.cos(ang);
    const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
    if (nx * (d.x - mx) + nz * (d.z - mz) < 0) ang += Math.PI;
    d.ang = round2(norm(ang));
    return { data: d, snap: 'wall' };
  }
  return { data: d, snap: null };
}

// Wall ends and tower centers that a new wall end can hook onto.
export function snapWallEnd(x, z, objects, R = 1.2) {
  let best = null, bd = R;
  for (const o of objects) {
    const cands = o.kind === 'wall' ? [o.data.pts[0], o.data.pts[o.data.pts.length - 1]] : o.kind === 'tower' ? [[o.data.x, o.data.z]] : [];
    for (const c of cands) {
      const d = Math.hypot(c[0] - x, c[1] - z);
      if (d < bd) { bd = d; best = c; }
    }
  }
  return best;
}

// Towers like to sit on wall corners and on top of walls.
export function snapTower(data, objects) {
  const d = { ...data };
  const end = snapWallEnd(d.x, d.z, objects.filter((o) => o.kind === 'wall'), 1.4);
  if (end) {
    d.x = end[0];
    d.z = end[1];
    return { data: d, snap: 'wall' };
  }
  const w = nearestWall(d.x, d.z, objects, 1.0);
  if (w) {
    const [ax, az] = w.a, [bx, bz] = w.b;
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((d.x - ax) * (bx - ax) + (d.z - az) * (bz - az)) / len2));
    d.x = round2(ax + (bx - ax) * t);
    d.z = round2(az + (bz - az) * t);
    return { data: d, snap: 'wall' };
  }
  return { data: d, snap: null };
}
