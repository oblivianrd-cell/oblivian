/* ============================================================
   components/devmode.js — Modo desenvolvedor (inspetor de UI).
   Liga com Ctrl+Shift+D ou pelo link no login. Com ele ON:
   Alt+passar o mouse = destaca elemento; Alt+clicar = abre painel
   com estilos (font/padding/cor/raio), editáveis AO VIVO, e botão
   "Copiar p/ Claude" que gera um bloco pronto pra colar no chat.
   Namespace: App.devmode
   ============================================================ */
(function (App) {
  "use strict";
  var el = (App.util && App.util.el) || function (t) { return document.createElement(t); };
  var KEY = "oblivian.devmode";

  var on = false, altDown = false, hi = null, panel = null, badgeEl = null, changes = {};

  /* seletor legível do elemento (tag#id.classe) — ignora classes do próprio dev */
  function selector(node) {
    if (!node || node === document.body) return "body";
    var s = node.tagName.toLowerCase();
    if (node.id) s += "#" + node.id;
    if (typeof node.className === "string" && node.className.trim()) {
      var c = node.className.trim().split(/\s+/).filter(function (x) { return x && x.indexOf("dev-") !== 0; }).slice(0, 3);
      if (c.length) s += "." + c.join(".");
    }
    return s;
  }

  function ensureHi() { if (!hi) { hi = el("div"); hi.className = "dev-hi"; document.body.appendChild(hi); } return hi; }
  function showHi(node) {
    var r = node.getBoundingClientRect(), h = ensureHi();
    h.style.display = "block"; h.style.left = r.left + "px"; h.style.top = r.top + "px";
    h.style.width = r.width + "px"; h.style.height = r.height + "px";
  }
  function hideHi() { if (hi) hi.style.display = "none"; }

  function onMove(e) {
    if (!altDown) { hideHi(); return; }
    var t = e.target; if (!t || (t.closest && t.closest(".dev-panel"))) return;
    showHi(t);
  }
  function onClick(e) {
    if (!altDown) return;                 // só Alt+clique inspeciona (não atrapalha o uso normal)
    var t = e.target; if (!t || (t.closest && t.closest(".dev-panel"))) return;
    e.preventDefault(); e.stopPropagation();
    openPanel(t);
  }

  function fieldRow(label, value, onInput) {
    var row = el("label"); row.className = "dev-f";
    var lab = el("span"); lab.className = "dev-f__l"; lab.textContent = label;
    var inp = el("input"); inp.className = "dev-f__inp"; inp.value = value || "";
    inp.addEventListener("input", function () { onInput(inp.value); });
    row.appendChild(lab); row.appendChild(inp);
    return row;
  }

  var PROPS = [
    ["font-size", "fontSize"], ["font-weight", "fontWeight"], ["line-height", "lineHeight"],
    ["color", "color"], ["background", "backgroundColor"],
    ["padding", "padding"], ["margin", "margin"], ["border-radius", "borderRadius"],
    ["width", "width"], ["height", "height"]
  ];
  var EDITABLE = ["font-size", "color", "background", "padding", "margin", "border-radius"];

  function openPanel(node) {
    changes = {};
    var cs = getComputedStyle(node), orig = {};
    PROPS.forEach(function (p) { orig[p[0]] = cs[p[1]]; });

    if (panel) panel.remove();
    panel = el("div"); panel.className = "dev-panel";

    var head = el("div"); head.className = "dev-panel__head";
    var name = el("strong"); name.textContent = selector(node); head.appendChild(name);
    var x = el("button"); x.className = "dev-panel__x"; x.type = "button"; x.textContent = "×";
    x.addEventListener("click", closePanel); head.appendChild(x);
    panel.appendChild(head);

    EDITABLE.forEach(function (nm) {
      panel.appendChild(fieldRow(nm, orig[nm], function (v) {
        changes[nm] = v;
        node.style.setProperty(nm === "background" ? "background" : nm, v);
        showHi(node);
      }));
    });

    var ta = el("textarea"); ta.className = "dev-ta"; ta.placeholder = "O que mudar / pedir...";
    panel.appendChild(ta);

    var copy = el("button"); copy.className = "dev-copy"; copy.type = "button"; copy.textContent = "Copiar p/ Claude";
    copy.addEventListener("click", function () {
      var L = ["## Ajuste de UI (modo dev)",
        "Elemento: " + selector(node),
        "Rota: " + (location.hash || "/"),
        "Texto: \"" + ((node.textContent || "").trim().slice(0, 60)) + "\"",
        "", "Estilos atuais:"];
      PROPS.forEach(function (p) { L.push("  " + p[0] + ": " + orig[p[0]]); });
      var ch = Object.keys(changes);
      if (ch.length) { L.push("", "Eu mudei para:"); ch.forEach(function (k) { L.push("  " + k + ": " + changes[k]); }); }
      L.push("", "Pedido: " + (ta.value.trim() || "(descreva o ajuste)"));
      var txt = L.join("\n");
      function done() { copy.textContent = "Copiado! ✓"; setTimeout(function () { copy.textContent = "Copiar p/ Claude"; }, 1400); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallback(txt); done(); });
      else { fallback(txt); done(); }
    });
    panel.appendChild(copy);
    document.body.appendChild(panel);
  }
  function fallback(txt) { try { var t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); } catch (e) {} }
  function closePanel() { if (panel) { panel.remove(); panel = null; } }

  function badge(show) {
    if (show && !badgeEl) { badgeEl = el("div"); badgeEl.className = "dev-badge"; badgeEl.textContent = "DEV · Alt+clique p/ inspecionar"; document.body.appendChild(badgeEl); }
    else if (!show && badgeEl) { badgeEl.remove(); badgeEl = null; }
  }

  function enable() {
    if (on) return; on = true;
    document.body.classList.add("is-devmode");
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
  }
  function disable() {
    on = false;
    document.body.classList.remove("is-devmode");
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    hideHi(); closePanel(); badge(false);
  }
  function setOn(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) {} if (v) enable(); else disable(); if (App.ui && App.ui.toast) App.ui.toast(v ? "Modo dev ON" : "Modo dev OFF", "ok"); }
  function isOn() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function toggle() { setOn(!on); }

  window.addEventListener("keydown", function (e) {
    if (e.key === "Alt") altDown = true;
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) { e.preventDefault(); toggle(); }
  });
  window.addEventListener("keyup", function (e) { if (e.key === "Alt") { altDown = false; hideHi(); } });
  window.addEventListener("blur", function () { altDown = false; hideHi(); });

  App.devmode = { toggle: toggle, setOn: setOn, isOn: isOn };

  if (isOn()) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enable); else enable(); }
})(window.App = window.App || {});
