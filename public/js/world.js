import * as THREE from '../vendor/three.module.min.js';
import { GeoBuilder, rng, col } from './util.js';
import { MAT } from './builders.js';
import { getHeight, heightTexture, HEIGHT_UV } from './terrain.js';
import { TEX, CLOUD_GLSL } from './shaders.js';
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
  { id: 'sereno', name: 'Sereno', icon: '☀️', cover: 0.38, wind: 0.3, light: 1, rain: 0, fog: 1 },
  { id: 'nuvoloso', name: 'Nuvoloso', icon: '⛅', cover: 0.72, wind: 0.6, light: 0.7, rain: 0, fog: 0.8 },
  { id: 'pioggia', name: 'Pioggia', icon: '🌧️', cover: 0.97, wind: 1, light: 0.45, rain: 1, fog: 0.55 },
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
// Sky: color gradient with a hazy horizon, a halo and a bright disc for the
// sun (bright enough to bloom), and a layer of clouds lit from the sun's side.
const SKY_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
uniform float glow; uniform float grey; uniform float uTime; uniform float uCloud; uniform float uLight; uniform vec3 uCamPos;
varying vec3 vDir;
${CLOUD_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sd3 = normalize(sunDir);
  vec3 c = mix(horizon, top, pow(smoothstep(-0.02, 0.62, h), 0.7));
  c = mix(c, horizon * 0.82, smoothstep(0.0, -0.25, h));
  float sd = max(dot(d, sd3), 0.0);
  float clear = 1.0 - grey;
  // Wide warm glow over the horizon on the sun's side, then halo and disc
  c += sunColor * pow(sd, 3.0) * 0.18 * glow * (1.0 - smoothstep(0.0, 0.5, h)) * clear;
  c += sunColor * (pow(sd, 10.0) * 0.28 + pow(sd, 80.0) * 0.55 + pow(sd, 700.0) * 1.6) * glow * clear;
  float disc = smoothstep(0.99935, 0.99965, sd);
  c += sunColor * disc * 9.0 * clear;
  if (h > 0.0) {
    vec2 p = uCamPos.xz + d.xz * (CLOUD_H - uCamPos.y) / max(h, 0.015);
    float dens = cloudDensity(p, uTime, uCloud, 5);
    if (dens > 0.002) {
      // Light coming through the cloud: look a little toward the sun
      vec2 toSun = sd3.xz / max(sd3.y, 0.12) * 7.0;
      float occ = cloudDensity(p + toSun, uTime, uCloud, 3) * 0.7 + cloudDensity(p + toSun * 2.4, uTime, uCloud, 3) * 0.5;
      float lit = exp(-occ * 1.6);
      vec3 amb = mix(horizon, top, 0.45) * 0.78;
      vec3 sunLit = sunColor * uLight * (0.55 + 0.75 * lit);
      vec3 cc = amb + sunLit * 0.8;
      // Thin edges glow when they pass in front of the sun
      cc += sunColor * pow(sd, 6.0) * (1.0 - dens) * 1.4 * uLight;
      cc = mix(cc, vec3(dot(cc, vec3(0.3, 0.59, 0.11))) * 0.62, grey * 0.85);
      float a = dens * smoothstep(0.0, 0.14, h) * 0.96;
      c = mix(c, cc, a);
    }
  }
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(l) * 0.9, grey * 0.6);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// Round sea that follows the camera: rings close together near the middle
// (where the waves need detail) and far apart toward the horizon.
function seaGeometry(seg) {
  const radii = [0];
  while (radii[radii.length - 1] < 1100) {
    const r = radii[radii.length - 1];
    radii.push(r + Math.max(1.1, r * 0.075));
  }
  const pos = [0, 0, 0];
  for (let i = 1; i < radii.length; i++) {
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * radii[i], Math.sin(a) * radii[i], 0);
    }
  }
  const idx = [];
  for (let k = 0; k < seg; k++) idx.push(0, 1 + k, 1 + ((k + 1) % seg));
  for (let i = 1; i < radii.length - 1; i++) {
    const a0 = 1 + (i - 1) * seg, b0 = 1 + i * seg;
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      idx.push(a0 + k, b0 + k, b0 + k1, a0 + k, b0 + k1, a0 + k1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export function createWorld(scene, { lowPower, renderer }) {
  // Sky dome with a soft gradient and the sun
  const skyUniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
    glow: { value: 1 }, grey: { value: 0 },
    uTime: TEX.uTime, uCloud: TEX.uCloud, uLight: { value: 1 }, uCamPos: { value: new THREE.Vector3(0, 20, 40) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMat);
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
  sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 180;
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
    uRefl: { value: null },
    uReflMat: { value: new THREE.Matrix4() },
    uReflOn: { value: 0 },
  };
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#2a8bb2', transparent: true, opacity: 0.9, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.1,
  });
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterUniforms, { uTex: TEX.uTex });
    sh.vertexShader = 'uniform float uTime;\nuniform mat4 uReflMat;\nvarying vec2 vWXZ;\nvarying vec4 vReflUv;\n' + sh.vertexShader
      .replace('#include <begin_vertex>',
        `vec3 transformed = vec3(position);
         vec2 sw = (modelMatrix * vec4(position, 1.0)).xz;
         float fade = 1.0 - smoothstep(60.0, 140.0, length(position.xy));
         transformed.z += (sin(sw.x * 0.33 + uTime * 1.1) * 0.06
           + sin(sw.y * 0.41 + uTime * 0.85) * 0.05
           + sin((sw.x + sw.y) * 0.9 + uTime * 1.7) * 0.02) * fade;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;\n  vReflUv = uReflMat * modelMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = `uniform float uTime;
uniform sampler2D uHeight;
uniform highp sampler2DArray uTex;
uniform vec2 uHUV;
uniform vec3 uShallow;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uRain;
uniform sampler2D uRefl;
uniform float uReflOn;
varying vec2 vWXZ;
varying vec4 vReflUv;
vec3 wN = vec3(0.0, 1.0, 0.0);
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
    wN = nw;
    normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
  }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    vec3 vSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    vec3 hv = normalize(vSun + normalize(vViewPosition));
    float spec = pow(max(dot(normal, hv), 0.0), 220.0);
    reflectedLight.directSpecular += uSunCol * spec * 2.5 * (1.0 - uRain);
  }`)
      .replace('#include <opaque_fragment>', `
  if (uReflOn > 0.0) {
    // Mirror image of the island, rippled by the waves; stronger at grazing angles (fresnel)
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 5.0);
    vec2 ruv = vReflUv.xy / vReflUv.w + wN.xz * 0.045;
    vec3 refl = texture(uRefl, clamp(ruv, 0.001, 0.999)).rgb;
    float k = clamp(fres * 0.92 + 0.1, 0.0, 1.0) * (1.0 - foam) * uReflOn;
    outgoingLight = mix(outgoingLight, refl, k);
    diffuseColor.a = mix(diffuseColor.a, 1.0, fres * uReflOn);
  }
  #include <opaque_fragment>`);
  };

  // Seabed far from the island, so the island's square edge never shows through the water
  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#6f7c66', roughness: 1 }),
  );
  seabed.position.y = -2.64;
  scene.add(seabed);

  const water = new THREE.Mesh(seaGeometry(lowPower ? 64 : 112), waterMat);
  water.frustumCulled = false;
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.02;
  water.receiveShadow = true;
  scene.add(water);

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
  // With the shader pack on, fog is drawn in post-processing: push the simple fog away
  let fogMul = 1;
  let fogFar = 210;

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
    fogFar = 210 * (1 - weatherK * (1 - weather.fog) * 0.8);
    scene.fog.near = 70 * (1 - weatherK * (1 - weather.fog)) * fogMul;
    scene.fog.far = fogFar * fogMul;
    waterMat.color.copy(cur.water);
    waterUniforms.uShallow.value.copy(cur.shallow);
    waterUniforms.uSunDir.value.copy(cur.sun);
    waterUniforms.uSunCol.value.copy(cur.sunColor).multiplyScalar(lightK);
    waterUniforms.uRain.value = weather.rain * weatherK;
    skyUniforms.sunDir.value.copy(cur.sun);
    skyUniforms.sunColor.value.copy(cur.sunColor);
    skyUniforms.glow.value = cur.glow;
    skyUniforms.uLight.value = Math.min(1, cur.sunInt / 2.9) * lightK;
    TEX.uSunDir.value.copy(cur.sun);
    TEX.uSunCol.value.copy(cur.sunColor).multiplyScalar(cur.sunInt * lightK / Math.PI);
    TEX.uCloud.value = weather.cover;
    TEX.uWind.value = weather.wind;
    TEX.uCloudShadow.value = weather.rain ? 0.3 : 0.55;
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
    water,
    waterUniforms,
    waterMat,
    sky,
    times: TIMES,
    weathers: WEATHER,
    get timeIndex() { return timeIndex; },
    get fogFar() { return fogFar; },
    setFogMul(k) { fogMul = k; apply(); },
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
    setBoats(on) {
      for (const b of boats) b.visible = on;
    },
    setShadowSize(n) {
      if (sun.shadow.mapSize.x === n) return;
      sun.shadow.mapSize.set(n, n);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
    setWeather(id) {
      weather = WEATHER.find((w) => w.id === id) || WEATHER[0];
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
      TEX.uTime.value = t;
      skyUniforms.uCamPos.value.copy(camera.position);
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
