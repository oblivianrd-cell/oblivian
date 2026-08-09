/* ============================================================
   landing-bubble.js — bolha líquida WebGL2 na faixa do CTA.
   Porte VANILLA do componente `createBubble` do canvasui.dev
   (https://canvasui.dev/docs/components/bubble). O original é
   React; só o wrapper era React — o núcleo já era DOM puro.
   Mudanças no porte: tipos TS removidos, optional chaining
   trocado por checagem explícita (resto do projeto é ES5),
   cores ajustadas pra marca, e `content` = a própria band.

   Raymarching de 24 esferas fundidas por smoothMin = rastro
   líquido que segue o ponteiro. Refração real do fundo exige a
   API experimental "HTML in canvas" (drawElementImage +
   requestPaint); sem ela cai num filme iridescente — o shader
   já trata os dois casos (uHasContent).
   ============================================================ */
(function (App) {
  "use strict";

  var MAX_TRAIL = 24;

  var DEFAULTS = {
    size: 30, trail: 24, follow: 0.5, blend: 14, speed: 2,
    refraction: 80, dispersion: 1, frost: 0, shine: 0.25, rim: 0.5,
    iridescence: 1, intensity: 0.9, tint: [1, 1, 1], tintStrength: 0,
    colorA: [0.2902, 0.4549, 0.7216], colorB: [0.4118, 0.4118, 0.4157],
    fallbackOpacity: 1
  };

  var VERT = "#version 300 es\n" +
    "precision highp float;\n" +
    "layout(location = 0) in vec2 aPos;\n" +
    "void main () {\n" +
    "  gl_Position = vec4(aPos, 0.0, 1.0);\n" +
    "}";

  var FRAG = "#version 300 es\n\
precision highp float;\n\
out vec4 outColor;\n\
uniform sampler2D uContent;\n\
uniform vec2 uResolution;\n\
uniform float uMaxX;\n\
uniform float uDpr;\n\
uniform float uTime;\n\
uniform float uHasContent;\n\
uniform int uCount;\n\
uniform vec2 uTrail[" + MAX_TRAIL + "];\n\
uniform float uBaseRadius;\n\
uniform float uBlend;\n\
uniform float uRefraction;\n\
uniform float uDispersion;\n\
uniform float uFrost;\n\
uniform float uShine;\n\
uniform float uRim;\n\
uniform float uIridescence;\n\
uniform float uIntensity;\n\
uniform vec3 uTint;\n\
uniform float uTintStrength;\n\
uniform vec3 uColorA;\n\
uniform vec3 uColorB;\n\
uniform float uFallbackAlpha;\n\
\n\
const float EPS = 1e-4;\n\
const int ITR = 16;\n\
\n\
vec3 page (vec2 px, float lod) {\n\
  vec2 uv = px / uResolution;\n\
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);\n\
  uv.y = clamp(uv.y, 0.0005, 0.9995);\n\
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));\n\
}\n\
\n\
float rnd3D (vec3 p) {\n\
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);\n\
}\n\
\n\
float noise3D (vec3 p) {\n\
  vec3 i = floor(p);\n\
  vec3 f = fract(p);\n\
  float a000 = rnd3D(i);\n\
  float a100 = rnd3D(i + vec3(1.0, 0.0, 0.0));\n\
  float a010 = rnd3D(i + vec3(0.0, 1.0, 0.0));\n\
  float a110 = rnd3D(i + vec3(1.0, 1.0, 0.0));\n\
  float a001 = rnd3D(i + vec3(0.0, 0.0, 1.0));\n\
  float a101 = rnd3D(i + vec3(1.0, 0.0, 1.0));\n\
  float a011 = rnd3D(i + vec3(0.0, 1.0, 1.0));\n\
  float a111 = rnd3D(i + vec3(1.0, 1.0, 1.0));\n\
  vec3 u = f * f * (3.0 - 2.0 * f);\n\
  float k0 = a000;\n\
  float k1 = a100 - a000;\n\
  float k2 = a010 - a000;\n\
  float k3 = a001 - a000;\n\
  float k4 = a000 - a100 - a010 + a110;\n\
  float k5 = a000 - a010 - a001 + a011;\n\
  float k6 = a000 - a100 - a001 + a101;\n\
  float k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;\n\
  return k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y +\n\
    k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;\n\
}\n\
\n\
float smoothMin (float d1, float d2, float k) {\n\
  float h = exp(-k * d1) + exp(-k * d2);\n\
  return -log(max(h, 1e-12)) / k;\n\
}\n\
\n\
float map (vec3 p) {\n\
  float radius = uBaseRadius * float(uCount);\n\
  float d = 1e5;\n\
  for (int i = 0; i < " + MAX_TRAIL + "; i++) {\n\
    if (i >= uCount) break;\n\
    float sphere = length(p - vec3(uTrail[i], 0.0)) -\n\
      (radius - uBaseRadius * float(i));\n\
    d = smoothMin(d, sphere, uBlend);\n\
  }\n\
  return d;\n\
}\n\
\n\
vec3 generateNormal (vec3 p) {\n\
  return normalize(vec3(\n\
    map(p + vec3(EPS, 0.0, 0.0)) - map(p + vec3(-EPS, 0.0, 0.0)),\n\
    map(p + vec3(0.0, EPS, 0.0)) - map(p + vec3(0.0, -EPS, 0.0)),\n\
    map(p + vec3(0.0, 0.0, EPS)) - map(p + vec3(0.0, 0.0, -EPS))));\n\
}\n\
\n\
vec3 dropletColor (vec3 normal, vec3 rayDir) {\n\
  vec3 reflectDir = reflect(rayDir, normal);\n\
  float noisePosTime = noise3D(reflectDir * 2.0 + uTime);\n\
  float noiseNegTime = noise3D(reflectDir * 2.0 - uTime);\n\
  vec3 color0 = uColorA * noisePosTime;\n\
  vec3 color1 = uColorB * noiseNegTime;\n\
  return (color0 + color1) * uIntensity;\n\
}\n\
\n\
void main () {\n\
  vec2 frag = gl_FragCoord.xy;\n\
  float minRes = min(uResolution.x, uResolution.y);\n\
  vec2 p = (frag * 2.0 - uResolution) / minRes;\n\
  vec3 ray = vec3(p, 1.0);\n\
  vec3 rayDir = vec3(0.0, 0.0, -1.0);\n\
  float dist = 0.0;\n\
  for (int i = 0; i < ITR; ++i) {\n\
    dist = map(ray);\n\
    ray += rayDir * dist;\n\
    if (dist < EPS || dist > 8.0) break;\n\
  }\n\
  float cov = 1.0 - smoothstep(0.0, 3.0 / minRes, dist);\n\
  if (!(cov > 0.001)) {\n\
    outColor = vec4(0.0);\n\
    return;\n\
  }\n\
  vec3 n = generateNormal(ray);\n\
  vec3 glints = pow(max(dropletColor(n, rayDir), 0.0), vec3(7.0));\n\
  vec3 L = normalize(vec3(-0.5, 0.7, 0.6));\n\
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);\n\
  vec3 color;\n\
  float alpha = cov;\n\
  if (uHasContent > 0.5) {\n\
    float depth = uRefraction * uDpr;\n\
    float ca = uDispersion * 0.03;\n\
    vec3 rvR = refract(rayDir, n, 1.0 / (1.33 - ca));\n\
    vec3 rvG = refract(rayDir, n, 1.0 / 1.33);\n\
    vec3 rvB = refract(rayDir, n, 1.0 / (1.33 + ca));\n\
    vec2 offR = rvR.xy * (depth / max(abs(rvR.z), 0.35));\n\
    vec2 offG = rvG.xy * (depth / max(abs(rvG.z), 0.35));\n\
    vec2 offB = rvB.xy * (depth / max(abs(rvB.z), 0.35));\n\
    float lod = max(uFrost * 5.0, log2(1.0 + length(offG) * 0.05 / uDpr));\n\
    vec3 refr = vec3(\n\
      page(frag + offR, lod).r,\n\
      page(frag + offG, lod).g,\n\
      page(frag + offB, lod).b);\n\
    refr *= mix(vec3(1.0), uTint, clamp(uTintStrength, 0.0, 1.0));\n\
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);\n\
    refr *= 1.0 - 0.35 * uRim * edge;\n\
    color = pow(max(refr, 0.0), vec3(1.0 / 2.2));\n\
    color += glints * uIridescence;\n\
    color += vec3(spec * uShine * 0.9);\n\
  } else {\n\
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);\n\
    vec3 filmTint = mix(vec3(0.9), uTint, clamp(uTintStrength, 0.0, 1.0));\n\
    float fade = cov * clamp(uFallbackAlpha, 0.0, 1.0);\n\
    vec3 light = glints * uIridescence * 0.65 + vec3(spec * uShine * 1.5) +\n\
      filmTint * (0.55 * max(uRim, 0.4) * edge + 0.03);\n\
    float a = fade * clamp(0.08 + 0.4 * edge, 0.0, 1.0);\n\
    outColor = vec4(light * fade, a);\n\
    return;\n\
  }\n\
  outColor = vec4(color * alpha, alpha);\n\
}";

  function supportsHtmlInCanvas() {
    if (typeof document === "undefined") return false;
    var probe = document.createElement("canvas");
    var ctx = probe.getContext("2d");
    return !!(ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function");
  }

  function createBubble(elements, options) {
    var config = {};
    var k;
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) config[k] = DEFAULTS[k];
    if (options) for (k in options) if (Object.prototype.hasOwnProperty.call(options, k)) config[k] = options[k];

    var source = elements.source, content = elements.content, output = elements.output;

    var gl = output.getContext("webgl2", {
      alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;

    var sourceCtx = source.getContext("2d");
    var htmlInCanvas = !!(sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof source.requestPaint === "function");

    var contentDirty = false;
    var wake = function () {};

    if (htmlInCanvas) {
      source.onpaint = function () {
        try {
          sourceCtx.reset();
          sourceCtx.drawElementImage(content, 0, 0);
          contentDirty = true;
          wake();
        } catch (e) {}
      };
    }

    function compile(type, text) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Bubble shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    var vertexShader = compile(gl.VERTEX_SHADER, VERT);
    var fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    var uniforms = {};
    var uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < uniformCount; i++) {
      var info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.generateMipmap(gl.TEXTURE_2D);

    var contentMaxX = 1;

    function syncCanvasSize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var width = Math.max(1, Math.round(output.clientWidth * dpr));
      var height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width; output.height = height;
      }
      contentMaxX = Math.min(1, Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)));
      if (htmlInCanvas) {
        var sw = Math.max(1, Math.round(source.clientWidth * dpr));
        var sh = Math.max(1, Math.round(source.clientHeight * dpr));
        if (source.width !== sw || source.height !== sh) { source.width = sw; source.height = sh; }
        source.requestPaint();
      }
    }

    syncCanvasSize();

    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    var trailX = new Float32Array(MAX_TRAIL);
    var trailY = new Float32Array(MAX_TRAIL);
    var trailData = new Float32Array(MAX_TRAIL * 2);
    var headX = output.clientWidth / 2;
    var headY = output.clientHeight / 2;
    var targetX = headX, targetY = headY;
    trailX.fill(headX); trailY.fill(headY);
    var presence = 0, presenceTarget = 0, hasPointer = false, time = 0;

    function activeCount() {
      return Math.min(Math.max(Math.round(config.trail), 1), MAX_TRAIL);
    }

    function render() {
      uploadContent();
      var dpr = output.width / Math.max(output.clientWidth, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (presence <= 0.004) return;

      var count = activeCount();
      var minRes = Math.min(output.width, output.height);
      var headRadius = Math.max(config.size, 4) * dpr * presence;
      var baseRadius = (headRadius * 2) / (minRes * count);
      var blend = Math.max(config.blend, 0.5);

      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < count; i++) {
        var dx = trailX[i] * dpr;
        var dy = output.height - trailY[i] * dpr;
        trailData[i * 2] = (dx * 2 - output.width) / minRes;
        trailData[i * 2 + 1] = (dy * 2 - output.height) / minRes;
        minX = Math.min(minX, dx); maxX = Math.max(maxX, dx);
        minY = Math.min(minY, dy); maxY = Math.max(maxY, dy);
      }

      var pad = headRadius + ((Math.log(count + 1) / blend) * minRes) / 2 +
        Math.abs(config.refraction) * dpr * 0.5 + 32 * dpr;
      var sx = Math.max(0, Math.floor(minX - pad));
      var sy = Math.max(0, Math.floor(minY - pad));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(sx, sy,
        Math.min(output.width - sx, Math.ceil(maxX - minX + pad * 2)),
        Math.min(output.height - sy, Math.ceil(maxY - minY + pad * 2)));

      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uDpr, dpr);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1i(uniforms.uCount, count);
      gl.uniform2fv(uniforms["uTrail[0]"], trailData);
      gl.uniform1f(uniforms.uBaseRadius, baseRadius);
      gl.uniform1f(uniforms.uBlend, blend);
      gl.uniform1f(uniforms.uRefraction, config.refraction);
      gl.uniform1f(uniforms.uDispersion, Math.max(config.dispersion, 0));
      gl.uniform1f(uniforms.uFrost, Math.min(Math.max(config.frost, 0), 1));
      gl.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
      gl.uniform1f(uniforms.uRim, Math.min(Math.max(config.rim, 0), 2));
      gl.uniform1f(uniforms.uIridescence, Math.max(config.iridescence, 0));
      gl.uniform1f(uniforms.uIntensity, Math.max(config.intensity, 0));
      gl.uniform3f(uniforms.uTint, config.tint[0], config.tint[1], config.tint[2]);
      gl.uniform1f(uniforms.uTintStrength, Math.min(Math.max(config.tintStrength, 0), 1));
      gl.uniform3f(uniforms.uColorA, config.colorA[0], config.colorA[1], config.colorA[2]);
      gl.uniform3f(uniforms.uColorB, config.colorB[0], config.colorB[1], config.colorB[2]);
      gl.uniform1f(uniforms.uFallbackAlpha, Math.min(Math.max(config.fallbackOpacity, 0), 1));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    }

    var raf = 0, lastTime = performance.now();
    var destroyed = false, running = false, visible = true;

    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var reducedMotion = motionQuery.matches;

    function frame(now) {
      if (destroyed) return;
      if (!visible) { running = false; return; }
      var delta = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      if (!reducedMotion) time += delta * Math.max(config.speed, 0);

      var follow = Math.min(Math.max(config.follow, 0.02), 1);
      var kHead = (reducedMotion || follow >= 1) ? 1 : 1 - Math.exp(-delta * (3 + follow * 30));
      var kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 10);

      headX += (targetX - headX) * kHead;
      headY += (targetY - headY) * kHead;
      for (var i = MAX_TRAIL - 1; i > 0; i--) {
        trailX[i] = trailX[i - 1];
        trailY[i] = trailY[i - 1];
      }
      trailX[0] = headX; trailY[0] = headY;
      var moved = Math.abs(targetX - headX) + Math.abs(targetY - headY);
      for (var j = 1; j < MAX_TRAIL; j++) {
        moved = Math.max(moved, Math.abs(trailX[j] - trailX[j - 1]) + Math.abs(trailY[j] - trailY[j - 1]));
      }
      presence += (presenceTarget - presence) * kScale;

      render();

      var settled = reducedMotion
        ? (moved < 0.1 && Math.abs(presenceTarget - presence) < 0.002 && !contentDirty)
        : (presence < 0.004 && presenceTarget === 0 && !contentDirty);
      if (settled) { presence = presenceTarget; running = false; return; }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }

    wake = start;
    start();

    function onPointerMove(event) {
      var rect = output.getBoundingClientRect();
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
      if (!hasPointer) {
        headX = targetX; headY = targetY;
        trailX.fill(targetX); trailY.fill(targetY);
        hasPointer = true;
      }
      presenceTarget = 1;
      start();
    }

    function onPointerLeave() {
      presenceTarget = 0;
      hasPointer = false;
      start();
    }

    content.addEventListener("pointermove", onPointerMove, { passive: true });
    content.addEventListener("pointerleave", onPointerLeave, { passive: true });

    function onScroll() { start(); }
    content.addEventListener("scroll", onScroll, { passive: true });

    function onMotionChange() { reducedMotion = motionQuery.matches; start(); }
    motionQuery.addEventListener("change", onMotionChange);

    var observer = new ResizeObserver(function () { syncCanvasSize(); start(); });
    observer.observe(output);
    observer.observe(content);

    var intersection = new IntersectionObserver(function (entries) {
      var last = entries[entries.length - 1];
      visible = last ? last.isIntersecting : true;
      if (visible) start();
    });
    intersection.observe(output);

    return {
      setOptions: function (next) {
        for (var kk in next) if (Object.prototype.hasOwnProperty.call(next, kk)) config[kk] = next[kk];
        start();
      },
      resize: function () { syncCanvasSize(); start(); },
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        content.removeEventListener("pointermove", onPointerMove);
        content.removeEventListener("pointerleave", onPointerLeave);
        content.removeEventListener("scroll", onScroll);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) source.onpaint = null;
      }
    };
  }

  /* ---- monta na faixa do CTA da landing ---- */
  function init() {
    var band = document.querySelector(".lp-cta");
    if (!band || !window.WebGL2RenderingContext) return;
    // sem mouse a bolha não teria o que seguir (mesma regra da lente antiga)
    if (window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    var source = document.createElement("canvas");   // só usado com "HTML in canvas"
    source.style.display = "none";
    band.appendChild(source);

    var output = document.createElement("canvas");
    output.className = "lp-bubble";
    output.setAttribute("aria-hidden", "true");
    band.appendChild(output);

    var inst = createBubble({ source: source, content: band, output: output }, {
      size: 62,
      trail: 24,
      follow: 0.42,
      blend: 12,
      shine: 0.45,
      rim: 0.85,
      iridescence: 1.15,
      intensity: 1.0,
      // paleta da marca: violeta + ciano (era azul/cinza no original)
      colorA: [0.486, 0.361, 1.0],
      colorB: [0.133, 0.827, 0.933],
      fallbackOpacity: 1
    });
    if (!inst) { output.remove(); source.remove(); return; }   // sem WebGL2 → sem bolha, band segue normal
    App._landingBubble = inst;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window.App = window.App || {});
