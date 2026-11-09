// Villagers: little people who leave their homes and stroll along the paths.
// All of them are drawn with two instanced meshes (bodies and heads), so even
// thirty walkers cost the GPU only two draw calls.
import * as THREE from '../vendor/three.module.min.js';
import { getHeight, pathAt } from './terrain.js';
import { pointIn } from './placement.js';
import { rng } from './util.js';

const MAX = 32;
const CLOTHES = ['#c8553d', '#2f6fa8', '#3d8a5a', '#e0a526', '#8e44ad', '#f4efe4', '#3b3a3a', '#d98e6c', '#5c9c86'];
const SKIN = ['#f1c9a5', '#d9a982', '#b07d5a', '#8a5a3c'];

export function createLife(scene) {
  const bodyGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.38, 8).translate(0, 0.19, 0);
  const headGeo = new THREE.SphereGeometry(0.075, 10, 8).translate(0, 0.46, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), MAX);
  for (const m of [bodies, heads]) {
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
  }
  const r = rng(808);
  const people = [];
  for (let i = 0; i < MAX; i++) {
    bodies.setColorAt(i, new THREE.Color(r.pick(CLOTHES)));
    heads.setColorAt(i, new THREE.Color(r.pick(SKIN)));
    people.push({ x: 0, z: 0, tx: 0, tz: 0, wait: r.range(0, 4), home: null, phase: r() * 10, speed: r.range(0.35, 0.55), night: r() < 0.7 });
  }
  let homes = [];
  let blockers = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

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
      bodies.count = heads.count = want;
    },
    update(dt, t, night) {
      const n = bodies.count;
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
        const hidden = !out && Math.hypot(p.x - p.home.x, p.z - p.home.z) < 0.3;
        const h = getHeight(p.x, p.z);
        const hop = moving ? Math.abs(Math.sin(t * 9 + p.phase)) * 0.04 : 0;
        v.set(p.x, h + hop, p.z);
        if (d > 0.05) q.setFromAxisAngle(up, Math.atan2(dx, dz));
        s.setScalar(hidden ? 0.0001 : 1);
        m4.compose(v, q, s);
        bodies.setMatrixAt(i, m4);
        heads.setMatrixAt(i, m4);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    },
  };
}
