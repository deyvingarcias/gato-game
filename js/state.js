// Mood state machine

export const STATES = ['sleeping', 'drowsy', 'awake', 'content', 'happy', 'ecstatic'];

const STATE_INDEX = Object.fromEntries(STATES.map((s, i) => [s, i]));

const IDLE_TO_DROWSY_MS = 5000;
const DROWSY_TO_SLEEP_MS = 10000;

export class MoodState {
  constructor() {
    this.mood = 'drowsy';
    this.happiness = 1;           // 0-5 maps to state index
    this._lastInteraction = performance.now();
    this._wokenOnce = false;
  }

  interact(delta = 1) {
    const now = performance.now();
    this._lastInteraction = now;

    if (!this._wokenOnce) {
      this._wokenOnce = true;
      this.mood = 'awake';
    }

    this.happiness = Math.min(5, this.happiness + delta * 0.15);
    this._updateMood();
  }

  update() {
    const idle = performance.now() - this._lastInteraction;

    // Decay happiness over time
    if (idle > 2000) {
      this.happiness = Math.max(0, this.happiness - 0.002);
    }

    if (idle > IDLE_TO_DROWSY_MS && STATE_INDEX[this.mood] >= STATE_INDEX['awake']) {
      this.mood = 'drowsy';
    }

    if (idle > DROWSY_TO_SLEEP_MS) {
      this.mood = 'sleeping';
    }

    this._updateMood();
  }

  _updateMood() {
    const h = this.happiness;
    if (h < 0.5) this.mood = this.mood === 'sleeping' ? 'sleeping' : 'drowsy';
    else if (h < 1.5) { if (this._wokenOnce) this.mood = 'awake'; }
    else if (h < 2.5) this.mood = 'content';
    else if (h < 3.5) this.mood = 'happy';
    else this.mood = 'ecstatic';
  }

  // Purr volume: 0 (sleeping) → 1 (ecstatic)
  get purrVolume() {
    const idx = STATE_INDEX[this.mood] ?? 1;
    return [0, 0, 0.15, 0.4, 0.7, 1.0][idx];
  }

  // Breath rate in cycles per second
  get breathRate() {
    return [0.4, 0.5, 0.55, 0.6, 0.75, 1.0][STATE_INDEX[this.mood] ?? 1];
  }

  // Whether hearts should spawn on touch
  get spawnHearts() {
    return STATE_INDEX[this.mood] >= STATE_INDEX['content'];
  }
}
