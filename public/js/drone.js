// Drone camera: you are the camera and fly freely over the island.
//   - one finger drag: look around (like turning your head)
//   - joystick: fly forward, back and sideways; ▲ ▼: climb and descend
//     (keyboard: WASD, Space/E up, Q/C down, Shift faster)
//   - two fingers: pinch to fly toward what you look at, drag to slide,
//     twist to turn
// It keeps the same methods as the old orbit camera (rotate, pan, zoom,
// twist, target, theta...), so tools and gestures did not need to change.
// First step toward a full first-person game: the walk mode is the same
// camera standing on the ground.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp } from './util.js';
import { getHeight } from './terrain.js';

export const DRONE_FOV = 58;
const MAX_Y = 95;
const BOUND = 170;

export class DroneRig {
  constructor(camera, { topAt } = {}) {
    this.camera = camera;
    this.topAt = topAt || (() => -Infinity);
    this.goal = { x: 0, y: 30, z: 40, yaw: 0, pitch: -0.6 };
    this.cur = { ...this.goal };
    this.target = new THREE.Vector3(0, 1, 1);
    this.vel = new THREE.Vector3();
    this.stick = { x: 0, y: 0, up: 0 };
    this.spin = { yaw: 0, pitch: 0, px: 0, py: 0, on: false };
    this.track = { yaw: 0, pitch: 0, px: 0, py: 0, t: 0 };
    this.keys = new Set();
    this.enabled = true;
    this._fwd = new THREE.Vector3();
    this.home();
    Object.assign(this.cur, this.goal);
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.closest?.('input, textarea')) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // Point the drone at (tx, tz) from a distance, tilted like a classic overview:
  // farther away means looking more steeply down.
  frame(tx, tz, radius, theta = this.goal.yaw) {
    const phi = lerp(1.2, 0.8, clamp((radius - 7) / 73, 0, 1) ** 0.7);
    const ty = Math.max(getHeight(tx, tz), 0) + 0.6;
    this.goal.x = tx + radius * Math.sin(phi) * Math.sin(theta);
    this.goal.y = ty + radius * Math.cos(phi);
    this.goal.z = tz + radius * Math.sin(phi) * Math.cos(theta);
    this.goal.yaw = this.cur.yaw + angleTo(this.cur.yaw, theta);
    this.goal.pitch = -(Math.PI / 2 - phi);
  }

  home() {
    this.frame(0, 1, window.innerHeight > window.innerWidth ? 54 : 40, 0.65);
  }

  // Put the drone at a given spot (used when leaving the walk mode).
  setPose(pos, yaw, pitch) {
    this.goal.x = this.cur.x = pos.x;
    this.goal.y = this.cur.y = pos.y;
    this.goal.z = this.cur.z = pos.z;
    this.goal.yaw = this.cur.yaw = yaw;
    this.goal.pitch = this.cur.pitch = pitch;
    this.vel.set(0, 0, 0);
  }

  _track(kind, a, b) {
    const now = performance.now();
    const dt = Math.max(now - this.track.t, 8);
    const k = Math.min(16 / dt, 2) * 0.5;
    if (kind === 'r') {
      this.track.yaw = this.track.yaw * 0.5 + a * k;
      this.track.pitch = this.track.pitch * 0.5 + b * k;
    } else {
      this.track.px = this.track.px * 0.5 + a * k;
      this.track.py = this.track.py * 0.5 + b * k;
    }
    this.track.t = now;
  }

  // Look around: finger right = turn right, finger up = look up
  rotate(dx, dy, track = true) {
    this.goal.yaw -= dx * 0.0042;
    this.goal.pitch = clamp(this.goal.pitch - dy * 0.0036, -1.48, 0.75);
    if (track) this._track('r', dx, dy);
  }

  twist(angle) {
    this.goal.yaw += angle;
  }

  // Distance to what is in the middle of the screen (or a sensible guess)
  _focusDist() {
    const d = this.camera.position.distanceTo(this.target);
    return clamp(Number.isFinite(d) ? d : 20, 3, 120);
  }

  // Two-finger drag: grab the ground and slide it, like a map
  pan(dx, dy, track = true) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const k = (2 * this._focusDist() * Math.tan(fov / 2)) / window.innerHeight;
    const y = this.cur.yaw;
    const rx = Math.cos(y), rz = -Math.sin(y);
    const fx = -Math.sin(y), fz = -Math.cos(y);
    const tilt = Math.min(1 / Math.max(Math.abs(Math.sin(this.cur.pitch)), 0.35), 2.4);
    this.goal.x += -rx * dx * k + fx * dy * k * tilt;
    this.goal.z += -rz * dx * k + fz * dy * k * tilt;
    if (track) this._track('p', dx, dy);
  }

  // Pinch: fly toward (or away from) what you look at
  zoom(factor) {
    const dist = this._focusDist();
    let step = dist * (1 - 1 / factor);
    if (step > 0) step = Math.min(step, dist - 2);
    const f = this._forward();
    this.goal.x += f.x * step;
    this.goal.y += f.y * step;
    this.goal.z += f.z * step;
  }

  _forward() {
    const { yaw, pitch } = this.goal;
    return this._fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  // Joystick: x right, y down (screen style), up = climb
  setStick(x, y) { this.stick.x = x; this.stick.y = y; }
  setLift(v) { this.stick.up = v; }

  release() {
    const t = this.track;
    if (performance.now() - t.t < 90) Object.assign(this.spin, { yaw: t.yaw, pitch: t.pitch, px: t.px, py: t.py, on: true });
    this.track = { yaw: 0, pitch: 0, px: 0, py: 0, t: 0 };
  }

  stop() {
    this.spin.on = false;
    this.track = { yaw: 0, pitch: 0, px: 0, py: 0, t: 0 };
  }

  recenter() {
    this.stop();
    this.vel.set(0, 0, 0);
    this.home();
  }

  get theta() { return this.cur.yaw; }
  get phi() { return Math.PI / 2 + this.cur.pitch; }
  get altitude() { return this.cur.y - Math.max(getHeight(this.cur.x, this.cur.z), 0); }

  // Lowest height the drone may fly at here: over ground, sea and roofs
  _floor(x, z) {
    return Math.max(getHeight(x, z), 0, this.topAt(x, z)) + 0.55;
  }

  _updateTarget() {
    // March along the view ray until it goes under the ground
    const cam = this.camera;
    const f = this._fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const p = cam.position;
    let t = 0, step = 0.6, hit = -1;
    for (let i = 0; i < 90 && t < 220; i++) {
      t += step;
      const x = p.x + f.x * t, y = p.y + f.y * t, z = p.z + f.z * t;
      if (y < Math.max(getHeight(x, z), 0)) { hit = t; break; }
      step = Math.min(step * 1.08, 4);
    }
    if (hit < 0) {
      // Looking at the sky: pretend the focus is a little ahead, at ground level
      const d = 25;
      this.target.set(p.x + f.x * d, Math.max(getHeight(p.x + f.x * d, p.z + f.z * d), 0), p.z + f.z * d);
      return;
    }
    let a = hit - step, b = hit;
    for (let i = 0; i < 6; i++) {
      const m = (a + b) / 2;
      const y = p.y + f.y * m;
      if (y < Math.max(getHeight(p.x + f.x * m, p.z + f.z * m), 0)) b = m; else a = m;
    }
    this.target.set(p.x + f.x * b, p.y + f.y * b, p.z + f.z * b);
  }

  update(dt) {
    const g = this.goal;
    // Inertia after a flick
    if (this.spin.on) {
      const s = this.spin, f = dt * 60;
      if (Math.abs(s.yaw) + Math.abs(s.pitch) > 0.05) this.rotate(s.yaw * f, s.pitch * f * 0.5, false);
      if (Math.abs(s.px) + Math.abs(s.py) > 0.05) this.pan(s.px * f, s.py * f, false);
      const decay = Math.exp(-dt * 5);
      s.yaw *= decay; s.pitch *= decay; s.px *= decay; s.py *= decay;
      if (Math.abs(s.yaw) + Math.abs(s.pitch) + Math.abs(s.px) + Math.abs(s.py) < 0.05) s.on = false;
    }

    // Joystick and keyboard: speed grows with height, so far views move fast
    let mx = this.stick.x, my = this.stick.y, up = this.stick.up;
    const K = this.keys;
    if (K.has('w') || K.has('arrowup')) my -= 1;
    if (K.has('s') || K.has('arrowdown')) my += 1;
    if (K.has('a') || K.has('arrowleft')) mx -= 1;
    if (K.has('d') || K.has('arrowright')) mx += 1;
    if (K.has(' ') || K.has('e')) up += 1;
    if (K.has('q') || K.has('c')) up -= 1;
    const alt = Math.max(this.altitude, 0);
    const speed = clamp(3.5 + alt * 0.5, 3.5, 28) * (K.has('shift') && (mx || my) ? 1.8 : 1);
    const y = g.yaw;
    const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const want = new THREE.Vector3(
      (fx * -my + rx * mx) * speed,
      clamp(up, -1, 1) * clamp(3 + alt * 0.35, 3, 14),
      (fz * -my + rz * mx) * speed,
    );
    this.vel.lerp(want, 1 - Math.exp(-dt * 4));
    if (this.vel.lengthSq() > 1e-6) {
      g.x += this.vel.x * dt;
      g.y += this.vel.y * dt;
      g.z += this.vel.z * dt;
    }

    // Stay inside the world, above the ground and the roofs
    const r = Math.hypot(g.x, g.z);
    if (r > BOUND) { g.x *= BOUND / r; g.z *= BOUND / r; }
    g.y = clamp(g.y, this._floor(g.x, g.z), MAX_Y);

    const fp = 1 - Math.exp(-dt * 9), fr = 1 - Math.exp(-dt * 14);
    const c = this.cur;
    c.x += (g.x - c.x) * fp;
    c.y += (g.y - c.y) * fp;
    c.z += (g.z - c.z) * fp;
    c.yaw += (g.yaw - c.yaw) * fr;
    c.pitch += (g.pitch - c.pitch) * fr;
    c.y = Math.max(c.y, this._floor(c.x, c.z));

    const cam = this.camera;
    cam.position.set(c.x, c.y, c.z);
    cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    this._updateTarget();
  }
}

function angleTo(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
