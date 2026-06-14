/* ============================================================
   core/searchLogic.js — Regras puras da busca do Explorer.
   Compartilhado por LocalRepository e SupabaseRepository para
   que a privacidade seja garantida no nível da lógica (não vaza
   comunidade privada de forma parcial).

   Regras:
   • SEM "@"  → modo COMUNIDADES. Pública casa por parte do nome
     (e descrição/tags). Privada SÓ casa com o nome COMPLETO exato
     (ou slug) — nunca por parte.
   • COM "@"  → modo USUÁRIOS. Casa por parte do handle/nome.
   • Nome de comunidade NÃO pode conter "@" (reservado a usuários).
   Namespace: App.search
   ============================================================ */
(function (App) {
  "use strict";
  App.search = App.search || {};

  // separa o termo: "@joao" → usuários("joao"); "anime" → comunidades("anime")
  App.search.parse = function (raw) {
    var s = (raw || "").trim();
    if (s.charAt(0) === "@") {
      return { mode: "users", term: s.slice(1).trim().toLowerCase(), raw: s, hasAt: true };
    }
    return { mode: "communities", term: s.toLowerCase(), raw: s, hasAt: false };
  };

  // pública: parte do nome/descrição/tags. privada: nome completo exato ou slug.
  App.search.matchCommunity = function (c, term) {
    if (!term) return false;
    var priv = c.settings && c.settings.visibility === "private";
    var name = (c.name || "").toLowerCase().trim();
    if (priv) {
      var slug = (c.slug || "").toLowerCase();
      return name === term || (!!slug && slug === term);
    }
    var hay = (name + " " + (c.description || "") + " " + (c.tags || []).join(" ")).toLowerCase();
    return hay.indexOf(term) >= 0;
  };

  App.search.matchUser = function (u, term) {
    if (!term) return false;
    return (u.handle || "").toLowerCase().indexOf(term) >= 0 ||
      (u.name || "").toLowerCase().indexOf(term) >= 0;
  };

  // valida nome de comunidade ao criar/editar. Retorna mensagem de erro ou null.
  App.search.validateCommunityName = function (name) {
    if ((name || "").indexOf("@") >= 0) {
      return "O símbolo @ é reservado para usuários e menções — não pode ser usado em nomes de comunidades.";
    }
    return null;
  };
})(window.App = window.App || {});
