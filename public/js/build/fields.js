// Crop fields: a rectangle of worked soil that follows the ground, with rows
// of a crop on it. Rows run along the field's length, like real ones.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder, rng, col, jitter, clamp } from '../util.js';
import { getHeight } from '../terrain.js';
import { MAT, L, finish } from './common.js';

export const CROPS = ['grano', 'vigna', 'lavanda', 'girasoli', 'mais', 'orto', 'arato', 'fiori'];
export const CROP_NAMES = {
  grano: '🌾 Grano', vigna: '🍇 Vigna', lavanda: '💜 Lavanda', girasoli: '🌻 Girasoli', mais: '🌽 Mais',
  orto: '🥬 Orto', arato: '🟫 Arato', fiori: '🌷 Tulipani',
};

const SOIL = { grano: '#9b7b52', vigna: '#8c6e4c', lavanda: '#9a8466', girasoli: '#8a6a48', mais: '#8a6a48', orto: '#6f5238', arato: '#6a4d33', fiori: '#7a5c40' };

export function fieldDims(d) {
  return { w: clamp(d.w ?? 6, 1.5, 24), d: clamp(d.d ?? 4, 1.5, 24) };
}

export function buildField(d, opts = {}) {
  const r = rng(d.seed);
  const crop = CROPS.includes(d.crop) ? d.crop : 'grano';
  const { w, d: dd } = fieldDims(d);
  const ang = d.ang || 0;
  const c = Math.cos(ang), s = Math.sin(ang);
  // Local (along the rows = x, across = z) to world
  const W = (lx, lz) => [d.x + lx * c + lz * s, d.z - lx * s + lz * c];
  const H = (lx, lz) => { const [x, z] = W(lx, lz); return getHeight(x, z); };
  const S = new GeoBuilder(L.DIRT);
  const P = new GeoBuilder(L.LEAF);

  // Soil: a grid following the terrain, with furrows (ridge, groove) across it
  const soil = col(SOIL[crop]);
  const nx = Math.max(2, Math.ceil(w / 0.5)), nz = Math.max(2, Math.ceil(dd / 0.25));
  const pt = (i, j) => {
    const lx = -w / 2 + (w * i) / nx, lz = -dd / 2 + (dd * j) / nz;
    const [x, z] = W(lx, lz);
    const ridge = j % 2 === 0 ? 0.035 : 0;
    const edge = (i === 0 || i === nx || j === 0 || j === nz) ? -0.03 : 0;
    return [x - d.x, getHeight(x, z) + 0.04 + ridge + edge, z - d.z];
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = pt(i, j), b = pt(i + 1, j), e = pt(i + 1, j + 1), f = pt(i, j + 1);
      S.quad(a, f, e, b, jitter(soil, r, 0.05));
    }
  }

  // Rows: one every `gap` across the field
  const rowsAt = (gap) => {
    const out = [];
    for (let lz = -dd / 2 + gap / 2; lz < dd / 2 - gap / 4; lz += gap) out.push(lz);
    return out;
  };
  const along = (step, fn) => {
    for (let lx = -w / 2 + step / 2; lx < w / 2; lx += step) fn(lx);
  };
  const add = (B, shape, lx, lz, y, size, color, rot, layer) => {
    const [x, z] = W(lx, lz);
    B.add(shape, [x - d.x, getHeight(x, z) + y, z - d.z], size, color, rot, layer);
  };
  const rowAng = [0, ang, 0];

  if (crop === 'grano' || crop === 'mais') {
    const tall = crop === 'mais' ? 0.62 : 0.26;
    const base = col(crop === 'mais' ? '#6f9a3c' : '#d9b65a');
    for (const lz of rowsAt(crop === 'mais' ? 0.32 : 0.16)) {
      along(0.5, (lx) => {
        const hh = tall * r.range(0.88, 1.08);
        add(P, 'box', lx, lz, 0.05 + hh / 2, [0.52, hh, crop === 'mais' ? 0.12 : 0.11], jitter(base, r, 0.06), rowAng, crop === 'mais' ? L.LEAF : L.THATCH);
        if (crop === 'mais' && r() < 0.6) add(P, 'cone8', lx + r.range(-0.15, 0.15), lz, 0.05 + hh + 0.06, [0.03, 0.14, 0.03], col('#e8c860'), null, L.PLAIN);
        if (crop === 'grano') add(P, 'box', lx, lz, 0.05 + hh + 0.025, [0.5, 0.05, 0.13], jitter(col('#e8c66a'), r, 0.05), rowAng, L.THATCH);
      });
    }
  } else if (crop === 'vigna') {
    const leaf = [col('#4f7d36'), col('#5a8a3e'), col('#66913f')];
    const grape = col(r() < 0.5 ? '#4a2a4f' : '#b9c46a');
    for (const lz of rowsAt(0.7)) {
      along(1.6, (lx) => add(S, 'box', lx - 0.8 + 0.05, lz, 0.25, [0.05, 0.5, 0.05], col('#6b5a44'), rowAng, L.WOOD));
      add(S, 'box', 0, lz, 0.42, [w - 0.1, 0.012, 0.012], col('#7a7a74'), rowAng, L.PLAIN);
      along(0.32, (lx) => {
        add(P, 'ico', lx, lz, 0.36 + r.range(-0.03, 0.04), [0.2, 0.15, 0.13], r.pick(leaf), [r(), ang + r(), 0]);
        if (r() < 0.4) add(P, 'ico', lx + r.range(-0.08, 0.08), lz + r.range(-0.06, 0.06), 0.26, [0.04, 0.06, 0.04], grape, null, L.PLAIN);
      });
    }
  } else if (crop === 'lavanda') {
    const purple = [col('#8c6bc8'), col('#7b5cb8'), col('#9d7fd6')];
    for (const lz of rowsAt(0.42)) {
      along(0.3, (lx) => {
        add(P, 'ico', lx, lz, 0.1, [0.16, 0.12, 0.16], col('#6f8a5a'), [r(), r(), 0]);
        add(P, 'ico', lx, lz, 0.18, [0.15, 0.09, 0.15], r.pick(purple), [r(), r(), 0], L.EVERGREEN);
      });
    }
  } else if (crop === 'girasoli') {
    for (const lz of rowsAt(0.36)) {
      along(0.34, (lx) => {
        const hh = r.range(0.38, 0.5);
        add(P, 'cyl6', lx, lz, 0.05 + hh / 2, [0.015, hh, 0.015], col('#5f8a3a'), null, L.PLAIN);
        add(P, 'ico', lx, lz, 0.1 + hh * 0.4, [0.06, 0.03, 0.06], col('#5f8a3a'), null);
        add(P, 'cyl12', lx, lz + 0.02, 0.05 + hh, [0.07, 0.015, 0.07], col('#f2c230'), [Math.PI / 2 - 0.4, ang, 0], L.EVERGREEN);
        add(P, 'cyl12', lx, lz + 0.03, 0.05 + hh, [0.035, 0.02, 0.035], col('#5a3a1e'), [Math.PI / 2 - 0.4, ang, 0], L.PLAIN);
      });
    }
  } else if (crop === 'orto') {
    const veg = [['#5f9a3e', '#d8402c'], ['#7fb04a', null], ['#4c7d3a', '#f08a2a'], ['#9ac46a', null], ['#3f6b35', '#7a3a8a']];
    let k = 0;
    for (const lz of rowsAt(0.4)) {
      const [leafC, fruit] = veg[k++ % veg.length];
      along(0.28, (lx) => {
        add(P, 'ico', lx, lz, 0.1, [0.11, 0.08, 0.11], jitter(col(leafC), r, 0.08), [r(), r(), 0]);
        if (fruit && r() < 0.6) add(P, 'ico', lx + r.range(-0.05, 0.05), lz + r.range(-0.05, 0.05), 0.12, [0.035, 0.035, 0.035], col(fruit), null, L.PLAIN);
      });
    }
  } else if (crop === 'fiori') {
    const tul = ['#e0473c', '#f6d743', '#f08bb0', '#f4efe4', '#8e44ad'];
    let k = 0;
    for (const lz of rowsAt(0.32)) {
      const c0 = col(tul[k++ % tul.length]);
      along(0.16, (lx) => {
        add(P, 'cyl6', lx, lz, 0.1, [0.01, 0.12, 0.01], col('#5f8a3a'), null, L.PLAIN);
        add(P, 'ico', lx, lz, 0.18, [0.035, 0.05, 0.035], c0, null, L.EVERGREEN);
      });
    }
  }
  // 'arato': just the furrowed soil

  const group = finish([[S, MAT.solid], [P, MAT.solid]], opts.ghost);
  group.position.set(d.x, 0, d.z);
  const hw = w / 2, hd = dd / 2;
  const local = (x, z) => {
    const dx = x - d.x, dz = z - d.z;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  return {
    group,
    rect: { x: d.x, z: d.z, hw, hd },
    solids: [],
    bounds: { x: d.x, z: d.z, r: Math.hypot(hw, hd) },
    hitDist: (x, z) => {
      const [lx, lz] = local(x, z);
      return Math.hypot(Math.max(Math.abs(lx) - hw, 0), Math.max(Math.abs(lz) - hd, 0));
    },
    groundY: () => 0,
  };
}

export const fieldTmp = new THREE.Vector3();
