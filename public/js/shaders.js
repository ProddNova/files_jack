// Shader additions for three.js standard materials: textures from the array,
// relief lighting from the texture height, a soft dark band where things meet
// the ground, season tints, snow, leaves moving in the wind, sunlight shining
// through leaves, shadows of the sky clouds and light patterns under water.
import * as THREE from '../vendor/three.module.min.js';
import { L, LAYER_SCALE, LAYER_COUNT } from './textures.js';

export const TEX = {
  uTex: { value: null },
  uScale: { value: LAYER_SCALE.slice() },
  uBump: { value: 1.6 },
  uHeight: { value: null },
  uHUV: { value: new THREE.Vector2(0, 0) },
  uAO: { value: 0.5 },
  uLeafTint: { value: new THREE.Color(1, 1, 1) },
  uLeafTint2: { value: new THREE.Color(1, 1, 1) },
  uLeafMix: { value: 0 },
  uGrassTint: { value: new THREE.Color(1, 1, 1) },
  uSnow: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: 0.3 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uCloud: { value: 0.4 },
  uCloudShadow: { value: 0.6 },
  uFx: { value: 1 },
};

// Clouds live on a flat layer high above the island. The sky shader looks up
// at it and the ground looks toward the sun through it, so the shadows on the
// ground belong to the clouds you can see.
export const CLOUD_GLSL = /* glsl */ `
const float CLOUD_H = 70.0;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cloudFbm(vec2 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    v += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
    a *= 0.5;
  }
  return v;
}
float cloudDensity(vec2 xz, float t, float cover, int oct) {
  vec2 p = xz * 0.016 + vec2(t * 0.012, t * 0.005);
  float n = cloudFbm(p, oct);
  float lo = 1.02 - cover * 0.62;
  return smoothstep(lo, lo + 0.28, n);
}
`;

// Same math as three.js bump mapping: tilts the normal along the height slope.
const PN_ARB = /* glsl */ `
vec3 pnArb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos.xyz));
  vec3 sy = normalize(dFdy(surfPos.xyz));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const HEADER = /* glsl */ `
uniform highp sampler2DArray uTex;
uniform float uScale[${LAYER_COUNT}];
uniform float uBump;
uniform sampler2D uHeight;
uniform vec2 uHUV;
uniform float uAO;
uniform vec3 uLeafTint;
uniform vec3 uLeafTint2;
uniform float uLeafMix;
uniform vec3 uGrassTint;
uniform float uSnow;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uCloud;
uniform float uCloudShadow;
uniform float uFx;
varying vec3 vWPos;
${PN_ARB}
${CLOUD_GLSL}
float groundAO(vec3 wp) {
  float gh = texture(uHeight, wp.xz * uHUV.x + uHUV.y).r;
  return mix(uAO, 1.0, smoothstep(0.0, 0.85, wp.y - gh));
}
// World-space "up-ness" of the current (view space) normal
float upness(vec3 n) { return (vec4(n, 0.0) * viewMatrix).y; }
vec4 layerTex(vec2 uv, int l) { return texture(uTex, vec3(uv / uScale[l], float(l))); }
float cloudShade(vec3 wp) {
  if (uCloudShadow <= 0.0 || uSunDir.y < 0.05) return 1.0;
  vec2 p = wp.xz + uSunDir.xz / uSunDir.y * (CLOUD_H - wp.y);
  return 1.0 - cloudDensity(p, uTime, uCloud, 3) * uCloudShadow;
}
`;

const V_HEADER = /* glsl */ `
uniform float uTime;
uniform float uWind;
varying vec3 vWPos;
`;

const V_WPOS = '#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;';

// Leaves sway as whole clumps (slow, large) and flutter (fast, tiny).
const WIND_VERTEX = /* glsl */ `
  if (abs(aLayer - ${L.LEAF}.0) < 0.5 || abs(aLayer - ${L.EVERGREEN}.0) < 0.5) {
    vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float ph = uTime * 1.5 + wp0.x * 0.35 + wp0.z * 0.27;
    float amp = 0.02 + uWind * 0.06;
    transformed += vec3(sin(ph) + 0.4 * sin(ph * 2.3 + wp0.y), 0.0, cos(ph * 0.8) * 0.7) * amp;
    transformed += vec3(sin(uTime * 7.0 + wp0.y * 9.0 + wp0.x * 5.0), 0.0, cos(uTime * 6.3 + wp0.z * 9.0)) * (0.004 + uWind * 0.008);
  }`;

// Objects built with GeoBuilder: texture layer and coordinates come per vertex.
export function texturize(mat, { ao = true, key = 'obj' } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TEX);
    sh.vertexShader = 'attribute float aLayer;\nattribute vec2 aUv;\nvarying float vLayer;\nvarying vec2 vTexUv;\n' + V_HEADER + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vLayer = aLayer;
  vTexUv = aUv;
  ${WIND_VERTEX}`)
      .replace('#include <project_vertex>', V_WPOS);
    sh.fragmentShader = 'varying float vLayer;\nvarying vec2 vTexUv;\n' + HEADER + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  int li = int(vLayer + 0.5);
  // Evergreens use the leaf texture with an offset, so autumn skips them
  bool seasonal = li < ${LAYER_COUNT};
  if (!seasonal) li -= ${LAYER_COUNT};
  bool leafy = li == ${L.LEAF};
  vec4 tx = layerTex(vTexUv, li);
  diffuseColor.rgb *= tx.rgb * 2.0;
  if (seasonal && leafy && uLeafMix > 0.0) {
    // Season colors: each tree gets its own shade between the two tints
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float pickT = fract(sin(dot(floor(vWPos.xz * 0.8), vec2(12.9898, 78.233))) * 43758.5453);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uLeafTint, uLeafTint2, pickT) * lum * 2.4, uLeafMix);
  }
  ${ao ? 'diffuseColor.rgb *= groundAO(vWPos);' : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + (0.5 - tx.a) * 0.3 - (li == ${L.MARBLE} ? 0.45 : 0.0), 0.05, 1.0);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  float snowK = uSnow > 0.0 ? uSnow * smoothstep(0.45, 0.8, upness(normal)) * smoothstep(-0.2, 0.3, vWPos.y) : 0.0;
  normal = pnArb(-vViewPosition, normal, vec2(dFdx(tx.a), dFdy(tx.a)) * uBump * (1.0 - snowK * 0.85), faceDirection);
  if (snowK > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), snowK);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    float cs = cloudShade(vWPos);
    reflectedLight.directDiffuse *= cs;
    reflectedLight.directSpecular *= cs;
    if (leafy && uFx > 0.0) {
      // Sunlight shining through the leaves when you look toward the sun
      vec3 V = normalize(cameraPosition - vWPos);
      float through = pow(max(dot(-V, uSunDir), 0.0), 3.0) * max(uSunDir.y + 0.1, 0.0);
      reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * through * 0.9 * cs;
    }
  }`);
  };
  mat.customProgramCacheKey = () => `tex3-${key}-${ao}`;
  return mat;
}

// Light patterns on the sea floor: bright lines where moving cells meet.
const CAUSTIC_GLSL = /* glsl */ `
float caustic(vec2 p, float t) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = vec2(hash12(ip + g), hash12(ip + g + 17.31));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * h);
      float d = length(g + o - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return 1.0 - smoothstep(0.0, 0.22, f2 - f1);
}
`;

// Terrain: blends grass, sand, rock and five kinds of paved paths.
export function terrainize(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TEX);
    sh.vertexShader = 'attribute vec4 aSplat;\nattribute vec4 aPath;\nvarying vec4 vSplat;\nvarying vec4 vPath;\n' + V_HEADER + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSplat = aSplat;\n  vPath = aPath;')
      .replace('#include <project_vertex>', V_WPOS);
    sh.fragmentShader = 'varying vec4 vSplat;\nvarying vec4 vPath;\n' + HEADER + CAUSTIC_GLSL + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 wp = vWPos.xz;
  vec4 g1 = layerTex(wp, ${L.GRASS});
  vec4 g2 = layerTex(wp / 4.3 + 0.37, ${L.GRASS});
  vec4 gr = mix(g1, g2, 0.4);
  vec4 sa = layerTex(wp, ${L.SAND});
  vec4 ro = layerTex(vec2(wp.x + vWPos.y * 0.6, wp.y - vWPos.y * 0.6), ${L.ROCK});
  vec4 w = vSplat / max(dot(vSplat, vec4(1.0)), 0.001);
  vec4 pt = vec4(0.5);
  if (w.w > 0.003) {
    float p4 = max(0.0, 1.0 - dot(vPath, vec4(1.0)));
    pt = layerTex(wp, ${L.COBBLE}) * vPath.x
       + layerTex(wp, ${L.HERRING}) * vPath.y
       + layerTex(wp, ${L.ASHLAR}) * vPath.z
       + layerTex(wp, ${L.DIRT}) * vPath.w
       + layerTex(wp, ${L.GRAVEL}) * p4;
  }
  // Paving fades in through its gaps first, so path edges look laid by hand
  float pathEdge = smoothstep(0.15, 0.75, w.w + (pt.a - 0.5) * 0.6);
  w.w = pathEdge * (w.x + w.y + w.z + w.w);
  w.xyz *= 1.0 - pathEdge;
  vec4 tx = gr * w.x + sa * w.y + ro * w.z + pt * w.w;
  diffuseColor.rgb *= tx.rgb * 2.0;
  diffuseColor.rgb *= mix(vec3(1.0), uGrassTint, w.x);
  // Large, soft color patches break up the repeating grass
  float patchN = vnoise(wp * 0.07) * 0.6 + vnoise(wp * 0.21) * 0.4;
  diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.86, 0.9, 0.78), vec3(1.1, 1.06, 0.92), patchN), w.x * uFx);
  // Wet, darker sand right at the waterline
  diffuseColor.rgb *= 1.0 - smoothstep(0.35, 0.0, vWPos.y) * smoothstep(-0.3, 0.0, vWPos.y) * 0.28 * uFx;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor - w.w * 0.15 - (tx.a - 0.5) * 0.2, 0.3, 1.0);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  float snowK = uSnow > 0.0 ? uSnow * smoothstep(0.35, 0.75, upness(normal)) * smoothstep(-0.1, 0.4, vWPos.y) * (1.0 - w.w * 0.6) : 0.0;
  normal = pnArb(-vViewPosition, normal, vec2(dFdx(tx.a), dFdy(tx.a)) * uBump * 1.3 * (1.0 - snowK * 0.9) * (1.0 - w.y * 0.6), faceDirection);
  if (snowK > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 1.0), snowK);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    float cs = cloudShade(vWPos);
    reflectedLight.directDiffuse *= cs;
    reflectedLight.directSpecular *= cs;
    if (vWPos.y < 0.02 && uFx > 0.0) {
      float under = smoothstep(0.02, -0.25, vWPos.y) * smoothstep(-3.0, -0.6, vWPos.y);
      float c = caustic(wp * 0.55, uTime * 1.3) * 0.6 + caustic(wp * 0.9 + 3.7, -uTime * 1.1) * 0.4;
      reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * c * under * 0.85 * cs * max(uSunDir.y, 0.0);
    }
  }`);
  };
  mat.customProgramCacheKey = () => 'terrain-v4';
  return mat;
}
