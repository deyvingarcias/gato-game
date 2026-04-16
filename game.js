/* global Matter */
const { Engine, Render, Runner, Bodies, Body, Composite, Constraint, Events, Common } = Matter;

// DOM
const canvas = document.getElementById('gameCanvas');
const lifeText = document.getElementById('lifeText');
const lifeBar = document.getElementById('lifeBar');
const gameOverEl = document.getElementById('gameOver');
const restartBtn = document.getElementById('restartBtn');
const muteBtn = document.getElementById('muteBtn');

// Engine
const engine = Engine.create({
  enableSleeping: false,
  positionIterations: 10,
  velocityIterations: 8,
  constraintIterations: 4
});
engine.gravity.y = 1.0;
const world = engine.world;

const render = Render.create({
  canvas,
  engine,
  options: {
    width: window.innerWidth,
    height: window.innerHeight,
    wireframes: false,
    background: 'transparent',
    pixelRatio: window.devicePixelRatio || 1
  }
});
Render.run(render);
Runner.run(Runner.create(), engine);

// Constants
const LIFE_MAX = 3000;
const WALL_THICK = 30;
const WALL_X_RATIO = 0.52;
const GAP_RATIO = 0.093;
const CAT_X_RATIO = 0.20;
const CAT_Y_RATIO = 0.45;
const CAT_SCALE = 2.0;

const C = {
  outline: '#05040A',
  body: '#171429',
  body2: '#262044',
  belly: '#1F1938',
  ear: '#302955',
  eye: '#FFD24A',
  eye2: '#FFF6C9',
  pupil: '#170E00',
  nose: '#D07A8B',
  tongue: '#FF6C92',
  blood: '#A80018',
  bone: '#EDE8D5',
  boneDk: '#C8C0A0'
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => Common.random(a, b);

function wallParams() {
  const W = window.innerWidth, H = window.innerHeight;
  const wx = Math.round(W * WALL_X_RATIO);
  const gapH = clamp(Math.round(H * GAP_RATIO), 60, 88);
  const gapY = Math.round(H * 0.5);
  return { W, H, wx, gapH, gapY, top: gapY - gapH / 2, bot: gapY + gapH / 2 };
}

// Audio
let soundEnabled = true;
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  return audioCtx;
}
function tone(freq, type, dur, vol, freqEnd) {
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.01);
  } catch (e) {}
}
const snd = {
  hurt: () => tone(170, 'sawtooth', 0.11, 0.18, 70),
  squish: () => tone(115, 'square', 0.16, 0.15, 48),
  crack: () => { tone(320, 'sawtooth', 0.04, 0.22, 80); tone(620, 'square', 0.03, 0.14, 190); },
  spawn: () => { tone(440, 'sine', 0.06, 0.12, 860); setTimeout(() => tone(660, 'sine', 0.07, 0.10), 70); },
  death: () => { tone(260, 'sawtooth', 0.12, 0.2); setTimeout(() => tone(120, 'square', 0.22, 0.18), 120); }
};

muteBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  muteBtn.textContent = soundEnabled ? '🔊 Sonido' : '🔇 Silencio';
});

// Pixel art helpers
function makeCanvas(w, h, drawFn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  drawFn(g, w, h);
  return c;
}
function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function ellipseMask(g, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(g, x, y, 1, 1, color);
    }
  }
}

function makeHead() {
  return makeCanvas(58, 58, (g) => {
    // ears
    px(g, 13, 7, 7, 10, C.outline); px(g, 38, 7, 7, 10, C.outline);
    px(g, 15, 9, 3, 5, C.ear); px(g, 40, 9, 3, 5, C.ear);
    // head outline and fill
    ellipseMask(g, 29, 31, 19, 18, C.outline);
    ellipseMask(g, 29, 31, 16, 15, C.body);
    ellipseMask(g, 29, 34, 11, 8, C.body2);
    ellipseMask(g, 29, 37, 7, 5, C.belly);

    // cheeks / snout
    ellipseMask(g, 22, 33, 4, 3, C.body2);
    ellipseMask(g, 36, 33, 4, 3, C.body2);

    // eyes
    px(g, 19, 25, 5, 6, C.eye); px(g, 34, 25, 5, 6, C.eye);
    px(g, 20, 26, 2, 2, C.eye2); px(g, 35, 26, 2, 2, C.eye2);
    px(g, 21, 27, 1, 2, C.pupil); px(g, 36, 27, 1, 2, C.pupil);

    // nose / mouth
    px(g, 28, 31, 3, 2, C.nose);
    px(g, 27, 33, 1, 1, C.outline); px(g, 29, 33, 1, 1, C.outline);
    px(g, 28, 34, 1, 2, C.outline);

    // outline touchups
    px(g, 10, 18, 2, 10, C.outline); px(g, 46, 18, 2, 10, C.outline);
    px(g, 16, 43, 26, 3, C.outline);
  });
}

function makeBody() {
  return makeCanvas(80, 62, (g) => {
    // outer shell
    ellipseMask(g, 40, 31, 30, 21, C.outline);
    ellipseMask(g, 40, 31, 27, 18, C.body);
    ellipseMask(g, 40, 33, 21, 13, C.body2);
    ellipseMask(g, 40, 37, 14, 9, C.belly);

    // plump side shading
    ellipseMask(g, 29, 31, 7, 10, C.body2);
    ellipseMask(g, 51, 31, 7, 10, C.body2);
    // bottom fluff
    ellipseMask(g, 40, 42, 15, 6, C.body2);
    // highlight belly
    ellipseMask(g, 40, 40, 10, 5, C.belly);
  });
}

function makeLeg() {
  return makeCanvas(24, 36, (g) => {
    // thick stubby leg
    ellipseMask(g, 12, 15, 6, 11, C.outline);
    ellipseMask(g, 12, 16, 4, 9, C.body);
    ellipseMask(g, 12, 24, 5, 4, C.body2);
    ellipseMask(g, 12, 29, 7, 4, C.outline);
    ellipseMask(g, 12, 30, 5, 2, C.body);
    // paw
    px(g, 6, 30, 12, 4, C.outline);
    px(g, 7, 31, 10, 2, C.body);
  });
}

function makeTail() {
  return makeCanvas(52, 26, (g) => {
    ellipseMask(g, 9, 14, 7, 5, C.outline);
    ellipseMask(g, 11, 14, 5, 3, C.body);
    ellipseMask(g, 20, 12, 7, 5, C.outline);
    ellipseMask(g, 22, 12, 5, 3, C.body);
    ellipseMask(g, 31, 10, 7, 5, C.outline);
    ellipseMask(g, 33, 10, 5, 3, C.body);
    ellipseMask(g, 42, 8, 6, 5, C.outline);
    ellipseMask(g, 43, 8, 4, 3, C.body);
  });
}

function makeBoneFragSprite() {
  return makeCanvas(12, 8, (g) => {
    px(g, 1, 2, 8, 4, C.outline);
    px(g, 2, 3, 6, 2, C.bone);
    px(g, 1, 1, 8, 1, C.boneDk);
  });
}

const SPRITES = {
  head: makeHead(),
  body: makeBody(),
  leg: makeLeg(),
  tail: makeTail(),
  bone: makeBoneFragSprite()
};

// State
let catParts = [];
let catConstraints = [];
let staticBodies = [];
let blood = [];
let dust = [];
let stains = [];
let boneFrags = [];
let life = LIFE_MAX;
let catAlive = true;
let failHandled = false;
let pressure = 0;
let squeeze = 0;
let shakeX = 0;
let shakeY = 0;
let lastHitAt = 0;
let flashAlpha = 0;
let deathFlash = 0;
let spawnTimer = 0;
let killCount = 0;
let slowFrames = 0;
let tongueOut = false;

const ptr = { x: 200, y: 400, down: false };
const grabAnchor = Bodies.circle(200, 400, 4, { isStatic: true, isSensor: true, render: { visible: false } });
Composite.add(world, grabAnchor);
let grabConstraint = null;
let grabbedBody = null;

function buildArena() {
  staticBodies.forEach(b => Composite.remove(world, b, true));
  staticBodies = [];
  const { W, H, wx, top, bot } = wallParams();
  const s = { isStatic: true, friction: 0.35, restitution: 0.1, render: { visible: false } };
  staticBodies = [
    Bodies.rectangle(W / 2, H + 45, W + 300, 90, s),
    Bodies.rectangle(W / 2, -45, W + 300, 90, s),
    Bodies.rectangle(-45, H / 2, 90, H + 300, s),
    Bodies.rectangle(W + 45, H / 2, 90, H + 300, s),
    Bodies.rectangle(wx, top / 2, WALL_THICK, top, s),
    Bodies.rectangle(wx, bot + (H - bot) / 2, WALL_THICK, H - bot, s)
  ];
  Composite.add(world, staticBodies);
}

function buildCat() {
  catParts.forEach(b => Composite.remove(world, b, true));
  catConstraints.forEach(c => Composite.remove(world, c, true));
  catParts = [];
  catConstraints = [];

  const W = window.innerWidth, H = window.innerHeight;
  const cx = W * CAT_X_RATIO;
  const cy = H * CAT_Y_RATIO;
  const G = Body.nextGroup(true);

  function circ(x, y, r, d = 0.006) {
    const b = Bodies.circle(x, y, r, {
      collisionFilter: { group: G },
      density: d,
      friction: 0.92,
      frictionAir: 0.022,
      restitution: 0.05,
      render: { visible: false }
    });
    catParts.push(b); Composite.add(world, b); return b;
  }
  function box(x, y, w, h, angle = 0, d = 0.003) {
    const b = Bodies.rectangle(x, y, w, h, {
      collisionFilter: { group: G },
      angle,
      chamfer: { radius: Math.min(w, h) * 0.45 },
      density: d,
      friction: 0.92,
      frictionAir: 0.024,
      restitution: 0.04,
      render: { visible: false }
    });
    catParts.push(b); Composite.add(world, b); return b;
  }

  // Compact, chunky body placement so it reads as a fat 2D cat.
  const head = circ(cx + 0, cy - 28, 26, 0.005);
  const body = circ(cx + 0, cy + 8, 42, 0.008);
  const hip = circ(cx + 0, cy + 34, 26, 0.004);

  const fla = box(cx - 18, cy + 18, 16, 24, -0.08, 0.003);
  const flb = box(cx - 18, cy + 39, 14, 18, 0.0, 0.002);
  const fra = box(cx + 18, cy + 18, 16, 24, 0.08, 0.003);
  const frb = box(cx + 18, cy + 39, 14, 18, 0.0, 0.002);

  const hla = box(cx - 14, cy + 28, 16, 24, -0.04, 0.003);
  const hlb = box(cx - 14, cy + 48, 14, 18, 0.0, 0.002);
  const hra = box(cx + 14, cy + 28, 16, 24, 0.04, 0.003);
  const hrb = box(cx + 14, cy + 48, 14, 18, 0.0, 0.002);

  const t1 = box(cx + 31, cy + 10, 12, 28, -0.45, 0.001);
  const t2 = box(cx + 42, cy - 2, 10, 22, -1.05, 0.0008);

  catParts.head = head;
  catParts.body = body;
  catParts.hip = hip;
  catParts.fla = fla;
  catParts.flb = flb;
  catParts.fra = fra;
  catParts.frb = frb;
  catParts.hla = hla;
  catParts.hlb = hlb;
  catParts.hra = hra;
  catParts.hrb = hrb;
  catParts.t1 = t1;
  catParts.t2 = t2;

  function joint(a, b, ax, ay, bx, by, st = 0.88) {
    const c = Constraint.create({
      bodyA: a,
      pointA: { x: ax, y: ay },
      bodyB: b,
      pointB: { x: bx, y: by },
      stiffness: st,
      length: 0,
      render: { visible: false }
    });
    catConstraints.push(c); Composite.add(world, c);
  }

  joint(body, head, 0, -28, 0, 22, 0.92);
  joint(body, hip, 0, 26, 0, -18, 0.84);
  joint(body, fla, -22, 12, 0, -8, 0.82);
  joint(fla, flb, 0, 10, 0, -8, 0.68);
  joint(body, fra, 22, 12, 0, -8, 0.82);
  joint(fra, frb, 0, 10, 0, -8, 0.68);
  joint(hip, hla, -12, 14, 0, -8, 0.78);
  joint(hla, hlb, 0, 10, 0, -8, 0.66);
  joint(hip, hra, 12, 14, 0, -8, 0.78);
  joint(hra, hrb, 0, 10, 0, -8, 0.66);
  joint(body, t1, 28, 14, 0, -12, 0.45);
  joint(t1, t2, 0, 12, 0, -10, 0.40);

  [body, head, hip].forEach(b => Body.setAngularVelocity(b, rand(-0.03, 0.03)));
}

function updateUI() {
  life = clamp(life, 0, LIFE_MAX);
  const pct = life / LIFE_MAX;
  lifeText.textContent = `${Math.round(pct * 100)}%`;
  lifeBar.style.width = `${pct * 100}%`;
}

function resetGame() {
  life = LIFE_MAX;
  catAlive = true;
  failHandled = false;
  pressure = 0;
  squeeze = 0;
  shakeX = 0;
  shakeY = 0;
  lastHitAt = 0;
  flashAlpha = 0;
  deathFlash = 0;
  spawnTimer = 0;
  killCount = 0;
  slowFrames = 0;
  tongueOut = false;
  blood = [];
  dust = [];
  stains = [];
  boneFrags = [];
  gameOverEl.style.display = 'none';
  endGrab();
  buildArena();
  buildCat();
  updateUI();
  ptr.x = window.innerWidth * 0.18;
  ptr.y = window.innerHeight * 0.5;
  Body.setPosition(grabAnchor, { x: ptr.x, y: ptr.y });
  engine.timing.timeScale = 1.0;
}

function spawnNewCat() {
  life = LIFE_MAX;
  catAlive = true;
  failHandled = false;
  pressure = 0;
  squeeze = 0;
  blood = [];
  dust = [];
  flashAlpha = 0;
  deathFlash = 0;
  tongueOut = false;
  endGrab();
  buildCat();
  updateUI();
  engine.timing.timeScale = 1.0;
  snd.spawn();
}

function startGrab() {
  if (!catAlive || grabConstraint) return;
  let best = null;
  let bestD = Infinity;
  for (const b of catParts) {
    const bx = b.position.x, by = b.position.y;
    const d = (ptr.x - bx) ** 2 + (ptr.y - by) ** 2;
    const r = (b.circleRadius || 20) + 22;
    if (d < r * r && d < bestD) { best = b; bestD = d; }
  }
  if (!best) return;
  grabbedBody = best;
  Body.setPosition(grabAnchor, { x: ptr.x, y: ptr.y });
  grabConstraint = Constraint.create({
    bodyA: grabAnchor,
    bodyB: grabbedBody,
    length: 0,
    stiffness: 0.2,
    damping: 0.06,
    render: { visible: false }
  });
  Composite.add(world, grabConstraint);
}
function endGrab() {
  if (grabConstraint) {
    Composite.remove(world, grabConstraint, true);
    grabConstraint = null;
  }
  grabbedBody = null;
}

function ptrPos(ev) {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  ptr.x = (ev.clientX - r.left) * (canvas.width / r.width) / dpr;
  ptr.y = (ev.clientY - r.top) * (canvas.height / r.height) / dpr;
}
canvas.addEventListener('pointerdown', (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  ptr.down = true;
  ptrPos(ev);
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  else if (!audioCtx) getAudioCtx();
  startGrab();
});
canvas.addEventListener('pointermove', (ev) => ptrPos(ev));
canvas.addEventListener('pointerup', () => { ptr.down = false; endGrab(); });
canvas.addEventListener('pointercancel', () => { ptr.down = false; endGrab(); });

function spawnBlood(x, y, n = 10, spd = 1) {
  for (let i = 0; i < n; i++) blood.push({
    x, y,
    vx: rand(-3.0, 3.0) * spd,
    vy: rand(-4.0, 0.8) * spd,
    life: rand(22, 60),
    r: rand(2, 6),
    stained: false
  });
}
function spawnDust(x, y, n = 5) {
  for (let i = 0; i < n; i++) dust.push({
    x, y,
    vx: rand(-2.0, 2.0),
    vy: rand(-2.2, 0.6),
    life: rand(14, 30),
    r: rand(1.5, 3.5)
  });
}
function spawnStain(x, y, r) {
  stains.push({ x, y, r: rand(r * 0.7, r * 1.8), a: rand(0.2, 0.65), stretch: rand(0.5, 1.6) });
}
function spawnBoneFrag(x, y, n = 2) {
  for (let i = 0; i < n; i++) boneFrags.push({
    x, y,
    vx: rand(-3.5, 3.5),
    vy: rand(-4.5, -1.0),
    life: rand(40, 80),
    rot: rand(0, Math.PI * 2),
    vr: rand(-0.2, 0.2)
  });
}

function getDeform(body) {
  const spd = Math.hypot(body.velocity.x, body.velocity.y);
  const stretch = Math.min(spd / 18, 0.55) + squeeze * 0.32;
  const ang = Math.atan2(body.velocity.y, body.velocity.x) - body.angle;
  const ax = Math.cos(ang);
  const lat = Math.sin(ang);
  return {
    sx: clamp(1 + ax * stretch * 0.65 - Math.abs(lat) * stretch * 0.16, 0.65, 2.1),
    sy: clamp(1 - ax * stretch * 0.45 + Math.abs(lat) * stretch * 0.42, 0.65, 2.4)
  };
}

function doCatDeath() {
  killCount++;
  snd.death();
  deathFlash = 1;
  const main = catParts.body;
  if (main) {
    const tx = main.position.x, ty = main.position.y;
    spawnBlood(tx, ty, 70, 3.0);
    spawnDust(tx, ty, 20);
    spawnBoneFrag(tx, ty, 7);
  }
  catParts.forEach(b => {
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    Body.setStatic(b, true);
  });
  spawnTimer = 110;
}

Events.on(engine, 'beforeUpdate', () => {
  if (spawnTimer > 0) {
    spawnTimer--;
    deathFlash = lerp(deathFlash, 0, 0.04);
    if (spawnTimer === 0) spawnNewCat();
    return;
  }
  if (!catAlive) return;

  if (slowFrames > 0) {
    slowFrames--;
    engine.timing.timeScale = lerp(engine.timing.timeScale, 1, 0.05);
  } else {
    engine.timing.timeScale = lerp(engine.timing.timeScale, 1, 0.16);
  }

  Body.setPosition(grabAnchor, { x: ptr.x, y: ptr.y });
  Body.setVelocity(grabAnchor, { x: 0, y: 0 });

  const { wx, top, bot } = wallParams();
  let p = 0, sq = 0;
  for (const b of catParts) {
    const near = Math.abs(b.position.x - wx) < 30;
    const inGap = b.position.y >= top && b.position.y <= bot;
    if (near && !inGap) {
      p++;
      sq = Math.max(sq, 1 - Math.abs(b.position.x - wx) / 30);
    }
  }
  pressure = lerp(pressure, clamp(p / 5, 0, 1), 0.12);
  squeeze = lerp(squeeze, sq, 0.14);

  if (pressure > 0.2) {
    shakeX = lerp(shakeX, rand(-6, 6) * pressure, 0.2);
    shakeY = lerp(shakeY, rand(-3, 3) * pressure, 0.2);
  } else {
    shakeX = lerp(shakeX, 0, 0.1);
    shakeY = lerp(shakeY, 0, 0.1);
  }

  if (pressure > 0.2) {
    life -= (pressure * 0.95 + squeeze * 0.8) * 0.18;
    if (Math.random() < 0.06) snd.squish();
    if (Math.random() < 0.1 && catParts.head) {
      spawnBlood(catParts.head.position.x, catParts.head.position.y, 4, 0.8);
    }
    if (squeeze > 0.45 && catParts.body) {
      const bx = catParts.body.position.x;
      const by = catParts.body.position.y;
      if (Math.random() < 0.08) spawnStain(bx + rand(-20, 20), by + rand(28, 92), rand(5, 12));
      if (Math.random() < 0.06) spawnBoneFrag(bx + rand(-15, 15), by + rand(-10, 10), 1);
    }
    updateUI();
  }

  if (life <= 0 && !failHandled) {
    failHandled = true;
    catAlive = false;
    doCatDeath();
  }
});

Events.on(engine, 'collisionStart', (ev) => {
  if (!catAlive) return;
  const now = performance.now();
  if (now - lastHitAt < 55) return;

  ev.pairs.forEach(({ bodyA: a, bodyB: b }) => {
    if (!(catParts.includes(a) || catParts.includes(b))) return;
    if (!(staticBodies.includes(a) || staticBodies.includes(b))) return;

    const spd = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
    if (spd < 2.6) return;
    lastHitAt = now;

    const dmg = clamp((spd - 2.2) * 2.6, 1.0, 12);
    life -= dmg;
    updateUI();

    if (spd > 10) { snd.crack(); flashAlpha = clamp(spd * 0.03, 0.22, 0.5); }
    else if (spd > 6) snd.hurt();
    else snd.squish();

    const mx = (a.position.x + b.position.x) * 0.5;
    const my = (a.position.y + b.position.y) * 0.5;
    spawnBlood(mx, my, clamp(Math.round(spd * 2.5), 8, 24), 1.2);
    spawnDust(mx, my, 4);
    spawnStain(mx, my + rand(4, 14), clamp(spd * 1.6, 4, 18));
    if (spd > 8.5) spawnBoneFrag(mx, my, 1);

    if (spd > 8.5) {
      engine.timing.timeScale = 0.18;
      slowFrames = 30;
    }

    const vic = catParts.includes(a) ? a : b;
    const sgn = vic.position.x < window.innerWidth * WALL_X_RATIO ? -1 : 1;
    Body.applyForce(vic, vic.position, { x: sgn * 0.016, y: rand(-0.016, -0.004) });
  });
});

// Draw
function drawBg(ctx, W, H) {
  ctx.fillStyle = '#120F10';
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  if (pressure > 0.15) {
    ctx.fillStyle = `rgba(120,20,0,${pressure * 0.14})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawWall(ctx) {
  const { W, H, wx, top, bot } = wallParams();
  const half = WALL_THICK / 2;
  ctx.fillStyle = '#B8A890';
  ctx.fillRect(wx - half, 0, WALL_THICK, top);
  ctx.fillRect(wx - half, bot, WALL_THICK, H - bot);
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(wx - half, 0, WALL_THICK, top);
  ctx.fillRect(wx - half, bot, WALL_THICK, H - bot);
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#88AACC';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 7]);
  ctx.strokeRect(wx - half - 2, top, WALL_THICK + 4, bot - top);
  ctx.restore();
  if (pressure > 0.22) {
    ctx.save();
    ctx.globalAlpha = pressure * 0.55;
    ctx.strokeStyle = '#FF2020';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(wx - half, top, WALL_THICK, bot - top);
    ctx.restore();
  }
}

function drawSprite(ctx, sprite, x, y, w, h, angle, sx = 1, sy = 1, flip = false) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle || 0);
  ctx.scale((flip ? -1 : 1) * sx, sy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawCat(ctx) {
  const { head, body, fla, fra, hla, hra, t1 } = catParts;
  if (!body) return;

  const bodyD = getDeform(body);
  const headD = getDeform(head);
  const legD = getDeform(body);
  const tailD = getDeform(t1);

  const gSqX = 1 - squeeze * 0.18;
  const gSqY = 1 + squeeze * 0.12;
  const hSqX = 1 - squeeze * 0.24;
  const hSqY = 1 + squeeze * 0.16;

  // Tail first, then back legs, body, front legs, head.
  drawSprite(ctx, SPRITES.tail, t1.position.x, t1.position.y, 52, 26, t1.angle, tailD.sx * 1.0, tailD.sy * 1.0);
  drawSprite(ctx, SPRITES.leg, hla.position.x, hla.position.y, 24, 36, hla.angle, legD.sx * gSqX, legD.sy * gSqY, true);
  drawSprite(ctx, SPRITES.leg, hra.position.x, hra.position.y, 24, 36, hra.angle, legD.sx * gSqX, legD.sy * gSqY, false);
  drawSprite(ctx, SPRITES.body, body.position.x, body.position.y, 80, 62, body.angle, bodyD.sx * CAT_SCALE, bodyD.sy * CAT_SCALE);
  drawSprite(ctx, SPRITES.leg, fla.position.x, fla.position.y, 24, 36, fla.angle, legD.sx * gSqX, legD.sy * gSqY, true);
  drawSprite(ctx, SPRITES.leg, fra.position.x, fra.position.y, 24, 36, fra.angle, legD.sx * gSqX, legD.sy * gSqY, false);
  drawSprite(ctx, SPRITES.head, head.position.x, head.position.y, 58, 58, head.angle, headD.sx * hSqX, headD.sy * hSqY);

  // Tiny overlap blobs to avoid the “floating feet” look.
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  ctx.fillStyle = C.body;
  px(ctx, -20, 22, 12, 8, C.body);
  px(ctx, 8, 22, 12, 8, C.body);
  px(ctx, -8, 24, 16, 6, C.body2);
  ctx.restore();

  if (tongueOut) {
    ctx.save();
    ctx.translate(Math.round(head.position.x), Math.round(head.position.y));
    ctx.rotate(head.angle);
    ctx.globalAlpha = 0.95;
    px(ctx, -1, 20, 4, 12, C.outline);
    px(ctx, 0, 21, 2, 10, C.tongue);
    ctx.restore();
  }
}

function drawParticles(ctx) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (let i = blood.length - 1; i >= 0; i--) {
    const p = blood[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.10; p.vx *= 0.98; p.life--;
    if (p.life <= 0) { blood.splice(i, 1); continue; }
    if (p.life < 8 && !p.stained) { p.stained = true; spawnStain(p.x, p.y, p.r * 1.2); }
    ctx.globalAlpha = clamp(p.life / 50, 0, 1);
    const r = Math.round(p.r);
    ctx.fillStyle = C.blood;
    ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r);
  }

  for (let i = dust.length - 1; i >= 0; i--) {
    const p = dust[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life--;
    if (p.life <= 0) { dust.splice(i, 1); continue; }
    ctx.globalAlpha = clamp(p.life / 28, 0, 0.45);
    ctx.fillStyle = '#C8B880';
    ctx.fillRect(Math.round(p.x - p.r / 2), Math.round(p.y - p.r / 2), Math.round(p.r), Math.round(p.r));
  }

  for (let i = boneFrags.length - 1; i >= 0; i--) {
    const b = boneFrags[i];
    b.x += b.vx; b.y += b.vy; b.vy += 0.12; b.vx *= 0.98; b.rot += b.vr; b.life--;
    if (b.life <= 0) { boneFrags.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = clamp(b.life / 50, 0, 1);
    ctx.translate(Math.round(b.x), Math.round(b.y));
    ctx.rotate(b.rot);
    ctx.drawImage(SPRITES.bone, -6, -4, 12, 8);
    ctx.restore();
  }

  ctx.restore();
}

function drawStains(ctx) {
  ctx.save();
  for (const s of stains) {
    ctx.globalAlpha = s.a * 0.6;
    ctx.fillStyle = '#550010';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * s.stretch, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFlash(ctx, W, H) {
  if (flashAlpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = flashAlpha;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  flashAlpha = lerp(flashAlpha, 0, 0.2);
}

function drawDeathOverlay(ctx, W, H) {
  if (deathFlash <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = deathFlash * 0.55;
  ctx.fillStyle = '#AA0010';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = clamp(deathFlash * 1.3, 0, 1);
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`🐱 Gato #${killCount} eliminado`, W / 2, H / 2 - 20);
  ctx.font = '18px monospace';
  ctx.fillStyle = '#ff9999';
  ctx.fillText('Siguiente víctima en camino...', W / 2, H / 2 + 16);
  ctx.restore();
}

function drawPointer(ctx) {
  ctx.save();
  if (!ptr.down) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ptr.x - 10, ptr.y); ctx.lineTo(ptr.x + 10, ptr.y);
    ctx.moveTo(ptr.x, ptr.y - 10); ctx.lineTo(ptr.x, ptr.y + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ptr.x, ptr.y, 4, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 22);
    g.addColorStop(0, 'rgba(255,220,150,.9)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ptr.x, ptr.y, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderFrame() {
  const ctx = render.context;
  const W = window.innerWidth, H = window.innerHeight;

  ctx.save();
  ctx.translate(Math.round(shakeX), Math.round(shakeY));
  drawBg(ctx, W, H);
  drawStains(ctx);
  drawWall(ctx);
  drawCat(ctx);
  drawParticles(ctx);
  drawPointer(ctx);
  ctx.restore();

  drawFlash(ctx, W, H);
  drawDeathOverlay(ctx, W, H);
}
Events.on(render, 'afterRender', renderFrame);

restartBtn.addEventListener('click', resetGame);

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  render.options.width = window.innerWidth;
  render.options.height = window.innerHeight;
}
window.addEventListener('resize', () => { resize(); resetGame(); });

resize();
resetGame();
