/* ============================================================
   screens/search.js — Interface própria de busca (tela cheia).
   Abre a partir da barra do Explorer. Separa Comunidades x Usuários:
   • texto normal → aba Comunidades (pública parcial; privada só nome completo)
   • começa com "@" → aba Usuários
   Estados: inicial (instruções) · carregando (skeleton) · resultados · vazio.
   Rota: /busca   Namespace: App.screens.search
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  function render(ctx) {
    var myIds = [];
    var activeTab = "communities";   // segue o "@" automaticamente
    var lastSeq = 0;                  // descarta respostas fora de ordem

    var input = el("input", { type: "search", autocomplete: "off", spellcheck: "false",
      placeholder: "Buscar comunidades…", "aria-label": "Buscar" });
    var clearBtn = ui.IconButton("close", { title: "Limpar", onClick: function () { input.value = ""; input.focus(); onInput(); } });
    clearBtn.classList.add("gsearch__clear");

    var bar = el("div", { class: "gsearch__bar" },
      ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.back("/explorer"); } }),
      el("div", { class: "gsearch__field" }, App.icon("search", { size: "sm" }), input, clearBtn));

    // abas Comunidades / Usuários (com contagem)
    var tabComm = el("button", { class: "gsearch__tab is-active", type: "button" },
      App.icon("community", { size: "sm" }), el("span", "Comunidades"), el("span", { class: "gsearch__count" }));
    var tabUser = el("button", { class: "gsearch__tab", type: "button" },
      App.icon("profile", { size: "sm" }), el("span", "Usuários"), el("span", { class: "gsearch__count" }));
    var tabs = el("div", { class: "gsearch__tabs" }, tabComm, tabUser);

    var body = el("div", { class: "gsearch__body" });

    function setTab(tab) {
      activeTab = tab;
      tabComm.classList.toggle("is-active", tab === "communities");
      tabUser.classList.toggle("is-active", tab === "users");
    }

    // clicar numa aba reescreve o texto pra entrar/sair do modo "@"
    tabComm.addEventListener("click", function () {
      if ((input.value || "").charAt(0) === "@") input.value = input.value.replace(/^@\s*/, "");
      setTab("communities"); input.focus(); onInput();
    });
    tabUser.addEventListener("click", function () {
      var v = (input.value || "").trim();
      if (v.charAt(0) !== "@") input.value = "@" + v;
      setTab("users"); input.focus(); onInput();
    });

    /* ---------- estados ---------- */
    function idle() {
      tabComm.querySelector(".gsearch__count").textContent = "";
      tabUser.querySelector(".gsearch__count").textContent = "";
      App.util.mount(body, el("div", { class: "gsearch__hint" },
        el("div", { class: "gsearch__hint-ic" }, App.icon("search", { size: "lg" })),
        el("h3", "Pesquise no Oblivian"),
        el("ul", { class: "gsearch__tips" },
          el("li", App.icon("community", { size: "sm" }), el("span", "Digite o nome de uma comunidade")),
          el("li", App.icon("profile", { size: "sm" }), el("span", "Use ", el("b", "@"), " para encontrar usuários")),
          el("li", App.icon("lock", { size: "sm" }), el("span", "Comunidades privadas só aparecem pelo nome completo ou link")))));
    }

    function skeleton() {
      var wrap = el("div", { class: "gsearch__results" });
      var grid = el("div", { class: "gsearch__grid" });
      for (var i = 0; i < 6; i++) grid.appendChild(el("div", { class: "gsk gsk--card" }));
      wrap.appendChild(grid);
      App.util.mount(body, wrap);
    }

    function empty(p) {
      var msg = p.mode === "users"
        ? { t: "Nenhum usuário encontrado", d: "Confira o @ e tente outro nome." }
        : { t: "Nenhuma comunidade encontrada", d: "Se for privada, digite o nome completo ou use o link direto." };
      App.util.mount(body, el("div", { class: "gsearch__empty" }, ui.Empty("search", msg.t, msg.d)));
    }

    function userRow(u) {
      return el("a", { class: "gsearch__user", href: "#/u/" + u.id },
        ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "md" }),
        el("div", { class: "u-grow gsearch__user-meta" },
          el("strong", u.name || "Usuário"),
          el("span", { class: "u-muted" }, "@" + (u.handle || "usuario"))),
        App.icon("forward", { cls: "u-muted" }));
    }

    function paint(p, data) {
      var n = (data.communities || []).length + (data.users || []).length;
      tabComm.querySelector(".gsearch__count").textContent = (data.communities || []).length || "";
      tabUser.querySelector(".gsearch__count").textContent = (data.users || []).length || "";
      if (!n) { empty(p); return; }
      var wrap = el("div", { class: "gsearch__results" });
      if (p.mode === "users") {
        var list = el("div", { class: "gsearch__userlist" });
        data.users.forEach(function (u) { list.appendChild(userRow(u)); });
        wrap.appendChild(list);
      } else {
        var grid = el("div", { class: "gsearch__grid" });
        data.communities.forEach(function (c) { grid.appendChild(C.CommunityCard(c, { joined: myIds.indexOf(c.id) >= 0 })); });
        wrap.appendChild(grid);
      }
      App.util.mount(body, wrap);
    }

    /* ---------- busca dinâmica ---------- */
    function run() {
      var p = App.search.parse(input.value);
      setTab(p.mode);
      clearBtn.style.visibility = (input.value || "").length ? "visible" : "hidden";
      if (!p.term) { idle(); return; }
      var seq = ++lastSeq;
      skeleton();
      Promise.resolve(App.repo.searchExplore(input.value)).then(function (data) {
        if (seq !== lastSeq) return;           // resposta velha: ignora
        paint(p, data || { mode: p.mode, communities: [], users: [] });
      }).catch(function () { if (seq === lastSeq) empty(p); });
    }
    var onInput = App.util.debounce(run, 180);
    input.addEventListener("input", onInput);

    /* ---------- montagem ---------- */
    var inner = el("div", { class: "view__inner view__inner--flush" },
      el("div", { class: "gsearch" }, bar, tabs, body));

    // prefill via ?q= (ex.: vindo do Explorer)
    var q = ctx && ctx.query && ctx.query.q ? String(ctx.query.q) : "";
    if (q) { input.value = q; run(); } else { idle(); }
    clearBtn.style.visibility = q ? "visible" : "hidden";

    App.repo.getMyCommunities().then(function (mine) {
      myIds = (mine || []).map(function (c) { return c.id; });
    });
    setTimeout(function () { input.focus(); }, 60);

    return { node: inner, active: "explorer", title: "Busca", immersive: true, flush: true };
  }

  App.screens.search = render;
})(window.App = window.App || {});
