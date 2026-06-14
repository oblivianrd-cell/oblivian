/* ============================================================
   components/adBanner.js — Banner de anúncio DISCRETO.
   Ordem de preenchimento:
     1) AdSense real, se App.config.ads estiver configurado;
     2) senão, HOUSE AD (auto-promo first-party) que RODA no tempo
        (troca o criativo c/ fade, pausa no hover) — slot sempre
        cheio, vira anúncio pago ao ligar config. Nenhuma tela muda.
   Só use em telas secundárias (loja, perfil, feed, explorer).
   NUNCA em chat/conversa/digitação/chamada.
   Namespace: App.components.AdBanner
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el;
  App.components = App.components || {};

  /* criativos de auto-promo (rodízio) */
  var HOUSE = [
    { emoji: "🪙", tag: "Loja", title: "Ganhe moedas assistindo anúncio", cta: "Abrir", href: "#/loja", accent: "#e8a32b" },
    { emoji: "✨", tag: "Comunidades", title: "Crie a sua própria comunidade", cta: "Criar", href: "#/criar", accent: "#36d399" },
    { emoji: "🔥", tag: "Explorar", title: "Descubra comunidades novas", cta: "Ver", href: "#/explorer", accent: "#ff5470" },
    { emoji: "🎨", tag: "Perfil", title: "Personalize o seu perfil", cta: "Editar", href: "#/perfil", accent: "#7c59ec" },
    { emoji: "💬", tag: "Privado", title: "Converse com seus amigos", cta: "Abrir", href: "#/chats", accent: "#3b82f6" }
  ];
  var _rot = 0;
  var ROTATE_MS = 9000;

  function houseAd(opts) {
    var emojiEl = el("span", { class: "house-ad__emoji" });
    var tagEl = el("span", { class: "house-ad__tag" });
    var titleEl = el("span", { class: "house-ad__title u-truncate" });
    var ctaEl = el("span", { class: "house-ad__cta" });
    var node = el("a", {
      class: "house-ad" + (opts.compact ? " house-ad--compact" : ""),
      role: "complementary", "aria-label": "Conteúdo do Oblivian"
    },
      emojiEl,
      el("span", { class: "house-ad__body" }, tagEl, titleEl),
      ctaEl,
      el("span", { class: "house-ad__promo" }, "Promo"));

    function paint(c) {
      emojiEl.textContent = c.emoji;
      tagEl.textContent = c.tag;
      titleEl.textContent = c.title;
      ctaEl.textContent = c.cta;
      node.setAttribute("href", c.href);
      node.style.setProperty("--ha-accent", c.accent);
    }
    var idx = _rot++ % HOUSE.length;
    paint(HOUSE[idx]);

    // rodízio no tempo (pausa no hover; para ao sair do DOM; respeita "reduzir animações")
    var reduce = document.documentElement.getAttribute("data-reduce-motion") === "1";
    if (!reduce && HOUSE.length > 1) {
      var paused = false;
      node.addEventListener("mouseenter", function () { paused = true; });
      node.addEventListener("mouseleave", function () { paused = false; });
      var timer = setInterval(function () {
        if (!document.body.contains(node)) { clearInterval(timer); return; }
        if (paused) return;
        idx = (idx + 1) % HOUSE.length;
        node.classList.add("is-swapping");
        setTimeout(function () { paint(HOUSE[idx]); node.classList.remove("is-swapping"); }, 220);
      }, ROTATE_MS);
    }
    return node;
  }

  /* Banner Adsterra (rede de aprovação rápida). Cada um vai num IFRAME isolado
     porque o atOptions é global — assim dá pra ter vários na mesma página. */
  function adsterraAd(opts) {
    var a = App.config.ads.adsterra, W = +a.width || 300, H = +a.height || 250;
    var doc = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:#0e0f15}</style></head><body>'
      + '<scr' + 'ipt type="text/javascript">atOptions={"key":"' + a.key + '","format":"iframe","height":' + H + ',"width":' + W + ',"params":{}};</scr' + 'ipt>'
      + '<scr' + 'ipt type="text/javascript" src="//www.highperformanceformat.com/' + a.key + '/invoke.js"></scr' + 'ipt>'
      + '</body></html>';
    var frame = el("iframe", { class: "ad-frame", title: "Anúncio", scrolling: "no",
      style: { display: "block", border: "0", margin: "0 auto", width: W + "px", height: H + "px", maxWidth: "100%", background: "#0e0f15" } });
    frame.setAttribute("frameborder", "0");
    frame.setAttribute("srcdoc", doc);
    var aside = el("aside", { class: "ad-banner ad-banner--net" + (opts.compact ? " ad-banner--compact" : ""), role: "complementary", "aria-label": "Anúncio" },
      el("span", { class: "ad-banner__tag" }, "Anúncio"), frame);
    // anti-branco: se a Adsterra não preencher (zona nova/pendente), cai pro house ad
    setTimeout(function () {
      var ok = false;
      try {
        var d = frame.contentDocument;
        if (!d || !d.body) ok = true;                                  // sem acesso → assume cheio
        else { var ad = d.body.querySelector("iframe,ins,img,a,canvas"); ok = !!(ad && ad.offsetHeight > 30); }
      } catch (e) { ok = true; }                                       // cross-origin → encheu
      if (!ok && aside.parentNode) aside.parentNode.replaceChild(houseAd(opts), aside);
    }, 4000);
    return aside;
  }

  // envolve o anúncio com um botão × (o usuário pode fechar)
  function withClose(node) {
    var wrap = el("div", { class: "ad-wrap" });
    var x = el("button", { class: "ad-wrap__close", type: "button", title: "Fechar anúncio", "aria-label": "Fechar anúncio" }, "✕");
    x.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); });
    wrap.appendChild(node); wrap.appendChild(x);
    return wrap;
  }

  function AdBanner(opts) {
    opts = opts || {};
    var cfg = (App.config && App.config.ads) || {};
    var ad;
    // 1) AdSense real (quando a conta estiver aprovada/enabled)
    var slotHost = el("div", { class: "ad-banner__real" });
    var inserted = App.ads && App.ads.renderBanner ? App.ads.renderBanner(slotHost) : false;
    if (inserted) {
      ad = el("aside", { class: "ad-banner" + (opts.compact ? " ad-banner--compact" : ""), role: "complementary", "aria-label": "Anúncio" },
        el("span", { class: "ad-banner__tag" }, "Anúncio"), slotHost);
    } else if (cfg.adsterra && cfg.adsterra.enabled && cfg.adsterra.key) {
      ad = adsterraAd(opts);            // Adsterra banner (só quando ligado)
    } else {
      ad = houseAd(opts);               // house ad (auto-promo)
    }
    return withClose(ad);
  }

  App.components.AdBanner = AdBanner;
})(window.App = window.App || {});
