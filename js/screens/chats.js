/* ============================================================
   screens/chats.js — PRIVADO (sistema GLOBAL do usuário):
   conversas diretas (DM), grupos, solicitações e contatos.
   Separado dos chats de comunidade (esses ficam dentro da comunidade).
   Rotas: /chats e /chats/:chatId
   Namespace: App.screens.chats
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.screens = App.screens || {};

  function live(node, evt, fn) {
    var off = App.bus.on(evt, function (p) {
      if (!document.body.contains(node)) { off(); return; }
      fn(p);
    });
  }

  // assina Realtime do chat (mensagens + updates do chat ao vivo) e desliga ao sair da thread
  function subscribeThread(node, chatId) {
    if (!App.repo.subscribeChat) return;
    App.repo.subscribeChat(chatId);
    var off = App.bus.on("route:change", function () {
      if (!document.body.contains(node)) { if (App.repo.unsubscribeChat) App.repo.unsubscribeChat(chatId); off(); }
    });
  }

  /* avatar de uma conversa: DM = outro usuário; grupo = iniciais do título */
  function convoGlyph(item, size) {
    if (item.direct && item.avatarUser) return ui.Avatar({ name: item.avatarUser.name, src: item.avatarUser.avatar, size: size, round: true });
    var a = ui.Avatar({ name: item.title || "Grupo", size: size, round: true });
    a.classList.add("is-group");
    return a;
  }

  function entry(item, activeId) {
    var chat = item.chat, last = item.lastMessage, u = item.lastUser;
    return el("a", { class: "chat-entry" + (chat.id === activeId ? " is-active" : ""), href: "#/chats/" + chat.id },
      convoGlyph(item, "sm"),
      el("div", { class: "chat-entry__body" },
        el("div", { class: "chat-entry__top" },
          el("span", { class: "chat-entry__name u-truncate" },
            item.direct ? null : App.icon("members", { size: "sm" }), item.title),
          el("span", { class: "chat-entry__time" }, last ? App.util.timeAgo(last.createdAt) : "")),
        el("div", { class: "u-row u-between u-gap-2" },
          el("span", { class: "chat-entry__preview u-truncate" }, last ? ((u ? u.name.split(" ")[0] + ": " : "") + last.text) : "Sem mensagens"),
          item.unread ? el("span", { class: "chat-entry__unread" }, item.unread > 9 ? "9+" : item.unread) : null)));
  }

  function openViewer(src) { if (App.components.openImageViewer) App.components.openImageViewer(src); }
  function msgMedia(media) {
    if (!media || !media.length) return null;
    var single = media.length === 1;
    var g = el("div", { class: "msg__media" + (single ? " msg__media--single" : "") });
    media.slice(0, 5).forEach(function (mm) {
      if (mm.type === "video") { g.appendChild(el("video", { class: "msg__mediaitem", src: mm.src, controls: true, playsinline: true })); return; } // legado
      var node = single
        ? el("img", { class: "msg__mediaimg", src: mm.src, loading: "lazy" })                                  // 1 img: proporção natural
        : el("div", { class: "msg__mediaitem", style: { backgroundImage: "url(" + mm.src + ")" } });           // galeria: grade
      node.style.cursor = "zoom-in";
      node.addEventListener("click", function () { openViewer(mm.src); });
      g.appendChild(node);
    });
    return g;
  }
  function messageNode(m, isMine, showAuthor) {
    var md = m.message.media || [];
    return el("div", { class: "msg" + (isMine ? " msg--mine" : "") },
      el("div", { class: "msg__bubble" + (md.length && !m.message.text ? " msg__bubble--media" : "") },
        (!isMine && showAuthor) ? el("div", { class: "msg__author" }, m.user ? m.user.name : "Membro") : null,
        msgMedia(md),
        m.message.text ? el("div", { class: "msg__text" }, m.message.text) : null,
        el("div", { class: "msg__time" }, App.util.clockTime(m.message.createdAt))));
  }

  /* render OTIMISTA: mostra o balão da própria mensagem na hora, antes do
     round-trip da rede (balão deixa de "demorar a aparecer"). cb(node) recebe
     o nó p/ remover se o envio falhar; o paint da reconciliação substitui tudo. */
  function showOptimistic(scroll, scrollBottom, me, text, media, cb) {
    if (!scroll.querySelector(".msg")) App.util.clear(scroll);   // remove o estado "Sem mensagens"
    var optim = { message: { id: "tmp", userId: me, text: text, media: media || [], createdAt: Date.now() } };
    var node = messageNode(optim, true, false);
    node.style.opacity = "0.65";                                  // dica de "enviando"
    scroll.appendChild(node);
    scrollBottom();
    cb(node);
  }

  /* compositor com "+" (anexar img/gif/vídeo), campo e enviar. onSend(text, media, done) */
  function buildCompose(placeholder, onSend) {
    var input = ui.Input({ placeholder: placeholder, maxlength: ui.LIMITS.message });
    var send = ui.IconButton("send", { title: "Enviar" });
    var pending = [];
    var pendHost = el("div", { class: "chat-pending" });
    function renderPending() {
      App.util.clear(pendHost);
      pendHost.style.display = pending.length ? "flex" : "none";
      pending.forEach(function (mm, i) {
        var thumb = mm.type === "video"
          ? el("div", { class: "chat-pthumb chat-pthumb--vid" }, App.icon("featured", { size: "sm" }))
          : el("div", { class: "chat-pthumb", style: { backgroundImage: "url(" + mm.src + ")" } });
        thumb.appendChild(el("button", { class: "chat-prm", type: "button", title: "Remover", onClick: function () { pending.splice(i, 1); renderPending(); } }, App.icon("close", { size: "sm" })));
        pendHost.appendChild(thumb);
      });
    }
    renderPending();
    var fileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, style: { display: "none" } });
    fileInput.addEventListener("change", function () {
      Array.prototype.slice.call(fileInput.files || []).forEach(function (f) {
        if (pending.length >= 5) { ui.toast("Máximo de 5 por mensagem", "danger"); return; }
        if (!App.util.isAllowedMedia(f)) { ui.toast("Só imagem ou GIF (vídeo não permitido)", "danger"); return; }
        // imagens viram WebP comprimido; GIF mantém animação
        App.util.downscaleImage(f, { maxDim: 1280, quality: 0.82 }).then(function (src) {
          if (pending.length < 5) { pending.push({ type: "image", src: src }); renderPending(); }
        }).catch(function () { ui.toast("Falha ao carregar imagem", "danger"); });
      });
      fileInput.value = "";
    });
    var addBtn = el("button", { class: "chat-add", type: "button", title: "Anexar imagem ou GIF" }, App.icon("plus"));
    addBtn.addEventListener("click", function () { if (pending.length >= 5) { ui.toast("Máximo de 5", "danger"); return; } fileInput.click(); });
    function doSend() {
      var t = input.value.trim(); if (!t && !pending.length) return;
      if (App.sound) App.sound.play("message");
      onSend(t, pending.slice(), function () { input.value = ""; pending = []; renderPending(); });
    }
    send.addEventListener("click", doSend);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSend(); } });

    // interface de flood/cooldown: aparece quando o envio é bloqueado por spam
    var floodBar = el("div", { class: "chat-flood u-hidden" });
    var floodTimer = null;
    function clearFlood() {
      if (floodTimer) { clearInterval(floodTimer); floodTimer = null; }
      floodBar.classList.add("u-hidden"); input.disabled = false; send.disabled = false;
    }
    function showFlood(until, message) {
      input.disabled = true; send.disabled = true;
      floodBar.classList.remove("u-hidden");
      function tick() {
        var left = Math.ceil((until - Date.now()) / 1000);
        if (left <= 0) { clearFlood(); return; }
        App.util.mount(floodBar,
          el("div", { class: "chat-flood__inner" },
            App.icon("recent", { size: "sm" }),
            el("span", { class: "u-grow" }, message || "Aguarde para enviar novamente."),
            el("span", { class: "chat-flood__count" }, left + "s")));
      }
      tick();
      if (floodTimer) clearInterval(floodTimer);
      floodTimer = setInterval(tick, 1000);
    }

    var compose = el("div", { class: "chat-thread__compose" }, addBtn, fileInput, input, send);
    var node = el("div", { class: "chat-thread__composewrap" }, floodBar, pendHost, compose);
    // restaura o que foi digitado caso o envio otimista falhe
    function restore(t, m) { input.value = t || ""; pending = (m || []).slice(); renderPending(); }
    return { node: node, showFlood: showFlood, clearFlood: clearFlood, restore: restore };
  }

  // trata erros de envio: spam → interface de flood; resto → toast
  function handleSendError(e, composeApi) {
    if (e && e.spam) composeApi.showFlood(e.until || (Date.now() + 5000), e.message);
    else ui.toast((e && e.message) || "Falha ao enviar", "danger");
  }

  function buildThread(chatId) {
    var wrap = el("div", { class: "chat-thread" });
    App.repo.getChat(chatId).then(function (chat) {
      if (!chat) { App.util.mount(wrap, ui.Empty("info", "Conversa não encontrada")); return; }
      var me = App.store.get("currentUserId");

      if (chat.type === "community" || chat.communityId) {
        // chat de comunidade aberto por link — abre no contexto da comunidade
        App.repo.getCommunity(chat.communityId).then(function (community) { buildCommunityThread(wrap, chat, community, me); });
        return;
      }
      // conversa global (direct/group)
      // busca o usuário atual + perfis dos participantes (sem App.repo.db — funciona no Supabase também)
      Promise.all([App.repo.getCurrentUser()].concat((chat.participants || []).map(function (id) { return App.repo.getUser(id).catch(function () { return null; }); }))).then(function (all) {
        var meUser = all[0];
        var byId = {}; all.slice(1).forEach(function (u) { if (u) byId[u.id] = u; });
        var others = chat.participants.filter(function (id) { return id !== me; });
        var otherUser = chat.type === "direct" ? byId[others[0]] : null;
        var title = chat.type === "group" ? (chat.title || others.map(function (id) { return (byId[id] || {}).name || "?"; }).join(", ")) : ((otherUser || {}).name || "Conversa");
        var sub = chat.type === "group" ? (chat.participants.length + " participantes") : "Conversa privada";

        var scroll = el("div", { class: "chat-thread__scroll" });
        var prefs = App.repo.getChatPrefs(chat.id);
        var glyph = chat.type === "direct" && otherUser ? ui.Avatar({ name: otherUser.name, src: otherUser.avatar, size: "sm", round: true }) : (function () { var a = ui.Avatar({ name: title, size: "sm", round: true }); a.classList.add("is-group"); return a; })();
        function openSettings() { App.router.navigate("/chats/" + chat.id + "/config"); }
        var titleWrap = el("button", { class: "chat-thread__titlebtn", type: "button", onClick: openSettings },
          el("div", { class: "chat-thread__title" }, chat.type === "group" ? App.icon("members", { size: "sm" }) : null, title, prefs.muted ? el("span", { class: "chat-thread__muted" }, "🔕") : null));
        var head = el("div", { class: "chat-thread__head" },
          ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate("/chats"); } }),
          glyph,
          el("div", { class: "u-grow" }, titleWrap),
          ui.IconButton("more", { title: "Configurações", onClick: openSettings }));
        head.firstChild.classList.add("chat-thread__back");

        var pending = chat.type === "direct" && !chat.accepted && chat.requestedBy !== me;
        function scrollBottom() { setTimeout(function () { scroll.scrollTop = scroll.scrollHeight; }, 0); }
        var msgs = [];   // lista em memória → reconcilia sem re-buscar tudo
        function paint(list) {
          if (list) msgs = list;
          App.util.clear(scroll);
          if (!msgs.length) { scroll.appendChild(ui.Empty("chat", "Sem mensagens", "Diga olá!")); scrollBottom(); return; }
          var lastDay = null, lastUser = null;
          msgs.forEach(function (m) {
            var day = App.util.dayLabel(m.message.createdAt);
            if (day !== lastDay) { scroll.appendChild(el("div", { class: "chat-day" }, day)); lastDay = day; lastUser = null; }
            scroll.appendChild(messageNode(m, m.message.userId === me, lastUser !== m.message.userId));
            lastUser = m.message.userId;
          });
          scrollBottom();
        }
        var composeApi = buildCompose("Mensagem...", function (text, media, done) {
          done();                                  // limpa o campo já
          showOptimistic(scroll, scrollBottom, me, text, media, function (node) {
            App.repo.sendMessage(chat.id, text, media)
              .then(function (res) { msgs.push(res); paint(); })   // anexa só a msg retornada (sem re-buscar)
              .catch(function (e) { node.remove(); composeApi.restore(text, media); handleSendError(e, composeApi); });
          });
        });
        var compose = composeApi.node;

        var nodes = [head, scroll];
        if (pending) {
          nodes.push(el("div", { class: "chat-request-bar" },
            el("span", "Solicitação de conversa"),
            ui.Button({ label: "Aceitar", size: "sm", variant: "primary", onClick: function () { App.repo.acceptConversation(chat.id).then(function () { App.router.resolve(); }); } }),
            ui.Button({ label: "Recusar", size: "sm", variant: "ghost", onClick: function () { App.repo.declineConversation(chat.id).then(function () { App.router.navigate("/chats"); }); } })));
        } else { nodes.push(compose); }
        var threadRoot = el("div", { class: "chat-thread", style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } }, nodes);
        threadRoot.style.setProperty("--bubble", App.chatPrefsUtil.bubbleColor(prefs.bubble));
        // wallpaper COMPARTILHADO (vem do chat); cai p/ pref local antiga se ainda não migrou
        App.chatPrefsUtil.applyWallpaper(threadRoot, chat.wallpaper || prefs.wallpaper);
        App.util.mount(wrap, threadRoot);
        App.repo.listMessages(chat.id).then(paint);
        subscribeThread(wrap, chat.id);
        live(wrap, "message:new", function (p) {
          if (p.chatId !== chat.id) return;
          if (p.message && p.message.userId === me) return;   // própria msg já foi anexada (otimista) — não re-busca
          App.repo.listMessages(chat.id).then(paint);
        });
        live(wrap, "chat:updated", function (p) {
          if (!p || p.chatId !== chat.id) return;
          App.chatPrefsUtil.applyWallpaper(threadRoot, p.wallpaper || App.repo.getChatPrefs(chat.id).wallpaper);
        });
      });
    });
    return wrap;
  }

  /* thread de chat de COMUNIDADE (quando aberto via link direto) */
  function buildCommunityThread(wrap, chat, community, me) {
    if (!community) { App.util.mount(wrap, ui.Empty("info", "Comunidade não encontrada")); return; }
    var scroll = el("div", { class: "chat-thread__scroll" });
    function openSettings() { App.router.navigate("/chats/" + chat.id + "/config"); }
    var titleWrap = el("button", { class: "chat-thread__titlebtn", type: "button", onClick: openSettings },
      el("div", { class: "chat-thread__title" }, chat.visibility === "private" ? App.icon("lock", { size: "sm" }) : App.icon("globe", { size: "sm" }), "#" + chat.name),
      el("div", { class: "chat-thread__sub u-truncate" }, community.name));
    var head = el("div", { class: "chat-thread__head" },
      ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate("/c/" + community.id + "/chats"); } }),
      el("div", { class: "u-grow" }, titleWrap),
      ui.IconButton("more", { title: "Configurações", onClick: openSettings }));
    head.firstChild.classList.add("chat-thread__back");
    function scrollBottom() { setTimeout(function () { scroll.scrollTop = scroll.scrollHeight; }, 0); }
    var msgs = [];   // lista em memória → reconcilia sem re-buscar tudo
    function paint(list) {
      if (list) msgs = list;
      App.util.clear(scroll);
      if (!msgs.length) { scroll.appendChild(ui.Empty("chat", "Sem mensagens", "Seja o primeiro a falar.")); return; }
      var lastDay = null, lastUser = null;
      msgs.forEach(function (m) {
        var day = App.util.dayLabel(m.message.createdAt);
        if (day !== lastDay) { scroll.appendChild(el("div", { class: "chat-day" }, day)); lastDay = day; lastUser = null; }
        scroll.appendChild(messageNode(m, m.message.userId === me, lastUser !== m.message.userId));
        lastUser = m.message.userId;
      });
      scrollBottom();
    }
    var composeApi = buildCompose("Escreva em #" + chat.name, function (text, media, done) {
      done();
      showOptimistic(scroll, scrollBottom, me, text, media, function (node) {
        App.repo.sendMessage(chat.id, text, media)
          .then(function (res) { msgs.push(res); paint(); })   // anexa só a msg retornada
          .catch(function (e) { node.remove(); composeApi.restore(text, media); handleSendError(e, composeApi); });
      });
    });
    var compose = composeApi.node;
    var threadRoot = el("div", { class: "chat-thread", style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } }, head, scroll, compose);
    var prefs = App.repo.getChatPrefs(chat.id);
    threadRoot.style.setProperty("--bubble", App.chatPrefsUtil.bubbleColor(prefs.bubble));
    App.chatPrefsUtil.applyWallpaper(threadRoot, chat.wallpaper || prefs.wallpaper);
    App.util.mount(wrap, threadRoot);
    App.repo.listMessages(chat.id).then(paint);
    subscribeThread(wrap, chat.id);
    live(wrap, "message:new", function (p) {
      if (p.chatId !== chat.id) return;
      if (p.message && p.message.userId === me) return;   // própria msg já anexada (otimista)
      App.repo.listMessages(chat.id).then(paint);
    });
    live(wrap, "chat:updated", function (p) {
      if (!p || p.chatId !== chat.id) return;
      App.chatPrefsUtil.applyWallpaper(threadRoot, p.wallpaper || App.repo.getChatPrefs(chat.id).wallpaper);
    });
  }

  /* ---- criar conversa / grupo ---- */
  function pickContact(onPick) {
    App.repo.listContacts().then(function (contacts) {
      var body = el("div", { class: "u-col u-gap-2" });
      if (!contacts.length) body.appendChild(el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, "Você ainda não segue ninguém. Siga usuários para conversar."));
      var ref = ui.openModal({ title: "Nova conversa", scrimClass: "scrim--centered", body: body });
      contacts.forEach(function (u) {
        var row = el("button", { class: "list-item", type: "button" }, ui.Avatar({ name: u.name, src: u.avatar, round: true }),
          el("div", { class: "list-item__body" }, el("div", { class: "list-item__title" }, u.name), el("div", { class: "list-item__sub" }, "@" + u.handle)));
        row.addEventListener("click", function () { ref.close(); onPick(u); });
        body.appendChild(row);
      });
    });
  }
  function newGroup() {
    App.repo.listContacts().then(function (contacts) {
      var title = ui.Input({ placeholder: "Nome do grupo (opcional)", maxlength: ui.LIMITS.groupName });
      var picked = {};
      var listHost = el("div", { class: "u-col u-gap-1" });
      contacts.forEach(function (u) {
        var cb = el("input", { type: "checkbox" });
        cb.addEventListener("change", function () { if (cb.checked) picked[u.id] = true; else delete picked[u.id]; });
        listHost.appendChild(el("label", { class: "list-item" }, cb, ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "sm" }), el("span", { class: "u-grow" }, u.name)));
      });
      if (!contacts.length) listHost.appendChild(el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, "Siga usuários para adicioná-los a um grupo."));
      var ref = ui.openModal({ title: "Novo grupo", scrimClass: "scrim--centered",
        body: el("div", { class: "u-col u-gap-3" }, ui.Field("Nome", title), ui.Field("Participantes", listHost)),
        actions: [
          ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
          ui.Button({ label: "Criar grupo", variant: "primary", onClick: function () {
            var ids = Object.keys(picked); if (!ids.length) { ui.toast("Selecione participantes", "danger"); return; }
            App.repo.createGroup(ids, title.value).then(function (c) { ref.close(); App.router.navigate("/chats/" + c.id); }).catch(function (e) { ui.toast(e.message, "danger"); });
          } })
        ] });
    });
  }

  function render(ctx) {
    var chatId = ctx.params.chatId;
    var layout = el("div", { class: "chats-layout", "data-pane": chatId ? "thread" : "list" });
    var scope = "recent"; // recent | requests | contacts

    var rail = el("nav", { class: "chats-rail" });
    function railBtn(opts) {
      var b = el("button", { class: "chats-rail__btn" + (opts.active ? " is-active" : "") + (opts.cls ? " " + opts.cls : ""), type: "button", title: opts.title }, App.icon(opts.icon, { fill: opts.iconFill }));
      if (opts.badge) b.appendChild(el("span", { class: "chats-rail__badge" }, opts.badge > 9 ? "9+" : String(opts.badge)));
      b.addEventListener("click", opts.onClick || function () { scope = opts.value; rebuildRail(); refreshList(); });
      return b;
    }
    function rebuildRail() {
      App.repo.listConversationRequests().then(function (reqs) {
        App.util.clear(rail);
        rail.appendChild(railBtn({ value: "recent", icon: "chats", title: "Conversas", active: scope === "recent" }));
        rail.appendChild(railBtn({ value: "requests", icon: "bell", title: "Solicitações", active: scope === "requests", badge: reqs.length }));
        rail.appendChild(railBtn({ value: "contacts", icon: "members", title: "Contatos", active: scope === "contacts" }));
        rail.appendChild(el("div", { class: "u-grow" }));
        rail.appendChild(railBtn({ icon: "addround", iconFill: true, cls: "chats-rail__btn--new", title: "Nova conversa / grupo", onClick: function (e) {
          App.ui.openMenu(e ? e.currentTarget : rail.lastChild, [
            { icon: "chat", label: "Nova conversa", onClick: function () { pickContact(function (u) { App.repo.getOrCreateDirect(u.id).then(function (c) { App.router.navigate("/chats/" + c.id); }); }); } },
            { icon: "members", label: "Novo grupo", onClick: newGroup }
          ]);
        } }));
      });
    }

    var titleEl = el("div", { class: "section-title" }, App.icon("chats"), "Privado");
    var aside = el("aside", { class: "chats-aside" },
      el("div", { class: "chats-aside__head" }, titleEl,
        el("div", { class: "searchbar" }, App.icon("search", { size: "sm" }), el("input", { type: "search", placeholder: "Buscar..." }))),
      el("div", { class: "chats-aside__list" }));
    var listHost = aside.querySelector(".chats-aside__list");
    var TITLES = { recent: "Conversas", requests: "Solicitações", contacts: "Contatos" };

    function refreshList() {
      titleEl.lastChild.textContent = TITLES[scope] || "Privado";
      var q = (aside.querySelector("input").value || "").toLowerCase();
      if (scope === "contacts") {
        App.repo.listContacts().then(function (cs) {
          App.util.clear(listHost);
          cs = cs.filter(function (u) { return !q || u.name.toLowerCase().indexOf(q) >= 0; });
          if (!cs.length) { listHost.appendChild(ui.Empty("members", "Sem contatos", "Siga usuários para conversar.")); return; }
          cs.forEach(function (u) {
            var row = el("button", { class: "chat-entry", type: "button" }, ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "sm" }),
              el("div", { class: "chat-entry__body" }, el("div", { class: "chat-entry__name u-truncate" }, u.name), el("div", { class: "chat-entry__preview u-truncate" }, "@" + u.handle)));
            row.addEventListener("click", function () { App.repo.getOrCreateDirect(u.id).then(function (c) { App.router.navigate("/chats/" + c.id); }); });
            listHost.appendChild(row);
          });
        });
        return;
      }
      if (scope === "requests") {
        App.repo.listConversationRequests().then(function (reqs) {
          App.util.clear(listHost);
          if (!reqs.length) { listHost.appendChild(ui.Empty("bell", "Sem solicitações", "Convites de conversa aparecem aqui.")); return; }
          reqs.forEach(function (it) { listHost.appendChild(entry(it, chatId)); });
        });
        return;
      }
      App.repo.listConversations().then(function (items) {
        App.util.clear(listHost);
        items = items.filter(function (it) { return !q || (it.title || "").toLowerCase().indexOf(q) >= 0; });
        if (!items.length) { listHost.appendChild(ui.Empty("chats", "Nenhuma conversa", "Toque em + para iniciar uma conversa ou grupo.")); return; }
        items.forEach(function (it) { listHost.appendChild(entry(it, chatId)); });
      });
    }
    aside.querySelector("input").addEventListener("input", App.util.debounce(refreshList, 150));
    rebuildRail(); refreshList();
    // debounce: rajada de mensagens não refaz a cascata (rail + lista) a cada evento
    var liveRefresh = App.util.debounce(function () { rebuildRail(); refreshList(); }, 400);
    live(layout, "message:new", liveRefresh);
    live(layout, "chat:created", liveRefresh);
    live(layout, "chats:read", App.util.debounce(refreshList, 300));

    var right = chatId ? buildThread(chatId)
      : el("div", { class: "chat-thread chats-empty" }, ui.Empty("chat", "Selecione uma conversa", "Escolha uma conversa à esquerda ou inicie uma nova."));

    layout.appendChild(rail); layout.appendChild(aside); layout.appendChild(right);
    // ao abrir uma conversa, vira tela cheia (sem topbar/bottomnav, mostra o compositor)
    return { node: layout, active: "chats", title: "Privado", flush: true, immersive: !!chatId };
  }

  App.screens.chats = render;
})(window.App = window.App || {});
