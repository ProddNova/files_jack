// Minimap: the whole map seen from above, turned so that where you look is
// always up. Ground relief is shaded like a hiking map; houses, walls, fields
// and streets are drawn on top. Tap it to move the view to that spot.
import { getHeight, pathAt, SIZE, isMainland } from './terrain.js';
import { fieldDims, CROPS } from './builders.js';

const B = 128;
const H = SIZE / 2;
const CROP_COL = { grano: '#d9b65a', vigna: '#5f8a3e', lavanda: '#9a7fd0', girasoli: '#f2c230', mais: '#7fa04a', orto: '#4f8a3a', arato: '#7a5a3a', fiori: '#e0607a' };

export function createMinimap(el, { onPick }) {
  const view = el.querySelector('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const S = 132;
  view.width = view.height = S * dpr;
  const ctx = view.getContext('2d');
  const base = document.createElement('canvas');
  base.width = base.height = B;
  const bctx = base.getContext('2d');
  const needle = el.querySelector('.needle');
  let rot = 0, center = { x: 0, z: 0 };

  const toPx = (x, z) => [((x + H) / (2 * H)) * B, ((z + H) / (2 * H)) * B];

  function terrain() {
    const img = bctx.createImageData(B, B);
    const step = (2 * H) / B;
    const land = isMainland();
    for (let j = 0; j < B; j++) {
      for (let i = 0; i < B; i++) {
        const x = -H + (i + 0.5) * step, z = -H + (j + 0.5) * step;
        const h = getHeight(x, z);
        // Light from the top left: slopes facing it are brighter
        const shade = Math.max(0.6, Math.min(1.35, 1 + (getHeight(x - step, z - step) - getHeight(x + step, z + step)) * 0.9));
        let r, g, b;
        if (h < 0) {
          const d = Math.min(1, -h / 2.4);
          r = 120 - 70 * d; g = 196 - 70 * d; b = 214 - 40 * d;
        } else if (h < 0.35 && !land) {
          r = 232; g = 214; b = 164;
        } else {
          const k = Math.min(1, h / 8);
          r = (136 - 40 * k) * shade; g = (176 - 50 * k) * shade; b = (92 - 20 * k) * shade;
          if (h > 7) { const s = Math.min(1, (h - 7) / 3); r += (235 - r) * s; g += (238 - g) * s; b += (242 - b) * s; }
        }
        const p = pathAt(x, z);
        if (p > 0.35 && h >= 0) { r = 222; g = 206; b = 172; }
        const o = (j * B + i) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  function rect(fp, color) {
    const [px, pz] = toPx(fp.x, fp.z);
    const k = B / (2 * H);
    bctx.save();
    bctx.translate(px, pz);
    bctx.rotate(-(fp.ang || 0));
    bctx.fillStyle = color;
    bctx.fillRect(-fp.hw * k, -fp.hd * k, fp.hw * 2 * k, fp.hd * 2 * k);
    bctx.restore();
  }

  function refresh(objects) {
    terrain();
    const k = B / (2 * H);
    for (const o of objects) {
      if (o.kind === 'field') rect({ ...o.fp }, CROP_COL[CROPS.includes(o.data.crop) ? o.data.crop : 'grano']);
    }
    for (const o of objects) {
      if (o.kind === 'tree') {
        const [px, pz] = toPx(o.data.x, o.data.z);
        bctx.fillStyle = o.data.type === 'rock' ? '#9a958c' : '#3f6a34';
        bctx.fillRect(px - 0.8, pz - 0.8, 1.6, 1.6);
      } else if (o.kind === 'wall' || o.kind === 'bridge') {
        const pts = o.kind === 'wall' ? o.data.pts : [o.data.a, o.data.b];
        bctx.strokeStyle = o.kind === 'bridge' ? '#a07a50' : '#6f665c';
        bctx.lineWidth = Math.max(1, (o.fp.half || 0.3) * 2 * k);
        bctx.beginPath();
        pts.forEach(([x, z], i) => { const [px, pz] = toPx(x, z); if (i) bctx.lineTo(px, pz); else bctx.moveTo(px, pz); });
        bctx.stroke();
      } else if (o.kind === 'house' && o.fp) rect(o.fp, '#b5563a');
      else if (o.kind === 'tower') {
        const [px, pz] = toPx(o.data.x, o.data.z);
        bctx.fillStyle = '#7d7468';
        bctx.beginPath();
        bctx.arc(px, pz, Math.max(1.5, (o.fp.r || 1) * k), 0, Math.PI * 2);
        bctx.fill();
      }
    }
  }

  // camera: where it is; target: what it looks at
  function update(camera, target) {
    const fx = target.x - camera.position.x, fz = target.z - camera.position.z;
    if (Math.hypot(fx, fz) > 0.01) rot = -Math.PI / 2 - Math.atan2(fz, fx);
    center = { x: target.x, z: target.z };
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = isMainland() ? '#7fa65a' : '#5d9dbb';
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.rotate(rot);
    // Keep the spot you look at in the middle (a little zoom, so streets read well)
    const zoom = 1.45;
    c.scale(zoom, zoom);
    const [tx, tz] = toPx(center.x, center.z);
    c.imageSmoothingEnabled = true;
    c.drawImage(base, -tx, -tz);
    c.restore();
    // View cone: always pointing up
    c.save();
    c.translate(S / 2, S / 2);
    c.fillStyle = 'rgba(255, 252, 240, 0.35)';
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 34, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    c.closePath();
    c.fill();
    c.fillStyle = '#e2794f';
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 5);
    c.lineTo(0, 2.5);
    c.lineTo(-5, 5);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    if (needle) needle.style.transform = `rotate(${rot}rad)`;
  }

  // Screen point on the map -> world point
  el.addEventListener('click', (e) => {
    const r = view.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width * S - S / 2, sy = (e.clientY - r.top) / r.height * S - S / 2;
    const zoom = 1.45;
    const ux = sx / zoom, uy = sy / zoom;
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const mx = ux * c - uy * s, my = ux * s + uy * c;
    const k = (2 * H) / B;
    onPick(center.x + mx * k, center.z + my * k);
  });

  return { refresh, update };
}

export { fieldDims };
