// Shader additions for three.js standard materials: textures from the array,
// relief lighting from the texture height, and a soft dark band where things
// meet the ground.
import * as THREE from '../vendor/three.module.min.js';
import { L, LAYER_SCALE } from './textures.js';

export const TEX = {
  uTex: { value: null },
  uScale: { value: LAYER_SCALE.slice() },
  uBump: { value: 1.6 },
  uHeight: { value: null },
  uHUV: { value: new THREE.Vector2(0, 0) },
  uAO: { value: 0.5 },
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
uniform float uScale[16];
uniform float uBump;
uniform sampler2D uHeight;
uniform vec2 uHUV;
uniform float uAO;
varying vec3 vWPos;
${PN_ARB}
float groundAO(vec3 wp) {
  float gh = texture(uHeight, wp.xz * uHUV.x + uHUV.y).r;
  return mix(uAO, 1.0, smoothstep(0.0, 0.85, wp.y - gh));
}
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
  vec4 tx = texture(uTex, vec3(vTexUv / uScale[li], float(li)));
  diffuseColor.rgb *= tx.rgb * 2.0;
  ${ao ? 'diffuseColor.rgb *= groundAO(vWPos);' : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + (0.5 - tx.a) * 0.3, 0.05, 1.0);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  normal = pnArb(-vViewPosition, normal, vec2(dFdx(tx.a), dFdy(tx.a)) * uBump, faceDirection);`);
  };
  mat.customProgramCacheKey = () => `tex-${key}-${ao}`;
  return mat;
}

// Terrain: blends grass, sand, rock and cobbles by per-vertex weights.
export function terrainize(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TEX);
    sh.vertexShader = 'attribute vec4 aSplat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSplat = aSplat;')
      .replace('#include <project_vertex>', V_WPOS);
    const S = (l) => `uScale[${l}]`;
    sh.fragmentShader = 'varying vec4 vSplat;\n' + HEADER + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 wp = vWPos.xz;
  vec4 g1 = texture(uTex, vec3(wp / ${S(L.GRASS)}, ${L.GRASS}.0));
  vec4 g2 = texture(uTex, vec3(wp / (${S(L.GRASS)} * 4.3) + 0.37, ${L.GRASS}.0));
  vec4 gr = mix(g1, g2, 0.4);
  vec4 sa = texture(uTex, vec3(wp / ${S(L.SAND)}, ${L.SAND}.0));
  vec4 ro = texture(uTex, vec3(vec2(wp.x + vWPos.y * 0.6, wp.y - vWPos.y * 0.6) / ${S(L.ROCK)}, ${L.ROCK}.0));
  vec4 co = texture(uTex, vec3(wp / ${S(L.COBBLE)}, ${L.COBBLE}.0));
  vec4 w = vSplat / max(dot(vSplat, vec4(1.0)), 0.001);
  // Cobbles fade in through their gaps first, so path edges look laid by hand
  float pathEdge = smoothstep(0.15, 0.75, w.w + (co.a - 0.5) * 0.6);
  w.w = pathEdge * (w.x + w.y + w.z + w.w);
  w.xyz *= 1.0 - pathEdge;
  vec4 tx = gr * w.x + sa * w.y + ro * w.z + co * w.w;
  diffuseColor.rgb *= tx.rgb * 2.0;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor - w.w * 0.15 - (tx.a - 0.5) * 0.2, 0.3, 1.0);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  normal = pnArb(-vViewPosition, normal, vec2(dFdx(tx.a), dFdy(tx.a)) * uBump * 1.3, faceDirection);`);
  };
  mat.customProgramCacheKey = () => 'terrain-v2';
  return mat;
}
