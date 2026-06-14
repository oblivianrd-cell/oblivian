/* ============================================================
   screens/communityChats.js — Hub "Meus Chats" da COMUNIDADE.
   Tela cheia, individual por comunidade (cada comunidade tem o seu).
   Aberto pelo ícone de chat ao lado do sino. Rota: /c/:id/chats
   - Favoritos: membros fixados p/ DM rápida (localStorage por USUÁRIO+comunidade)
   - Meus Chats: salas da comunidade (última msg + não-lidas + hora)
   - Criar: conversa privada (DM) ou nova sala (equipe)
   Namespace: App.screens.communityChats
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.screens = App.screens || {};

  // chave por USUÁRIO + comunidade → favoritos não vazam entre contas no mesmo aparelho
  function favKey(cid) { return "oblivian.favchats." + (App.store.get("currentUserId") || "anon") + "." + cid; }
  function getFavs(cid) { try { return JSON.parse(localStorage.getItem(favKey(cid)) || "[]"); } catch (e) { return []; } }
  function setFavs(cid, arr) { try { localStorage.setItem(favKey(cid), JSON.stringify(arr)); } catch (e) {} }

  function live(node, evt, fn) {
    var off = App.bus.on(evt, function (p) { if (!document.body.contains(node)) { off(); return; } fn(p); });
  }
  // cor determinística por sala → thumbs distintos (não mais todos iguais à capa)
  function hueOf(s) { var h = 0; s = String(s || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
  function firstGrapheme(name) { name = (name || "").trim(); if (!name) return "#"; try { return Array.from(name)[0]; } catch (e) { return name.charAt(0); } }

  function render(ctx) {
    var cid = ctx.params.id;
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var me = App.store.get("currentUserId");

    Promise.all([App.repo.getCommunity(cid), App.repo.getMembership(cid)]).then(function (r) {
      var community = r[0], membership = r[1];
      if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
      var accent = (community.theme && community.theme.accent) || App.store.get("accent");
      var isMember = !!membership;
      var canCreate = membership && App.Roles.isMod(membership.role);

      // ---------- header ----------
      var createBtn = el("button", { class: "mychats__create", type: "button", title: "Criar conversa", "aria-label": "Criar conversa" }, App.icon("envelope"));
      createBtn.addEventListener("click", function (e) { openCreate(e.currentTarget); });
      if (!isMember) createBtn.style.display = "none";   // só membro cria/conversa
      var header = el("div", { class: "mychats__head" },
        el("button", { class: "mychats__back", type: "button", title: "Voltar", onClick: function () { App.router.navigate("/c/" + cid + "/featured"); } }, App.icon("back")),
        el("div", { class: "mychats__titlewrap" },
          el("h1", { class: "mychats__title u-truncate" }, "Meus Chats"),
          el("div", { class: "mychats__sub u-truncate" }, community.name)),
        createBtn);

      var favSecCount = el("span", { class: "mychats__seccount" }, "");
      var favRow = el("div", { class: "mychats__favs" });
      var favSec = el("div", { class: "mychats__sec" }, el("div", { class: "mychats__sechead" }, el("span", "Favoritos"), favSecCount), favRow);
      if (!isMember) favSec.style.display = "none";
      var listHost = el("div", { class: "mychats__list" });

      var page = el("div", { class: "mychats" }, header, favSec,
        el("div", { class: "mychats__sec" }, el("div", { class: "mychats__sechead" }, el("span", "Meus Chats")), listHost));
      page.style.setProperty("--accent", accent);

      App.util.mount(inner, page);

      // ---------- favoritos ----------
      function renderFavs(members) {
        App.util.clear(favRow);
        var favs = getFavs(cid);
        var add = el("button", { class: "mychats__fav mychats__fav--add", type: "button", title: "Adicionar favorito" }, el("span", { class: "mychats__favadd" }, "+"));
        add.addEventListener("click", function () { pickMember(members, function (u) { var f = getFavs(cid); if (f.indexOf(u.id) < 0) { f.unshift(u.id); setFavs(cid, f); } renderFavs(members); }); });
        favRow.appendChild(add);
        var byId = {}; members.forEach(function (m) { byId[m.user.id] = m.user; });
        var shown = favs.map(function (id) { return byId[id]; }).filter(Boolean);
        favSecCount.textContent = "(" + shown.length + ")";
        shown.forEach(function (u) {
          var rm = el("button", { class: "mychats__favrm", type: "button", title: "Remover favorito" }, "×");
          var cell = el("button", { class: "mychats__fav", type: "button" },
            el("span", { class: "mychats__favpic" }, ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "lg" }), rm),
            el("span", { class: "mychats__favname u-truncate" }, (u.name || "").split(" ")[0]));
          function remove() { setFavs(cid, getFavs(cid).filter(function (x) { return x !== u.id; })); renderFavs(members); }
          cell.addEventListener("click", function () { App.repo.getOrCreateDirect(u.id).then(function (c) { App.router.navigate("/chats/" + c.id); }).catch(function (e) { ui.toast((e && e.message) || "Não foi possível abrir a conversa", "danger"); }); });
          rm.addEventListener("click", function (e) { e.stopPropagation(); remove(); });
          // long-press (touch) também remove
          var lpT = null;
          cell.addEventListener("pointerdown", function () { lpT = setTimeout(function () { lpT = null; remove(); }, 550); });
          ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { cell.addEventListener(ev, function () { if (lpT) { clearTimeout(lpT); lpT = null; } }); });
          favRow.appendChild(cell);
        });
      }

      // ---------- lista de salas ----------
      function chatThumb(ch) {
        var priv = ch.visibility === "private";
        var hue = hueOf(ch.id || ch.name);
        var style = { background: "linear-gradient(150deg, hsl(" + hue + " 68% 52%), hsl(" + ((hue + 42) % 360) + " 64% 36%))" };
        return el("div", { class: "mychats__thumb", style: style },
          priv ? App.icon("lock", { size: "sm" }) : el("span", { class: "mychats__thumbinit" }, firstGrapheme(ch.name)));
      }
      function row(item) {
        var ch = item.chat, last = item.lastMessage, u = item.lastUser;
        var wrap = el("div", { class: "mychats__thumbwrap" }, chatThumb(ch),
          item.unread ? el("span", { class: "mychats__dot" }) : null,
          el("span", { class: "mychats__tlabel" }, "Sala " + (ch.visibility === "private" ? "privada" : "pública")));
        var preview = last
          ? ((u ? (u.name.split(" ")[0] + ": ") : "") + (last.text || (last.media && last.media.length ? "imagem" : "")))
          : "Sem mensagens";
        var r = el("button", { class: "mychats__row" + (item.unread ? " is-unread" : ""), type: "button", "aria-label": ch.name + (item.unread ? " (" + item.unread + " não lidas)" : "") },
          wrap,
          el("div", { class: "mychats__rowbody" },
            el("div", { class: "mychats__name u-truncate" }, (ch.visibility === "private" ? App.icon("lock", { size: "sm" }) : null), ch.name),
            el("div", { class: "mychats__prev u-truncate" }, preview)),
          el("span", { class: "mychats__time" }, last ? App.util.timeAgo(last.createdAt) : ""));   // sem msg → sem hora falsa
        r.addEventListener("click", function () { App.router.navigate("/chats/" + ch.id); });
        return r;
      }
      var chatIds = {};   // ids das salas desta comunidade (p/ filtrar eventos)
      function loadList() {
        if (!document.body.contains(inner)) return;
        App.repo.listCommunityConversations(cid).then(function (items) {
          if (!document.body.contains(inner)) return;
          App.util.clear(listHost);
          chatIds = {}; items.forEach(function (it) { chatIds[it.chat.id] = 1; });
          if (!items.length) { listHost.appendChild(ui.Empty("chats", "Sem salas", canCreate ? "Crie a primeira sala em 'Criar'." : "Nenhuma sala disponível ainda.")); return; }
          items.forEach(function (it) { listHost.appendChild(row(it)); });
        }).catch(function () { App.util.clear(listHost); listHost.appendChild(ui.Empty("info", "Erro ao carregar", "Tente novamente.")); });
      }

      // re-fetch DEBOUNCED e só quando o evento é de uma sala desta comunidade
      var reloadT = null;
      function scheduleReload() { if (reloadT) return; reloadT = setTimeout(function () { reloadT = null; loadList(); }, 400); }
      function onChatEvent(p) { var id = p && (p.chatId || (p.chat && p.chat.id)); if (!id || chatIds[id]) scheduleReload(); }

      App.repo.listMembers(cid).then(function (members) { renderFavs(members || []); }).catch(function () { renderFavs([]); });
      loadList();
      live(inner, "message:new", onChatEvent);
      live(inner, "chats:read", onChatEvent);
      live(inner, "chat:created", scheduleReload);
      live(inner, "chat:deleted", scheduleReload);

      // ---------- criar ----------
      function openCreate(anchor) {
        if (!isMember) { ui.toast("Participe da comunidade para conversar", "danger"); return; }
        var items = [{ icon: "chat", label: "Conversa privada", onClick: function () {
          App.repo.listMembers(cid).then(function (ms) { pickMember(ms || [], function (u) { App.repo.getOrCreateDirect(u.id).then(function (c) { App.router.navigate("/chats/" + c.id); }).catch(function (e) { ui.toast((e && e.message) || "Falha", "danger"); }); }); });
        } }];
        if (canCreate) items.push({ icon: "addround", label: "Nova sala", onClick: newRoom });
        App.ui.openMenu(anchor, items);
      }
      function newRoom() {
        var nameI = ui.Input({ placeholder: "Nome da sala", maxlength: 40 });
        var priv = { v: false };
        var sw = ui.Switch(false, function (v) { priv.v = v; });
        var ref = ui.openModal({ title: "Nova sala", scrimClass: "scrim--centered",
          body: el("div", { class: "u-col u-gap-3" }, ui.Field("Nome", nameI), ui.Field("Privada (só equipe)", sw)),
          actions: [
            ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
            ui.Button({ label: "Criar", variant: "primary", onClick: function () {
              var nm = (nameI.value || "").trim(); if (!nm) { ui.toast("Dê um nome", "danger"); return; }
              // privada → libera TODA a equipe (inclui curador/mod) p/ o criador não ficar de fora da própria sala
              App.repo.createChat(cid, { name: nm, visibility: priv.v ? "private" : "public", allowedRoles: priv.v ? ["owner", "admin", "lider", "curador", "mod"] : null })
                .then(function (c) { ref.close(); App.router.navigate("/chats/" + c.id); })
                .catch(function (e) { ui.toast(e.message || "Falha", "danger"); });
            } })
          ] });
      }
      function pickMember(members, cb) {
        var listWrap = el("div", { class: "u-col u-gap-1" });
        var others = (members || []).filter(function (m) { return m.user && m.user.id !== me; });
        function paint(q) {
          App.util.clear(listWrap);
          var rows = others.filter(function (m) { return !q || (m.user.name || "").toLowerCase().indexOf(q) >= 0 || (m.user.handle || "").toLowerCase().indexOf(q) >= 0; });
          if (!rows.length) { listWrap.appendChild(el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, others.length ? "Ninguém encontrado." : "Sem outros membros para conversar.")); return; }
          rows.slice(0, 50).forEach(function (m) {
            var u = m.user;
            var rowb = el("button", { class: "list-item", type: "button" },
              ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "sm" }),
              el("div", { class: "list-item__body" }, el("div", { class: "list-item__title" }, u.name), el("div", { class: "list-item__sub" }, "@" + (u.handle || ""))));
            rowb.addEventListener("click", function () { ref.close(); cb(u); });
            listWrap.appendChild(rowb);
          });
        }
        var search = el("input", { type: "search", class: "input", placeholder: "Buscar membro..." });
        search.addEventListener("input", function () { paint((search.value || "").toLowerCase()); });
        paint("");
        var ref = ui.openModal({ title: "Escolher membro", scrimClass: "scrim--centered", body: el("div", { class: "u-col u-gap-2" }, search, listWrap) });
      }
    });

    return { node: inner, active: "sanguao", title: "Meus Chats", communityId: cid, immersive: true, flush: true };
  }

  App.screens.communityChats = render;
})(window.App = window.App || {});
