import * as THREE from '../vendor/three.module.min.js';
import { GeoBuilder, rng, col, jitter, taperedCylinder, clamp, distToSegment2 } from './util.js';
import { getHeight } from './terrain.js';

// Shared materials: every object uses the same few, so the GPU stays happy.
export const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
  glassLit: new THREE.MeshStandardMaterial({ color: '#2a3343', emissive: '#ffb45e', emissiveIntensity: 0, roughness: 0.35, flatShading: true }),
  glassDark: new THREE.MeshStandardMaterial({ color: '#2a3343', emissive: '#ffb45e', emissiveIntensity: 0, roughness: 0.35, flatShading: true }),
};
MAT.solid.shadowSide = THREE.DoubleSide;

const GHOST = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.55, depthWrite: false }),
  glass: new THREE.MeshStandardMaterial({ color: '#2a3343', transparent: true, opacity: 0.55, depthWrite: false }),
};

const PAL = {
  facades: ['#f0b64f', '#e98b5e', '#f4c9a3', '#d8654f', '#f6dc8e', '#e9a3a1', '#f1e4c8', '#cf7d4c', '#f2a65a'],
  shutters: ['#3d6e4c', '#466f58', '#35624a', '#4f7a5a'],
  trim: col('#f7f1e4'),
  terracotta: col('#b6533b'),
  slate: col('#6c6f78'),
  foundation: col('#9d968a'),
  door: col('#6b4a32'),
  chimney: col('#9a5a43'),
  stone: col('#b3a48c'),
  stoneDark: col('#968670'),
  stoneLight: col('#d6cbb5'),
  towerStone: col('#cdb898'),
  wood: col('#7b5a3e'),
  white: col('#f6f3ec'),
  red: col('#c8202e'),
  railing: col('#3b3a3a'),
};

const LEAF = {
  olive: ['#8f9e6b', '#7f9160', '#a3ad7b', '#93a26e'].map(col),
  oliveTrunk: col('#6b6254'),
  pine: ['#3f6d38', '#4d7d40', '#456f3a'].map(col),
  pineTrunk: col('#7a5a44'),
  cypress: ['#2f5a35', '#36633b'].map(col),
  bush: ['#4f7d36', '#5a8a3e', '#46733a'].map(col),
  lemon: col('#f5d33a'),
};

const FLOWERS = [
  { name: 'buganvillea', colors: ['#d23c8c', '#e0569f', '#b8307a'] },
  { name: 'geranio', colors: ['#e0473c', '#f05a4a', '#c93a33'] },
  { name: 'ginestra', colors: ['#f2c230', '#f7d54d', '#e8b51f'] },
  { name: 'lavanda', colors: ['#8c6bc8', '#7b5cb8', '#9d7fd6'], spikes: true },
  { name: 'margherita', colors: ['#f7f4ea', '#ffffff', '#f2eddc'] },
];

function finish(solid, lit, dark, ghost) {
  const group = new THREE.Group();
  const m = new THREE.Mesh(solid.build(), ghost ? GHOST.solid : MAT.solid);
  m.castShadow = !ghost;
  m.receiveShadow = !ghost;
  group.add(m);
  for (const [b, mat] of [[lit, MAT.glassLit], [dark, MAT.glassDark]]) {
    if (b && !b.empty) {
      const g = new THREE.Mesh(b.build(), ghost ? GHOST.glass : mat);
      group.add(g);
    }
  }
  return group;
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}

// ---------- House ----------

export function buildHouse(d, ghost = false) {
  const r = rng(d.seed);
  const w = clamp(d.w, 1.4, 7);
  const dep = clamp(w * r.range(0.55, 0.85), 1.6, 3.6);
  const floors = clamp((w < 2.4 ? 3 : 2) + r.int(0, 2), 2, 5);
  const fh = 0.95;
  const facade = col(r.pick(PAL.facades));
  const shutter = col(r.pick(PAL.shutters));
  const roofCol = r() < 0.62 ? PAL.terracotta : PAL.slate;
  const hasBalcony = r() < 0.45 && floors >= 2 && w >= 1.8;

  const cos = Math.cos(d.ang), sin = Math.sin(d.ang);
  const toWorld = (lx, lz) => [d.x + lx * cos + lz * sin, d.z - lx * sin + lz * cos];
  let y0 = -Infinity, yMin = Infinity;
  for (const [lx, lz] of [[-w / 2, -dep / 2], [w / 2, -dep / 2], [w / 2, dep / 2], [-w / 2, dep / 2], [0, 0]]) {
    const [wx, wz] = toWorld(lx, lz);
    const h = getHeight(wx, wz);
    y0 = Math.max(y0, h);
    yMin = Math.min(yMin, h);
  }

  const S = new GeoBuilder(), L = new GeoBuilder(), D = new GeoBuilder();
  const base = 0.18;
  const yt = base + floors * fh;
  const fBottom = yMin - y0 - 0.6;

  // Foundation and body
  S.add('box', [0, (fBottom + base) / 2, 0], [w + 0.12, base - fBottom, dep + 0.12], PAL.foundation);
  S.add('box', [0, base + floors * fh / 2, 0], [w, floors * fh, dep], facade);
  // Painted corners and top band, typical of Ligurian facades
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    S.add('box', [sx * (w / 2 - 0.05), base + floors * fh / 2, sz * (dep / 2 - 0.05)], [0.16, floors * fh, 0.16], PAL.trim);
  }
  S.add('box', [0, yt - 0.06, 0], [w + 0.1, 0.14, dep + 0.1], PAL.trim);
  S.add('box', [0, base + 0.05, 0], [w + 0.06, 0.1, dep + 0.06], jitter(facade, r, 0.12).multiplyScalar(0.85));

  // Roof: gable along the long side
  const ridgeX = w >= dep;
  const o = 0.2;
  const Lr = (ridgeX ? w : dep) + 2 * o;
  const Sr = (ridgeX ? dep : w) + 2 * o;
  const Lw = ridgeX ? w : dep;
  const rh = Math.min(w, dep) * 0.36;
  const map = ridgeX ? (u, y, v) => [u, y, v] : (u, y, v) => [v, y, -u];
  const P = (u, y, v) => map(u, y, v);
  const rc = roofCol;
  S.quad(P(-Lr / 2, yt, Sr / 2), P(Lr / 2, yt, Sr / 2), P(Lr / 2, yt + rh, 0), P(-Lr / 2, yt + rh, 0), rc);
  S.quad(P(Lr / 2, yt, -Sr / 2), P(-Lr / 2, yt, -Sr / 2), P(-Lr / 2, yt + rh, 0), P(Lr / 2, yt + rh, 0), rc.clone().multiplyScalar(0.86));
  S.tri(P(Lw / 2, yt, Sr / 2), P(Lw / 2, yt, -Sr / 2), P(Lw / 2, yt + rh, 0), facade);
  S.tri(P(-Lw / 2, yt, -Sr / 2), P(-Lw / 2, yt, Sr / 2), P(-Lw / 2, yt + rh, 0), facade);
  // Roof edge thickness (fascia)
  S.quad(P(-Lr / 2, yt - 0.08, Sr / 2), P(Lr / 2, yt - 0.08, Sr / 2), P(Lr / 2, yt, Sr / 2), P(-Lr / 2, yt, Sr / 2), PAL.trim);
  S.quad(P(Lr / 2, yt - 0.08, -Sr / 2), P(-Lr / 2, yt - 0.08, -Sr / 2), P(-Lr / 2, yt, -Sr / 2), P(Lr / 2, yt, -Sr / 2), PAL.trim);

  // Chimney
  const cu = (r() - 0.5) * Lw * 0.5, cv = Sr * 0.18;
  const cy = yt + rh * (1 - cv / (Sr / 2)) + 0.2;
  const cp = P(cu, cy, cv);
  S.add('box', cp, [0.28, 0.75, 0.28], PAL.chimney);
  S.add('box', [cp[0], cy + 0.4, cp[2]], [0.36, 0.08, 0.36], PAL.trim);

  // Windows, shutters and door on the four sides
  const faces = [
    { len: w, half: dep / 2, place: (u, out) => [u, out + dep / 2], rot: 0 },
    { len: w, half: dep / 2, place: (u, out) => [-u, -(out + dep / 2)], rot: Math.PI },
    { len: dep, half: w / 2, place: (u, out) => [out + w / 2, -u], rot: Math.PI / 2 },
    { len: dep, half: w / 2, place: (u, out) => [-(out + w / 2), u], rot: -Math.PI / 2 },
  ];
  faces.forEach((f, fi) => {
    let n = Math.floor((f.len - 0.4) / 0.95);
    if (n < 1) n = f.len >= 1.0 ? 1 : 0;
    const doorIdx = fi === 0 ? Math.floor((n - 1) / 2) : -1;
    for (let fl = 0; fl < floors; fl++) {
      const yy = base + fl * fh + fh * 0.55;
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * (f.len / n);
        const at = (out) => f.place(u, out);
        if (fl === 0 && k === doorIdx) {
          const [x1, z1] = at(0.01);
          S.add('box', [x1, base + 0.5, z1], [0.62, 0.98, 0.04], PAL.trim, [0, f.rot, 0]);
          const [x2, z2] = at(0.035);
          S.add('box', [x2, base + 0.45, z2], [0.48, 0.86, 0.05], PAL.door, [0, f.rot, 0]);
          continue;
        }
        const [fx, fz] = at(0.01);
        S.add('box', [fx, yy, fz], [0.5, 0.64, 0.03], PAL.trim, [0, f.rot, 0]);
        const [gx, gz] = at(0.03);
        (r() < 0.55 ? L : D).add('box', [gx, yy, gz], [0.32, 0.48, 0.04], PAL.white, [0, f.rot, 0]);
        for (const side of [-1, 1]) {
          const [sx, sz] = f.place(u + side * 0.27, 0.05);
          S.add('box', [sx, yy, sz], [0.16, 0.52, 0.04], shutter, [0, f.rot, 0]);
        }
        if (hasBalcony && fi === 0 && fl === 1 && k === doorIdx) {
          const [bx, bz] = at(0.2);
          S.add('box', [bx, yy - 0.3, bz], [0.8, 0.06, 0.4], PAL.trim, [0, f.rot, 0]);
          const [rx, rz] = at(0.38);
          S.add('box', [rx, yy - 0.12, rz], [0.8, 0.3, 0.03], PAL.railing, [0, f.rot, 0]);
        }
      }
    }
  });

  const group = finish(S, L, D, ghost);
  group.position.set(d.x, y0, d.z);
  group.rotation.y = d.ang;
  const radius = Math.hypot(w, dep) / 2;
  return {
    group,
    radius,
    hitDist: (x, z) => {
      const dx = x - d.x, dz = z - d.z;
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const ex = Math.max(Math.abs(lx) - w / 2, 0), ez = Math.max(Math.abs(lz) - dep / 2, 0);
      return Math.hypot(ex, ez);
    },
  };
}

// ---------- Dry stone wall ----------

export function buildWall(d, ghost = false) {
  const r = rng(d.seed);
  const pts = d.pts;
  const S = new GeoBuilder();
  const H = 1.15, ht = 0.24;
  const n = pts.length;
  if (n < 2) return null;

  const hs = pts.map(([x, z]) => getHeight(x, z));
  const nor = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return [-tz, tx, tx, tz];
  });

  const ribbon = (half, yb, yt, colorFn) => {
    const Lb = [], Lt = [], Rb = [], Rt = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = pts[i];
      const [nx, nz] = nor[i];
      const b = yb(i), t = yt(i);
      Lb.push([x + nx * half, b, z + nz * half]);
      Lt.push([x + nx * half, t, z + nz * half]);
      Rb.push([x - nx * half, b, z - nz * half]);
      Rt.push([x - nx * half, t, z - nz * half]);
    }
    for (let i = 0; i < n - 1; i++) {
      const c = colorFn(i);
      S.quad(Lb[i], Lb[i + 1], Lt[i + 1], Lt[i], c);
      S.quad(Rb[i + 1], Rb[i], Rt[i], Rt[i + 1], c.clone().multiplyScalar(0.94));
      S.quad(Lt[i], Lt[i + 1], Rt[i + 1], Rt[i], c.clone().multiplyScalar(1.05));
    }
    const e = n - 1;
    S.quad(Rb[0], Lb[0], Lt[0], Rt[0], colorFn(0));
    S.quad(Lb[e], Rb[e], Rt[e], Lt[e], colorFn(e - 1));
  };

  const segCol = [];
  for (let i = 0; i < n; i++) segCol.push(jitter(r() < 0.5 ? PAL.stone : PAL.stoneDark, r, 0.07));
  ribbon(ht, (i) => hs[i] - 1.0, (i) => hs[i] + H, (i) => segCol[i]);
  ribbon(ht + 0.07, (i) => hs[i] + H, (i) => hs[i] + H + 0.14, () => PAL.stoneLight);

  // Loose stones on the sides, for texture
  for (let i = 0; i < n - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const [nx, nz, tx, tz] = nor[i];
    const ang = Math.atan2(-tz, tx);
    const my = (hs[i] + hs[i + 1]) / 2;
    for (const side of [-1, 1]) {
      const count = r.int(1, 2);
      for (let k = 0; k < count; k++) {
        const along = r.range(-0.2, 0.2);
        const sy = my + r.range(0.15, H - 0.2);
        S.add('box',
          [mx + tx * along + nx * side * (ht + 0.015), sy, mz + tz * along + nz * side * (ht + 0.015)],
          [r.range(0.22, 0.42), r.range(0.13, 0.24), 0.06],
          jitter(r() < 0.5 ? PAL.stoneDark : PAL.stoneLight, r, 0.1),
          [0, ang, 0]);
      }
    }
  }

  // Pillars at both ends
  for (const i of [0, n - 1]) {
    const [x, z] = pts[i];
    const [, , tx, tz] = nor[i];
    const ang = Math.atan2(-tz, tx);
    const yb = hs[i] - 1.0, top = hs[i] + H + 0.45;
    S.add('box', [x, (yb + top) / 2, z], [0.66, top - yb, 0.66], jitter(PAL.stone, r, 0.05), [0, ang, 0]);
    S.add('box', [x, top + 0.06, z], [0.8, 0.12, 0.8], PAL.stoneLight, [0, ang, 0]);
    S.add('octa', [x, top + 0.3, z], [0.2, 0.26, 0.2], PAL.stoneLight, [0, ang, 0]);
  }

  const group = finish(S, null, null, ghost);
  return {
    group,
    radius: 0.5,
    hitDist: (x, z) => {
      let best = Infinity;
      for (let i = 0; i < n - 1; i++) {
        best = Math.min(best, distToSegment2(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      }
      return Math.max(best - ht, 0);
    },
  };
}

// ---------- Saracen watch tower ----------

export function buildTower(d, ghost = false) {
  const r = rng(d.seed);
  const H = r.range(4.3, 5.6);
  let y0 = -Infinity, yMin = Infinity;
  for (let a = 0; a < 6; a++) {
    const h = getHeight(d.x + Math.cos(a) * 1.2, d.z + Math.sin(a) * 1.2);
    y0 = Math.max(y0, h);
    yMin = Math.min(yMin, h);
  }
  y0 = Math.max(y0, getHeight(d.x, d.z));
  const yb = yMin - y0 - 0.8;
  const S = new GeoBuilder(), L = new GeoBuilder(), D = new GeoBuilder();
  const stone = jitter(PAL.towerStone, r, 0.05);
  const rBot = 1.22, rTop = 1.0;
  const radAt = (y) => rBot + (rTop - rBot) * ((y - yb) / (H - yb));

  S.add(taperedCylinder(rTop, rBot, 12), [0, (yb + H) / 2, 0], [1, H - yb, 1], stone);
  S.add('cyl12', [0, H * 0.62, 0], [radAt(H * 0.62) + 0.07, 0.14, radAt(H * 0.62) + 0.07], PAL.stoneLight);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    S.add('box', [Math.cos(a) * 1.06, H - 0.12, Math.sin(a) * 1.06], [0.2, 0.26, 0.2], stone, [0, -a, 0]);
  }
  S.add('cyl12', [0, H + 0.27, 0], [1.2, 0.55, 1.2], jitter(stone, r, 0.04));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    S.add('box', [Math.cos(a) * 1.04, H + 0.75, Math.sin(a) * 1.04], [0.28, 0.42, 0.4], stone, [0, -a, 0]);
  }
  // Raised door with a little wooden stair
  const doorY = 1.55;
  const dr = radAt(doorY);
  S.add('box', [0, doorY, dr - 0.02], [0.5, 0.85, 0.1], PAL.door);
  S.add('box', [0, doorY - 0.47, dr + 0.08], [0.62, 0.08, 0.28], PAL.stoneLight);
  for (let s = 0; s < 4; s++) {
    S.add('box', [0, 0.12 + s * 0.27, dr + 0.65 - s * 0.14], [0.55, 0.08, 0.22], PAL.wood);
  }
  // Slit windows
  for (const [a, y] of [[1.7, H * 0.45], [3.6, H * 0.5], [5.2, H * 0.42], [0.6, H * 0.82], [2.9, H * 0.84], [4.5, H * 0.8]]) {
    const rr = radAt(y);
    (r() < 0.5 ? L : D).add('box', [Math.cos(a) * rr, y, Math.sin(a) * rr], [0.14, 0.48, 0.12], PAL.white, [0, -a + Math.PI / 2, 0]);
  }
  // Flag pole
  S.add('cyl8', [0, H + 1.1, 0], [0.04, 1.3, 0.04], PAL.railing);

  const group = finish(S, L, D, ghost);
  // Genoa's flag: red cross on white
  const F = new GeoBuilder();
  F.add('box', [0.4, 0, 0], [0.76, 0.48, 0.02], PAL.white);
  F.add('box', [0.4, 0, 0], [0.76, 0.1, 0.035], PAL.red);
  F.add('box', [0.4, 0, 0], [0.1, 0.48, 0.035], PAL.red);
  const flag = new THREE.Mesh(F.build(), ghost ? GHOST.solid : MAT.solid);
  flag.position.set(0, H + 1.5, 0);
  flag.castShadow = !ghost;
  flag.userData.flag = true;
  flag.userData.phase = r() * 10;
  group.add(flag);
  group.position.set(d.x, y0, d.z);
  return {
    group,
    radius: 1.3,
    hitDist: (x, z) => Math.max(Math.hypot(x - d.x, z - d.z) - 1.2, 0),
  };
}

// ---------- Trees ----------

export function pickTreeType(r) {
  const v = r();
  if (v < 0.42) return 'olive';
  if (v < 0.62) return 'pine';
  if (v < 0.86) return 'cypress';
  return 'lemon';
}

export function buildTree(d, ghost = false) {
  const r = rng(d.seed);
  const s = r.range(0.8, 1.25);
  const S = new GeoBuilder();
  const rotY = r() * Math.PI * 2;
  if (d.type === 'olive') {
    const lean = r.range(-0.25, 0.25);
    S.add('cyl8', [0, 0.25 * s, 0], [0.13 * s, 1.1 * s, 0.13 * s], LEAF.oliveTrunk, [lean, 0, lean * 0.6]);
    S.add('cyl8', [0.12 * s, 0.85 * s, 0], [0.08 * s, 0.6 * s, 0.08 * s], LEAF.oliveTrunk, [0, 0, -0.5]);
    const blobs = r.int(3, 5);
    for (let i = 0; i < blobs; i++) {
      const a = r() * Math.PI * 2, rad = r.range(0.15, 0.5) * s;
      S.add('ico', [Math.cos(a) * rad, (1.05 + r.range(0, 0.4)) * s, Math.sin(a) * rad],
        [0.55 * s * r.range(0.8, 1.1), 0.42 * s, 0.55 * s * r.range(0.8, 1.1)], r.pick(LEAF.olive), [r(), r() * 3, 0]);
    }
  } else if (d.type === 'pine') {
    const lean = r.range(-0.18, 0.18);
    S.add('cyl8', [0, 1.1 * s, 0], [0.11 * s, 2.6 * s, 0.11 * s], LEAF.pineTrunk, [lean, 0, -lean * 0.5]);
    const top = 2.35 * s;
    S.add('dode', [lean * 1.2 * s, top, 0], [1.25 * s, 0.42 * s, 1.15 * s], r.pick(LEAF.pine), [0, r() * 3, 0]);
    S.add('dode', [lean * 1.2 * s + 0.3 * s, top + 0.28 * s, 0.2 * s], [0.75 * s, 0.32 * s, 0.7 * s], r.pick(LEAF.pine), [0, r() * 3, 0]);
  } else if (d.type === 'cypress') {
    S.add('cyl8', [0, 0.1, 0], [0.1 * s, 0.6, 0.1 * s], LEAF.pineTrunk);
    S.add('ico', [0, 1.55 * s, 0], [0.45 * s, 1.55 * s, 0.45 * s], r.pick(LEAF.cypress), [0, r() * 3, 0]);
    S.add('ico', [0, 2.7 * s, 0], [0.26 * s, 0.7 * s, 0.26 * s], r.pick(LEAF.cypress), [0, r() * 3, 0]);
  } else {
    S.add('cyl8', [0, 0.25, 0], [0.09 * s, 0.9 * s, 0.09 * s], LEAF.oliveTrunk);
    S.add('ico', [0, 0.95 * s, 0], [0.6 * s, 0.52 * s, 0.6 * s], r.pick(LEAF.bush), [0, r() * 3, 0]);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, e = r.range(-0.4, 0.9);
      S.add('octa', [Math.cos(a) * Math.cos(e) * 0.58 * s, 0.95 * s + Math.sin(e) * 0.48 * s, Math.sin(a) * Math.cos(e) * 0.58 * s],
        [0.075 * s, 0.09 * s, 0.075 * s], LEAF.lemon);
    }
  }
  const group = finish(S, null, null, ghost);
  group.position.set(d.x, getHeight(d.x, d.z) - 0.05, d.z);
  group.rotation.y = rotY;
  return {
    group,
    radius: 0.5,
    hitDist: (x, z) => Math.max(Math.hypot(x - d.x, z - d.z) - 0.4, 0),
  };
}

// ---------- Flower bushes ----------

export function buildFlower(d, ghost = false) {
  const r = rng(d.seed);
  const kind = FLOWERS[d.variant % FLOWERS.length];
  const S = new GeoBuilder();
  if (kind.spikes) {
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, rad = r.range(0, 0.28);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad, h = r.range(0.3, 0.45);
      S.add('box', [x, h / 2, z], [0.03, h, 0.03], LEAF.bush[0]);
      S.add('octa', [x, h + 0.06, z], [0.05, 0.12, 0.05], col(r.pick(kind.colors)));
    }
    S.add('ico', [0, 0.06, 0], [0.32, 0.14, 0.32], LEAF.bush[1]);
  } else {
    const blobs = r.int(2, 3);
    for (let i = 0; i < blobs; i++) {
      const a = r() * Math.PI * 2, rad = r.range(0.05, 0.25);
      S.add('ico', [Math.cos(a) * rad, 0.2, Math.sin(a) * rad], [r.range(0.22, 0.32), r.range(0.2, 0.28), r.range(0.22, 0.32)], r.pick(LEAF.bush), [r(), r() * 3, 0]);
    }
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, e = r.range(0.1, 1.2);
      S.add('octa', [Math.cos(a) * Math.cos(e) * 0.32, 0.2 + Math.sin(e) * 0.25, Math.sin(a) * Math.cos(e) * 0.32],
        [0.07, 0.07, 0.07], col(r.pick(kind.colors)), [r(), r(), 0]);
    }
  }
  const group = finish(S, null, null, ghost);
  group.position.set(d.x, getHeight(d.x, d.z) - 0.03, d.z);
  group.rotation.y = r() * Math.PI * 2;
  return {
    group,
    radius: 0.35,
    hitDist: (x, z) => Math.max(Math.hypot(x - d.x, z - d.z) - 0.3, 0),
  };
}

export const FLOWER_NAMES = FLOWERS.map((f) => f.name);

export const BUILDERS = {
  house: buildHouse,
  wall: buildWall,
  tower: buildTower,
  tree: buildTree,
  flower: buildFlower,
};
