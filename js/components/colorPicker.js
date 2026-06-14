/* ============================================================
   components/colorPicker.js — Seletor de cor geral do app.
   Quadrado saturação/valor + matiz arco-íris + conta-gotas
   (window.EyeDropper) + entradas RGB + paletas prontas com lápis
   que abre o painel detalhado. Sem dependências externas.
   API:
     App.components.ColorPicker(initial, opts) -> { node, getValue }
       opts.swatches  : array de hex p/ paletas (padrão PALETTE)
       opts.allowClear: mostra botão "Sem cor" (padrão true)
     App.ui.pickColor(initial, onPick, opts) — abre em modal central
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.components = App.components || {};

  var PALETTE = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
    "#0ea5e9", "#3b82f6", "#6366f1", "#7c59ec", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
    "#ffffff", "#cbd5e1", "#94a3b8", "#475569", "#1f2937", "#000000"
  ];

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function hsvToRgb(h, s, v) {
    h = (h % 360 + 360) % 360; var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, s: mx ? d / mx : 0, v: mx };
  }
  function toHex(n) { var s = Math.max(0, Math.min(255, n)).toString(16); return s.length < 2 ? "0" + s : s; }
  function rgbToHex(r, g, b) { return "#" + toHex(r) + toHex(g) + toHex(b); }
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
    var n = parseInt(m[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function ColorPicker(initial, opts) {
    opts = opts || {};
    var swatchList = opts.swatches || PALETTE;
    var allowClear = opts.allowClear !== false;
    var rgb0 = hexToRgb(initial) || { r: 124, g: 92, b: 255 };
    var hsv = rgbToHsv(rgb0.r, rgb0.g, rgb0.b);
    var H = hsv.h, S = hsv.s, V = hsv.v;
    var hasColor = !!hexToRgb(initial);

    var svThumb = el("span", { class: "cp__svthumb" });
    var sv = el("div", { class: "cp__sv" }, svThumb);
    var hueRange = el("input", { type: "range", class: "cp__hue", min: "0", max: "360", step: "1", value: String(Math.round(H)) });
    var dot = el("span", { class: "cp__dot" });
    var eyeBtn = el("button", { class: "cp__eye", type: "button", title: "Conta-gotas" }, App.icon("palette", { size: "sm" }));
    var inR = el("input", { type: "number", class: "cp__num", min: "0", max: "255" });
    var inG = el("input", { type: "number", class: "cp__num", min: "0", max: "255" });
    var inB = el("input", { type: "number", class: "cp__num", min: "0", max: "255" });
    var inHex = el("input", { type: "text", class: "cp__num cp__hex", maxlength: "7", spellcheck: "false", autocapitalize: "off" });
    var swRow = el("div", { class: "cp__swatches" });   // paleta rápida (preenchida abaixo)

    function currentHex() { var c = hsvToRgb(H, S, V); return rgbToHex(c.r, c.g, c.b); }
    function markActive() {
      var cur = currentHex().toLowerCase();
      App.util.qsa(".cp__sw", swRow).forEach(function (b) {
        b.classList.toggle("is-active", (b.getAttribute("data-hex") || "").toLowerCase() === cur);
      });
    }
    function paint(updNums) {
      var hueRgb = hsvToRgb(H, 1, 1);
      sv.style.background = "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, " + rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b) + ")";
      svThumb.style.left = (S * 100) + "%";
      svThumb.style.top = ((1 - V) * 100) + "%";
      var c = hsvToRgb(H, S, V);
      svThumb.style.background = dot.style.background = rgbToHex(c.r, c.g, c.b);
      if (updNums) { inR.value = c.r; inG.value = c.g; inB.value = c.b; inHex.value = rgbToHex(c.r, c.g, c.b); }
      hasColor = true;
      markActive();
    }

    // preenche a paleta rápida: clicar aplica a cor na hora
    function setFromHex(hex) {
      var c = hexToRgb(hex); if (!c) return;
      var h2 = rgbToHsv(c.r, c.g, c.b); H = h2.h; S = h2.s; V = h2.v;
      hueRange.value = String(Math.round(H)); paint(true);
    }
    swatchList.forEach(function (hex) {
      var s = el("button", { class: "cp__sw", type: "button", title: hex, "data-hex": hex, style: { background: hex } });
      s.addEventListener("click", function () { setFromHex(hex); });
      swRow.appendChild(s);
    });

    paint(true);

    function pointSV(e) {
      var r = sv.getBoundingClientRect();
      var x = clamp01((e.clientX - r.left) / r.width), y = clamp01((e.clientY - r.top) / r.height);
      S = x; V = 1 - y; paint(true);
    }
    sv.addEventListener("pointerdown", function (e) {
      sv.setPointerCapture(e.pointerId); pointSV(e);
      function mv(ev) { pointSV(ev); }
      function up() { sv.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }
      sv.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    });
    hueRange.addEventListener("input", function () { H = parseInt(hueRange.value, 10) || 0; paint(true); });
    function fromNums() {
      var hsv2 = rgbToHsv(+inR.value || 0, +inG.value || 0, +inB.value || 0);
      H = hsv2.h; S = hsv2.s; V = hsv2.v; hueRange.value = String(Math.round(H)); paint(false);
    }
    [inR, inG, inB].forEach(function (i) { i.addEventListener("input", fromNums); });
    inHex.addEventListener("input", function () {
      var v = inHex.value.trim(); if (v && v[0] !== "#") v = "#" + v;
      var c = hexToRgb(v); if (!c) return;
      var h2 = rgbToHsv(c.r, c.g, c.b); H = h2.h; S = h2.s; V = h2.v;
      hueRange.value = String(Math.round(H)); paint(false); inR.value = c.r; inG.value = c.g; inB.value = c.b;
    });
    if (window.EyeDropper) {
      eyeBtn.addEventListener("click", function () {
        new window.EyeDropper().open().then(function (res) {
          var c = hexToRgb(res.sRGBHex); if (!c) return;
          var hsv2 = rgbToHsv(c.r, c.g, c.b); H = hsv2.h; S = hsv2.s; V = hsv2.v;
          hueRange.value = String(Math.round(H)); paint(true);
        }).catch(function () {});
      });
    } else { eyeBtn.style.display = "none"; }

    var numRow = el("div", { class: "cp__nums" },
      el("div", { class: "cp__numcell" }, inR, el("span", { class: "cp__numlbl" }, "R")),
      el("div", { class: "cp__numcell" }, inG, el("span", { class: "cp__numlbl" }, "G")),
      el("div", { class: "cp__numcell" }, inB, el("span", { class: "cp__numlbl" }, "B")),
      el("div", { class: "cp__numcell cp__numcell--hex" }, inHex, el("span", { class: "cp__numlbl" }, "HEX")));
    var hueRow = el("div", { class: "cp__huerow" }, eyeBtn, dot, hueRange);

    // painel sempre visível: paleta rápida no topo + área detalhada
    var panel = el("div", { class: "cp__panel is-open" },
      el("div", { class: "cp__quick" }, el("span", { class: "cp__quicklbl" }, "Cores rápidas"), swRow),
      sv, hueRow, numRow);

    var kids = [panel];
    if (allowClear) {
      var clearBtn = ui.Button({ label: "Sem cor", icon: "close", size: "sm", variant: "ghost", onClick: function () { hasColor = false; dot.style.background = "transparent"; } });
      clearBtn.classList.add("cp__clear");
      kids.push(clearBtn);
    }
    var node = el("div", { class: "cp" }, kids);
    return { node: node, getValue: function () { return hasColor ? currentHex() : ""; } };
  }

  /* abre o seletor em modal central; chama onPick(hex) ao aplicar */
  function pickColor(initial, onPick, opts) {
    opts = opts || {};
    var cp = ColorPicker(initial, { open: true, allowClear: opts.allowClear, swatches: opts.swatches });
    var ref = ui.openModal({ title: opts.title || "Escolher cor", scrimClass: "scrim--centered", body: cp.node, actions: [
      ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
      ui.Button({ label: "Aplicar", variant: "primary", onClick: function () { onPick(cp.getValue()); ref.close(); } })
    ] });
    return ref;
  }

  App.components.ColorPicker = ColorPicker;
  App.components.colorUtil = { hsvToRgb: hsvToRgb, rgbToHsv: rgbToHsv, rgbToHex: rgbToHex, hexToRgb: hexToRgb };
  App.ui.pickColor = pickColor;
})(window.App = window.App || {});
