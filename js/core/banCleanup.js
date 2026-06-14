/* ============================================================
   core/banCleanup.js — Limpeza de storage ao BANIR (compartilhado).
   Remove mídia pessoal e mantém só o registro mínimo legal/sistema.
   Seguro: modo dryRun (prévia) + modo real, backup de metadados
   antes de apagar, log de removidos/mantidos, nunca toca assets
   compartilhados nem conteúdo público (salvo regra de moderação).
   Namespace: App.banCleanup
   ============================================================ */
(function (App) {
  "use strict";

  // placeholder padrão que substitui imagem removida
  var PLACEHOLDER = "assets/placeholder-avatar.svg";

  // campos de mídia PESSOAL que são limpos no ban
  var PERSONAL_MEDIA = ["avatar", "cover", "profileImages"];
  // campos que SEMPRE permanecem (registro mínimo legal/sistema)
  var KEEP = ["id", "banReason", "banDate", "moderationLogs"];

  function nowIso() { return new Date().toISOString(); }

  /* Monta o plano de limpeza a partir do perfil. Não escreve nada. */
  function plan(user) {
    user = user || {};
    var removed = [], skipped = [], kept = {};
    PERSONAL_MEDIA.forEach(function (f) {
      var v = user[f];
      if (v && (typeof v === "string" ? v.indexOf(PLACEHOLDER) < 0 : true)) {
        removed.push({ field: f, kind: f === "avatar" ? "avatar" : f === "cover" ? "banner" : "profile", was: typeof v === "string" ? v.slice(0, 64) : "[" + (v.length || 0) + " itens]" });
      } else {
        skipped.push({ field: f, reason: "vazio ou já placeholder" });
      }
    });
    KEEP.forEach(function (k) { if (user[k] !== undefined) kept[k] = user[k]; });
    kept.id = user.id || kept.id;   // ID sempre mantido
    return {
      userId: user.id || null,
      removed: removed,           // mídia a remover
      skipped: skipped,           // nada a fazer
      kept: kept,                 // registro mínimo preservado
      placeholder: PLACEHOLDER,
      note: "Conteúdo público (posts/comentários) NÃO é removido sem regra de moderação."
    };
  }

  /* Faz backup do plano + metadados antes de apagar (storage/deleted lógico). */
  function backup(p) {
    var rec = { at: nowIso(), userId: p.userId, removed: p.removed, kept: p.kept };
    try {
      var key = "oblivian:ban-backup";
      var arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push(rec); localStorage.setItem(key, JSON.stringify(arr.slice(-200)));
    } catch (e) {}
    return rec;
  }

  /* Executa. opts: { dryRun:true|false, repo, persist:fn(patch) }.
     dryRun (padrão): só devolve o plano + logs, não escreve.
     real: backup → aplica patch (avatar/cover → null/placeholder) via repo. */
  function run(user, opts) {
    opts = opts || {};
    var dryRun = opts.dryRun !== false;          // seguro por padrão
    var p = plan(user);
    var log = { mode: dryRun ? "dryRun" : "real", at: nowIso(), removed: p.removed.map(function (r) { return r.field; }), skipped: p.skipped.map(function (s) { return s.field; }), kept: Object.keys(p.kept) };

    if (dryRun) return Promise.resolve({ plan: p, log: log, applied: false, backup: null });

    var bk = backup(p);
    // patch: zera mídia pessoal (placeholder no avatar)
    var patch = {};
    p.removed.forEach(function (r) { patch[r.field] = r.field === "avatar" ? PLACEHOLDER : null; });

    var writer = typeof opts.persist === "function"
      ? opts.persist(patch)
      : (opts.repo && opts.repo.updateProfile ? opts.repo.updateProfile(patch) : Promise.resolve());

    return Promise.resolve(writer).then(function () {
      return { plan: p, log: log, applied: true, backup: bk, patch: patch };
    });
  }

  App.banCleanup = {
    PLACEHOLDER: PLACEHOLDER, PERSONAL_MEDIA: PERSONAL_MEDIA, KEEP: KEEP,
    plan: plan, backup: backup, run: run
  };
})(window.App = window.App || {});
