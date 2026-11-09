import * as THREE from '../../vendor/three.module.min.js';
import { col } from '../util.js';
import { texturize } from '../shaders.js';
export { L } from '../textures.js';

// Soft round glow, drawn once on a canvas and reused by every lamp.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)');
  grd.addColorStop(0.25, 'rgba(255,200,120,0.55)');
  grd.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GLOW = glowTexture();

// Shared materials: every object uses the same few, so the GPU stays happy.
// Their brightness at night is driven by world.js.
export const MAT = {
  solid: texturize(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.7 })),
  glassLit: new THREE.MeshStandardMaterial({ color: '#2a3343', emissive: '#ffb45e', emissiveIntensity: 0, roughness: 0.12, metalness: 0.2, flatShading: true, envMapIntensity: 1.4 }),
  glassDark: new THREE.MeshStandardMaterial({ color: '#2a3343', emissive: '#ffb45e', emissiveIntensity: 0, roughness: 0.12, metalness: 0.2, flatShading: true, envMapIntensity: 1.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf7a', emissiveIntensity: 0.1, flatShading: true }),
  crystal: new THREE.MeshStandardMaterial({ color: '#8fe8ff', emissive: '#4fd2ff', emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.88 }),
  fire: new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  water: new THREE.MeshStandardMaterial({ color: '#4aa8c7', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }),
  glow: new THREE.SpriteMaterial({ map: GLOW, color: '#ffd89a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  pool: new THREE.MeshBasicMaterial({ map: GLOW, color: '#ffc77a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }),
  beam: new THREE.MeshBasicMaterial({ color: '#fff1c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
};
MAT.solid.shadowSide = THREE.DoubleSide;

export const GHOST = {
  ok: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.6, depthWrite: false }),
  okGlass: new THREE.MeshStandardMaterial({ color: '#2a3343', transparent: true, opacity: 0.6, depthWrite: false }),
  bad: new THREE.MeshBasicMaterial({ color: '#ff5a4a', transparent: true, opacity: 0.45, depthWrite: false }),
};

export const PAL = {
  trim: col('#f7f1e4'),
  cream: col('#efe3c8'),
  terracotta: [col('#b6533b'), col('#a8492f'), col('#c0623f')],
  slate: col('#6c6f78'),
  foundation: col('#9d968a'),
  door: col('#6b4a32'),
  doorGreen: col('#3f5f45'),
  chimney: col('#9a5a43'),
  stone: col('#b3a48c'),
  stoneDark: col('#968670'),
  stoneLight: col('#d6cbb5'),
  wood: col('#7b5a3e'),
  woodLight: col('#9b7653'),
  white: col('#f6f3ec'),
  red: col('#c8202e'),
  iron: col('#3b3a3a'),
  gold: col('#d9a93a'),
  pot: col('#b8643f'),
  leaf: [col('#4f7d36'), col('#5a8a3e'), col('#46733a')],
  bloom: ['#d23c8c', '#e0473c', '#f2c230', '#f7f4ea', '#8c6bc8'].map(col),
};

// ghost: false for real objects, 'ok' or 'bad' for the placement preview.
export function finish(parts, ghost) {
  const group = new THREE.Group();
  for (const [builder, mat] of parts) {
    if (!builder || builder.empty) continue;
    let m = mat;
    if (ghost === 'bad') m = GHOST.bad;
    else if (ghost === 'sel') m = mat;
    else if (ghost) m = mat === MAT.solid ? GHOST.ok : GHOST.okGlass;
    const mesh = new THREE.Mesh(builder.build(), m);
    mesh.castShadow = !ghost && mat === MAT.solid;
    mesh.receiveShadow = !ghost && mat === MAT.solid;
    group.add(mesh);
  }
  return group;
}

export function addGlow(group, x, y, z, size, ghost) {
  if (ghost) return;
  const s = new THREE.Sprite(MAT.glow);
  s.position.set(x, y, z);
  s.scale.setScalar(size);
  group.add(s);
}

const poolGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export function addLightPool(group, x, y, z, radius, ghost) {
  if (ghost) return;
  const m = new THREE.Mesh(poolGeo, MAT.pool);
  m.position.set(x, y, z);
  m.scale.setScalar(radius);
  m.renderOrder = 2;
  group.add(m);
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry && o.geometry !== poolGeo && !o.userData.sharedGeo) o.geometry.dispose();
  });
}

// The four outer walls of a w x d box: `place(u, out)` gives the xz of a point
// u along the wall, `out` in front of it. `rot` turns a box to face outward.
export function boxFaces(w, d) {
  return [
    { len: w, place: (u, out) => [u, out + d / 2], rot: 0, front: true },
    { len: w, place: (u, out) => [-u, -(out + d / 2)], rot: Math.PI },
    { len: d, place: (u, out) => [out + w / 2, -u], rot: Math.PI / 2 },
    { len: d, place: (u, out) => [-(out + w / 2), u], rot: -Math.PI / 2 },
  ];
}

// Highest and lowest ground under a footprint, used to seat buildings on slopes.
export function groundRange(getHeight, x, z, ang, hw, hd) {
  const c = Math.cos(ang), s = Math.sin(ang);
  let hi = -Infinity, lo = Infinity;
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0], [0, hd], [0, -hd], [hw, 0], [-hw, 0]]) {
    const h = getHeight(x + lx * c + lz * s, z - lx * s + lz * c);
    hi = Math.max(hi, h);
    lo = Math.min(lo, h);
  }
  return { hi, lo };
}
