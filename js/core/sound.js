/* ============================================================
   core/sound.js — Síntese de áudio da interface (Web Audio).
   Sons procedurais (sem arquivos), tocados em todas as telas via
   delegação global de eventos. Namespace: App.sound
   Inspirado em https://audio.raphaelsalaja.com (declarativo).
   ============================================================ */
(function (App) {
  "use strict";

  /* ---------- Patches: definição declarativa de cada som ----------
     notes[]: { type, freq, freq2?, dur, gain, attack?, decay?, delay?, cutoff?, noise? } */
  var PATCHES = {
    tap:       { notes: [{ type: "triangle", freq: 600, freq2: 520, dur: 0.045, gain: 0.12, cutoff: 2600 }] },
    select:    { notes: [{ type: "sine", freq: 540, dur: 0.05, gain: 0.13 }] },
    toggleOn:  { notes: [{ type: "sine", freq: 480, freq2: 720, dur: 0.09, gain: 0.14 }] },
    toggleOff: { notes: [{ type: "sine", freq: 600, freq2: 340, dur: 0.09, gain: 0.14 }] },
    nav:       { notes: [{ type: "sine", freq: 300, freq2: 520, dur: 0.10, gain: 0.13, cutoff: 1800 }] },
    open:      { notes: [{ type: "triangle", freq: 280, freq2: 560, dur: 0.12, gain: 0.13, cutoff: 2200 }] },
    close:     { notes: [{ type: "triangle", freq: 520, freq2: 250, dur: 0.10, gain: 0.12, cutoff: 1800 }] },
    back:      { notes: [{ type: "sine", freq: 460, freq2: 320, dur: 0.07, gain: 0.12 }] },
    like:      { notes: [{ type: "sine", freq: 520, dur: 0.06, gain: 0.13 }, { type: "sine", freq: 784, dur: 0.09, gain: 0.13, delay: 0.05 }] },
    message:   { notes: [{ type: "sine", freq: 660, dur: 0.06, gain: 0.12 }] },
    success:   { notes: [{ type: "sine", freq: 523, dur: 0.08, gain: 0.13 }, { type: "sine", freq: 659, dur: 0.08, gain: 0.13, delay: 0.07 }, { type: "sine", freq: 880, dur: 0.12, gain: 0.13, delay: 0.14 }] },
    error:     { notes: [{ type: "square", freq: 200, freq2: 150, dur: 0.16, gain: 0.10, cutoff: 1200 }, { type: "square", freq: 160, dur: 0.14, gain: 0.09, delay: 0.10, cutoff: 1000 }] },
    warn:      { notes: [{ type: "sine", freq: 330, freq2: 300, dur: 0.09, gain: 0.13 }] },
    "delete":  { notes: [{ noise: true, dur: 0.14, gain: 0.10, cutoff: 1400 }, { type: "sine", freq: 180, freq2: 90, dur: 0.16, gain: 0.12, delay: 0.02 }] }
  };

  var ctx = null, master = null;
  var lastAt = {};                 // anti-spam por patch
  var MASTER_GAIN = 0.5;

  function enabled() { return App.store.get("soundEnabled") !== false; }
  function setEnabled(on) { App.store.set("soundEnabled", !!on); if (on) unlock(); }
  function toggle() { setEnabled(!enabled()); return enabled(); }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  /* Política de autoplay: AudioContext nasce suspenso; retoma no 1º gesto. */
  function unlock() {
    var c = ensureCtx();
    if (c && c.state === "suspended") { try { c.resume(); } catch (e) {} }
  }

  function noiseBuffer() {
    if (noiseBuffer._b) return noiseBuffer._b;
    var len = Math.floor(ctx.sampleRate * 0.2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (i / len < 1) ? (1 - i / len) * (Math.sin(i * 12.9898) * 43758.5453 % 1) : 0;
    noiseBuffer._b = buf;
    return buf;
  }

  function voice(n, t0) {
    var amp = ctx.createGain();
    var attack = n.attack || 0.005, dur = n.dur || 0.08, peak = n.gain || 0.12;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var out = amp;
    if (n.cutoff) {
      var lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = n.cutoff;
      amp.connect(lp); lp.connect(master);
    } else {
      amp.connect(master);
    }

    var src;
    if (n.noise) {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer();
    } else {
      src = ctx.createOscillator();
      src.type = n.type || "sine";
      src.frequency.setValueAtTime(n.freq, t0);
      if (n.freq2) src.frequency.exponentialRampToValueAtTime(n.freq2, t0 + dur);
    }
    src.connect(out);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function play(name) {
    if (!enabled()) return;
    var p = PATCHES[name];
    if (!p) return;
    var c = ensureCtx();
    if (!c) return;
    if (c.state === "suspended") { try { c.resume(); } catch (e) {} }
    var now = c.currentTime;
    var last = lastAt[name];
    if (last != null && now - last < 0.03) return;   // mesmo patch < 30ms: ignora (anti-spam)
    lastAt[name] = now;
    p.notes.forEach(function (n) { voice(n, now + (n.delay || 0)); });
  }

  /* ---------- Mapeia um elemento clicado -> patch ---------- */
  function patchFor(node) {
    if (node.closest(".like-btn")) return "like";
    if (node.closest(".switch")) {
      var sw = node.closest(".switch");
      return sw.classList.contains("is-on") ? "toggleOff" : "toggleOn"; // estado ATUAL (vira ao soltar)
    }
    if (node.closest(".segmented__item, .settings-scope__tab, .settings-nav__item, .swatch, .tab")) return "select";
    if (node.closest(".btn--danger, .menu__item--danger, .action-sheet__item--danger")) return "warn";
    if (node.closest(".action-sheet__cancel")) return "close";
    var icon = node.closest('[title="Voltar"], [title="Fechar"], .icon-btn');
    if (icon) {
      var t = icon.getAttribute("title") || "";
      if (t === "Voltar") return "back";
      if (t === "Fechar") return "close";
    }
    // links de navegação não soam no toque — o som "nav" vem da troca de rota (cobre voltar/programático)
    if (node.closest('[data-nav], .nav-item, .sidebar__item, .tabbar__item, a[href^="#/"]')) return null;
    if (node.closest('.btn, .icon-btn, .menu__item, .action-sheet__item, .list-item, button, [role="button"]')) return "tap";
    return null;
  }

  function interactiveDisabled(node) {
    var b = node.closest("button, [aria-disabled]");
    return b && (b.disabled || b.getAttribute("aria-disabled") === "true");
  }

  function onPointerDown(e) {
    unlock();
    if (!enabled()) return;
    if (e.button != null && e.button !== 0) return;
    var t = e.target;
    if (!t || !t.closest || interactiveDisabled(t)) return;
    var name = patchFor(t);
    if (name) play(name);
  }

  /* Teclado: Enter/Espaço em elemento interativo focado. */
  function onKeyDown(e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    if (e.repeat) return;
    var t = document.activeElement;
    if (!t || !t.closest) return;
    if (interactiveDisabled(t)) return;
    var name = patchFor(t);
    if (name) play(name);
  }

  function init() {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    // som de transição em toda navegação (clique, voltar, ou programática)
    if (App.bus) App.bus.on("route:change", function () { play("nav"); });
    // 1º gesto desbloqueia o áudio (cobre browsers que exigem interação)
    ["pointerdown", "touchstart", "keydown"].forEach(function (ev) {
      document.addEventListener(ev, unlock, { once: true, capture: true });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  App.sound = {
    play: play,
    enabled: enabled,
    setEnabled: setEnabled,
    toggle: toggle,
    unlock: unlock,
    patches: PATCHES
  };
})(window.App = window.App || {});
