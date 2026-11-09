// Shader additions for three.js standard materials: textures from the array,
// relief lighting from the texture height, a soft dark band where things meet
// the ground, season tints for leaves and grass, and snow on upward faces.
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
};

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
varying vec3 vWPos;
${PN_ARB}
float groundAO(vec3 wp) {
  float gh = texture(uHeight, wp.xz * uHUV.x + uHUV.y).r;
  return mix(uAO, 1.0, smoothstep(0.0, 0.85, wp.y - gh));
}
// World-space "up-ness" of the current (view space) normal
float upness(vec3 n) { return (vec4(n, 0.0) * viewMatrix).y; }
vec4 layerTex(vec2 uv, int l) { return texture(uTex, vec3(uv / uScale[l], float(l))); }
`;

const V_WPOS = '#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;';

// Objects built with GeoBuilder: texture layer and coordinates come per vertex.
export function texturize(mat, { ao = true, key = 'obj' } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TEX);
    sh.vertexShader = 'attribute float aLayer;\nattribute vec2 aUv;\nvarying float vLayer;\nvarying vec2 vTexUv;\nvarying vec3 vWPos;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLayer = aLayer;\n  vTexUv = aUv;')
      .replace('#include <project_vertex>', V_WPOS);
    sh.fragmentShader = 'varying float vLayer;\nvarying vec2 vTexUv;\n' + HEADER + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  int li = int(vLayer + 0.5);
  bool seasonal = li < ${LAYER_COUNT};
  if (!seasonal) li -= ${LAYER_COUNT};
  vec4 tx = layerTex(vTexUv, li);
  diffuseColor.rgb *= tx.rgb * 2.0;
  if (seasonal && li == ${L.LEAF} && uLeafMix > 0.0) {
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
  if (snowK > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), snowK);`);
  };
  mat.customProgramCacheKey = () => `tex2-${key}-${ao}`;
  return mat;
}

// Terrain: blends grass, sand, rock and five kinds of paved paths.
export function terrainize(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TEX);
    sh.vertexShader = 'attribute vec4 aSplat;\nattribute vec4 aPath;\nvarying vec4 vSplat;\nvarying vec4 vPath;\nvarying vec3 vWPos;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSplat = aSplat;\n  vPath = aPath;')
      .replace('#include <project_vertex>', V_WPOS);
    sh.fragmentShader = 'varying vec4 vSplat;\nvarying vec4 vPath;\n' + HEADER + sh.fragmentShader
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
  diffuseColor.rgb *= mix(vec3(1.0), uGrassTint, w.x);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor - w.w * 0.15 - (tx.a - 0.5) * 0.2, 0.3, 1.0);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  float snowK = uSnow > 0.0 ? uSnow * smoothstep(0.35, 0.75, upness(normal)) * smoothstep(-0.1, 0.4, vWPos.y) * (1.0 - w.w * 0.6) : 0.0;
  normal = pnArb(-vViewPosition, normal, vec2(dFdx(tx.a), dFdy(tx.a)) * uBump * 1.3 * (1.0 - snowK * 0.9) * (1.0 - w.y * 0.6), faceDirection);
  if (snowK > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 1.0), snowK);`);
  };
  mat.customProgramCacheKey = () => 'terrain-v3';
  return mat;
}
