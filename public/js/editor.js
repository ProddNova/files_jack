// The bottom sheet used to tweak a draft before placing it, or an object
// already on the island: size, floors, roof, colors, rotation and more.
import { newSeed, round2 } from './util.js';
import {
  houseDims, HOUSE_LIMITS, ROOF_TYPES, ROOF_COLORS, FACADE_CHOICES, TOWER_TOPS, STONES,
  WALL_STYLES, MERLON_STYLES, PROP_STYLES, TREE_TYPES, FLOWER_NAMES, HOUSE_STYLES, CROPS, CROP_NAMES, fieldDims,
} from './builders.js';
import { rotateData, translateData } from './tools.js';

const NAMES = {
  casa: 'Casa ligure', palazzo: 'Palazzo', villetta: 'Villetta', chiesa: 'Chiesa', porta: 'Porta fortificata', mulino: 'Mulino a vento',
  torrecasa: 'Casa torre', rustico: 'Casa di pietra', graticcio: 'Casa a graticcio', pescatori: 'Casa dei pescatori', locanda: 'Locanda',
  fienile: 'Fienile', serra: 'Serra', loggia: 'Palazzo con portico', comune: 'Palazzo comunale', villa: 'Villa', mercato: 'Mercato coperto',
  cappella: 'Cappella', duomo: 'Duomo', mago: 'Torre del mago', albero: 'Casa sull\'albero',
  bastione: 'Bastione', mattoni: 'Muro di mattoni', intonaco: 'Muro intonacato', ringhiera: 'Ringhiera', palizzata: 'Palizzata', steccato: 'Steccato',
  abete: 'Abete', quercia: 'Quercia', betulla: 'Betulla', salice: 'Salice', cactus: 'Cactus',
  saracena: 'Torre saracena', quadrata: 'Torre quadrata', campanile: 'Campanile', faro: 'Faro', torrione: 'Torrione', torretta: 'Torretta', mastio: 'Mastio',
  muretto: 'Muretto a secco', mura: 'Mura', castello: 'Mura del castello', staccionata: 'Staccionata', siepe: 'Siepe',
  pietra: 'Ponte di pietra', legno: 'Ponte di legno',
  lampione: 'Lampione', pozzo: 'Pozzo', panchina: 'Panchina', vasi: 'Vasi', fontana: 'Fontana', bancarella: 'Bancarella', botti: 'Botti',
  carretto: 'Carretto', falo: 'Falò', gazebo: 'Gazebo', orto: 'Orto', statua: 'Statua', cristallo: 'Cristallo', gatto: 'Gatto', pecora: 'Pecora', barca: 'Barca',
  olive: 'Ulivo', pine: 'Pino', cypress: 'Cipresso', lemon: 'Limone', palm: 'Palma', bush: 'Cespuglio', rock: 'Masso',
};
const ROOF_NAMES = { gable: 'Due falde', hip: 'Padiglione', flat: 'Terrazza', dome: 'Cupola', merli: 'Merli', cono: 'Cono', piramide: 'Piramide', piatto: 'Piatto', rovina: 'Rovina' };
const HOUSE_STYLE_LIST = HOUSE_STYLES;
const DEG = Math.PI / 180;
const MERLON_NAMES = [['guelfi', 'Quadrati'], ['ghibellini', 'A coda di rondine'], ['nessuno', 'Nessuno']];
const BRICKS = ['#b5654a', '#a8553d', '#c27a5a', '#8e4a38', '#d1a27a'];
const PLASTERS = ['#efe3c8', '#f2d7b8', '#e9c37a', '#f4efe4', '#e9a3a1', '#b9d3a8', '#9fc3d9', '#f4f1ea'];

// Rotation shown in degrees 0..355
function rotationControl(data) {
  const deg = ((Math.round((data.ang || 0) / DEG) % 360) + 360) % 360;
  return { type: 'slider', key: 'ang', label: 'Rotazione', min: 0, max: 355, step: 5, value: deg, toData: (v) => v * DEG, show: (v) => `${v}°` };
}
const TOWER_STYLE_LIST = ['saracena', 'quadrata', 'campanile', 'faro', 'torrione', 'torretta', 'mastio'];

function controlsFor(kind, data) {
  const c = [];
  if (data.ang != null || kind === 'house' || kind === 'tower' || kind === 'prop') c.push(rotationControl(data));
  if (kind === 'house') {
    const style = HOUSE_LIMITS[data.style] ? data.style : 'casa';
    const lim = HOUSE_LIMITS[style];
    const dims = houseDims(data);
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: HOUSE_STYLE_LIST.map((s) => [s, NAMES[s]]), value: style, reset: ['d', 'floors', 'roof'] });
    c.push({ type: 'slider', key: 'w', label: style === 'mulino' ? 'Grandezza' : 'Larghezza', min: lim.w[0], max: lim.w[1], step: 0.1, value: dims.w });
    if (!['mulino', 'mago', 'albero'].includes(style)) c.push({ type: 'slider', key: 'd', label: 'Profondità', min: lim.d[0], max: lim.d[1], step: 0.1, value: dims.d });
    const floorsLabel = ['chiesa', 'cappella', 'duomo', 'porta', 'mulino', 'mercato', 'serra', 'albero', 'fienile'].includes(style) ? 'Altezza' : 'Piani';
    c.push({ type: 'slider', key: 'floors', label: floorsLabel, min: lim.floors[0], max: lim.floors[1], step: 1, value: dims.floors });
    if (ROOF_TYPES[style].length > 1) c.push({ type: 'chips', key: 'roof', label: 'Tetto', options: ROOF_TYPES[style].map((r) => [r, ROOF_NAMES[r]]), value: data.roof });
    c.push({ type: 'swatch', key: 'roofCol', label: 'Colore tetto', options: Object.entries(ROOF_COLORS).map(([k, v]) => [k, v.hex, v.label]), value: data.roofCol });
    c.push({ type: 'swatch', key: 'facade', label: style === 'porta' ? 'Pietra' : 'Facciata', options: FACADE_CHOICES.map((h) => [h, h, h]), value: data.facade, auto: true });
  } else if (kind === 'tower') {
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: TOWER_STYLE_LIST.map((s) => [s, NAMES[s]]), value: data.style, reset: ['top'] });
    c.push({ type: 'slider', key: 'h', label: 'Altezza', min: 0.5, max: 2.2, step: 0.05, value: data.h ?? 1 });
    c.push({ type: 'slider', key: 'r', label: 'Larghezza', min: 0.6, max: 1.8, step: 0.05, value: data.r ?? 1 });
    const tops = TOWER_TOPS[data.style] || [];
    if (tops.length > 1) c.push({ type: 'chips', key: 'top', label: 'Cima', options: tops.map((t) => [t, ROOF_NAMES[t]]), value: data.top });
    c.push({ type: 'swatch', key: 'roofCol', label: 'Colore tetto', options: Object.entries(ROOF_COLORS).map(([k, v]) => [k, v.hex, v.label]), value: data.roofCol });
    c.push({ type: 'swatch', key: 'stone', label: 'Pietra', options: Object.entries(STONES).map(([k, h]) => [k, h, k]), value: data.stone, auto: true });
  } else if (kind === 'wall') {
    const st = data.style || 'muretto';
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: WALL_STYLES.map((s) => [s, NAMES[s]]), value: st, reset: ['stone'] });
    c.push({ type: 'slider', key: 'h', label: 'Altezza', min: 0.4, max: 2.2, step: 0.05, value: data.h ?? 1 });
    if (!['staccionata', 'steccato', 'palizzata'].includes(st)) c.push({ type: 'slider', key: 't', label: 'Spessore', min: 0.5, max: 2, step: 0.05, value: data.t ?? 1 });
    if (MERLON_STYLES.includes(st)) c.push({ type: 'chips', key: 'merli', label: 'Merli', options: MERLON_NAMES, value: data.merli ?? (st === 'bastione' ? 'nessuno' : 'guelfi') });
    if (st === 'castello') {
      c.push({ type: 'chips', key: 'torri', label: 'Torri', options: [['si', 'Sì'], ['no', 'No']], value: data.torri ?? 'si' });
      if (data.torri !== 'no') {
        c.push({ type: 'slider', key: 'tp', label: 'Distanza torri', min: 3, max: 20, step: 0.5, value: data.tp ?? 11 });
        c.push({ type: 'chips', key: 'top', label: 'Tetti torri', options: [['merli', 'Merli'], ['cono', 'A cono']], value: data.top });
      }
    }
    if (st === 'castello' || st === 'bastione') c.push({ type: 'swatch', key: 'roofCol', label: 'Colore tetti', options: Object.entries(ROOF_COLORS).map(([k, v]) => [k, v.hex, v.label]), value: data.roofCol });
    if (['muretto', 'mura', 'castello', 'bastione'].includes(st)) c.push({ type: 'swatch', key: 'stone', label: 'Pietra', options: Object.values(STONES).map((h) => [h, h, h]), value: data.stone, auto: true });
    if (st === 'mattoni') c.push({ type: 'swatch', key: 'stone', label: 'Mattoni', options: BRICKS.map((h) => [h, h, h]), value: data.stone, auto: true });
    if (st === 'intonaco' || st === 'steccato') c.push({ type: 'swatch', key: 'stone', label: 'Colore', options: PLASTERS.map((h) => [h, h, h]), value: data.stone, auto: true });
  } else if (kind === 'bridge') {
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: [['pietra', 'Pietra'], ['legno', 'Legno']], value: data.style });
    c.push({ type: 'slider', key: 'w', label: 'Larghezza', min: 1, max: 3.5, step: 0.1, value: data.w ?? 1.6 });
    c.push({ type: 'slider', key: 'h', label: 'Arco', min: 0.3, max: 2.5, step: 0.05, value: data.h ?? 1 });
  } else if (kind === 'field') {
    const f = fieldDims(data);
    c.push({ type: 'chips', key: 'crop', label: 'Coltura', options: CROPS.map((s) => [s, CROP_NAMES[s]]), value: data.crop });
    c.push({ type: 'slider', key: 'w', label: 'Lunghezza', min: 1.5, max: 24, step: 0.5, value: f.w });
    c.push({ type: 'slider', key: 'd', label: 'Larghezza', min: 1.5, max: 24, step: 0.5, value: f.d });
  } else if (kind === 'prop') {
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: PROP_STYLES.map((s) => [s, NAMES[s]]), value: data.style });
    c.push({ type: 'slider', key: 's', label: 'Grandezza', min: 0.4, max: 2.5, step: 0.05, value: data.s ?? 1 });
  } else if (kind === 'tree') {
    c.push({ type: 'chips', key: 'type', label: 'Tipo', options: TREE_TYPES.map((s) => [s, NAMES[s]]), value: data.type });
    c.push({ type: 'slider', key: 's', label: 'Grandezza', min: 0.4, max: 2.5, step: 0.05, value: data.s ?? 1 });
  } else if (kind === 'flower') {
    c.push({ type: 'chips', key: 'variant', label: 'Fiore', options: FLOWER_NAMES.map((n, i) => [i, n]), value: data.variant });
    c.push({ type: 'slider', key: 's', label: 'Grandezza', min: 0.4, max: 2.5, step: 0.05, value: data.s ?? 1 });
  }
  return c;
}

function titleFor(kind, data) {
  if (kind === 'field') return 'Campo: ' + (CROP_NAMES[data.crop] || CROP_NAMES.grano).replace(/^\S+ /, '');
  if (kind === 'tree') return NAMES[data.type] || 'Albero';
  if (kind === 'flower') return FLOWER_NAMES[data.variant] || 'Fiori';
  if (kind === 'wall' && !data.style) return NAMES.muretto;
  return NAMES[data.style] || 'Elemento';
}

export function createEditor(G, el) {
  let target = null;
  let mode = null;
  let before = null;
  let rafPending = null;

  const kind = () => (mode === 'draft' ? target.draft.kind : target.kind);
  const data = () => (mode === 'draft' ? target.draft.data : target.data);

  function apply(next, final) {
    if (mode === 'draft') {
      target.updateDraft(next);
      return;
    }
    if (!before) before = target.data;
    if (final) {
      if (rafPending) { cancelAnimationFrame(rafPending.id); rafPending = null; }
      G.liveEdit(target, next);
      G.commitEdit(target, before);
      before = null;
      return;
    }
    // Live preview while a slider moves, at most once per frame
    if (rafPending) rafPending.next = next;
    else {
      rafPending = { next };
      rafPending.id = requestAnimationFrame(() => {
        const n = rafPending.next;
        rafPending = null;
        if (target) G.liveEdit(target, n);
      });
    }
  }

  function button(label, title, onClick, cls = '') {
    const b = document.createElement('button');
    b.className = 'pbtn ' + cls;
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    if (!target) return;
    const k = kind(), d = data();
    el.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'phead';
    const title = document.createElement('div');
    title.className = 'ptitle';
    title.textContent = (mode === 'draft' ? 'Nuovo: ' : '') + titleFor(k, d);
    head.appendChild(title);
    const acts = document.createElement('div');
    acts.className = 'pacts';
    acts.append(
      button('⟲', 'Ruota a sinistra', () => { apply(rotateData(data(), Math.PI / 4), true); render(); }),
      button('⟳', 'Ruota a destra', () => { apply(rotateData(data(), -Math.PI / 4), true); render(); }),
      button('🎲', 'Nuovo aspetto', () => apply({ ...data(), seed: newSeed() }, true)),
    );
    if (mode === 'edit') {
      acts.append(
        button('⧉', 'Duplica', () => G.duplicate(target)),
        button('🗑', 'Elimina', () => G.deleteObj(target)),
        button('✓', 'Fatto', () => G.deselect(), 'ok'),
      );
    } else {
      acts.append(
        button('✕', 'Annulla', () => target.cancel(), 'no'),
        button('✓', 'Costruisci', () => target.confirm(), 'ok'),
      );
    }
    head.appendChild(acts);
    el.appendChild(head);

    const body = document.createElement('div');
    body.className = 'pbody';
    // Fine moves: one grid step relative to the view, and 15° turns
    {
      const row = document.createElement('div');
      row.className = 'prow';
      const lab = document.createElement('label');
      lab.textContent = 'Sposta';
      const list = document.createElement('div');
      list.className = 'pchips nudge';
      const step = () => (G.grid ? G.grid() || 0.25 : 0.25);
      const move = (fx, fz) => () => {
        const y = G.yaw ? G.yaw() : 0;
        const rx = Math.cos(y), rz = -Math.sin(y), ax = -Math.sin(y), az = -Math.cos(y);
        const st = step();
        apply(translateData(data(), (rx * fx + ax * fz) * st, (rz * fx + az * fz) * st), true);
      };
      const turn = (a) => () => { apply(rotateData(data(), a), true); render(); };
      for (const [t, title, fn] of [['◀', 'Sinistra', move(-1, 0)], ['▲', 'Avanti', move(0, 1)], ['▼', 'Indietro', move(0, -1)], ['▶', 'Destra', move(1, 0)],
        ['↺ 15°', 'Ruota di 15°', turn(Math.PI / 12)], ['↻ 15°', 'Ruota di 15° nell\'altro verso', turn(-Math.PI / 12)]]) {
        const b = document.createElement('button');
        b.className = 'pchip';
        b.textContent = t;
        b.title = title;
        b.addEventListener('click', fn);
        list.appendChild(b);
      }
      row.append(lab, list);
      body.appendChild(row);
    }
    for (const c of controlsFor(k, d)) {
      const row = document.createElement('div');
      row.className = 'prow';
      const lab = document.createElement('label');
      lab.textContent = c.label;
      row.appendChild(lab);
      if (c.type === 'slider') {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = c.min; input.max = c.max; input.step = c.step;
        input.value = c.value;
        const out = document.createElement('span');
        out.className = 'pval';
        const fmt = (v) => (c.show ? c.show(v) : c.step >= 1 ? String(v) : v.toFixed(1));
        out.textContent = fmt(Number(c.value));
        const val = () => (c.step >= 1 ? parseInt(input.value, 10) : round2(parseFloat(input.value)));
        const conv = (v) => (c.toData ? round2(c.toData(v)) : v);
        input.addEventListener('input', () => {
          out.textContent = fmt(val());
          apply({ ...data(), [c.key]: conv(val()) }, false);
        });
        input.addEventListener('change', () => apply({ ...data(), [c.key]: conv(val()) }, true));
        row.append(input, out);
      } else {
        const list = document.createElement('div');
        list.className = c.type === 'swatch' ? 'pswatches' : 'pchips';
        const opts = c.auto ? [[null, null, 'Auto'], ...c.options] : c.options;
        for (const [value, hex, name] of opts) {
          const b = document.createElement('button');
          const active = (c.value ?? null) === value || (c.value == null && value == null);
          if (c.type === 'swatch') {
            b.className = 'sw' + (active ? ' active' : '') + (value == null ? ' auto' : '');
            if (hex) b.style.background = hex;
            b.title = name;
            b.setAttribute('aria-label', name);
            if (value == null) b.textContent = 'A';
          } else {
            b.className = 'pchip' + (active ? ' active' : '');
            b.textContent = hex;
          }
          b.addEventListener('click', () => {
            const next = { ...data(), [c.key]: value };
            if (value == null) delete next[c.key];
            for (const r of c.reset || []) delete next[r];
            apply(next, true);
            render();
          });
          list.appendChild(b);
        }
        row.appendChild(list);
      }
      body.appendChild(row);
    }
    el.appendChild(body);
  }

  return {
    get open() { return !!target; },
    get mode() { return mode; },
    openDraft(tool) {
      target = tool;
      mode = 'draft';
      before = null;
      render();
      el.classList.add('show');
      document.body.classList.remove('panel-edit');
      document.body.classList.add('panel-draft');
    },
    openEdit(obj) {
      target = obj;
      mode = 'edit';
      before = null;
      render();
      el.classList.add('show');
      document.body.classList.remove('panel-draft');
      document.body.classList.add('panel-edit');
    },
    refresh() { render(); },
    close() {
      if (rafPending) { cancelAnimationFrame(rafPending.id); rafPending = null; }
      if (mode === 'edit' && before && target) G.commitEdit(target, before);
      target = null;
      mode = null;
      before = null;
      el.classList.remove('show');
      document.body.classList.remove('panel-draft', 'panel-edit');
    },
    isTarget(o) { return target === o; },
  };
}
