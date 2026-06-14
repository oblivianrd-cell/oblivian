/* ============================================================
   landing-glass.js — efeito "vidro líquido" (técnica Aave).
   feDisplacementMap + mapa de deslocamento gerado em canvas,
   aplicado no backdrop-filter (refrata o conteúdo atrás).
   Chromium/Edge/Android: refração real. Safari/Firefox: cai
   no blur translúcido do CSS (graceful). ID de filtro novo a
   cada update (evita cache congelado do Safari). Só na landing.
   ============================================================ */
(function () {
  "use strict";
  var support = (function () {
    try { return CSS.supports("backdrop-filter", "url(#a) blur(1px)") || CSS.supports("-webkit-backdrop-filter", "url(#a) blur(1px)"); }
    catch (e) { return false; }
  })();
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SVGNS = "http://www.w3.org/2000/svg";
  var cv, ctx, host, idc = 0;

  function sd(px, py, hw, hh, r) {
    var qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
    var ax = Math.max(qx, 0), ay = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r;
  }

  // mapa: R=desloc. horizontal, G=vertical; centro neutro (128). 4-fold? simples aqui.
  function buildMap(W, H, r, depth, curv) {
    W = Math.max(2, Math.round(W)); H = Math.max(2, Math.round(H));
    r = Math.min(r, Math.min(W, H) / 2);
    cv.width = W; cv.height = H;
    var img = ctx.createImageData(W, H), d = img.data, hw = W / 2, hh = H / 2, eps = 1;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var px = x - hw + 0.5, py = y - hh + 0.5, s0 = sd(px, py, hw, hh, r), R = 128, G = 128, inside = -s0;
      if (s0 < 0 && inside < depth) {
        var gx = (sd(px + eps, py, hw, hh, r) - sd(px - eps, py, hw, hh, r)) / (2 * eps);
        var gy = (sd(px, py + eps, hw, hh, r) - sd(px, py - eps, hw, hh, r)) / (2 * eps);
        var l = Math.hypot(gx, gy) || 1, nx = gx / l, ny = gy / l;
        var t = 1 - inside / depth, p = Math.pow(t < 0 ? 0 : t, curv);
        R = 128 + nx * p * 127; G = 128 + ny * p * 127;
      }
      var i = (y * W + x) * 4;
      d[i] = R < 0 ? 0 : R > 255 ? 255 : R;
      d[i + 1] = G < 0 ? 0 : G > 255 ? 255 : G;
      d[i + 2] = 128; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }

  function applyTo(el, o) {
    var w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    var rs = getComputedStyle(el);
    var rad = parseFloat(rs.borderTopLeftRadius) || o.radius || 0;
    var id = "lpg" + (idc++);                                   // id novo sempre (Safari)
    var f = document.createElementNS(SVGNS, "filter");
    f.id = id; f.setAttribute("x", "-20%"); f.setAttribute("y", "-20%");
    f.setAttribute("width", "140%"); f.setAttribute("height", "140%");
    f.setAttribute("color-interpolation-filters", "sRGB");
    var fi = document.createElementNS(SVGNS, "feImage");
    fi.setAttribute("href", buildMap(w, h, rad, o.depth, o.curv));
    fi.setAttribute("x", 0); fi.setAttribute("y", 0); fi.setAttribute("width", w); fi.setAttribute("height", h);
    fi.setAttribute("preserveAspectRatio", "none"); fi.setAttribute("result", "m");
    var dm = document.createElementNS(SVGNS, "feDisplacementMap");
    dm.setAttribute("in", "SourceGraphic"); dm.setAttribute("in2", "m");
    dm.setAttribute("scale", o.scale); dm.setAttribute("xChannelSelector", "R"); dm.setAttribute("yChannelSelector", "G");
    f.appendChild(fi); f.appendChild(dm);
    if (el._gf) { var old = document.getElementById(el._gf); if (old) old.remove(); }
    el._gf = id; host.appendChild(f);
    var bf = "blur(" + o.blur + "px) saturate(" + o.sat + ") url(#" + id + ")";
    el.style.backdropFilter = bf; el.style.webkitBackdropFilter = bf;
  }

  var TARGETS = [
    { sel: ".lp-nav",        o: { depth: 18, curv: 2.0, scale: 16, blur: 7, sat: 1.3 } },
    { sel: ".lp-lang__menu", o: { depth: 14, curv: 2.2, scale: 12, blur: 11, sat: 1.4, radius: 14 } }
  ];

  // lente de vidro que SEGUE o mouse dentro de um elemento (refrata o fundo dele).
  // mapa gerado 1x (forma fixa); ao mover só muda o transform (barato, suave).
  function followLens(container, o) {
    if (!container) return;
    // só em dispositivos com mouse (hover real) — em touch a lente ficaria parada cobrindo o texto
    if (window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var LW = o.size, R = LW / 2;
    var lens = document.createElement("div");
    lens.className = "lp-lens";
    lens.style.width = lens.style.height = LW + "px";
    container.appendChild(lens);
    if (support && !reduce) {
      var id = "lplens" + (idc++);
      var f = document.createElementNS(SVGNS, "filter");
      f.id = id; f.setAttribute("x", "-25%"); f.setAttribute("y", "-25%");
      f.setAttribute("width", "150%"); f.setAttribute("height", "150%");
      f.setAttribute("color-interpolation-filters", "sRGB");
      var fi = document.createElementNS(SVGNS, "feImage");
      fi.setAttribute("href", buildMap(LW, LW, R, o.depth, o.curv));
      fi.setAttribute("x", 0); fi.setAttribute("y", 0); fi.setAttribute("width", LW); fi.setAttribute("height", LW);
      fi.setAttribute("preserveAspectRatio", "none"); fi.setAttribute("result", "m");
      var dm = document.createElementNS(SVGNS, "feDisplacementMap");
      dm.setAttribute("in", "SourceGraphic"); dm.setAttribute("in2", "m");
      dm.setAttribute("scale", o.scale); dm.setAttribute("xChannelSelector", "R"); dm.setAttribute("yChannelSelector", "G");
      f.appendChild(fi); f.appendChild(dm); host.appendChild(f);
      var bf = "blur(" + o.blur + "px) saturate(" + o.sat + ") url(#" + id + ")";
      lens.style.backdropFilter = bf; lens.style.webkitBackdropFilter = bf;
    }
    var raf = 0, lx = 0, ly = 0;
    function paint() { raf = 0; lens.style.left = (lx - R) + "px"; lens.style.top = (ly - R) + "px"; }
    container.addEventListener("pointermove", function (e) {
      var r = container.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      // mantém a lente DENTRO da band (nunca cruza a borda/canto = sem vazamento)
      lx = r.width  > 2 * R ? Math.max(R, Math.min(r.width  - R, x)) : r.width / 2;
      ly = r.height > 2 * R ? Math.max(R, Math.min(r.height - R, y)) : r.height / 2;
      lens.classList.add("is-on");
      if (!raf) raf = requestAnimationFrame(paint);
    });
    container.addEventListener("pointerleave", function () { lens.classList.remove("is-on"); });
  }

  function init() {
    cv = document.createElement("canvas"); ctx = cv.getContext("2d");
    var s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("width", "0"); s.setAttribute("height", "0");
    s.style.position = "absolute"; s.style.pointerEvents = "none";
    document.body.appendChild(s); host = s;

    TARGETS.forEach(function (t) {
      Array.prototype.forEach.call(document.querySelectorAll(t.sel), function (el) {
        el.classList.add("lp-glass");
        if (!support || reduce) return;                         // fallback = blur do CSS
        var gen = function () { applyTo(el, t.o); };
        el._glassGen = gen;
        gen();
        var tm; addEventListener("resize", function () { clearTimeout(tm); tm = setTimeout(gen, 160); });
      });
    });

    // menu de idioma: gera ao abrir (fica 0×0 enquanto escondido)
    var btn = document.querySelector(".lp-lang__btn");
    if (btn) btn.addEventListener("click", function () {
      setTimeout(function () {
        var m = document.querySelector(".lp-lang__menu");
        if (m && m._glassGen && !m.hidden) m._glassGen();
      }, 30);
    });

    // lente de vidro seguindo o mouse na CTA
    followLens(document.querySelector(".lp-cta"), { size: 168, depth: 64, curv: 1.5, scale: 48, blur: 1.5, sat: 1.25 });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
