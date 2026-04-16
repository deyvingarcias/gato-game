/* global Matter */
const { Engine, Render, Runner, Bodies, Body, Composite, Constraint, Events, Common } = Matter;

const canvas   = document.getElementById('gameCanvas');
const lifeText = document.getElementById('lifeText');
const lifeBar  = document.getElementById('lifeBar');
const gameOverEl = document.getElementById('gameOver');
const restartBtn = document.getElementById('restartBtn');
const muteBtn    = document.getElementById('muteBtn');

// ─── ENGINE ──────────────────────────────────────────────────────────────────
const engine = Engine.create({ enableSleeping: false, positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
engine.gravity.y = 1.0;
const world = engine.world;

const render = Render.create({
  canvas, engine,
  options: { width: window.innerWidth, height: window.innerHeight, wireframes: false, background: 'transparent', pixelRatio: window.devicePixelRatio || 1 }
});
Render.run(render);
Runner.run(Runner.create(), engine);

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const LIFE_MAX      = 3000;
const WALL_THICK    = 30;
const WALL_X_RATIO  = 0.52;
const GAP_RATIO     = 0.093;
const CAT_X_RATIO   = 0.20;
const CAT_Y_RATIO   = 0.45;
const CAT_SCALE     = 3.4;   // ← MUCH BIGGER
const PHYS_SCALE    = 1.5;   // physics body scale multiplier

const C = {
  outline: '#05040A', body: '#1A1535', body2: '#2A1E4A', belly: '#221A3E',
  ear: '#352860', earInner: '#4E3A85',
  eye: '#FFD24A', eye2: '#FFF6C9', pupil: '#170E00',
  nose: '#D07A8B', tongue: '#FF6C92', tongueDk: '#CC4466',
  blood: '#A80018', bloodDark: '#550010',
  bone: '#EDE8D5', boneDk: '#C8C0A0',
  organ: '#C0304A', organDk: '#801020',
  intestine: '#D06040', intestineDk: '#903020',
  heart: '#FF2040', heartDk: '#AA1030',
  crack: '#08060F', sweat: '#8AAABB'
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp   = (a, b, t) => a + (b - a) * t;
const rand   = (a, b)    => Common.random(a, b);
const PI2    = Math.PI * 2;

function wallParams() {
  const W = window.innerWidth, H = window.innerHeight;
  const wx   = Math.round(W * WALL_X_RATIO);
  const gapH = clamp(Math.round(H * GAP_RATIO), 60, 88);
  const gapY = Math.round(H * 0.5);
  return { W, H, wx, gapH, gapY, top: gapY - gapH / 2, bot: gapY + gapH / 2 };
}

// ─── AUDIO ───────────────────────────────────────────────────────────────────
let soundEnabled = true;
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  return audioCtx;
}
function tone(freq, type, dur, vol, freqEnd) {
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur + 0.01);
  } catch (e) {}
}
const snd = {
  hurt:   () => tone(170, 'sawtooth', 0.11, 0.18, 70),
  squish: () => tone(115, 'square',   0.16, 0.15, 48),
  crack:  () => { tone(320, 'sawtooth', 0.04, 0.22, 80); tone(620, 'square', 0.03, 0.14, 190); },
  spawn:  () => { tone(440, 'sine', 0.06, 0.12, 860); setTimeout(() => tone(660, 'sine', 0.07, 0.10), 70); },
  death:  () => { tone(260, 'sawtooth', 0.12, 0.2); setTimeout(() => tone(120, 'square', 0.22, 0.18), 120); },
  crunch: () => { tone(280, 'sawtooth', 0.06, 0.25, 60); tone(450, 'square', 0.04, 0.18, 80); },
  squelch:() => tone(90, 'square', 0.2, 0.2, 30),
  meow:   () => { tone(800, 'sine', 0.10, 0.12, 600); setTimeout(() => tone(500, 'sine', 0.15, 0.10, 300), 100); },
  pop:    () => tone(600, 'sine', 0.02, 0.3, 200),
};
muteBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  muteBtn.textContent = soundEnabled ? '🔊 Sonido' : '🔇 Silencio';
});

// ─── PIXEL ART HELPERS ───────────────────────────────────────────────────────
function makeCanvas(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(g); return c;
}
function px(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function ellipseMask(g, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1) px(g, x, y, 1, 1, color);
}

// ─── SPRITES ─────────────────────────────────────────────────────────────────
function makeHead() {
  return makeCanvas(68, 68, g => {
    // ears
    px(g, 11,  5,  10, 13, C.outline); px(g, 47,  5, 10, 13, C.outline);
    px(g, 13,  7,   6,  8, C.ear);     px(g, 49,  7,  6,  8, C.ear);
    px(g, 14,  8,   3,  5, C.earInner);px(g, 51,  8,  3,  5, C.earInner);
    // head
    ellipseMask(g, 34, 36, 24, 22, C.outline);
    ellipseMask(g, 34, 36, 21, 19, C.body);
    ellipseMask(g, 34, 39, 14, 11, C.body2);
    ellipseMask(g, 34, 43,  9,  7, C.belly);
    // cheek fluff
    ellipseMask(g, 20, 38,  7,  5, C.body2);
    ellipseMask(g, 48, 38,  7,  5, C.body2);
    // eyes
    px(g, 18, 28,  9, 10, C.eye);   px(g, 41, 28,  9, 10, C.eye);
    px(g, 19, 28,  4,  4, C.eye2);  px(g, 42, 28,  4,  4, C.eye2);
    px(g, 21, 30,  3,  4, C.pupil); px(g, 44, 30,  3,  4, C.pupil);
    px(g, 19, 29,  2,  2, '#FFFFFF'); px(g, 42, 29,  2,  2, '#FFFFFF');
    // nose
    px(g, 32, 36,  5,  4, C.nose);
    // mouth
    px(g, 29, 40,  2,  2, C.outline); px(g, 36, 40,  2,  2, C.outline);
    px(g, 31, 42,  6,  2, C.outline);
    // whisker dots
    px(g, 12, 37,  3,  2, C.body2); px(g,  8, 39,  3,  2, C.body2);
    px(g, 52, 37,  3,  2, C.body2); px(g, 56, 39,  3,  2, C.body2);
    // outline edges
    px(g,  9, 22,  3, 14, C.outline); px(g, 56, 22,  3, 14, C.outline);
    px(g, 16, 55, 36,  5, C.outline);
  });
}

function makeBody() {
  return makeCanvas(96, 78, g => {
    ellipseMask(g, 48, 39, 40, 30, C.outline);
    ellipseMask(g, 48, 39, 37, 27, C.body);
    ellipseMask(g, 48, 41, 28, 19, C.body2);
    ellipseMask(g, 48, 46, 19, 13, C.belly);
    // side shading
    ellipseMask(g, 32, 38, 12, 16, C.body2);
    ellipseMask(g, 64, 38, 12, 16, C.body2);
    // fur texture
    for (let i = 0; i < 5; i++) px(g, 38 + i*5, 18 + (i%2)*4, 3, 1, C.body2);
    // bottom fluff
    ellipseMask(g, 48, 55, 20, 10, C.body2);
    ellipseMask(g, 48, 58, 13,  6, C.belly);
    // belly sheen
    px(g, 44, 47,  8,  3, '#252048');
  });
}

function makeLeg() {
  return makeCanvas(30, 46, g => {
    ellipseMask(g, 15, 18, 9, 14, C.outline);
    ellipseMask(g, 15, 18, 7, 12, C.body);
    ellipseMask(g, 15, 28, 8,  6, C.body2);
    ellipseMask(g, 15, 33, 9,  6, C.outline);
    ellipseMask(g, 15, 33, 7,  4, C.body);
    // paw
    px(g,  5, 38, 20,  7, C.outline);
    px(g,  7, 39, 16,  4, C.body);
    px(g, 11, 39,  1,  4, C.outline);
    px(g, 16, 39,  1,  4, C.outline);
    ellipseMask(g,  9, 41, 2, 1, C.ear);
    ellipseMask(g, 15, 41, 2, 1, C.ear);
    ellipseMask(g, 21, 41, 2, 1, C.ear);
  });
}

function makeTail() {
  return makeCanvas(66, 36, g => {
    [[9,22],[20,18],[31,14],[42,11],[53,8]].forEach(([cx,cy]) => {
      ellipseMask(g, cx, cy,  9,  7, C.outline);
      ellipseMask(g, cx+1, cy, 7,  5, C.body);
      ellipseMask(g, cx+1, cy+1, 4, 2, C.body2);
    });
    // tip fluff
    ellipseMask(g, 57,  8,  8,  7, C.outline);
    ellipseMask(g, 57,  8,  6,  5, C.body2);
  });
}

function makeBoneFrag() {
  return makeCanvas(16, 12, g => {
    px(g, 1, 3, 12, 5, C.outline);
    px(g, 2, 4, 10, 3, C.bone);
    px(g, 2, 3, 10,  1, C.boneDk);
    ellipseMask(g, 2,  6, 2, 2, C.bone);
    ellipseMask(g,13,  6, 2, 2, C.bone);
  });
}

function makeOrganChunk() {
  return makeCanvas(12, 10, g => {
    ellipseMask(g, 6, 5, 5, 4, C.organ);
    ellipseMask(g, 6, 5, 3, 3, C.organDk);
    px(g, 5, 4, 2, 1, '#FF6070');
  });
}

const SPRITES = {
  head: makeHead(), body: makeBody(), leg: makeLeg(), tail: makeTail(),
  bone: makeBoneFrag(), organ: makeOrganChunk()
};

// ─── STATE ───────────────────────────────────────────────────────────────────
let catParts = [], catConstraints = [], staticBodies = [];
let blood = [], dust = [], stains = [], boneFrags = [], organFrags = [];
let comicTexts = [], sweatDrops = [], ripples = [], skinCracks = [];

let life = LIFE_MAX, catAlive = true, failHandled = false;
let pressure = 0, squeeze = 0, shakeX = 0, shakeY = 0;
let lastHitAt = 0, flashAlpha = 0, deathFlash = 0;
let spawnTimer = 0, killCount = 0, slowFrames = 0;
let tongueOut = false, tongueLength = 0;
let heartPhase = 0;
let escapeTimer = 0, lastInteractTime = 0;
let goreLevel = 0, prevGoreLevel = 0, trembleAmt = 0;
let eyePopLeft = false, eyePopRight = false;
let eyePopL = { x:0, y:0, vx:0, vy:0 };
let eyePopR = { x:0, y:0, vx:0, vy:0 };
let intestinePhase = 0;

// Jelly wobble
const wobbleMap = new Map();
function triggerWobble(body, amp = 0.35) {
  const e = wobbleMap.get(body.id);
  wobbleMap.set(body.id, { phase: e ? e.phase : 0, amp: Math.min((e ? e.amp : 0) + amp, 0.8), freq: 0.20 + rand(-0.05, 0.05) });
}
function getWobble(body) {
  const w = wobbleMap.get(body.id);
  if (!w) return { sx:1, sy:1 };
  w.phase += w.freq; w.amp *= 0.91;
  if (w.amp < 0.008) { wobbleMap.delete(body.id); return { sx:1, sy:1 }; }
  const s = Math.sin(w.phase) * w.amp;
  return { sx: 1 + s * 0.55, sy: 1 - s * 0.38 };
}

// ─── POINTER ─────────────────────────────────────────────────────────────────
const ptr = { x:200, y:400, down:false };
const grabAnchor = Bodies.circle(200, 400, 4, { isStatic:true, isSensor:true, render:{visible:false} });
Composite.add(world, grabAnchor);
let grabConstraint = null, grabbedBody = null;

function buildArena() {
  staticBodies.forEach(b => Composite.remove(world, b, true));
  staticBodies = [];
  const { W, H, wx, top, bot } = wallParams();
  const s = { isStatic:true, friction:0.35, restitution:0.1, render:{visible:false} };
  staticBodies = [
    Bodies.rectangle(W/2,  H+45, W+300, 90,  s),
    Bodies.rectangle(W/2,   -45, W+300, 90,  s),
    Bodies.rectangle(-45, H/2,  90, H+300,   s),
    Bodies.rectangle(W+45, H/2, 90, H+300,   s),
    Bodies.rectangle(wx, top/2, WALL_THICK, top, s),
    Bodies.rectangle(wx, bot + (H-bot)/2, WALL_THICK, H-bot, s),
  ];
  Composite.add(world, staticBodies);
}

function buildCat() {
  catParts.forEach(b => Composite.remove(world, b, true));
  catConstraints.forEach(c => Composite.remove(world, c, true));
  catParts = []; catConstraints = [];
  wobbleMap.clear(); skinCracks = [];
  eyePopLeft = false; eyePopRight = false;
  tongueOut = false; tongueLength = 0;

  const W = window.innerWidth, H = window.innerHeight;
  const cx = W * CAT_X_RATIO, cy = H * CAT_Y_RATIO;
  const S = PHYS_SCALE;
  const G = Body.nextGroup(true);

  function circ(x, y, r, d = 0.006) {
    const b = Bodies.circle(x, y, r, { collisionFilter:{group:G}, density:d, friction:0.92, frictionAir:0.022, restitution:0.06, render:{visible:false} });
    catParts.push(b); Composite.add(world, b); return b;
  }
  function box(x, y, w, h, angle = 0, d = 0.003) {
    const b = Bodies.rectangle(x, y, w, h, { collisionFilter:{group:G}, angle, chamfer:{radius: Math.min(w,h)*0.45}, density:d, friction:0.92, frictionAir:0.024, restitution:0.05, render:{visible:false} });
    catParts.push(b); Composite.add(world, b); return b;
  }

  const head = circ(cx,      cy - 40*S, 28*S, 0.005);
  const body = circ(cx,      cy + 12*S, 50*S, 0.009);
  const hip  = circ(cx,      cy + 48*S, 32*S, 0.004);
  const fla  = box (cx - 24*S, cy + 24*S, 19*S, 30*S, -0.08, 0.003);
  const flb  = box (cx - 24*S, cy + 54*S, 17*S, 22*S,  0.00, 0.002);
  const fra  = box (cx + 24*S, cy + 24*S, 19*S, 30*S,  0.08, 0.003);
  const frb  = box (cx + 24*S, cy + 54*S, 17*S, 22*S,  0.00, 0.002);
  const hla  = box (cx - 20*S, cy + 40*S, 19*S, 30*S, -0.04, 0.003);
  const hlb  = box (cx - 20*S, cy + 70*S, 17*S, 22*S,  0.00, 0.002);
  const hra  = box (cx + 20*S, cy + 40*S, 19*S, 30*S,  0.04, 0.003);
  const hrb  = box (cx + 20*S, cy + 70*S, 17*S, 22*S,  0.00, 0.002);
  const t1   = box (cx + 48*S, cy + 16*S, 15*S, 34*S, -0.45, 0.001);
  const t2   = box (cx + 64*S, cy -  4*S, 12*S, 28*S, -1.05, 0.0008);

  Object.assign(catParts, { head, body, hip, fla, flb, fra, frb, hla, hlb, hra, hrb, t1, t2 });

  function joint(a, b, ax, ay, bx, by, st = 0.88) {
    const c = Constraint.create({ bodyA:a, pointA:{x:ax*S, y:ay*S}, bodyB:b, pointB:{x:bx*S, y:by*S}, stiffness:st, length:0, render:{visible:false} });
    catConstraints.push(c); Composite.add(world, c);
  }
  joint(body, head,  0,-36,  0, 24, 0.90);
  joint(body, hip,   0, 34,  0,-22, 0.82);
  joint(body, fla,  -28,14,  0,-10, 0.80); joint(fla, flb,  0,13,  0,-9, 0.66);
  joint(body, fra,   28,14,  0,-10, 0.80); joint(fra, frb,  0,13,  0,-9, 0.66);
  joint(hip,  hla,  -16,16,  0,-10, 0.76); joint(hla, hlb,  0,13,  0,-9, 0.64);
  joint(hip,  hra,   16,16,  0,-10, 0.76); joint(hra, hrb,  0,13,  0,-9, 0.64);
  joint(body, t1,    34,16,  0,-15, 0.42); joint(t1,  t2,   0,15,  0,-13, 0.38);

  [body, head, hip].forEach(b => Body.setAngularVelocity(b, rand(-0.03, 0.03)));
}

// ─── GORE ────────────────────────────────────────────────────────────────────
function getGoreLevel() {
  const p = life / LIFE_MAX;
  if (p > 0.80) return 0;
  if (p > 0.60) return 1;
  if (p > 0.40) return 2;
  if (p > 0.20) return 3;
  if (p > 0.05) return 4;
  return 5;
}
const GORE_NAMES = ['Sano 😺','Asustado 😿','Herido 🩸','Crítico 💀','Agonizando ☠️','Muerto 💀'];

function onGoreLevelUp(level) {
  const body = catParts.body, head = catParts.head;
  if (!body) return;
  const bx = body.position.x, by = body.position.y;
  const hx = head.position.x, hy = head.position.y;
  switch (level) {
    case 1:
      spawnComicText(bx, by - 55, 'OUCH! 😿', '#FFD24A');
      if (Math.random() < 0.6) snd.meow();
      triggerWobble(body, 0.5); triggerWobble(head, 0.4);
      break;
    case 2:
      tongueOut = true;
      spawnComicText(bx, by - 55, 'AAUGH!! 😫', '#FF8844');
      spawnBlood(hx, hy, 18, 1.6);
      snd.hurt();
      break;
    case 3:
      for (let i = 0; i < 5; i++) addSkinCrack(body);
      spawnComicText(bx, by - 55, 'CRACK!! 💀', '#FF4422');
      spawnBoneFrag(bx, by, 4);
      snd.crunch();
      break;
    case 4:
      eyePopLeft = true;
      eyePopL = { x: hx - 14, y: hy - 8, vx: rand(-1.5,-0.4), vy: rand(-2.5,-0.8) };
      spawnComicText(bx, by - 55, 'SPLAT!! 🩸', '#FF0022');
      spawnOrganFrag(bx, by, 6);
      snd.squelch(); snd.pop();
      break;
    case 5:
      eyePopRight = true;
      eyePopR = { x: hx + 14, y: hy - 8, vx: rand(0.4, 1.5), vy: rand(-2.5,-0.8) };
      spawnComicText(bx, by - 55, 'X_X ☠️', '#FFFFFF');
      snd.death();
      break;
  }
}

// ─── UI ──────────────────────────────────────────────────────────────────────
function updateUI() {
  life = clamp(life, 0, LIFE_MAX);
  const pct = life / LIFE_MAX;
  lifeText.textContent = `${Math.round(pct * 100)}% — ${GORE_NAMES[getGoreLevel()]}`;
  lifeBar.style.width   = `${pct * 100}%`;
  lifeBar.style.background = `hsl(${Math.round(pct * 120)}, 90%, 38%)`;
}

// ─── RESET ───────────────────────────────────────────────────────────────────
function resetGame() {
  life = LIFE_MAX; catAlive = true; failHandled = false;
  pressure = 0; squeeze = 0; shakeX = 0; shakeY = 0;
  lastHitAt = 0; flashAlpha = 0; deathFlash = 0;
  spawnTimer = 0; killCount = 0; slowFrames = 0;
  tongueOut = false; tongueLength = 0; heartPhase = 0;
  escapeTimer = 0; lastInteractTime = performance.now();
  goreLevel = 0; prevGoreLevel = 0; trembleAmt = 0;
  eyePopLeft = false; eyePopRight = false;
  blood=[]; dust=[]; stains=[]; boneFrags=[]; organFrags=[];
  comicTexts=[]; sweatDrops=[]; ripples=[]; skinCracks=[];
  gameOverEl.style.display = 'none';
  endGrab(); buildArena(); buildCat(); updateUI();
  ptr.x = window.innerWidth * 0.18; ptr.y = window.innerHeight * 0.5;
  Body.setPosition(grabAnchor, { x:ptr.x, y:ptr.y });
  engine.timing.timeScale = 1.0;
}

function spawnNewCat() {
  life = LIFE_MAX; catAlive = true; failHandled = false;
  pressure = 0; squeeze = 0; flashAlpha = 0; deathFlash = 0;
  tongueOut = false; tongueLength = 0; heartPhase = 0;
  goreLevel = 0; prevGoreLevel = 0; trembleAmt = 0;
  eyePopLeft = false; eyePopRight = false;
  blood=[]; dust=[]; organFrags=[]; comicTexts=[]; sweatDrops=[]; ripples=[];
  endGrab(); buildCat(); updateUI();
  engine.timing.timeScale = 1.0;
  snd.spawn();
}

// ─── GRAB ────────────────────────────────────────────────────────────────────
function startGrab() {
  if (!catAlive || grabConstraint) return;
  let best = null, bestD = Infinity;
  for (const b of catParts) {
    const d = (ptr.x - b.position.x) ** 2 + (ptr.y - b.position.y) ** 2;
    const r = (b.circleRadius || 22) + 30;
    if (d < r*r && d < bestD) { best = b; bestD = d; }
  }
  if (!best) return;
  grabbedBody = best;
  Body.setPosition(grabAnchor, { x:ptr.x, y:ptr.y });
  grabConstraint = Constraint.create({ bodyA:grabAnchor, bodyB:grabbedBody, length:0, stiffness:0.24, damping:0.07, render:{visible:false} });
  Composite.add(world, grabConstraint);
  lastInteractTime = performance.now();
}
function endGrab() {
  if (grabConstraint) { Composite.remove(world, grabConstraint, true); grabConstraint = null; }
  grabbedBody = null;
}

function ptrPos(ev) {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  ptr.x = (ev.clientX - r.left) * (canvas.width / r.width) / dpr;
  ptr.y = (ev.clientY - r.top) * (canvas.height / r.height) / dpr;
  if (ptr.down) lastInteractTime = performance.now();
}
canvas.addEventListener('pointerdown', ev => {
  canvas.setPointerCapture(ev.pointerId); ptr.down = true; ptrPos(ev);
  lastInteractTime = performance.now();
  if (audioCtx?.state === 'suspended') audioCtx.resume(); else if (!audioCtx) getAudioCtx();
  startGrab();
});
canvas.addEventListener('pointermove', ev => ptrPos(ev));
canvas.addEventListener('pointerup',     () => { ptr.down = false; endGrab(); });
canvas.addEventListener('pointercancel', () => { ptr.down = false; endGrab(); });

// ─── PARTICLE SPAWNERS ───────────────────────────────────────────────────────
function spawnBlood(x, y, n=10, spd=1, dx=0, dy=0) {
  for (let i=0; i<n; i++) blood.push({
    x, y,
    vx: rand(-3.2, 3.2)*spd + dx*spd*0.5,
    vy: rand(-4.8, 0.6)*spd + dy*spd*0.3,
    life: rand(22, 68), r: rand(2, 7), stained:false
  });
}
function spawnDust(x, y, n=5) {
  for (let i=0; i<n; i++) dust.push({ x, y, vx:rand(-2,2), vy:rand(-2.4,0.7), life:rand(14,32), r:rand(1.5,3.5) });
}
function spawnStain(x, y, r) {
  stains.push({ x, y, r:rand(r*0.7,r*2.0), a:rand(0.22,0.68), stretch:rand(0.4,1.8) });
}
function spawnBoneFrag(x, y, n=2) {
  for (let i=0; i<n; i++) boneFrags.push({ x, y, vx:rand(-4.5,4.5), vy:rand(-5.5,-0.8), life:rand(55,100), rot:rand(0,PI2), vr:rand(-0.28,0.28) });
}
function spawnOrganFrag(x, y, n=2) {
  for (let i=0; i<n; i++) organFrags.push({ x, y, vx:rand(-4,4), vy:rand(-4.5,-0.5), life:rand(45,90), rot:rand(0,PI2), vr:rand(-0.22,0.22), r:rand(5,10) });
}
function spawnComicText(x, y, text, color='#FFFFFF') {
  comicTexts.push({ x, y, text, color, life:60, vy:-1.4, scale:0, targetScale:1 });
}
function spawnSweat(x, y) {
  sweatDrops.push({ x, y, vy:rand(0.4,2.2), life:rand(22,45), r:rand(1.5,3.5) });
}
function spawnRipple(x, y) {
  ripples.push({ x, y, r:5, maxR:rand(35,60), alpha:0.75 });
}
function addSkinCrack(bodyRef) {
  if (skinCracks.length > 24) return;
  skinCracks.push({ ox:rand(-30,30), oy:rand(-22,22), angle:rand(0,PI2), len:rand(10,26), alpha:rand(0.55,1.0), bodyRef });
}

// ─── DEFORM ──────────────────────────────────────────────────────────────────
function getDeform(body) {
  const spd = Math.hypot(body.velocity.x, body.velocity.y);
  const stretch = Math.min(spd / 18, 0.55) + squeeze * 0.30;
  const ang = Math.atan2(body.velocity.y, body.velocity.x) - body.angle;
  const ax = Math.cos(ang), lat = Math.sin(ang);
  return {
    sx: clamp(1 + ax*stretch*0.65 - Math.abs(lat)*stretch*0.16, 0.62, 2.1),
    sy: clamp(1 - ax*stretch*0.45 + Math.abs(lat)*stretch*0.42, 0.62, 2.4)
  };
}

// ─── DEATH ───────────────────────────────────────────────────────────────────
function doCatDeath() {
  killCount++; snd.death(); deathFlash = 1;
  const main = catParts.body;
  if (main) {
    const tx = main.position.x, ty = main.position.y;
    spawnBlood(tx, ty, 110, 3.8); spawnDust(tx, ty, 28);
    spawnBoneFrag(tx, ty, 12); spawnOrganFrag(tx, ty, 10);
    for (let i=0; i<6; i++) spawnRipple(tx+rand(-25,25), ty+rand(-25,25));
    spawnComicText(tx, ty - 45, 'R.I.P. 💀', '#FF2040');
  }
  catParts.forEach(b => { Body.setVelocity(b,{x:0,y:0}); Body.setAngularVelocity(b,0); Body.setStatic(b,true); });
  spawnTimer = 140;
}

// ─── BEFORE UPDATE ───────────────────────────────────────────────────────────
Events.on(engine, 'beforeUpdate', () => {
  if (spawnTimer > 0) {
    spawnTimer--; deathFlash = lerp(deathFlash, 0, 0.04);
    if (spawnTimer === 0) spawnNewCat();
    return;
  }
  if (!catAlive) return;

  // Slow-mo decay
  if (slowFrames > 0) { slowFrames--; engine.timing.timeScale = lerp(engine.timing.timeScale, 1, 0.05); }
  else                              engine.timing.timeScale = lerp(engine.timing.timeScale, 1, 0.16);

  Body.setPosition(grabAnchor, { x:ptr.x, y:ptr.y });
  Body.setVelocity(grabAnchor, { x:0, y:0 });

  // Gore level progression
  const gl = getGoreLevel();
  if (gl > prevGoreLevel) { onGoreLevelUp(gl); prevGoreLevel = gl; }
  goreLevel = gl;

  const pct = life / LIFE_MAX;

  // Trembling
  trembleAmt = lerp(trembleAmt, clamp((1 - pct)*1.6 - 0.5, 0, 1), 0.08);

  // Heartbeat (faster when dying)
  heartPhase += 0.04 + (1 - pct) * 0.14;

  // Tongue growth
  if (tongueOut) tongueLength = lerp(tongueLength, 16 + (1-pct)*18, 0.07);

  // Intestine phase
  intestinePhase += 0.032;

  // Escape AI
  const timeSince = (performance.now() - lastInteractTime) / 1000;
  if (timeSince > 2.5 && !ptr.down) {
    escapeTimer++;
    if (catParts.body && escapeTimer % 8 === 0)
      Body.applyForce(catParts.body, catParts.body.position, { x:-0.004, y:-0.001 });
  } else {
    escapeTimer = 0;
  }

  // Eye pop physics update
  if (eyePopLeft) {
    eyePopL.x += eyePopL.vx; eyePopL.y += eyePopL.vy;
    eyePopL.vy += 0.10; eyePopL.vx *= 0.99;
    if (catParts.head && Math.hypot(eyePopL.vx, eyePopL.vy) < 0.6) {
      const h = catParts.head;
      eyePopL.x = lerp(eyePopL.x, h.position.x - 14, 0.04);
      eyePopL.y = lerp(eyePopL.y, h.position.y + 14, 0.04);
    }
  }
  if (eyePopRight) {
    eyePopR.x += eyePopR.vx; eyePopR.y += eyePopR.vy;
    eyePopR.vy += 0.10; eyePopR.vx *= 0.99;
    if (catParts.head && Math.hypot(eyePopR.vx, eyePopR.vy) < 0.6) {
      const h = catParts.head;
      eyePopR.x = lerp(eyePopR.x, h.position.x + 14, 0.04);
      eyePopR.y = lerp(eyePopR.y, h.position.y + 14, 0.04);
    }
  }

  // Wall squeeze
  const { wx, top, bot } = wallParams();
  let p = 0, sq = 0;
  for (const b of catParts) {
    const near = Math.abs(b.position.x - wx) < 38;
    const inGap = b.position.y >= top && b.position.y <= bot;
    if (near && !inGap) {
      p++;
      sq = Math.max(sq, 1 - Math.abs(b.position.x - wx) / 38);
      if (Math.random() < 0.04) triggerWobble(b, 0.22);
    }
  }
  pressure = lerp(pressure, clamp(p/5, 0, 1), 0.12);
  squeeze  = lerp(squeeze,  sq, 0.14);

  if (pressure > 0.15) {
    shakeX = lerp(shakeX, rand(-8, 8) * pressure, 0.2);
    shakeY = lerp(shakeY, rand(-5, 5) * pressure, 0.2);
  } else {
    shakeX = lerp(shakeX, 0, 0.1);
    shakeY = lerp(shakeY, 0, 0.1);
  }
  if (trembleAmt > 0.1) {
    shakeX += rand(-1, 1) * trembleAmt * 3;
    shakeY += rand(-1, 1) * trembleAmt * 2;
  }

  if (pressure > 0.2) {
    life -= (pressure * 0.95 + squeeze * 0.8) * 0.22;
    if (Math.random() < 0.05) snd.squish();
    if (Math.random() < 0.09 && catParts.head)
      spawnBlood(catParts.head.position.x, catParts.head.position.y, 5, 0.9);
    if (squeeze > 0.35 && catParts.body) {
      const bx = catParts.body.position.x, by = catParts.body.position.y;
      if (Math.random() < 0.07) spawnStain(bx + rand(-28,28), by + rand(32,105), rand(5,15));
      if (Math.random() < 0.05) spawnBoneFrag(bx + rand(-18,18), by + rand(-12,12), 1);
      if (goreLevel >= 3 && Math.random() < 0.04) spawnOrganFrag(bx + rand(-12,12), by + rand(-10,10), 1);
      if (Math.random() < 0.10) triggerWobble(catParts.body, 0.45);
    }
    if (goreLevel >= 1 && Math.random() < 0.09 && catParts.head)
      spawnSweat(catParts.head.position.x + rand(-22,22), catParts.head.position.y + rand(-12,12));
    updateUI();
  }

  if (life <= 0 && !failHandled) { failHandled = true; catAlive = false; doCatDeath(); }
});

// ─── COLLISION ───────────────────────────────────────────────────────────────
Events.on(engine, 'collisionStart', ev => {
  if (!catAlive) return;
  const now = performance.now();
  if (now - lastHitAt < 55) return;

  ev.pairs.forEach(({ bodyA:a, bodyB:b }) => {
    if (!(catParts.includes(a) || catParts.includes(b))) return;
    if (!(staticBodies.includes(a) || staticBodies.includes(b))) return;

    const spd = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
    if (spd < 2.6) return;
    lastHitAt = now;

    const dmg = clamp((spd - 2.2) * 2.8, 1.0, 16);
    life -= dmg; updateUI();

    if (spd > 10)      { snd.crack(); flashAlpha = clamp(spd*0.03, 0.22, 0.5); if (goreLevel >= 2) addSkinCrack(catParts.body); }
    else if (spd > 6)  snd.hurt();
    else               snd.squish();

    const mx = (a.position.x + b.position.x) * 0.5;
    const my = (a.position.y + b.position.y) * 0.5;
    const vic = catParts.includes(a) ? a : b;
    spawnBlood(mx, my, clamp(Math.round(spd*3.5), 8, 32), 1.5, vic.velocity.x*0.1, vic.velocity.y*0.1);
    spawnDust(mx, my, 4);
    spawnStain(mx, my + rand(4,16), clamp(spd*2, 4, 22));
    spawnRipple(mx, my);
    if (spd > 7)  spawnBoneFrag(mx, my, 1);
    if (spd > 9 && goreLevel >= 3) spawnOrganFrag(mx, my, 1);

    // Comic text on impact
    const HIT_TEXTS   = ['CRACK!','THUD!','SPLAT!','CRUNCH!','POW!','WHAM!'];
    const LIGHT_TEXTS = ['OOF!','OW!','UGH!','HIT!'];
    if      (spd > 9) spawnComicText(mx, my - 35, HIT_TEXTS  [Math.floor(rand(0, HIT_TEXTS.length))],   '#FFFFFF');
    else if (spd > 6) spawnComicText(mx, my - 35, LIGHT_TEXTS[Math.floor(rand(0, LIGHT_TEXTS.length))], '#FFD24A');

    triggerWobble(vic, clamp(spd*0.045, 0.15, 0.65));
    if (spd > 8.5) { engine.timing.timeScale = 0.16; slowFrames = 32; }

    const sgn = vic.position.x < window.innerWidth * WALL_X_RATIO ? -1 : 1;
    Body.applyForce(vic, vic.position, { x: sgn*0.022, y: rand(-0.022,-0.005) });
  });
});

// ─── DRAW ────────────────────────────────────────────────────────────────────
function drawSprite(ctx, sprite, x, y, w, h, angle, sx=1, sy=1, flip=false) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle || 0);
  ctx.scale((flip ? -1 : 1) * sx, sy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, -w/2, -h/2, w, h);
  ctx.restore();
}

function drawBg(ctx, W, H) {
  ctx.fillStyle = '#0D0A10';
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  const intensity = Math.max(pressure * 0.18, (goreLevel/5) * 0.10);
  if (intensity > 0.01) { ctx.fillStyle = `rgba(130,8,0,${intensity})`; ctx.fillRect(0,0,W,H); }
}

function drawWall(ctx) {
  const { W, H, wx, top, bot } = wallParams();
  const half = WALL_THICK / 2;
  ctx.fillStyle = '#5A0808';
  ctx.fillRect(wx-half, 0, WALL_THICK, top);
  ctx.fillRect(wx-half, bot, WALL_THICK, H-bot);
  // side highlight
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(wx-half, 0, 3, top);
  ctx.fillRect(wx-half, bot, 3, H-bot);
  // texture lines
  ctx.fillStyle = '#3A0505';
  for (let y=12; y<top; y+=22)  ctx.fillRect(wx-half+4, y, WALL_THICK-8, 2);
  for (let y=bot+12; y<H; y+=22) ctx.fillRect(wx-half+4, y, WALL_THICK-8, 2);
  // gap dashes
  ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = '#88AACC'; ctx.lineWidth = 1;
  ctx.setLineDash([5,7]); ctx.strokeRect(wx-half-2, top, WALL_THICK+4, bot-top); ctx.restore();
  if (pressure > 0.22) {
    ctx.save(); ctx.globalAlpha = pressure*0.65; ctx.strokeStyle = '#FF2020'; ctx.lineWidth = 3;
    ctx.strokeRect(wx-half, top, WALL_THICK, bot-top); ctx.restore();
  }
}

function drawCat(ctx) {
  const { head, body, fla, fra, hla, hra, t1 } = catParts;
  if (!body) return;

  const bD = getDeform(body), hD = getDeform(head), lD = getDeform(body), tD = getDeform(t1);
  const bW = getWobble(body), hW = getWobble(head);

  const bSX = bD.sx * CAT_SCALE * (1 - squeeze*0.18) * bW.sx;
  const bSY = bD.sy * CAT_SCALE * (1 + squeeze*0.12) * bW.sy;
  const hSX = hD.sx * (1 - squeeze*0.24) * hW.sx;
  const hSY = hD.sy * (1 + squeeze*0.16) * hW.sy;
  const lSX = lD.sx * (1 - squeeze*0.14) * bW.sx;
  const lSY = lD.sy * (1 + squeeze*0.09) * bW.sy;

  // Draw order: tail → back legs → body → front legs → head
  drawSprite(ctx, SPRITES.tail, t1.position.x, t1.position.y, 66, 36, t1.angle, tD.sx, tD.sy);
  drawSprite(ctx, SPRITES.leg,  hla.position.x, hla.position.y, 30, 46, hla.angle, lSX, lSY, true);
  drawSprite(ctx, SPRITES.leg,  hra.position.x, hra.position.y, 30, 46, hra.angle, lSX, lSY, false);
  drawSprite(ctx, SPRITES.body, body.position.x, body.position.y, 96, 78, body.angle, bSX, bSY);
  drawSprite(ctx, SPRITES.leg,  fla.position.x, fla.position.y, 30, 46, fla.angle, lSX, lSY, true);
  drawSprite(ctx, SPRITES.leg,  fra.position.x, fra.position.y, 30, 46, fra.angle, lSX, lSY, false);
  drawSprite(ctx, SPRITES.head, head.position.x, head.position.y, 68, 68, head.angle, hSX, hSY);

  // Body-leg connector blobs
  ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
  px(ctx, -26, 28, 16, 12, C.body); px(ctx, 10, 28, 16, 12, C.body);
  px(ctx, -12, 30, 24, 8, C.body2); ctx.restore();

  // Tongue
  if (tongueOut && tongueLength > 3) {
    ctx.save();
    ctx.translate(Math.round(head.position.x), Math.round(head.position.y));
    ctx.rotate(head.angle);
    const tLen = Math.round(tongueLength);
    px(ctx, -4, 18, 8,  tLen+3, C.outline);
    px(ctx, -3, 19, 6,  tLen,   C.tongue);
    px(ctx, -3, 19, 3,  tLen,   C.tongueDk);  // shading
    ellipseMask(ctx, 0, 19+tLen, 4, 3, C.tongue);
    ctx.restore();
  }

  // Grab string
  if (grabConstraint && grabbedBody) {
    ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.setLineDash([3,6]); ctx.beginPath();
    ctx.moveTo(ptr.x, ptr.y); ctx.lineTo(grabbedBody.position.x, grabbedBody.position.y);
    ctx.stroke(); ctx.restore();
  }
}

function drawGoreOverlays(ctx) {
  const body = catParts.body, head = catParts.head;
  if (!body || !head) return;
  const pct = life / LIFE_MAX;
  ctx.save(); ctx.imageSmoothingEnabled = false;

  // ── LEVEL 2: Blood drip from mouth ──
  if (goreLevel >= 2) {
    ctx.save(); ctx.translate(head.position.x, head.position.y); ctx.rotate(head.angle);
    const dripLen = 9 + Math.sin(Date.now()*0.003)*3;
    px(ctx, -3, 18, 6, Math.round(dripLen)+2, C.blood);
    ellipseMask(ctx, 0, 18+Math.round(dripLen)+1, 4, 4, C.blood);
    ctx.restore();
  }

  // ── LEVEL 3: Rib cage ──
  if (goreLevel >= 3) {
    const ribAlpha = clamp((1-pct)*2.5 - 0.6, 0, 0.78);
    ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
    ctx.globalAlpha = ribAlpha;
    const ribs = [[-18,-12],[-16,-2],[-17, 8],[-16, 18]];
    ribs.forEach(([rx, ry]) => {
      px(ctx, rx-1,   ry-1, 18, 6, C.outline); px(ctx, rx,   ry, 16, 4, C.boneDk);  // left
      px(ctx, -rx-18, ry-1, 18, 6, C.outline); px(ctx, -rx-17, ry, 16, 4, C.boneDk); // right
    });
    px(ctx, -2, -18, 4, 40, C.outline); px(ctx, -1, -17, 2, 38, C.bone); // spine
    ctx.restore();

    // Skin cracks
    skinCracks.forEach(crack => {
      if (crack.bodyRef !== body) return;
      ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
      ctx.globalAlpha = crack.alpha * ribAlpha;
      ctx.strokeStyle = C.crack; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(crack.ox, crack.oy);
      ctx.lineTo(crack.ox + Math.cos(crack.angle)*crack.len, crack.oy + Math.sin(crack.angle)*crack.len);
      ctx.stroke(); ctx.restore();
    });
  }

  // ── LEVEL 4: Heart + Intestines ──
  if (goreLevel >= 4) {
    const orgAlpha = clamp((1-pct)*3.5 - 1.8, 0, 0.92);
    ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
    ctx.globalAlpha = orgAlpha;

    // Intestine loop
    ctx.lineWidth = 5; ctx.strokeStyle = C.intestine;
    ctx.beginPath(); ctx.moveTo(-22, 10);
    for (let t=0; t<=1; t+=0.04) {
      const ix = -22 + t*44;
      const iy = 10 + Math.sin(t*Math.PI*2.5 + intestinePhase)*9 + Math.sin(t*Math.PI*4)*4;
      ctx.lineTo(ix, iy);
    }
    ctx.stroke();
    ctx.lineWidth = 8; ctx.strokeStyle = C.intestineDk; ctx.globalAlpha = orgAlpha*0.3;
    ctx.stroke();

    // Pulsing heart
    ctx.globalAlpha = orgAlpha;
    const beat = Math.sin(heartPhase) > 0.55;
    const hs = beat ? 12 : 9;
    ctx.fillStyle = C.outline;
    ctx.fillRect(-hs-2, -hs-2, hs*2+4, hs*2+4);
    ctx.fillStyle = beat ? C.heart : C.heartDk;
    ctx.fillRect(-hs, -hs+3, hs*2, hs*2-4);
    ctx.fillRect(-hs+3, -hs, hs*2-6, 4);
    ctx.fillRect(-hs+4, -hs-3, Math.floor(hs*0.8), 4);
    ctx.fillRect(2, -hs-3, Math.floor(hs*0.8), 4);

    ctx.restore();
  }

  ctx.restore();
}

function drawEyePops(ctx) {
  const h = catParts.head; if (!h) return;

  function drawEye(pos) {
    ctx.save();
    ctx.strokeStyle = C.blood; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(h.position.x + Math.cos(h.angle)*5, h.position.y + Math.sin(h.angle)*2);
    ctx.bezierCurveTo(h.position.x, pos.y - 14, pos.x, pos.y - 10, pos.x, pos.y);
    ctx.stroke();
    ctx.imageSmoothingEnabled = false;
    px(ctx, Math.round(pos.x-5), Math.round(pos.y-5), 10, 10, C.outline);
    px(ctx, Math.round(pos.x-4), Math.round(pos.y-4),  8,  8, C.eye);
    px(ctx, Math.round(pos.x-4), Math.round(pos.y-4),  3,  3, C.eye2);
    px(ctx, Math.round(pos.x-2), Math.round(pos.y-2),  4,  4, C.pupil);
    px(ctx, Math.round(pos.x-4), Math.round(pos.y-4),  2,  2, '#FFFFFF');
    ctx.restore();
  }
  if (eyePopLeft)  drawEye(eyePopL);
  if (eyePopRight) drawEye(eyePopR);
}

function drawParticles(ctx) {
  ctx.save(); ctx.imageSmoothingEnabled = false;

  blood.forEach((p, i) => {
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.13; p.vx*=0.98; p.life--;
    if (p.life<=0) { blood.splice(i,1); return; }
    if (p.life < 8 && !p.stained) { p.stained=true; spawnStain(p.x, p.y, p.r*1.3); }
    ctx.globalAlpha = clamp(p.life/50, 0, 1);
    const r = Math.round(p.r);
    ctx.fillStyle = p.life > 22 ? C.blood : C.bloodDark;
    ctx.fillRect(Math.round(p.x-r/2), Math.round(p.y-r/2), r, r);
  });

  dust.forEach((p, i) => {
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.04; p.life--;
    if (p.life<=0) { dust.splice(i,1); return; }
    ctx.globalAlpha = clamp(p.life/28, 0, 0.45);
    ctx.fillStyle = '#C8B880';
    ctx.fillRect(Math.round(p.x-p.r/2), Math.round(p.y-p.r/2), Math.round(p.r), Math.round(p.r));
  });

  boneFrags.forEach((b, i) => {
    b.x+=b.vx; b.y+=b.vy; b.vy+=0.13; b.vx*=0.98; b.rot+=b.vr; b.life--;
    if (b.life<=0) { boneFrags.splice(i,1); return; }
    ctx.save(); ctx.globalAlpha = clamp(b.life/55, 0, 1);
    ctx.translate(Math.round(b.x), Math.round(b.y)); ctx.rotate(b.rot);
    ctx.drawImage(SPRITES.bone, -8, -6, 16, 12); ctx.restore();
  });

  organFrags.forEach((o, i) => {
    o.x+=o.vx; o.y+=o.vy; o.vy+=0.12; o.vx*=0.98; o.rot+=o.vr; o.life--;
    if (o.life<=0) { organFrags.splice(i,1); return; }
    ctx.save(); ctx.globalAlpha = clamp(o.life/50, 0, 1);
    ctx.translate(Math.round(o.x), Math.round(o.y)); ctx.rotate(o.rot);
    ctx.drawImage(SPRITES.organ, -6, -5, 12, 10); ctx.restore();
  });

  sweatDrops.forEach((s, i) => {
    s.y+=s.vy; s.vy+=0.09; s.life--;
    if (s.life<=0) { sweatDrops.splice(i,1); return; }
    ctx.globalAlpha = clamp(s.life/30, 0, 0.7);
    ctx.fillStyle = C.sweat;
    ctx.fillRect(Math.round(s.x-s.r/2), Math.round(s.y-s.r/2), Math.round(s.r), Math.round(s.r*1.6));
  });

  ripples.forEach((r, i) => {
    r.r += 2.8; r.alpha *= 0.87;
    if (r.r > r.maxR || r.alpha < 0.02) { ripples.splice(i,1); return; }
    ctx.save(); ctx.globalAlpha = r.alpha;
    ctx.strokeStyle = C.blood; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, PI2); ctx.stroke(); ctx.restore();
  });

  ctx.restore();
}

function drawStains(ctx) {
  ctx.save();
  stains.forEach(s => {
    ctx.globalAlpha = s.a * 0.58;
    ctx.fillStyle = '#400010';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r*s.stretch, 0, 0, PI2); ctx.fill();
  });
  ctx.restore();
}

function drawComicTexts(ctx) {
  ctx.save();
  for (let i = comicTexts.length-1; i >= 0; i--) {
    const t = comicTexts[i];
    t.y += t.vy; t.life--;
    t.scale = lerp(t.scale, t.targetScale, 0.2);
    if (t.life <= 0) { comicTexts.splice(i,1); continue; }
    const alpha = clamp(t.life/40, 0, 1);
    ctx.save();
    ctx.translate(Math.round(t.x), Math.round(t.y)); ctx.scale(t.scale, t.scale);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#000000'; ctx.fillText(t.text, 2, 2);
    ctx.fillStyle = t.color;   ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawHeartbeat(ctx, W, H) {
  if (goreLevel < 3) return;
  const pct = life / LIFE_MAX;
  const pulse = Math.max(0, Math.sin(heartPhase)*0.6 - 0.1);
  const intensity = clamp((1-pct)*0.32, 0, 0.28) * pulse;
  if (intensity < 0.01) return;
  const vg = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H);
  vg.addColorStop(0, `rgba(200,0,20,0)`);
  vg.addColorStop(1, `rgba(200,0,20,${intensity})`);
  ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
}

function drawFlash(ctx, W, H) {
  if (flashAlpha <= 0.02) return;
  ctx.save(); ctx.globalAlpha = flashAlpha; ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H); ctx.restore();
  flashAlpha = lerp(flashAlpha, 0, 0.2);
}

function drawDeathOverlay(ctx, W, H) {
  if (deathFlash <= 0.02) return;
  ctx.save(); ctx.globalAlpha = deathFlash*0.55; ctx.fillStyle = '#AA0010'; ctx.fillRect(0,0,W,H); ctx.restore();
  ctx.save(); ctx.globalAlpha = clamp(deathFlash*1.3, 0, 1);
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px monospace';
  ctx.fillStyle = '#000'; ctx.fillText(`🐱 Gato #${killCount} eliminado`, W/2+2, H/2-18);
  ctx.fillStyle = '#fff'; ctx.fillText(`🐱 Gato #${killCount} eliminado`, W/2, H/2-20);
  ctx.font = '18px monospace'; ctx.fillStyle = '#ff8888';
  ctx.fillText('Siguiente víctima en camino... 🩸', W/2, H/2+20);
  ctx.restore();
}

function drawPointer(ctx) {
  ctx.save();
  if (!ptr.down) {
    ctx.globalAlpha = 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ptr.x-10,ptr.y); ctx.lineTo(ptr.x+10,ptr.y);
    ctx.moveTo(ptr.x,ptr.y-10); ctx.lineTo(ptr.x,ptr.y+10); ctx.stroke();
    ctx.beginPath(); ctx.arc(ptr.x,ptr.y,4,0,PI2); ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(ptr.x,ptr.y,0,ptr.x,ptr.y,26);
    g.addColorStop(0,'rgba(255,220,140,.95)'); g.addColorStop(1,'rgba(255,160,50,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ptr.x,ptr.y,26,0,PI2); ctx.fill();
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
  drawGoreOverlays(ctx);
  drawEyePops(ctx);
  drawParticles(ctx);
  drawComicTexts(ctx);
  drawPointer(ctx);
  ctx.restore();
  drawHeartbeat(ctx, W, H);
  drawFlash(ctx, W, H);
  drawDeathOverlay(ctx, W, H);
}
Events.on(render, 'afterRender', renderFrame);

restartBtn.addEventListener('click', resetGame);

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width  = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  render.options.width  = window.innerWidth;
  render.options.height = window.innerHeight;
}
window.addEventListener('resize', () => { resize(); resetGame(); });

resize();
resetGame();