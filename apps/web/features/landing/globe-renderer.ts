import land from "./globe-land-points.json";
import { geographicVector, INITIAL_LONGITUDE, VIEW_LATITUDE } from "./globe-geometry";

const vertex = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() {
  vPosition = aPosition;
  gl_Position = vec4(aPosition * .88, 0., 1.);
}`;

const sphereFragment = `
precision mediump float;
varying vec2 vPosition;
uniform float uPixels;
void main() {
  float radius = dot(vPosition, vPosition);
  if (radius > 1.) discard;
  vec3 normal = vec3(vPosition, sqrt(1. - radius));
  float light = max(0., dot(normal, normalize(vec3(-.45, .65, 1.))));
  float edge = pow(1. - normal.z, 2.);
  vec3 color = mix(vec3(.84, .88, .93), vec3(.986, .991, 1.), light);
  color -= edge * .028;
  float alpha = 1. - smoothstep(1. - 3. / uPixels, 1., radius);
  gl_FragColor = vec4(color, alpha);
}`;

const pointVertex = `
attribute vec3 aPosition;
uniform float uLongitude;
uniform float uTilt;
uniform float uSize;
varying float vDepth;
void main() {
  float x = cos(uLongitude) * aPosition.x - sin(uLongitude) * aPosition.z;
  float z = sin(uLongitude) * aPosition.x + cos(uLongitude) * aPosition.z;
  float y = cos(uTilt) * aPosition.y - sin(uTilt) * z;
  vDepth = sin(uTilt) * aPosition.y + cos(uTilt) * z;
  gl_Position = vec4(x * .88, y * .88, 0., 1.);
  gl_PointSize = uSize;
}`;

const pointFragment = `
precision mediump float;
varying float vDepth;
void main() {
  if (vDepth <= .025) discard;
  float radius = length(gl_PointCoord - .5);
  float alpha = (1. - smoothstep(.28, .5, radius)) * (.32 + .38 * vDepth);
  gl_FragColor = vec4(.51, .584, .678, alpha);
}`;

export type GlobeRenderer = {
  setMotion: (playing: boolean) => void;
  setLongitude: (longitude: number) => void;
  dispose: () => void;
};

/** Two draws, no texture/network requests, no scene graph or retained animation framework. */
export function createGlobeRenderer(
  canvas: HTMLCanvasElement,
  onFrame: (longitude: number) => void,
  onUnavailable: () => void,
): GlobeRenderer {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL unavailable");

  const buffers: WebGLBuffer[] = [];
  const programs: WebGLProgram[] = [];
  const shaders: WebGLShader[] = [];
  let disposed = false;
  let frame = 0;
  let playing = false;
  let visible = true;
  let longitude = INITIAL_LONGITUDE;
  let lastTime = 0;
  let resizeObserver: ResizeObserver | undefined;
  let intersectionObserver: IntersectionObserver | undefined;

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", visibilityChanged);
    canvas.removeEventListener("webglcontextlost", contextLost);
    for (const buffer of buffers) gl!.deleteBuffer(buffer);
    for (const program of programs) gl!.deleteProgram(program);
    for (const shader of shaders) gl!.deleteShader(shader);
    gl!.getExtension("WEBGL_lose_context")?.loseContext();
  }

  function contextLost() {
    dispose();
    onUnavailable();
  }

  function program(vertexSource: string, fragmentSource: string) {
    const result = gl!.createProgram();
    if (!result) throw new Error("Globe program unavailable");
    programs.push(result);
    for (const [type, source] of [[gl!.VERTEX_SHADER, vertexSource], [gl!.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl!.createShader(type);
      if (!shader) throw new Error("Globe shader unavailable");
      shaders.push(shader);
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error("Globe shader failed");
      gl!.attachShader(result, shader);
    }
    gl!.linkProgram(result);
    if (!gl!.getProgramParameter(result, gl!.LINK_STATUS)) throw new Error("Globe program failed");
    return result;
  }

  function buffer(data: Float32Array) {
    const result = gl!.createBuffer();
    if (!result) throw new Error("Globe buffer unavailable");
    buffers.push(result);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, result);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    return result;
  }

  let draw: () => void;
  function tick(time: number) {
    if (disposed) return;
    // 30 fps maximum; no catch-up after an inactive tab or main-thread stall.
    if (time - lastTime >= 1000 / 30) {
      longitude = (longitude + Math.min(time - lastTime, 100) * .0025) % 360;
      lastTime = time;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function syncMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!disposed && playing && visible && !document.hidden) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function visibilityChanged() {
    // A paused canvas may have been cleared by a resize while the tab was hidden.
    if (!document.hidden) resize();
    syncMotion();
  }

  function resize() {
    if (disposed) return;
    const size = Math.max(1, Math.min(960, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 1.5))));
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
      gl!.viewport(0, 0, size, size);
    }
    if (visible && !document.hidden) draw();
  }

  try {
    const sphere = program(vertex, sphereFragment);
    const dots = program(pointVertex, pointFragment);
    const quad = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    const positions = new Float32Array(land.length / 2 * 3);
    for (let i = 0; i < land.length; i += 2) {
      positions.set(geographicVector(land[i], land[i + 1]), i / 2 * 3);
    }
    const points = buffer(positions);
    const spherePosition = gl.getAttribLocation(sphere, "aPosition");
    const pointPosition = gl.getAttribLocation(dots, "aPosition");
    const pixelsUniform = gl.getUniformLocation(sphere, "uPixels");
    const longitudeUniform = gl.getUniformLocation(dots, "uLongitude");
    const tiltUniform = gl.getUniformLocation(dots, "uTilt");
    const sizeUniform = gl.getUniformLocation(dots, "uSize");
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    draw = () => {
      if (disposed) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(sphere);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(spherePosition);
      gl.vertexAttribPointer(spherePosition, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(pixelsUniform, canvas.width);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(spherePosition);
      gl.useProgram(dots);
      gl.bindBuffer(gl.ARRAY_BUFFER, points);
      gl.enableVertexAttribArray(pointPosition);
      gl.vertexAttribPointer(pointPosition, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(longitudeUniform, longitude * Math.PI / 180);
      gl.uniform1f(tiltUniform, VIEW_LATITUDE * Math.PI / 180);
      gl.uniform1f(sizeUniform, Math.max(1.5, canvas.width * .0038));
      gl.drawArrays(gl.POINTS, 0, positions.length / 3);
      gl.disableVertexAttribArray(pointPosition);
      onFrame(longitude);
    };

    canvas.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("resize", resize);
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resize();
      syncMotion();
    });
    intersectionObserver.observe(canvas);
    resize();

    return {
      setMotion(value) { playing = value; syncMotion(); },
      setLongitude(value) { longitude = value; if (visible && !document.hidden) draw(); },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
