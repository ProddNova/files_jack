import { GeoBuilder, rng, col, jitter, clamp, distToSegment2 } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, PAL, L, finish } from './common.js';

export const BRIDGE_STYLES = ['pietra', 'legno'];

// Deck height along the bridge (t from 0 to 1): from bank to bank with a gentle hump.
function deckProfile(data) {
  const [ax, az] = data.a, [bx, bz] = data.b;
  const len = Math.hypot(bx - ax, bz - az);
  const hA = Math.max(getHeight(ax, az), 0) + 0.15;
  const hB = Math.max(getHeight(bx, bz), 0) + 0.15;
  const rise = Math.min(1.1, len * 0.09) * clamp(data.h ?? 1, 0.3, 2.5);
  return { len, f: (t) => hA + (hB - hA) * t + rise * Math.sin(Math.PI * t) };
}

export function buildBridge(data, opts = {}) {
  const [ax, az] = data.a, [bx, bz] = data.b;
  const { len, f } = deckProfile(data);
  if (len < 1) return null;
  const r = rng(data.seed);
  const style = data.style === 'legno' ? 'legno' : 'pietra';
  const W = clamp(data.w ?? 1.6, 1, 3.5);
  const S = new GeoBuilder(L.ASHLAR);
  const n = Math.max(6, Math.ceil(len / 0.4));
  const xs = [], ys = [];
  for (let i = 0; i <= n; i++) { xs.push((i / n) * len); ys.push(f(i / n)); }
  // Bridge is built along local +x; the group is turned to face from a to b
  if (style === 'pietra') {
    const stone = jitter(col(r.pick(['#cdbfa6', '#bfb39f', '#d6c8ae'])), r, 0.04);
    let ground = Infinity;
    for (let i = 0; i <= n; i++) ground = Math.min(ground, getHeight(ax + (bx - ax) * i / n, az + (bz - az) * i / n));
    const spring = Math.max(ground, -0.6) - 0.1;
    const spans = Math.max(1, Math.round(len / 4.5));
    const spanLen = len / spans;
    const bottomAt = (x) => {
      const j = Math.min(spans - 1, Math.floor(x / spanLen));
      const xc = (j + 0.5) * spanLen, s = spanLen / 2;
      const deckLow = Math.min(f((j * spanLen) / len), f(((j + 1) * spanLen) / len), f(xc / len)) - 0.35;
      const archH = Math.max(0.2, (deckLow - spring) * 0.9);
      const u = (x - xc) / s;
      return spring + archH * Math.sqrt(Math.max(0, 1 - u * u));
    };
    for (let i = 0; i < n; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      const t0 = ys[i] - 0.25, t1 = ys[i + 1] - 0.25;
      const b0 = Math.min(bottomAt(x0), t0 - 0.05), b1 = Math.min(bottomAt(x1), t1 - 0.05);
      for (const side of [-1, 1]) {
        const z = (side * W) / 2;
        if (side > 0) S.quad([x0, b0, z], [x1, b1, z], [x1, t1, z], [x0, t0, z], stone);
        else S.quad([x1, b1, z], [x0, b0, z], [x0, t0, z], [x1, t1, z], stone);
      }
      S.quad([x0, b0, -W / 2], [x1, b1, -W / 2], [x1, b1, W / 2], [x0, b0, W / 2], stone.clone().multiplyScalar(0.8));
      S.quad([x0, ys[i], W / 2], [x1, ys[i + 1], W / 2], [x1, ys[i + 1], -W / 2], [x0, ys[i], -W / 2], PAL.stoneLight, L.COBBLE);
      for (const side of [-1, 1]) {
        const z = (side * (W / 2 - 0.08));
        const xm = (x0 + x1) / 2, ym = (ys[i] + ys[i + 1]) / 2;
        const ang = Math.atan2(ys[i + 1] - ys[i], x1 - x0);
        S.add('box', [xm, ym + 0.22, z], [Math.hypot(x1 - x0, ys[i + 1] - ys[i]) + 0.01, 0.44, 0.16], stone, [0, 0, ang]);
        S.add('box', [xm, ym + 0.47, z], [Math.hypot(x1 - x0, ys[i + 1] - ys[i]) + 0.02, 0.06, 0.22], PAL.stoneLight, [0, 0, ang]);
      }
      // Fill the deck thickness between the top surface and the side faces
      S.quad([x0, t0, W / 2], [x1, t1, W / 2], [x1, ys[i + 1], W / 2], [x0, ys[i], W / 2], stone);
      S.quad([x1, t1, -W / 2], [x0, t0, -W / 2], [x0, ys[i], -W / 2], [x1, ys[i + 1], -W / 2], stone);
    }
    for (let j = 1; j < spans; j++) {
      const x = j * spanLen;
      const top = f(x / len) - 0.3;
      S.add('box', [x, (spring - 1.5 + top) / 2, 0], [0.7, top - spring + 1.5, W + 0.2], stone.clone().multiplyScalar(0.95));
      S.add('pyr4', [x, spring + 0.3, 0], [0.7, 0.6, W + 0.6], stone.clone().multiplyScalar(0.9), [0, Math.PI / 4, 0]);
    }
    for (const x of [0, len]) S.add('box', [x, f(x / len) - 0.6, 0], [0.6, 1.2, W + 0.3], stone.clone().multiplyScalar(0.9));
  } else {
    S.layer = L.WOOD;
    for (let i = 0; i < n; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      const xm = (x0 + x1) / 2, ym = (ys[i] + ys[i + 1]) / 2;
      const ang = Math.atan2(ys[i + 1] - ys[i], x1 - x0);
      const segLen = Math.hypot(x1 - x0, ys[i + 1] - ys[i]);
      for (let k = 0; k < 3; k++) S.add('box', [xm - segLen / 3 + k * segLen / 3, ym, 0], [segLen / 3 - 0.02, 0.06, W], jitter(PAL.woodLight, r, 0.08), [0, 0, ang]);
      for (const side of [-1, 1]) {
        S.add('box', [xm, ym - 0.08, side * (W / 2 - 0.1)], [segLen + 0.01, 0.12, 0.1], PAL.wood, [0, 0, ang]);
        S.add('box', [xm, ym + 0.75, side * (W / 2 - 0.05)], [segLen + 0.01, 0.06, 0.06], PAL.wood, [0, 0, ang]);
      }
    }
    for (let i = 0; i <= n; i += 2) {
      for (const side of [-1, 1]) {
        S.add('box', [xs[i], ys[i] + 0.4, side * (W / 2 - 0.05)], [0.08, 0.8, 0.08], PAL.wood);
        const g = getHeight(ax + (bx - ax) * xs[i] / len, az + (bz - az) * xs[i] / len);
        const bottom = Math.min(g, -0.4) - 0.6;
        if (ys[i] - bottom > 0.6) S.add('cyl8', [xs[i], (ys[i] + bottom) / 2, side * (W / 2 - 0.1)], [0.08, ys[i] - bottom, 0.08], PAL.wood, null, L.BARK);
      }
    }
  }
  const group = finish([[S, MAT.solid]], opts.ghost);
  const ang = Math.atan2(-(bz - az), bx - ax);
  group.position.set(ax, 0, az);
  group.rotation.y = ang;
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  return {
    group,
    bounds: { x: cx, z: cz, r: len / 2 + W },
    meta: { len, width: W },
    hitDist: (x, z) => Math.max(distToSegment2(x, z, ax, az, bx, bz) - W / 2, 0),
    // Height of the walkable deck at a point, or null when off the bridge
    surfaceAt(x, z) {
      const dx = bx - ax, dz = bz - az;
      const t = ((x - ax) * dx + (z - az) * dz) / (len * len);
      if (t < 0 || t > 1) return null;
      if (distToSegment2(x, z, ax, az, bx, bz) > W / 2) return null;
      return f(t);
    },
    solids: [],
  };
}
