import * as THREE from '../vendor/three.module.min.js';

// Small seeded random generator, so every object rebuilds the same after a reload.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

export const newSeed = () => (Math.random() * 2 ** 31) | 0;

// Value noise, good enough for soft hills.
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

export function fbm(x, y, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function col(hex) {
  return new THREE.Color(hex);
}

// Slightly varies a color, so stones and leaves don't look flat.
export function jitter(color, r, amount = 0.06) {
  const c = color.clone();
  const k = 1 + (r() - 0.5) * 2 * amount;
  c.r *= k; c.g *= k; c.b *= k;
  return c;
}

// Unit shapes, reused by every builder.
const flat = (g) => (g.index ? g.toNonIndexed() : g);

// Half disc facing +z, for arches: x in [-1, 1], y in [0, 1], thickness 1 along z.
const halfDisc = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
// Square pyramid with a 1x1 base, centered vertically.
const pyr4 = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);

const UNIT = {
  box: flat(new THREE.BoxGeometry(1, 1, 1)),
  cyl6: flat(new THREE.CylinderGeometry(1, 1, 1, 6, 1)),
  cyl8: flat(new THREE.CylinderGeometry(1, 1, 1, 8, 1)),
  cyl12: flat(new THREE.CylinderGeometry(1, 1, 1, 12, 1)),
  cyl16: flat(new THREE.CylinderGeometry(1, 1, 1, 16, 1)),
  ico: flat(new THREE.IcosahedronGeometry(1, 0)),
  ico1: flat(new THREE.IcosahedronGeometry(1, 1)),
  dode: flat(new THREE.DodecahedronGeometry(1, 0)),
  octa: flat(new THREE.OctahedronGeometry(1, 0)),
  cone8: flat(new THREE.ConeGeometry(1, 1, 8, 1)),
  cone12: flat(new THREE.ConeGeometry(1, 1, 12, 1)),
  pyr4: flat(pyr4),
  arch: flat(halfDisc),
};

const tapered = new Map();
export function taperedCylinder(top, bottom, segs) {
  const key = `${top}|${bottom}|${segs}`;
  if (!tapered.has(key)) tapered.set(key, flat(new THREE.CylinderGeometry(top, bottom, 1, segs, 1)));
  return tapered.get(key);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Collects many small shapes into one mesh (one draw call per object).
// Collects many small shapes into one mesh (one draw call per object).
// Every triangle also gets texture coordinates (planar, in object units, with
// "v" pointing up the face) and a material layer from textures.js, so bricks
// stay level and line up across neighbouring pieces.
export class GeoBuilder {
  constructor(layer = 0) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.lay = [];
    this.layer = layer;
  }

  get empty() {
    return this.pos.length === 0;
  }

  _tri(ax, ay, az, bx, by, bz, cx, cy, cz, color, layer) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    let tx = 1, tz = 0;
    if (Math.abs(ny) < 0.92) {
      const tl = Math.hypot(nz, nx) || 1;
      tx = nz / tl;
      tz = -nx / tl;
    }
    const bx2 = ny * tz, by2 = nz * tx - nx * tz, bz2 = -ny * tx;
    const P = this.pos, Nn = this.nor, Cc = this.col, U = this.uv, Ly = this.lay;
    for (let k = 0; k < 3; k++) {
      const x = k === 0 ? ax : k === 1 ? bx : cx;
      const y = k === 0 ? ay : k === 1 ? by : cy;
      const z = k === 0 ? az : k === 1 ? bz : cz;
      P.push(x, y, z);
      Nn.push(nx, ny, nz);
      Cc.push(color.r, color.g, color.b);
      U.push(x * tx + z * tz, x * bx2 + y * by2 + z * bz2);
      Ly.push(layer);
    }
  }

  addGeo(geo, matrix, color, layer = this.layer) {
    const p = geo.attributes.position.array;
    const e = matrix.elements;
    const t = [];
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      t.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
    }
    for (let i = 0; i < t.length; i += 9) {
      this._tri(t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4], t[i + 5], t[i + 6], t[i + 7], t[i + 8], color, layer);
    }
  }

  // shape: a name from UNIT or a geometry. rot: [x, y, z] euler angles (YXZ order).
  add(shape, pos, scale, color, rot, layer = this.layer) {
    const geo = typeof shape === 'string' ? UNIT[shape] : shape;
    _p.set(pos[0], pos[1], pos[2]);
    _s.set(scale[0], scale[1], scale[2]);
    if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ'));
    else _q.identity();
    _m.compose(_p, _q, _s);
    this.addGeo(geo, _m, color, layer);
  }

  tri(a, b, c, color, layer = this.layer) {
    this._tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], color, layer);
  }

  quad(a, b, c, d, color, layer = this.layer) {
    this.tri(a, b, c, color, layer);
    this.tri(a, c, d, color, layer);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.lay, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export function distToSegment2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const round2 = (v) => Math.round(v * 100) / 100;
