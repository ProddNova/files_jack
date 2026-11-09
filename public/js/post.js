// Post-processing: soft bloom on lights, optional "miniature" tilt-shift blur.
// Renders into a multisampled HDR buffer, so edges stay smooth.
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from '../vendor/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from '../vendor/jsm/shaders/VerticalTiltShiftShader.js';

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // HDR buffer when the GPU can render to it, plain 8-bit otherwise (never a black screen)
  const ext = renderer.extensions;
  const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.25, 0.55, 0.92);
  const tiltH = new ShaderPass(HorizontalTiltShiftShader);
  const tiltV = new ShaderPass(VerticalTiltShiftShader);
  const out = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  composer.addPass(out);
  tiltH.enabled = tiltV.enabled = false;

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
    setBloom(night, enabled = true) {
      bloom.enabled = enabled;
      bloom.strength = 0.18 + night * 0.75;
      bloom.threshold = 0.95 - night * 0.25;
    },
    setTilt(on) {
      tiltH.enabled = tiltV.enabled = on;
      tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
    },
    render() {
      composer.render();
    },
  };
}
