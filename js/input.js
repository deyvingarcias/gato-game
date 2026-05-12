// Unified pointer + touch input handler

export class InputHandler {
  constructor(canvas) {
    this._canvas = canvas;
    this._dpr = window.devicePixelRatio || 1;

    this.isDown = false;
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;

    this._onDown = null;
    this._onMove = null;
    this._onUp = null;

    canvas.addEventListener('pointerdown', this._handleDown.bind(this));
    canvas.addEventListener('pointermove', this._handleMove.bind(this));
    canvas.addEventListener('pointerup',   this._handleUp.bind(this));
    canvas.addEventListener('pointercancel', this._handleUp.bind(this));
    canvas.style.touchAction = 'none';
  }

  onDown(fn) { this._onDown = fn; }
  onMove(fn) { this._onMove = fn; }
  onUp(fn)   { this._onUp = fn; }

  _toCanvas(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top),
    };
  }

  _handleDown(e) {
    e.preventDefault();
    const pos = this._toCanvas(e);
    this.prevX = pos.x;
    this.prevY = pos.y;
    this.x = pos.x;
    this.y = pos.y;
    this.isDown = true;
    this._canvas.setPointerCapture(e.pointerId);
    if (this._onDown) this._onDown(pos.x, pos.y);
  }

  _handleMove(e) {
    if (!this.isDown) return;
    e.preventDefault();
    const pos = this._toCanvas(e);
    this.prevX = this.x;
    this.prevY = this.y;
    this.x = pos.x;
    this.y = pos.y;
    if (this._onMove) this._onMove(pos.x, pos.y, pos.x - this.prevX, pos.y - this.prevY);
  }

  _handleUp(e) {
    this.isDown = false;
    if (this._onUp) this._onUp(this.x, this.y);
  }
}
