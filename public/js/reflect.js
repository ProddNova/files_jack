// Real reflections on the sea: the scene is drawn a second time, at lower
// resolution, from a camera mirrored under the water surface. The water shader
// then reads that picture at its own screen position, shifted by the waves.
//
// Why a mirrored camera and not screen-space reflections? The sea is one flat
// plane, so the mirror is exact (it also shows things that are off screen)
// and costs one extra render at half size, with no ray marching.
import * as THREE from '../vendor/three.module.min.js';

export function createReflection(renderer, scene, camera, world) {
  const ext = renderer.extensions;
  const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
  rt.texture.generateMipmaps = false;
  const vcam = new THREE.PerspectiveCamera();
  vcam.layers.set(0);
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const up = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  let scale = 0.5;
  let enabled = false;

  function setSize() {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    rt.setSize(Math.max(2, Math.round(s.x * scale)), Math.max(2, Math.round(s.y * scale)));
  }

  function update() {
    const U = world.waterUniforms;
    if (!enabled) { U.uReflOn.value = 0; return; }
    const h = world.water.position.y;
    camera.updateMatrixWorld();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < h + 0.05) { U.uReflOn.value = 0; return; }

    // Mirror the camera position, where it looks and its "up" across y = h
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    up.set(0, 1, 0).applyMatrix4(rot);
    vcam.position.set(camPos.x, 2 * h - camPos.y, camPos.z);
    vcam.up.set(up.x, -up.y, up.z);
    vcam.lookAt(look.x, 2 * h - look.y, look.z);
    vcam.far = camera.far;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);

    // Picture coordinates for the water shader: world -> mirrored screen -> 0..1
    U.uReflMat.value.copy(bias).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);

    // Oblique near plane: the mirrored camera must not see what is under the water
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, h - 0.02, 0));
    plane.applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const P = vcam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + P[8]) / P[0];
    q.y = (Math.sign(clip.y) + P[9]) / P[5];
    q.z = -1.0;
    q.w = (1.0 + P[10]) / P[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    P[2] = clip.x;
    P[6] = clip.y;
    P[10] = clip.z + 1.0;
    P[14] = clip.w;

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    world.water.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, vcam);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
    world.water.visible = true;
    U.uRefl.value = rt.texture;
    U.uReflOn.value = 1;
  }

  return {
    update,
    setSize,
    set(on, s = 0.5) {
      enabled = on;
      scale = s;
      world.waterMat.envMapIntensity = on ? 0.25 : 1.1;
      setSize();
    },
    get enabled() { return enabled; },
  };
}
