/* ============================================================
   components/shell.js — Estrutura persistente (chrome) do app:
   sidebar (desktop/tablet), topbar, área de conteúdo e barra de
   abas inferior (mobile). Atualiza estado ativo, título e aplica
   o tema da comunidade na área de conteúdo. Namespace: App.shell
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;

  var refs = {};

  var PRIMARY = [
    { key: "explorer", label: "Explorer", icon: "explorer", path: "/explorer" },
    { key: "sanguao", label: "Oblivian", icon: "community", path: "/sanguao" },
    { key: "chats", label: "Privado", icon: "chats", path: "/chats" }
  ];

  function navItem(item) {
    var node = el("a", { class: "nav-item", href: "#" + item.path, "data-key": item.key },
      App.icon(item.icon),
      el("span", { class: "nav-item__label" }, item.label),
      item.key === "chats" ? el("span", { class: "nav-item__badge u-hidden", "data-badge": "chats" }) : null
    );
    return node;
  }

  function bottomItem(item) {
    return el("a", { class: "bottom-nav__item", href: "#" + item.path, "data-key": item.key },
      App.icon(item.icon),
      el("span", item.label),
      item.key === "chats" ? el("span", { class: "dot u-hidden", "data-dot": "chats" }) : null
    );
  }

  function coinPill() {
    var num = el("span", { class: "coin-pill__num" }, String(App.repo.getBalance ? App.repo.getBalance() : 0));
    var pill = el("a", { class: "coin-pill", href: "#/loja", title: "Loja de moedas" }, App.icon("coin", { size: "sm" }), num);
    refs.coinNum = num;
    return pill;
  }

  // sino GLOBAL (topbar) — notificações app-wide fora de comunidade
  function notifBell() {
    var badge = el("span", { class: "topbar-bell__badge u-hidden", "data-badge": "notif" });
    var btn = el("button", { class: "topbar-bell", type: "button", title: "Notificações" }, App.icon("bell"), badge);
    btn.addEventListener("click", function () { if (App.components && App.components.openNotifications) App.components.openNotifications(btn, null); });
    refs.notifBell = btn;
    return btn;
  }

  function meChip(user) {
    return el("a", { class: "me-chip", href: "#/profile" },
      ui.Avatar({ name: user.name, src: user.avatar, size: "sm", round: true }),
      el("div", { class: "me-chip__info u-truncate" },
        el("div", { class: "me-chip__name u-truncate" }, user.name),
        el("div", { class: "me-chip__handle u-truncate" }, "@" + user.handle)));
  }

  function build(user) {
    var hamburger = el("button", { class: "sidebar__hamburger", type: "button", title: "Recolher/expandir menu", "aria-label": "Alternar menu" }, App.icon("menu"));
    hamburger.addEventListener("click", function () { toggleSidebar(); });

    var handle = el("div", { class: "sidebar__handle", title: "Arraste para abrir/recolher", "aria-hidden": "true" });

    var sidebar = el("aside", { class: "sidebar" },
      el("div", { class: "brand" },
        hamburger,
        el("a", { class: "u-row u-grow", href: "#/explorer", style: { minWidth: 0 } },
          el("span", { class: "brand__name" }, "Oblivian"))),
      el("nav", { class: "nav-group" },
        el("span", { class: "nav-group__title" }, "Navegação"),
        PRIMARY.map(navItem)),
      el("div", { class: "sidebar__spacer" }),
      el("nav", { class: "nav-group sidebar__foot" },
        el("a", { class: "nav-item", href: "#/loja", "data-key": "store" }, App.icon("store"), el("span", { class: "nav-item__label" }, "Loja")),
        el("a", { class: "nav-item", href: "#/profile", "data-key": "profile" }, App.icon("profile"), el("span", { class: "nav-item__label" }, "Meu perfil")),
        el("a", { class: "nav-item", href: "#/config", "data-key": "settings" }, App.icon("settings"), el("span", { class: "nav-item__label" }, "Configurações")),
        meChip(user)),
      handle
    );
    refs.handle = handle;

    var view = el("div", { class: "view" });
    var topbar = el("header", { class: "topbar" },
      ui.IconButton("back", { title: "Voltar", onClick: function () { history.back(); } }),
      el("a", { class: "brand", href: "#/explorer" },
        el("span", { class: "brand__name" }, "Oblivian")),
      el("h1", { class: "topbar__title" }, "Explorer"),
      el("span", { class: "topbar__inline-title" }),
      el("div", { class: "u-grow" }),
      coinPill(),
      notifBell(),
      ui.IconButton("plus", { title: "Criar comunidade", onClick: function () { App.router.navigate("/criar"); } }),
      ui.IconButton(App.store.get("theme") === "dark" ? "sun" : "moon", { title: "Tema" })
    );
    // botão voltar e tema referenciados
    refs.backBtn = topbar.firstChild;
    refs.backBtn.classList.add("topbar__back");
    refs.themeBtn = topbar.lastChild;
    refs.themeBtn.classList.add("theme-toggle");
    // ao terminar o giro, remove is-spin → ícone volta ao estado centralizado (sem transform)
    refs.themeBtn.addEventListener("animationend", function () { refs.themeBtn.classList.remove("is-spin"); });
    refs.themeBtn.addEventListener("click", function () {
      App.store.toggleTheme();
      App.util.mount(refs.themeBtn, App.icon(App.store.get("theme") === "dark" ? "sun" : "moon"));
      // reinicia a animação de giro/cross-fade do ícone
      refs.themeBtn.classList.remove("is-spin");
      void refs.themeBtn.offsetWidth;
      refs.themeBtn.classList.add("is-spin");
    });

    var main = el("main", { class: "main" }, topbar, view);

    var bottom = el("nav", { class: "bottom-nav" },
      el("div", { class: "bottom-nav__list" },
        PRIMARY.concat([{ key: "profile", label: "Perfil", icon: "profile", path: "/profile" }]).map(bottomItem)));

    var scrim = el("div", { class: "sidebar__scrim", "aria-hidden": "true" });
    scrim.addEventListener("click", function () { setExpanded(false); });

    var shell = el("div", { class: "app-shell" }, scrim, sidebar, main, bottom);

    refs.shell = shell;
    refs.topbar = topbar;
    refs.title = topbar.querySelector(".topbar__title");
    refs.inlineTitle = topbar.querySelector(".topbar__inline-title");
    refs.main = main;
    refs.outlet = view;
    refs.viewScroll = view;
    refs.sidebar = sidebar;
    refs.scrim = scrim;
    refs.bottom = bottom;

    applyExpanded(App.store.get("sidebarExpanded"));
    setupDrag();
    return shell;
  }

  /* ---------------- Sidebar colapsável (rail <-> expandida) ---------------- */
  function applyExpanded(expanded) {
    if (!refs.shell) return;
    refs.shell.classList.toggle("is-expanded", !!expanded);
  }
  function setExpanded(expanded) {
    applyExpanded(expanded);
    App.store.set("sidebarExpanded", !!expanded);
  }
  function toggleSidebar() {
    setExpanded(!refs.shell.classList.contains("is-expanded"));
  }

  /* Arraste pela alça da borda: direita = abrir, esquerda = guardar.
     Segue o ponteiro ao vivo; ao soltar, faz snap pela posição/limite. */
  function setupDrag() {
    var handle = refs.handle, shell = refs.shell, sidebar = refs.sidebar;
    if (!handle) return;
    var rail = 76, full = 264; // mantém em sincronia com --rail-w / --sidebar-w
    var dragging = false, startX = 0, startW = 0, curW = 0, moved = false;

    function pxVar(name, fallback) {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      var n = parseInt(v, 10);
      return isNaN(n) ? fallback : n;
    }

    function onDown(e) {
      dragging = true; moved = false;
      var pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX;
      rail = pxVar("--rail-w", 76); full = pxVar("--sidebar-w", 264);
      startW = shell.classList.contains("is-expanded") ? full : rail;
      curW = startW;
      shell.classList.add("is-dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      var pt = e.touches ? e.touches[0] : e;
      var dx = pt.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      curW = Math.max(rail, Math.min(full, startW + dx));
      shell.style.setProperty("--side-current", curW + "px");
      if (e.cancelable) e.preventDefault();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      shell.classList.remove("is-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      shell.style.removeProperty("--side-current");
      if (!moved) { toggleSidebar(); return; }     // clique simples = alterna
      var mid = (rail + full) / 2;
      setExpanded(curW >= mid);                     // snap pelo ponto médio
    }

    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: false });
  }

  function setActive(key) {
    App.util.qsa("[data-key]", refs.shell).forEach(function (n) {
      n.classList.toggle("is-active", n.getAttribute("data-key") === key);
    });
  }

  /* aplica a moldura equipada ao avatar do mini-perfil (loop cosmético) */
  function applyEquippedFrame() {
    if (!refs.sidebar || !App.repo.getEquipped) return;
    var chipAvatar = refs.sidebar.querySelector(".me-chip .avatar");
    if (!chipAvatar) return;
    var frameId = App.repo.getEquipped("frame");
    var item = frameId && App.repo.getStoreItem ? App.repo.getStoreItem(frameId) : null;
    if (item && item.value) {
      chipAvatar.classList.add("has-frame");
      chipAvatar.style.setProperty("--frame", item.value);
    } else {
      chipAvatar.classList.remove("has-frame");
      chipAvatar.style.removeProperty("--frame");
    }
  }

  function applyCommunityTheme(community) {
    var m = refs.main;
    if (community && community.theme && community.theme.accent) {
      var a = community.theme.accent;
      m.style.setProperty("--accent", a);
      m.style.setProperty("--accent-2", App.store.color.shade(a, 18));
      m.style.setProperty("--accent-soft", App.store.color.hexA(a, 0.16));
    } else {
      m.style.removeProperty("--accent");
      m.style.removeProperty("--accent-2");
      m.style.removeProperty("--accent-soft");
    }
  }

  /* Large title estilo iOS: observa um "sentinela" no topo da view.
     Enquanto visível -> título grande; ao sair -> título inline na topbar. */
  function bindLargeTitle(text, sentinel) {
    if (refs._titleObserver) { refs._titleObserver.disconnect(); refs._titleObserver = null; }
    refs.inlineTitle.textContent = text || "";
    refs.topbar.classList.remove("show-inline-title");
    refs.topbar.classList.add("has-large-title"); // esconde o título fixo; usa inline
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    var obs = new IntersectionObserver(function (entries) {
      refs.topbar.classList.toggle("show-inline-title", !entries[0].isIntersecting);
    }, { root: refs.viewScroll, threshold: 0 });
    obs.observe(sentinel);
    refs._titleObserver = obs;
  }

  function resetLargeTitle() {
    if (refs._titleObserver) { refs._titleObserver.disconnect(); refs._titleObserver = null; }
    refs.topbar.classList.remove("show-inline-title", "has-large-title");
    refs.inlineTitle.textContent = "";
  }

  function onRoute(ctx) {
    setActive(ctx.active);
    resetLargeTitle();
    refs.title.textContent = ctx.title || "";
    // modo imersivo: esconde topbar + barra inferior (tela própria)
    refs.shell.classList.toggle("is-immersive", !!ctx.immersive);
    var hasBack = ctx.active === undefined || ["profile", "settings"].indexOf(ctx.active) >= 0 || !!ctx.communityId;
    refs.topbar.classList.toggle("has-back", hasBack);
    // token de rota: ignora getCommunity tardio se a rota já mudou (evita vazar accent)
    refs._routeSeq = (refs._routeSeq || 0) + 1;
    var seq = refs._routeSeq;
    if (ctx.communityId) {
      App.repo.getCommunity(ctx.communityId).then(function (c) { if (seq === refs._routeSeq) applyCommunityTheme(c); });
    } else {
      applyCommunityTheme(null);
    }
    updateBadges();
    App.ui.closeMenus();
  }

  function updateBadges() {
    // "Privado" = mensagens diretas/grupos globais (não chats de comunidade)
    var total = (App.repo.unreadConversations && App.repo.unreadConversations()) || 0;
    var badge = refs.shell.querySelector('[data-badge="chats"]');
    var dot = refs.shell.querySelector('[data-dot="chats"]');
    if (badge) { badge.textContent = total > 99 ? "99+" : total; badge.classList.toggle("u-hidden", total === 0); }
    if (dot) dot.classList.toggle("u-hidden", total === 0);
    // sino global: notificações não lidas
    var unread = (App.repo.unreadCount && App.repo.unreadCount()) || 0;
    var nb = refs.shell.querySelector('[data-badge="notif"]');
    if (nb) { nb.textContent = unread > 99 ? "99+" : unread; nb.classList.toggle("u-hidden", unread === 0); }
  }

  function init(root, user) {
    App.util.mount(root, build(user));
    App.router.setOutlet(refs.outlet);
    App.bus.on("route:change", onRoute);
    App.bus.on("message:new", updateBadges);
    App.bus.on("chats:read", updateBadges);
    App.bus.on("notif:new", updateBadges);
    App.bus.on("notif:read", updateBadges);
    App.bus.on("econ:change", function (e) { if (refs.coinNum) refs.coinNum.textContent = String((e && e.balance != null) ? e.balance : (App.repo.getBalance ? App.repo.getBalance() : 0)); });
    App.bus.on("econ:equip", function () { applyEquippedFrame(); });
    App.bus.on("user:updated", function (u) {
      var chip = refs.sidebar.querySelector(".me-chip");
      if (chip && chip.replaceWith) chip.replaceWith(meChip(u));
      applyEquippedFrame();
    });
    applyEquippedFrame();
    return refs;
  }

  App.shell = { init: init, refs: refs, updateBadges: updateBadges, bindLargeTitle: bindLargeTitle, get outlet() { return refs.outlet; } };
})(window.App = window.App || {});
