/* ============================================================
   components/catBadge.js — badge do gato ANIMADO (inline SVG).
   Fundo líquido (CSS) + gato respira/orelhas/bigodes/pisca +
   olhos seguem o mouse. Inline (não <img>) p/ animar no DOM.
   App.components.CatBadge() → retorna o elemento.
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el;
  App.components = App.components || {};

  var CAT_SVG =
    '<svg viewBox="0 0 2000 2000" fill="none" aria-hidden="true">' +
    '<g class="ac-body">' +
    '<g class="ac-earL"><path fill="#0e0f15" d="M800 590c-50-84-120-196-186-282-60-78-154-190-220-200-44-6-74 28-106 112-46 134-72 380-76 718L212 1160 800 1160Z"/></g>' +
    '<g class="ac-earR"><path fill="#0e0f15" d="M1822 1038c6-118 136-436.001 116-598.001-22-94-90-78-184-44-74 26-202 88-428 232L1326 1160 1822 1160Z"/></g>' +
    '<g class="ac-whiskL">' +
    '<path fill="#0e0f15" d="M240 1358 46 1364c-26 0-26 42 0 42L250 1422Z"/>' +
    '<path fill="#0e0f15" d="M260 1452 54 1522c-26 10-12 48 16 36L266 1518Z"/>' +
    '<path fill="#0e0f15" d="M300 1556 118 1640c-16 12-8 40 14 36 4 0 8-2 12-6L310 1600Z"/></g>' +
    '<g class="ac-whiskR">' +
    '<path fill="#0e0f15" d="M1742 1358 1936 1364c26 0 26 42 0 42L1732 1422Z"/>' +
    '<path fill="#0e0f15" d="M1722 1452 1928 1522c26 10 12 48-16 36L1716 1518Z"/>' +
    '<path fill="#0e0f15" d="M1682 1556 1864 1640c16 12 8 40-14 36-4 0-8-2-12-6L1672 1600Z"/></g>' +
    '<path fill="#0e0f15" d="M1852 1400c20-110-22-240-30-362C1720 720 1480 628 1326 628c-88-28-190-52-324-52-62 0-126 2-202 14C618 619 285 820 212 938C198 1016 120 1150 128 1270c0 26 4 52 6 94C140 1452 170 1556 228 1604c50 70 110 124 180 164 134 78 304 120 588 124 216 2 374-4 518-62 102-42 184-112 250-206C1816 1556 1852 1474 1852 1400Z"/>' +
    '<path fill="#fff" d="M774 1004c-42-34-98-66-174-66-158 0-304 134-304 328 0 162 112 322 284 322 76 0 148-30 198-80 60-60 98-144 98-258-4-90-38-182-102-246Z"/>' +
    '<path fill="#fff" transform="translate(1982 0) scale(-1 1)" d="M774 1004c-42-34-98-66-174-66-158 0-304 134-304 328 0 162 112 322 284 322 76 0 148-30 198-80 60-60 98-144 98-258-4-90-38-182-102-246Z"/>' +
    '<path fill="#fff" d="M976 1442c-64 0-74 30-36 66 36 30 56 30 88-6 30-30 4-60-52-60Z"/>' +
    '<g class="ac-pupils">' +
    '<path fill="#0e0f15" d="M696 1094c-62 2-134 80-134 178 0 84 48 172 120 174 58 2 132-64 132-190-2-88-50-164-118-162Z"/>' +
    '<path fill="#0e0f15" transform="translate(1982 0) scale(-1 1)" d="M696 1094c-62 2-134 80-134 178 0 84 48 172 120 174 58 2 132-64 132-190-2-88-50-164-118-162Z"/>' +
    '<path fill="#fff" d="M740 1138c-18 0-34 18-34 46s16 44 32 44c18 0 36-16 36-44s-16-46-34-46Z"/>' +
    '<path fill="#fff" transform="translate(1982 0) scale(-1 1)" d="M740 1138c-18 0-34 18-34 46s16 44 32 44c18 0 36-16 36-44s-16-46-34-46Z"/></g>' +
    '<rect class="ac-lid" x="280" y="924" width="612" height="690" fill="#0e0f15"/>' +
    '<rect class="ac-lid" x="1090" y="924" width="612" height="690" fill="#0e0f15"/>' +
    '</g>' +
    '<circle class="ac-nose" cx="982" cy="1472" r="150" fill="#000" opacity="0" pointer-events="all"/>' +
    '</svg>';

  // estado "espiando?" — quando true, o gato olha pra outro lado e ignora o mouse
  var peeking = false;
  function lookAway(on) {
    peeking = !!on;
    var ps = document.querySelectorAll(".auth-cat .ac-pupils");
    for (var i = 0; i < ps.length; i++) {
      ps[i].style.animation = "none";
      ps[i].style.transform = on ? "translate(48px,-40px)" : "translate(0,0)";   // desvia o olhar / volta
    }
  }
  App.components.CatLookAway = lookAway;

  // mira os olhos de TODO .ac-pupils para um ponto da tela (x,y)
  function aim(cx, cy) {
    var ps = document.querySelectorAll(".auth-cat .ac-pupils");
    for (var i = 0; i < ps.length; i++) {
      var g = ps[i], svg = g.ownerSVGElement; if (!svg) continue;
      var r = svg.getBoundingClientRect(); if (!r.width) continue;
      var ex = r.left + r.width * 0.5, ey = r.top + r.height * 0.575;
      var dx = cx - ex, dy = cy - ey, d = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, d / 140);
      g.style.animation = "none";
      g.style.transform = "translate(" + (dx / d * 54 * k).toFixed(1) + "px," + (dy / d * 40 * k).toFixed(1) + "px)";
    }
  }
  // olhar para um ponto (ex.: o caret enquanto digita) — ignora se está "espiando"
  App.components.CatLookAt = function (x, y) { if (!peeking) aim(x, y); };

  // handler global: olhos seguem o mouse (anexa 1x)
  var followWired = false;
  function wireFollow() {
    if (followWired) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    followWired = true;
    window.addEventListener("pointermove", function (e) { if (!peeking) aim(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener("pointerdown", function (e) { if (!peeking) aim(e.clientX, e.clientY); }, { passive: true });  // toque do dedo
  }

  function CatBadge(opts) {
    opts = opts || {};
    var badge = el("div", { class: "auth-cat", role: "img", "aria-label": "Oblivian" }, el("span", { class: "auth-cat__bg" }));
    var holder = el("span", { class: "auth-cat__svg" });
    holder.innerHTML = CAT_SVG;
    badge.appendChild(holder);
    if (opts.size) { badge.style.width = badge.style.height = opts.size + "px"; }
    // clicar no nariz → o gato treme (boop!)
    var nose = holder.querySelector(".ac-nose");
    if (nose) nose.addEventListener("click", function () {
      holder.classList.remove("is-shaking"); void holder.offsetWidth; holder.classList.add("is-shaking");
      setTimeout(function () { holder.classList.remove("is-shaking"); }, 600);
    });
    wireFollow();
    return badge;
  }

  App.components.CatBadge = CatBadge;
})(window.App = window.App || {});
