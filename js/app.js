/* ============================================================
   app.js — Bootstrap. Instancia a camada de dados, aplica o
   tema, monta o shell e registra as rotas. Ponto de entrada.
   ============================================================ */
(function (App) {
  "use strict";

  /* erros escondidos (throw dentro de .then de tela) viram toast — evita "tela branca muda" */
  function showErr(m) { try { if (App.ui && App.ui.toast) App.ui.toast("Erro: " + m, "danger"); } catch (e) {} console.error("[app]", m); }
  window.addEventListener("error", function (e) { if (e && e.error) showErr(e.error.message || String(e.error)); });
  window.addEventListener("unhandledrejection", function (e) { var r = e && e.reason; showErr((r && (r.message || r)) || "rejeição não tratada"); });

  /* imagens inline (bio, posts, comentários) abrem no visualizador (formato original).
     Delegação global: pega qualquer .mk-img clicada, sem precisar de listener por nó.
     stopPropagation evita navegar pro post/bio ao clicar na imagem. */
  document.addEventListener("click", function (e) {
    var img = e.target && e.target.closest && e.target.closest(".mk-img");
    if (!img || !img.getAttribute("src")) return;
    // fase de captura: intercepta ANTES de qualquer ancestral clicável (post/bio)
    e.preventDefault(); e.stopPropagation();
    if (App.components && App.components.openImageViewer) App.components.openImageViewer(img.src, { name: "oblivian-imagem" });
  }, true);

  function registerRoutes() {
    var S = App.screens;
    // Autenticação
    App.router.register("/login", S.login);
    App.router.register("/entrar", S.login);
    // Áreas principais
    App.router.register("/explorer", S.explorer);
    App.router.register("/busca", S.search);
    App.router.register("/sanguao", S.sanguao);
    App.router.register("/chats", S.chats);
    App.router.register("/chats/:chatId/config", S.chatSettings);
    App.router.register("/chats/:chatId", S.chats);

    // Criação / conta global
    App.router.register("/criar", S.createCommunity);
    App.router.register("/loja", S.store);
    App.router.register("/config", S.settingsGlobal);
    App.router.register("/perfil/editar", S.editProfile);
    App.router.register("/perfil/imagem", S.editImage);
    App.router.register("/perfil/fundo", S.editBackground);
    App.router.register("/perfil/capa", S.editCover);
    App.router.register("/profile", S.profileGlobal);
    App.router.register("/perfil", S.profileGlobal);
    App.router.register("/u/:id/comentarios", S.comments);
    App.router.register("/u/:id", S.profileGlobal);

    // Comunidade (rotas mais específicas ANTES das genéricas)
    App.router.register("/c/:id/criar-post", S.createPost);
    App.router.register("/c/:id/config", S.settingsCommunity);
    App.router.register("/c/:id/admin", S.settingsAdmin);
    App.router.register("/c/:id/admin/:section", S.settingsAdminSection);
    App.router.register("/c/:id/customizar", S.settingsCustomize);
    App.router.register("/c/:id/notificacoes", S.notifications);
    App.router.register("/c/:id/mychats", S.communityChats);   // Meus Chats (privado) — aba "Chats" cai em /:tab → hangout público
    App.router.register("/c/:id/p/:postId", S.post);
    App.router.register("/c/:id/u/:userId/comentarios", S.comments);
    App.router.register("/c/:id/u/:userId/editar", S.editProfile);
    App.router.register("/c/:id/u/:userId/imagem", S.editImage);
    App.router.register("/c/:id/u/:userId/fundo", S.editBackground);
    App.router.register("/c/:id/u/:userId/capa", S.editCover);
    App.router.register("/c/:id/u/:userId", S.profileCommunity);
    App.router.register("/c/:id/:tab", S.community);
    App.router.register("/c/:id", S.community);
  }

  function boot() {
    // fábrica: Supabase se config.js tiver chave real; senão LocalRepository (demo)
    App.repo = App.makeRepository ? App.makeRepository() : new App.LocalRepository();
    if (App.preview) App.preview.install(App.repo); // pré-visualização real (comunidade virtual)
    if (App.repo.db) App.store.set("currentUserId", App.repo.db.currentUserId); // só Local
    App.store.applyTheme();

    var root = document.getElementById("app");
    function enterApp() { var lp = document.getElementById("landing"); if (lp) lp.remove(); root.style.display = ""; }
    App.repo.getCurrentUser().then(function (user) {
      if (!user) {
        // visitante deslogado: mantém a LANDING pública (conteúdo/SEO/AdSense).
        // "Entrar" (qualquer .lp-enter) abre o portão de login.
        if (App.auth && App.auth.enabled()) {
          var open = function (e) { if (e) e.preventDefault(); enterApp(); App.auth.mountGate(root); };
          // APP nativo (Capacitor): sem landing — vai direto pro login
          var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
          if (native) { open(); return; }
          // WEB: mantém a landing pública; "Entrar" (.lp-enter) abre o login
          var btns = document.querySelectorAll(".lp-enter");
          for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", open);
          if (!document.getElementById("landing")) open();   // sem landing → portão direto
          return;
        }
        enterApp(); root.textContent = "Falha ao carregar a conta."; return;
      }
      // logado: remove a landing e entra no app
      enterApp();
      App.store.set("currentUserId", user.id);
      // aplica "reduzir animações" salvo nas configurações
      try { var _sp = App.store.get("commPrefs." + user.id); if (_sp && _sp.reduceMotion) document.documentElement.setAttribute("data-reduce-motion", "1"); } catch (e) {}
      App.shell.init(root, user);
      // notificação ao vivo de outros usuários → toast app-wide (e som). Suprime se já está na tela-alvo.
      App.bus.on("notif:new", function (n) {
        if (!n || !n.title) return;
        var hash = (location.hash || "").replace(/^#/, "");
        if (n.to && hash.indexOf(n.to) === 0) return;   // já estou olhando isso → não interrompe
        try { App.ui.toast(n.sub ? (n.title + " — " + n.sub) : n.title); } catch (e) {}
      });
      registerRoutes();
      // presença só dentro do reino: ao sair de /c/... larga o canal Realtime (saguão sem presença)
      App.bus.on("route:change", function (e) {
        var path = (e && e.path) || "";
        // entrar no CONTEXTO de uma notificação (post/perfil/chat) → limpa as notificações daquele destino
        // defensivo: durante rollout o bundle pode ter o stub "ainda não implementado" → engole a rejeição
        if (path && App.repo.markNotificationsReadByPath) { var _pr = App.repo.markNotificationsReadByPath(path); if (_pr && _pr.catch) _pr.catch(function () {}); }
        if (App.repo.leavePresence && !/^\/c\//.test(path)) App.repo.leavePresence();
        // pré-visualização: ao sair da comunidade-rascunho (e não for "voltar a editar"), descarta
        if (App.preview && (App.preview.draft || App.preview.payload)) {
          var inPreview = path.indexOf("/c/" + App.preview.id) === 0;
          var inEditor = path === "/criar";
          if (!inPreview && !inEditor) App.preview.clear();
          else if (inEditor) App.preview.stopDraft();
        }
      });
      App.router.start();
      // guia de boas-vindas no 1º acesso (não trava navegação)
      if (App.onboarding) App.onboarding.maybeShow();
    });
  }

  /* auto-atualização: SPA fica aberta e não recarrega o JS sozinha.
     BUILD é o carimbo gravado DENTRO deste bundle no build (build.mjs troca o
     placeholder). Comparamos com /version.txt do servidor: se o servidor está
     mais novo, o JS em memória está velho → recarrega. Comparar carregado-vs-
     servidor (não 1ª-leitura-vs-servidor) detecta a aba velha mesmo quando a
     primeira leitura já vem com a versão nova. */
  var BUILD = "__BUILD_STAMP__", _reloading = false;
  // banner de atualização: fixo no topo, gradiente derivado do fundo, com spinner
  function showUpdateBanner() {
    if (document.getElementById("update-banner")) return;
    var el = App.util.el;
    var b = el("div", { id: "update-banner", class: "update-banner", role: "status", "aria-live": "polite" },
      el("span", { class: "update-banner__spin", "aria-hidden": "true" }),
      el("span", { class: "update-banner__txt" }, "Nova versão — atualizando…"));
    document.body.appendChild(b);
    requestAnimationFrame(function () { b.classList.add("is-in"); });
  }
  function checkVersion() {
    if (_reloading || BUILD === "__BUILD_STAMP__") return;   // local/dev: sem carimbo, não recarrega
    fetch("version.txt?ts=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (v) {
        if (v == null) return; v = v.trim();
        if (!v || v === BUILD || !(+v > +BUILD)) return;     // só recarrega se o servidor é MAIS NOVO
        // ANTI-LOOP: já recarregamos uma vez p/ esta versão e ainda estamos velhos
        // (edge/cache serviu bundle antigo) → NÃO insiste, evita loop infinito de atualização.
        var tried; try { tried = sessionStorage.getItem("vreload"); } catch (e) { tried = null; }
        if (tried === v) return;
        try { sessionStorage.setItem("vreload", v); } catch (e) {}
        _reloading = true;
        try { showUpdateBanner(); } catch (e) {}
        setTimeout(function () {
          // cache-bust forte: muda a query do HTML p/ forçar um index fresco
          // (que referencia js/app.js?v=<novo>), em vez de um reload que pode voltar 304 velho.
          try { location.replace(location.pathname + "?_v=" + encodeURIComponent(v) + location.hash); }
          catch (e) { location.reload(); }
        }, 900);
      })
      .catch(function () {});
  }
  checkVersion();
  window.addEventListener("focus", checkVersion);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkVersion(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.App = window.App || {});
