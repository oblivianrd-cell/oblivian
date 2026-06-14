/* ============================================================
   landing-anim.js — animações da landing (scroll-reveal).
   Revela cards/seções com fade+slide ao entrar na viewport.
   Hero + stickers animam via CSS. Respeita prefers-reduced-motion.
   Só roda na landing pública (#landing). Sem dependências.
   ============================================================ */
(function () {
  "use strict";
  function run() {
    var lp = document.getElementById("landing");
    if (!lp) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    var sel = ".lp-sec__h, .lp-sec__sub, .lp-card, .lp-step, .lp-faq details, .lp-cta h2, .lp-cta p, .lp-cta .lp-btn, .lp-footer__grid > *";
    var els = lp.querySelectorAll(sel);
    if (!els.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.classList.add("lp-reveal");
      // stagger entre irmãos diretos (ex.: cards na mesma grid)
      var idx = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty("--d", (Math.min(idx, 6) * 70) + "ms");
      io.observe(el);
    }
  }
  // olhos do gato SEGUEM o dedo/mouse em tempo real (gatos inline: hero + marca).
  // rAF + interpolação (lerp) → segue fluido durante arraste do dedo (pointermove
  // dispara enquanto pressionado) e mouse. Mantém piscar/respirar/orelhas via CSS.
  function catEyes() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var groups = Array.prototype.slice.call(document.querySelectorAll(".lp-hero__cat #pupils, .lp-brand__cat .oc-pupils"));
    if (!groups.length) return;
    var MAXX = 58, MAXY = 42;          // alcance máximo da pupila (unidades do viewBox)
    var REACH = 110;                   // distância em px p/ atingir o alcance máximo (menor = mais responsivo)
    var EASE = 0.4;                    // suavidade do lerp (0..1; maior = mais imediato)
    var tx = null, ty = null;          // alvo (coords do ponteiro na tela)
    var cur = groups.map(function () { return { x: 0, y: 0 }; });
    var raf = 0;

    function frame() {
      raf = 0;
      var moving = false;
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i], svg = g.ownerSVGElement;
        if (!svg) continue;
        var r = svg.getBoundingClientRect();
        if (!r.width) continue;
        var wx = 0, wy = 0;
        if (tx !== null) {
          var ex = r.left + r.width * 0.5, ey = r.top + r.height * 0.575;  // centro dos olhos
          var dx = tx - ex, dy = ty - ey, d = Math.hypot(dx, dy) || 1;
          var k = Math.min(1, d / REACH);
          wx = dx / d * MAXX * k; wy = dy / d * MAXY * k;
        }
        var c = cur[i];
        c.x += (wx - c.x) * EASE; c.y += (wy - c.y) * EASE;
        g.style.animation = "none";   // desliga o scan automático ao interagir
        g.style.transform = "translate(" + c.x.toFixed(2) + "px," + c.y.toFixed(2) + "px)";
        if (Math.abs(wx - c.x) > 0.2 || Math.abs(wy - c.y) > 0.2) moving = true;
      }
      if (moving) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    function aim(x, y) { tx = x; ty = y; kick(); }

    // mouse: segue sempre. toque: pointermove só dispara com o dedo pressionado → segue o arraste.
    window.addEventListener("pointermove", function (e) { aim(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener("pointerdown", function (e) { aim(e.clientX, e.clientY); }, { passive: true });
    // recomputa posições após rolar/redimensionar (getBoundingClientRect muda)
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick, { passive: true });
  }

  function boot() { run(); catEyes(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
