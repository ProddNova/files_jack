// Small automatic details: grass, wildflowers, rocks, laundry lines, fireflies.
import * as THREE from '../vendor/three.module.min.js';
import { rng, col, GeoBuilder } from './util.js';
import { getHeight, pathAt, ISLAND_R } from './terrain.js';
import { MAT, isNature } from './builders.js';
import { pointIn } from './placement.js';

const CELL = 4;

function tuftGeometry() {
  const pos = [], colr = [];
  const base = col('#4f7a30'), tip = col('#a9c86a');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    const cx = Math.cos(a), cz = Math.sin(a);
    const px = -cz * 0.035, pz = cx * 0.035;
    const lean = 0.09;
    pos.push(cx * 0.03 - px, 0, cz * 0.03 - pz, cx * 0.03 + px, 0, cz * 0.03 + pz, cx * lean, 0.28 + (k % 2) * 0.08, cz * lean);
    colr.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();
  return g;
}

function scatter(r, count, test) {
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 20) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (ISLAND_R + 1);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (test(x, z)) pts.push({ x, z, s: r.range(0.75, 1.35), rot: r() * Math.PI * 2, r: r() });
  }
  return pts;
}

export function createDecor(scene, { lowPower }) {
  const r = rng(77);
  // Scattered over the whole island area; refresh() hides what ends up in water
  const any = () => true;
  const tufts = scatter(r, lowPower ? 1800 : 3400, any);
  const flowers = scatter(r, lowPower ? 500 : 900, any);
  const rocks = scatter(r, 140, any);

  const grassMesh = new THREE.InstancedMesh(tuftGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), tufts.length);
  grassMesh.receiveShadow = true;
  const flowerColors = ['#ffffff', '#f6d743', '#c99de8', '#f08bb0', '#ffffff'].map(col);
  const flowerMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), flowers.length);
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#a39b8d', flatShading: true, roughness: 1 }), rocks.length);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  const tint = new THREE.Color();
  tufts.forEach((p, i) => grassMesh.setColorAt(i, tint.setScalar(0.8 + p.r * 0.4)));
  flowers.forEach((p, i) => flowerMesh.setColorAt(i, flowerColors[Math.floor(p.r * flowerColors.length)]));
  rocks.forEach((p, i) => rockMesh.setColorAt(i, tint.setScalar(0.8 + p.r * 0.35)));
  for (const m of [grassMesh, flowerMesh, rockMesh]) {
    m.frustumCulled = false;
    scene.add(m);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // Puts every blade back on the ground and hides the ones under buildings or paths.
  function refresh(objects) {
    const grid = new Map();
    for (const o of objects) {
      if (isNature(o.kind) || !o.bounds) continue;
      const b = o.bounds;
      for (let gx = Math.floor((b.x - b.r) / CELL); gx <= Math.floor((b.x + b.r) / CELL); gx++) {
        for (let gz = Math.floor((b.z - b.r) / CELL); gz <= Math.floor((b.z + b.r) / CELL); gz++) {
          const k = gx * 1000 + gz;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(o);
        }
      }
    }
    const covered = (x, z) => {
      const list = grid.get(Math.floor(x / CELL) * 1000 + Math.floor(z / CELL));
      if (!list) return false;
      for (const o of list) if (pointIn(o.fp, x, z, 0.12)) return true;
      return false;
    };
    const place = (mesh, pts, minH, maxH, yOff, scaleFn) => {
      pts.forEach((p, i) => {
        const h = getHeight(p.x, p.z);
        const hide = h < minH || h > maxH || pathAt(p.x, p.z) > 0.2 || covered(p.x, p.z);
        q.setFromAxisAngle(up, p.rot);
        v.set(p.x, h + yOff * p.s, p.z);
        const k = hide ? 0.0001 : p.s;
        scaleFn(s, k, p);
        m4.compose(v, q, s);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(grassMesh, tufts, 0.45, 99, -0.02, (out, k) => out.set(k, k, k));
    place(flowerMesh, flowers, 0.55, 99, 0.2, (out, k) => out.set(k, k, k));
    place(rockMesh, rocks, -0.4, 0.9, 0.02, (out, k, p) => out.set(k * 0.35, k * 0.22, k * 0.28));
  }

  // ---------- Laundry hung between nearby houses ----------
  let laundry = null;
  const clothes = ['#ffffff', '#f2d5d5', '#cfe3f2', '#f7e6a8', '#d9ead0', '#e98b5e', '#8fb3d9'].map(col);

  function edgePoint(o, tx, tz) {
    const { x, z, ang } = o.data;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const dx = tx - x, dz = tz - z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const hw = o.meta.w / 2 + 0.03, hd = o.meta.d / 2 + 0.03;
    const t = Math.min(hw / Math.max(Math.abs(lx), 1e-4), hd / Math.max(Math.abs(lz), 1e-4));
    return [x + lx * t * c + lz * t * sn, z - lx * t * sn + lz * t * c];
  }

  function refreshLaundry(objects) {
    if (laundry) {
      scene.remove(laundry);
      laundry.geometry.dispose();
      laundry = null;
    }
    const houses = objects.filter((o) => o.kind === 'house' && (o.meta.style === 'casa' || o.meta.style === 'villetta'));
    const B = new GeoBuilder();
    for (let i = 0; i < houses.length; i++) {
      for (let j = i + 1; j < houses.length; j++) {
        const A = houses[i], H = houses[j];
        const dist = Math.hypot(A.data.x - H.data.x, A.data.z - H.data.z);
        if (dist < 2 || dist > 6.5) continue;
        const lr = rng((A.data.seed ^ H.data.seed) >>> 0);
        if (lr() > 0.6) continue;
        const [ax, az] = edgePoint(A, H.data.x, H.data.z);
        const [bx, bz] = edgePoint(H, A.data.x, A.data.z);
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.8 || len > 4.5) continue;
        const eave = (o) => o.meta.y0 + 0.18 + o.meta.floors * 0.95;
        const y = Math.min(eave(A), eave(H)) - 0.55;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (y < getHeight(mx, mz) + 1.7) continue;
        if (houses.some((o) => o !== A && o !== H && pointIn(o.fp, mx, mz, 0))) continue;
        const yaw = Math.atan2(-(bz - az), bx - ax);
        const P = (t) => [ax + (bx - ax) * t, y - 0.6 * t * (1 - t), az + (bz - az) * t];
        const segs = 4;
        for (let k = 0; k < segs; k++) {
          const p0 = P(k / segs), p1 = P((k + 1) / segs);
          const hl = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
          B.add('box', [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], [hl + 0.02, 0.015, 0.015], col('#d8d2c4'), [0, yaw, Math.atan2(p1[1] - p0[1], hl)]);
        }
        const n = Math.floor(len / 0.42);
        for (let k = 0; k < n; k++) {
          const p = P((k + 0.5) / n);
          const ch = lr.range(0.22, 0.4);
          B.add('box', [p[0], p[1] - ch / 2 - 0.01, p[2]], [lr.range(0.18, 0.3), ch, 0.015], lr.pick(clothes), [0, yaw, 0]);
        }
      }
    }
    if (B.empty) return;
    laundry = new THREE.Mesh(B.build(), MAT.solid);
    laundry.castShadow = true;
    scene.add(laundry);
  }

  // ---------- Fireflies ----------
  const flyBase = scatter(r, 70, any);
  const flyPos = new Float32Array(flyBase.length * 3);
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flyMat = new THREE.PointsMaterial({ map: MAT.glow.map, color: '#e4ff8a', size: 0.45, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.frustumCulled = false;
  scene.add(flies);

  return {
    refresh(objects) {
      refresh(objects);
      refreshLaundry(objects);
    },
    update(t, night) {
      flyMat.opacity = Math.max(0, night - 0.55) * 2.2;
      flies.visible = flyMat.opacity > 0.01;
      if (!flies.visible) return;
      flyBase.forEach((p, i) => {
        const ph = p.r * 20;
        flyPos[i * 3] = p.x + Math.sin(t * 0.5 + ph) * 0.8;
        flyPos[i * 3 + 1] = getHeight(p.x, p.z) + 0.8 + Math.sin(t * 1.3 + ph) * 0.35;
        flyPos[i * 3 + 2] = p.z + Math.cos(t * 0.4 + ph * 1.3) * 0.8;
      });
      flyGeo.attributes.position.needsUpdate = true;
      flyMat.size = 0.3 + Math.sin(t * 3) * 0.08;
    },
  };
}
