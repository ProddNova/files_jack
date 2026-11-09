import * as THREE from '../vendor/three.module.min.js';
import { GeoBuilder, rng, col } from './util.js';
import { MAT } from './builders.js';
import { getHeight } from './terrain.js';

const TIMES = [
  {
    name: 'Alba', icon: '🌅',
    sun: [0.75, 0.22, 0.5], sunColor: '#ffc8a2', sunInt: 1.7,
    hemiSky: '#f7c9c4', hemiGround: '#6b5a5a', hemiInt: 0.75,
    skyTop: '#86acdb', skyHorizon: '#ffd2b5', fog: '#f3d2c4',
    water: '#5aa0b4', lit: 0.5, dark: 0.08, stars: 0.1,
  },
  {
    name: 'Giorno', icon: '☀️',
    sun: [0.45, 0.85, 0.35], sunColor: '#fff3df', sunInt: 2.5,
    hemiSky: '#d2e8ff', hemiGround: '#8a7f5e', hemiInt: 0.9,
    skyTop: '#5ea7e6', skyHorizon: '#d4ecff', fog: '#d0e6f4',
    water: '#3fa3bd', lit: 0, dark: 0, stars: 0,
  },
  {
    name: 'Tramonto', icon: '🌇',
    sun: [-0.8, 0.18, 0.45], sunColor: '#ff9a55', sunInt: 1.9,
    hemiSky: '#ffb790', hemiGround: '#5a4a6a', hemiInt: 0.65,
    skyTop: '#4a5fa3', skyHorizon: '#ffa070', fog: '#eaa686',
    water: '#4f7fa0', lit: 0.9, dark: 0.1, stars: 0.15,
  },
  {
    name: 'Notte', icon: '🌙',
    sun: [-0.3, 0.75, -0.4], sunColor: '#8fa6ff', sunInt: 0.5,
    hemiSky: '#34457e', hemiGround: '#141426', hemiInt: 0.4,
    skyTop: '#0a1330', skyHorizon: '#283463', fog: '#1d2647',
    water: '#1f3a5a', lit: 2.2, dark: 0.18, stars: 1,
  },
];

function presetToState(p) {
  return {
    sun: new THREE.Vector3(...p.sun).normalize(),
    sunColor: col(p.sunColor), sunInt: p.sunInt,
    hemiSky: col(p.hemiSky), hemiGround: col(p.hemiGround), hemiInt: p.hemiInt,
    skyTop: col(p.skyTop), skyHorizon: col(p.skyHorizon), fog: col(p.fog),
    water: col(p.water), lit: p.lit, dark: p.dark, stars: p.stars,
  };
}

function lerpState(out, a, b, t) {
  out.sun.copy(a.sun).lerp(b.sun, t).normalize();
  for (const k of ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'fog', 'water']) {
    out[k].copy(a[k]).lerp(b[k], t);
  }
  for (const k of ['sunInt', 'hemiInt', 'lit', 'dark', 'stars']) out[k] = a[k] + (b[k] - a[k]) * t;
}

function cloneState(s) {
  return {
    ...s,
    sun: s.sun.clone(), sunColor: s.sunColor.clone(), hemiSky: s.hemiSky.clone(), hemiGround: s.hemiGround.clone(),
    skyTop: s.skyTop.clone(), skyHorizon: s.skyHorizon.clone(), fog: s.fog.clone(), water: s.water.clone(),
  };
}

export function createWorld(scene, { lowPower }) {
  // Sky dome with a soft gradient
  const skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = mix(horizon, top, smoothstep(0.0, 0.55, h));
          c = mix(c, horizon * 0.9, smoothstep(0.0, -0.3, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // Stars, visible at night
  const starPos = [];
  const sr = rng(7);
  for (let i = 0; i < 500; i++) {
    const a = sr() * Math.PI * 2, e = Math.asin(sr() * 0.95 + 0.05);
    starPos.push(Math.cos(a) * Math.cos(e) * 350, Math.sin(e) * 350, Math.sin(a) * Math.cos(e) * 350);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Lights
  const hemi = new THREE.HemisphereLight('#ffffff', '#888866', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  scene.fog = new THREE.Fog('#d0e6f4', 70, 210);

  // Sea with gentle animated waves
  const waterUniforms = { uTime: { value: 0 } };
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#3fa3bd', transparent: true, opacity: 0.8, roughness: 0.25, metalness: 0.05, flatShading: true,
  });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3(position);
       transformed.z += sin(position.x * 0.33 + uTime * 1.1) * 0.07
         + sin(position.y * 0.41 + uTime * 0.85) * 0.06
         + sin((position.x + position.y) * 0.9 + uTime * 1.7) * 0.025;`,
    );
  };
  // Seabed far from the island, so the island's square edge never shows through the water
  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#7f8a72', roughness: 1 }),
  );
  seabed.position.y = -2.64;
  scene.add(seabed);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, lowPower ? 70 : 110, lowPower ? 70 : 110), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.02;
  water.receiveShadow = true;
  scene.add(water);

  // Clouds drifting over the island
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.94 });
  const clouds = [];
  const cr = rng(42);
  for (let i = 0; i < 7; i++) {
    const B = new GeoBuilder();
    const puffs = cr.int(4, 7);
    for (let k = 0; k < puffs; k++) {
      const s = cr.range(1.2, 2.4);
      B.add('ico', [k * 1.3 - puffs * 0.65, cr.range(-0.3, 0.5), cr.range(-0.9, 0.9)], [s, s * 0.7, s], col('#ffffff'), [cr(), cr(), 0]);
    }
    const m = new THREE.Mesh(B.build(), cloudMat);
    m.position.set(cr.range(-60, 60), cr.range(15, 20), cr.range(-40, 40));
    m.castShadow = !lowPower;
    m.userData.speed = cr.range(0.6, 1.3);
    scene.add(m);
    clouds.push(m);
  }

  // Seagulls
  const gullMat = new THREE.MeshStandardMaterial({ color: '#f4f4f0', flatShading: true, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.14, 0.75, 0, -0.05], 3));
  wingGeo.computeVertexNormals();
  const gulls = [];
  const gr = rng(99);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.42), gullMat);
    const wl = new THREE.Mesh(wingGeo, gullMat);
    const wr = new THREE.Mesh(wingGeo, gullMat);
    wr.scale.x = -1;
    g.add(body, wl, wr);
    g.userData = { wl, wr, cx: gr.range(-15, 15), cz: gr.range(-15, 15), R: gr.range(8, 18), y: gr.range(8, 13), sp: gr.range(0.15, 0.3) * (gr() < 0.5 ? -1 : 1), ph: gr() * 10 };
    scene.add(g);
    gulls.push(g);
  }

  // Little Ligurian "gozzi" bobbing near the shore
  const boats = [];
  const boatMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 });
  const br = rng(321);
  for (const [ang, stripe] of [[0.35, '#2f6fa8'], [2.3, '#3d8a5a'], [4.2, '#c0392b'], [5.3, '#e0a526']]) {
    let rad = 18;
    while (rad < 40 && getHeight(Math.cos(ang) * rad, Math.sin(ang) * rad) > -1.0) rad += 0.5;
    rad += br.range(1, 4);
    const B = new GeoBuilder();
    const white = col('#f4f1ea'), st = col(stripe), wood = col('#9b7653');
    B.add('box', [0, 0.1, 0], [1.7, 0.32, 0.72], white);
    B.add('box', [0.85, 0.1, 0], [0.51, 0.32, 0.51], white, [0, Math.PI / 4, 0]);
    B.add('box', [0, 0.23, 0], [1.72, 0.07, 0.74], st);
    B.add('box', [0.85, 0.23, 0], [0.53, 0.07, 0.53], st, [0, Math.PI / 4, 0]);
    B.add('box', [-0.05, 0.27, 0], [1.4, 0.04, 0.56], wood);
    B.add('box', [-0.2, 0.36, 0], [0.18, 0.16, 0.56], wood);
    B.add('box', [-0.9, 0.3, 0], [0.12, 0.3, 0.12], col('#3b3a3a'));
    const m = new THREE.Mesh(B.build(), boatMat);
    m.castShadow = true;
    m.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    m.rotation.y = br() * Math.PI * 2;
    m.userData = { ph: br() * 10, baseRot: m.rotation.y };
    scene.add(m);
    boats.push(m);
  }

  const states = TIMES.map(presetToState);
  let timeIndex = 1;
  const cur = cloneState(states[timeIndex]);
  let from = cloneState(cur);
  let blend = 1;

  function apply() {
    sun.color.copy(cur.sunColor);
    sun.intensity = cur.sunInt;
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemiInt;
    skyUniforms.top.value.copy(cur.skyTop);
    skyUniforms.horizon.value.copy(cur.skyHorizon);
    scene.fog.color.copy(cur.fog);
    waterMat.color.copy(cur.water);
    MAT.glassLit.emissiveIntensity = cur.lit;
    MAT.glassDark.emissiveIntensity = cur.dark;
    starMat.opacity = cur.stars;
    stars.visible = cur.stars > 0.01;
  }
  apply();

  return {
    times: TIMES,
    get timeIndex() { return timeIndex; },
    setTime(i) {
      timeIndex = ((i % TIMES.length) + TIMES.length) % TIMES.length;
      from = cloneState(cur);
      blend = 0;
      return TIMES[timeIndex];
    },
    update(dt, t, camera, controlsTarget) {
      if (blend < 1) {
        blend = Math.min(1, blend + dt / 1.6);
        const k = blend * blend * (3 - 2 * blend);
        lerpState(cur, from, states[timeIndex], k);
        apply();
      }
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      waterUniforms.uTime.value = t;
      // Keep the shadow box centered where the player is looking
      const c = controlsTarget;
      sun.target.position.set(c.x, 0, c.z);
      sun.position.set(c.x + cur.sun.x * 70, cur.sun.y * 70, c.z + cur.sun.z * 70);
      water.position.x = Math.round(camera.position.x / 4) * 4;
      water.position.z = Math.round(camera.position.z / 4) * 4;
      for (const m of clouds) {
        m.position.x += m.userData.speed * dt;
        if (m.position.x > 70) m.position.x = -70;
      }
      for (const b of boats) {
        const ph = b.userData.ph;
        b.position.y = Math.sin(t * 1.3 + ph) * 0.05 - 0.02;
        b.rotation.z = Math.sin(t * 1.1 + ph) * 0.05;
        b.rotation.x = Math.sin(t * 0.9 + ph * 2) * 0.03;
        b.rotation.y = b.userData.baseRot + Math.sin(t * 0.2 + ph) * 0.15;
      }
      for (const g of gulls) {
        const u = g.userData;
        const a = t * u.sp + u.ph;
        g.position.set(u.cx + Math.cos(a) * u.R, u.y + Math.sin(t * 0.7 + u.ph) * 0.6, u.cz + Math.sin(a) * u.R);
        g.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * 7 + u.ph * 3) * 0.45;
        u.wl.rotation.z = flap;
        u.wr.rotation.z = -flap;
      }
    },
  };
}
