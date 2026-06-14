/* ============================================================
   components/effects.js — Componentes de efeito:
   - LargeTitle: título grande (estilo iOS) que vira inline na
     topbar ao rolar; integra com App.shell.bindLargeTitle.
   - SizingCard: card cuja largura acompanha o conteúdo
     (min-content) e pode animar; usa calc-size onde houver suporte.
   - CarouselDots: indicadores de página para um container com
     rolagem horizontal (rail). Dot ativo segue a rolagem; clicar
     navega até o item. Inspirado em scroll-driven dots.
   Namespace: App.components.*
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el;
  App.components = App.components || {};

  /* ---------------- LargeTitle ---------------- */
  /* Retorna um cabeçalho com sentinela; registra no shell para
     alternar com o título inline da topbar ao rolar. */
  function LargeTitle(text, opts) {
    opts = opts || {};
    var sentinel = el("div", { class: "large-title__sentinel" });
    var head = el("div", { class: "large-title" },
      el("h1", { class: "large-title__text" }, text),
      opts.action || null);
    // o sentinel precisa estar no fluxo, acima do título
    var wrap = el("div", null, sentinel, head);
    // adia o bind para depois de montar no DOM
    setTimeout(function () {
      if (App.shell && App.shell.bindLargeTitle && document.body.contains(sentinel)) {
        App.shell.bindLargeTitle(text, sentinel);
      }
    }, 0);
    return wrap;
  }

  /* ---------------- CarouselDots ---------------- */
  /* opts: { track: Element (scroller), itemSelector?: string }
     Retorna o nó de dots; mantém sincronia via scroll + clique. */
  function CarouselDots(opts) {
    opts = opts || {};
    var track = opts.track;
    var sel = opts.itemSelector || ":scope > *";
    var dotsHost = el("div", { class: "carousel-dots", role: "tablist", "aria-label": "Navegação do carrossel" });
    if (!track) return dotsHost;

    function items() {
      try { return App.util.qsa(sel, track); }
      catch (e) { return Array.prototype.slice.call(track.children); }
    }

    function activeIndex() {
      var list = items();
      if (!list.length) return 0;
      var center = track.scrollLeft + track.clientWidth / 2;
      var best = 0, bestD = Infinity;
      list.forEach(function (it, i) {
        var mid = it.offsetLeft + it.offsetWidth / 2;
        var d = Math.abs(mid - center);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }

    function build() {
      var list = items();
      App.util.clear(dotsHost);
      // não mostra dots se couber tudo sem rolar
      if (list.length <= 1 || track.scrollWidth <= track.clientWidth + 4) {
        dotsHost.classList.add("u-hidden");
        return;
      }
      dotsHost.classList.remove("u-hidden");
      list.forEach(function (it, i) {
        var dot = el("button", { class: "carousel-dots__dot", type: "button", role: "tab", "aria-label": "Item " + (i + 1) });
        dot.addEventListener("click", function () {
          track.scrollTo({ left: it.offsetLeft - 8, behavior: "smooth" });
        });
        dotsHost.appendChild(dot);
      });
      sync();
    }

    function sync() {
      var idx = activeIndex();
      App.util.qsa(".carousel-dots__dot", dotsHost).forEach(function (d, i) {
        d.classList.toggle("is-active", i === idx);
        d.setAttribute("aria-selected", String(i === idx));
      });
    }

    var onScroll = App.util.debounce(sync, 60);
    track.addEventListener("scroll", onScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () { build(); });
      ro.observe(track);
    } else {
      window.addEventListener("resize", App.util.debounce(build, 150));
    }
    // build após layout
    setTimeout(build, 0);

    return dotsHost;
  }

  App.components.LargeTitle = LargeTitle;
  App.components.CarouselDots = CarouselDots;
})(window.App = window.App || {});
