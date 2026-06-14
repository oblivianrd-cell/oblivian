/* ============================================================
   components/communityCard.js — Card inicial da comunidade,
   exibido em Explorer e Oblivian. Interliga à página interna.
   Namespace: App.components.CommunityCard
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.components = App.components || {};

  /* Card pôster: imagem cobre todo o card, overlay gradiente,
     badge de presença no topo, nome grande + tags coloridas na base. */
  function CommunityCard(community, opts) {
    opts = opts || {};
    var accent = (community.theme && community.theme.accent) || "#7c59ec";
    var coverStyle = community.cover
      ? { backgroundImage: "url(" + community.cover + ")" }
      : { background: "linear-gradient(160deg, " + accent + ", " + App.store.color.shade(accent, -30) + ")" };

    // ícone da comunidade (marca d'água quando não há capa)
    var glyph = community.icon
      ? el("span", { class: "poster-card__glyph", style: { backgroundImage: "url(" + community.icon + ")" } })
      : null;

    var card = el("article", { class: "poster-card", role: "button", tabindex: "0" },
      el("div", { class: "poster-card__bg", style: coverStyle }),
      glyph,
      el("div", { class: "poster-card__scrim" }),
      el("div", { class: "poster-card__top" },
        community.settings && community.settings.visibility === "private"
          ? el("span", { class: "poster-card__lock" }, App.icon("lock", { size: "sm" })) : null),
      el("div", { class: "poster-card__bottom" },
        el("h3", { class: "poster-card__name" }, community.name))
    );

    // já participa (Oblivian) → entra direto no feed; descoberta (Explorer) → tela "Sobre"
    function go() { App.router.navigate(opts.joined ? "/c/" + community.id + "/featured" : "/c/" + community.id); }
    card.addEventListener("click", go);
    card.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    return card;
  }

  /* Card de "criar nova comunidade" para a área Oblivian. */
  function CreateCommunityCard() {
    var card = el("button", { class: "create-card", type: "button" },
      el("span", { class: "create-card__plus" }, App.icon("plus")),
      el("strong", "Criar comunidade"),
      el("span", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, "Comece a sua própria"));
    card.addEventListener("click", function () { App.router.navigate("/criar"); });
    return card;
  }

  App.components.CommunityCard = CommunityCard;
  App.components.CreateCommunityCard = CreateCommunityCard;
})(window.App = window.App || {});
