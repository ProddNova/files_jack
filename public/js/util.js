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

const UNIT = {
  box: flat(new THREE.BoxGeometry(1, 1, 1)),
  cyl8: flat(new THREE.CylinderGeometry(1, 1, 1, 8, 1)),
  cyl12: flat(new THREE.CylinderGeometry(1, 1, 1, 12, 1)),
  ico: flat(new THREE.IcosahedronGeometry(1, 0)),
  dode: flat(new THREE.DodecahedronGeometry(1, 0)),
  octa: flat(new THREE.OctahedronGeometry(1, 0)),
  cone8: flat(new THREE.ConeGeometry(1, 1, 8, 1)),
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
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

// Collects many small shapes into one mesh (one draw call per object).
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }

  get empty() {
    return this.pos.length === 0;
  }

  addGeo(geo, matrix, color) {
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    _nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.length; i += 3) {
      _v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(matrix);
      _n.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(color.r, color.g, color.b);
    }
  }

  // shape: a name from UNIT or a geometry. rot: [x, y, z] euler angles.
  add(shape, pos, scale, color, rot) {
    const geo = typeof shape === 'string' ? UNIT[shape] : shape;
    _p.set(pos[0], pos[1], pos[2]);
    _s.set(scale[0], scale[1], scale[2]);
    if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ'));
    else _q.identity();
    _m.compose(_p, _q, _s);
    this.addGeo(geo, _m, color);
  }

  addMatrix(shape, matrix, color) {
    const geo = typeof shape === 'string' ? UNIT[shape] : shape;
    this.addGeo(geo, matrix, color);
  }

  tri(a, b, c, color) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _n.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _v.cross(_n).normalize();
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(_v.x, _v.y, _v.z);
      this.col.push(color.r, color.g, color.b);
    }
  }

  quad(a, b, c, d, color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
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
