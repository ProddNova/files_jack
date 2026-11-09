// The landscape beyond the buildable map: hills, mountains, far islands and
// forests out to the horizon. It cannot be edited, so it is drawn cheaply:
// one mesh with big triangles far away and small ones near the map, colored
// per vertex, plus one instanced mesh for thousands of distant trees.
import * as THREE from '../vendor/three.module.min.js';
import { SIZE, vistaHeight, isMainland, getScenario, SCENARIOS, groundColor } from './terrain.js';
import { noise2, rng, smoothstep } from './util.js';
import { terrainize } from './shaders.js';

const HALF = SIZE / 2;

function coords() {
  const xs = [];
  for (let x = -HALF; x <= HALF + 1e-6; x += 2.4) xs.push(+x.toFixed(3));
  xs[xs.length - 1] = HALF;
  const outer = [];
  let x = HALF, step = 2.4;
  while (x < 950) {
    x += step;
    if (x > 80) step *= 1.1;
    outer.push(x);
  }
  return [...outer.map((v) => -v).reverse(), ...xs, ...outer];
}

function treeGeometry() {
  // A simple conifer-like shape: trunk + two stacked cones, colored per vertex
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1.2, 5).translate(0, 0.6, 0);
  const c1 = new THREE.ConeGeometry(1.1, 2.4, 7).translate(0, 2.0, 0);
  const c2 = new THREE.ConeGeometry(0.8, 1.9, 7).translate(0, 3.1, 0);
  for (const [g, color] of [[trunk, '#5b4636'], [c1, '#3f6638'], [c2, '#4a7340']]) {
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const pos = [], nor = [], col = [];
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    col.push(...g.attributes.color.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export function createVista(scene) {
  const C = coords();
  const n = C.length;
  const pos = new Float32Array(n * n * 3);
  const colr = new Float32Array(n * n * 3);
  const idx = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      // Skip cells inside the buildable map (the real terrain is there)
      const inside = Math.max(Math.abs(C[i]), Math.abs(C[i + 1])) <= HALF + 1e-6 && Math.max(Math.abs(C[j]), Math.abs(C[j + 1])) <= HALF + 1e-6;
      if (inside) continue;
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const splat = new Float32Array(n * n * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  // Same ground shader as the map (grass, sand, rock textures), so the edge does not show
  geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
  geo.setAttribute('aPath', new THREE.BufferAttribute(new Float32Array(n * n * 4), 4));
  geo.setIndex(idx);
  const mat = terrainize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'vista';
  scene.add(mesh);

  const MAXT = 2000;
  const trees = new THREE.InstancedMesh(treeGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), MAXT);
  trees.frustumCulled = false;
  scene.add(trees);

  const tmp = new THREE.Color();
  const gc = { color: new THREE.Color(), grass: 0, sand: 0, rock: 0 };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  function rebuild() {
    const S = SCENARIOS[getScenario()];
    const P = S.pal;
    const snowLine = S.mainland ? 42 : 55;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = C[i], z = C[j];
        const k = j * n + i;
        const onEdge = Math.max(Math.abs(x), Math.abs(z)) <= HALF + 1e-6;
        let h = vistaHeight(x, z);
        // Inside the map: tucked just under the real terrain
        if (onEdge && Math.max(Math.abs(x), Math.abs(z)) < HALF - 1e-6) h -= 3;
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    const nr = geo.attributes.normal.array;
    for (let k = 0; k < n * n; k++) {
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const slope = 1 - nr[k * 3 + 1];
      // Close to the map the colors match it exactly; farther out, woods and fields
      const away = smoothstep(HALF + 2, HALF + 26, Math.max(Math.abs(x), Math.abs(z)));
      let sand = 0, rock = 0;
      if (away < 1 && h > -0.15) {
        // Next to the map: exactly the map's own colors
        groundColor(x, z, h, Math.min(slope * 3, 1), gc);
        tmp.copy(gc.color);
        sand = gc.sand;
        rock = gc.rock;
        const far = farColor(x, z, h, slope);
        tmp.lerp(far.c, away);
        sand += (far.sand - sand) * away;
        rock += (far.rock - rock) * away;
      } else {
        const far = farColor(x, z, h, slope);
        tmp.copy(far.c);
        sand = far.sand;
        rock = far.rock;
      }
      colr[k * 3] = tmp.r;
      colr[k * 3 + 1] = tmp.g;
      colr[k * 3 + 2] = tmp.b;
      splat[k * 4] = (1 - sand) * (1 - rock);
      splat[k * 4 + 1] = sand * (1 - rock);
      splat[k * 4 + 2] = rock;
      splat[k * 4 + 3] = 0;
    }
    geo.attributes.aSplat.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    placeTrees(snowLine);
  }

  const fc = { c: new THREE.Color(), sand: 0, rock: 0 };
  const woodsCol = new THREE.Color('#3c5a32');
  function farColor(x, z, h, slope) {
    const S = SCENARIOS[getScenario()];
    const P = S.pal;
    const snowLine = S.mainland ? 42 : 55;
    const nn = noise2(x * 0.04, z * 0.04);
    const t = fc.c;
    fc.sand = 0;
    fc.rock = 0;
    if (h < -0.15) { t.copy(P.wetSand).lerp(P.deep, smoothstep(-0.15, -4, h)); fc.sand = 1; return fc; }
    if (h < 0.6 && !S.mainland) { t.copy(P.sand); fc.sand = 1; return fc; }
    t.copy(P.grass1).lerp(P.grass2, noise2(x * 0.35, z * 0.35));
    t.lerp(P.maquis, smoothstep(2.8, 5.0, h) * 0.6);
    t.lerp(woodsCol, smoothstep(0.45, 0.7, noise2(x * 0.02 + 7, z * 0.02 - 3)) * 0.7);
    t.lerp(P.dry, smoothstep(0.6, 0.85, noise2(x * 0.013 - 5, z * 0.013 + 2)) * 0.45);
    let rock = Math.min(1, smoothstep(0.2, 0.45, slope) * 0.9 + smoothstep(snowLine * 0.5, snowLine * 0.9, h) * 0.6);
    t.lerp(noise2(x * 0.1, z * 0.1) > 0.5 ? P.rock : P.rockDark, rock);
    const snow = smoothstep(snowLine, snowLine + 12, h + nn * 8) * (1 - smoothstep(0.55, 0.8, slope) * 0.6);
    t.lerp(P.snow, snow);
    fc.rock = Math.max(rock, snow);
    return fc;
  }

  function placeTrees(snowLine) {
    // Forests on gentle green slopes, thicker close to the map
    const r = rng(4242);
    let count = 0;
    for (let tries = 0; tries < 30000 && count < MAXT; tries++) {
      const a = r() * Math.PI * 2;
      const d = HALF + 10 + (r() ** 1.25) * 360;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) < HALF + 2) continue;
      const h = vistaHeight(x, z);
      if (h < 0.4 || h > snowLine * 0.8) continue;
      const woods = noise2(x * 0.02 + 7, z * 0.02 - 3);
      if (woods < 0.45 + r() * 0.2 + (d < HALF + 30 ? 0.12 : 0)) continue;
      const hx = vistaHeight(x + 1.5, z) - h, hz = vistaHeight(x, z + 1.5) - h;
      if (Math.hypot(hx, hz) > 1.6) continue;
      const s = (0.8 + r() * 0.7) * (1 + d / 260);
      q.setFromAxisAngle(up, r() * 6.28);
      m4.compose(v.set(x, h - 0.2, z), q, sc.set(s, s * (0.85 + r() * 0.4), s));
      trees.setMatrixAt(count, m4);
      trees.setColorAt(count, tmp.setScalar(0.75 + r() * 0.4));
      count++;
    }
    trees.count = count;
    trees.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  }

  return { rebuild, mesh, trees, get mainland() { return isMainland(); } };
}
