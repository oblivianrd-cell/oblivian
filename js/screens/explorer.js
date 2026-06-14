/* ============================================================
   screens/explorer.js — Área Explorer: "Destaque da semana" +
   "Recentes". Descoberta de comunidades. Namespace: App.screens.explorer
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  function featured(community) {
    if (!community) return null;
    var accent = (community.theme && community.theme.accent) || "#7c59ec";
    var bg = el("div", { class: "featured__bg",
      style: community.cover ? { backgroundImage: "url(" + community.cover + ")" }
        : { background: "linear-gradient(135deg," + accent + "," + App.store.color.shade(accent, 30) + ")" } });
    var node = el("section", { class: "featured" }, bg,
      el("div", { class: "featured__content" },
        el("span", { class: "featured__kicker" }, App.icon("featured", { size: "sm" }), "Destaque da semana"),
        el("h2", { class: "featured__title" }, community.name),
        el("p", { class: "featured__desc" }, community.description || ""),
        el("div", { class: "featured__meta" },
          el("span", { class: "u-row u-gap-1" }, App.icon("members", { size: "sm" }), App.util.formatCount(community.memberCount) + " membros"),
          (community.tags || []).slice(0, 2).map(function (t) { return ui.Tag(t, { variant: "neutral" }); }),
          ui.Button({ label: "Explorar", variant: "primary", size: "sm", icon: "forward", onClick: function () { App.router.navigate("/c/" + community.id); } }))));
    return node;
  }

  function render() {
    var inner = el("div", { class: "view__inner view__inner--wide" });

    Promise.all([App.repo.getFeatured(), App.repo.getRecentCommunities(), App.repo.getMyCommunities()])
      .then(function (res) {
        var feat = res[0], recent = res[1], mine = res[2];
        var myIds = mine.map(function (c) { return c.id; });

        // barra é só um GATILHO: abre a interface própria de busca (/busca)
        var search = el("button", { class: "searchbar searchbar--trigger", type: "button" },
          App.icon("search", { size: "sm" }),
          el("span", { class: "searchbar__ph" }, "Buscar comunidades ou @usuários"));
        search.addEventListener("click", function () { App.router.navigate("/busca"); });
        var grid = el("div", { class: "community-grid" });
        var defaultBlocks = el("div", { class: "u-col u-gap-4" });

        function paint(list) {
          App.util.clear(grid);
          if (!list.length) { grid.appendChild(ui.Empty("search", "Nada encontrado", "Tente outro termo.")); return; }
          list.forEach(function (c) { grid.appendChild(C.CommunityCard(c, { joined: myIds.indexOf(c.id) >= 0 })); });
        }

        var rail = el("div", { class: "rail" });
        recent.forEach(function (c) { rail.appendChild(C.CommunityCard(c, { joined: myIds.indexOf(c.id) >= 0 })); });
        var dots = C.CarouselDots({ track: rail });
        // wrapper aplica degradê nas pontas (cards somem sob o fundo)
        var railWrap = el("div", { class: "rail-wrap" }, rail);

        defaultBlocks.appendChild(el("div", null,
          el("div", { class: "section-title", style: { marginBottom: "var(--s-3)" } }, App.icon("recent"), "Recentes"),
          railWrap, dots));
        defaultBlocks.appendChild(el("div", null,
          el("div", { class: "section-title", style: { marginBottom: "var(--s-3)" } }, App.icon("community"), "Todas as comunidades"),
          grid));

        App.util.mount(inner, el("div", { class: "u-col u-gap-4" },
          C.LargeTitle("Explorer"),
          el("div", { class: "explorer__hero" }, featured(feat)),
          search,
          defaultBlocks
        ));
        paint(recent);
      });

    return { node: inner, active: "explorer", title: "Explorer" };
  }

  App.screens.explorer = render;
})(window.App = window.App || {});
