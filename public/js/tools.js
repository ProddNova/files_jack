// What each toolbar button does with a finger.
import { newSeed, rng, clamp, round2 } from './util.js';
import { getHeight, paintPath, restorePath, sculpt, restoreHeights, changesBox } from './terrain.js';
import { pickTreeType, FLOWER_NAMES, isNature } from './builders.js';
import { resolve, snapHouse, snapTower, snapWallEnd, pointIn, footprint } from './placement.js';

export const TOOL_DEFS = [
  { id: 'camera', icon: '✋', label: 'Vista', hint: 'Un dito ruota la vista · pizzica per lo zoom · due dita per spostarti' },
  {
    id: 'house', icon: '🏠', label: 'Casa', hint: 'Tocca per una casa, trascina per la facciata · tocca una casa per ricolorarla',
    variants: [['casa', '🏠 Casa'], ['palazzo', '🏛️ Palazzo'], ['villetta', '🏡 Villetta'], ['chiesa', '⛪ Chiesa']],
  },
  {
    id: 'tower', icon: '🏰', label: 'Torre', hint: 'Tocca per una torre · vicino a un muro ci si aggancia sopra',
    variants: [['saracena', '🏰 Saracena'], ['quadrata', '🧱 Quadrata'], ['campanile', '🔔 Campanile'], ['faro', '💡 Faro']],
  },
  {
    id: 'wall', icon: '🧱', label: 'Muro', hint: 'Trascina per un muro · dove passa una creuza si apre un varco',
    variants: [['muretto', '🪨 Muretto'], ['mura', '🏯 Mura'], ['staccionata', '🪵 Staccionata'], ['siepe', '🌿 Siepe']],
  },
  { id: 'path', icon: '🥾', label: 'Creuza', hint: 'Trascina per lastricare una creuza · le case vicine si girano verso di lei' },
  {
    id: 'nature', icon: '🌳', label: 'Natura', hint: 'Trascina per piantare',
    variants: [['misti', '🌳 Misti'], ['olive', '🫒 Ulivi'], ['pine', '🌲 Pini'], ['cypress', '🌲 Cipressi'], ['palm', '🌴 Palme'], ['flower', '🌺 Fiori']],
  },
  {
    id: 'prop', icon: '🪑', label: 'Arredo', hint: 'Tocca per piazzare · le barche vanno in acqua',
    variants: [['lampione', '💡 Lampione'], ['pozzo', '🪣 Pozzo'], ['panchina', '🪑 Panchina'], ['vasi', '🪴 Vasi'], ['barca', '⛵ Barca']],
  },
  {
    id: 'terrain', icon: '⛰️', label: 'Terreno', hint: 'Tieni premuto e trascina · scava sotto il mare per fare un laghetto',
    variants: [['raise', '⬆️ Alza'], ['lower', '⬇️ Abbassa'], ['flatten', '🟰 Spiana']],
  },
  { id: 'erase', icon: '🧹', label: 'Gomma', hint: 'Trascina sopra quello che vuoi togliere' },
];

// Facade toward the camera, so the front door is the side you see.
function facingCamera(G, ang) {
  const cx = Math.sin(G.rig.theta), cz = Math.cos(G.rig.theta);
  return Math.sin(ang) * cx + Math.cos(ang) * cz < 0 ? ang + Math.PI : ang;
}

// Clears trees and flowers that end up under something new.
function clearNature(G, obj, action) {
  for (const o of G.objects.slice()) {
    if (isNature(o.kind) && pointIn(obj.fp, o.data.x, o.data.z, 0.25)) {
      G.remove(o);
      action.removed.push(o);
    }
  }
}

// Tapping an existing building gives it a new look (new colors and details).
function reroll(G, obj) {
  for (let i = 0; i < 8; i++) {
    const data = { ...obj.data, seed: newSeed() };
    if (resolve(obj.kind, data, G.objects, { ignore: obj, maxR: 0 }).ok) {
      const action = G.newAction();
      G.remove(obj);
      action.removed.push(obj);
      const n = G.add(obj.kind, data, { animate: true });
      action.added.push(n);
      G.commit(action);
      G.audio.pop(1.2);
      G.toast('🎨 Nuovo aspetto', 900);
      return;
    }
  }
  G.toast('Non c\'è spazio per cambiarla');
}

function placeTool(G, kind, opts) {
  return {
    radius: opts.radius,
    valid: true,
    get water() { return opts.water ? opts.water() : false; },
    start(p) {
      this.p = p ? p.clone() : null;
      this.moved = false;
      this.target = p ? G.objects.find((o) => o.kind === kind && o.hitDist(p.x, p.z) < 0.02) || null : null;
      this.seed = newSeed();
      if (p && !this.target) this.preview(p);
    },
    preview(p) {
      let data = { x: round2(p.x), z: round2(p.z), seed: this.seed, style: G.variant(opts.tool), ang: round2(G.rig.theta) };
      if (opts.snap) data = opts.snap(data).data;
      const res = resolve(kind, data, G.objects);
      this.res = res;
      this.valid = res.ok;
      G.ghost(kind, res.data, res.ok);
    },
    move(p) {
      if (!p || !this.p) return;
      if (this.p.distanceTo(p) > 0.3) this.moved = true;
      if (this.moved || !this.target) this.preview(p);
    },
    end() {
      G.ghost(null);
      if (!this.p) return;
      this.p = null;
      if (this.target && !this.moved) { reroll(G, this.target); return; }
      if (!this.res || !this.res.ok) { G.toast(opts.noRoom || 'Qui non c\'è spazio'); G.audio.tick(); return; }
      const action = G.newAction();
      const obj = G.add(kind, this.res.data, { animate: true });
      if (!obj) return;
      clearNature(G, obj, action);
      action.added.push(obj);
      G.commit(action);
      G.audio.pop(opts.pitch || 1);
    },
    cancel() {
      this.p = null;
      G.ghost(null);
    },
  };
}

// Smooths a finger stroke and spaces the points evenly.
function cleanStroke(pts) {
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

export function createTools(G) {
  const tools = {};
  tools.camera = null;

  // ---------- House ----------
  tools.house = {
    radius: 1.2,
    valid: true,
    start(p) {
      if (!p) return;
      this.a = p.clone();
      this.drag = false;
      this.seed = newSeed();
      this.target = G.objects.find((o) => o.kind === 'house' && o.hitDist(p.x, p.z) < 0.02) || null;
      if (!this.target) this.compute(p);
    },
    compute(p) {
      const style = G.variant('house');
      const dx = p.x - this.a.x, dz = p.z - this.a.z;
      const len = Math.hypot(dx, dz);
      let data, user = false;
      if (len > 0.6) {
        this.drag = true;
        user = true;
        data = { x: round2(this.a.x + dx / 2), z: round2(this.a.z + dz / 2), w: round2(len), ang: round2(facingCamera(G, Math.atan2(-dz, dx))), seed: this.seed, style };
      } else {
        const w = { casa: 2.4, palazzo: 4.2, villetta: 3, chiesa: 3.2 }[style] || 2.4;
        data = { x: round2(this.a.x), z: round2(this.a.z), w, ang: round2(G.rig.theta), seed: this.seed, style };
      }
      const snapped = snapHouse(data, G.objects, user);
      this.res = resolve('house', snapped.data, G.objects);
      this.valid = this.res.ok;
      G.ghost('house', this.res.data, this.res.ok);
    },
    move(p) {
      if (!this.a || !p) return;
      if (this.target && this.a.distanceTo(p) < 0.6) return;
      this.compute(p);
    },
    end() {
      if (!this.a) return;
      this.a = null;
      G.ghost(null);
      if (this.target && !this.drag) { reroll(G, this.target); return; }
      if (!this.res || !this.res.ok) { G.toast('Qui non c\'è spazio per la casa'); G.audio.tick(); return; }
      const action = G.newAction();
      const obj = G.add('house', this.res.data, { animate: true });
      if (!obj) return;
      clearNature(G, obj, action);
      action.added.push(obj);
      G.commit(action);
      G.audio.pop(1);
    },
    cancel() {
      this.a = null;
      G.ghost(null);
    },
  };

  tools.tower = placeTool(G, 'tower', { tool: 'tower', radius: 1.3, pitch: 0.7, snap: (d) => snapTower(d, G.objects) });
  tools.prop = placeTool(G, 'prop', {
    tool: 'prop', radius: 0.6, pitch: 1.4,
    water: () => G.variant('prop') === 'barca',
    noRoom: 'Qui non ci sta',
  });

  // ---------- Wall ----------
  tools.wall = {
    radius: 0.5,
    valid: true,
    start(p) {
      if (!p) return;
      const s = snapWallEnd(p.x, p.z, G.objects);
      this.pts = [s ? [s[0], s[1]] : [p.x, p.z]];
      this.seed = newSeed();
      this.ticks = 0;
    },
    data() {
      return { pts: cleanStroke(this.pts), seed: this.seed, style: G.variant('wall') };
    },
    move(p) {
      if (!this.pts || !p) return;
      const [lx, lz] = this.pts[this.pts.length - 1];
      if (Math.hypot(p.x - lx, p.z - lz) < 0.35 || this.pts.length > 500) return;
      this.pts.push([p.x, p.z]);
      if (++this.ticks % 5 === 0) G.audio.tick();
      G.ghost('wall', this.data(), true);
    },
    end() {
      if (!this.pts) return;
      G.ghost(null);
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
      G.ghost(null);
    },
  };

  // ---------- Path ----------
  tools.path = {
    radius: 0.85,
    valid: true,
    stamp(p) {
      paintPath(p.x, p.z, 0.85, 0.45, this.changes);
    },
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

  // ---------- Trees and flowers ----------
  tools.nature = {
    get radius() { return G.variant('nature') === 'flower' ? 0.7 : 1.0; },
    valid: true,
    plant(p) {
      const flower = this.kind === 'flower';
      const spread = flower ? 0.4 : 0.5;
      const x = round2(p.x + (Math.random() - 0.5) * spread);
      const z = round2(p.z + (Math.random() - 0.5) * spread);
      if (getHeight(x, z) < (flower ? 0.25 : 0.3)) return;
      for (const o of G.objects) {
        if (isNature(o.kind)) {
          if (Math.hypot(o.data.x - x, o.data.z - z) < (flower ? 0.5 : 0.9)) return;
        } else if (pointIn(o.fp, x, z, 0.3)) return;
      }
      const seed = newSeed();
      const obj = flower
        ? G.add('flower', { x, z, seed, variant: this.flowerVariant }, { animate: true })
        : G.add('tree', { x, z, seed, type: this.kind === 'misti' ? pickTreeType(rng(seed ^ 0x5bd1)) : this.kind }, { animate: true });
      if (obj) {
        this.action.added.push(obj);
        G.audio.pop(flower ? 1.6 : 1.3);
      }
    },
    start(p) {
      if (!p) return;
      this.kind = G.variant('nature');
      if (this.kind === 'flower') {
        this.flowerVariant = Math.floor(Math.random() * FLOWER_NAMES.length);
        G.toast(`🌺 ${FLOWER_NAMES[this.flowerVariant]}`, 1000);
      }
      this.action = G.newAction();
      this.last = p.clone();
      this.plant(p);
    },
    move(p) {
      if (!this.action || !p) return;
      if (this.last.distanceTo(p) < (this.kind === 'flower' ? 0.55 : 1.0)) return;
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

  // ---------- Terrain ----------
  tools.terrain = {
    radius: 2.2,
    valid: true,
    water: true,
    start(p) {
      if (!p) return;
      this.mode = G.variant('terrain');
      this.changes = new Map();
      this.p = p.clone();
      this.target = p.y;
      this.t = 0;
    },
    move(p) {
      if (this.changes && p) this.p.copy(p);
    },
    update(dt) {
      if (!this.changes) return;
      const rate = this.mode === 'flatten' ? 2.5 : 1.6;
      if (sculpt(this.p.x, this.p.z, this.radius, rate * dt, this.mode, this.target, this.changes)) {
        this.t += dt;
        G.liveReground(this.p, this.radius);
      }
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

  // ---------- Eraser ----------
  tools.erase = {
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
    move(p) {
      if (this.action && p) this.rub(p);
    },
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

  return tools;
}

export { cleanStroke, footprint, clamp };
