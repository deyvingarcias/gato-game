// main.js — entry point and game loop

import { Pinxu } from './pinxu.js';
import { InputHandler } from './input.js';
import { ParticleSystem } from './particles.js';
import { MoodState } from './state.js';
import { BloomPass } from './shaders.js';
import { unlockAudio, playBloop, playMrrp, playTch, PurringEngine } from './audio.js';

console.log('Hi, I\'m Pinxu 🖤');

// --- Canvas setup ---
const mainCanvas  = document.getElementById('main-canvas');
const bloomCanvas = document.getElementById('bloom-canvas');
const ctx = mainCanvas.getContext('2d');

let W = 0, H = 0;
let dpr = window.devicePixelRatio || 1;
let pinxu, bloom;

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;

  mainCanvas.width  = Math.round(W * dpr);
  mainCanvas.height = Math.round(H * dpr);
  mainCanvas.style.width  = W + 'px';
  mainCanvas.style.height = H + 'px';

  bloomCanvas.style.width  = W + 'px';
  bloomCanvas.style.height = H + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Reposition cat at center, slightly below center for portrait feel
  const catX = W * 0.5;
  const catY = H * 0.52;

  if (!pinxu) {
    pinxu = new Pinxu(catX, catY);
  } else {
    // Reposition existing cat (maintain physics state on resize)
    const dx = catX - pinxu.cx;
    const dy = catY - pinxu.cy;
    pinxu.cx = catX;
    pinxu.cy = catY;
    // Shift all points
    for (const p of pinxu.body.points)  { p.x += dx; p.y += dy; p.oldX += dx; p.oldY += dy; }
    for (const p of pinxu.tail.points)  { p.x += dx; p.y += dy; p.oldX += dx; p.oldY += dy; }
    for (const r of pinxu._restPositions) { r.x += dx; r.y += dy; }
    for (const r of pinxu._tailRestPositions) { r.x += dx; r.y += dy; }
    pinxu._centerRest.x += dx;
    pinxu._centerRest.y += dy;
  }

  if (bloom) bloom.resize(W, H);
}

window.addEventListener('resize', resize);
resize();

// --- Systems ---
const particles = new ParticleSystem();
const mood = new MoodState();
const purr = new PurringEngine();
const input = new InputHandler(mainCanvas);

// --- Bloom (Phase 3 — initialize now, renders cheaply) ---
bloom = new BloomPass(bloomCanvas, mainCanvas);
bloom.resize(W, H);

// --- Input ---
let audioStarted = false;

function ensureAudio() {
  if (!audioStarted) {
    unlockAudio();
    purr.start();
    audioStarted = true;
  }
}

input.onDown((x, y) => {
  ensureAudio();
  const zone = pinxu.getZone(x, y);

  if (zone !== 'outside') {
    mood.interact(zone === 'head' ? 1.5 : 1);
  }

  if (zone === 'belly') {
    pinxu.squishAt(x, y, 90, 7);
    playBloop();
    if (navigator.vibrate) navigator.vibrate(10);
    if (mood.spawnHearts) particles.spawn(x, y - 20, 'heart');
    console.log('belly squish!');
  } else if (zone === 'head') {
    pinxu.squishAt(x, y, 60, 3);
  } else if (zone === 'cheek') {
    pinxu.squishAt(x, y, 50, 4);
    playMrrp();
    if (navigator.vibrate) navigator.vibrate(30);
  } else if (zone === 'paws') {
    pinxu.squishAt(x, y, 35, 2);
    playTch();
  }
});

input.onMove((x, y, dx, dy) => {
  if (!input.isDown) return;
  const zone = pinxu.getZone(x, y);
  if (zone === 'head' || zone === 'body' || zone === 'belly') {
    mood.interact(0.4);
    const speed = Math.hypot(dx, dy);
    pinxu.squishAt(x, y, 55, speed * 0.4);
    purr.setVolume(mood.purrVolume);
  }
});

input.onUp(() => {
  purr.setVolume(mood.purrVolume * 0.5);
});

// --- Hint text ---
const hint = document.getElementById('hint');
let hintShown = false;
setTimeout(() => {
  if (!hintShown) {
    hint.classList.add('visible');
    setTimeout(() => hint.classList.remove('visible'), 4000);
  }
}, 30000);

// --- Share button ---
document.getElementById('share-btn').addEventListener('click', () => {
  if (navigator.share) {
    navigator.share({
      title: 'SquishPets',
      text: 'Pinxu is the softest cat alive 🖤 squishpets.web/',
      url: location.href,
    }).catch(() => {});
  }
});

// --- FPS tracking ---
let frameCount = 0;
let fpsTimer = 0;
let fps = 60;

// --- Game loop ---
let lastTime = performance.now();

function draw(time) {
  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background gradient (warm cream)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#f5ede0');
  bgGrad.addColorStop(1, '#e8d0b8');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle parallax: cushion offset based on pointer
  const parallaxX = ((input.x / W) - 0.5) * 3;
  const parallaxY = ((input.y / H) - 0.5) * 2;
  ctx.save();
  ctx.translate(parallaxX, parallaxY);

  // Breathing animation
  const breathAmp = 0.015;
  const breathScale = 1 + Math.sin(time * 0.001 * mood.breathRate * Math.PI * 2) * breathAmp;

  pinxu.draw(ctx, breathScale, time);
  ctx.restore();

  particles.draw(ctx);
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  // Update
  mood.update();
  pinxu.update(dt);
  purr.update(dt);
  particles.update(dt);
  purr.setVolume(mood.purrVolume);

  // FPS counter (dev — remove in production)
  frameCount++;
  fpsTimer += dt;
  if (fpsTimer >= 1) {
    fps = frameCount;
    frameCount = 0;
    fpsTimer = 0;
  }

  // Draw
  draw(timestamp);

  // Bloom pass (WebGL overlay)
  bloom.render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
