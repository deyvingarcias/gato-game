// Particle system — hearts and fur tufts
// Phase 1: pool initialized, spawn/update/draw implemented for Phase 2+

const MAX_PARTICLES = 30;
const HEART_LIFETIME = 2000;

class Particle {
  constructor() { this.active = false; }

  init(x, y, type) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 1.2;
    this.vy = -1.5 - Math.random() * 1.0;
    this.type = type;        // 'heart' | 'fur'
    this.life = 0;
    this.maxLife = HEART_LIFETIME;
    this.scale = 0.5 + Math.random() * 0.5;
    this.rotation = Math.random() * Math.PI * 2;
    this.active = true;
  }
}

export class ParticleSystem {
  constructor() {
    this._pool = Array.from({ length: MAX_PARTICLES }, () => new Particle());
  }

  spawn(x, y, type = 'heart') {
    const p = this._pool.find(p => !p.active);
    if (p) p.init(x, y, type);
  }

  update(dt) {
    const dtMs = dt * 1000;
    for (const p of this._pool) {
      if (!p.active) continue;
      p.life += dtMs;
      if (p.life >= p.maxLife) { p.active = false; continue; }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.015;            // slight gravity
      p.rotation += 0.02;
    }
  }

  draw(ctx) {
    for (const p of this._pool) {
      if (!p.active) continue;
      const alpha = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(p.scale, p.scale);
      if (p.type === 'heart') this._drawHeart(ctx);
      ctx.restore();
    }
  }

  _drawHeart(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.bezierCurveTo(-8, -14, -18, -5, 0, 5);
    ctx.bezierCurveTo(18, -5, 8, -14, 0, -5);
    ctx.closePath();
    ctx.fillStyle = '#ff85a1';
    ctx.fill();
  }
}
