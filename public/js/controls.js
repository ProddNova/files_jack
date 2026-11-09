import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp } from './util.js';
import { getHeight } from './terrain.js';

const MIN_R = 7, MAX_R = 80;

// Orbit camera for touch. Values glide toward a goal, so motion feels smooth.
// Zooming in also lowers the camera, so close views look across the village
// and far views look down on the island: one less gesture to learn.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.home = { theta: 0.65, radius: window.innerHeight > window.innerWidth ? 54 : 40, tx: 0, tz: 1, tilt: 0 };
    this.goal = { ...this.home };
    this.cur = { ...this.goal };
    this.target = new THREE.Vector3(0, 1, 1);
    this.targetY = 1;
    this.vel = { rx: 0, ry: 0, px: 0, py: 0, on: false };
    this.track = { rx: 0, ry: 0, px: 0, py: 0, t: 0 };
  }

  basePhi(radius) {
    return lerp(1.2, 0.8, clamp((radius - MIN_R) / (MAX_R - MIN_R), 0, 1) ** 0.7);
  }

  _track(kind, dx, dy) {
    const now = performance.now();
    const dt = Math.max(now - this.track.t, 8);
    const k = Math.min(16 / dt, 2);
    const a = 0.5;
    if (kind === 'r') {
      this.track.rx = this.track.rx * (1 - a) + dx * k * a;
      this.track.ry = this.track.ry * (1 - a) + dy * k * a;
    } else {
      this.track.px = this.track.px * (1 - a) + dx * k * a;
      this.track.py = this.track.py * (1 - a) + dy * k * a;
    }
    this.track.t = now;
  }

  rotate(dx, dy, track = true) {
    this.goal.theta -= dx * 0.0075;
    const phi = this.basePhi(this.goal.radius) + this.goal.tilt;
    const np = clamp(phi - dy * 0.0055, 0.3, 1.4);
    this.goal.tilt = np - this.basePhi(this.goal.radius);
    if (track) this._track('r', dx, dy);
  }

  zoom(factor) {
    this.goal.radius = clamp(this.goal.radius / factor, MIN_R, MAX_R);
  }

  twist(angle) {
    this.goal.theta += angle;
  }

  pan(dx, dy, track = true) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const k = (2 * this.cur.radius * Math.tan(fov / 2)) / window.innerHeight;
    const th = this.cur.theta;
    const tilt = Math.min(1 / Math.max(Math.cos(this.phi), 0.01), 2.6);
    const rx = Math.cos(th), rz = -Math.sin(th);
    const fx = -Math.sin(th), fz = -Math.cos(th);
    this.goal.tx += -rx * dx * k + fx * dy * k * tilt;
    this.goal.tz += -rz * dx * k + fz * dy * k * tilt;
    const d = Math.hypot(this.goal.tx, this.goal.tz);
    if (d > 30) {
      this.goal.tx *= 30 / d;
      this.goal.tz *= 30 / d;
    }
    if (track) this._track('p', dx, dy);
  }

  // Keeps sliding for a moment after the finger lifts.
  release() {
    if (performance.now() - this.track.t < 90) {
      this.vel = { rx: this.track.rx, ry: this.track.ry, px: this.track.px, py: this.track.py, on: true };
    }
    this.track = { rx: 0, ry: 0, px: 0, py: 0, t: 0 };
  }

  stop() {
    this.vel.on = false;
    this.track = { rx: 0, ry: 0, px: 0, py: 0, t: 0 };
  }

  recenter() {
    this.stop();
    this.goal = { ...this.home, theta: this.goal.theta };
  }

  get theta() {
    return this.cur.theta;
  }

  get phi() {
    return clamp(this.basePhi(this.cur.radius) + this.cur.tilt, 0.3, 1.4);
  }

  update(dt) {
    if (this.vel.on) {
      const v = this.vel;
      const f = dt * 60;
      if (Math.abs(v.rx) + Math.abs(v.ry) > 0.05) this.rotate(v.rx * f, v.ry * f * 0.5, false);
      if (Math.abs(v.px) + Math.abs(v.py) > 0.05) this.pan(v.px * f, v.py * f, false);
      const decay = Math.exp(-dt * 5);
      v.rx *= decay; v.ry *= decay; v.px *= decay; v.py *= decay;
      if (Math.abs(v.rx) + Math.abs(v.ry) + Math.abs(v.px) + Math.abs(v.py) < 0.05) v.on = false;
    }
    const f = 1 - Math.exp(-dt * 12);
    for (const k of Object.keys(this.goal)) this.cur[k] += (this.goal[k] - this.cur[k]) * f;
    const { theta, radius, tx, tz } = this.cur;
    const phi = this.phi;
    const groundY = Math.max(getHeight(tx, tz), 0) + 0.6;
    this.targetY += (groundY - this.targetY) * (1 - Math.exp(-dt * 4));
    this.target.set(tx, this.targetY, tz);
    const cam = this.camera;
    cam.position.set(
      tx + radius * Math.sin(phi) * Math.sin(theta),
      this.targetY + radius * Math.cos(phi),
      tz + radius * Math.sin(phi) * Math.cos(theta),
    );
    const floor = Math.max(getHeight(cam.position.x, cam.position.z), 0) + 1.2;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(this.target);
  }
}
