/* ============================================================
   core/store.js — Estado de sessão + preferências persistidas
   (tema, acento global, usuário atual). Namespace: App.store
   ============================================================ */
(function (App) {
  "use strict";

  var PREFS_KEY = "sanguao.prefs.v1";

  /* Marca padrão: paleta OKLCH definida em tokens.css (contraste AA com branco).
     Quando o acento é este valor, applyTheme NÃO sobrescreve inline — deixa
     tokens.css valer (que traz --accent/--accent-2 em oklch). */
  var DEFAULT_ACCENT = "#7c59ec";

  var defaults = {
    theme: "light",           // 'dark' | 'light' — PADRÃO: claro/branco
    themeExplicit: false,     // true só quando o usuário escolhe o tema (botão sol/lua)
    accent: DEFAULT_ACCENT,   // acento da conta global
    currentUserId: null,
    sidebarExpanded: false,   // padrão comprimida (só ícones)
    presence: "online",       // online | ausente | ocupado | invisivel
    soundEnabled: true        // sons de interface (Web Audio)
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      var s = Object.assign({}, defaults, raw ? JSON.parse(raw) : {});
      // tema branco por padrão: respeita só a escolha EXPLÍCITA do usuário.
      // Quem nunca clicou no botão de tema usa o padrão (claro), mesmo com prefs antigas salvas.
      if (!s.themeExplicit) s.theme = defaults.theme;
      return s;
    } catch (e) { return Object.assign({}, defaults); }
  }

  function persist() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function get(key) { return key ? state[key] : Object.assign({}, state); }

  function set(key, value) {
    state[key] = value;
    persist();
    App.bus.emit("store:change", { key: key, value: value });
    App.bus.emit("store:" + key, value);
  }

  /* Aplica tema + acento global ao documento (root). */
  function applyTheme() {
    var root = document.documentElement;
    root.setAttribute("data-theme", state.theme);
    if (state.accent === DEFAULT_ACCENT) {
      // usa a paleta OKLCH AA de tokens.css (--accent-2 com matiz, não só clareado)
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-2");
      root.style.removeProperty("--accent-soft");
    } else {
      // acento custom (usuário/comunidade): deriva par a partir do hex escolhido
      root.style.setProperty("--accent", state.accent);
      root.style.setProperty("--accent-2", shade(state.accent, 18));
      root.style.setProperty("--accent-soft", hexA(state.accent, 0.16));
    }
  }

  function setTheme(theme) { state.themeExplicit = true; set("theme", theme); applyTheme(); }
  function toggleTheme() {
    // transição suave de cores entre claro/escuro (respeita reduce-motion via CSS)
    var root = document.documentElement;
    root.classList.add("theme-anim");
    clearTimeout(toggleTheme._t);
    toggleTheme._t = setTimeout(function () { root.classList.remove("theme-anim"); }, 360);
    setTheme(state.theme === "dark" ? "light" : "dark");
  }
  function setAccent(hex) { set("accent", hex); applyTheme(); }

  /* utilidades de cor */
  function hexA(hex, a) {
    var c = parse(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }
  /* pct > 0 clareia (mistura com branco), pct < 0 escurece (mistura com preto) */
  function shade(hex, pct) {
    var c = parse(hex);
    var f = pct / 100;
    function mix(v) {
      var target = f >= 0 ? 255 : 0;
      var amt = Math.abs(f);
      return Math.max(0, Math.min(255, Math.round(v + (target - v) * amt)));
    }
    return "#" + [mix(c.r), mix(c.g), mix(c.b)].map(function (v) {
      return ("0" + v.toString(16)).slice(-2);
    }).join("");
  }
  function parse(hex) {
    hex = (hex || "#7c59ec").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (x) { return x + x; }).join("");
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }

  App.store = {
    get: get, set: set,
    applyTheme: applyTheme, setTheme: setTheme, toggleTheme: toggleTheme, setAccent: setAccent,
    color: { hexA: hexA, shade: shade }
  };
})(window.App = window.App || {});
