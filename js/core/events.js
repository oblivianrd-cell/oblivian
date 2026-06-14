/* ============================================================
   core/events.js — Barramento de eventos pub/sub.
   Namespace: App.bus
   Usado para reatividade leve entre componentes/telas.
   ============================================================ */
(function (App) {
  "use strict";

  var listeners = {};

  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return function off() { App.bus.off(evt, fn); };
  }

  function off(evt, fn) {
    if (!listeners[evt]) return;
    listeners[evt] = listeners[evt].filter(function (f) { return f !== fn; });
  }

  function emit(evt, payload) {
    (listeners[evt] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error("[bus]", evt, e); }
    });
  }

  App.bus = { on: on, off: off, emit: emit };
})(window.App = window.App || {});
