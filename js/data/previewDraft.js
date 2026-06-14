/* ============================================================
   data/previewDraft.js — Pré-visualização REAL de comunidade.
   Em vez de um modal estático, monta a comunidade na TELA REAL
   (/c/preview-draft/...), 100% navegável (abas, membros, chats,
   perfil). Nada é gravado no banco: uma comunidade VIRTUAL em
   memória é interceptada na camada repo até o usuário confirmar.
   - Feed/membros vazios (só você, dono); criar post bloqueado.
   - Barra flutuante: "Voltar a editar" (mantém o rascunho) ou
     "Confirmar e criar" (grava de verdade).
   Namespace: App.preview
   ============================================================ */
(function (App) {
  "use strict";
  var DRAFT_ID = "preview-draft";

  var P = {
    id: DRAFT_ID,
    draft: null,     // comunidade sintética (enquanto pré-visualiza)
    payload: null,   // dados do editor p/ repopular ao "Voltar a editar"
    me: null,        // usuário atual (dono do rascunho)
    _bar: null,

    active: function (id) { return !!(this.draft && id === DRAFT_ID); },

    // monta a comunidade sintética a partir do payload do editor
    buildCommunity: function (payload, me) {
      return {
        id: DRAFT_ID, name: payload.name, slug: null,
        icon: payload.icon || null, cover: payload.cover || null,
        description: payload.description || "", ownerId: me.id, tags: payload.tags || [],
        theme: payload.theme || { accent: "#7c59ec" }, settings: payload.settings || {},
        memberCount: 1, createdAt: Date.now()
      };
    },

    // inicia a pré-visualização (chamado pelo editor)
    start: function (payload, community, me) {
      this.payload = payload; this.draft = community; this.me = me;
      this.showBar();
    },
    // para de interceptar mas MANTÉM o payload (voltar a editar)
    stopDraft: function () { this.draft = null; this.me = null; this.hideBar(); },
    // descarta tudo
    clear: function () { this.draft = null; this.payload = null; this.me = null; this.hideBar(); },
    consumePayload: function () { var p = this.payload; this.payload = null; return p; },

    // ----- ações da barra -----
    backToEdit: function () { this.stopDraft(); App.router.navigate("/criar"); },
    confirm: function (btn) {
      var self = this, payload = this.payload;
      if (!payload) return;
      if (btn) btn.setLoading(true);
      App.repo.createCommunity(payload).then(function (community) {
        self.clear();
        App.ui.toast("Comunidade criada!", "ok");
        App.router.navigate("/c/" + community.id + "/featured?enter=1");
      }).catch(function (e) {
        App.ui.toast(e.message, "danger");
        if (btn) btn.setLoading(false);
      });
    },

    // ----- barra flutuante (independente das telas) -----
    showBar: function () {
      if (this._bar) return;
      var el = App.util.el, ui = App.ui, self = this;
      var confirmBtn = ui.Button({ label: "Confirmar e criar", icon: "check", variant: "primary" });
      confirmBtn.addEventListener("click", function () { self.confirm(confirmBtn); });
      var bar = el("div", { class: "preview-bar" },
        el("div", { class: "preview-bar__tag" }, App.icon("eye", { size: "sm" }), el("span", "Pré-visualização")),
        el("div", { class: "preview-bar__actions" },
          ui.Button({ label: "Voltar a editar", variant: "ghost", onClick: function () { self.backToEdit(); } }),
          confirmBtn));
      var ac = (this.draft && this.draft.theme && this.draft.theme.accent) || "#7c59ec";
      bar.style.setProperty("--accent", ac);
      this._bar = bar;
      document.body.appendChild(bar);
    },
    hideBar: function () { if (this._bar) { this._bar.remove(); this._bar = null; } },

    // instala os interceptadores na instância do repo
    install: function (repo) {
      if (!repo || repo.__previewWrapped) return repo;
      repo.__previewWrapped = true;
      function ownerMem(me) {
        return {
          id: "preview-mem", communityId: DRAFT_ID, userId: me.id, role: "owner",
          nickname: null, avatar: null, cover: null, covers: [], coverFx: "fade", coverFxSpeed: "med",
          panel: null, panelColor: "", textColor: "", textColors: {}, bio: "", tags: [], titles: ["Fundador(a)"],
          reputation: 0, status: null, joinedAt: Date.now()
        };
      }
      function wrap(name, fake) {
        var orig = typeof repo[name] === "function" ? repo[name].bind(repo) : null;
        repo[name] = function () {
          if (P.active(arguments[0])) return fake(arguments);
          if (orig) return orig.apply(null, arguments);
          return Promise.reject(new Error("Repository." + name + " ausente"));
        };
      }
      wrap("getCommunity",      function () { return Promise.resolve(P.draft); });
      wrap("getMembership",     function () { return Promise.resolve(ownerMem(P.me)); });
      wrap("canModerate",       function () { return Promise.resolve(true); });
      wrap("isMember",          function () { return Promise.resolve(true); });
      wrap("listPosts",         function () { return Promise.resolve([]); });
      wrap("listMembers",       function () { return Promise.resolve([{ user: P.me, membership: ownerMem(P.me) }]); });
      wrap("listCommunityTags", function () { return Promise.resolve([]); });
      wrap("listChats",         function () { return Promise.resolve([]); });
      wrap("listAchievements",  function () { return Promise.resolve([]); });
      // presença: simula só você online, sem canal Realtime real
      wrap("joinPresence", function (a) {
        var onSync = a[1];
        if (typeof onSync === "function") setTimeout(function () { onSync(new Set([P.me.id])); }, 0);
        return function () {};
      });
      return repo;
    }
  };

  App.preview = P;
})(window.App = window.App || {});
