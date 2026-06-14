/* ============================================================
   components/onboarding.js — Guia de boas-vindas no 1º acesso.
   Tour das áreas + checklist de primeiros passos. Persistido em
   App.store ("onboardingSeen"). Namespace: App.onboarding
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;

  var STEPS = [
    { icon: "globe", title: "Bem-vindo ao Oblivian", text: "Uma rede de comunidades. Aqui você descobre, participa e cria espaços sobre o que gosta." },
    { icon: "explorer", title: "Explorer", text: "Descubra comunidades em destaque e busque por nome, pessoas ou publicações. Entre nas que combinam com você." },
    { icon: "home", title: "Oblivian", text: "Seu hub pessoal: comunidades que participa, seu perfil global e atalhos rápidos." },
    { icon: "chats", title: "Privado", text: "Mensagens diretas e grupos — separados dos chats de cada comunidade. Conversas com quem você segue." },
    { icon: "community", title: "Dentro da comunidade", text: "Publique, comente, reaja com emoji, vote em enquetes e ganhe reputação. Cada comunidade tem seu próprio perfil e tema." }
  ];

  var CHECK = [
    { icon: "explorer", label: "Explorar comunidades", to: "/explorer" },
    { icon: "edit", label: "Editar seu perfil global", to: "/perfil/editar" },
    { icon: "plus", label: "Criar sua comunidade", to: "/criar" }
  ];

  function buildOverlay(onDone) {
    var i = 0;
    var card = el("div", { class: "onb__card", role: "dialog", "aria-modal": "true" });
    var scrim = el("div", { class: "scrim onb" }, card);

    function finish(go) {
      App.store.set("onboardingSeen", true);
      scrim.classList.add("is-closing");
      setTimeout(function () { scrim.remove(); }, 220);
      document.removeEventListener("keydown", onKey);
      if (go) App.router.navigate(go);
      onDone && onDone();
    }
    function onKey(e) { if (e.key === "Escape") finish(); }
    // clicar fora do card (no backdrop) dispensa — evita scrim "preso" bloqueando o app
    scrim.addEventListener("click", function (e) { if (e.target === scrim) finish(); });

    function dots() {
      var d = el("div", { class: "onb__dots" });
      for (var k = 0; k <= STEPS.length; k++) d.appendChild(el("span", { class: "onb__dot" + (k === i ? " is-on" : "") }));
      return d;
    }

    function renderStep() {
      App.util.clear(card);
      var last = i >= STEPS.length; // último painel = checklist
      if (!last) {
        var s = STEPS[i];
        card.appendChild(el("div", { class: "onb__icon" }, App.icon(s.icon, { size: "xl" })));
        card.appendChild(el("h2", { class: "onb__title" }, s.title));
        card.appendChild(el("p", { class: "onb__text" }, s.text));
        card.appendChild(dots());
        card.appendChild(el("div", { class: "onb__nav" },
          el("button", { class: "onb__skip", type: "button", onClick: function () { finish(); } }, "Pular"),
          ui.Button({ label: i === STEPS.length - 1 ? "Quase lá" : "Próximo", variant: "primary", onClick: function () { i++; renderStep(); } })));
      } else {
        card.appendChild(el("div", { class: "onb__icon" }, App.icon("check", { size: "xl", fill: true })));
        card.appendChild(el("h2", { class: "onb__title" }, "Primeiros passos"));
        card.appendChild(el("p", { class: "onb__text" }, "Comece por aqui — você pode fazer tudo isso quando quiser."));
        var list = el("div", { class: "onb__check" });
        CHECK.forEach(function (c) {
          list.appendChild(el("button", { class: "onb__checkrow", type: "button", onClick: function () { finish(c.to); } },
            el("span", { class: "onb__checkicon" }, App.icon(c.icon, { size: "sm" })),
            el("span", { class: "u-grow" }, c.label),
            App.icon("forward", { cls: "u-muted" })));
        });
        card.appendChild(list);
        card.appendChild(dots());
        card.appendChild(el("div", { class: "onb__nav" },
          el("button", { class: "onb__skip", type: "button", onClick: function () { i--; renderStep(); } }, "Voltar"),
          ui.Button({ label: "Começar", variant: "primary", onClick: function () { finish("/explorer"); } })));
      }
    }

    renderStep();
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
  }

  // mostra só no 1º acesso (a menos de force)
  function maybeShow(opts) {
    opts = opts || {};
    if (!opts.force && App.store.get("onboardingSeen")) return false;
    buildOverlay(opts.onDone);
    return true;
  }

  App.onboarding = { maybeShow: maybeShow, show: function (cb) { buildOverlay(cb); } };
})(window.App = window.App || {});
