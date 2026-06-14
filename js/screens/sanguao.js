/* ============================================================
   screens/sanguao.js — Área Oblivian (hub do usuário):
   "Minhas comunidades" (com card de criação) + "Recentes"
   (atividade recente das comunidades em que participa).
   Namespace: App.screens.sanguao
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  function render() {
    var inner = el("div", { class: "view__inner view__inner--wide" });

    App.repo.getMyCommunities().then(function (mine) {
      var grid = el("div", { class: "community-grid community-grid--triple" });
      mine.forEach(function (c) { grid.appendChild(C.CommunityCard(c, { joined: true })); });
      grid.appendChild(C.CreateCommunityCard());

      App.util.mount(inner, el("div", { class: "u-col u-gap-5" },
        el("div", { class: "sanguao__head" },
          el("div", { class: "section-title" }, App.icon("community"), "Minhas comunidades")),
        grid
      ));
    });

    return { node: inner, active: "sanguao", title: "Oblivian" };
  }

  App.screens.sanguao = render;
})(window.App = window.App || {});
