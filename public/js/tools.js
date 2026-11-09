// What each toolbar button does with a finger.
// "place" tools (houses, towers, props) never build on a plain tap: they show a
// draft you can drag, tweak in the panel and confirm with ✓. A drag that does
// not start on the draft just turns the camera.
import { newSeed, rng, round2 } from './util.js';
import { getHeight, paintPath, restorePath, sculpt, restoreHeights, changesBox } from './terrain.js';
import { pickTreeType, FLOWER_NAMES, isNature } from './builders.js';
import { resolve, snapHouse, snapTower, snapWallEnd, pointIn, footprint } from './placement.js';

const v = (id, label, use, style) => ({ id, label, use, style });

export const TOOL_DEFS = [
  { id: 'edit', icon: '👆', label: 'Modifica', mode: 'edit', hint: 'Tocca un elemento per modificarlo · trascinalo per spostarlo · trascina altrove per girare la vista' },
  {
    id: 'borgo', icon: '🏠', label: 'Borgo', mode: 'place', hint: 'Tocca dove vuoi costruire, poi sistema e conferma con ✓',
    variants: [
      v('casa', '🏠 Casa', 'house', 'casa'), v('palazzo', '🏛️ Palazzo', 'house', 'palazzo'), v('villetta', '🏡 Villetta', 'house', 'villetta'),
      v('chiesa', '⛪ Chiesa', 'house', 'chiesa'), v('mulino', '🌬️ Mulino', 'house', 'mulino'), v('campanile', '🔔 Campanile', 'tower', 'campanile'),
      v('saracena', '🗼 Torre', 'tower', 'saracena'), v('faro', '💡 Faro', 'tower', 'faro'),
    ],
  },
  {
    id: 'castello', icon: '🏰', label: 'Castello', mode: 'mixed', hint: 'Mura: trascina il dito, le torri nascono agli angoli · gli altri pezzi: tocca e conferma',
    variants: [
      v('mura', '🧱 Mura', 'wall', 'castello'), v('torrione', '🏰 Torrione', 'tower', 'torrione'), v('torretta', '🗼 Torretta', 'tower', 'torretta'),
      v('mastio', '🏯 Mastio', 'tower', 'mastio'), v('porta', '🚪 Porta', 'house', 'porta'), v('quadrata', '⬛ Torre quadrata', 'tower', 'quadrata'),
    ],
  },
  {
    id: 'recinti', icon: '🧱', label: 'Muri', mode: 'stroke', hint: 'Trascina per costruire · dove passa una creuza si apre un varco',
    variants: [
      v('muretto', '🪨 Muretto', 'wall', 'muretto'), v('mura', '🧱 Mura', 'wall', 'mura'), v('staccionata', '🪵 Staccionata', 'wall', 'staccionata'),
      v('siepe', '🌿 Siepe', 'wall', 'siepe'), v('ponte', '🌉 Ponte', 'bridge', 'pietra'), v('pontelegno', '🪵 Ponte di legno', 'bridge', 'legno'),
    ],
  },
  { id: 'path', icon: '🥾', label: 'Creuza', mode: 'stroke', hint: 'Trascina per lastricare una creuza · le case vicine si girano verso di lei' },
  {
    id: 'nature', icon: '🌳', label: 'Natura', mode: 'stroke', hint: 'Trascina per piantare',
    variants: [
      v('misti', '🌳 Misti', 'tree', 'misti'), v('olive', '🫒 Ulivi', 'tree', 'olive'), v('pine', '🌲 Pini', 'tree', 'pine'),
      v('cypress', '🌲 Cipressi', 'tree', 'cypress'), v('palm', '🌴 Palme', 'tree', 'palm'), v('bush', '🌿 Cespugli', 'tree', 'bush'),
      v('rock', '🪨 Massi', 'tree', 'rock'), v('flower', '🌺 Fiori', 'flower', 'flower'),
    ],
  },
  {
    id: 'prop', icon: '🪑', label: 'Arredo', mode: 'place', hint: 'Tocca dove vuoi l\'oggetto, poi conferma con ✓ · le barche vanno in acqua',
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

const DEFAULT_W = { casa: 2.4, palazzo: 4.2, villetta: 3, chiesa: 3.2, porta: 4.2, mulino: 2.2 };

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

// ---------- Place: draft, tweak, confirm ----------

function placeHandler(G, toolId) {
  const h = {
    mode: 'place',
    draft: null,
    valid: true,
    get radius() { return 1.0; },
    get water() { const vr = G.variant(toolId); return vr.use === 'prop' && vr.style === 'barca'; },
    snap(kind, data, userAngle) {
      if (kind === 'house') return snapHouse(data, G.objects, userAngle).data;
      if (kind === 'tower') return snapTower(data, G.objects).data;
      return data;
    },
    makeData(p) {
      const vr = G.variant(toolId);
      const base = { x: round2(p.x), z: round2(p.z), seed: newSeed(), style: vr.style, ang: round2(G.rig.theta) };
      if (vr.use === 'house') base.w = DEFAULT_W[vr.style] || 2.4;
      return { kind: vr.use, data: base };
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
      this.draft = { kind, data: res.data, ok: res.ok };
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
      this.draft = { ...this.draft, data: res.ok ? res.data : snapped, ok: res.ok };
      this.showDraft();
    },
    dragEnd() {},
    // Called by the panel while the player tweaks the draft
    updateDraft(data) {
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

function wallStroke(G, toolId) {
  return {
    radius: 0.5,
    valid: true,
    start(p) {
      if (!p) return;
      const s = snapWallEnd(p.x, p.z, G.objects);
      this.first = p.clone();
      this.pts = [s ? [s[0], s[1]] : [p.x, p.z]];
      this.seed = newSeed();
      this.ticks = 0;
    },
    data() {
      return { pts: cleanStroke(this.pts), seed: this.seed, style: G.variant(toolId).style };
    },
    move(p) {
      if (!this.pts || !p) return;
      const [lx, lz] = this.pts[this.pts.length - 1];
      if (Math.hypot(p.x - lx, p.z - lz) < 0.35 || this.pts.length > 600) return;
      this.pts.push([p.x, p.z]);
      if (++this.ticks % 5 === 0) G.audio.tick();
      G.setGhost('wall', this.data(), true);
    },
    end() {
      if (!this.pts) return;
      G.setGhost(null);
      if (this.pts.length < 2) {
        const hit = G.objectAt(this.first, 'wall');
        this.pts = null;
        if (hit) G.select(hit);
        return;
      }
      const last = this.pts[this.pts.length - 1];
      const s = snapWallEnd(last[0], last[1], G.objects);
      if (s) this.pts.push([s[0], s[1]]);
      let data = this.data();
      this.pts = null;
      if (data.pts.length < 2 || strokeLength(data.pts) < 1) return;
      const [sx, sz] = data.pts[0], [ex, ez] = data.pts[data.pts.length - 1];
      if (strokeLength(data.pts) > 5 && Math.hypot(sx - ex, sz - ez) < 1.0) data = { ...data, pts: [...data.pts, [sx, sz]] };
      const action = G.newAction();
      const obj = G.add('wall', data, { animate: true });
      if (!obj) return;
      clearNature(G, obj, action);
      action.added.push(obj);
      G.commit(action);
      G.audio.pop(0.8);
    },
    cancel() {
      this.pts = null;
      G.setGhost(null);
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
    stamp(p) { paintPath(p.x, p.z, 0.85, 0.45, this.changes); },
    start(p) {
      if (!p) return;
      this.changes = new Map();
      this.last = p.clone();
      this.stamp(p);
    },
    move(p) {
      if (!this.changes || !p) return;
      const steps = Math.ceil(this.last.distanceTo(p) / 0.25);
      for (let i = 1; i <= steps; i++) this.stamp(this.last.clone().lerp(p, i / steps));
      this.last.copy(p);
    },
    end() {
      if (!this.changes) return;
      const action = G.newAction();
      action.pathChanges = this.changes;
      this.changes = null;
      G.commit(action);
    },
    cancel() {
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
      const gap = flower ? 0.5 : this.vr.style === 'rock' ? 1.3 : 0.9;
      for (const o of G.objects) {
        if (isNature(o.kind)) {
          if (Math.hypot(o.data.x - x, o.data.z - z) < gap) return;
        } else if (o.fp.type !== 'line' && pointIn(o.fp, x, z, 0.3)) return;
      }
      const seed = newSeed();
      const obj = flower
        ? G.add('flower', { x, z, seed, variant: this.flowerVariant }, { animate: true })
        : G.add('tree', { x, z, seed, type: this.vr.style === 'misti' ? pickTreeType(rng(seed ^ 0x5bd1)) : this.vr.style }, { animate: true });
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
  const place = { borgo: placeHandler(G, 'borgo'), prop: placeHandler(G, 'prop'), castello: placeHandler(G, 'castello') };
  const strokes = {
    wall: { recinti: wallStroke(G, 'recinti'), castello: wallStroke(G, 'castello') },
    bridge: bridgeStroke(G, 'recinti'),
    path: pathStroke(G),
    nature: natureStroke(G),
    terrain: terrainStroke(G),
    erase: eraseStroke(G),
  };
  const edit = editHandler(G);
  // The handler for the current tool and variant
  return function current(toolId) {
    if (toolId === 'edit') return edit;
    if (toolId === 'borgo' || toolId === 'prop') return place[toolId];
    if (toolId === 'castello') return G.variant('castello').use === 'wall' ? strokes.wall.castello : place.castello;
    if (toolId === 'recinti') return G.variant('recinti').use === 'bridge' ? strokes.bridge : strokes.wall.recinti;
    return strokes[toolId];
  };
}

export { footprint };
