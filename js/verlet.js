// Verlet integration soft-body physics engine

const GRAVITY = 0;          // no gravity — cat sits on cushion
const ITERATIONS = 8;       // constraint solve passes per frame
const DAMPING = 0.98;       // velocity retention (high = sluggish fat, low = bouncy)

export class Point {
  constructor(x, y, pinned = false) {
    this.x = x;
    this.y = y;
    this.oldX = x;
    this.oldY = y;
    this.pinned = pinned;
    this.mass = 1;
  }

  applyImpulse(dx, dy) {
    if (this.pinned) return;
    this.oldX -= dx;
    this.oldY -= dy;
  }

  integrate(dt) {
    if (this.pinned) return;
    const vx = (this.x - this.oldX) * DAMPING;
    const vy = (this.y - this.oldY) * DAMPING + GRAVITY * dt * dt;
    this.oldX = this.x;
    this.oldY = this.y;
    this.x += vx;
    this.y += vy;
  }
}

export class Constraint {
  constructor(p1, p2, stiffness = 1) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    this.stiffness = stiffness;
  }

  satisfy() {
    const dx = this.p2.x - this.p1.x;
    const dy = this.p2.y - this.p1.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const diff = (dist - this.restLength) / dist * this.stiffness;
    const ox = dx * diff * 0.5;
    const oy = dy * diff * 0.5;

    if (!this.p1.pinned) { this.p1.x += ox; this.p1.y += oy; }
    if (!this.p2.pinned) { this.p2.x -= ox; this.p2.y -= oy; }
  }
}

export class VerletBody {
  constructor() {
    this.points = [];
    this.constraints = [];
  }

  addPoint(x, y, pinned = false) {
    const p = new Point(x, y, pinned);
    this.points.push(p);
    return p;
  }

  addConstraint(p1, p2, stiffness = 1) {
    const c = new Constraint(p1, p2, stiffness);
    this.constraints.push(c);
    return c;
  }

  update(dt) {
    for (const p of this.points) p.integrate(dt);
    for (let i = 0; i < ITERATIONS; i++) {
      for (const c of this.constraints) c.satisfy();
    }
  }

  // Apply outward impulse to points near (px, py) within radius
  squishAt(px, py, radius, strength) {
    for (const p of this.points) {
      const dx = p.x - px;
      const dy = p.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist > 0.001) {
        const force = (1 - dist / radius) * strength;
        p.applyImpulse((dx / dist) * force, (dy / dist) * force);
      }
    }
  }
}
