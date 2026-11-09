// First-person walk: a joystick to move, drag anywhere else to look around.
// Keyboard works too (WASD / arrows, Shift to run).
import * as THREE from '../vendor/three.module.min.js';
import { getHeight } from './terrain.js';
import { clamp } from './util.js';

const EYE = 0.62;
const BODY = 0.2;
const WALK = 1.7;
const RUN = 3.0;

function pushOutRect(p, r, m) {
  const c = Math.cos(r.ang), s = Math.sin(r.ang);
  const dx = p.x - r.x, dz = p.z - r.z;
  let lx = dx * c - dz * s, lz = dx * s + dz * c;
  const hw = r.hw + m, hd = r.hd + m;
  if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) return;
  if (hw - Math.abs(lx) < hd - Math.abs(lz)) lx = Math.sign(lx || 1) * hw;
  else lz = Math.sign(lz || 1) * hd;
  p.x = r.x + lx * c + lz * s;
  p.z = r.z - lx * s + lz * c;
}

function pushOutCircle(p, x, z, r) {
  const dx = p.x - x, dz = p.z - z;
  const d = Math.hypot(dx, dz);
  if (d >= r || d < 1e-5) return;
  p.x = x + (dx / d) * r;
  p.z = z + (dz / d) * r;
}

function pushOutSeg(p, [ax, az, bx, bz], r) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((p.x - ax) * dx + (p.z - az) * dz) / l2, 0, 1);
  pushOutCircle(p, ax + dx * t, az + dz * t, r);
}

export function createWalk({ camera, canvas, objects, onExit, audio }) {
  const ui = document.querySelector('#walk-ui');
  const joy = document.querySelector('#joy');
  const knob = document.querySelector('#knob');
  let active = false;
  const pos = new THREE.Vector3();
  let yaw = 0, pitch = 0, y = 0, bob = 0, stepT = 0;
  const stick = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
  const look = { id: null, x: 0, y: 0 };
  const keys = new Set();

  function surfaceAt(x, z) {
    let h = getHeight(x, z);
    let bridge = false;
    for (const o of objects) {
      if (o.kind !== 'bridge' || !o.surfaceAt) continue;
      const s = o.surfaceAt(x, z);
      if (s != null && s > h - 0.6) { h = Math.max(h, s); bridge = true; }
    }
    return { h, bridge };
  }

  function collide(p) {
    for (const o of objects) {
      const b = o.bounds;
      if (!b || Math.hypot(b.x - p.x, b.z - p.z) > b.r + 1) continue;
      const solids = o.solids || (o.fp && o.fp.type !== 'line' ? [o.fp] : []);
      for (const s of solids) {
        if (s.type === 'rect') pushOutRect(p, s, BODY);
        else if (s.type === 'circle') pushOutCircle(p, s.x, s.z, s.r + BODY);
        else if (s.type === 'segs') for (const seg of s.segs) pushOutSeg(p, seg, s.half + BODY);
      }
    }
  }

  function onDown(e) {
    if (!active) return;
    e.preventDefault();
    if (e.target === joy || joy.contains(e.target)) {
      const r = joy.getBoundingClientRect();
      stick.id = e.pointerId;
      stick.cx = r.left + r.width / 2;
      stick.cy = r.top + r.height / 2;
      moveStick(e);
      try { joy.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (look.id == null) {
      look.id = e.pointerId;
      look.x = e.clientX;
      look.y = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  }

  function moveStick(e) {
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const d = Math.hypot(dx, dy), max = 46;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    stick.x = dx / max;
    stick.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function onMove(e) {
    if (!active) return;
    if (e.pointerId === stick.id) { moveStick(e); return; }
    if (e.pointerId === look.id) {
      yaw -= (e.clientX - look.x) * 0.0055;
      pitch = clamp(pitch - (e.clientY - look.y) * 0.0045, -1.2, 1.2);
      look.x = e.clientX;
      look.y = e.clientY;
    }
  }

  function onUp(e) {
    if (e.pointerId === stick.id) {
      stick.id = null;
      stick.x = stick.y = 0;
      knob.style.transform = '';
    }
    if (e.pointerId === look.id) look.id = null;
  }

  for (const el of [canvas, joy]) {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }
  window.addEventListener('keydown', (e) => { if (active) keys.add(e.key.toLowerCase()); });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  document.querySelector('#walk-exit').addEventListener('click', () => exit());

  function exit() {
    if (!active) return;
    active = false;
    ui.classList.remove('show');
    document.body.classList.remove('walking');
    camera.fov = 45;
    camera.near = 0.3;
    camera.updateProjectionMatrix();
    onExit();
  }

  return {
    get active() { return active; },
    enter(x, z, facing) {
      active = true;
      pos.set(x, 0, z);
      // Start on dry ground near the chosen point
      for (let r = 0; r < 12 && getHeight(pos.x, pos.z) < 0.05; r += 0.5) {
        pos.x = x * (1 - r / 24);
        pos.z = z * (1 - r / 24);
      }
      for (let i = 0; i < 4; i++) collide(pos);
      yaw = facing;
      pitch = -0.08;
      y = surfaceAt(pos.x, pos.z).h + EYE;
      camera.fov = 70;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      ui.classList.add('show');
      document.body.classList.add('walking');
    },
    exit,
    update(dt) {
      if (!active) return;
      let mx = stick.x, my = stick.y;
      if (keys.has('w') || keys.has('arrowup')) my -= 1;
      if (keys.has('s') || keys.has('arrowdown')) my += 1;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      const mag = Math.min(1, Math.hypot(mx, my));
      const running = mag > 0.9 || keys.has('shift');
      const speed = (running ? RUN : WALK) * mag;
      if (mag > 0.05) {
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const n = Math.hypot(mx, my) || 1;
        const vx = (fx * -my + rx * mx) / n, vz = (fz * -my + rz * mx) / n;
        const next = new THREE.Vector3(pos.x + vx * speed * dt, 0, pos.z + vz * speed * dt);
        collide(next);
        collide(next);
        const s = surfaceAt(next.x, next.z);
        const deep = s.h < -0.35 && !s.bridge;
        const tooSteep = s.h - surfaceAt(pos.x, pos.z).h > 0.5;
        if (!deep && !tooSteep && Math.abs(next.x) < 33 && Math.abs(next.z) < 33) pos.copy(next);
        bob += dt * speed * 6;
        stepT += dt * speed;
        if (stepT > 0.75) { stepT = 0; audio.step(); }
      }
      const ground = surfaceAt(pos.x, pos.z).h;
      y += (ground + EYE - y) * Math.min(1, dt * 12);
      camera.position.set(pos.x, y + Math.sin(bob) * 0.025 * mag, pos.z);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    },
    get position() { return pos; },
  };
}
