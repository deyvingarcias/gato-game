// Procedural audio system — PurringEngine + interaction sounds

let _ctx = null;

function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _ctx;
}

export function unlockAudio() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// --- Interaction sounds ---

export function playBloop() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.2);

  gain.gain.setValueAtTime(0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

  filter.type = 'lowpass';
  filter.frequency.value = 400;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

export function playMrrp() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15);

  // Vibrato via LFO
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 18;
  lfoGain.gain.value = 12;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfo.start(ctx.currentTime);
  lfo.stop(ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.18);
}

export function playTch() {
  const ctx = getCtx();
  const bufSize = ctx.sampleRate * 0.03;
  const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

// --- Purring engine ---

export class PurringEngine {
  constructor() {
    this._running = false;
    this._nodes = null;
    this._volume = 0;
    this._targetVolume = 0;
  }

  start() {
    if (this._running) return;
    const ctx = getCtx();
    this._running = true;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this._master = master;

    // Sub-bass fundamentals: 25, 50, 75, 100 Hz
    const freqs = [25, 50, 75, 100];
    const amps  = [1.0, 0.5, 0.3, 0.2];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = amps[i] * 0.15;
      o.connect(g);
      g.connect(master);
      o.start();
      return o;
    });

    // Low-pass to soften
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 400;

    // LFO for inhale/exhale roll (1.5 Hz)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 1.5;
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();

    // Noise for throaty texture
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

    const noiseLoop = ctx.createBufferSource();
    noiseLoop.buffer = noiseBuf;
    noiseLoop.loop = true;

    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = 800;
    noiseBP.Q.value = 0.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.025;

    noiseLoop.connect(noiseBP);
    noiseBP.connect(noiseGain);
    noiseGain.connect(master);
    noiseLoop.start();

    // Ambient pink noise bed (-45dB ~= gain 0.006)
    const ambientBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const ab = ambientBuf.getChannelData(0);
    // Brown noise approximation via leaky integrator
    let last = 0;
    for (let i = 0; i < noiseLen; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      ab[i] = last * 3.5;
    }
    const ambient = ctx.createBufferSource();
    ambient.buffer = ambientBuf;
    ambient.loop = true;
    const ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.006;
    ambient.connect(ambientGain);
    ambientGain.connect(ctx.destination);
    ambient.start();

    this._master = master;
  }

  setVolume(v) {
    this._targetVolume = Math.max(0, Math.min(1, v));
  }

  update(dt) {
    if (!this._running || !this._master) return;
    // Smooth ramp toward target
    this._volume += (this._targetVolume - this._volume) * Math.min(1, dt * 2);
    this._master.gain.value = this._volume * 0.6;
  }
}
