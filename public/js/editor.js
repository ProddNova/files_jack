// The bottom sheet used to tweak a draft before placing it, or an object
// already on the island: size, floors, roof, colors, rotation and more.
import { newSeed, round2 } from './util.js';
import {
  houseDims, HOUSE_LIMITS, ROOF_TYPES, ROOF_COLORS, FACADE_CHOICES, TOWER_TOPS, STONES,
  WALL_STYLES, PROP_STYLES, TREE_TYPES, FLOWER_NAMES,
} from './builders.js';
import { rotateData } from './tools.js';

const NAMES = {
  casa: 'Casa ligure', palazzo: 'Palazzo', villetta: 'Villetta', chiesa: 'Chiesa', porta: 'Porta fortificata', mulino: 'Mulino a vento',
  saracena: 'Torre saracena', quadrata: 'Torre quadrata', campanile: 'Campanile', faro: 'Faro', torrione: 'Torrione', torretta: 'Torretta', mastio: 'Mastio',
  muretto: 'Muretto a secco', mura: 'Mura', castello: 'Mura del castello', staccionata: 'Staccionata', siepe: 'Siepe',
  pietra: 'Ponte di pietra', legno: 'Ponte di legno',
  lampione: 'Lampione', pozzo: 'Pozzo', panchina: 'Panchina', vasi: 'Vasi', fontana: 'Fontana', bancarella: 'Bancarella', botti: 'Botti',
  carretto: 'Carretto', falo: 'Falò', gazebo: 'Gazebo', orto: 'Orto', statua: 'Statua', cristallo: 'Cristallo', gatto: 'Gatto', pecora: 'Pecora', barca: 'Barca',
  olive: 'Ulivo', pine: 'Pino', cypress: 'Cipresso', lemon: 'Limone', palm: 'Palma', bush: 'Cespuglio', rock: 'Masso',
};
const ROOF_NAMES = { gable: 'Due falde', hip: 'Padiglione', flat: 'Terrazza', dome: 'Cupola', merli: 'Merli', cono: 'Cono', piramide: 'Piramide', piatto: 'Piatto', rovina: 'Rovina' };
const HOUSE_STYLE_LIST = ['casa', 'palazzo', 'villetta', 'chiesa', 'porta', 'mulino'];
const TOWER_STYLE_LIST = ['saracena', 'quadrata', 'campanile', 'faro', 'torrione', 'torretta', 'mastio'];

function controlsFor(kind, data) {
  const c = [];
  if (kind === 'house') {
    const style = HOUSE_LIMITS[data.style] ? data.style : 'casa';
    const lim = HOUSE_LIMITS[style];
    const dims = houseDims(data);
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: HOUSE_STYLE_LIST.map((s) => [s, NAMES[s]]), value: style, reset: ['d', 'floors', 'roof'] });
    c.push({ type: 'slider', key: 'w', label: style === 'mulino' ? 'Grandezza' : 'Larghezza', min: lim.w[0], max: lim.w[1], step: 0.1, value: dims.w });
    if (style !== 'mulino') c.push({ type: 'slider', key: 'd', label: 'Profondità', min: lim.d[0], max: lim.d[1], step: 0.1, value: dims.d });
    c.push({ type: 'slider', key: 'floors', label: style === 'casa' || style === 'palazzo' || style === 'villetta' ? 'Piani' : 'Altezza', min: lim.floors[0], max: lim.floors[1], step: 1, value: dims.floors });
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
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: WALL_STYLES.map((s) => [s, NAMES[s]]), value: data.style });
    c.push({ type: 'slider', key: 'h', label: 'Altezza', min: 0.5, max: 2, step: 0.05, value: data.h ?? 1 });
    if (data.style === 'castello') {
      c.push({ type: 'chips', key: 'top', label: 'Torri', options: [['merli', 'Merli'], ['cono', 'Tetto a cono']], value: data.top });
      c.push({ type: 'swatch', key: 'roofCol', label: 'Colore tetti', options: Object.entries(ROOF_COLORS).map(([k, v]) => [k, v.hex, v.label]), value: data.roofCol });
    }
    if (data.style === 'mura' || data.style === 'castello') {
      c.push({ type: 'swatch', key: 'stone', label: 'Pietra', options: Object.values(STONES).map((h) => [h, h, h]), value: data.stone, auto: true });
    }
  } else if (kind === 'bridge') {
    c.push({ type: 'chips', key: 'style', label: 'Tipo', options: [['pietra', 'Pietra'], ['legno', 'Legno']], value: data.style });
    c.push({ type: 'slider', key: 'w', label: 'Larghezza', min: 1, max: 3.5, step: 0.1, value: data.w ?? 1.6 });
    c.push({ type: 'slider', key: 'h', label: 'Arco', min: 0.3, max: 2.5, step: 0.05, value: data.h ?? 1 });
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
      button('⟲', 'Ruota a sinistra', () => apply(rotateData(data(), Math.PI / 12), true)),
      button('⟳', 'Ruota a destra', () => apply(rotateData(data(), -Math.PI / 12), true)),
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
        out.textContent = c.step >= 1 ? c.value : Number(c.value).toFixed(1);
        const val = () => (c.step >= 1 ? parseInt(input.value, 10) : round2(parseFloat(input.value)));
        input.addEventListener('input', () => {
          out.textContent = c.step >= 1 ? val() : val().toFixed(1);
          apply({ ...data(), [c.key]: val() }, false);
        });
        input.addEventListener('change', () => apply({ ...data(), [c.key]: val() }, true));
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
