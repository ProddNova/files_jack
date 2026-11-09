// What each toolbar button does with a finger.
// "place" tools (houses, towers, props) never build on a plain tap: they show a
// draft you can drag, tweak in the panel and confirm with ✓. A drag that does
// not start on the draft just turns the camera.
import { newSeed, rng, round2 } from './util.js';
import { getHeight, paintPath, restorePath, sculpt, restoreHeights, changesBox } from './terrain.js';
import { FLOWER_NAMES, isNature } from './builders.js';
import { resolve, snapHouse, snapTower, snapWallEnd, pointIn, footprint, nearestPath, nearestWall } from './placement.js';

const v = (id, label, use, style) => ({ id, label, use, style });

export const TOOL_DEFS = [
  { id: 'edit', icon: '👆', label: 'Modifica', mode: 'edit', hint: 'Tocca un elemento per modificarlo · trascinalo per spostarlo · trascina altrove per girare la vista' },
  {
    id: 'case', icon: '🏠', label: 'Case', mode: 'place', hint: 'Tocca dove vuoi costruire, poi sistema e conferma con ✓',
    variants: [
      v('casa', '🏠 Casa ligure', 'house', 'casa'), v('villetta', '🏡 Villetta', 'house', 'villetta'), v('rustico', '🪨 Casa di pietra', 'house', 'rustico'),
      v('graticcio', '🏚️ A graticcio', 'house', 'graticcio'), v('pescatori', '🎣 Pescatori', 'house', 'pescatori'), v('torrecasa', '🗼 Casa torre', 'house', 'torrecasa'),
      v('locanda', '🍷 Locanda', 'house', 'locanda'), v('fienile', '🌾 Fienile', 'house', 'fienile'), v('mulino', '🌬️ Mulino', 'house', 'mulino'),
      v('serra', '🪴 Serra', 'house', 'serra'), v('mago', '🔮 Torre del mago', 'house', 'mago'), v('albero', '🌳 Casa sull\'albero', 'house', 'albero'),
    ],
  },
  {
    id: 'edifici', icon: '🏛️', label: 'Edifici', mode: 'place', hint: 'Tocca dove vuoi costruire, poi sistema e conferma con ✓',
    variants: [
      v('palazzo', '🏛️ Palazzo', 'house', 'palazzo'), v('loggia', '🏛️ Con portico', 'house', 'loggia'), v('comune', '🕰️ Comune', 'house', 'comune'),
      v('villa', '🏰 Villa', 'house', 'villa'), v('mercato', '🧺 Mercato', 'house', 'mercato'), v('chiesa', '⛪ Chiesa', 'house', 'chiesa'),
      v('cappella', '⛪ Cappella', 'house', 'cappella'), v('duomo', '🕍 Duomo', 'house', 'duomo'), v('campanile', '🔔 Campanile', 'tower', 'campanile'),
      v('saracena', '🗼 Torre', 'tower', 'saracena'), v('faro', '💡 Faro', 'tower', 'faro'),
    ],
  },
  {
    id: 'castello', icon: '🏰', label: 'Castello', mode: 'mixed', hint: 'Fortezza: trascina da un angolo all\'altro · Mura: trascina, le torri nascono agli angoli · gli altri pezzi: tocca e conferma',
    variants: [
      v('fortezza', '🏰 Fortezza intera', 'fort', 'castello'), v('mura', '🧱 Mura', 'wall', 'castello'), v('bastione', '🛡️ Bastione', 'wall', 'bastione'), v('torrione', '🏰 Torrione', 'tower', 'torrione'),
      v('torretta', '🗼 Torretta', 'tower', 'torretta'), v('mastio', '🏯 Mastio', 'tower', 'mastio'), v('porta', '🚪 Porta', 'house', 'porta'),
      v('quadrata', '⬛ Torre quadrata', 'tower', 'quadrata'),
    ],
  },
  {
    id: 'recinti', icon: '🧱', label: 'Muri', mode: 'stroke', hint: 'Trascina per costruire · il tasto a sinistra cambia il modo: 📏 dritto, ⬜ rettangolo, ⭕ cerchio, ✍️ libero',
    variants: [
      v('muretto', '🪨 Muretto', 'wall', 'muretto'), v('mura', '🧱 Mura', 'wall', 'mura'), v('mattoni', '🧱 Mattoni', 'wall', 'mattoni'),
      v('intonaco', '🏳️ Intonacato', 'wall', 'intonaco'), v('ringhiera', '⚜️ Ringhiera', 'wall', 'ringhiera'), v('palizzata', '🪵 Palizzata', 'wall', 'palizzata'),
      v('staccionata', '🪵 Staccionata', 'wall', 'staccionata'), v('steccato', '🤍 Steccato', 'wall', 'steccato'), v('siepe', '🌿 Siepe', 'wall', 'siepe'),
      v('ponte', '🌉 Ponte', 'bridge', 'pietra'), v('pontelegno', '🪵 Ponte di legno', 'bridge', 'legno'),
    ],
  },
  {
    id: 'path', icon: '🥾', label: 'Strade', mode: 'stroke', hint: 'Trascina per fare una strada · il tasto a sinistra: ✍️ libera, 📏 dritta, ⬜ piazza',
    variants: [
      v('ciottoli', '🪨 Ciottoli', 'path', 0), v('mattoni', '🧱 Mattoni', 'path', 1), v('lastricato', '⬜ Lastricato', 'path', 2),
      v('sterrato', '🟫 Sterrato', 'path', 3), v('ghiaia', '⚪ Ghiaia', 'path', 4),
    ],
  },
  {
    id: 'campi', icon: '🌾', label: 'Campi', mode: 'stroke', hint: 'Trascina da un angolo a quello opposto per seminare un campo',
    variants: [
      v('grano', '🌾 Grano', 'field', 'grano'), v('vigna', '🍇 Vigna', 'field', 'vigna'), v('lavanda', '💜 Lavanda', 'field', 'lavanda'),
      v('girasoli', '🌻 Girasoli', 'field', 'girasoli'), v('mais', '🌽 Mais', 'field', 'mais'), v('orto', '🥬 Orto', 'field', 'orto'),
      v('fiori', '🌷 Tulipani', 'field', 'fiori'), v('arato', '🟫 Arato', 'field', 'arato'),
    ],
  },
  {
    id: 'nature', icon: '🌳', label: 'Natura', mode: 'stroke', hint: 'Trascina per piantare · "Misti" sceglie gli alberi adatti allo scenario',
    variants: [
      v('misti', '🌳 Misti', 'tree', 'misti'), v('olive', '🫒 Ulivi', 'tree', 'olive'), v('pine', '🌲 Pini', 'tree', 'pine'),
      v('cypress', '🌲 Cipressi', 'tree', 'cypress'), v('palm', '🌴 Palme', 'tree', 'palm'), v('abete', '🎄 Abeti', 'tree', 'abete'),
      v('quercia', '🌳 Querce', 'tree', 'quercia'), v('betulla', '🌿 Betulle', 'tree', 'betulla'), v('salice', '🌿 Salici', 'tree', 'salice'),
      v('cactus', '🌵 Cactus', 'tree', 'cactus'), v('bush', '🌿 Cespugli', 'tree', 'bush'), v('rock', '🪨 Massi', 'tree', 'rock'),
      v('flower', '🌺 Fiori', 'flower', 'flower'),
    ],
  },
  {
    id: 'prop', icon: '🪑', label: 'Arredo', mode: 'place', hint: 'Tocca dove vuoi l\'oggetto, poi conferma con ✓ · lampioni e panchine guardano la strada',
    variants: [
      v('lampione', '💡 Lampione', 'prop', 'lampione'), v('fontana', '⛲ Fontana', 'prop', 'fontana'), v('pozzo', '🪣 Pozzo', 'prop', 'pozzo'),
      v('panchina', '🪑 Panchina', 'prop', 'panchina'), v('vasi', '🪴 Vasi', 'prop', 'vasi'), v('bancarella', '🍊 Bancarella', 'prop', 'bancarella'),
      v('botti', '🛢️ Botti', 'prop', 'botti'), v('carretto', '🛒 Carretto', 'prop', 'carretto'), v('falo', '🔥 Falò', 'prop', 'falo'),
      v('gazebo', '⛱️ Gazebo', 'prop', 'gazebo'), v('orto', '🥬 Orto', 'prop', 'orto'), v('statua', '🗿 Statua', 'prop', 'statua'),
      v('cristallo', '💎 Cristallo', 'prop', 'cristallo'), v('gatto', '🐈 Gatto', 'prop', 'gatto'), v('pecora', '🐑 Pecora', 'prop', 'pecora'),
      v('barca', '⛵ Barca', 'prop', 'barca'),
    ],
  },
  {
    id: 'terrain', icon: '⛰️', label: 'Terreno', mode: 'stroke', hint: 'Tieni premuto e trascina · scava sotto il mare per fare un laghetto',
    variants: [v('raise', '⬆️ Alza', 'terrain', 'raise'), v('lower', '⬇️ Abbassa', 'terrain', 'lower'), v('flatten', '🟰 Spiana', 'terrain', 'flatten')],
  },
  { id: 'erase', icon: '🧹', label: 'Gomma', mode: 'stroke', hint: 'Trascina sopra quello che vuoi togliere' },
];

const DEFAULT_W = {
  casa: 2.4, palazzo: 4.2, villetta: 3, chiesa: 3.2, porta: 4.2, mulino: 2.2, torrecasa: 2.2, rustico: 3.2, graticcio: 3,
  pescatori: 1.8, locanda: 3.8, fienile: 3.8, serra: 3.2, loggia: 4.5, comune: 4.8, villa: 7, mercato: 4.5, cappella: 2.2,
  duomo: 6, mago: 2.2, albero: 2.6,
};

// Lamps reach their arm over the nearest street, benches look at it.
function faceStreet(style, x, z) {
  if (style !== 'lampione' && style !== 'panchina') return null;
  const p = nearestPath(x, z, 4);
  if (!p || p.dist < 0.05) return null;
  const dx = (p.x - x) / p.dist, dz = (p.z - z) / p.dist;
  return round2(style === 'lampione' ? Math.atan2(-dz, dx) : Math.atan2(dx, dz));
}

// Clears trees and flowers that end up under something new.
export function clearNature(G, obj, action) {
  for (const o of G.objects.slice()) {
    if (isNature(o.kind) && o !== obj && pointIn(obj.fp, o.data.x, o.data.z, 0.25)) {
      G.remove(o);
      action.removed.push(o);
    }
  }
}

// Smooths a finger stroke and spaces the points evenly.
export function cleanStroke(pts) {
  let p = pts.slice();
  for (let it = 0; it < 2; it++) {
    if (p.length < 3) break;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  const out = [p[0]];
  const spacing = 0.45;
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    let [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= spacing) {
      const t = (spacing - acc) / seg;
      ax += (bx - ax) * t;
      az += (bz - az) * t;
      out.push([ax, az]);
      seg = Math.hypot(bx - ax, bz - az);
      acc = 0;
    }
    acc += seg;
  }
  const last = p[p.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 0.15) out.push(last);
  return out.map(([x, z]) => [round2(x), round2(z)]);
}

const strokeLength = (pts) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};

// ---------- Fields: drag a rectangle ----------

function fieldStroke(G) {
  return {
    radius: 0.4,
    valid: true,
    data() {
      const sh = this.shape;
      const [sx, sz] = sh.pts[0];
      const [ux, uz] = sh.u, [vx, vz] = sh.v;
      return {
        x: round2(sx + ux * sh.du / 2 + vx * sh.dv / 2), z: round2(sz + uz * sh.du / 2 + vz * sh.dv / 2),
        w: round2(Math.abs(sh.du)), d: round2(Math.abs(sh.dv)), ang: round2(Math.atan2(-uz, ux)),
        crop: G.variant('campi').style, seed: this.seed,
      };
    },
    start(p) {
      if (!p) return;
      this.first = p.clone();
      this.seed = newSeed();
      this.st = snapStart(G, p, false);
      this.shape = null;
    },
    move(p) {
      if (!this.st || !p) return;
      this.shape = shapeCorners(G, 'rett', this.st, p, false);
      if (Math.abs(this.shape.du) > 1.2 && Math.abs(this.shape.dv) > 1.2) {
        G.setGhost('field', this.data(), true);
        G.hint(`🌾 ${Math.abs(this.shape.du).toFixed(1)} × ${Math.abs(this.shape.dv).toFixed(1)}`);
      } else { G.setGhost(null); G.hint(null); }
    },
    end() {
      if (!this.st) return;
      G.setGhost(null);
      G.hint(null);
      const sh = this.shape;
      this.st = null;
      if (!sh || Math.abs(sh.du) < 1.2 || Math.abs(sh.dv) < 1.2) {
        const hit = G.objectAt(this.first, 'field');
        if (hit) G.select(hit);
        else G.toast('Trascina da un angolo all\'altro per fare un campo', 1800);
        return;
      }
      const action = G.newAction();
      const obj = G.add('field', this.data(), { animate: true });
      if (!obj) return;
      clearNature(G, obj, action);
      action.added.push(obj);
      G.commit(action);
      G.audio.pop(0.9);
    },
    cancel() {
      this.st = null;
      G.setGhost(null);
      G.hint(null);
    },
  };
}

// ---------- Place: draft, tweak, confirm ----------

function placeHandler(G, toolId) {
  const h = {
    mode: 'place',
    draft: null,
    valid: true,
    get radius() { return 1.0; },
    get water() { const vr = G.variant(toolId); return vr.use === 'prop' && vr.style === 'barca'; },
    snap(kind, data, userAngle) {
      let res = { data, snap: null };
      if (kind === 'house') res = snapHouse(data, G.objects, userAngle);
      else if (kind === 'tower') res = snapTower(data, G.objects);
      // Nothing to line up with: use the grid, and turn in 15° steps
      const g = G.grid();
      if (!res.snap && g) {
        const d = { ...res.data, x: round2(Math.round(res.data.x / g) * g), z: round2(Math.round(res.data.z / g) * g) };
        if (kind === 'house' && !this.manualAng) d.ang = round2(Math.round(d.ang / (Math.PI / 12)) * (Math.PI / 12));
        return d;
      }
      return res.data;
    },
    makeData(p) {
      const vr = G.variant(toolId);
      const base = { x: round2(p.x), z: round2(p.z), seed: newSeed(), style: vr.style, ang: round2(G.rig.theta) };
      if (vr.use === 'house') base.w = DEFAULT_W[vr.style] || 2.4;
      this.manualAng = false;
      return { kind: vr.use, data: base };
    },
    orient(data) {
      if (this.manualAng) return data;
      const a = faceStreet(data.style, data.x, data.z);
      return a == null ? data : { ...data, ang: a };
    },
    showDraft() {
      const d = this.draft;
      G.setGhost(d.kind, d.data, d.ok);
      this.valid = d.ok;
    },
    tap(p) {
      if (!p) return;
      const vr = G.variant(toolId);
      if (!this.draft) {
        const hit = G.objectAt(p, vr.use);
        if (hit) { G.select(hit); return; }
      }
      const { kind, data } = this.draft && this.draft.kind === vr.use && this.draft.data.style === vr.style
        ? { kind: this.draft.kind, data: { ...this.draft.data, x: round2(p.x), z: round2(p.z) } }
        : this.makeData(p);
      const res = resolve(kind, this.snap(kind, data, !!this.draft), G.objects);
      this.draft = { kind, data: this.orient(res.data), ok: res.ok };
      if (G.prefs.quick) { this.confirm(); return; }
      this.showDraft();
      G.openDraft(this);
      G.audio.tick();
    },
    grab(p) {
      return !!(this.draft && p && pointIn(footprint(this.draft.kind, this.draft.data), p.x, p.z, 0.5));
    },
    dragStart(p) {
      this.grabOff = [this.draft.data.x - p.x, this.draft.data.z - p.z];
    },
    drag(p) {
      if (!p || !this.draft) return;
      const data = { ...this.draft.data, x: round2(p.x + this.grabOff[0]), z: round2(p.z + this.grabOff[1]) };
      const snapped = this.snap(this.draft.kind, data, true);
      const res = resolve(this.draft.kind, snapped, G.objects, { maxR: 1.2 });
      this.draft = { ...this.draft, data: this.orient(res.ok ? res.data : snapped), ok: res.ok };
      this.showDraft();
    },
    dragEnd() {},
    // Called by the panel while the player tweaks the draft
    updateDraft(data) {
      if (data.ang !== this.draft.data.ang) this.manualAng = true;
      const ok = resolve(this.draft.kind, data, G.objects, { maxR: 0 }).ok;
      this.draft = { ...this.draft, data, ok };
      this.showDraft();
    },
    confirm() {
      const d = this.draft;
      if (!d) return;
      if (!d.ok) { G.toast('Qui non c\'è spazio: spostala o rimpiccioliscila'); G.audio.tick(); return; }
      const action = G.newAction();
      const obj = G.add(d.kind, d.data, { animate: true });
      if (!obj) return;
      clearNature(G, obj, action);
      action.added.push(obj);
      G.commit(action);
      G.audio.pop(d.kind === 'tower' ? 0.7 : 1);
      this.draft = null;
      G.setGhost(null);
      G.closePanel();
    },
    cancel() {
      this.draft = null;
      G.setGhost(null);
      G.closePanel();
    },
    reset() { this.cancel(); },
  };
  return h;
}

// ---------- Strokes ----------

// ---------- Straight lines, rectangles and circles ----------

// How a wall (or a street) follows the finger:
// dritto = straight line with 15° steps, rett = rectangle, cerchio = circle, libero = freehand
export const DRAW_MODES = {
  dritto: { icon: '📏', label: 'Dritto: angoli di 15° e misure sulla griglia' },
  rett: { icon: '⬜', label: 'Rettangolo: trascina da un angolo a quello opposto' },
  cerchio: { icon: '⭕', label: 'Cerchio: dal centro verso il bordo' },
  libero: { icon: '✍️', label: 'Mano libera: segue il dito' },
};

// Points every `spacing` units along a polyline, keeping the corners exact.
export function resamplePolyline(corners, spacing = 0.45) {
  const out = [corners[0]];
  for (let i = 1; i < corners.length; i++) {
    const [ax, az] = corners[i - 1], [bx, bz] = corners[i];
    const k = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / spacing));
    for (let j = 1; j <= k; j++) out.push([ax + (bx - ax) * (j / k), az + (bz - az) * (j / k)]);
  }
  return out.map(([x, z]) => [round2(x), round2(z)]);
}

const snapTo = (v, g) => (g ? Math.round(v / g) * g : v);
const STEP15 = Math.PI / 12;

// Start of a line: an existing wall end, a point on a wall (T joint) or the grid
function snapStart(G, p, withWalls) {
  if (withWalls) {
    const e = snapWallEnd(p.x, p.z, G.objects, 1.2);
    if (e) {
      // Continue in line with that wall (angles are counted from its direction)
      const w = G.objects.find((o) => o.kind === 'wall' && (o.data.pts[0] === e || o.data.pts[o.data.pts.length - 1] === e));
      let base = 0;
      if (w) {
        const P = w.data.pts, atStart = P[0] === e;
        const q = atStart ? P[Math.min(2, P.length - 1)] : P[Math.max(P.length - 3, 0)];
        base = Math.atan2(e[1] - q[1], e[0] - q[0]);
      }
      return { pt: [e[0], e[1]], base };
    }
    const w = nearestWall(p.x, p.z, G.objects, 0.7);
    if (w) {
      const [ax, az] = w.a, [bx, bz] = w.b;
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / l2));
      return { pt: [ax + (bx - ax) * t, az + (bz - az) * t], base: Math.atan2(bz - az, bx - ax) };
    }
  }
  const g = G.grid();
  return { pt: [snapTo(p.x, g), snapTo(p.z, g)], base: 0 };
}

// Shape corners from the start point and the finger, in the chosen mode
function shapeCorners(G, mode, st, p, withWalls) {
  const g = G.grid();
  const [sx, sz] = st.pt;
  if (mode === 'dritto') {
    if (withWalls) {
      const e = snapWallEnd(p.x, p.z, G.objects, 0.9);
      if (e && Math.hypot(e[0] - sx, e[1] - sz) > 0.5) return { pts: [[sx, sz], [e[0], e[1]]], closed: false };
    }
    let a = Math.atan2(p.z - sz, p.x - sx);
    a = st.base + Math.round((a - st.base) / STEP15) * STEP15;
    const len = Math.max(g || 0.1, snapTo(Math.hypot(p.x - sx, p.z - sz), g));
    return { pts: [[sx, sz], [sx + Math.cos(a) * len, sz + Math.sin(a) * len]], closed: false, len };
  }
  if (mode === 'rett') {
    // Sides line up with the view, turned to the nearest 15°
    const yaw = Math.round(G.rig.theta / STEP15) * STEP15;
    const ux = Math.cos(yaw), uz = -Math.sin(yaw), vx = -Math.sin(yaw), vz = -Math.cos(yaw);
    const dx = p.x - sx, dz = p.z - sz;
    const du = snapTo(dx * ux + dz * uz, g), dv = snapTo(dx * vx + dz * vz, g);
    const c = [[sx, sz], [sx + ux * du, sz + uz * du], [sx + ux * du + vx * dv, sz + uz * du + vz * dv], [sx + vx * dv, sz + vz * dv]];
    return { pts: [...c, c[0]], closed: true, du, dv, u: [ux, uz], v: [vx, vz] };
  }
  // cerchio
  const R = Math.max(g || 0.25, snapTo(Math.hypot(p.x - sx, p.z - sz), g));
  const n = Math.max(24, Math.round((Math.PI * 2 * R) / 0.9));
  const c = [];
  for (let i = 0; i < n; i++) c.push([sx + Math.cos((i / n) * Math.PI * 2) * R, sz + Math.sin((i / n) * Math.PI * 2) * R]);
  return { pts: [...c, c[0]], closed: true, R };
}

function wallStroke(G, toolId) {
  const fort = () => G.variant(toolId).use === 'fort';
  return {
    radius: 0.5,
    valid: true,
    modeKey: 'wallMode',
    get modes() { return fort() ? null : ['dritto', 'rett', 'cerchio', 'libero']; },
    mode() { return fort() ? 'rett' : (DRAW_MODES[G.prefs.wallMode] ? G.prefs.wallMode : 'dritto'); },
    style() { const vr = G.variant(toolId); return vr.use === 'fort' ? 'castello' : vr.style; },
    start(p) {
      if (!p) return;
      this.m = this.mode();
      this.first = p.clone();
      this.seed = newSeed();
      this.ticks = 0;
      this.shape = null;
      if (this.m === 'libero') {
        const s = snapWallEnd(p.x, p.z, G.objects);
        this.pts = [s ? [s[0], s[1]] : [p.x, p.z]];
      } else {
        this.st = snapStart(G, p, this.m === 'dritto');
        this.pts = [this.st.pt];
      }
    },
    data() {
      const pts = this.m === 'libero' ? cleanStroke(this.pts) : resamplePolyline(this.shape.pts);
      return { pts, seed: this.seed, style: this.style() };
    },
    move(p) {
      if (!this.pts || !p) return;
      if (this.m === 'libero') {
        const [lx, lz] = this.pts[this.pts.length - 1];
        if (Math.hypot(p.x - lx, p.z - lz) < 0.35 || this.pts.length > 600) return;
        this.pts.push([p.x, p.z]);
        if (++this.ticks % 5 === 0) G.audio.tick();
        G.setGhost('wall', this.data(), true);
        return;
      }
      const prev = this.shape && JSON.stringify(this.shape.pts.slice(0, 3));
      this.shape = shapeCorners(G, this.m, this.st, p, true);
      if (JSON.stringify(this.shape.pts.slice(0, 3)) !== prev) G.audio.tick();
      const big = this.m === 'dritto' ? (this.shape.len ?? 9) > 0.4 : this.m === 'rett' ? Math.abs(this.shape.du) > 0.9 && Math.abs(this.shape.dv) > 0.9 : this.shape.R > 0.9;
      this.pts = big ? this.shape.pts : [this.st.pt];
      if (big) {
        G.setGhost('wall', this.data(), true);
        const info = this.m === 'rett' ? `${Math.abs(this.shape.du).toFixed(1)} × ${Math.abs(this.shape.dv).toFixed(1)}`
          : this.m === 'cerchio' ? `raggio ${this.shape.R.toFixed(1)}` : `${strokeLength(this.shape.pts).toFixed(1)}`;
        G.hint(`${DRAW_MODES[this.m].icon} ${info}`);
      } else G.setGhost(null);
    },
    end() {
      if (!this.pts) return;
      G.setGhost(null);
      G.hint(null);
      if (this.pts.length < 2) {
        const hit = G.objectAt(this.first, 'wall');
        this.pts = null;
        if (hit) G.select(hit);
        return;
      }
      let data;
      if (this.m === 'libero') {
        const last = this.pts[this.pts.length - 1];
        const s = snapWallEnd(last[0], last[1], G.objects);
        if (s) this.pts.push([s[0], s[1]]);
        data = this.data();
        if (data.pts.length < 2 || strokeLength(data.pts) < 1) { this.pts = null; return; }
        const [sx, sz] = data.pts[0], [ex, ez] = data.pts[data.pts.length - 1];
        if (strokeLength(data.pts) > 5 && Math.hypot(sx - ex, sz - ez) < 1.0) data = { ...data, pts: [...data.pts, [sx, sz]] };
      } else data = this.data();
      const shape = this.shape;
      this.pts = null;
      const action = G.newAction();
      // A fortress: the gate goes in first (walls open where they meet it), then walls and keep
      if (fort() && shape && shape.closed) {
        const [ux, uz] = shape.u, [vx, vz] = shape.v;
        const c = shape.pts;
        const W = Math.abs(shape.du), D = Math.abs(shape.dv);
        // Gate on the side nearest to you (the first side, along the view's right vector)
        const mx = (c[0][0] + c[1][0]) / 2, mz = (c[0][1] + c[1][1]) / 2;
        const gate = G.add('house', { x: round2(mx), z: round2(mz), seed: newSeed(), style: 'porta', ang: round2(Math.atan2(-uz, ux)), w: Math.min(4.2, W * 0.45) }, { animate: true });
        if (gate) { clearNature(G, gate, action); action.added.push(gate); }
        if (Math.min(W, D) >= 7) {
          const cx = (c[0][0] + c[2][0]) / 2, cz = (c[0][1] + c[2][1]) / 2;
          const keep = G.add('tower', { x: round2(cx + vx * Math.sign(shape.dv) * D * 0.12), z: round2(cz + vz * Math.sign(shape.dv) * D * 0.12), seed: newSeed(), style: 'mastio' }, { animate: true });
          if (keep) { clearNature(G, keep, action); action.added.push(keep); }
        }
      }
      const obj = G.add('wall', data, { animate: true });
      if (obj) {
        clearNature(G, obj, action);
        action.added.push(obj);
      }
      if (!action.added.length) return;
      G.commit(action);
      G.audio.pop(0.8);
    },
    cancel() {
      this.pts = null;
      G.setGhost(null);
      G.hint(null);
    },
  };
}

function bridgeStroke(G, toolId) {
  return {
    radius: 0.8,
    valid: true,
    water: true,
    start(p) {
      if (!p) return;
      this.a = [round2(p.x), round2(p.z)];
      this.b = null;
      this.seed = newSeed();
    },
    move(p) {
      if (!this.a || !p) return;
      this.b = [round2(p.x), round2(p.z)];
      if (Math.hypot(this.b[0] - this.a[0], this.b[1] - this.a[1]) > 1.2) {
        G.setGhost('bridge', { a: this.a, b: this.b, seed: this.seed, style: G.variant(toolId).style }, true);
      }
    },
    end() {
      G.setGhost(null);
      if (!this.a) return;
      const a = this.a, b = this.b;
      this.a = null;
      if (!b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1.5) {
        const hit = G.objectAt({ x: a[0], z: a[1] }, 'bridge');
        if (hit) G.select(hit);
        else G.toast('Trascina da una riva all\'altra per fare un ponte', 1800);
        return;
      }
      const action = G.newAction();
      const obj = G.add('bridge', { a, b, seed: this.seed, style: G.variant(toolId).style }, { animate: true });
      if (!obj) return;
      action.added.push(obj);
      G.commit(action);
      G.audio.pop(0.7);
    },
    cancel() {
      this.a = null;
      G.setGhost(null);
    },
  };
}

function pathStroke(G) {
  return {
    radius: 0.85,
    valid: true,
    modeKey: 'pathMode',
    modes: ['libero', 'dritto', 'rett'],
    mode() { return ['libero', 'dritto', 'rett'].includes(G.prefs.pathMode) ? G.prefs.pathMode : 'libero'; },
    stamp(p, r = 0.85, a = 0.45) { paintPath(p.x, p.z, r, a, this.changes, this.type); },
    start(p) {
      if (!p) return;
      this.type = G.variant('path').style || 0;
      this.changes = new Map();
      this.m = this.mode();
      this.shape = null;
      if (this.m === 'libero') {
        this.last = p.clone();
        this.stamp(p);
      } else this.st = snapStart(G, p, false);
    },
    move(p) {
      if (!this.changes || !p) return;
      if (this.m !== 'libero') {
        this.shape = shapeCorners(G, this.m, this.st, p, false);
        G.preview(this.shape.pts);
        G.hint(this.m === 'rett' ? `⬜ Piazza ${Math.abs(this.shape.du).toFixed(1)} × ${Math.abs(this.shape.dv).toFixed(1)}` : `📏 ${this.shape.len.toFixed(1)}`);
        return;
      }
      const steps = Math.ceil(this.last.distanceTo(p) / 0.25);
      for (let i = 1; i <= steps; i++) this.stamp(this.last.clone().lerp(p, i / steps));
      this.last.copy(p);
    },
    end() {
      if (!this.changes) return;
      G.preview(null);
      G.hint(null);
      const sh = this.shape;
      if (this.m === 'dritto' && sh) {
        const [[ax, az], [bx, bz]] = sh.pts;
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
        for (let i = 0; i <= n; i++) this.stamp({ x: ax + (bx - ax) * (i / n), z: az + (bz - az) * (i / n) }, 0.8, 1);
      } else if (this.m === 'rett' && sh) {
        // A paved square: fill the rectangle
        const [ux, uz] = sh.u, [vx, vz] = sh.v, [sx, sz] = sh.pts[0];
        const nu = Math.max(1, Math.ceil(Math.abs(sh.du) / 0.35)), nv = Math.max(1, Math.ceil(Math.abs(sh.dv) / 0.35));
        for (let i = 0; i <= nu; i++) {
          for (let j = 0; j <= nv; j++) {
            const a = sh.du * (i / nu), b = sh.dv * (j / nv);
            this.stamp({ x: sx + ux * a + vx * b, z: sz + uz * a + vz * b }, 0.45, 1);
          }
        }
      }
      const action = G.newAction();
      action.pathChanges = this.changes;
      this.changes = null;
      if (action.pathChanges.size) G.commit(action);
    },
    cancel() {
      G.preview(null);
      G.hint(null);
      if (this.changes) restorePath(this.changes);
      this.changes = null;
    },
  };
}

function natureStroke(G) {
  return {
    get radius() { return G.variant('nature').use === 'flower' ? 0.7 : 1.0; },
    valid: true,
    plant(p) {
      const flower = this.vr.use === 'flower';
      const spread = flower ? 0.4 : 0.5;
      const x = round2(p.x + (Math.random() - 0.5) * spread);
      const z = round2(p.z + (Math.random() - 0.5) * spread);
      if (getHeight(x, z) < (flower ? 0.25 : this.vr.style === 'rock' ? -0.3 : 0.3)) return;
      if (this.vr.style === 'salice' && getHeight(x, z) > 2.5) return;
      const gap = flower ? 0.5 : this.vr.style === 'rock' ? 1.3 : 0.9;
      for (const o of G.objects) {
        if (isNature(o.kind)) {
          if (Math.hypot(o.data.x - x, o.data.z - z) < gap) return;
        } else if (o.fp.type !== 'line' && pointIn(o.fp, x, z, 0.3)) return;
      }
      const seed = newSeed();
      const obj = flower
        ? G.add('flower', { x, z, seed, variant: this.flowerVariant }, { animate: true })
        : G.add('tree', { x, z, seed, type: this.vr.style === 'misti' ? rng(seed ^ 0x5bd1).pick(G.treeMix()) : this.vr.style }, { animate: true });
      if (obj) {
        this.action.added.push(obj);
        G.audio.pop(flower ? 1.6 : 1.3);
      }
    },
    start(p) {
      if (!p) return;
      this.vr = G.variant('nature');
      if (this.vr.use === 'flower') {
        this.flowerVariant = Math.floor(Math.random() * FLOWER_NAMES.length);
        G.toast(`🌺 ${FLOWER_NAMES[this.flowerVariant]}`, 1000);
      }
      this.action = G.newAction();
      this.last = p.clone();
      this.plant(p);
    },
    move(p) {
      if (!this.action || !p) return;
      if (this.last.distanceTo(p) < (this.vr.use === 'flower' ? 0.55 : 1.0)) return;
      this.last.copy(p);
      this.plant(p);
    },
    end() {
      if (this.action) G.commit(this.action);
      this.action = null;
    },
    cancel() {
      if (this.action) for (const o of this.action.added) G.remove(o);
      this.action = null;
    },
  };
}

function terrainStroke(G) {
  return {
    radius: 2.2,
    valid: true,
    water: true,
    start(p) {
      if (!p) return;
      this.mode = G.variant('terrain').style;
      this.changes = new Map();
      this.p = p.clone();
      this.target = p.y;
    },
    move(p) {
      if (this.changes && p) this.p.copy(p);
    },
    update(dt) {
      if (!this.changes) return;
      const rate = this.mode === 'flatten' ? 2.5 : 1.6;
      if (sculpt(this.p.x, this.p.z, this.radius, rate * dt, this.mode, this.target, this.changes)) G.liveReground(this.p, this.radius);
    },
    end() {
      if (!this.changes) return;
      const changes = this.changes;
      this.changes = null;
      if (!changes.size) return;
      const action = G.newAction();
      action.heightChanges = changes;
      G.afterTerrain(changesBox(changes));
      G.commit(action);
    },
    cancel() {
      if (!this.changes) return;
      const box = restoreHeights(this.changes);
      this.changes = null;
      G.afterTerrain(box);
    },
  };
}

function eraseStroke(G) {
  return {
    radius: 0.9,
    valid: true,
    water: true,
    rub(p) {
      for (const o of G.objects.slice()) {
        if (o.hitDist(p.x, p.z) < 0.5) {
          G.remove(o);
          this.action.removed.push(o);
          G.audio.tick();
        }
      }
      paintPath(p.x, p.z, 0.9, -0.5, this.action.pathChanges);
    },
    start(p) {
      if (!p) return;
      this.action = G.newAction();
      this.action.pathChanges = new Map();
      this.rub(p);
    },
    move(p) { if (this.action && p) this.rub(p); },
    end() {
      if (this.action) G.commit(this.action);
      this.action = null;
    },
    cancel() {
      if (!this.action) return;
      restorePath(this.action.pathChanges);
      for (const o of this.action.removed) G.attach(o);
      this.action = null;
      G.refreshAll();
    },
  };
}

// ---------- Edit: select, drag to move ----------

export function translateData(data, dx, dz) {
  if (data.pts) return { ...data, pts: data.pts.map(([x, z]) => [round2(x + dx), round2(z + dz)]) };
  if (data.a) return { ...data, a: [round2(data.a[0] + dx), round2(data.a[1] + dz)], b: [round2(data.b[0] + dx), round2(data.b[1] + dz)] };
  return { ...data, x: round2(data.x + dx), z: round2(data.z + dz) };
}

export function rotateData(data, da) {
  const rot = (cx, cz) => ([x, z]) => {
    const c = Math.cos(da), s = Math.sin(da);
    const dx = x - cx, dz = z - cz;
    return [round2(cx + dx * c + dz * s), round2(cz - dx * s + dz * c)];
  };
  if (data.pts) {
    const cx = data.pts.reduce((a, p) => a + p[0], 0) / data.pts.length;
    const cz = data.pts.reduce((a, p) => a + p[1], 0) / data.pts.length;
    return { ...data, pts: data.pts.map(rot(cx, cz)) };
  }
  if (data.a) {
    const f = rot((data.a[0] + data.b[0]) / 2, (data.a[1] + data.b[1]) / 2);
    return { ...data, a: f(data.a), b: f(data.b) };
  }
  return { ...data, ang: round2(((data.ang || 0) + da) % (Math.PI * 2)) };
}

function editHandler(G) {
  return {
    mode: 'edit',
    radius: 0.6,
    valid: true,
    water: true,
    tap(p) {
      if (!p) { G.deselect(); return; }
      const o = G.objectAt(p);
      if (o) G.select(o);
      else G.deselect();
    },
    grab(p) {
      return !!(p && G.selected && G.selected.hitDist(p.x, p.z) < 0.4);
    },
    dragStart(p) {
      this.start = [p.x, p.z];
      this.before = G.selected.data;
    },
    drag(p) {
      if (!p || !G.selected) return;
      G.liveEdit(G.selected, translateData(this.before, p.x - this.start[0], p.z - this.start[1]));
    },
    dragEnd() {
      if (G.selected && this.before) G.commitEdit(G.selected, this.before);
      this.before = null;
    },
    reset() {},
  };
}

export function createTools(G) {
  const place = { case: placeHandler(G, 'case'), edifici: placeHandler(G, 'edifici'), prop: placeHandler(G, 'prop'), castello: placeHandler(G, 'castello') };
  const strokes = {
    wall: { recinti: wallStroke(G, 'recinti'), castello: wallStroke(G, 'castello') },
    bridge: bridgeStroke(G, 'recinti'),
    path: pathStroke(G),
    campi: fieldStroke(G),
    nature: natureStroke(G),
    terrain: terrainStroke(G),
    erase: eraseStroke(G),
  };
  const edit = editHandler(G);
  // The handler for the current tool and variant
  return function current(toolId) {
    if (toolId === 'edit') return edit;
    if (toolId === 'case' || toolId === 'edifici' || toolId === 'prop') return place[toolId];
    if (toolId === 'castello') return ['wall', 'fort'].includes(G.variant('castello').use) ? strokes.wall.castello : place.castello;
    if (toolId === 'recinti') return G.variant('recinti').use === 'bridge' ? strokes.bridge : strokes.wall.recinti;
    return strokes[toolId];
  };
}

export { footprint };
