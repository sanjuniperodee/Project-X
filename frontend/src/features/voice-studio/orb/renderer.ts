import { HALO_FRAGMENT, HALO_VERTEX, MESH_FRAGMENT, MESH_VERTEX } from './shaders';

export interface OrbFrame {
  time: number;
  /** Loudness of whoever is speaking, 0…1, already smoothed. */
  level: number;
  /** 0…1 blends of the assistant speaking and thinking. */
  speak: number;
  think: number;
  cool: [number, number, number];
  hot: [number, number, number];
}

/** Radius of the sphere as a share of half the canvas height: the rest is room for the halo. */
const SCALE = 0.72;

/**
 * Draws the orb with plain WebGL (no library: two small programs and three buffers).
 * Throws when WebGL is not available; the component then shows a CSS fallback.
 */
export class OrbRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly mesh: WebGLProgram;
  private readonly halo: WebGLProgram;
  private readonly points: WebGLBuffer;
  private readonly lines: WebGLBuffer;
  private readonly corners: WebGLBuffer;
  private readonly pointCount: number;
  private readonly lineCount: number;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    density: number,
  ) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.mesh = program(gl, MESH_VERTEX, MESH_FRAGMENT);
    this.halo = program(gl, HALO_VERTEX, HALO_FRAGMENT);

    const shell = fibonacciSphere(density);
    const core = fibonacciSphere(Math.round(density * 0.22));
    const vertices = [...shell.map((p, i) => [...p, seed(i), 0]), ...core.map((p, i) => [...p, seed(i + 7919), 1])];
    this.pointCount = vertices.length;
    this.points = buffer(gl, new Float32Array(vertices.flat()));

    // Each node reaches for its nearest neighbours; a link is drawn once.
    const segments: number[] = [];
    const link = (set: number[][], offset: number, neighbours: number) => {
      for (const [a, b] of nearestPairs(set, neighbours)) segments.push(...vertices[offset + a]!, ...vertices[offset + b]!);
    };
    link(shell, 0, 3);
    link(core, shell.length, 3);
    this.lineCount = segments.length / 5;
    this.lines = buffer(gl, new Float32Array(segments));
    this.corners = buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(frame: OrbFrame): void {
    const { gl, canvas } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.halo);
    this.uniforms(this.halo, frame);
    gl.uniform2f(gl.getUniformLocation(this.halo, 'uRes'), canvas.width, canvas.height);
    bind(gl, this.halo, this.corners, [['aCorner', 2]], 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.mesh);
    this.uniforms(this.mesh, frame);
    gl.uniform1f(gl.getUniformLocation(this.mesh, 'uAspect'), canvas.width / canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.mesh, 'uDpr'), this.dpr);
    // Points scale with the canvas so the orb looks the same small and large.
    gl.uniform1f(gl.getUniformLocation(this.mesh, 'uPoint'), Math.max(1.8, canvas.height / this.dpr / 150));

    gl.uniform1f(gl.getUniformLocation(this.mesh, 'uLine'), 1);
    gl.uniform1f(gl.getUniformLocation(this.mesh, 'uAlpha'), 0.13 + 0.32 * frame.level + 0.12 * frame.think);
    bind(gl, this.mesh, this.lines, [['aPos', 3], ['aInfo', 2]], 5);
    gl.drawArrays(gl.LINES, 0, this.lineCount);

    gl.uniform1f(gl.getUniformLocation(this.mesh, 'uLine'), 0);
    gl.uniform1f(gl.getUniformLocation(this.mesh, 'uAlpha'), 1);
    bind(gl, this.mesh, this.points, [['aPos', 3], ['aInfo', 2]], 5);
    gl.drawArrays(gl.POINTS, 0, this.pointCount);
  }

  dispose(): void {
    const { gl } = this;
    for (const item of [this.points, this.lines, this.corners]) gl.deleteBuffer(item);
    gl.deleteProgram(this.mesh);
    gl.deleteProgram(this.halo);
    // The context itself goes with the canvas: losing it here would break a remount on the same canvas.
  }

  private uniforms(target: WebGLProgram, frame: OrbFrame): void {
    const { gl } = this;
    const set = (name: string, value: number) => gl.uniform1f(gl.getUniformLocation(target, name), value);
    set('uTime', frame.time);
    set('uLevel', frame.level);
    set('uSpeak', frame.speak);
    set('uThink', frame.think);
    set('uScale', SCALE);
    gl.uniform3fv(gl.getUniformLocation(target, 'uCool'), frame.cool);
    gl.uniform3fv(gl.getUniformLocation(target, 'uHot'), frame.hot);
  }
}

function program(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Orb shader: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  };
  const result = gl.createProgram()!;
  gl.attachShader(result, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(result, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(`Orb program: ${gl.getProgramInfoLog(result)}`);
  return result;
}

function buffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
  const result = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, result);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return result;
}

function bind(gl: WebGLRenderingContext, target: WebGLProgram, data: WebGLBuffer, attributes: Array<[string, number]>, stride: number): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, data);
  let offset = 0;
  for (const [name, size] of attributes) {
    const location = gl.getAttribLocation(target, name);
    if (location >= 0) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, offset * 4);
    }
    offset += size;
  }
}

/** Points spread over a unit sphere: an even spiral, shaken a little so it reads as tissue, not as a grid. */
function fibonacciSphere(count: number): number[][] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const shake = 1.1 / Math.sqrt(count);
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count;
    const radius = Math.sqrt(1 - y * y);
    const p = [
      Math.cos(golden * i) * radius + (seed(i * 3 + 1) - 0.5) * shake,
      y + (seed(i * 3 + 2) - 0.5) * shake,
      Math.sin(golden * i) * radius + (seed(i * 3 + 3) - 0.5) * shake,
    ];
    const length = Math.hypot(p[0]!, p[1]!, p[2]!);
    return p.map((v) => v / length);
  });
}

/** Stable pseudo-random 0…1 per vertex. */
const seed = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Index pairs joining every point to its `k` nearest neighbours, without duplicates. */
function nearestPairs(points: number[][], k: number): Array<[number, number]> {
  const pairs = new Set<string>();
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const nearest: Array<[number, number]> = [];
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const b = points[j]!;
      const d = (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
      if (nearest.length < k) nearest.push([d, j]);
      else {
        let worst = 0;
        for (let n = 1; n < k; n++) if (nearest[n]![0] > nearest[worst]![0]) worst = n;
        if (d < nearest[worst]![0]) nearest[worst] = [d, j];
      }
    }
    for (const [, j] of nearest) {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      out.push([i, j]);
    }
  }
  return out;
}
