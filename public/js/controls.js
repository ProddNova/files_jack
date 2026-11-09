import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './util.js';
import { getHeight } from './terrain.js';

// Orbit camera driven by touch: values move toward a goal, so motion feels smooth.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    const portrait = window.innerHeight > window.innerWidth;
    this.goal = { theta: 0.65, phi: 0.95, radius: portrait ? 54 : 40, tx: 0, tz: 1 };
    this.cur = { ...this.goal };
    this.target = new THREE.Vector3(1, 1, 3);
    this.targetY = 1;
  }

  rotate(dx, dy) {
    this.goal.theta -= dx * 0.0075;
    this.goal.phi = clamp(this.goal.phi - dy * 0.0055, 0.3, 1.36);
  }

  zoom(factor) {
    this.goal.radius = clamp(this.goal.radius / factor, 7, 80);
  }

  twist(angle) {
    this.goal.theta += angle;
  }

  pan(dx, dy) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const k = (2 * this.cur.radius * Math.tan(fov / 2)) / window.innerHeight;
    const th = this.cur.theta;
    const tilt = Math.min(1 / Math.max(Math.cos(this.cur.phi), 0.01), 2.6);
    const rx = Math.cos(th), rz = -Math.sin(th);
    const fx = -Math.sin(th), fz = -Math.cos(th);
    this.goal.tx += -rx * dx * k + fx * dy * k * tilt;
    this.goal.tz += -rz * dx * k + fz * dy * k * tilt;
    const d = Math.hypot(this.goal.tx, this.goal.tz);
    if (d > 30) {
      this.goal.tx *= 30 / d;
      this.goal.tz *= 30 / d;
    }
  }

  get theta() {
    return this.cur.theta;
  }

  update(dt) {
    const f = 1 - Math.exp(-dt * 12);
    for (const k of Object.keys(this.goal)) this.cur[k] += (this.goal[k] - this.cur[k]) * f;
    const { theta, phi, radius, tx, tz } = this.cur;
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
