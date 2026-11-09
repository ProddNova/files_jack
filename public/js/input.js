// Touch and mouse handling.
// Place/edit tools: a tap acts, a drag that starts on the draft or selection
// moves it, any other drag turns the camera. Nothing gets built by a drag.
// Stroke tools (walls, paths, brushes): one finger draws after a short wait,
// so a second finger can still turn it into a camera gesture.
// Two fingers: pan, pinch to zoom, twist to rotate, each past a small threshold.
import { angleDiff } from './util.js';

const HOLD_MS = 110;
const MOVE_PX = 9;

export function setupInput(canvas, h) {
  const pointers = new Map();
  let mode = 'idle';
  let toolId = null;
  let toolT0 = 0;
  let pend = null;
  let g = null;

  const tool = () => h.tool();

  function beginStroke() {
    mode = 'stroke';
    toolId = pend.id;
    toolT0 = performance.now();
    tool().start(pend.p);
    pend = null;
  }

  function gestureInfo() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    h.onTouch();
    if (h.blocked()) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    h.rig.stop();
    if (pointers.size === 1) {
      const t = tool();
      if (e.pointerType === 'mouse' && e.button === 2) { mode = 'orbit'; return; }
      if (e.pointerType === 'mouse' && e.button === 1) { mode = 'pan'; return; }
      const p = h.pick(e.clientX, e.clientY);
      pend = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), ts: e.timeStamp, p };
      if (t.mode === 'place' || t.mode === 'edit') {
        mode = t.grab(p) ? 'grab' : 'tapOrOrbit';
        return;
      }
      if (!p || (p.y < -0.5 && !t.water)) { mode = 'orbit'; pend = null; return; }
      mode = 'pending';
      h.showCursor(p);
    } else if (pointers.size === 2) {
      if (mode === 'stroke') {
        if (performance.now() - toolT0 < 350) tool().cancel();
        else tool().end();
      }
      if (mode === 'drag') tool().dragEnd();
      pend = null;
      h.hideCursor();
      mode = 'gesture';
      g = { ...gestureInfo(), zoomOn: false, rotOn: false, panOn: false, accS: 0, accR: 0, accP: 0 };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse' && tool() && !tool().mode) h.showCursor(h.pick(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    const moved = pend ? Math.hypot(e.clientX - pend.x, e.clientY - pend.y) : 0;
    if (mode === 'tapOrOrbit') {
      if (moved > MOVE_PX) { mode = 'orbit'; pend = null; }
    } else if (mode === 'grab') {
      if (moved > MOVE_PX * 0.6) {
        mode = 'drag';
        tool().dragStart(pend.p);
        tool().drag(h.pick(e.clientX, e.clientY));
      }
    } else if (mode === 'drag') {
      tool().drag(h.pick(e.clientX, e.clientY));
    } else if (mode === 'pending' && pend && e.pointerId === pend.id) {
      if (moved > MOVE_PX) {
        beginStroke();
        const p = h.pick(e.clientX, e.clientY);
        h.showCursor(p);
        tool().move(p);
      }
    } else if (mode === 'stroke' && e.pointerId === toolId) {
      const p = h.pick(e.clientX, e.clientY);
      h.showCursor(p);
      tool().move(p);
    } else if (mode === 'orbit') {
      h.rig.rotate(dx, dy);
    } else if (mode === 'pan') {
      h.rig.pan(dx, dy);
    } else if (mode === 'gesture' && pointers.size >= 2) {
      const c = gestureInfo();
      const scale = g.dist > 10 ? c.dist / g.dist : 1;
      const rot = angleDiff(c.angle, g.angle);
      const pmx = c.mx - g.mx, pmy = c.my - g.my;
      g.accS += Math.log(scale);
      g.accR += rot;
      g.accP += Math.hypot(pmx, pmy);
      if (!g.zoomOn && Math.abs(g.accS) > 0.06) g.zoomOn = true;
      if (!g.rotOn && Math.abs(g.accR) > 0.14) g.rotOn = true;
      if (!g.panOn && g.accP > 10) g.panOn = true;
      if (g.zoomOn) h.rig.zoom(scale);
      if (g.rotOn) h.rig.twist(rot);
      if (g.panOn) h.rig.pan(pmx, pmy);
      Object.assign(g, c);
    }
  });

  function pointerEnd(e, cancelled) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if ((mode === 'tapOrOrbit' || mode === 'grab') && pend && e.pointerId === pend.id) {
      // A tap is a press that did not move: slow taps count too (it only opens a draft)
      if (!cancelled) tool().tap(pend.p);
      mode = 'idle';
      pend = null;
    } else if (mode === 'drag') {
      tool().dragEnd();
      mode = 'idle';
    } else if (mode === 'pending' && pend && e.pointerId === pend.id) {
      const p = pend.p;
      beginStroke();
      if (cancelled) tool().cancel();
      else tool().end(p);
      mode = 'idle';
      h.hideCursor();
    } else if (mode === 'stroke' && e.pointerId === toolId) {
      if (cancelled) tool().cancel();
      else tool().end(h.pick(e.clientX, e.clientY));
      toolId = null;
      mode = 'idle';
      if (e.pointerType !== 'mouse') h.hideCursor();
    } else if ((mode === 'orbit' || mode === 'pan') && pointers.size === 0) {
      h.rig.release();
      mode = 'idle';
    }
    if (mode === 'gesture' && pointers.size < 2) {
      h.rig.release();
      mode = pointers.size ? 'blocked' : 'idle';
    }
    if (pointers.size === 0) { mode = 'idle'; pend = null; }
  }

  canvas.addEventListener('pointerup', (e) => pointerEnd(e, false));
  canvas.addEventListener('pointercancel', (e) => pointerEnd(e, true));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) h.hideCursor();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (h.blocked()) return;
    h.rig.zoom(Math.exp(-e.deltaY * 0.0012));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  return {
    update(dt) {
      if (mode === 'pending' && pend && performance.now() - pend.t > HOLD_MS) beginStroke();
      if (mode === 'stroke' && tool() && tool().update) tool().update(dt);
    },
    cancel() {
      if (mode === 'stroke' && tool()) tool().cancel();
      if (mode === 'drag' && tool()) tool().dragEnd();
      pend = null;
      mode = pointers.size ? 'blocked' : 'idle';
    },
    reset() {
      pointers.clear();
      pend = null;
      mode = 'idle';
    },
  };
}
