// WebGL bloom pass — Phase 3
// Reads the 2D canvas as a texture, outputs soft glow additively blended via CSS mix-blend-mode: screen

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_THRESHOLD = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float brightness = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = brightness > 0.25 ? c : vec4(0.0);
}`;

const FRAG_BLUR = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform vec2 u_res;
varying vec2 v_uv;
void main() {
  vec2 step = u_dir / u_res;
  vec4 sum = vec4(0.0);
  float weights[9];
  weights[0]=0.0625; weights[1]=0.125; weights[2]=0.0625;
  weights[3]=0.125;  weights[4]=0.25;  weights[5]=0.125;
  weights[6]=0.0625; weights[7]=0.125; weights[8]=0.0625;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      sum += texture2D(u_tex, v_uv + vec2(float(i), float(j)) * step) * weights[(i+1)*3+(j+1)];
    }
  }
  gl_FragColor = sum;
}`;

function createShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function createProgram(gl, vertSrc, fragSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, createShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, createShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  return prog;
}

export class BloomPass {
  constructor(bloomCanvas, sourceCanvas) {
    this._src = sourceCanvas;
    this._canvas = bloomCanvas;
    this._gl = null;
    this._ready = false;
    this._init();
  }

  _init() {
    const gl = this._canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return; // fallback — bloom skipped silently
    this._gl = gl;

    const quad = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this._threshProg = createProgram(gl, VERT_SRC, FRAG_THRESHOLD);
    this._blurProg   = createProgram(gl, VERT_SRC, FRAG_BLUR);

    this._srcTex = gl.createTexture();
    this._ready = true;
  }

  render() {
    if (!this._ready) return;
    const gl = this._gl;
    const w = this._canvas.width;
    const h = this._canvas.height;

    gl.viewport(0, 0, w, h);

    // Upload source canvas as texture
    gl.bindTexture(gl.TEXTURE_2D, this._srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Threshold pass (output to bloom canvas directly for now — simplified single-pass)
    gl.useProgram(this._threshProg);
    const posLoc = gl.getAttribLocation(this._threshProg, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(this._threshProg, 'u_tex'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(w, h) {
    if (!this._gl) return;
    // Run at half resolution for performance
    this._canvas.width = Math.floor(w * 0.5);
    this._canvas.height = Math.floor(h * 0.5);
  }
}
