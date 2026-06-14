/* ============================================================
   components/ui.js — Primitivas reutilizáveis: Avatar, Tag,
   Button, Stat, Switch, Segmented, Modal, Toast, Menu, Confirm.
   Namespace: App.ui
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, initials = App.util.initials;

  /* ---------- Avatar (usa imagem ou iniciais) ---------- */
  function Avatar(opts) {
    opts = opts || {};
    var cls = "avatar" + (opts.round ? " avatar--round" : "") +
      (opts.size ? " avatar--" + opts.size : "") + (opts.ring ? " avatar--ring" : "");
    var node = el("div", { class: cls, title: opts.name || "" });
    if (opts.src) node.appendChild(el("img", { src: opts.src, alt: opts.name || "" }));
    else node.textContent = initials(opts.name);
    if (opts.bg) node.style.background = opts.bg;
    return node;
  }

  /* ---------- Tag / chip de título ou reputação ---------- */
  // paleta p/ tags coloridas (variant: "color")
  var TAG_COLORS = ["#22c55e", "#ef4444", "#06b6d4", "#a855f7", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#10b981", "#f97316", "#0ea5e9"];

  function Tag(label, opts) {
    opts = opts || {};
    var cls = "tag" + (opts.variant ? " tag--" + opts.variant : "");
    var node = el("span", { class: cls });
    if (opts.variant === "color") {
      // cor explícita (opts.color) tem prioridade; senão paleta por índice
      var c = opts.color || TAG_COLORS[(opts.colorIndex || 0) % TAG_COLORS.length];
      node.style.background = c;
      node.style.color = "#fff";
    }
    if (opts.dot) node.appendChild(el("span", { class: "dot" }));
    if (opts.icon) node.appendChild(App.icon(opts.icon, { size: "sm" }));
    node.appendChild(document.createTextNode(label));
    if (opts.onRemove) {
      node.classList.add("tag--removable");
      node.appendChild(el("button", {
        class: "tag__x", type: "button", "aria-label": "Remover",
        onClick: function (e) { e.stopPropagation(); opts.onRemove(label); }
      }, App.icon("close", { size: "sm" })));
    }
    return node;
  }

  /* ---------- Botão ---------- */
  function Button(opts) {
    opts = opts || {};
    var cls = "btn" +
      (opts.variant ? " btn--" + opts.variant : "") +
      (opts.size ? " btn--" + opts.size : "") +
      (opts.block ? " btn--block" : "") +
      (opts.iconOnly ? " btn--icon" : "") +
      (opts.class ? " " + opts.class : "");
    var node = el("button", { class: cls, type: opts.type || "button", disabled: opts.disabled || null });
    if (opts.onClick) node.addEventListener("click", opts.onClick);
    if (opts.icon) node.appendChild(App.icon(opts.icon, { size: opts.size === "sm" ? "sm" : null, fill: opts.iconFill }));
    if (opts.label && !opts.iconOnly) node.appendChild(el("span", opts.label));
    // estado de carregamento: node.setLoading(bool) sobrepõe spinner e bloqueia cliques (sem alterar largura)
    var spin = null;
    node.setLoading = function (on) {
      on = !!on;
      node.classList.toggle("is-loading", on);
      node.setAttribute("aria-busy", on ? "true" : "false");
      if (on && !spin) { spin = Spinner({ size: "sm" }); spin.classList.add("btn__spinner"); node.appendChild(spin); }
      else if (!on && spin) { spin.remove(); spin = null; }
    };
    if (opts.loading) node.setLoading(true);
    return node;
  }

  function IconButton(icon, opts) {
    opts = opts || {};
    var node = el("button", { class: "icon-btn", type: "button", title: opts.title || "", "aria-label": opts.title || icon });
    node.appendChild(App.icon(icon, { size: opts.size }));
    if (opts.onClick) node.addEventListener("click", opts.onClick);
    return node;
  }

  /* Botão de curtir com animação (pop + anel + faíscas).
     opts: { count, liked, onToggle(next) -> Promise<count>|count } */
  /* ---- animações de curtir (yui540, 2026-06-07, MIT) escolhíveis ---- */
  var LK_PAL = ["#ff3b6b", "#ff5fa2", "#ffb13b", "#7c59ec", "#22c55e", "#3b82f6"];
  var LK_VARIANTS = [
    { key: "a", label: "Explosão" },   // partículas radiais + onda
    { key: "b", label: "Corações" },   // anel pulsante + coraçõezinhos
    { key: "c", label: "Faíscas" },    // faíscas em linha
    { key: "d", label: "Padrão" }      // sem efeito: só o pulo do coração
  ];
  var LK_CHOOSER_MS = 3000;
  var _lkChooser = null;   // { close } do chooser ativo (só um por vez)

  function lkBuildFx(variant) {
    var fx = el("span", { class: "lk-fx" });
    function dot(i, n) { var s = el("span", { class: "lk-p" }); var a = (i * (360 / n)) * Math.PI / 180, d = 24; s.style.setProperty("--tx", (Math.cos(a) * d).toFixed(1) + "px"); s.style.setProperty("--ty", (Math.sin(a) * d).toFixed(1) + "px"); s.style.background = LK_PAL[i % LK_PAL.length]; s.style.animationDelay = (i % 2 ? 0.02 : 0) + "s"; return s; }
    function ring() { return el("span", { class: "lk-ring" }); }
    function pulse() { return el("span", { class: "lk-pulse" }); }
    function rh(x, rot, d) { var s = el("span", { class: "lk-rh" }, "♥"); s.style.setProperty("--x", x + "px"); s.style.setProperty("--rot", rot + "deg"); s.style.animationDelay = d + "s"; return s; }
    function spark(i, n) { var s = el("span", { class: "lk-sp" }); s.style.setProperty("--r", (i * (360 / n)) + "deg"); return s; }
    var i;
    if (variant === "a") { fx.appendChild(ring()); for (i = 0; i < 8; i++) fx.appendChild(dot(i, 8)); }
    else if (variant === "b") { fx.appendChild(pulse()); var xs = [-7, -3, 0, 3, 7], rs = [-18, -6, 0, 6, 18]; for (i = 0; i < 5; i++) fx.appendChild(rh(xs[i], rs[i], i * 0.04)); }
    else if (variant === "c") { for (i = 0; i < 10; i++) fx.appendChild(spark(i, 10)); }
    /* "d" = Padrão: sem partículas, só o pulo do coração (fx vazio) */
    return fx;
  }
  // dispara o burst dentro de `host` (botão de curtir OU opção do chooser)
  function lkSpawn(host, variant, withPop) {
    var old = host.querySelector(".lk-fx"); if (old) old.remove();
    if (withPop) { host.classList.remove("just-liked"); void host.offsetWidth; host.classList.add("just-liked"); }
    var fx = lkBuildFx(variant); host.appendChild(fx);
    setTimeout(function () { if (fx.parentNode) fx.remove(); }, 900);
    if (withPop) setTimeout(function () { host.classList.remove("just-liked"); }, 520);
  }

  function LikeButton(opts) {
    opts = opts || {};
    var liked = !!opts.liked, count = opts.count || 0;
    var countEl = el("span", String(count));
    var btn = el("button", { class: "like-btn" + (liked ? " is-on" : ""), type: "button" });
    function paint() { App.util.mount(btn, [App.icon("heart", { size: opts.size || "sm", fill: liked }), countEl]); }
    paint();

    function playFx(variant) { lkSpawn(btn, variant, true); }
    // padrão sai na maioria; ~22% de chance de um efeito aleatório (a/b/c).
    // escolha explícita no chooser (≠ "d") sempre toca aquela.
    function pickBurst() {
      var sel = App.store.get("likeFx") || "d";
      if (sel !== "d") return sel;
      if (Math.random() < 0.22) { var pool = ["a", "b", "c"]; return pool[Math.floor(Math.random() * pool.length)]; }
      return "d";
    }
    function burst() { playFx(pickBurst()); }

    /* chooser: barra pequena acima do coração, com timer que fecha sozinho */
    function closeChooser() {
      if (_lkChooser) { _lkChooser.close(); _lkChooser = null; }
    }
    function openChooser() {
      closeChooser();
      var cur = App.store.get("likeFx") || "d";
      var pop = el("div", { class: "lk-chooser" });
      LK_VARIANTS.forEach(function (v) {
        var o = el("button", { class: "lk-chooser__opt" + (v.key === cur ? " is-on" : ""), type: "button", title: v.label },
          App.icon("heart", { size: "sm", fill: true }));
        // passar o mouse → a própria opção pisca a animação daquele efeito
        o.addEventListener("pointerenter", function () { lkSpawn(o, v.key, true); });
        o.addEventListener("click", function (e) {
          e.stopPropagation(); e.preventDefault();
          App.store.set("likeFx", v.key);
          App.util.qsa(".lk-chooser__opt", pop).forEach(function (x) { x.classList.remove("is-on"); });
          o.classList.add("is-on");
          playFx(v.key);          // toca a animação escolhida no botão real
          setTimeout(doClose, 460);
        });
        pop.appendChild(o);
      });
      btn.appendChild(pop);

      var closed = false;
      function doClose() {
        if (closed) return; closed = true;
        document.removeEventListener("pointerdown", outside, true);
        document.removeEventListener("scroll", onScroll, true);
        pop.classList.add("lk-chooser--closing");           // fecha progressivamente (fade)
        setTimeout(function () { if (pop.parentNode) pop.remove(); }, 170);
        if (_lkChooser && _lkChooser._pop === pop) _lkChooser = null;
      }
      function outside(e) { if (!pop.contains(e.target)) doClose(); }
      // ao rolar a interface (cima/baixo) → fecha
      function onScroll() { doClose(); }
      setTimeout(function () {
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("scroll", onScroll, true);   // captura rolagem de qualquer container
      }, 0);
      _lkChooser = { close: doClose, _pop: pop };
    }

    // long-press abre o chooser; clique normal curte
    var pressTimer = null, longFired = false, sx = 0, sy = 0;
    btn.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      longFired = false; sx = e.clientX; sy = e.clientY;
      pressTimer = setTimeout(function () { longFired = true; openChooser(); }, 420);
    });
    btn.addEventListener("pointermove", function (e) {
      if (pressTimer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) { clearTimeout(pressTimer); pressTimer = null; }
    });
    function endPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
    btn.addEventListener("pointerup", endPress);
    btn.addEventListener("pointercancel", endPress);
    btn.addEventListener("pointerleave", endPress);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (longFired) { e.preventDefault(); longFired = false; return; }   // foi long-press → não curte
      var willLike = !liked;
      if (willLike) burst();
      var res = opts.onToggle ? opts.onToggle(willLike) : null;
      function apply(n) { liked = willLike; count = (typeof n === "number") ? n : count + (willLike ? 1 : -1); countEl.textContent = String(count); btn.classList.toggle("is-on", liked); App.util.mount(btn, [App.icon("heart", { size: opts.size || "sm", fill: liked }), countEl]); }
      if (res && typeof res.then === "function") res.then(apply); else apply(res);
    });
    return btn;
  }

  function Stat(num, label, onClick) {
    var node = el("div", { class: "stat" },
      el("span", { class: "stat__num" }, App.util.formatCount(num)),
      el("span", { class: "stat__label" }, label));
    if (onClick) { node.style.cursor = "pointer"; node.addEventListener("click", onClick); }
    return node;
  }

  function Switch(on, onChange) {
    var node = el("button", { class: "switch" + (on ? " is-on" : ""), type: "button", role: "switch", "aria-checked": String(!!on) });
    node.addEventListener("click", function () {
      on = !on;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-checked", String(on));
      // animação de ativar/desativar (pulso no botão)
      node.classList.remove("is-pulse");
      void node.offsetWidth;
      node.classList.add(on ? "is-pulse" : "is-pulse-off");
      setTimeout(function () { node.classList.remove("is-pulse", "is-pulse-off"); }, 300);
      onChange && onChange(on);
    });
    return node;
  }

  function Segmented(items, active, onChange) {
    var node = el("div", { class: "segmented" });
    var thumb = el("span", { class: "segmented__thumb", "aria-hidden": "true" });
    node.appendChild(thumb);
    function moveThumb(b) {
      if (!b) return;
      thumb.style.width = b.offsetWidth + "px";
      thumb.style.height = b.offsetHeight + "px";
      thumb.style.transform = "translate(" + b.offsetLeft + "px," + b.offsetTop + "px)";
    }
    items.forEach(function (it) {
      var b = el("button", { class: "segmented__item" + (it.value === active ? " is-active" : ""), type: "button" }, it.label);
      b.addEventListener("click", function () {
        App.util.qsa(".segmented__item", node).forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        moveThumb(b);                 // pílula desliza p/ a opção escolhida
        onChange && onChange(it.value);
      });
      node.appendChild(b);
    });
    // posiciona a pílula na opção ativa após o layout
    requestAnimationFrame(function () { moveThumb(node.querySelector(".segmented__item.is-active") || node.querySelector(".segmented__item")); });
    return node;
  }

  /* ---------- Modal ---------- */
  function openModal(opts) {
    opts = opts || {};
    var body = opts.body instanceof Node ? opts.body : el("div", opts.body || "");
    var footActions = (opts.actions || []).map(function (a) { return a instanceof Node ? a : Button(a); });

    var modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true" },
      el("div", { class: "modal__head" },
        el("h3", { class: "modal__title" }, opts.title || ""),
        IconButton("close", { title: "Fechar", onClick: close })),
      el("div", { class: "modal__body" }, body),
      footActions.length ? el("div", { class: "modal__foot" }, footActions) : null
    );
    var scrim = el("div", { class: "scrim" + (opts.scrimClass ? " " + opts.scrimClass : "") }, modal);
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim && opts.dismissable !== false) close(); });
    var SEL = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    function focusables() { return App.util.qsa(SEL, modal).filter(function (n) { return n.offsetParent !== null || n.getBoundingClientRect; }); }
    function onKey(e) {
      if (e.key === "Escape" && opts.dismissable !== false) { close(); return; }
      if (e.key === "Tab") {
        // trap focus dentro do modal
        var f = focusables(); if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1], a = document.activeElement;
        if (e.shiftKey && (a === first || !modal.contains(a))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (a === last || !modal.contains(a))) { e.preventDefault(); first.focus(); }
      }
    }
    var prevFocus = document.activeElement; // restaura ao fechar
    var closing = false;
    function close() {
      if (closing) return; closing = true;
      if (App.sound) App.sound.play("close");
      document.removeEventListener("keydown", onKey);
      scrim.classList.add("is-closing"); // anima saída antes de remover
      setTimeout(function () { scrim.remove(); }, 180);
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
      opts.onClose && opts.onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
    if (App.sound) App.sound.play("open");
    // foca o 1º elemento útil (depois do paint)
    setTimeout(function () { var f = focusables(); if (f.length) { try { (f[1] || f[0]).focus(); } catch (e) {} } }, 30);
    return { close: close, root: modal };
  }

  /* ---------- Confirmação ---------- */
  function confirm(opts) {
    return new Promise(function (resolve) {
      var ref = openModal({
        title: opts.title || "Confirmar",
        body: el("p", { class: "u-dim" }, opts.message || ""),
        dismissable: true,
        onClose: function () { resolve(false); },
        actions: [
          Button({ label: opts.cancelLabel || "Cancelar", variant: "ghost", onClick: function () { ref.close(); resolve(false); } }),
          Button({ label: opts.confirmLabel || "Confirmar", variant: opts.danger ? "danger" : "primary", onClick: function () { resolve(true); ref._done = true; ref.close(); } })
        ]
      });
    });
  }

  /* ---------- Prompt (entrada de texto) ---------- */
  function prompt(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var field = opts.multiline
        ? el("textarea", { class: "field field--area", rows: "4", placeholder: opts.placeholder || "" })
        : el("input", { class: "field", type: "text", placeholder: opts.placeholder || "" });
      if (opts.value) field.value = opts.value;
      var body = el("div", { class: "prompt-body" },
        opts.label ? el("label", { class: "field-label" }, opts.label) : null, field);
      var done = false;
      var ref = openModal({
        title: opts.title || "",
        body: body,
        dismissable: true,
        onClose: function () { if (!done) resolve(null); },
        actions: [
          Button({ label: opts.cancelLabel || "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
          Button({ label: opts.confirmLabel || "OK", variant: opts.danger ? "danger" : "primary", onClick: function () { done = true; var v = (field.value || "").trim(); ref.close(); resolve(v); } })
        ]
      });
      setTimeout(function () { try { field.focus(); } catch (e) {} }, 30);
    });
  }

  /* ---------- Toast ---------- */
  function toast(message, kind) {
    if (App.sound) App.sound.play(kind === "ok" ? "success" : kind === "danger" ? "error" : "message");
    var host = App.util.qs(".toast-host");
    if (!host) { host = el("div", { class: "toast-host" }); document.body.appendChild(host); }
    var t = el("div", { class: "toast" + (kind ? " toast--" + kind : "") },
      kind === "ok" ? App.icon("check", { size: "sm" }) : (kind === "danger" ? App.icon("info", { size: "sm" }) : null),
      el("span", message));
    host.appendChild(t);
    // não empilhar infinito: mantém no máx. 3 toasts
    var all = App.util.qsa(".toast", host);
    while (all.length > 3) { all[0].remove(); all.shift(); }
    setTimeout(function () { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; setTimeout(function () { t.remove(); }, 200); }, 2600);
  }

  /* ---------- Menu de contexto ---------- */
  function openMenu(anchor, items) {
    closeMenus();
    var menu = el("div", { class: "menu" });
    items.forEach(function (it) {
      if (it.sep) { menu.appendChild(el("div", { class: "menu__sep" })); return; }
      var item = el("button", { class: "menu__item" + (it.danger ? " menu__item--danger" : ""), type: "button" });
      if (it.icon) item.appendChild(App.icon(it.icon, { size: "sm", fill: it.iconFill }));
      item.appendChild(el("span", it.label));
      item.addEventListener("click", function () { closeMenus(); it.onClick && it.onClick(); });
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    var top = r.bottom + 6, left = r.right - menu.offsetWidth;
    if (left < 8) left = r.left;
    if (top + menu.offsetHeight > window.innerHeight - 8) top = r.top - menu.offsetHeight - 6;
    menu.style.top = Math.max(8, top) + "px";
    menu.style.left = Math.max(8, left) + "px";
    setTimeout(function () { document.addEventListener("mousedown", outside); }, 0);
    function outside(e) { if (!menu.contains(e.target)) closeMenus(); }
    menu._outside = outside;
    return menu;
  }
  function closeMenus() {
    App.util.qsa(".menu").forEach(function (m) {
      if (m._outside) document.removeEventListener("mousedown", m._outside);
      m.remove();
    });
  }

  /* ---------- Action sheet (bottom-sheet com opções) ---------- */
  function openActionSheet(items, opts) {
    opts = opts || {};
    var sheet = el("div", { class: "action-sheet" });
    if (opts.title) sheet.appendChild(el("div", { class: "action-sheet__title" }, opts.title));
    var group = el("div", { class: "action-sheet__group" });
    items.forEach(function (it) {
      var row = el("button", { class: "action-sheet__item" + (it.danger ? " action-sheet__item--danger" : ""), type: "button" },
        it.icon ? App.icon(it.icon, { size: "sm", fill: it.iconFill }) : null,
        el("span", { class: "u-grow" }, it.label),
        App.icon("forward", { size: "sm", cls: "u-muted" }));
      row.addEventListener("click", function () { close(); it.onClick && it.onClick(); });
      group.appendChild(row);
    });
    sheet.appendChild(group);
    var cancel = el("button", { class: "action-sheet__cancel", type: "button" }, opts.cancelLabel || "Cancelar");
    cancel.addEventListener("click", close);
    sheet.appendChild(cancel);

    var scrim = el("div", { class: "scrim scrim--sheet" }, sheet);
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
    function onKey(e) { if (e.key === "Escape") close(); }
    var sheetClosing = false;
    function close() { if (sheetClosing) return; sheetClosing = true; if (App.sound) App.sound.play("close"); document.removeEventListener("keydown", onKey); scrim.classList.add("is-closing"); setTimeout(function () { scrim.remove(); }, 200); }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
    if (App.sound) App.sound.play("open");
    return { close: close };
  }

  /* ---------- Campo de formulário ---------- */
  function Field(label, control, hint) {
    return el("label", { class: "field" },
      label ? el("span", { class: "field__label" }, label) : null,
      control,
      hint ? el("span", { class: "field__hint" }, hint) : null);
  }
  function Input(opts) {
    opts = opts || {};
    return el("input", { class: "input", type: opts.type || "text", value: opts.value || "", placeholder: opts.placeholder || "", maxlength: opts.maxlength || null, oninput: opts.oninput || null });
  }
  function Textarea(opts) {
    opts = opts || {};
    var t = el("textarea", { class: "textarea", placeholder: opts.placeholder || "", maxlength: opts.maxlength || null, oninput: opts.oninput || null });
    t.value = opts.value || "";
    return t;
  }
  /* Limites de texto centralizados (anti-abuso). Use App.ui.LIMITS.* */
  var LIMITS = {
    bio: 300, message: 2000, comment: 1000,
    postTitle: 150, postBody: 5000,
    groupName: 60, name: 50, handle: 30,
    pollOption: 120, quizText: 300, linkText: 200, url: 2000,
    communityName: 40, communityDesc: 280, modReason: 240, tag: 20
  };

  /* Aplica maxlength a um input/textarea e anexa um contador "n/máx" vivo.
     Retorna o nó contador (posicione onde quiser); fica vermelho perto do limite. */
  function limitField(node, max, opts) {
    opts = opts || {};
    if (!node || !max) return null;
    try { node.maxLength = max; node.setAttribute("maxlength", max); } catch (e) {}
    var counter = el("span", { class: "char-counter" });
    function paint() {
      var len = (node.value || "").length;
      counter.textContent = len + "/" + max;
      counter.classList.toggle("is-warn", len >= max * 0.9);
      counter.classList.toggle("is-full", len >= max);
    }
    node.addEventListener("input", paint);
    paint();
    if (opts.mount) opts.mount.appendChild(counter);
    return counter;
  }

  /* ---------- Spinner (SVG stroke-dashoffset) ----------
     opts: { size: "sm"|"lg", label, center } → svg, ou bloco centrado se label/center. */
  function Spinner(opts) {
    opts = opts || {};
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 50 50");
    svg.setAttribute("class", "spinner" + (opts.size ? " spinner--" + opts.size : ""));
    svg.setAttribute("role", "status");
    svg.setAttribute("aria-label", opts.label || "Carregando");
    svg.innerHTML =
      '<circle class="spinner__track" cx="25" cy="25" r="20" fill="none" stroke-width="4"/>' +
      '<circle class="spinner__arc" cx="25" cy="25" r="20" fill="none" stroke-width="4" pathLength="100" stroke-linecap="round"/>';
    if (!opts.center && !opts.label) return svg;
    return el("div", { class: "spinner-box" }, svg,
      opts.label ? el("span", { class: "spinner-box__label" }, opts.label) : null);
  }

  function Empty(icon, title, desc, action) {
    // ícone/ilustração removido a pedido — estado vazio só com texto
    return el("div", { class: "empty" },
      el("h3", title),
      desc ? el("p", desc) : null,
      action || null);
  }

  App.ui = {
    Avatar: Avatar, Tag: Tag, Button: Button, IconButton: IconButton, Stat: Stat, LikeButton: LikeButton,
    Switch: Switch, Segmented: Segmented, openModal: openModal, confirm: confirm, prompt: prompt,
    toast: toast, openMenu: openMenu, closeMenus: closeMenus, openActionSheet: openActionSheet,
    Field: Field, Input: Input, Textarea: Textarea, Empty: Empty, Spinner: Spinner,
    LIMITS: LIMITS, limitField: limitField
  };
})(window.App = window.App || {});
