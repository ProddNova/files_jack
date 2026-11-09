// Post-processing, the "shader pack". After the scene is drawn into an HDR
// buffer (with its depth), these steps run on the whole picture:
//   1. half size: ambient occlusion (corners and contacts get darker) and
//      sun rays (light streaks from the sun, blocked by anything in front)
//   2. full size: occlusion and rays applied, distance and height fog that
//      glows toward the sun, a light sharpen
//   3. bloom (glow of bright things), optional miniature blur
//   4. filmic tone mapping and color grading, vignette, film grain
// The depth buffer is the key: from it each pixel knows its 3D position, so
// fog, occlusion and rays all work without drawing the scene again.
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from '../vendor/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { HorizontalTiltShiftShader } from '../vendor/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from '../vendor/jsm/shaders/VerticalTiltShiftShader.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const COMMON = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uInvProj;
varying vec2 vUv;
vec3 viewPos(vec2 uv) {
  float d = texture(tDepth, uv).r;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
// Interleaved gradient noise: a cheap per-pixel random that hides banding
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const FX_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform mat4 uProj;
uniform vec3 uSun;
uniform float uAspect;
uniform float uAO;
uniform float uRadius;
${COMMON}
void main() {
  float d0 = texture(tDepth, vUv).r;
  float noise = ign(gl_FragCoord.xy);
  float ao = 1.0;
  if (uAO > 0.0 && d0 < 0.99999) {
    vec3 P = viewPos(vUv);
    // Surface direction from the neighbors (the side with the smaller step, so edges stay clean)
    vec2 px = vec2(dFdx(vUv.x), dFdy(vUv.y));
    vec3 pr = viewPos(vUv + vec2(px.x, 0.0)), pl = viewPos(vUv - vec2(px.x, 0.0));
    vec3 pu = viewPos(vUv + vec2(0.0, px.y)), pd = viewPos(vUv - vec2(0.0, px.y));
    vec3 dx = abs(pr.z - P.z) < abs(pl.z - P.z) ? pr - P : P - pl;
    vec3 dy = abs(pu.z - P.z) < abs(pd.z - P.z) ? pu - P : P - pd;
    vec3 N = normalize(cross(dx, dy));
    if (dot(N, P) > 0.0) N = -N;
    vec3 T = normalize(cross(N, abs(N.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 B = cross(N, T);
    // Radius grows a little with distance, so far hills keep some shading
    float R = uRadius * (1.0 + -P.z * 0.012);
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = noise * 6.2831 + fi * 2.39996;
      float r = sqrt((fi + 0.5) / 12.0);
      float up = fract(fi * 0.618 + noise);
      vec3 dir = normalize(T * cos(a) * r + B * sin(a) * r + N * (0.2 + up));
      vec3 S = P + dir * R * mix(0.25, 1.0, fract(fi * 0.37 + noise * 0.5));
      vec4 sp = uProj * vec4(S, 1.0);
      vec2 suv = sp.xy / sp.w * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
      float sz = viewPos(suv).z;
      float range = smoothstep(0.0, 1.0, R / max(abs(P.z - sz), 1e-4));
      occ += (sz >= S.z + 0.025 ? 1.0 : 0.0) * range;
    }
    ao = clamp(1.0 - occ / 12.0, 0.0, 1.0);
  }
  float rays = 0.0;
  if (uSun.z > 0.001) {
    // Walk from this pixel toward the sun; open sky that is bright near the
    // sun lets light through, roofs, trees and clouds block it.
    vec2 delta = (uSun.xy - vUv) / 36.0;
    vec2 uv = vUv + delta * noise;
    float decay = 1.0;
    for (int i = 0; i < 36; i++) {
      vec2 cuv = clamp(uv, 0.001, 0.999);
      float sky = step(0.99999, texture(tDepth, cuv).r);
      vec3 c = texture(tColor, cuv).rgb;
      float bright = clamp(dot(c, vec3(0.3, 0.59, 0.11)) - 1.25, 0.0, 4.0);
      vec2 dd = (uv - uSun.xy) * vec2(uAspect, 1.0);
      rays += sky * bright * exp(-dot(dd, dd) * 7.0) * decay;
      decay *= 0.965;
      uv += delta;
    }
    rays *= uSun.z / 36.0;
  }
  gl_FragColor = vec4(ao, rays, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tFx;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uAOStrength;
uniform float uRayStrength;
uniform float uSharpen;
uniform vec2 uTexel;
uniform vec2 uFxTexel;
${COMMON}
void main() {
  vec3 col = texture(tColor, vUv).rgb;
  if (uSharpen > 0.0) {
    vec3 n = texture(tColor, vUv + vec2(uTexel.x, 0.0)).rgb + texture(tColor, vUv - vec2(uTexel.x, 0.0)).rgb
           + texture(tColor, vUv + vec2(0.0, uTexel.y)).rgb + texture(tColor, vUv - vec2(0.0, uTexel.y)).rgb;
    col = max(col + (col * 4.0 - n) * uSharpen, 0.0);
  }
  float d = texture(tDepth, vUv).r;
  vec3 V = viewPos(vUv);
  vec3 W = (uCamWorld * vec4(V, 1.0)).xyz;
  vec3 rd = normalize(W - uCamPos);

  // Occlusion and rays were made at half size: blend 4 neighbors, trusting
  // the ones at the same depth (so dark halos do not leak across edges)
  vec2 fx = vec2(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i == 0 || i == 2 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5) * uFxTexel;
    float z = viewPos(vUv + o).z;
    float w = 1.0 / (0.02 + abs(z - V.z) * 4.0);
    fx += texture(tFx, vUv + o).rg * w;
    wsum += w;
  }
  fx /= wsum;
  if (d < 0.99999) col *= mix(1.0, fx.r, uAOStrength);

  float sunAmt = pow(max(dot(rd, uSunDir), 0.0), 5.0);
  if (d < 0.99999) {
    float dist = length(V);
    float hf = exp(-max(W.y, 0.0) * uFogHeight);
    float f = 1.0 - exp(-dist * uFogDensity * (0.3 + 0.7 * hf));
    vec3 fc = uFogCol + uSunCol * sunAmt * 0.32;
    col = mix(col, fc, clamp(f, 0.0, 1.0));
  }
  col += uSunCol * fx.g * uRayStrength;
  gl_FragColor = vec4(col, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// Filmic curve (ACES fit): soft highlights, rich shadows
vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(outM * rrtOdt(inM * c), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 c = texture(tDiffuse, vUv).rgb * uExposure * 1.2;
  c = aces(c);
  // Grading: colder shadows, warmer highlights, a bit more color and contrast
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = c * uGain + uLift * (1.0 - c);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;
  c = toSRGB(c);
  float n = ign(gl_FragCoord.xy + fract(uTime) * 97.0);
  c += (n - 0.5) * (1.0 / 255.0 + uGrain);
  gl_FragColor = vec4(c, 1.0);
}`;

class FxPass extends Pass {
  constructor(renderer, camera) {
    super();
    this.camera = camera;
    const ext = renderer.extensions;
    const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.half = new THREE.WebGLRenderTarget(2, 2, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
    this.half.texture.generateMipmaps = false;
    this.fxMat = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null }, tColor: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
        uSun: { value: new THREE.Vector3() }, uAspect: { value: 1 }, uAO: { value: 1 }, uRadius: { value: 0.75 },
      },
      vertexShader: VERT, fragmentShader: FX_FRAG, depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tFx: { value: null },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() },
        uFogDensity: { value: 0.006 }, uFogHeight: { value: 0.12 }, uAOStrength: { value: 0.85 }, uRayStrength: { value: 0.5 },
        uSharpen: { value: 0.2 }, uTexel: { value: new THREE.Vector2() }, uFxTexel: { value: new THREE.Vector2() },
      },
      vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    });
    this.fxQuad = new FullScreenQuad(this.fxMat);
    this.compQuad = new FullScreenQuad(this.compMat);
    this.ao = true;
    this.rays = true;
    this.sun = { dir: new THREE.Vector3(0, 1, 0), color: new THREE.Color(), fog: new THREE.Color(), density: 0.006 };
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
  }

  setSize(w, h) {
    this.half.setSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    this.compMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.compMat.uniforms.uFxTexel.value.set(2 / w, 2 / h);
    this.fxMat.uniforms.uAspect.value = w / h;
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const depth = readBuffer.depthTexture;
    const F = this.fxMat.uniforms, C = this.compMat.uniforms;
    cam.updateMatrixWorld();
    F.tDepth.value = C.tDepth.value = depth;
    F.tColor.value = C.tColor.value = readBuffer.texture;
    F.uProj.value.copy(cam.projectionMatrix);
    F.uInvProj.value.copy(cam.projectionMatrixInverse);
    C.uInvProj.value.copy(cam.projectionMatrixInverse);
    C.uCamWorld.value.copy(cam.matrixWorld);
    C.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    F.uAO.value = this.ao ? 1 : 0;
    C.uAOStrength.value = this.ao ? 0.85 : 0;

    // Where is the sun on screen, and is it in front of us?
    let raysK = 0;
    if (this.rays && this.sun.dir.y > -0.02) {
      const v = this._v.copy(this.sun.dir).multiplyScalar(500).add(C.uCamPos.value).project(cam);
      cam.getWorldDirection(this._f);
      const facing = this._f.dot(this.sun.dir);
      raysK = THREE.MathUtils.smoothstep(facing, -0.1, 0.45) * THREE.MathUtils.smoothstep(this.sun.dir.y, -0.02, 0.12);
      F.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, raysK);
    } else F.uSun.value.z = 0;
    C.uRayStrength.value = 0.42;
    C.uSunDir.value.copy(this.sun.dir);
    C.uSunCol.value.copy(this.sun.color);
    C.uFogCol.value.copy(this.sun.fog);
    C.uFogDensity.value = this.sun.density;

    // With both effects off this still runs, but only writes "no shade, no rays"
    renderer.setRenderTarget(this.half);
    this.fxQuad.render(renderer);
    C.tFx.value = this.half.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compQuad.render(renderer);
  }
}

class FinalPass extends ShaderPass {
  constructor() {
    super(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, uExposure: { value: 1 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 },
        uLift: { value: new THREE.Vector3(0.012, 0.016, 0.03) }, uGain: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
        uVignette: { value: 0.55 }, uGrain: { value: 0.012 }, uTime: { value: 0 },
      },
      vertexShader: VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false,
    }));
  }
}

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // HDR buffer when the GPU can render to it, plain 8-bit otherwise (never a black screen)
  const ext = renderer.extensions;
  const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 4 });
  target.depthTexture = new THREE.DepthTexture(size.x, size.y);
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const fx = new FxPass(renderer, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.25, 0.55, 0.92);
  const tiltH = new ShaderPass(HorizontalTiltShiftShader);
  const tiltV = new ShaderPass(VerticalTiltShiftShader);
  const final = new FinalPass();
  composer.addPass(renderPass);
  composer.addPass(fx);
  composer.addPass(bloom);
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  composer.addPass(final);
  tiltH.enabled = tiltV.enabled = false;
  let bloomBase = 0.25;

  function setSize(w, h) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const dw = w * renderer.getPixelRatio(), dh = h * renderer.getPixelRatio();
    bloom.resolution.set(dw / 2, dh / 2);
    tiltH.uniforms.h.value = 2.2 / dw;
    tiltV.uniforms.v.value = 2.2 / dh;
  }

  return {
    composer,
    setSize,
    fx,
    setBloom(night, enabled = true) {
      bloom.enabled = enabled;
      // Day: only the sun, its glints and lit windows glow; night: lamps glow more
      bloom.strength = bloomBase + night * 0.55;
      bloom.threshold = 1.6 - night * 0.9;
      bloom.radius = 0.5;
    },
    setLevel({ ao, rays, sharpen }) {
      fx.ao = !!ao;
      fx.rays = !!rays;
      fx.compMat.uniforms.uSharpen.value = sharpen ?? 0.15;
      bloomBase = rays ? 0.32 : 0.25;
    },
    setTilt(on) {
      tiltH.enabled = tiltV.enabled = on;
      tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
    },
    render(t) {
      final.uniforms.uExposure.value = renderer.toneMappingExposure;
      final.uniforms.uTime.value = t || 0;
      composer.render();
    },
  };
}
