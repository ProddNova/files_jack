import * as THREE from '../vendor/three.module.min.js';
import { GeoBuilder, rng, col } from './util.js';
import { MAT } from './builders.js';
import { getHeight, heightTexture, HEIGHT_UV } from './terrain.js';
import { TEX } from './shaders.js';
import { L } from './textures.js';

const TIMES = [
  {
    name: 'Alba', icon: '🌅',
    sun: [0.75, 0.22, 0.5], sunColor: '#ffc8a2', sunInt: 2.0,
    hemiSky: '#f7c9c4', hemiGround: '#6b5a5a', hemiInt: 0.45,
    skyTop: '#86acdb', skyHorizon: '#ffd2b5', fog: '#f3d2c4',
    water: '#3f86a8', shallow: '#8fd0c8', lit: 0.5, dark: 0.08, stars: 0.1, lamps: 0.45, glow: 0.9, exposure: 1.0,
  },
  {
    name: 'Giorno', icon: '☀️',
    sun: [0.45, 0.85, 0.35], sunColor: '#fff3df', sunInt: 2.9,
    hemiSky: '#d2e8ff', hemiGround: '#8a7f5e', hemiInt: 0.5,
    skyTop: '#5ea7e6', skyHorizon: '#d4ecff', fog: '#d0e6f4',
    water: '#2a8bb2', shallow: '#7fe0d2', lit: 0, dark: 0, stars: 0, lamps: 0, glow: 0.5, exposure: 1.0,
  },
  {
    name: 'Tramonto', icon: '🌇',
    sun: [-0.8, 0.18, 0.45], sunColor: '#ff9a55', sunInt: 2.3,
    hemiSky: '#ffb790', hemiGround: '#5a4a6a', hemiInt: 0.4,
    skyTop: '#4a5fa3', skyHorizon: '#ffa070', fog: '#eaa686',
    water: '#3d6f96', shallow: '#d9a98a', lit: 0.9, dark: 0.1, stars: 0.15, lamps: 0.7, glow: 1.4, exposure: 1.05,
  },
  {
    name: 'Notte', icon: '🌙',
    sun: [-0.3, 0.75, -0.4], sunColor: '#8fa6ff', sunInt: 0.55,
    hemiSky: '#34457e', hemiGround: '#141426', hemiInt: 0.3,
    skyTop: '#0a1330', skyHorizon: '#283463', fog: '#1d2647',
    water: '#18324f', shallow: '#2f5f74', lit: 2.6, dark: 0.2, stars: 1, lamps: 1, glow: 0.25, exposure: 1.15,
  },
];

export const WEATHER = [
  { id: 'sereno', name: 'Sereno', icon: '☀️', clouds: 7, cloudTint: 1, light: 1, rain: 0, fog: 1 },
  { id: 'nuvoloso', name: 'Nuvoloso', icon: '⛅', clouds: 16, cloudTint: 0.85, light: 0.7, rain: 0, fog: 0.8 },
  { id: 'pioggia', name: 'Pioggia', icon: '🌧️', clouds: 22, cloudTint: 0.6, light: 0.45, rain: 1, fog: 0.55 },
];

const COLOR_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'fog', 'water', 'shallow'];
const NUM_KEYS = ['sunInt', 'hemiInt', 'lit', 'dark', 'stars', 'lamps', 'glow', 'exposure'];

function presetToState(p) {
  const s = { sun: new THREE.Vector3(...p.sun).normalize() };
  for (const k of COLOR_KEYS) s[k] = col(p[k]);
  for (const k of NUM_KEYS) s[k] = p[k];
  return s;
}

function cloneState(s) {
  const c = { sun: s.sun.clone() };
  for (const k of COLOR_KEYS) c[k] = s[k].clone();
  for (const k of NUM_KEYS) c[k] = s[k];
  return c;
}

function lerpState(out, a, b, t) {
  out.sun.copy(a.sun).lerp(b.sun, t).normalize();
  for (const k of COLOR_KEYS) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
}

const SKY_VERT = 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow; uniform float grey;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(horizon, top, smoothstep(0.0, 0.55, h));
  c = mix(c, horizon * 0.9, smoothstep(0.0, -0.3, h));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  c += sunColor * (pow(sd, 12.0) * 0.35 + pow(sd, 90.0) * 0.6) * glow * (1.0 - grey);
  c += sunColor * smoothstep(0.9985, 0.9993, sd) * 1.2 * (1.0 - grey);
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(l) * 0.9, grey);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function createWorld(scene, { lowPower, renderer }) {
  // Sky dome with a soft gradient and the sun
  const skyUniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
    glow: { value: 1 }, grey: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // Image-based lighting: the sky is turned into a reflection map, so water,
  // glass and roofs reflect the real sky color of the moment.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  let envRT = null;
  function refreshEnv() {
    const rt = pmrem.fromScene(envScene, 0.02);
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
  }

  // Stars, visible at night
  const starPos = [];
  const sr = rng(7);
  for (let i = 0; i < 600; i++) {
    const a = sr() * Math.PI * 2, e = Math.asin(sr() * 0.95 + 0.05);
    starPos.push(Math.cos(a) * Math.cos(e) * 350, Math.sin(e) * 350, Math.sin(a) * Math.cos(e) * 350);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Lights
  const hemi = new THREE.HemisphereLight('#ffffff', '#888866', 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  scene.fog = new THREE.Fog('#d0e6f4', 70, 210);

  // Sea: gentle swell in the vertices, small ripples from a scrolling normal
  // texture, lighter and foamy where the ground comes up close to the surface.
  const waterUniforms = {
    uTime: { value: 0 },
    uHeight: { value: heightTexture },
    uHUV: { value: new THREE.Vector2(HEIGHT_UV.scale, HEIGHT_UV.offset) },
    uShallow: { value: new THREE.Color('#7fe0d2') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uRain: { value: 0 },
  };
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#2a8bb2', transparent: true, opacity: 0.9, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.1,
  });
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterUniforms, { uTex: TEX.uTex });
    sh.vertexShader = 'uniform float uTime;\nvarying vec2 vWXZ;\n' + sh.vertexShader
      .replace('#include <begin_vertex>',
        `vec3 transformed = vec3(position);
         transformed.z += sin(position.x * 0.33 + uTime * 1.1) * 0.06
           + sin(position.y * 0.41 + uTime * 0.85) * 0.05
           + sin((position.x + position.y) * 0.9 + uTime * 1.7) * 0.02;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = `uniform float uTime;
uniform sampler2D uHeight;
uniform highp sampler2DArray uTex;
uniform vec2 uHUV;
uniform vec3 uShallow;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uRain;
varying vec2 vWXZ;
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 huv = vWXZ * uHUV.x + uHUV.y;
  float gh = -3.0;
  if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) gh = texture(uHeight, huv).r;
  float depth = max(-gh, 0.0);
  diffuseColor.rgb = mix(uShallow, diffuseColor.rgb, smoothstep(0.0, 1.8, depth));
  vec2 fuv = vWXZ * 0.35;
  float fn = texture(uTex, vec3(fuv + vec2(uTime * 0.02, uTime * 0.013), ${L.WATER}.0)).a;
  float wob = sin(uTime * 1.4 + vWXZ.x * 0.9 + vWXZ.y * 0.7) * 0.06;
  float band = 1.0 - smoothstep(0.0, 0.34 + wob, depth);
  float foam = band * smoothstep(0.35, 0.65, fn + band * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.99, 1.0), foam * 0.9);
  diffuseColor.a = mix(diffuseColor.a, 0.5, smoothstep(0.7, 0.0, depth)) + foam * 0.45;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec2 w1 = vWXZ / 9.0 + vec2(uTime * 0.012, uTime * 0.008);
    vec2 w2 = vWXZ / 5.3 - vec2(uTime * 0.009, -uTime * 0.014);
    vec3 n1 = texture(uTex, vec3(w1, ${L.WATER}.0)).xyz * 2.0 - 1.0;
    vec3 n2 = texture(uTex, vec3(w2, ${L.WATER}.0)).xyz * 2.0 - 1.0;
    float rough = 0.55 + uRain * 0.8;
    vec3 nw = normalize(vec3((n1.x + n2.x) * rough, 1.0, (n1.y + n2.y) * rough));
    normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
  }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    vec3 vSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    vec3 hv = normalize(vSun + normalize(vViewPosition));
    float spec = pow(max(dot(normal, hv), 0.0), 220.0);
    reflectedLight.directSpecular += uSunCol * spec * 2.5 * (1.0 - uRain);
  }`);
  };

  // Seabed far from the island, so the island's square edge never shows through the water
  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#6f7c66', roughness: 1 }),
  );
  seabed.position.y = -2.64;
  scene.add(seabed);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, lowPower ? 80 : 140, lowPower ? 80 : 140), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.02;
  water.receiveShadow = true;
  scene.add(water);

  // Clouds drifting over the island
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.95, flatShading: true });
  const clouds = [];
  const cr = rng(42);
  for (let i = 0; i < 22; i++) {
    const B = new GeoBuilder();
    const puffs = cr.int(4, 7);
    for (let k = 0; k < puffs; k++) {
      const s = cr.range(1.2, 2.6);
      B.add('ico1', [k * 1.3 - puffs * 0.65, cr.range(-0.3, 0.5), cr.range(-0.9, 0.9)], [s, s * 0.7, s], col('#ffffff'), [cr(), cr(), 0]);
    }
    const m = new THREE.Mesh(B.build(), cloudMat);
    m.position.set(cr.range(-70, 70), cr.range(15, 21), cr.range(-45, 45));
    m.castShadow = !lowPower;
    m.userData.speed = cr.range(0.6, 1.3);
    m.visible = i < 7;
    scene.add(m);
    clouds.push(m);
  }

  // Rain: short streaks that follow the camera
  const RAIN = lowPower ? 900 : 1800;
  const rainPos = new Float32Array(RAIN * 6);
  const rainSeed = new Float32Array(RAIN * 3);
  const rr = rng(13);
  for (let i = 0; i < RAIN; i++) {
    rainSeed[i * 3] = rr.range(-30, 30);
    rainSeed[i * 3 + 1] = rr.range(0, 25);
    rainSeed[i * 3 + 2] = rr.range(-30, 30);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: '#c9d6e6', transparent: true, opacity: 0.45, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  // Seagulls
  const gullMat = new THREE.MeshStandardMaterial({ color: '#f4f4f0', flatShading: true, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.14, 0.75, 0, -0.05], 3));
  wingGeo.computeVertexNormals();
  const gulls = [];
  const gr = rng(99);
  for (let i = 0; i < 6; i++) {
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

  // Boats sailing slowly around the island
  const boats = [];
  const boatMat = MAT.solid;
  const br = rng(321);
  for (const [ang, stripe] of [[0.35, '#2f6fa8'], [2.3, '#3d8a5a'], [4.2, '#c0392b'], [5.3, '#e0a526']]) {
    const B = new GeoBuilder();
    const white = col('#f4f1ea'), st = col(stripe), wood = col('#9b7653');
    B.layer = L.WOOD;
    B.add('box', [0, 0.1, 0], [1.7, 0.32, 0.72], white);
    B.add('box', [0.85, 0.1, 0], [0.51, 0.32, 0.51], white, [0, Math.PI / 4, 0]);
    B.add('box', [0, 0.23, 0], [1.72, 0.07, 0.74], st);
    B.add('box', [0.85, 0.23, 0], [0.53, 0.07, 0.53], st, [0, Math.PI / 4, 0]);
    B.add('box', [-0.05, 0.27, 0], [1.4, 0.04, 0.56], wood);
    B.add('box', [-0.2, 0.36, 0], [0.18, 0.16, 0.56], wood);
    B.add('box', [-0.9, 0.3, 0], [0.12, 0.3, 0.12], col('#3b3a3a'), null, L.PLAIN);
    const m = new THREE.Mesh(B.build(), boatMat);
    m.castShadow = true;
    m.userData = { ph: br() * 10, ang, rad: 0, speed: br.range(0.006, 0.014) * (br() < 0.5 ? 1 : -1) };
    scene.add(m);
    boats.push(m);
  }
  function placeBoats(t) {
    for (const b of boats) {
      const u = b.userData;
      const a = u.ang + t * u.speed;
      if (!u.rad || Math.abs(u.lastA - a) > 0.05) {
        let rad = 18;
        while (rad < 42 && getHeight(Math.cos(a) * rad, Math.sin(a) * rad) > -1.0) rad += 0.5;
        u.rad = rad + 3;
        u.lastA = a;
      }
      b.position.set(Math.cos(a) * u.rad, Math.sin(t * 1.3 + u.ph) * 0.05 - 0.02, Math.sin(a) * u.rad);
      b.rotation.set(Math.sin(t * 0.9 + u.ph * 2) * 0.03, -a + (u.speed > 0 ? -Math.PI / 2 : Math.PI / 2), Math.sin(t * 1.1 + u.ph) * 0.05, 'YXZ');
    }
  }

  const states = TIMES.map(presetToState);
  let timeIndex = 1;
  const cur = cloneState(states[timeIndex]);
  let from = cloneState(cur);
  let blend = 1;
  let weather = WEATHER[0];
  let weatherK = 0;
  let autoCycle = false;
  let autoT = 0;

  function apply() {
    const lightK = 1 - (1 - weather.light) * weatherK;
    sun.color.copy(cur.sunColor);
    sun.intensity = cur.sunInt * lightK;
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemiInt * (1 + weatherK * 0.6);
    skyUniforms.top.value.copy(cur.skyTop);
    skyUniforms.horizon.value.copy(cur.skyHorizon);
    skyUniforms.grey.value = weatherK * (1 - weather.light) * 1.2;
    scene.fog.color.copy(cur.fog).lerp(new THREE.Color('#9aa3ad'), weatherK * (1 - weather.light));
    scene.fog.near = 70 * (1 - weatherK * (1 - weather.fog));
    scene.fog.far = 210 * (1 - weatherK * (1 - weather.fog) * 0.8);
    waterMat.color.copy(cur.water);
    waterUniforms.uShallow.value.copy(cur.shallow);
    waterUniforms.uSunDir.value.copy(cur.sun);
    waterUniforms.uSunCol.value.copy(cur.sunColor).multiplyScalar(lightK);
    waterUniforms.uRain.value = weather.rain * weatherK;
    skyUniforms.sunDir.value.copy(cur.sun);
    skyUniforms.sunColor.value.copy(cur.sunColor);
    skyUniforms.glow.value = cur.glow;
    cloudMat.color.setScalar(1 - (1 - weather.cloudTint) * weatherK);
    MAT.glow.opacity = cur.lamps;
    MAT.pool.opacity = cur.lamps * 0.5;
    MAT.beam.opacity = cur.lamps * 0.22;
    MAT.lamp.emissiveIntensity = 0.1 + cur.lamps * 2.5;
    MAT.glassLit.emissiveIntensity = cur.lit;
    MAT.glassDark.emissiveIntensity = cur.dark;
    starMat.opacity = cur.stars * (1 - weatherK);
    stars.visible = starMat.opacity > 0.01;
    renderer.toneMappingExposure = cur.exposure;
  }
  apply();
  refreshEnv();

  return {
    times: TIMES,
    weathers: WEATHER,
    get timeIndex() { return timeIndex; },
    get night() { return cur.lamps; },
    get weather() { return weather.id; },
    get autoCycle() { return autoCycle; },
    set autoCycle(v) { autoCycle = v; autoT = 0; },
    setTime(i) {
      timeIndex = ((i % TIMES.length) + TIMES.length) % TIMES.length;
      from = cloneState(cur);
      blend = 0;
      return TIMES[timeIndex];
    },
    setShadowSize(n) {
      if (sun.shadow.mapSize.x === n) return;
      sun.shadow.mapSize.set(n, n);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
    setWeather(id) {
      weather = WEATHER.find((w) => w.id === id) || WEATHER[0];
      clouds.forEach((m, i) => { m.visible = i < weather.clouds; });
      rain.visible = weather.rain > 0;
      weatherK = weather.id === 'sereno' ? 0 : 1;
      apply();
      refreshEnv();
      return weather;
    },
    update(dt, t, camera, focus) {
      if (autoCycle) {
        autoT += dt;
        if (autoT > 35 && blend >= 1) {
          autoT = 0;
          this.setTime(timeIndex + 1);
        }
      }
      if (blend < 1) {
        blend = Math.min(1, blend + dt / 2.2);
        const k = blend * blend * (3 - 2 * blend);
        lerpState(cur, from, states[timeIndex], k);
        apply();
        if (blend === 1 || Math.floor(blend * 4) !== Math.floor((blend - dt / 2.2) * 4)) refreshEnv();
      }
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      waterUniforms.uTime.value = t;
      sun.target.position.set(focus.x, 0, focus.z);
      sun.position.set(focus.x + cur.sun.x * 70, cur.sun.y * 70, focus.z + cur.sun.z * 70);
      water.position.x = Math.round(camera.position.x / 4) * 4;
      water.position.z = Math.round(camera.position.z / 4) * 4;
      for (const m of clouds) {
        if (!m.visible) continue;
        m.position.x += m.userData.speed * dt * (1 + weatherK);
        if (m.position.x > 75) m.position.x = -75;
      }
      if (rain.visible) {
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
        for (let i = 0; i < RAIN; i++) {
          const y = ((rainSeed[i * 3 + 1] - t * 18) % 25 + 25) % 25 + cy - 12;
          const x = cx + rainSeed[i * 3], z = cz + rainSeed[i * 3 + 2];
          rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
          rainPos[i * 6 + 3] = x + 0.05; rainPos[i * 6 + 4] = y - 0.55; rainPos[i * 6 + 5] = z + 0.03;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      placeBoats(t);
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
