// Villagers: little people who leave their homes and stroll along the paths.
// Each body part (legs, arms, body, head, hair, hat) is one instanced mesh, so
// forty walkers with swinging arms and legs cost only six draw calls.
// Sizes match the buildings: a person is about 0.57 units (1.75 m), a floor 0.95.
import * as THREE from '../vendor/three.module.min.js';
import { getHeight, pathAt } from './terrain.js';
import { pointIn } from './placement.js';
import { rng } from './util.js';

const MAX = 44;
const SHIRTS = ['#c8553d', '#2f6fa8', '#3d8a5a', '#e0a526', '#8e44ad', '#f4efe4', '#3b3a3a', '#d98e6c', '#5c9c86', '#b8d4e8', '#9b2f3a', '#e8dcc0'];
const TROUSERS = ['#3a3f4f', '#4b5b78', '#5a4a3a', '#2f2f33', '#7a6a55', '#3d4a3a'];
const SKIN = ['#f1c9a5', '#e4b48e', '#d9a982', '#b07d5a', '#8a5a3c'];
const HAIR = ['#2b1d14', '#4a3020', '#7a5230', '#c9a060', '#1c1c1c', '#9a9a9a', '#e8e2d6', '#8c3a1e'];
const HATS = ['#d9c08a', '#3b3a3a', '#7a2f2f', '#f2efe6'];

const HIP = 0.25, SHOULDER = 0.43, HEAD = 0.505;

function part(geo) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), MAX * 2);
  m.castShadow = true;
  m.frustumCulled = false;
  m.count = 0;
  return m;
}

export function createLife(scene) {
  // Geometry is built around each joint, so a rotation swings it naturally
  const legGeo = new THREE.CylinderGeometry(0.032, 0.026, HIP, 6).translate(0, -HIP / 2, 0);
  const armGeo = new THREE.CylinderGeometry(0.024, 0.019, 0.2, 6).translate(0, -0.1, 0);
  const torsoGeo = new THREE.CylinderGeometry(0.068, 0.078, SHOULDER - HIP + 0.03, 8).translate(0, (SHOULDER + HIP) / 2, 0);
  const dressGeo = new THREE.CylinderGeometry(0.066, 0.13, 0.36, 10).translate(0, 0.27, 0);
  const headGeo = new THREE.SphereGeometry(0.058, 12, 9).scale(0.95, 1.08, 1).translate(0, HEAD, 0);
  const hairGeo = new THREE.SphereGeometry(0.063, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, HEAD + 0.008, -0.006);
  const hatGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.05, 10).translate(0, HEAD + 0.075, 0);
  const brim = new THREE.CylinderGeometry(0.11, 0.11, 0.008, 14).translate(0, HEAD + 0.05, 0);
  const hatFull = mergeSimple([hatGeo, brim]);

  const legs = part(legGeo), arms = part(armGeo), torsos = part(torsoGeo), dresses = part(dressGeo);
  const heads = part(headGeo), hairs = part(hairGeo), hats = part(hatFull);
  const all = [legs, arms, torsos, dresses, heads, hairs, hats];
  for (const m of all) scene.add(m);

  const r = rng(808);
  const people = [];
  const col = new THREE.Color();
  for (let i = 0; i < MAX; i++) {
    const dress = r() < 0.3;
    const p = {
      x: 0, z: 0, tx: 0, tz: 0, wait: r.range(0, 4), home: null, phase: r() * 10,
      speed: r.range(0.38, 0.6), night: r() < 0.7, dress, hat: r() < 0.35,
      scale: r.range(0.92, 1.06), walk: 0, yaw: 0,
    };
    const shirt = r.pick(SHIRTS), skin = r.pick(SKIN);
    torsos.setColorAt(i, col.set(shirt));
    dresses.setColorAt(i, col.set(dress ? r.pick(SHIRTS) : shirt));
    for (const k of [0, 1]) {
      legs.setColorAt(i * 2 + k, col.set(dress ? skin : r.pick(TROUSERS)));
      arms.setColorAt(i * 2 + k, col.set(r() < 0.3 ? skin : shirt));
    }
    heads.setColorAt(i, col.set(skin));
    hairs.setColorAt(i, col.set(r.pick(HAIR)));
    hats.setColorAt(i, col.set(r.pick(HATS)));
    people.push(p);
  }
  for (const m of all) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  let homes = [];
  let blockers = [];
  const base = new THREE.Matrix4(), m4 = new THREE.Matrix4(), loc = new THREE.Matrix4(), rot = new THREE.Matrix4();
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  const free = (x, z) => getHeight(x, z) > 0.15 && !blockers.some((o) => pointIn(o.fp, x, z, 0.12));

  function pickTarget(p) {
    const home = p.home;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 8;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (pathAt(x, z) > 0.5 && free(x, z)) return [x, z];
    }
    if (homes.length && Math.random() < 0.3) {
      const h = homes[Math.floor(Math.random() * homes.length)];
      return [h.x, h.z];
    }
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, d = 0.5 + Math.random() * 3;
      const x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
      if (free(x, z)) return [x, z];
    }
    return [home.x, home.z];
  }

  function setPart(mesh, i, ox, oy, oz, swing) {
    loc.makeRotationX(swing);
    loc.setPosition(ox, oy, oz);
    m4.multiplyMatrices(base, loc);
    mesh.setMatrixAt(i, m4);
  }

  return {
    // Called when the village changes: one or two people per house
    refresh(objects) {
      blockers = objects.filter((o) => (o.kind === 'house' && o.data.style !== 'porta') || o.kind === 'tower' || o.kind === 'prop');
      homes = objects.filter((o) => o.kind === 'house' && o.data.style !== 'porta').map((o) => {
        const a = o.data.ang;
        const d = o.meta.d / 2 + 0.45;
        return { x: o.data.x + Math.sin(a) * d, z: o.data.z + Math.cos(a) * d };
      }).filter((h) => getHeight(h.x, h.z) > 0.1);
      const want = Math.min(MAX, homes.length * 2);
      for (let i = 0; i < MAX; i++) {
        const p = people[i];
        if (i >= want) { p.home = null; continue; }
        const home = homes[i % homes.length];
        if (!p.home || Math.hypot(p.home.x - home.x, p.home.z - home.z) > 0.01) {
          p.home = home;
          p.x = p.tx = home.x;
          p.z = p.tz = home.z;
          p.wait = Math.random() * 3;
        }
      }
      for (const m of [torsos, dresses, heads, hairs, hats]) m.count = want;
      legs.count = arms.count = want * 2;
    },
    update(dt, t, night) {
      const n = torsos.count;
      if (!n) return;
      for (let i = 0; i < n; i++) {
        const p = people[i];
        if (!p.home) continue;
        // At night most people stay home
        const out = night < 0.6 || !p.night;
        const dx = p.tx - p.x, dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        let moving = false;
        if (d > 0.05) {
          const step = Math.min(d, p.speed * dt);
          const nx = p.x + (dx / d) * step, nz = p.z + (dz / d) * step;
          if (free(nx, nz) || d < 0.6) { p.x = nx; p.z = nz; moving = true; }
          else { p.tx = p.x; p.tz = p.z; }
        } else if ((p.wait -= dt) <= 0) {
          [p.tx, p.tz] = out ? pickTarget(p) : [p.home.x, p.home.z];
          p.wait = 2 + Math.random() * 5;
        }
        if (d > 0.05) {
          // Turn smoothly toward where they walk
          const want = Math.atan2(dx, dz);
          let da = want - p.yaw;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          p.yaw += da * Math.min(1, dt * 8);
        }
        p.walk += (moving ? 1 : -1) * dt * 4;
        p.walk = Math.min(1, Math.max(0, p.walk));
        const hidden = !out && Math.hypot(p.x - p.home.x, p.z - p.home.z) < 0.3;
        if (hidden) {
          for (const m of [torsos, dresses, heads, hairs, hats]) m.setMatrixAt(i, ZERO);
          for (const k of [0, 1]) { legs.setMatrixAt(i * 2 + k, ZERO); arms.setMatrixAt(i * 2 + k, ZERO); }
          continue;
        }
        const cyc = t * p.speed * 15 + p.phase;
        const sw = Math.sin(cyc) * 0.55 * p.walk;
        const bob = Math.abs(Math.cos(cyc)) * 0.012 * p.walk;
        const breathe = Math.sin(t * 1.7 + p.phase) * 0.004;
        q.setFromAxisAngle(up, p.yaw);
        v.set(p.x, getHeight(p.x, p.z) + bob, p.z);
        base.compose(v, q, s.setScalar(p.scale));
        setPart(torsos, i, 0, breathe, 0, 0);
        if (p.dress) setPart(dresses, i, 0, 0, 0, 0); else dresses.setMatrixAt(i, ZERO);
        setPart(heads, i, 0, breathe, 0, 0);
        setPart(hairs, i, 0, breathe, 0, 0);
        if (p.hat) setPart(hats, i, 0, breathe, 0, 0); else hats.setMatrixAt(i, ZERO);
        for (const k of [0, 1]) {
          const side = k ? 1 : -1;
          setPart(legs, i * 2 + k, side * 0.042, HIP, 0, side * sw);
          // Arms swing opposite to the legs; standing still they hang with a tiny sway
          setPart(arms, i * 2 + k, side * 0.092, SHOULDER, 0, -side * sw * 0.8 + Math.sin(t * 1.3 + p.phase + k) * 0.03);
          rot.identity();
        }
      }
      for (const m of all) m.instanceMatrix.needsUpdate = true;
    },
  };
}

function mergeSimple(geos) {
  const pos = [], nor = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
