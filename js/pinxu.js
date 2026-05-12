// Pinxu the black cat — mesh construction, drawing, zones

import { VerletBody } from './verlet.js';

// Body shape constants
const BODY_POINTS = 24;
const BODY_RX = 90;      // horizontal radius of body oval
const BODY_RY = 110;     // vertical radius (taller than wide — bean shape)
const BODY_OFFSET_Y = 0; // center y offset relative to canvas center

// Fur stroke constants
const FUR_STROKES = 80;
const FUR_LENGTH_MIN = 4;
const FUR_LENGTH_MAX = 10;

// Ear geometry (relative to body center)
const EAR_LEFT  = { ox: -55, oy: -115, tip: { dx: -25, dy: -38 }, innerDx: -18, innerDy: -24 };
const EAR_RIGHT = { ox:  55, oy: -115, tip: { dx:  25, dy: -38 }, innerDx:  18, innerDy: -24 };

// Whisker constants
const WHISKER_ANGLES = [-15, 0, 15];   // degrees per side
const WHISKER_LENGTH = 52;

// Tail Verlet chain
const TAIL_SEGMENTS = 7;
const TAIL_STIFFNESS = 0.6;

// Pre-seeded fur stroke angles for deterministic rendering
const _furAngles = [];
const _furLengths = [];
for (let i = 0; i < FUR_STROKES; i++) {
  _furAngles.push((i * 137.508 * Math.PI / 180));       // golden-angle distribution
  _furLengths.push(FUR_LENGTH_MIN + ((i * 31) % 7) / 7 * (FUR_LENGTH_MAX - FUR_LENGTH_MIN));
}

export class Pinxu {
  constructor(cx, cy) {
    this.cx = cx;
    this.cy = cy + BODY_OFFSET_Y;

    this.body = new VerletBody();
    this.tail = new VerletBody();

    this._buildBody();
    this._buildTail();
  }

  _buildBody() {
    const pts = [];
    for (let i = 0; i < BODY_POINTS; i++) {
      const angle = (i / BODY_POINTS) * Math.PI * 2 - Math.PI / 2;
      // Squash the bottom of the oval slightly for a sitting shape
      const squash = angle > 0 ? 1.08 : 1.0;
      const x = this.cx + Math.cos(angle) * BODY_RX;
      const y = this.cy + Math.sin(angle) * BODY_RY * squash;
      pts.push(this.body.addPoint(x, y));
    }
    this.bodyRing = pts;

    // Center anchor point — soft pin (not hard-pinned, spring back via constraints)
    this.centerPoint = this.body.addPoint(this.cx, this.cy, false);

    // Outer ring constraints (adjacent points)
    for (let i = 0; i < BODY_POINTS; i++) {
      this.body.addConstraint(pts[i], pts[(i + 1) % BODY_POINTS], 0.95);
    }

    // Spoke constraints: center to every ring point (keep overall shape)
    for (const p of pts) {
      this.body.addConstraint(this.centerPoint, p, 0.3);
    }

    // Cross-bracing: connect opposite points for volume preservation
    const half = BODY_POINTS / 2;
    for (let i = 0; i < half; i++) {
      this.body.addConstraint(pts[i], pts[i + half], 0.15);
    }

    // Store rest positions for soft re-anchor
    this._restPositions = pts.map(p => ({ x: p.x, y: p.y }));
    this._centerRest = { x: this.cx, y: this.cy };
  }

  _buildTail() {
    // Tail starts at the right side of the body, curls around
    const startX = this.cx + BODY_RX * 0.7;
    const startY = this.cy + BODY_RY * 0.5;

    const pts = [];
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const t = i / (TAIL_SEGMENTS - 1);
      // Curl: start going right, curl down and left
      const angle = Math.PI * 0.1 + t * Math.PI * 0.85;
      const radius = 55 - t * 10;
      const x = startX + Math.cos(-angle) * radius * t;
      const y = startY + Math.sin(-angle) * radius * t + t * 20;
      const pinned = i === 0;
      pts.push(this.tail.addPoint(x, y, pinned));
    }
    this.tailPoints = pts;

    for (let i = 0; i < TAIL_SEGMENTS - 1; i++) {
      this.tail.addConstraint(pts[i], pts[i + 1], TAIL_STIFFNESS);
    }
    this._tailRestPositions = pts.map(p => ({ x: p.x, y: p.y }));
  }

  update(dt) {
    this.body.update(dt);
    this.tail.update(dt);

    // Soft re-anchor: gently pull all points back toward rest (prevents drift)
    this._softAnchor();
  }

  _softAnchor() {
    const PULL = 0.04;
    for (let i = 0; i < this.bodyRing.length; i++) {
      const p = this.bodyRing[i];
      const r = this._restPositions[i];
      if (!p.pinned) {
        p.x += (r.x - p.x) * PULL;
        p.y += (r.y - p.y) * PULL;
      }
    }
    // Center follows body centroid
    const cp = this.centerPoint;
    cp.x += (this._centerRest.x - cp.x) * PULL;
    cp.y += (this._centerRest.y - cp.y) * PULL;

    // Tail anchor
    for (let i = 1; i < this.tailPoints.length; i++) {
      const p = this.tailPoints[i];
      const r = this._tailRestPositions[i];
      p.x += (r.x - p.x) * 0.025;
      p.y += (r.y - p.y) * 0.025;
    }
    // Keep tail root attached to body
    const tailRoot = this.tailPoints[0];
    const bodyRef = this.bodyRing[Math.floor(BODY_POINTS * 0.62)];
    tailRoot.x = bodyRef.x;
    tailRoot.y = bodyRef.y;
  }

  squishAt(px, py, radius = 80, strength = 6) {
    this.body.squishAt(px, py, radius, strength);
  }

  // Returns which zone (px, py) lands in relative to cat
  getZone(px, py) {
    const dx = px - this.cx;
    const dy = py - this.cy;

    // Normalize to unit ellipse space
    const nx = dx / BODY_RX;
    const ny = dy / BODY_RY;
    const distEllipse = Math.hypot(nx, ny);

    if (distEllipse > 1.15) return 'outside';

    // Head: top 35% of body
    if (ny < -0.35) return 'head';
    // Belly: middle 40%, wider than center
    if (ny > -0.1 && ny < 0.5 && Math.abs(nx) < 0.75) return 'belly';
    // Cheek: sides near head level
    if (ny < 0.1 && Math.abs(nx) > 0.4) return 'cheek';
    // Paws: bottom center
    if (ny > 0.55) return 'paws';

    return 'body';
  }

  draw(ctx, breathScale, time) {
    ctx.save();

    const cx = this.cx;
    const cy = this.cy;
    const ring = this.bodyRing;

    // --- Cushion ---
    this._drawCushion(ctx, cx, cy);

    // --- Tail (behind body) ---
    this._drawTail(ctx);

    // --- Body shadow ---
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#3a2010';
    this._tracePath(ctx, ring, 1.04, 8);
    ctx.fill();
    ctx.restore();

    // --- Body fill ---
    this._tracePath(ctx, ring, 1.0, 0);
    const bodyGrad = ctx.createRadialGradient(cx - 20, cy - 30, 10, cx, cy, BODY_RY * 1.1);
    bodyGrad.addColorStop(0, '#262626');
    bodyGrad.addColorStop(0.5, '#111111');
    bodyGrad.addColorStop(1, '#060606');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // --- Fur strokes around silhouette ---
    this._drawFur(ctx, ring, time);

    // --- Highlight arc (top-left light source) ---
    ctx.save();
    ctx.globalAlpha = 0.12;
    const hlGrad = ctx.createRadialGradient(cx - 30, cy - 55, 5, cx - 10, cy - 20, 75);
    hlGrad.addColorStop(0, '#ffffff');
    hlGrad.addColorStop(1, 'transparent');
    this._tracePath(ctx, ring, 1.0, 0);
    ctx.fillStyle = hlGrad;
    ctx.fill();
    ctx.restore();

    // --- Ears ---
    this._drawEars(ctx, cx, cy);

    // --- Face ---
    this._drawFace(ctx, cx, cy, time);

    // --- Front paws ---
    this._drawPaws(ctx, cx, cy);

    ctx.restore();
  }

  _tracePath(ctx, ring, scale = 1, offsetY = 0) {
    const n = ring.length;
    const cx = this.cx;
    const cy = this.cy;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const curr = ring[i];
      const next = ring[(i + 1) % n];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;

      // Apply scale from center if needed
      const cmx = cx + (midX - cx) * scale;
      const cmy = cy + (midY - cy) * scale + offsetY;
      const ccx = cx + (curr.x - cx) * scale;
      const ccy = cy + (curr.y - cy) * scale + offsetY;

      if (i === 0) ctx.moveTo(cmx, cmy);
      else ctx.quadraticCurveTo(ccx, ccy, cmx, cmy);
    }
    ctx.closePath();
  }

  _drawFur(ctx, ring, time) {
    const n = ring.length;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.8;

    for (let i = 0; i < FUR_STROKES; i++) {
      const ringIdx = i % n;
      const p = ring[ringIdx];
      const next = ring[(ringIdx + 1) % n];

      // Normal pointing outward
      const nx = (p.x + next.x) / 2;
      const ny = (p.y + next.y) / 2;
      const dx = nx - this.cx;
      const dy = ny - this.cy;
      const len = Math.hypot(dx, dy) || 1;

      const angle = _furAngles[i] + time * 0.0003 * (i % 3 === 0 ? 1 : -0.5);
      const fur = _furLengths[i];

      const outX = (dx / len) * fur;
      const outY = (dy / len) * fur;
      const rotX = outX * Math.cos(angle) - outY * Math.sin(angle);
      const rotY = outX * Math.sin(angle) + outY * Math.cos(angle);

      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx + rotX * 0.4, ny + rotY * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawEars(ctx, cx, cy) {
    for (const ear of [EAR_LEFT, EAR_RIGHT]) {
      const bx = cx + ear.ox;
      const by = cy + ear.oy;
      const tx = bx + ear.tip.dx;
      const ty = by + ear.tip.dy;

      // Outer ear
      ctx.beginPath();
      ctx.moveTo(bx - 18, by + 5);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + 18, by + 5);
      ctx.closePath();
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();

      // Inner pink
      ctx.beginPath();
      ctx.moveTo(bx - 9, by + 2);
      ctx.lineTo(bx + ear.innerDx * 0.65, by + ear.innerDy * 0.65);
      ctx.lineTo(bx + 9, by + 2);
      ctx.closePath();
      ctx.fillStyle = '#c87080';
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  _drawFace(ctx, cx, cy, time) {
    const eyeY = cy - 28;
    const eyeSpread = 22;

    // Closed eyes — upward arcs (happy default)
    ctx.save();
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const ex = cx + side * eyeSpread;
      ctx.beginPath();
      ctx.arc(ex, eyeY, 7, Math.PI + 0.4, Math.PI * 2 - 0.4, false);
      ctx.stroke();
    }
    ctx.restore();

    // Nose
    const noseX = cx;
    const noseY = cy - 10;
    ctx.beginPath();
    ctx.moveTo(noseX, noseY);
    ctx.lineTo(noseX - 5, noseY + 7);
    ctx.lineTo(noseX + 5, noseY + 7);
    ctx.closePath();
    ctx.fillStyle = '#2a1a1a';
    ctx.fill();

    // Whiskers
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    const whiskerY = cy - 5;
    const wobble = Math.sin(time * 0.001) * 1.2;

    for (const side of [-1, 1]) {
      const baseX = cx + side * 10;
      for (let i = 0; i < WHISKER_ANGLES.length; i++) {
        const deg = WHISKER_ANGLES[i] * side + wobble;
        const rad = deg * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(baseX, whiskerY);
        ctx.lineTo(baseX + Math.cos(rad) * WHISKER_LENGTH * side, whiskerY + Math.sin(rad) * WHISKER_LENGTH);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawPaws(ctx, cx, cy) {
    const pawY = cy + BODY_RY * 0.82;
    const spread = 28;

    ctx.save();
    for (const side of [-1, 1]) {
      const px = cx + side * spread;
      // Paw oval
      ctx.beginPath();
      ctx.ellipse(px, pawY, 18, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0d0d0d';
      ctx.fill();
      // Toe lines
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - 6, pawY - 3);
      ctx.lineTo(px - 6, pawY + 4);
      ctx.moveTo(px, pawY - 4);
      ctx.lineTo(px, pawY + 5);
      ctx.moveTo(px + 6, pawY - 3);
      ctx.lineTo(px + 6, pawY + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTail(ctx) {
    const pts = this.tailPoints;
    if (pts.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Tail drawn as thick tapered stroke
    for (let i = 0; i < pts.length - 1; i++) {
      const t = i / (pts.length - 1);
      const width = 14 - t * 8;
      const p = pts[i];
      const n = pts[i + 1];

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = width;
      ctx.stroke();
    }

    // Tail tip highlight
    const tip = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();

    ctx.restore();
  }

  _drawCushion(ctx, cx, cy) {
    const cushionY = cy + BODY_RY * 0.75;
    const cushionRX = BODY_RX * 1.55;
    const cushionRY = 32;

    // Shadow under cushion
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#5a3020';
    ctx.beginPath();
    ctx.ellipse(cx, cushionY + 22, cushionRX * 0.9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Cushion body
    const grad = ctx.createRadialGradient(cx, cushionY - 8, 5, cx, cushionY, cushionRX);
    grad.addColorStop(0, '#f0d0d0');
    grad.addColorStop(0.6, '#e8c5c5');
    grad.addColorStop(1, '#d4aaaa');
    ctx.beginPath();
    ctx.ellipse(cx, cushionY, cushionRX, cushionRY, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Quilted stitching lines
    ctx.save();
    ctx.strokeStyle = '#c8a8a8';
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.5;
    // Horizontal lines
    for (let row = -1; row <= 1; row++) {
      const y = cushionY + row * 10;
      const halfW = Math.sqrt(Math.max(0, 1 - (row * 10 / cushionRY) ** 2)) * cushionRX;
      ctx.beginPath();
      ctx.moveTo(cx - halfW * 0.85, y);
      ctx.lineTo(cx + halfW * 0.85, y);
      ctx.stroke();
    }
    // Vertical lines
    for (let col = -3; col <= 3; col++) {
      const x = cx + col * 28;
      const dx = col * 28;
      const halfH = Math.sqrt(Math.max(0, 1 - (dx / cushionRX) ** 2)) * cushionRY;
      ctx.beginPath();
      ctx.moveTo(x, cushionY - halfH * 0.75);
      ctx.lineTo(x, cushionY + halfH * 0.75);
      ctx.stroke();
    }
    ctx.restore();

    // Cushion rim highlight
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#f8e0e0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cushionY - 4, cushionRX * 0.85, cushionRY * 0.55, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();
  }
}
