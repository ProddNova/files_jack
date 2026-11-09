// Procedural textures, painted by the GPU into one texture array.
// Each layer is a seamless tile: RGB is a detail pattern around 0.5 gray (the
// object's own color tints it), alpha is the height used for relief lighting.
// Doing it in a shader takes milliseconds, so the tiles can be large and sharp.
import * as THREE from '../vendor/three.module.min.js';

export const L = {
  PLASTER: 0, STONE: 1, BRICK: 2, TILE: 3, SLATE: 4, WOOD: 5, LEAF: 6, COBBLE: 7,
  ASHLAR: 8, PLAIN: 9, GRASS: 10, SAND: 11, ROCK: 12, BARK: 13, DIRT: 14, WATER: 15,
  GRAVEL: 16, HERRING: 17, THATCH: 18, MARBLE: 19,
};
export const LAYER_COUNT = 20;
// Leaves that keep their green in autumn: same texture as LEAF, flagged by the offset
L.EVERGREEN = LAYER_COUNT + L.LEAF;

// World units covered by one tile, per layer.
export const LAYER_SCALE = [2.4, 1.4, 1.0, 1.15, 1.1, 1.0, 0.8, 1.3, 1.9, 1.0, 1.7, 2.2, 2.6, 0.7, 2.0, 9.0, 1.1, 1.4, 1.0, 1.8];

const GEN_FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform float uLayer;
uniform float uSize;
varying vec2 vUv;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hash(ivec2 p, int s) {
  return float(pcg(uint(p.x) + pcg(uint(p.y) + pcg(uint(s))))) / 4294967295.0;
}
// Operands kept positive: % on negative ints is undefined in GLSL.
ivec2 wrap(ivec2 p, ivec2 per) { return (p + per * 8) % per; }

float vnoise(vec2 x, ivec2 per, int s) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 i0 = ivec2(i);
  float a = hash(wrap(i0, per), s);
  float b = hash(wrap(i0 + ivec2(1, 0), per), s);
  float c = hash(wrap(i0 + ivec2(0, 1), per), s);
  float d = hash(wrap(i0 + ivec2(1, 1), per), s);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 uv, ivec2 base, int oct, int s) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  ivec2 p = base;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    sum += amp * vnoise(uv * vec2(p), p, s + i * 17);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

// x: distance to nearest cell point, y: to second nearest, z: random id of the cell
vec3 worley(vec2 uv, int G, int s) {
  vec2 x = uv * float(G);
  ivec2 c = ivec2(floor(x));
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 g = c + ivec2(dx, dy);
      ivec2 w = wrap(g, ivec2(G));
      vec2 p = vec2(g) + vec2(0.1) + 0.8 * vec2(hash(w, s), hash(w, s + 1));
      float d = length(p - x);
      if (d < f1) { f2 = f1; f1 = d; id = hash(w, s + 2); }
      else if (d < f2) { f2 = d; }
    }
  }
  return vec3(f1, f2, id);
}

float speck(vec2 uv, int s) { return hash(ivec2(uv * uSize), s); }

vec4 plaster(vec2 uv) {
  float n = fbm(uv, ivec2(4), 6, 1);
  float stain = fbm(uv, ivec2(2), 4, 7);
  float v = 0.5 + (n - 0.5) * 0.2 - smoothstep(0.55, 0.85, stain) * 0.09 + (speck(uv, 3) - 0.5) * 0.04;
  float h = n * 0.7 + speck(uv, 4) * 0.15;
  return vec4(v * 1.01, v, v * 0.98, h);
}

vec4 stone(vec2 uv) {
  vec3 w = worley(uv, 7, 11);
  float e = w.y - w.x;
  float mortar = 1.0 - smoothstep(0.035, 0.1, e);
  float tone = 0.4 + w.z * 0.2;
  float det = fbm(uv, ivec2(8), 4, 21);
  float v = mix(tone + (det - 0.5) * 0.18, 0.26, mortar);
  float h = (1.0 - mortar) * (0.55 + 0.45 * smoothstep(0.0, 0.3, e)) + (det - 0.5) * 0.12;
  float tint = (fract(w.z * 7.31) - 0.5) * 0.08;
  return vec4(v * (1.0 + tint), v, v * (1.0 - tint), h);
}

vec4 brick(vec2 uv) {
  float rv = uv.y * 10.0;
  float row = floor(rv);
  float fv = rv - row;
  float ru = uv.x * 4.0 + mod(row, 2.0) * 0.5;
  float col = floor(ru);
  float fu = ru - col;
  float m = min(min(fu, 1.0 - fu) / 4.0, min(fv, 1.0 - fv) / 10.0);
  float mortar = 1.0 - smoothstep(0.004, 0.008, m);
  float id = hash(ivec2(int(mod(col, 4.0)), int(row)), 31);
  float det = fbm(uv, ivec2(16), 3, 33);
  float v = mix(0.4 + id * 0.16 + (det - 0.5) * 0.1, 0.68, mortar);
  float h = (1.0 - mortar) * (0.7 + 0.3 * smoothstep(0.0, 0.012, m)) + det * 0.1;
  return vec4(v * (1.0 + (id - 0.5) * 0.12), v, v * (1.0 - (id - 0.5) * 0.1), h);
}

vec4 tile(vec2 uv) {
  float cu = uv.x * 6.0;
  float c = floor(cu);
  float fu = cu - c;
  float rv = uv.y * 5.0;
  float r = floor(rv);
  float fv = rv - r;
  float prof = sin(3.14159 * fu);
  float shade = 0.72 + 0.28 * smoothstep(0.0, 0.4, fv);
  float lip = 1.0 - smoothstep(0.0, 0.06, fv);
  float id = hash(ivec2(int(c), int(r)), 41);
  float det = fbm(uv, ivec2(16), 3, 43);
  float v = (0.42 + id * 0.15) * (0.72 + 0.38 * prof) * shade + lip * 0.06 + (det - 0.5) * 0.06;
  float h = prof * 0.65 + smoothstep(0.0, 0.35, fv) * 0.35;
  return vec4(v * (1.0 + (id - 0.5) * 0.1), v, v * (1.0 - (id - 0.5) * 0.08), h);
}

vec4 slate(vec2 uv) {
  float rv = uv.y * 6.0;
  float r = floor(rv);
  float fv = rv - r;
  float ru = uv.x * 3.0 + mod(r, 2.0) * 0.5 + hash(ivec2(int(r), 0), 51) * 0.2;
  float c = floor(ru);
  float fu = ru - c;
  float gap = 1.0 - smoothstep(0.004, 0.012, min(fu, 1.0 - fu) / 3.0);
  float id = hash(ivec2(int(mod(c, 3.0)), int(r)), 53);
  float det = fbm(uv, ivec2(16), 4, 55);
  float v = (0.36 + id * 0.16) * (0.78 + 0.22 * smoothstep(0.0, 0.5, fv)) * (1.0 - gap * 0.5) + (det - 0.5) * 0.08;
  float h = smoothstep(0.0, 0.6, fv) * 0.6 + (1.0 - gap) * 0.3 + det * 0.1;
  return vec4(v, v, v * 1.03, h);
}

vec4 wood(vec2 uv) {
  float pu = uv.x * 5.0;
  float p = floor(pu);
  float fu = pu - p;
  float grain = fbm(vec2(uv.x * 12.0, uv.y), ivec2(4, 3), 4, 61);
  float streak = vnoise(vec2(uv.x * 80.0, uv.y * 3.0), ivec2(80, 3), 63);
  float gap = 1.0 - smoothstep(0.0, 0.045, min(fu, 1.0 - fu));
  float tone = 0.44 + hash(ivec2(int(p), 5), 65) * 0.13;
  float v = (tone + (grain - 0.5) * 0.16 + (streak - 0.5) * 0.12) * (1.0 - gap * 0.6);
  float h = 0.6 + (streak - 0.5) * 0.4 - gap * 0.6;
  return vec4(v * 1.03, v, v * 0.96, h);
}

vec4 leaf(vec2 uv) {
  // Two sizes of leaf clusters plus fine noise, so it reads as foliage, not scales
  vec3 w = worley(uv, 9, 71);
  vec3 w2 = worley(uv + 0.37, 21, 73);
  float n = fbm(uv, ivec2(16), 4, 75);
  float body = 1.0 - smoothstep(0.0, 0.75, w.x);
  float small = 1.0 - smoothstep(0.0, 0.7, w2.x);
  float gap = smoothstep(0.0, 0.18, w2.y - w2.x);
  float tone = 0.4 + w.z * 0.16 + w2.z * 0.08;
  float v = tone * (0.7 + 0.25 * body + 0.2 * small) * (0.82 + 0.18 * gap) + (n - 0.5) * 0.12;
  float hue = (fract(w2.z * 3.7) - 0.5) * 0.12;
  return vec4(v * (1.0 + hue), v, v * (1.0 - hue), body * 0.5 + small * 0.4 + n * 0.1);
}

vec4 cobble(vec2 uv) {
  vec3 w = worley(uv, 6, 81);
  float e = w.y - w.x;
  float gap = 1.0 - smoothstep(0.03, 0.09, e);
  float round_ = smoothstep(0.0, 0.32, e);
  float det = fbm(uv, ivec2(8), 4, 83);
  float tone = 0.42 + w.z * 0.2;
  float v = mix(tone * (0.8 + 0.28 * round_) + (det - 0.5) * 0.12, 0.3, gap);
  float h = round_ * (1.0 - gap) + det * 0.08;
  return vec4(v * (1.0 + (w.z - 0.5) * 0.08), v, v * (1.0 - (w.z - 0.5) * 0.06), h);
}

vec4 ashlar(vec2 uv) {
  float rv = uv.y * 4.0;
  float r = floor(rv);
  float fv = rv - r;
  float ru = uv.x * 2.0 + hash(ivec2(int(r), 3), 91) * 0.8;
  float c = floor(ru);
  float fu = ru - c;
  float m = min(min(fu, 1.0 - fu) / 2.0, min(fv, 1.0 - fv) / 4.0);
  float joint = 1.0 - smoothstep(0.003, 0.008, m);
  float chisel = fbm(uv, ivec2(16), 4, 93);
  float tone = 0.45 + hash(ivec2(int(mod(c, 2.0)), int(r)), 95) * 0.12;
  float v = mix(tone + (chisel - 0.5) * 0.14, 0.32, joint);
  float h = (1.0 - joint) * (0.75 + 0.25 * smoothstep(0.0, 0.02, m)) + (chisel - 0.5) * 0.18;
  return vec4(v * 1.01, v, v * 0.98, h);
}

vec4 plain(vec2 uv) {
  float n = fbm(uv, ivec2(8), 3, 101);
  float v = 0.5 + (n - 0.5) * 0.05;
  return vec4(v, v, v, 0.5 + (n - 0.5) * 0.1);
}

vec4 grass(vec2 uv) {
  float n1 = fbm(uv, ivec2(6), 5, 111);
  float n2 = vnoise(uv * 96.0, ivec2(96), 113);
  float n3 = vnoise(uv * 48.0, ivec2(48), 115);
  float v = 0.5 + (n1 - 0.5) * 0.32 + (n2 - 0.5) * 0.2 + (n3 - 0.5) * 0.12;
  float h = n2 * 0.55 + n3 * 0.3 + n1 * 0.15;
  return vec4(v * (0.94 + n1 * 0.12), v, v * (0.9 + n3 * 0.08), h);
}

vec4 sand(vec2 uv) {
  float n = fbm(uv, ivec2(8), 4, 121);
  float ripple = sin(6.28318 * (uv.y * 7.0 + fbm(uv, ivec2(2), 3, 123) * 2.0));
  float s = speck(uv, 125);
  float v = 0.5 + (n - 0.5) * 0.12 + (s - 0.5) * 0.05 + ripple * 0.025;
  return vec4(v * 1.02, v, v * 0.96, ripple * 0.2 + 0.5 + (n - 0.5) * 0.15);
}

vec4 rock(vec2 uv) {
  float n = fbm(uv, ivec2(4), 6, 131);
  float strata = sin(6.28318 * (uv.y * 8.0 + fbm(uv, ivec2(2), 3, 133) * 3.0));
  vec3 w = worley(uv, 5, 135);
  float crack = 1.0 - smoothstep(0.0, 0.035, w.y - w.x);
  float v = (0.5 + (n - 0.5) * 0.38 + strata * 0.05) * (1.0 - crack * 0.5);
  float h = n * 0.8 + strata * 0.08 - crack * 0.5;
  return vec4(v, v * 0.99, v * 0.97, h);
}

vec4 bark(vec2 uv) {
  float n = fbm(vec2(uv.x * 6.0, uv.y), ivec2(4, 2), 5, 141);
  float ridge = vnoise(vec2(uv.x * 30.0, uv.y * 2.0), ivec2(30, 2), 143);
  float v = 0.42 + (n - 0.5) * 0.25 + (ridge - 0.5) * 0.3;
  return vec4(v * 1.03, v, v * 0.95, ridge);
}

vec4 dirt(vec2 uv) {
  float n = fbm(uv, ivec2(6), 5, 151);
  vec3 w = worley(uv, 14, 153);
  float pebble = 1.0 - smoothstep(0.1, 0.22, w.x);
  float v = 0.5 + (n - 0.5) * 0.28 + pebble * 0.1 * w.z;
  return vec4(v * 1.03, v, v * 0.95, n * 0.6 + pebble * 0.4);
}

float waterH(vec2 uv) {
  return fbm(uv, ivec2(5), 5, 161) * 0.7 + fbm(uv, ivec2(11), 3, 163) * 0.3;
}
vec4 water(vec2 uv) {
  float e = 1.0 / uSize;
  float k = 9.0;
  float dx = (waterH(uv - vec2(e, 0.0)) - waterH(uv + vec2(e, 0.0))) * k;
  float dy = (waterH(uv - vec2(0.0, e)) - waterH(uv + vec2(0.0, e))) * k;
  vec3 n = normalize(vec3(dx, dy, 1.0));
  return vec4(n * 0.5 + 0.5, waterH(uv));
}

vec4 gravel(vec2 uv) {
  vec3 w = worley(uv, 22, 171);
  vec3 w2 = worley(uv + 0.5, 37, 173);
  float peb = 1.0 - smoothstep(0.15, 0.55, w.x);
  float peb2 = 1.0 - smoothstep(0.15, 0.5, w2.x);
  float tone = 0.45 + w.z * 0.2;
  float v = mix(0.36, tone, max(peb, peb2 * 0.8)) + (speck(uv, 175) - 0.5) * 0.08;
  return vec4(v * 1.02, v, v * 0.97, max(peb, peb2 * 0.7));
}

// Brick paving laid in alternating pairs (basket weave)
vec4 herring(vec2 uv) {
  vec2 p = uv * 4.0;
  vec2 c = floor(p);
  vec2 f = p - c;
  bool horiz = mod(c.x + c.y, 2.0) < 0.5;
  float split = horiz ? f.y : f.x;
  float along = horiz ? f.x : f.y;
  float half_ = step(0.5, split);
  float ds = min(abs(split - 0.5), min(split, 1.0 - split));
  float da = min(along, 1.0 - along);
  float m = min(ds, da) / 4.0;
  float mortar = 1.0 - smoothstep(0.004, 0.009, m);
  float id = hash(ivec2(int(c.x) * 2 + int(half_), int(c.y)), 181);
  float det = fbm(uv, ivec2(16), 3, 183);
  float v = mix(0.42 + id * 0.15 + (det - 0.5) * 0.1, 0.62, mortar);
  return vec4(v * (1.0 + (id - 0.5) * 0.1), v, v * 0.97, (1.0 - mortar) * 0.85 + det * 0.15);
}

vec4 thatch(vec2 uv) {
  float rv = uv.y * 5.0;
  float fv = fract(rv);
  float r = floor(rv);
  float straw = vnoise(vec2(uv.x * 90.0, uv.y * 6.0 + r * 3.1), ivec2(90, 6), 191);
  float clump = fbm(vec2(uv.x * 4.0, uv.y), ivec2(4, 2), 4, 193);
  float shade = 0.72 + 0.28 * smoothstep(0.0, 0.5, fv);
  float v = (0.42 + (straw - 0.5) * 0.3 + (clump - 0.5) * 0.15) * shade;
  return vec4(v * 1.05, v, v * 0.88, straw * 0.6 + smoothstep(0.0, 0.5, fv) * 0.4);
}

vec4 marble(vec2 uv) {
  float n = fbm(uv, ivec2(3), 6, 201);
  float vein = abs(sin((uv.x * 6.28318 * 2.0 + uv.y * 6.28318 + n * 9.0)));
  vein = 1.0 - smoothstep(0.0, 0.08, vein);
  float slab = 1.0 - smoothstep(0.0, 0.006, min(min(fract(uv.x * 2.0), 1.0 - fract(uv.x * 2.0)), min(fract(uv.y * 2.0), 1.0 - fract(uv.y * 2.0))) / 2.0);
  float v = 0.56 + (n - 0.5) * 0.08 - vein * 0.12 - slab * 0.12;
  return vec4(v, v, v * 1.01, 0.55 - slab * 0.4 - vein * 0.05);
}

void main() {
  int l = int(uLayer + 0.5);
  vec2 uv = vUv;
  vec4 c;
  if (l == 0) c = plaster(uv);
  else if (l == 1) c = stone(uv);
  else if (l == 2) c = brick(uv);
  else if (l == 3) c = tile(uv);
  else if (l == 4) c = slate(uv);
  else if (l == 5) c = wood(uv);
  else if (l == 6) c = leaf(uv);
  else if (l == 7) c = cobble(uv);
  else if (l == 8) c = ashlar(uv);
  else if (l == 9) c = plain(uv);
  else if (l == 10) c = grass(uv);
  else if (l == 11) c = sand(uv);
  else if (l == 12) c = rock(uv);
  else if (l == 13) c = bark(uv);
  else if (l == 14) c = dirt(uv);
  else if (l == 15) c = water(uv);
  else if (l == 16) c = gravel(uv);
  else if (l == 17) c = herring(uv);
  else if (l == 18) c = thatch(uv);
  else c = marble(uv);
  gl_FragColor = clamp(c, 0.0, 1.0);
}
`;

// Paints every layer once, then copies the pixels into a regular texture
// array so the GPU can build mipmaps (smaller copies used far away, which
// avoid shimmering stripes on distant grass and roofs).
export function createTextureArray(renderer, size) {
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLayer: { value: 0 }, uSize: { value: size } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: GEN_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const data = new Uint8Array(size * size * 4 * LAYER_COUNT);
  const prev = renderer.getRenderTarget();
  for (let i = 0; i < LAYER_COUNT; i++) {
    mat.uniforms.uLayer.value = i;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, data.subarray(i * size * size * 4, (i + 1) * size * size * 4));
  }
  renderer.setRenderTarget(prev);
  target.dispose();
  mat.dispose();
  quad.geometry.dispose();
  const tex = new THREE.DataArrayTexture(data, size, size, LAYER_COUNT);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}
