/* ============================================================
   screens/chatSettings.js — Configurações de uma conversa (DM/grupo):
   Mudo, Papel de parede do chat, Balão de chat, Sair do chat.
   Rota: /chats/:chatId/config   Namespace: App.screens.chatSettings
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  // papéis de parede (sem imagens externas): cor/gradiente + opção de imagem custom
  var WALLPAPERS = [
    { key: "none", label: "Padrão", css: "" },
    { key: "ink", label: "Tinta", css: "radial-gradient(120% 120% at 30% 10%, #1b1b27, #0d0d13)" },
    { key: "violet", label: "Violeta", css: "linear-gradient(160deg, #271c4a, #110f1d)" },
    { key: "ocean", label: "Oceano", css: "linear-gradient(160deg, #0f2b3d, #0a131b)" },
    { key: "rose", label: "Rosé", css: "linear-gradient(160deg, #3a1320, #160a10)" },
    { key: "forest", label: "Floresta", css: "linear-gradient(160deg, #14301e, #0a140d)" },
    { key: "amber", label: "Âmbar", css: "linear-gradient(160deg, #3a2a10, #15100a)" },
    { key: "mono", label: "Grafite", css: "linear-gradient(160deg, #23262b, #101113)" }
  ];
  var BUBBLES = [
    { key: "accent", label: "Tema", color: "var(--accent)" },
    { key: "blue", label: "Azul", color: "#3b82f6" },
    { key: "green", label: "Verde", color: "#22c55e" },
    { key: "rose", label: "Rosa", color: "#ec4899" },
    { key: "amber", label: "Âmbar", color: "#f59e0b" },
    { key: "slate", label: "Ardósia", color: "#475569" }
  ];
  function bubbleColor(key) { var b = BUBBLES.filter(function (x) { return x.key === key; })[0]; return b ? b.color : "var(--accent)"; }
  // aplica papel de parede a um elemento de rolagem do thread
  function applyWallpaper(node, wp) {
    node.style.backgroundImage = ""; node.style.background = "";
    if (!wp) return;
    if (wp.kind === "image") node.style.backgroundImage = "url(" + wp.value + ")", node.style.backgroundSize = "cover", node.style.backgroundPosition = "center";
    else if (wp.kind === "css" && wp.value) node.style.background = wp.value;
  }

  function render(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var chatId = ctx.params.chatId;
    var me = App.store.get("currentUserId");

    App.repo.getChat(chatId).then(function (chat) {
      if (!chat) { App.util.mount(inner, ui.Empty("info", "Conversa não encontrada")); return; }
      var db = App.repo.db || { users: {}, communities: {} };  // Supabase não tem .db: evita crash (nomes resolvidos abaixo)
      var community = chat.communityId ? db.communities[chat.communityId] : null;
      var isComm = chat.type === "community";
      var isDirect = chat.type === "direct";
      var others = (chat.participants || []).filter(function (id) { return id !== me; });
      var otherUser = chat.type === "direct" ? db.users[others[0]] : null;
      var title = isComm ? ("#" + chat.name)
        : chat.type === "group" ? (chat.title || others.map(function (id) { return (db.users[id] || {}).name || "?"; }).join(", "))
        : ((otherUser || {}).name || "Conversa");
      var sub = isComm ? (community ? community.name : "Comunidade")
        : chat.type === "group" ? (chat.participants.length + " participantes")
        : "Conversa privada";
      var descText = chat.description || (community && community.description) || "";
      var canManage = App.repo._canManageChat(chat);
      var backTo = "/chats/" + chatId;
      var view = "main"; // main | wallpaper | bubble
      var prefs = App.repo.getChatPrefs(chatId);
      // rascunhos no escopo do build() — sobrevivem aos re-renders do paint()
      var wpDraft = chat.wallpaper || prefs.wallpaper;   // wallpaper compartilhado vem do chat
      var bubbleDraft = prefs.bubble || "accent";
      // config anti-spam do chat (rascunho)
      var cfg = App.repo.getChatConfig(chatId);
      var cooldownDraft = cfg.cooldownSec || 0;
      var bannedDraft = (cfg.bannedWords || []).slice();

      function header(label, onSave) {
        return el("div", { class: "cset-header" },
          ui.IconButton("back", { title: "Voltar", onClick: function () { if (view === "main") App.router.navigate(backTo); else { view = "main"; paint(); } } }),
          el("div", { class: "u-grow" }, el("div", { class: "cset-header__title" }, label)),
          onSave ? ui.IconButton("check", { title: "Concluir", onClick: onSave }) : null);
      }

      function rowNav(icon, label, onClick, danger) {
        var r = el("button", { class: "cset-row" + (danger ? " cset-row--danger" : ""), type: "button" },
          el("span", { class: "cset-row__icwrap" }, App.icon(icon, { size: "sm", cls: "cset-row__ic" })),
          el("span", { class: "u-grow cset-row__label" }, label),
          App.icon("forward", { cls: "cset-row__chev u-muted" }));
        r.addEventListener("click", onClick);
        return r;
      }
      function group(title, rows) {
        return el("div", { class: "cset-group" },
          el("div", { class: "cset-group__title" }, title),
          el("div", { class: "cset-card" }, rows));
      }

      function mainView() {
        var coverSrc = chat.cover || (community && community.cover) || null;
        var hero;
        if (isComm) {
          // capa retangular roxa SÓ no chat público/comunidade (por causa do formato de capa)
          var nameEl = el("div", { class: "cset-hero__name cset-cover__name" }, title);
          var coverEl = el("div", { class: "cset-cover" + (coverSrc ? " has-img" : ""), style: coverSrc ? { backgroundImage: "url(" + coverSrc + ")" } : null },
            el("div", { class: "cset-cover__scrim" }),
            nameEl);
          hero = el("div", { class: "cset-hero" }, coverEl,
            el("div", { class: "cset-hero__sub u-muted" }, sub));
        } else {
          // DM / grupo: hero simples, SEM card de fundo — só avatar + nome + sub
          var nameEl2 = el("div", { class: "cset-hero__name" }, title);
          var avWrap = el("div", { class: "cset-hero__av" });
          hero = el("div", { class: "cset-hero cset-hero--plain" }, avWrap, nameEl2,
            el("div", { class: "cset-hero__sub u-muted" }, sub));
          if (isDirect && others[0]) {
            // no Supabase não há App.repo.db → busca async o outro usuário
            var applyUser = function (u) {
              if (!u) return;
              if (u.name) nameEl2.textContent = u.name;
              App.util.mount(avWrap, ui.Avatar({ name: u.name || "?", src: u.avatar, round: true, size: "xl" }));
            };
            if (otherUser) applyUser(otherUser);
            else if (App.repo.getUser) App.repo.getUser(others[0]).then(applyUser).catch(function () {});
          } else {
            App.util.mount(avWrap, ui.Avatar({ name: title || "?", round: true, size: "xl" }));
          }
        }

        var muteRow = el("div", { class: "cset-row" },
          el("span", { class: "cset-row__icwrap" }, App.icon("mute", { size: "sm", cls: "cset-row__ic" })),
          el("span", { class: "u-grow cset-row__label" }, "Mudo"),
          ui.Switch(prefs.muted, function (v) { prefs.muted = v; App.repo.setChatPrefs(chatId, { muted: v }); }));

        // card de descrição (expande ao clicar)
        var descCard = null;
        if (descText) {
          var dc = el("button", { class: "cset-desc", type: "button" },
            el("div", { class: "cset-desc__top" },
              el("span", { class: "cset-row__icwrap" }, App.icon("info", { size: "sm", cls: "cset-row__ic" })),
              el("span", { class: "u-grow cset-desc__title" }, "Descrição"),
              App.icon("forward", { cls: "cset-desc__chev u-muted" })),
            el("p", { class: "cset-desc__text is-clamped" }, descText));
          dc.addEventListener("click", function () { view = "desc"; paint(); });
          descCard = el("div", { class: "cset-group" }, dc);
        }

        var prefRows = [muteRow];
        if (canManage && !isDirect) {
          var roRow = el("div", { class: "cset-row" },
            el("span", { class: "cset-row__icwrap" }, App.icon("lock", { size: "sm", cls: "cset-row__ic" })),
            el("span", { class: "u-grow cset-row__label" }, "Somente leitura"),
            ui.Switch(chat.readOnly, function (v) { chat.readOnly = v; App.repo.setChatReadOnly(chatId, v); }));
          prefRows.push(roRow);
        }
        prefRows.push(rowNav("image", "Papel de parede do chat", function () { view = "wallpaper"; paint(); }));
        prefRows.push(rowNav("chat", "Balão do chat", function () { view = "bubble"; paint(); }));
        var pref = group("Preferências", prefRows);

        var memberRows = [
          rowNav("members", "Membros", function () {
            if (isComm && community) App.router.navigate("/c/" + community.id + "/membros");
            else { view = "members"; paint(); }
          })
        ];
        if (canManage) {
          memberRows.push(rowNav("shield", "Co-apresentadores", function () { view = "cohosts"; paint(); }));
          memberRows.push(rowNav("ban", "Membros expulsos", function () { view = "banned"; paint(); }));
          memberRows.push(rowNav("add_user", "Convide os membros", function () {
            var code = "sanguao.chat/" + chatId.replace(/[^a-z0-9]/gi, "").slice(-6);
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(function () {});
            ui.toast("Convite copiado: " + code, "ok");
          }));
        }
        // DM 1:1 não tem "Membros" (nem co-host/expulsos/convite)
        var membersRows = isDirect ? null : group("Membros", memberRows);

        // moderação anti-spam — só staff e em chats públicos de comunidade
        var modGroup = null;
        if (canManage && isComm && chat.visibility !== "private") {
          var cdLabel = cooldownDraft ? ("Temporizador · " + cooldownDraft + "s") : "Temporizador · desligado";
          modGroup = group("Moderação", [
            rowNav("recent", cdLabel, function () { view = "cooldown"; paint(); }),
            rowNav("ban", "Palavras proibidas" + (bannedDraft.length ? " · " + bannedDraft.length : ""), function () { view = "banwords"; paint(); })
          ]);
        }

        var dangerRows = [
          rowNav("flag", "Denunciar chat", function () {
            ui.prompt({ title: "Denunciar chat", label: "Conte o motivo (opcional):", placeholder: "Motivo", confirmLabel: "Enviar" })
              .then(function (reason) {
                if (reason === null) return;
                App.repo.reportContent("chat", chatId, reason, chat.communityId).then(function () { ui.toast("Denúncia enviada", "ok"); });
              });
          }, true)
        ];
        if (canManage) {
          if (!isDirect) dangerRows.push(rowNav("forward", "Transferir a propriedade", function () { view = "transfer"; paint(); }, true));
          dangerRows.push(rowNav("trash", "Apagar conversa", function () {
            ui.confirm({ title: "Apagar conversa?", message: "Isso remove o chat e todas as mensagens. Não dá pra desfazer.", confirmLabel: "Apagar", danger: true })
              .then(function (okp) { if (okp) App.repo.deleteChat(chatId).then(function () { ui.toast("Conversa apagada"); App.router.navigate(isComm && community ? "/c/" + community.id : "/chats"); }); });
          }, true));
        }
        dangerRows.push(rowNav("leave", "Sair do chat", function () {
          ui.confirm({ title: "Sair do chat?", message: "Tem certeza que deseja sair desta conversa?", confirmLabel: "Sair", danger: true })
            .then(function (okp) { if (okp) App.repo.leaveConversation(chatId).then(function () { ui.toast("Você saiu da conversa"); App.router.navigate("/chats"); }); });
        }, true));
        var danger = group("Zona de perigo", dangerRows);

        return el("div", { class: "cset-body" }, header("Configurações"), el("div", { class: "cset-scroll" }, hero, descCard, pref, membersRows, modGroup, danger));
      }

      // temporizador (cooldown entre mensagens)
      function cooldownView() {
        var PRESETS = [0, 3, 5, 10, 30, 60, 120, 300];
        var grid = el("div", { class: "cd-grid" });
        PRESETS.forEach(function (s) {
          var t = el("button", { class: "cd-chip" + (s === cooldownDraft ? " is-on" : ""), type: "button" },
            s === 0 ? "Desligado" : (s < 60 ? s + "s" : (s / 60) + " min"));
          t.addEventListener("click", function () { cooldownDraft = s; paint(); });
          grid.appendChild(t);
        });
        var hint = el("p", { class: "cset-hint u-muted" }, "Define o intervalo mínimo entre mensagens de cada pessoa neste chat público. Ajuda a conter flood.");
        return el("div", { class: "cset-body" },
          header("Temporizador", function () { App.repo.setChatConfig(chatId, { cooldownSec: cooldownDraft }).then(function () { cfg.cooldownSec = cooldownDraft; ui.toast("Temporizador salvo", "ok"); view = "main"; paint(); }); }),
          el("div", { class: "cset-scroll" }, el("div", { class: "cset-group" }, el("div", { class: "cset-card" }, el("div", { class: "cd-wrap" }, grid, hint)))));
      }

      // palavras proibidas (configurável pelo responsável)
      function banwordsView() {
        var listHost = el("div", { class: "bw-list" });
        function paintList() {
          App.util.clear(listHost);
          if (!bannedDraft.length) { listHost.appendChild(el("p", { class: "u-muted", style: { padding: "8px 2px" } }, "Nenhuma palavra bloqueada.")); return; }
          bannedDraft.forEach(function (w, i) {
            listHost.appendChild(ui.Tag(w, { onRemove: function () { bannedDraft.splice(i, 1); paintList(); } }));
          });
        }
        var input = ui.Input({ placeholder: "Adicionar palavra (ex.: xingamento)", maxlength: 40 });
        function add() {
          var v = (input.value || "").toLowerCase().trim();
          if (!v) return;
          if (bannedDraft.indexOf(v) < 0 && bannedDraft.length < 100) bannedDraft.push(v);
          input.value = ""; paintList(); input.focus();
        }
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
        var addBtn = ui.Button({ label: "Adicionar", icon: "plus", size: "sm", variant: "outline", onClick: add });
        var hint = el("p", { class: "cset-hint u-muted" }, "Mensagens contendo estes termos são bloqueadas. Defina o que é ou não permitido — xingamentos, ofensas, etc.");
        paintList();
        return el("div", { class: "cset-body" },
          header("Palavras proibidas", function () { App.repo.setChatConfig(chatId, { bannedWords: bannedDraft }).then(function () { cfg.bannedWords = bannedDraft.slice(); ui.toast("Lista salva", "ok"); view = "main"; paint(); }); }),
          el("div", { class: "cset-scroll" }, el("div", { class: "cset-group" }, el("div", { class: "cset-card" },
            el("div", { class: "bw-wrap" }, el("div", { class: "bw-add" }, el("div", { class: "u-grow" }, input), addBtn), el("div", { class: "bw-tags" }, listHost), hint)))));
      }

      function wallpaperView() {
        var imgSel = wpDraft && wpDraft.kind === "image";
        var isCss = wpDraft && wpDraft.kind === "css";
        // ---- cores padrão (swatches) + paleta custom ----
        var swatches = el("div", { class: "wp-swatches" });
        function swatch(opt) {
          var sel = opt.key === "none" ? !wpDraft : (isCss && wpDraft.key === opt.key && opt.key !== "custom");
          var s = el("button", { class: "wp-sw" + (opt.css ? "" : " wp-sw--none") + (sel ? " is-on" : ""), type: "button", title: opt.label,
            style: opt.css ? { background: opt.css } : null },
            sel ? App.icon("check", { size: "sm" }) : null);
          s.addEventListener("click", function () { wpDraft = opt.key === "none" ? null : { kind: "css", key: opt.key, value: opt.css }; paint(); });
          return s;
        }
        WALLPAPERS.forEach(function (w) { swatches.appendChild(swatch(w)); });
        // paleta: escolher qualquer cor
        var customOn = isCss && wpDraft.key === "custom";
        var palette = el("button", { class: "wp-sw wp-sw--palette" + (customOn ? " is-on" : ""), type: "button", title: "Cor personalizada",
          style: customOn ? { background: wpDraft.value } : {} }, App.icon("edit", { size: "sm" }));
        palette.addEventListener("click", function () {
          ui.pickColor(customOn ? wpDraft.value : "#7c59ec", function (hex) {
            if (!hex) return; wpDraft = { kind: "css", key: "custom", value: hex }; paint();
          }, { title: "Cor do papel de parede", allowClear: false });
        });
        swatches.appendChild(palette);

        // ---- imagem (upload direto) ----
        var fileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
        fileInput.addEventListener("change", function () {
          var f = (fileInput.files || [])[0]; if (!f) return;
          App.util.downscaleImage(f, { maxDim: 1440, quality: 0.82 }).then(function (src) { wpDraft = { kind: "image", value: src }; paint(); })
            .catch(function () { ui.toast("Falha ao carregar imagem", "danger"); });
          fileInput.value = "";
        });
        var imgTile = el("button", { class: "wp-create" + (imgSel ? " has-img" : ""), type: "button",
          style: imgSel ? { backgroundImage: "url(" + wpDraft.value + ")" } : {} },
          el("div", { class: "wp-create__inner" }, App.icon("plus", { size: "lg" }),
            el("span", { class: "wp-create__lbl" }, imgSel ? "Trocar imagem" : "Enviar imagem")),
          fileInput);
        imgTile.addEventListener("click", function () { fileInput.click(); });
        var actions = el("div", { class: "wp-actions" },
          el("div", { class: "wp-sectlbl" }, "Cores"), swatches,
          el("div", { class: "wp-sectlbl" }, "Imagem"), imgTile);
        if (wpDraft) {
          var rm = el("button", { class: "wp-remove", type: "button" }, App.icon("trash", { size: "sm" }), el("span", "Remover papel de parede"));
          rm.addEventListener("click", function () { wpDraft = null; paint(); });
          actions.appendChild(rm);
        }
        // card de demonstração (mockup vertical de tela de chat)
        var prev = el("div", { class: "wp-prev" },
          el("div", { class: "wp-prev__bubble wp-prev__bubble--them" }, "Oi!"),
          el("div", { class: "wp-prev__bubble wp-prev__bubble--me" }, "Olá 👋"),
          el("div", { class: "wp-prev__bubble wp-prev__bubble--them" }, "Curti esse fundo 🔥"));
        applyWallpaper(prev, wpDraft);
        return el("div", { class: "cset-body" },
          header("Papel de parede do chat", function () { (App.repo.setChatWallpaper ? App.repo.setChatWallpaper(chatId, wpDraft) : App.repo.setChatPrefs(chatId, { wallpaper: wpDraft })); chat.wallpaper = wpDraft; prefs.wallpaper = wpDraft; ui.toast("Papel de parede salvo para todos", "ok"); view = "main"; paint(); }),
          el("div", { class: "cset-scroll" }, prev, actions));
      }

      function bubbleView() {
        var grid = el("div", { class: "bub-grid" });
        BUBBLES.forEach(function (b) {
          var t = el("button", { class: "bub-tile" + (b.key === bubbleDraft ? " is-on" : ""), type: "button" },
            el("span", { class: "bub-tile__dot", style: { background: b.color } }),
            el("span", b.label),
            b.key === bubbleDraft ? App.icon("check", { size: "sm", cls: "bub-tile__chk" }) : null);
          t.addEventListener("click", function () { bubbleDraft = b.key; paint(); });
          grid.appendChild(t);
        });
        var prev = el("div", { class: "wp-prev" });
        applyWallpaper(prev, wpDraft);
        prev.style.setProperty("--bubble", bubbleColor(bubbleDraft));
        prev.appendChild(el("div", { class: "wp-prev__bubble wp-prev__bubble--them" }, "Que tema lindo!"));
        prev.appendChild(el("div", { class: "wp-prev__bubble wp-prev__bubble--me" }, "Escolhi essa cor 🎨"));
        return el("div", { class: "cset-body" },
          header("Balão do chat", function () { App.repo.setChatPrefs(chatId, { bubble: bubbleDraft }); prefs.bubble = bubbleDraft; ui.toast("Balão salvo", "ok"); view = "main"; paint(); }),
          el("div", { class: "cset-scroll" }, prev, grid));
      }

      function userRow(id, extra, onClick) {
        var u = db.users[id]; if (!u) return null;
        var r = el(onClick ? "button" : "a", onClick ? { class: "cset-row", type: "button" } : { class: "cset-row", href: "#/u/" + id },
          ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "sm" }),
          el("span", { class: "u-grow cset-row__label" }, u.name + (id === me ? " (você)" : "")),
          extra || null);
        if (onClick) r.addEventListener("click", onClick);
        return r;
      }
      function listScreen(label, rows, emptyMsg) {
        var card = el("div", { class: "cset-card" }, rows.filter(Boolean));
        var content = rows.filter(Boolean).length ? card : ui.Empty("members", emptyMsg || "Vazio", "");
        return el("div", { class: "cset-body" }, header(label), el("div", { class: "cset-scroll" }, el("div", { class: "cset-group" }, content)));
      }
      function communityMemberIds() {
        if (!community || !Array.isArray(db.memberships)) return [];
        return db.memberships.filter(function (m) { return m && m.communityId === community.id; });
      }
      function descView() {
        return el("div", { class: "cset-body" }, header("Descrição"),
          el("div", { class: "cset-scroll" },
            el("div", { class: "cset-group" },
              el("div", { class: "cset-card cset-desc__full" },
                el("p", { class: "cset-desc__text" }, descText || "Sem descrição.")))));
      }
      function membersView() {
        var ids = chat.participants && chat.participants.length ? chat.participants : (others.concat([me]));
        return listScreen("Membros", ids.map(function (id) { return userRow(id); }), "Sem membros");
      }
      function cohostsView() {
        var rows = [];
        if (isComm) {
          communityMemberIds().filter(function (m) { return ["owner", "admin", "lider", "curador", "mod"].indexOf(m.role) >= 0; })
            .forEach(function (m) { rows.push(userRow(m.userId, el("span", { class: "cset-roletag" }, m.role))); });
        } else if (chat.ownerId) {
          rows.push(userRow(chat.ownerId, el("span", { class: "cset-roletag" }, "dono")));
        }
        return listScreen("Co-apresentadores", rows, "Sem co-apresentadores");
      }
      function bannedView() {
        return listScreen("Membros expulsos", [], "Ninguém expulso");
      }
      function transferView() {
        var ids = isComm ? communityMemberIds().map(function (m) { return m.userId; }) : (chat.participants || others);
        var rows = ids.filter(function (id) { return id !== me; }).map(function (id) {
          return userRow(id, App.icon("forward", { cls: "u-muted" }), function () {
            ui.confirm({ title: "Transferir propriedade?", message: "Passar o controle deste chat para " + ((db.users[id] || {}).name || "este membro") + "?", confirmLabel: "Transferir", danger: true })
              .then(function (okp) { if (okp) App.repo.transferChatOwnership(chatId, id).then(function () { ui.toast("Propriedade transferida", "ok"); view = "main"; paint(); }); });
          });
        });
        return listScreen("Transferir a propriedade", rows, "Sem membros para transferir");
      }

      function paint() {
        var node = view === "wallpaper" ? wallpaperView()
          : view === "bubble" ? bubbleView()
          : view === "cooldown" ? cooldownView()
          : view === "banwords" ? banwordsView()
          : view === "desc" ? descView()
          : view === "members" ? membersView()
          : view === "cohosts" ? cohostsView()
          : view === "banned" ? bannedView()
          : view === "transfer" ? transferView()
          : mainView();
        var root = el("div", { class: "cset cset--chat" }, node);
        var accent = (community && community.theme && community.theme.accent) || App.store.get("accent") || "#7c59ec";
        root.style.setProperty("--accent", accent);
        App.util.mount(inner, root);
      }
      paint();
    });

    return { node: inner, active: "chats", title: "Configurações", immersive: true, flush: true };
  }

  App.screens.chatSettings = render;
  App.chatPrefsUtil = { bubbleColor: bubbleColor, applyWallpaper: applyWallpaper };
})(window.App = window.App || {});
