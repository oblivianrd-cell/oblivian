/* ============================================================
   core/router.js — Roteador por hash (#/caminho?query).
   Suporta parâmetros (:id) e segmentos opcionais (:tab?).
   Handlers podem ser assíncronos. Namespace: App.router
   Resultado do handler: Node OU
     { node, title, active, communityId, flush }
   ============================================================ */
(function (App) {
  "use strict";

  var routes = [];
  var outlet = null;
  var notFound = null;
  var token = 0; // evita corrida entre navegações concorrentes
  var navStack = []; // caminhos visitados (em ordem) p/ um "voltar" previsível

  function compile(pattern) {
    var keys = [];
    var rx = pattern.replace(/\/:([A-Za-z0-9_]+)(\?)?/g, function (_, name, opt) {
      keys.push(name);
      return opt ? "(?:/([^/]+))?" : "/([^/]+)";
    });
    return { regex: new RegExp("^" + rx + "$"), keys: keys };
  }

  function register(pattern, handler, meta) {
    var c = compile(pattern);
    routes.push({ pattern: pattern, regex: c.regex, keys: c.keys, handler: handler, meta: meta || {} });
    return App.router;
  }

  function setOutlet(node) { outlet = node; }
  function setNotFound(fn) { notFound = fn; }

  function parseHash() {
    var hash = location.hash.replace(/^#/, "") || "/explorer";
    var qIndex = hash.indexOf("?");
    var path = qIndex >= 0 ? hash.slice(0, qIndex) : hash;
    var query = {};
    if (qIndex >= 0) {
      hash.slice(qIndex + 1).split("&").forEach(function (kv) {
        if (!kv) return;
        var pair = kv.split("=");
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
      });
    }
    if (path.length > 1 && path.slice(-1) === "/") path = path.slice(0, -1);
    return { path: path, query: query };
  }

  function match(path) {
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      var m = r.regex.exec(path);
      if (m) {
        var params = {};
        r.keys.forEach(function (k, idx) { params[k] = m[idx + 1] != null ? decodeURIComponent(m[idx + 1]) : undefined; });
        return { route: r, params: params };
      }
    }
    return null;
  }

  function navigate(path, opts) {
    opts = opts || {};
    if (opts.replace) location.replace("#" + path);
    else location.hash = path;
  }

  // só o caminho (sem query) p/ comparar entradas do histórico interno
  function pathOnly(p) { var q = p.indexOf("?"); return q >= 0 ? p.slice(0, q) : p; }

  /* Voltar PREVISÍVEL: vai para a tela anterior REALMENTE diferente da atual.
     Evita o loop de history.back() (que reabre o mesmo perfil/redireciona).
     Trunca a pilha até o alvo p/ não bater de volta na tela de onde saímos. */
  function back(fallback, skipRe) {
    var cur = navStack.length ? pathOnly(navStack[navStack.length - 1]) : null;
    for (var i = navStack.length - 2; i >= 0; i--) {
      var p = pathOnly(navStack[i]);
      if (p === cur) continue;
      if (skipRe && skipRe.test(p)) continue;   // pula telas indesejadas (perfil/editar) → evita loop
      var target = navStack[i];
      navStack.length = i;          // remove a atual e tudo depois do alvo
      navigate(target, { replace: true });
      return true;
    }
    navStack.length = 0;
    navigate(fallback || "/explorer", { replace: true });
    return false;
  }

  function renderLoading() {
    if (!outlet) return;
    var el = App.util.el;
    // 1ª carga (view vazia): mostra skeleton. Navegação com conteúdo já na tela:
    // NÃO esvazia (evita flash preto) — só uma barrinha fina no topo enquanto carrega.
    var hasContent = outlet.firstElementChild && !outlet.querySelector(".view__inner--loading");
    if (hasContent) { outlet.classList.add("is-route-loading"); return; }
    var indicator = (App.ui && App.ui.Spinner)
      ? App.ui.Spinner({ center: true, label: "Carregando…" })
      : el("div", { class: "u-col u-gap-2" },
          el("div", { class: "skeleton", style: { height: "160px", borderRadius: "16px" } }),
          el("div", { class: "skeleton", style: { height: "24px", width: "40%" } }),
          el("div", { class: "skeleton", style: { height: "120px" } }));
    App.util.mount(outlet, el("div", { class: "view__inner view__inner--loading" }, indicator));
  }

  function resolve() {
    var parsed = parseHash();
    var matched = match(parsed.path);
    var ctx = { path: parsed.path, query: parsed.query, params: matched ? matched.params : {} };
    var my = ++token;

    var run = matched ? matched.route.handler : (notFound || defaultNotFound);
    var maybe;
    try { maybe = run(ctx); } catch (e) { maybe = errorView(e); }

    if (maybe && typeof maybe.then === "function") {
      // só mostra o skeleton se a tela realmente demorar (>150ms);
      // telas de localStorage resolvem no mesmo tick → sem flash de carregamento ao navegar/voltar
      var loadingTimer = setTimeout(function () { if (my === token) renderLoading(); }, 150);
      maybe.then(function (res) { clearTimeout(loadingTimer); if (my === token) commit(res, ctx, matched); })
           .catch(function (e) { clearTimeout(loadingTimer); if (my === token) commit(errorView(e), ctx, matched); });
    } else {
      commit(maybe, ctx, matched);
    }
  }

  /* Troca de tela SEM flash branco: se a nova tela ainda está vazia (vai preencher
     async — padrão `return inner; ... fetch.then(build)`), mantém a tela ANTERIOR
     visível até a nova ganhar conteúdo. Telas já preenchidas trocam na hora. */
  function swapIn(newNode, onShown) {
    if (!newNode) { App.util.mount(outlet, App.util.el("div")); onShown && onShown(); return; }
    var ready = newNode.firstElementChild;            // já tem conteúdo?
    if (ready || !outlet.firstChild) {                 // troca imediata
      outlet.classList.remove("is-route-loading");
      App.util.mount(outlet, newNode);
      onShown && onShown();
      return;
    }
    // nova tela vazia → segura a antiga; esconde a nova (display:none não impede
    // o build de preencher nem o MutationObserver de detectar) até ela ter conteúdo.
    var prevDisplay = newNode.style.display;
    newNode.style.display = "none";
    outlet.appendChild(newNode);
    outlet.classList.add("is-route-loading");
    var done = false, obs, timer;
    function finish() {
      if (done) return; done = true;
      if (obs) obs.disconnect(); clearTimeout(timer);
      // remove a tela antiga, revela a nova
      var kids = Array.prototype.slice.call(outlet.childNodes);
      kids.forEach(function (n) { if (n !== newNode && n.parentNode === outlet) outlet.removeChild(n); });
      newNode.style.display = prevDisplay;
      outlet.classList.remove("is-route-loading");
      onShown && onShown();
    }
    obs = new MutationObserver(function () { if (newNode.firstElementChild) finish(); });
    obs.observe(newNode, { childList: true, subtree: true });
    timer = setTimeout(finish, 4000);                 // fallback: nunca trava
    if (newNode.firstElementChild) finish();          // já preencheu entre append e observe
  }

  function commit(result, ctx, matched) {
    if (!outlet) return;
    // registra a tela no histórico interno (sem duplicar re-renders da mesma URL)
    var here = location.hash.replace(/^#/, "") || ctx.path;
    var sameRoute = navStack.length && navStack[navStack.length - 1] === here;   // re-render (resolve) da mesma URL
    if (!sameRoute) navStack.push(here);
    if (navStack.length > 40) navStack.shift();
    var res = normalize(result, matched);
    outlet.classList.toggle("is-flush", !!res.flush);
    swapIn(res.node, function () {
      if (!sameRoute) outlet.scrollTop = 0;   // re-render mantém a posição de rolagem
      // transição suave SÓ em navegação real (re-render da mesma tela não anima → sem flash)
      var node = res.node;
      if (!sameRoute && node && node.classList) {
        node.classList.remove("route-enter");
        void node.offsetWidth;
        node.classList.add("route-enter");
        // remover a classe ao fim: `animation: both` manteria o transform e o nó
        // viraria bloco de contenção de position:fixed (dock flutuante) #bug-dock
        var clearEnter = function () { node.classList.remove("route-enter"); };
        node.addEventListener("animationend", clearEnter, { once: true });
        setTimeout(clearEnter, 500);
      }
    });
    App.bus.emit("route:change", {
      path: ctx.path, query: ctx.query, params: ctx.params,
      active: res.active, title: res.title, communityId: res.communityId, immersive: res.immersive
    });
    if (res.title) document.title = res.title + " · Oblivian";
  }

  function normalize(result, matched) {
    var meta = (matched && matched.route.meta) || {};
    if (result instanceof Node) {
      return { node: result, active: meta.active, title: meta.title, communityId: undefined, flush: meta.flush, immersive: meta.immersive };
    }
    result = result || {};
    return {
      node: result.node || App.util.el("div"),
      active: result.active != null ? result.active : meta.active,
      title: result.title != null ? result.title : meta.title,
      communityId: result.communityId,
      flush: result.flush != null ? result.flush : meta.flush,
      immersive: result.immersive != null ? result.immersive : meta.immersive
    };
  }

  function defaultNotFound(ctx) {
    var el = App.util.el;
    return {
      title: "Não encontrado",
      node: el("div", { class: "view__inner" },
        el("div", { class: "empty" },
          App.icon("info", { size: "lg" }),
          el("h3", "Página não encontrada"),
          el("p", "O endereço " + App.util.escapeHtml(ctx.path) + " não existe."),
          el("button", { class: "btn btn--primary", onClick: function () { navigate("/explorer"); } }, "Voltar ao Explorer")
        ))
    };
  }

  function errorView(e) {
    console.error("[router]", e);
    var el = App.util.el;
    return {
      title: "Erro",
      node: el("div", { class: "view__inner" },
        el("div", { class: "empty" },
          App.icon("info", { size: "lg" }),
          el("h3", "Algo deu errado"),
          el("p", String(e && e.message || e))
        ))
    };
  }

  function start() {
    window.addEventListener("hashchange", resolve);
    if (!location.hash) navigate("/explorer", { replace: true });
    else resolve();
  }

  function current() { return parseHash(); }

  App.router = {
    register: register, setOutlet: setOutlet, setNotFound: setNotFound,
    navigate: navigate, back: back, start: start, resolve: resolve, current: current
  };
})(window.App = window.App || {});
