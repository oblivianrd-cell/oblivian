/* ============================================================
   core/roles.js — Fonte ÚNICA dos cargos de moderação/staff.
   Renomeou/adicionou cargo? Edita SÓ aqui. Antes a lista
   ["owner","admin","lider","curador","mod"] estava copiada em ~7 lugares.
   ============================================================ */
(function (App) {
  "use strict";
  var MOD = ["owner", "admin", "lider", "curador", "mod"];
  App.Roles = {
    MOD: MOD,                                  // cargos com poder de moderação/staff
    ALL: MOD.concat(["member"]),
    isMod: function (role) { return MOD.indexOf(role) >= 0; }
  };
})(window.App = window.App || {});
