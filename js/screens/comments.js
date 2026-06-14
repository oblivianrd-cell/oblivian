/* ============================================================
   screens/comments.js — Mural de comentários do perfil.
   Exporta App.components.commentWall(targetUserId, communityId) → node
   (lista REAL persistida + respostas + curtir + composer), reutilizado
   tanto na ABA "Mural" do perfil quanto na tela cheia /comentarios.
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.screens = App.screens || {};
  App.components = App.components || {};

  function isLight(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return false;
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
  }

  /* ---- builder do mural (reutilizável): lista + composer ---- */
  function commentWall(targetUserId, communityId, opts) {
    opts = opts || {};
    var me = App.store.get("currentUserId");
    var isWallOwner = targetUserId === me;
    var meUser = {};
    var sort = "recent"; // 'recent' | 'top'
    var sortControl = ui.Segmented([{ value: "recent", label: "Recentes" }, { value: "top", label: "Top" }], "recent", function (v) { sort = v; reload(); });
    var wrap = el("div", { class: "cmt-wall" });
    var listHost = el("div", { class: "cmt-list" });
    var composerHost = el("div", { class: "cmt-wall__composer" });
    // barra: "Comentários" à esquerda + Recentes/Top à direita (some quando o pai posiciona o controle — ex.: na aba)
    if (!opts.externalSort) wrap.appendChild(el("div", { class: "cmt-wall__bar" },
      el("span", { class: "cmt-wall__title" }, "Comentários"), sortControl));
    wrap.appendChild(composerHost);   // composer no TOPO (não fica lá embaixo)
    wrap.appendChild(listHost);

    function reload() {
      return App.repo.listProfileComments(targetUserId, communityId).then(function (l) { paint(l || []); }).catch(function () { paint([]); });
    }
    function likeBtn(c) {
      var btn = el("button", { class: "cmt__act" + (c.liked ? " is-on" : ""), type: "button" }, App.icon("heart", { size: "sm", fill: c.liked }), el("span", String(c.likes || 0)));
      btn.addEventListener("click", function () { btn.disabled = true; App.repo.toggleProfileCommentLike(c.id).then(reload).catch(function (e) { btn.disabled = false; ui.toast(e.message || "Falha", "danger"); }); });
      return btn;
    }
    function moreMenu(anchor, c) {
      var items = [];
      if (c.mine || isWallOwner) items.push({ icon: "trash", label: "Excluir", danger: true, onClick: function () {
        ui.confirm({ title: "Excluir comentário", message: "Remove o comentário" + (c.parentId ? "." : " e suas respostas."), confirmLabel: "Excluir", danger: true }).then(function (ok) {
          if (ok) App.repo.deleteProfileComment(c.id).then(reload).catch(function (e) { ui.toast(e.message || "Falha", "danger"); });
        });
      } });
      if (!c.mine) items.push({ icon: "ban", label: "Denunciar", danger: true, onClick: function () {
        ui.prompt({ title: "Denunciar comentário", label: "Motivo (opcional)", multiline: true, confirmLabel: "Enviar" }).then(function (val) {
          if (val == null) return;
          if (App.repo.reportContent) App.repo.reportContent("comment", c.id, val, communityId || null).then(function () { ui.toast("Denúncia enviada", "danger"); }).catch(function () {});
          else ui.toast("Denúncia enviada", "danger");
        });
      } });
      if (!items.length) items.push({ icon: "info", label: "Sem ações", onClick: function () {} });
      ui.openMenu(anchor, items);
    }
    function commentNode(c, isReply) {
      var node = el("div", { class: "cmt" + (isReply ? " cmt--reply" : "") },
        el("a", { href: "#" + (communityId ? "/c/" + communityId + "/u/" + c.byUserId : "/u/" + c.byUserId) }, ui.Avatar({ name: c.name, src: c.avatar, round: true, size: isReply ? "xs" : "sm" })),
        el("div", { class: "u-grow" },
          el("div", { class: "cmt__head" }, el("strong", c.name), el("span", { class: "u-muted", style: { fontSize: "var(--fs-xs)" } }, App.util.timeAgo(c.ts))),
          el("p", { class: "cmt__text" }, App.markup.render(c.text))));
      var body = node.lastChild;
      var actions = el("div", { class: "cmt__actions" }, likeBtn(c));
      if (!isReply) {
        var replyBtn = el("button", { class: "cmt__act", type: "button" }, App.icon("comment", { size: "sm" }), el("span", "Responder"));
        replyBtn.addEventListener("click", function () { openReply(c, body); });
        actions.appendChild(replyBtn);
      }
      actions.appendChild(el("button", { class: "cmt__act", type: "button", onClick: function (e) { moreMenu(e.currentTarget, c); } }, App.icon("more", { size: "sm" })));
      body.appendChild(actions);
      if (!isReply && c.replies && c.replies.length) {
        var rwrap = el("div", { class: "cmt__replies" });
        c.replies.forEach(function (r) { rwrap.appendChild(commentNode(r, true)); });
        body.appendChild(rwrap);
      }
      return node;
    }
    function openReply(c, body) {
      if (body.querySelector(".cmt-reply-box")) return;
      var inp = ui.Input({ placeholder: "Responder a @" + c.handle + "...", maxlength: ui.LIMITS.comment });
      var send = ui.IconButton("send", { title: "Enviar", onClick: function () {
        var t = inp.value.trim(); if (!t) return; send.disabled = true;
        App.repo.addProfileComment(targetUserId, communityId, t, c.id).then(reload).catch(function (e) { send.disabled = false; ui.toast(e.message || "Falha", "danger"); });
      } });
      var box = el("div", { class: "cmt-reply-box" }, ui.Avatar({ name: meUser.name, src: meUser.avatar, round: true, size: "xs" }), el("div", { class: "u-grow" }, inp), send);
      body.appendChild(box); inp.focus();
    }
    function paint(flat) {
      var byParent = {}, roots = [];
      flat.forEach(function (c) { if (c.parentId) (byParent[c.parentId] = byParent[c.parentId] || []).push(c); else roots.push(c); });
      roots.forEach(function (c) { c.replies = (byParent[c.id] || []).sort(function (a, b) { return a.ts - b.ts; }); });
      if (sort === "top") roots.sort(function (a, b) { return (b.likes - a.likes) || (b.ts - a.ts); });
      else roots.sort(function (a, b) { return b.ts - a.ts; });
      App.util.clear(listHost);
      if (!roots.length) { listHost.appendChild(ui.Empty("comment", "Sem comentários", "Seja o primeiro a comentar.")); return; }
      roots.forEach(function (c) { listHost.appendChild(commentNode(c, false)); });
    }
    function buildComposer() {
      var input = ui.Input({ placeholder: "Escreva um comentário...", maxlength: ui.LIMITS.comment });
      var sendBtn = ui.Button({ label: "Enviar", icon: "send", variant: "primary", onClick: function () {
        var t = input.value.trim(); if (!t) return; sendBtn.disabled = true;
        App.repo.addProfileComment(targetUserId, communityId, t, null).then(function () { input.value = ""; sendBtn.disabled = false; return reload(); })
          .catch(function (e) { sendBtn.disabled = false; ui.toast(e.message || "Falha ao comentar", "danger"); });
      } });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sendBtn.click(); } });

      // botão "+" (círculo) → popover de emojis p/ inserir no comentário
      var EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅","😭","😡","🥳","😱","🤯","🥺","👍","👎","👏","🙏","🔥","✨","🎉","💯","❤️","🧡","💛","💚","💙","💜","⭐","🌟","💀","👀","🤝","🙌"];
      var pop = null;
      function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener("click", onDoc); } }
      function onDoc() { closePop(); }
      var addBtn = el("button", { class: "cmt-addbtn", type: "button", title: "Inserir emoji" }, App.icon("plus"));
      addBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (pop) { closePop(); return; }
        pop = el("div", { class: "cmt-emojipop" });
        EMOJIS.forEach(function (em) {
          var b = el("button", { class: "cmt-emoji", type: "button" }, em);
          b.addEventListener("click", function (ev) { ev.stopPropagation(); input.value = (input.value || "") + em; input.focus(); closePop(); });
          pop.appendChild(b);
        });
        composerRow.appendChild(pop);
        setTimeout(function () { document.addEventListener("click", onDoc); }, 0);
      });

      var composerRow = el("div", { class: "cmt-composer" }, addBtn, el("div", { class: "u-grow" }, input), sendBtn);
      App.util.mount(composerHost, composerRow);
    }

    App.repo.getCurrentUser().then(function (u) { meUser = u || {}; buildComposer(); });
    listHost.appendChild(ui.Spinner({ center: true, label: "Carregando comentários…" }));
    reload();
    wrap.sortControl = sortControl;   // pai pode posicionar (ex.: na barra da aba)
    return wrap;
  }
  App.components.commentWall = commentWall;

  /* ---- tela cheia /comentarios (bio + mural) ---- */
  function render(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var communityId = ctx.params.userId ? ctx.params.id : null;
    var userId = ctx.params.userId || ctx.params.id;
    var me = App.store.get("currentUserId");

    Promise.all([App.repo.getUser(userId), communityId ? App.repo.getMembership(communityId, userId) : Promise.resolve(null)])
      .then(function (rr) {
        var target = rr[0], mem = rr[1];
        if (!target) { App.util.mount(inner, ui.Empty("info", "Perfil não encontrado")); return; }
        // prévia: bio do RASCUNHO (cache), sem ter subido pra nuvem
        var pv = (ctx.query && ctx.query.preview) ? App.store.get("bioPreview") : null;
        var isPv = pv && pv.userId === userId && ((pv.scope === "community" && pv.communityId === communityId) || (pv.scope === "global" && !communityId));
        var bioText = isPv ? pv.bio : (communityId && mem ? mem.bio : target.bio);
        var editTo = communityId ? "/c/" + communityId + "/u/" + userId + "/editar" : "/perfil/editar";
        var backTo = isPv ? editTo : (communityId ? "/c/" + communityId + "/u/" + userId : "/u/" + userId);
        var head = el("div", { class: "cmt-head" },
          ui.IconButton(isPv ? "close" : "back", { title: isPv ? "Fechar prévia" : "Voltar", onClick: function () { if (isPv) App.store.set("bioPreview", null); App.router.navigate(backTo); } }),
          el("div", { class: "u-grow" }, el("div", { class: "cmt-head__title" }, isPv ? "Biografia · prévia" : "Biografia")));
        var bioBlock = el("div", { class: "cmt-bio" },
          isPv ? el("span", { class: "cmt-bio__draft" }, App.icon("eye", { size: "sm" }), "Rascunho não salvo") : null,
          el("p", { class: "cmt-bio__text" }, bioText ? App.markup.render(bioText) : "Sem biografia."));
        var screen = el("div", { class: "cmt-screen" }, head, bioBlock, commentWall(userId, communityId));
        var panelColor = communityId && mem ? mem.panelColor : target.panelColor;
        if (panelColor) { screen.classList.add("has-panel-color"); if (isLight(panelColor)) screen.classList.add("panel-light"); screen.style.setProperty("--panel-bg", panelColor); }
        App.util.mount(inner, screen);
      });

    return { node: inner, active: (!communityId && userId === me) ? "profile" : undefined, title: "Biografia", communityId: communityId, immersive: true };
  }
  App.screens.comments = render;
})(window.App = window.App || {});
