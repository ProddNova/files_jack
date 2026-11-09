// Touch and mouse handling.
// One finger: uses the tool (after a short wait, so a second finger can still turn it into a camera gesture).
// One finger on sea or sky, or with the "Vista" tool: rotates the camera.
// Two fingers: pan, pinch to zoom, twist to rotate. Each starts only past a small threshold,
// so a pinch doesn't also spin the view by accident.
import { angleDiff } from './util.js';

const HOLD_MS = 110;
const MOVE_PX = 8;

export function setupInput(canvas, h) {
  const pointers = new Map();
  let mode = 'idle';
  let toolId = null;
  let toolT0 = 0;
  let pend = null;
  let g = null;

  const tool = () => h.tool();

  function beginTool() {
    const t = tool();
    mode = 'tool';
    toolId = pend.id;
    toolT0 = performance.now();
    t.start(pend.p);
    pend = null;
  }

  function toolMove(e) {
    const p = h.pick(e.clientX, e.clientY);
    h.showCursor(p);
    tool().move(p);
  }

  function gestureInfo() {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    h.onTouch();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    h.rig.stop();
    if (pointers.size === 1) {
      const t = tool();
      if (e.pointerType === 'mouse' && e.button === 2) { mode = 'orbit'; return; }
      if (e.pointerType === 'mouse' && e.button === 1) { mode = 'pan'; return; }
      if (!t) { mode = 'orbit'; return; }
      const p = h.pick(e.clientX, e.clientY);
      if (!p || (p.y < -0.5 && !t.water)) { mode = 'orbit'; return; }
      mode = 'pending';
      pend = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), p };
      h.showCursor(p);
    } else if (pointers.size === 2) {
      if (mode === 'tool') {
        if (performance.now() - toolT0 < 350) tool().cancel();
        else tool().end();
      }
      pend = null;
      h.hideCursor();
      mode = 'gesture';
      g = { ...gestureInfo(), zoomOn: false, rotOn: false, panOn: false, accS: 0, accR: 0, accP: 0 };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse' && tool()) h.showCursor(h.pick(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (mode === 'pending' && pend && e.pointerId === pend.id) {
      if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > MOVE_PX) {
        beginTool();
        toolMove(e);
      }
    } else if (mode === 'tool' && e.pointerId === toolId) {
      toolMove(e);
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
    if (mode === 'pending' && pend && e.pointerId === pend.id) {
      const p = pend.p;
      beginTool();
      if (cancelled) tool().cancel();
      else tool().end(p);
      mode = 'idle';
      h.hideCursor();
    } else if (mode === 'tool' && e.pointerId === toolId) {
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
    if (pointers.size === 0) mode = 'idle';
  }

  canvas.addEventListener('pointerup', (e) => pointerEnd(e, false));
  canvas.addEventListener('pointercancel', (e) => pointerEnd(e, true));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) h.hideCursor();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    h.rig.zoom(Math.exp(-e.deltaY * 0.0012));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  return {
    update(dt) {
      if (mode === 'pending' && pend && performance.now() - pend.t > HOLD_MS) beginTool();
      if (mode === 'tool' && tool() && tool().update) tool().update(dt);
    },
    get toolActive() {
      return mode === 'tool' || mode === 'pending';
    },
    cancel() {
      if (mode === 'tool' && tool()) tool().cancel();
      pend = null;
      mode = pointers.size ? 'blocked' : 'idle';
    },
  };
}
