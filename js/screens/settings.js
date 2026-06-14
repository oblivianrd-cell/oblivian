/* ============================================================
   screens/settings.js — Configurações.
   GLOBAL (/config): conta principal + aparência + dados.
   COMUNIDADE (/c/:id/config): identidade, regras e customização
   visual independente (somente dono/admin).
   Namespace: App.screens.settingsGlobal / settingsCommunity
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  var PALETTE = ["#7c59ec", "#ff5fa2", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7"];

  function swatches(current, onPick) {
    var box = el("div", { class: "swatches" });
    PALETTE.forEach(function (hex) {
      var s = el("button", { class: "swatch" + (hex.toLowerCase() === (current || "").toLowerCase() ? " is-active" : ""), type: "button", style: { background: hex }, title: hex });
      s.addEventListener("click", function () {
        App.util.qsa(".swatch", box).forEach(function (x) { x.classList.remove("is-active"); });
        s.classList.add("is-active");
        onPick(hex);
      });
      box.appendChild(s);
    });
    // lápis = cor personalizada → abre o seletor geral
    var custom = el("button", { class: "swatch swatch--custom", type: "button", title: "Cor personalizada" }, App.icon("edit", { size: "sm" }));
    custom.addEventListener("click", function () {
      ui.pickColor(current || "#7c59ec", function (hex) {
        if (!hex) return;
        App.util.qsa(".swatch", box).forEach(function (x) { x.classList.remove("is-active"); });
        current = hex; onPick(hex);
      }, { title: "Cor do tema", allowClear: false });
    });
    box.appendChild(custom);
    return box;
  }

  function navList(items) {
    var nav = el("nav", { class: "settings-nav" });
    items.forEach(function (it) {
      var b = el("button", { class: "settings-nav__item", type: "button" }, App.icon(it.icon, { size: "sm" }), el("span", it.label));
      b.addEventListener("click", function () { it.target.scrollIntoView({ behavior: "smooth", block: "start" }); });
      nav.appendChild(b);
    });
    return nav;
  }

  /* ================= Configuração GLOBAL ================= */
  function renderGlobal() {
    var inner = el("div", { class: "view__inner" });

    App.repo.getCurrentUser().then(function (user) {
      var accountBlock = el("section", { class: "card settings-block", id: "set-conta" },
        el("div", { class: "settings-block__title" }, "Conta global"),
        el("div", { class: "u-row u-gap-3" },
          ui.Avatar({ name: user.name, src: user.avatar, size: "lg", round: true }),
          el("div", { class: "u-grow" }, el("strong", user.name), el("div", { class: "u-muted" }, "@" + user.handle)),
          ui.Button({ label: "Editar", icon: "edit", variant: "outline", size: "sm", onClick: function () { App.screensInternal.editGlobal(user, function () { App.router.resolve(); }); } })),
        el("p", { class: "section-sub" }, "A conta global não possui reputação, tags ou títulos — esses são exclusivos de cada comunidade."));

      var theme = App.store.get("theme");
      var appearanceBlock = el("section", { class: "card settings-block", id: "set-aparencia" },
        el("div", { class: "settings-block__title" }, "Aparência"),
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "Tema"), el("div", { class: "settings-row__desc" }, "Claro ou escuro — só na sua visão")),
          ui.Segmented([{ value: "dark", label: "Escuro" }, { value: "light", label: "Claro" }], theme, function (v) { App.store.setTheme(v); })),
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "Cor dos botões"), el("div", { class: "settings-row__desc" }, "Acento de botões e destaques — vale só para você, não muda nada para os outros")),
          swatches(App.store.get("accent"), function (hex) { App.store.setAccent(hex); })),
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "Som da interface"), el("div", { class: "settings-row__desc" }, "Toques, alternâncias e avisos sonoros ao tocar")),
          ui.Switch(App.sound ? App.sound.enabled() : true, function (v) {
            if (App.sound) { App.sound.setEnabled(v); if (v) App.sound.play("success"); }
          })),
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "Guia de boas-vindas"), el("div", { class: "settings-row__desc" }, "Rever o tour de introdução")),
          ui.Button({ label: "Rever guia", icon: "info", variant: "outline", size: "sm", onClick: function () { if (App.onboarding) App.onboarding.show(); } })));

      // bloqueados GLOBAIS (conta) — diferente do bloqueio por comunidade
      var blkHost = el("div", { class: "u-col u-gap-2" });
      function paintBlocked() {
        App.util.clear(blkHost);
        App.repo.listBlocked().then(function (list) {
          if (!list.length) { blkHost.appendChild(ui.Empty("check", "Ninguém bloqueado", "Você não bloqueou nenhuma conta.")); return; }
          list.forEach(function (u) {
            blkHost.appendChild(el("div", { class: "block-row" },
              ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "sm" }),
              el("div", { class: "u-grow" }, el("strong", u.name), el("div", { class: "u-muted", style: { fontSize: "var(--fs-xs)" } }, "@" + u.handle)),
              el("span", { class: "block-row__tag" }, "Bloqueado"),
              ui.Button({ label: "Desbloquear", size: "sm", variant: "ghost", onClick: function () {
                App.repo.unblockUser(u.id).then(function () { ui.toast("Desbloqueado", "ok"); paintBlocked(); });
              } })));
          });
        });
      }
      var blockedBlock = el("section", { class: "card settings-block", id: "set-bloqueados" },
        el("div", { class: "settings-block__title" }, "Contas bloqueadas"),
        el("p", { class: "section-sub" }, "Bloqueio global da sua conta — vale em todo o app, não só numa comunidade."),
        blkHost);
      paintBlocked();

      // input escondido p/ importar backup
      var importInput = el("input", { type: "file", accept: "application/json,.json", style: { display: "none" } });
      importInput.addEventListener("change", function () {
        var f = (importInput.files || [])[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          ui.confirm({ title: "Importar backup", message: "Isso substitui TODOS os dados atuais por este backup. Continuar?", confirmLabel: "Importar", danger: true })
            .then(function (ok) {
              if (!ok) { importInput.value = ""; return; }
              App.repo.importData(rd.result).then(function () { ui.toast("Backup importado", "ok"); location.hash = "/explorer"; location.reload(); })
                .catch(function (e) { ui.toast(e.message || "Falha ao importar", "danger"); importInput.value = ""; });
            });
        };
        rd.readAsText(f);
      });

      var dataBlock = el("section", { class: "card settings-block danger-zone", id: "set-dados" },
        el("div", { class: "settings-block__title" }, "Dados"),
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "Backup dos dados"),
            el("div", { class: "settings-row__desc" }, "Exporte um arquivo .json com tudo deste navegador, ou importe um backup.")),
          el("div", { class: "u-row u-gap-2" },
            ui.Button({ label: "Exportar", icon: "download", variant: "outline", size: "sm", onClick: function () {
              App.repo.exportData().then(function (json) {
                try {
                  var blob = new Blob([json], { type: "application/json" });
                  var url = URL.createObjectURL(blob);
                  var a = el("a", { href: url, download: "sanguao-backup.json" });
                  document.body.appendChild(a); a.click();
                  setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 0);
                  ui.toast("Backup exportado", "ok");
                } catch (e) { ui.toast("Não foi possível exportar", "danger"); }
              });
            } }),
            ui.Button({ label: "Importar", icon: "upload", variant: "outline", size: "sm", onClick: function () { importInput.click(); } }),
            importInput)),
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "Restaurar dados de exemplo"),
            el("div", { class: "settings-row__desc" }, "Apaga alterações locais e recria o conteúdo inicial.")),
          ui.Button({ label: "Restaurar", icon: "trash", variant: "danger", onClick: function () {
            ui.confirm({ title: "Restaurar dados", message: "Isso apaga tudo salvo neste navegador e recria os dados de exemplo. Continuar?", confirmLabel: "Restaurar", danger: true })
              .then(function (ok) { if (ok) App.repo.resetData().then(function () { ui.toast("Dados restaurados", "ok"); location.hash = "/explorer"; location.reload(); }); });
          } })));

      var nav = navList([
        { icon: "profile", label: "Conta", target: accountBlock },
        { icon: "palette", label: "Aparência", target: appearanceBlock },
        { icon: "ban", label: "Bloqueados", target: blockedBlock },
        { icon: "trash", label: "Dados", target: dataBlock }
      ]);

      var legalBlock = el("section", { class: "card settings-block", id: "set-legal" },
        el("div", { class: "settings-block__title" }, "Sobre"),
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "Privacidade"), el("div", { class: "settings-row__desc" }, "Como tratamos seus dados, cookies e anúncios")),
          el("a", { class: "btn btn--outline btn--sm", href: "privacidade.html", target: "_blank", rel: "noopener" }, "Abrir")),
        // download discreto do app (APK no GitHub Releases)
        el("div", { class: "settings-row" },
          el("div", null, el("div", { class: "settings-row__label" }, "App para Android"), el("div", { class: "settings-row__desc" }, "Baixe o APK oficial (Android 7.0+)")),
          el("a", { class: "btn btn--outline btn--sm", href: "https://github.com/oblivianrd-cell/oblivian/releases/latest/download/oblivian.apk", target: "_blank", rel: "noopener" }, App.icon("download", { size: "sm" }), "Baixar")));

      App.util.mount(inner, el("div", { class: "settings-layout" }, nav,
        el("div", { class: "settings-section" }, accountBlock, appearanceBlock, blockedBlock, dataBlock, legalBlock)));
    });

    return { node: inner, active: "settings", title: "Configurações" };
  }

  /* ---- Área USUÁRIO: configurações pessoais nesta comunidade ---- */
  function userArea(community, membership, me) {
    var id = community.id;
    if (!membership) return ui.Empty("profile", "Participe da comunidade", "Entre para configurar suas preferências.");

    // estado local de preferências por comunidade (persistido no store)
    var key = "commPrefs." + id;
    var prefs = Object.assign({
      notif: true, notifPosts: true, notifReplies: true, notifLikes: false, mentions: true,
      notifEvents: true, notifPolls: false, notifLeaderboard: false, notifSound: true, notifPush: true,
      digest: "diario", quietHours: false,
      hideOnline: false, hideActivity: false, privateProfile: false, whoCanMessage: "todos", whoCanTag: "todos",
      readReceipts: true, showJoinDate: true, allowFollow: true, lang: "pt",
      theme: "auto", fontSize: "media", reduceMotion: false, compact: false, autoplayMedia: true,
      hideNsfw: true, highContrast: false, showAvatars: true, colorfulNames: true,
      feedSort: "recentes", showSeen: false, infiniteScroll: true, autoTranslate: false, defaultTab: "featured",
      pinFavorites: true, hideBlockedPosts: true, blurSpoilers: true,
      saveData: false, downloadHd: true, autoplayGifs: true,
      blocked: [], muted: []
    }, App.store.get(key) || {});
    function save() { App.store.set(key, prefs); }

    /* helpers compactos */
    function rowToggle(label, desc, k) {
      return el("div", { class: "settings-row" },
        el("div", null, el("div", { class: "settings-row__label" }, label), desc ? el("div", { class: "settings-row__desc" }, desc) : null),
        ui.Switch(prefs[k], function (v) { prefs[k] = v; save(); if (k === "reduceMotion") document.documentElement.setAttribute("data-reduce-motion", v ? "1" : ""); if (k === "hideOnline" && App.repo.setHidePresence) App.repo.setHidePresence(v); }));
    }
    function rowSeg(label, k, opts) {
      return el("div", { class: "settings-row" },
        el("div", null, el("div", { class: "settings-row__label" }, label)),
        ui.Segmented(opts, prefs[k], function (v) { prefs[k] = v; save(); }));
    }
    function block(title, sub, rows) {
      return el("section", { class: "card settings-block" },
        el("div", { class: "settings-block__title" }, title),
        sub ? el("p", { class: "section-sub" }, sub) : null,
        rows);
    }

    // ---- Notificações (10) ----
    var notifBlock = block("Notificações", "O que e como você é avisado.", [
      rowToggle("Avisos da comunidade", "Posts, eventos e novidades", "notif"),
      rowToggle("Novos posts", "Quando alguém publica", "notifPosts"),
      rowToggle("Respostas", "Respostas aos seus posts/comentários", "notifReplies"),
      rowToggle("Curtidas", "Quando curtem seu conteúdo", "notifLikes"),
      rowToggle("Menções", "Quando alguém te marcar", "mentions"),
      rowToggle("Eventos", "Lembretes de eventos e lives", "notifEvents"),
      rowToggle("Enquetes e quizzes", "Novas enquetes/quizzes", "notifPolls"),
      rowToggle("Ranking", "Mudanças no placar de reputação", "notifLeaderboard"),
      rowToggle("Som de notificação", null, "notifSound"),
      rowToggle("Notificações push", "No dispositivo", "notifPush"),
      rowSeg("Resumo por e-mail", "digest", [{ value: "nunca", label: "Nunca" }, { value: "diario", label: "Diário" }, { value: "semanal", label: "Semanal" }]),
      rowToggle("Horário silencioso", "Sem alertas das 22h às 8h", "quietHours")
    ]);

    // ---- Privacidade (9) ----
    var privacyBlock = block("Privacidade", "Quem vê e fala com você.", [
      rowToggle("Ocultar status online", "Não mostrar quando está ativo", "hideOnline"),
      rowToggle("Ocultar atividade", "Esconder posts recentes do seu perfil", "hideActivity"),
      rowToggle("Perfil privado", "Só membros veem seu perfil", "privateProfile"),
      rowSeg("Quem pode te enviar mensagem", "whoCanMessage", [{ value: "todos", label: "Todos" }, { value: "seguindo", label: "Seguindo" }, { value: "ninguem", label: "Ninguém" }]),
      rowSeg("Quem pode te marcar", "whoCanTag", [{ value: "todos", label: "Todos" }, { value: "seguindo", label: "Seguindo" }, { value: "ninguem", label: "Ninguém" }]),
      rowToggle("Confirmação de leitura", "Mostrar quando você leu mensagens", "readReceipts"),
      rowToggle("Mostrar data de entrada", "Exibir 'membro desde' no perfil", "showJoinDate"),
      rowToggle("Permitir que te sigam", null, "allowFollow"),
      rowSeg("Idioma do conteúdo", "lang", [{ value: "pt", label: "PT" }, { value: "en", label: "EN" }, { value: "es", label: "ES" }])
    ]);

    // ---- Aparência (8) ----
    var appearanceBlock = block("Aparência", "Como a comunidade aparece pra você.", [
      rowSeg("Tema", "theme", [{ value: "auto", label: "Auto" }, { value: "claro", label: "Claro" }, { value: "escuro", label: "Escuro" }]),
      rowSeg("Tamanho da fonte", "fontSize", [{ value: "pequena", label: "P" }, { value: "media", label: "M" }, { value: "grande", label: "G" }]),
      rowToggle("Modo compacto", "Menos espaçamento entre itens", "compact"),
      rowToggle("Reduzir animações", "Menos movimento na interface", "reduceMotion"),
      rowToggle("Alto contraste", "Mais legibilidade", "highContrast"),
      rowToggle("Mostrar avatares", "Exibir fotos de perfil no feed", "showAvatars"),
      rowToggle("Nomes coloridos", "Cargos com cor", "colorfulNames"),
      rowToggle("Reproduzir mídia automaticamente", null, "autoplayMedia")
    ]);

    // ---- Feed e conteúdo (10) ----
    var feedBlock = block("Feed e conteúdo", "Como o conteúdo é exibido.", [
      rowSeg("Ordenar feed", "feedSort", [{ value: "recentes", label: "Recentes" }, { value: "populares", label: "Populares" }, { value: "destaques", label: "Destaques" }]),
      rowSeg("Aba inicial", "defaultTab", [{ value: "featured", label: "Destaques" }, { value: "latest", label: "Recentes" }]),
      rowToggle("Rolagem infinita", "Carregar mais ao chegar no fim", "infiniteScroll"),
      rowToggle("Marcar como visto", "Esmaecer posts já vistos", "showSeen"),
      rowToggle("Traduzir automaticamente", "Conteúdo em outro idioma", "autoTranslate"),
      rowToggle("Ocultar conteúdo sensível", "Borrar mídia marcada", "hideNsfw"),
      rowToggle("Borrar spoilers", "Até você tocar", "blurSpoilers"),
      rowToggle("Favoritos no topo", "Fixar comunidades/posts favoritos", "pinFavorites"),
      rowToggle("Ocultar posts de bloqueados", null, "hideBlockedPosts"),
      rowToggle("GIFs automáticos", "Animar GIFs no feed", "autoplayGifs")
    ]);

    // ---- Dados e mídia (3) ----
    var dataBlock = block("Dados e mídia", "Uso de rede.", [
      rowToggle("Economia de dados", "Carregar mídia em baixa qualidade", "saveData"),
      rowToggle("Baixar em alta definição", "Só no Wi-Fi", "downloadHd"),
      rowToggle("Recibos de leitura", "Mostrar 'visto' nos chats", "readReceipts")
    ]);

    // ---- Usuários bloqueados / silenciados ----
    var blockHost = el("div", { class: "u-col u-gap-2" });
    function paintLists() {
      App.util.clear(blockHost);
      App.repo.listMembers(id).then(function (list) {
        var byId = {}; list.forEach(function (x) { byId[x.user.id] = x.user; });
        function row(uid, kind) {
          var u = byId[uid] || { name: "Usuário", handle: uid };
          return el("div", { class: "block-row" },
            ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "sm" }),
            el("div", { class: "u-grow" }, el("strong", u.name), el("div", { class: "u-muted", style: { fontSize: "var(--fs-xs)" } }, "@" + u.handle)),
            el("span", { class: "block-row__tag" }, kind === "blocked" ? "Bloqueado" : "Silenciado"),
            ui.Button({ label: "Remover", size: "sm", variant: "ghost", onClick: function () {
              prefs[kind] = prefs[kind].filter(function (x) { return x !== uid; }); save(); paintLists();
            } }));
        }
        if (!prefs.blocked.length && !prefs.muted.length) {
          blockHost.appendChild(ui.Empty("check", "Ninguém bloqueado", "Você não bloqueou nem silenciou ninguém aqui."));
        } else {
          prefs.blocked.forEach(function (uid) { blockHost.appendChild(row(uid, "blocked")); });
          prefs.muted.forEach(function (uid) { blockHost.appendChild(row(uid, "muted")); });
        }
      });
    }
    function addPerson(kind) {
      App.repo.listMembers(id).then(function (list) {
        var opts = list.filter(function (x) { return x.user.id !== me.id && prefs.blocked.indexOf(x.user.id) < 0 && prefs.muted.indexOf(x.user.id) < 0; });
        if (!opts.length) { ui.toast("Sem membros para adicionar", "danger"); return; }
        var body = el("div", { class: "u-col u-gap-1" });
        var ref = ui.openModal({ title: kind === "blocked" ? "Bloquear membro" : "Silenciar membro", body: body });
        opts.forEach(function (x) {
          body.appendChild(el("button", { class: "list-item", type: "button", style: { width: "100%" }, onClick: function () {
            prefs[kind].push(x.user.id); save(); ref.close(); paintLists();
            ui.toast((kind === "blocked" ? "Bloqueado: " : "Silenciado: ") + x.user.name, "ok");
          } }, ui.Avatar({ name: x.user.name, src: x.user.avatar, round: true, size: "sm" }),
            el("div", { class: "list-item__body" }, el("div", { class: "list-item__title" }, x.user.name), el("div", { class: "list-item__sub" }, "@" + x.user.handle))));
        });
      });
    }
    var blockBlock = el("section", { class: "card settings-block", id: "u-block" },
      el("div", { class: "settings-block__title" }, "Bloqueados e silenciados"),
      el("p", { class: "section-sub" }, "Quem você não quer ver ou ouvir nesta comunidade."),
      blockHost,
      el("div", { class: "u-row u-gap-2" },
        ui.Button({ label: "Bloquear alguém", icon: "ban", size: "sm", variant: "outline", onClick: function () { addPerson("blocked"); } }),
        ui.Button({ label: "Silenciar alguém", icon: "mute", size: "sm", variant: "outline", onClick: function () { addPerson("muted"); } })));
    paintLists();

    // ---- Sair da comunidade (dono não sai; editar perfil fica no próprio perfil) ----
    var accountBlock = membership.role !== "owner" ? el("section", { class: "card settings-block danger-zone", id: "u-account" },
      el("div", { class: "settings-block__title" }, "Conta nesta comunidade"),
      el("div", { class: "settings-row" },
        el("div", null, el("div", { class: "settings-row__label" }, "Sair da comunidade"), el("div", { class: "settings-row__desc" }, "Seu perfil aqui é mantido.")),
        ui.Button({ label: "Sair", icon: "leave", variant: "danger", onClick: function () {
          ui.confirm({ title: "Sair da comunidade", message: "Deixar de participar de " + community.name + "?", confirmLabel: "Sair", danger: true })
            .then(function (ok) { if (ok) App.repo.leaveCommunity(id).then(function () { ui.toast("Você saiu"); App.router.navigate("/sanguao"); }); });
        } }))) : null;

    return el("div", { class: "settings-section" }, [notifBlock, privacyBlock, appearanceBlock, feedBlock, dataBlock, blockBlock, accountBlock].filter(Boolean));
  }

  /* ---- Área ADMINISTRAÇÃO: gestão da comunidade (só mod) ---- */
  function adminArea(community, membership) {
    var id = community.id;
    var isOwner = membership && membership.role === "owner";

    // painel de informações da comunidade
    function istat(num, label, cls) {
      return el("div", { class: "istat" + (cls ? " " + cls : "") },
        el("span", { class: "istat__num" }, num),
        el("span", { class: "istat__label" }, label));
    }
    var _cs = community.settings || {};
    var infoBlock = el("section", { class: "u-col u-gap-3", id: "c-info" },
      el("div", { class: "admin-bento" },
        istat(App.util.formatCount(community.memberCount), "Membros", "istat--feature"),
        istat(community.settings.visibility === "private" ? "Privada" : "Pública", "Visibilidade"),
        istat(App.util.fullDate(community.createdAt), "Criada em"),
        istat("#" + (community.slug || id.slice(-6)), "ID", "istat--wide istat--mono")),
      // ---- Regras (resumo) dentro da Visão geral ----
      el("div", { class: "admin-bento" },
        istat(_cs.joinPolicy === "request" ? "Solicitação" : "Aberta", "Entrada"),
        istat(_cs.allowMemberPosts === false ? "Só staff" : "Liberados", "Posts de membros"),
        istat((community.tags || []).length ? (community.tags || []).slice(0, 2).join(", ") : "—", "Categorias", "istat--wide"))
    );

    // ---- Convites: criar com VALIDADE + lista de ATIVOS (revogar/copiar) ----
    var invites = (community.settings && community.settings.invites) ? community.settings.invites.slice() : [];
    var validityVal = "0";
    function inviteUrl(code) { return location.origin + location.pathname + "#/c/" + id + (code ? "?convite=" + code : ""); }
    function copyLink(url) { if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { ui.toast("Link copiado", "ok"); }, function () { ui.toast(url); }); else ui.toast(url); }
    function persistInvites() { return App.repo.updateCommunity(id, { settings: Object.assign({}, community.settings || {}, { invites: invites }) }).then(function (c) { if (c && c.settings) community.settings = c.settings; }); }
    function fmtExpiry(inv) { if (!inv.expiresAt) return "Permanente"; var d = inv.expiresAt - Date.now(); if (d <= 0) return "Expirado"; var days = Math.ceil(d / 86400000); return days <= 1 ? "Expira hoje" : "Expira em " + days + " dias"; }
    var invList = el("div", { class: "invites__list" });
    var invStats = el("div", { class: "admin-bento" });
    function renderStats() {
      App.util.clear(invStats);
      var active = invites.filter(function (i) { return !i.expiresAt || i.expiresAt > Date.now(); });
      var uses = invites.reduce(function (a, i) { return a + (i.uses || 0); }, 0);
      var perm = active.filter(function (i) { return !i.expiresAt; }).length;
      invStats.appendChild(istat(String(active.length), "Convites ativos", "istat--feature"));
      invStats.appendChild(istat(String(uses), "Usos totais"));
      invStats.appendChild(istat(String(perm), "Permanentes"));
    }
    function renderInvites() {
      renderStats();
      App.util.clear(invList);
      var active = invites.filter(function (i) { return !i.expiresAt || i.expiresAt > Date.now(); });
      if (!active.length) { invList.appendChild(el("div", { class: "invites__empty" }, "Nenhum convite ativo. Gere um acima.")); return; }
      active.forEach(function (inv) {
        var url = inviteUrl(inv.code);
        invList.appendChild(el("div", { class: "invite-row" },
          el("span", { class: "invite-row__ic" + (inv.expiresAt ? " is-temp" : " is-perm") }, App.icon(inv.expiresAt ? "recent" : "globe", { size: "sm" })),
          el("div", { class: "invite-row__body" },
            el("div", { class: "invite-row__code" }, "#" + inv.code),
            el("div", { class: "invite-row__meta" }, fmtExpiry(inv) + " · " + (inv.uses || 0) + " usos")),
          el("button", { class: "invite-row__act", type: "button", title: "Copiar link", onClick: function () { copyLink(url); } }, App.icon("globe", { size: "sm" })),
          el("button", { class: "invite-row__act invite-row__act--del", type: "button", title: "Revogar", onClick: function () {
            invites = invites.filter(function (x) { return x.code !== inv.code; });
            persistInvites().then(function () { ui.toast("Convite revogado"); renderInvites(); });
          } }, App.icon("trash", { size: "sm" }))));
      });
    }
    function createInvite() {
      var days = parseInt(validityVal, 10) || 0;
      var code = Math.random().toString(36).slice(2, 8);
      invites.unshift({ code: code, type: days ? "temp" : "permanent", createdAt: Date.now(), expiresAt: days ? Date.now() + days * 86400000 : null, uses: 0 });
      persistInvites().then(function () { ui.toast("Convite criado", "ok"); copyLink(inviteUrl(code)); renderInvites(); }).catch(function (e) { ui.toast((e && e.message) || "Falha ao criar", "danger"); });
    }
    var validitySeg = ui.Segmented([{ value: "0", label: "Permanente" }, { value: "1", label: "1 dia" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }], "0", function (v) { validityVal = v; });
    var linkBlock = el("div", { class: "u-col u-gap-4", id: "c-link" },
      // 1) resumo (bento)
      el("div", { class: "invites-summary" }, el("span", { class: "invites__lbl" }, "Resumo"), invStats),
      // 2) criar convite
      el("section", { class: "card invites" },
        el("p", { class: "section-sub" }, "Gere links de convite com validade."),
        el("div", { class: "invites__field" }, el("span", { class: "invites__lbl" }, "Validade"), validitySeg),
        ui.Button({ label: "Gerar convite", icon: "plus", variant: "primary", block: true, onClick: createInvite })),
      // 3) convites ativos
      el("section", { class: "card invites" },
        el("div", { class: "invites__field" }, el("span", { class: "invites__lbl" }, "Convites ativos"), invList)));
    renderInvites();

    var name = ui.Input({ value: community.name });
        var slugLocked = !!(community.settings && community.settings.slugLocked);   // ID já foi trocado 1x
        // ID automático (do nome) se a comunidade ainda não tem — mostra preenchido
        var curSlug = community.slug || (App.models.slugify(community.name) + "-" + id.slice(-4));
        var idInput = ui.Input({ value: curSlug, placeholder: "minha-comunidade", maxlength: 30 });
        if (slugLocked) { idInput.readOnly = true; idInput.classList.add("is-locked"); }
        var idHint = ui.Field("ID", idInput);
        // descrição com editor rico (negrito/itálico/link/imagem) + expandir, igual à bio
        var _dpv = App.store.get("commDescPreview");
        var descInit = (_dpv && _dpv.id === id) ? _dpv.desc : community.description;   // restaura o que estava em edição (após prévia)
        var descEd = App.components.richText(descInit, {
          fullTitle: "Descrição", placeholder: "Conte sobre a comunidade. Use negrito, itálico e links.",
          previewTitle: "Ver na comunidade", noImage: true,
          onPreview: function (descVal) {                       // olho → vê o "Sobre" da comunidade com este texto
            App.store.set("commDescPreview", { id: id, desc: descVal });
            App.router.navigate("/c/" + id + "?previewDesc=1");
          }
        });
        var tags = C.TagEditor({ value: community.tags, placeholder: "Categoria" });
        function normSlug(v) { return (v || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30); }
        // botão ⤢ no canto do card → interface grande com efeito vidro
        function openBigField(title, inputEl) {
          var big = ui.Input({ value: inputEl.value, placeholder: inputEl.placeholder });
          if (inputEl.readOnly) big.readOnly = true;
          big.classList.add("bigfield__input");
          var closed = false;
          function close() {
            if (closed) return; closed = true;
            document.removeEventListener("keydown", onKey);
            if (!inputEl.readOnly && big.value !== inputEl.value) { inputEl.value = big.value; inputEl.dispatchEvent(new Event("input")); }
            scrim.classList.add("is-closing"); setTimeout(function () { if (scrim.parentNode) scrim.remove(); }, 180);
          }
          function onKey(e) { if (e.key === "Escape") close(); }
          var panel = el("div", { class: "bigfield-panel" },
            el("button", { class: "bigfield-x", type: "button", title: "Fechar", onClick: close }, App.icon("close")),
            el("div", { class: "bigfield-title" }, title),
            big,
            ui.Button({ label: "Concluir", variant: "primary", block: true, onClick: close }));
          var scrim = el("div", { class: "scrim bigfield-scrim" }, panel);
          scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
          document.body.appendChild(scrim);
          document.addEventListener("keydown", onKey);
          setTimeout(function () { try { big.focus(); if (big.select) big.select(); } catch (e) {} }, 40);
        }
        function addExpand(fieldEl, title, inputEl) {
          var b = el("button", { class: "fieldexp", type: "button", title: "Ampliar" }, App.icon("expand", { size: "sm" }));
          b.addEventListener("click", function (e) { e.preventDefault(); openBigField(title, inputEl); });
          fieldEl.appendChild(b);
          return fieldEl;
        }
        var nameField = addExpand(ui.Field("Nome", name), "Nome", name);
        addExpand(idHint, "ID", idInput);

        var identityBlock = el("section", { class: "card settings-block", id: "c-identidade" },
          nameField,
          idHint,
          ui.Field("Descrição", descEd.node),
          ui.Field("Tags", tags.node),
          ui.Button({ label: "Salvar identidade", variant: "primary", onClick: function () {
            var nameErr = App.search.validateCommunityName(name.value.trim());
            if (nameErr) { ui.toast(nameErr, "danger"); name.focus(); return; }
            var patch = { name: name.value.trim() || community.name, description: descEd.getValue().trim(), tags: tags.getValue() };
            var newSlug = normSlug(idInput.value);
            var locking = false;
            if (!slugLocked) {
              patch.slug = newSlug || curSlug;            // persiste o ID (auto na 1ª vez)
              if (newSlug && newSlug !== curSlug) {        // 2ª vez = troca decidida pelo usuário → trava
                patch.settings = Object.assign({}, community.settings || {}, { slugLocked: true });
                locking = true;
              }
            }
            App.repo.updateCommunity(id, patch)
              .then(function () { App.store.set("commDescPreview", null); ui.toast(locking ? "ID alterado — não pode trocar de novo" : "Identidade salva", "ok"); App.router.resolve(); });
          } }));

        var vis = community.settings.visibility, join = community.settings.joinPolicy, allowPosts = community.settings.allowMemberPosts;
        var rulesBlock = el("section", { class: "card settings-block", id: "c-regras" },
          el("div", { class: "settings-block__title" }, "Regras"),
          el("div", { class: "settings-row" },
            el("div", null, el("div", { class: "settings-row__label" }, "Visibilidade"), el("div", { class: "settings-row__desc" }, "Pública aparece no Explorer")),
            ui.Segmented([{ value: "public", label: "Pública" }, { value: "private", label: "Privada" }], vis, function (v) { vis = v; })),
          el("div", { class: "settings-row" },
            el("div", null, el("div", { class: "settings-row__label" }, "Entrada"), el("div", { class: "settings-row__desc" }, "Como novos membros entram")),
            ui.Segmented([{ value: "open", label: "Aberta" }, { value: "request", label: "Solicitação" }], join, function (v) { join = v; })),
          el("div", { class: "settings-row" },
            el("div", null, el("div", { class: "settings-row__label" }, "Posts de membros"), el("div", { class: "settings-row__desc" }, "Permitir que membros publiquem")),
            ui.Switch(allowPosts, function (v) { allowPosts = v; })),
          ui.Button({ label: "Salvar regras", variant: "primary", onClick: function () {
            App.repo.updateCommunity(id, { settings: Object.assign({}, community.settings || {}, { visibility: vis, joinPolicy: join, allowMemberPosts: allowPosts }) })
              .then(function () { ui.toast("Regras salvas", "ok"); App.router.resolve(); });
          } }));

        // Customização vira uma INTERFACE própria (cor + imagens) — só um clique
        var visualBlock = el("button", { class: "admin-bar", type: "button", onClick: function () { App.router.navigate("/c/" + id + "/customizar"); } },
          el("span", { class: "admin-bar__icon" }, App.icon("palette", { size: "sm", fill: true })),
          el("div", { class: "u-grow" },
            el("div", { class: "admin-bar__title" }, "Customização"),
            el("div", { class: "admin-bar__sub" }, "Cor de destaque, ícone, fundo e painel lateral")),
          App.icon("forward", { cls: "admin-bar__chev" }));

    // ============================================================
    //  PÁGINAS — gerenciador único (estilo Circle). Cada página é uma aba:
    //  as principais (Destaques/Recentes/Diretrizes/Oficial/Chats) + cada
    //  FEED (Posts, Imagens, Wikis, Blogs...) como página SEPARADA, com
    //  liga/desliga + reordenar + renomear. Páginas custom juntam feeds.
    // ============================================================
    var CORE_DEFS = [
      { key: "featured", label: "Destaques" }, { key: "latest", label: "Recentes" },
      { key: "guidelines", label: "Diretrizes" }, { key: "official", label: "Oficial" }, { key: "chats", label: "Chats" }
    ];
    var FEED_PAGE_DEFS = [
      { key: "populares", label: "Populares" }, { key: "comentados", label: "Comentados" },
      { key: "posts", label: "Posts" }, { key: "imagens", label: "Imagens" },
      { key: "enquetes", label: "Enquetes" }, { key: "perguntas", label: "Perguntas" },
      { key: "quizzes", label: "Quizzes" }, { key: "links", label: "Links" },
      { key: "blogs", label: "Blogs" }, { key: "wikis", label: "Wikis" }
    ];
    var ALL_DEFS = CORE_DEFS.concat(FEED_PAGE_DEFS);
    function isCore(k) { return CORE_DEFS.some(function (d) { return d.key === k; }); }
    function isFeedPage(k) { return FEED_PAGE_DEFS.some(function (d) { return d.key === k; }); }
    // estado a partir do salvo (preserva ordem/on/label)
    var pagesState = ((community.settings && community.settings.tabs) || CORE_DEFS.map(function (d) { return { key: d.key, label: d.label, on: true }; }))
      .map(function (t) { return { key: t.key, label: t.label, on: t.on !== false, custom: !!t.custom, feeds: t.feeds || null }; });
    // garante todas as páginas padrão: CORE ligadas, FEEDS desligadas (o dono liga)
    ALL_DEFS.forEach(function (d) {
      if (!pagesState.some(function (t) { return t.key === d.key; })) pagesState.push({ key: d.key, label: d.label, on: isCore(d.key), custom: false, feeds: null });
    });
    pagesState.forEach(function (t) { if (isCore(t.key)) t.on = true; }); // páginas padrão nunca ficam desligadas
    var homeKey = (community.settings && community.settings.home) || "featured";
    function ensureHomeValid() {
      var on = pagesState.filter(function (t) { return t.on; });
      if (!on.some(function (t) { return t.key === homeKey; })) homeKey = (on[0] && on[0].key) || "featured";
    }
    ensureHomeValid();

    // seletor de feeds (módulos) de uma página custom — checklist com interruptores
    function feedPicker(selectedKeys) {
      var sel = {}; (selectedKeys || []).forEach(function (k) { sel[k] = true; });
      var host = el("div", { class: "tabcfg" });
      FEED_PAGE_DEFS.forEach(function (d) {
        var row = el("div", { class: "tabcfg__row" + (sel[d.key] ? "" : " is-off") },
          el("div", { class: "u-grow" }, el("span", { class: "pagecfg__label" }, d.label)),
          ui.Switch(!!sel[d.key], function (v) { sel[d.key] = v; row.classList.toggle("is-off", !v); }));
        host.appendChild(row);
      });
      return { node: host, getSelected: function () { return FEED_PAGE_DEFS.filter(function (d) { return sel[d.key]; }).map(function (d) { return d.key; }); } };
    }

    // ---- detalhe de uma página (renomear / definir inicial / feeds custom / excluir) ----
    function openPageDetail(t) {
      var nameInp = ui.Input({ value: t.label });
      nameInp.addEventListener("input", function () { t.label = nameInp.value; });
      var body = el("div", { class: "u-col u-gap-3" }, ui.Field("Nome da página", nameInp));
      var setHomeBtn = ui.Button({
        label: homeKey === t.key ? "✓ É a página inicial" : "Definir como página inicial",
        icon: "home", block: true, variant: homeKey === t.key ? "primary" : "outline",
        onClick: function () { if (!t.on) { t.on = true; } homeKey = t.key; ensureHomeValid(); paintPages(); ref.close(); }
      });
      body.appendChild(setHomeBtn);
      var picker = null;
      if (t.custom) {
        picker = feedPicker(t.feeds || []);
        body.appendChild(el("div", { class: "settings-block__title", style: { marginTop: "var(--s-2)", fontSize: "var(--fs-md)" } }, "Feeds desta página"));
        body.appendChild(el("p", { class: "section-sub" }, "Tipos de conteúdo exibidos nesta página."));
        body.appendChild(picker.node);
      }
      function commit() { if (picker) t.feeds = picker.getSelected(); }
      var actions = [ui.Button({ label: "Concluir", variant: "ghost", onClick: function () { commit(); paintPages(); ref.close(); } })];
      if (t.custom) actions.unshift(ui.Button({ label: "Excluir página", icon: "trash", variant: "danger", onClick: function () {
        var i = pagesState.indexOf(t); if (i >= 0) pagesState.splice(i, 1);
        if (homeKey === t.key) homeKey = (pagesState[0] && pagesState[0].key) || "featured";
        paintPages(); ref.close();
      } }));
      var ref = ui.openModal({ title: "Configurar página", scrimClass: "scrim--centered", body: body, actions: actions });
    }

    // ---- lista de páginas (arrastável pela alça) ----
    var pagesHost = el("div", { class: "pagecfg" });
    function paintPages() {
      App.util.clear(pagesHost);
      var shown = pagesState.filter(function (t) { return t.on; });   // só páginas ATIVAS aparecem
      shown.forEach(function (t) {
        var canToggle = !isCore(t.key); // padrão é fixa; só feed/custom desliga
        var row = el("div", { class: "pagecfg__row" },
          el("span", { class: "pagecfg__handle", title: "Arraste para reordenar" }),
          el("span", { class: "pagecfg__label u-truncate" }, t.label),
          el("div", { class: "u-grow" }),
          homeKey === t.key ? el("span", { class: "pagecfg__home" }, "Inicial") : null,
          canToggle ? ui.Switch(true, function (v) { if (!v) { t.on = false; ensureHomeValid(); paintPages(); } }) // desligar = remover da lista
                    : el("span", { class: "pagecfg__fixed", title: "Página padrão" }, App.icon("lock", { size: "sm" })),
          el("span", { class: "pagecfg__chev" }, App.icon("forward", { size: "sm" })));
        row.addEventListener("click", function (e) {
          if (e.target.closest(".pagecfg__handle") || e.target.closest(".switch") || pagesHost._dragged) return;
          openPageDetail(t);
        });
        pagesHost.appendChild(row);
      });
      if (!shown.length) pagesHost.appendChild(el("p", { class: "section-sub", style: { padding: "var(--s-3)" } }, "Nenhuma página ativa. Use \"Nova página\" para adicionar."));
    }
    paintPages();

    // reordenar via ponteiro (toque/mouse) na alça — commit no soltar
    pagesHost.addEventListener("pointerdown", function (e) {
      var handle = e.target.closest && e.target.closest(".pagecfg__handle");
      if (!handle) return;
      var row = handle.closest(".pagecfg__row");
      if (!row) return;
      e.preventDefault();
      var rows = App.util.qsa(".pagecfg__row", pagesHost);
      var from = rows.indexOf(row);
      var step = rows.length > 1 ? (rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top) : (row.offsetHeight + 8);
      var startY = e.clientY, to = from, moved = false;
      row.classList.add("is-dragging");
      pagesHost._dragged = false;
      function move(ev) {
        var dy = ev.clientY - startY;
        if (Math.abs(dy) > 4) moved = true;
        row.style.transform = "translateY(" + dy + "px)";
        to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / step)));
      }
      function up() {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        row.classList.remove("is-dragging");
        row.style.transform = "";
        if (to !== from) {
          // índices das linhas são da lista VISÍVEL (ligadas); mapeia p/ pagesState
          var onPages = pagesState.filter(function (p) { return p.on; });
          var moving = onPages[from], target = onPages[to];
          if (moving && target) {
            pagesState.splice(pagesState.indexOf(moving), 1);
            var ti = pagesState.indexOf(target);
            pagesState.splice(to > from ? ti + 1 : ti, 0, moving);
          }
        }
        if (moved) { pagesHost._dragged = true; setTimeout(function () { pagesHost._dragged = false; }, 60); }
        paintPages();
      }
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });

    var novaBtn = el("button", { class: "pagecfg__new", type: "button" },
      el("span", "Adicionar página"), App.icon("plus"));
    novaBtn.addEventListener("click", function () {
      var body = el("div", { class: "u-col u-gap-3" });
      // páginas DISPONÍVEIS (desligadas) → toque para adicionar de volta à lista
      var offPages = pagesState.filter(function (t) { return !t.on; });
      if (offPages.length) {
        body.appendChild(el("p", { class: "section-sub" }, "Páginas disponíveis. Toque para adicionar à comunidade."));
        var avail = el("div", { class: "pagecfg" });
        offPages.forEach(function (t) {
          var r = el("button", { class: "pagecfg__row pagecfg__row--add", type: "button" },
            el("span", { class: "pagecfg__label u-grow u-truncate" }, t.label),
            App.icon("plus", { cls: "u-muted" }));
          r.addEventListener("click", function () { t.on = true; paintPages(); ref.close(); ui.toast(t.label + " adicionada", "ok"); });
          avail.appendChild(r);
        });
        body.appendChild(avail);
      } else {
        body.appendChild(ui.Empty("info", "Tudo adicionado", "Todas as páginas já estão ativas."));
      }
      var ref = ui.openModal({ title: "Adicionar página", scrimClass: "scrim--full", body: body, actions: [
        ui.Button({ label: "Fechar", variant: "primary", onClick: function () { ref.close(); } })
      ] });
    });

    function savePages() {
      // settings é substituído inteiro no backend → mescla p/ não perder outras chaves
      var newSettings = Object.assign({}, community.settings || {}, {
        tabs: pagesState.map(function (t) { var o = { key: t.key, label: (t.label || "").trim() || t.key, on: !!t.on, custom: !!t.custom }; if (t.custom) o.feeds = t.feeds || []; return o; }),
        home: homeKey
      });
      App.repo.updateCommunity(id, { settings: newSettings }).then(function () { ui.toast("Páginas atualizadas", "ok"); });
    }

    var tabsBlockCfg = el("section", { class: "card settings-block", id: "c-abas" },
      el("div", { class: "settings-block__title" }, "Páginas"),
      el("p", { class: "section-sub" }, "Cada feed (Posts, Imagens, Wikis…) é uma página separada. Ligue/desligue no interruptor, arraste pela alça para reordenar, toque para renomear ou definir como inicial."),
      pagesHost,
      novaBtn,
      ui.Button({ label: "Salvar páginas", variant: "primary", block: true, onClick: savePages }));

    // ---- Equipe e cargos: escolher pessoa -> convite cai nas MINHAS notificações ----
    var me = App.store.get("currentUserId");
    var ROLE_LABELS = { owner: "Dono", admin: "Líder", lider: "Líder", curador: "Curador", mod: "Mod", member: "Membro" };
    var INVITE_ROLES = [{ v: "lider", label: "Líder" }, { v: "curador", label: "Curador" }, { v: "mod", label: "Mod" }, { v: "member", label: "Membro (remover cargo)" }];
    var teamHost = el("div", { class: "u-col u-gap-2" }, el("div", { class: "skeleton", style: { height: "52px" } }));
    var allOthers = [];
    var teamSearch = ui.Input({ placeholder: "Buscar membro..." });
    var teamList = el("div", { class: "u-col u-gap-2" });
    function roleBtnFor(u, m, nm) {
      return ui.Button({ label: "Atribuir cargo", size: "sm", variant: "outline", icon: "shield", onClick: function (e) {
        var items = INVITE_ROLES.map(function (r) {
          return { icon: r.v === "member" ? "close" : "crown", label: r.label, onClick: function () {
            App.repo.addNotification({
              userId: me, cat: "invite", type: "roleInvite", icon: "crown",
              title: "Tornar " + nm + " " + r.label.replace(" (remover cargo)", "") + "?",
              sub: "Toque em Aceitar ou Recusar",
              payload: { communityId: id, targetUserId: u.id, targetName: nm, role: r.v }
            }).then(function () { ui.toast("Convite enviado às suas notificações", "ok"); });
          } };
        });
        if (isOwner) items.push({ sep: true }, { icon: "crown", iconFill: true, danger: true, label: "Transferir propriedade", onClick: function () {
          ui.confirm({ title: "Transferir propriedade para " + nm + "?", message: "Você deixa de ser Dono e vira Líder. " + nm + " passa a ter controle TOTAL da comunidade. Só o novo dono pode te devolver.", confirmLabel: "Transferir", danger: true })
            .then(function (ok) {
              if (!ok) return;
              App.repo.setRole(id, u.id, "owner").then(function () { return App.repo.setRole(id, me, "lider"); })
                .then(function () { ui.toast("Propriedade transferida para " + nm, "ok"); App.router.resolve(); })
                .catch(function (e2) { ui.toast((e2 && e2.message) || "Falha ao transferir", "danger"); });
            });
        } });
        App.ui.openMenu(e.currentTarget, items);
      } });
    }
    function renderTeam() {
      App.util.clear(teamList);
      var q = (teamSearch.value || "").trim().toLowerCase();
      var rows = allOthers.filter(function (x) {
        var nm = (x.membership.nickname || x.user.name || "").toLowerCase();
        return !q || nm.indexOf(q) >= 0 || (x.user.handle || "").toLowerCase().indexOf(q) >= 0;
      });
      if (!rows.length) { teamList.appendChild(el("p", { class: "section-sub" }, q ? "Ninguém encontrado." : "Sem outros membros para gerir.")); return; }
      rows.forEach(function (x) {
        var u = x.user, m = x.membership, nm = m.nickname || u.name;
        var modBtn = ui.Button({ label: "Moderar", size: "sm", variant: "ghost", icon: "ban", onClick: function () {
          if (C.openModerationDialog) C.openModerationDialog(id, { user: u, membership: m }, function () { App.router.resolve(); });
          else ui.toast("Moderação indisponível", "danger");
        } });
        teamList.appendChild(el("div", { class: "settings-row team-row" },
          el("a", { class: "u-row u-gap-2 team-row__user", style: { alignItems: "center" }, href: "#/c/" + id + "/u/" + u.id },
            ui.Avatar({ name: nm, src: m.avatar || u.avatar, round: true, size: "sm" }),
            el("div", null,
              el("div", { class: "settings-row__label" }, nm),
              el("div", { class: "settings-row__desc" }, ROLE_LABELS[m.role] || "Membro"))),
          el("div", { class: "u-row u-gap-2 team-row__acts" }, roleBtnFor(u, m, nm), modBtn)));
      });
    }
    teamSearch.addEventListener("input", App.util.debounce(renderTeam, 150));
    App.repo.listMembers(id).then(function (list) {
      App.util.clear(teamHost);
      allOthers = list.filter(function (x) { return x.membership.role !== "owner"; });
      teamHost.appendChild(el("div", { class: "team-searchbar" }, App.icon("search", { size: "sm" }), teamSearch));
      teamHost.appendChild(teamList);
      renderTeam();
    });
    var teamBlock = el("section", { class: "card settings-block", id: "c-equipe" },
      teamHost);

    var dangerBlock = isOwner ? el("section", { class: "card settings-block danger-zone", id: "c-danger" },
      el("div", { class: "settings-block__title" }, "Zona de perigo"),
      el("div", { class: "settings-row" },
        el("div", null, el("div", { class: "settings-row__label" }, "Excluir comunidade"), el("div", { class: "settings-row__desc" }, "Remove a comunidade, chats e publicações.")),
        ui.Button({ label: "Excluir", icon: "trash", variant: "danger", onClick: function () {
          ui.confirm({ title: "Excluir comunidade", message: "Esta ação não pode ser desfeita. Excluir \"" + community.name + "\"?", confirmLabel: "Excluir", danger: true })
            .then(function (ok) { if (ok) App.repo.deleteCommunity(id).then(function () { ui.toast("Comunidade excluída"); App.router.navigate("/sanguao"); }); });
        } }))) : null;

    // mapa de seções (cada uma abre em tela própria via /c/:id/admin/:section)
    return {
      visao: infoBlock,
      identidade: identityBlock,
      regras: rulesBlock,
      paginas: tabsBlockCfg,
      links: linkBlock,
      equipe: teamBlock,
      perigo: dangerBlock
    };
  }

  /* metadados das seções de admin (ordem + ícone + rota). customizar tem tela própria. */
  var ADMIN_SECTIONS = [
    { key: "identidade", label: "Identidade", icon: "edit", sub: "Nome, descrição e tags", size: "full" },
    { key: "customizar", label: "Customização", icon: "palette", sub: "Cor, ícone, fundo e painel", route: "customizar", size: "half" },
    { key: "paginas", label: "Páginas", icon: "menu", sub: "Abas e feeds da comunidade", size: "half" },
    { key: "regras", label: "Regras", icon: "shield", sub: "Visibilidade, entrada e posts", size: "full" },
    { key: "links", label: "Convites", icon: "globe", sub: "Links de convite", size: "half" },
    { key: "equipe", label: "Equipe e cargos", icon: "members", sub: "Atribuir cargos a membros", size: "half" },
    { key: "visao", label: "Visão geral", icon: "info", sub: "Estatísticas da comunidade", size: "full" },
    { key: "perigo", label: "Zona de perigo", icon: "trash", sub: "Excluir comunidade", danger: true, ownerOnly: true, size: "full" }
  ];

  /* ================= Configuração de COMUNIDADE (membro) =================
     Todo mundo vê as preferências de MEMBRO. Mod/dono ganham uma barra
     "Administração" que abre a tela cheia de admin (/c/:id/admin). */
  function renderCommunity(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var id = ctx.params.id;

    Promise.all([App.repo.getCommunity(id), App.repo.canModerate(id), App.repo.getMembership(id), App.repo.getCurrentUser()])
      .then(function (r) {
        var community = r[0], canMod = r[1], membership = r[2], me = r[3];
        if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
        var accent = (community.theme && community.theme.accent) || App.store.get("accent");

        var header = el("div", { class: "cset-header" },
          ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate("/c/" + id); } }),
          el("div", { class: "u-grow" },
            el("div", { class: "cset-header__title" }, "Configurações"),
            el("div", { class: "cset-header__sub u-truncate" }, community.name)));

        // barra Administração (só mod/dono) → tela cheia de administração
        var adminBar = canMod ? el("button", { class: "admin-bar", type: "button", onClick: function () { App.router.navigate("/c/" + id + "/admin"); } },
          el("span", { class: "admin-bar__icon" }, App.icon("shield", { size: "sm", fill: true })),
          el("div", { class: "u-grow" },
            el("div", { class: "admin-bar__title" }, "Administração"),
            el("div", { class: "admin-bar__sub" }, "Páginas, identidade, regras, equipe e mais")),
          App.icon("forward", { cls: "admin-bar__chev" })) : null;

        var page = el("div", { class: "cset" }, header,
          el("div", { class: "cset-body" }, adminBar, userArea(community, membership, me)));
        page.style.setProperty("--accent", accent);
        page.style.setProperty("--accent-soft", App.store.color.hexA(accent, 0.16));
        page.style.setProperty("--on-accent", "#fff");
        App.util.mount(inner, page);
      });

    return { node: inner, active: "sanguao", title: "Configurar comunidade", communityId: id, immersive: true, flush: true };
  }

  // header padrão das telas cheias de config
  function csetHeader(title, sub, backTo, badgeIcon) {
    return el("div", { class: "cset-header" },
      ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate(backTo); } }),
      el("div", { class: "u-grow" },
        el("div", { class: "cset-header__title" }, title),
        el("div", { class: "cset-header__sub u-truncate" }, sub)),
      badgeIcon ? el("span", { class: "admin-badge" }, App.icon(badgeIcon, { size: "sm", fill: true })) : null);
  }
  function csetVars(page, accent) {
    page.style.setProperty("--accent", accent);
    page.style.setProperty("--accent-soft", App.store.color.hexA(accent, 0.16));
    page.style.setProperty("--on-accent", "#fff");
    return page;
  }

  /* ================= ADMINISTRAÇÃO (lista de seções, só mod/dono) ================= */
  function renderAdmin(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var id = ctx.params.id;

    Promise.all([App.repo.getCommunity(id), App.repo.canModerate(id), App.repo.getMembership(id)])
      .then(function (r) {
        var community = r[0], canMod = r[1], membership = r[2];
        if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
        if (!canMod) { App.router.navigate("/c/" + id + "/config"); return; }
        var isOwner = membership && membership.role === "owner";
        var accent = (community.theme && community.theme.accent) || App.store.get("accent");

        var list = el("div", { class: "bento" });
        list.appendChild(el("div", { class: "bento__lbl" }, "Seções"));
        ADMIN_SECTIONS.forEach(function (s) {
          if (s.ownerOnly && !isOwner) return;
          var full = s.size === "full";
          var go = function () { App.router.navigate(s.route ? ("/c/" + id + "/" + s.route) : ("/c/" + id + "/admin/" + s.key)); };
          var ic = el("span", { class: "bento-card__ic" }, App.icon(s.icon, { size: full ? "sm" : "lg" }));
          var txt = el("span", { class: "bento-card__txt" },
            el("span", { class: "bento-card__label" }, s.label),
            el("span", { class: "bento-card__sub" }, s.sub));
          var card;
          if (full) {
            card = el("button", { class: "bento-card bento-card--full" + (s.danger ? " is-danger" : ""), type: "button", onClick: go },
              ic, txt, App.icon("forward", { cls: "bento-card__chev" }));
          } else {
            card = el("button", { class: "bento-card bento-card--half" + (s.danger ? " is-danger" : ""), type: "button", onClick: go },
              el("span", { class: "bento-card__top" }, ic, App.icon("forward", { cls: "bento-card__chev" })),
              txt);
          }
          list.appendChild(card);
        });

        var page = csetVars(el("div", { class: "cset" }, csetHeader("Administração", community.name, "/c/" + id + "/config", "shield"), el("div", { class: "cset-body" }, list)), accent);
        App.util.mount(inner, page);
      });

    return { node: inner, active: "sanguao", title: "Administração", communityId: id, immersive: true, flush: true };
  }

  /* ================= SEÇÃO de admin em tela própria ================= */
  function renderAdminSection(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var id = ctx.params.id, sec = ctx.params.section;
    var meta = ADMIN_SECTIONS.filter(function (s) { return s.key === sec; })[0];

    Promise.all([App.repo.getCommunity(id), App.repo.canModerate(id), App.repo.getMembership(id)])
      .then(function (r) {
        var community = r[0], canMod = r[1], membership = r[2];
        if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
        if (!canMod) { App.router.navigate("/c/" + id + "/config"); return; }
        var accent = (community.theme && community.theme.accent) || App.store.get("accent");
        var node = adminArea(community, membership)[sec] || ui.Empty("info", "Seção não encontrada");
        // remove o título interno quando ele só repete o nome do header (todas as seções)
        if (meta && node.querySelector) { var t = node.querySelector(".settings-block__title"); if (t && t.textContent.trim() === meta.label) t.remove(); }
        var page = csetVars(el("div", { class: "cset" }, csetHeader((meta && meta.label) || "Seção", community.name, "/c/" + id + "/admin", null), el("div", { class: "cset-body" }, el("div", { class: "settings-section" }, node))), accent);
        App.util.mount(inner, page);
      });

    return { node: inner, active: "sanguao", title: (meta && meta.label) || "Administração", communityId: id, immersive: true, flush: true };
  }

  /* ---- Área CUSTOMIZAÇÃO: cor de destaque + imagens (ícone/fundo/painel) ---- */
  function customizeArea(community) {
    var id = community.id;
    var icon = C.ImagePicker({ value: community.icon, aspect: 1, outW: 512, hint: "Ícone (quadrado 1:1). Enquadre no quadro." });
    var cover = C.ImagePicker({ value: community.cover, aspect: 16 / 9, outW: 1280, hint: "Fundo/banner (paisagem 16:9)." });
    var _panelCfg = community.settings.panel || {};
    var panelImg = C.ImagePicker({ value: _panelCfg.image || "", aspect: 9 / 16, outW: 1080, hint: "Painel lateral (vertical 9:16). Sem imagem = usa a cor do tema." });

    var swEl = swatches(community.theme && community.theme.accent, function (hex) {
      App.repo.updateCommunity(id, { theme: { accent: hex } }).then(function () { ui.toast("Cor aplicada", "ok"); App.router.resolve(); });
    });
    swEl.classList.add("cust-swatches");
    var colorBlock = el("section", { class: "card settings-block cust-block" },
      el("div", { class: "settings-block__title" }, "Cor de destaque"),
      el("p", { class: "section-sub" }, "Acento desta comunidade (independente do tema global)."),
      swEl);

    var imagesBlock = el("section", { class: "card settings-block cust-block" },
      el("div", { class: "settings-block__title" }, "Imagens"),
      el("p", { class: "section-sub" }, "Cada uma com enquadrador na proporção certa." ),
      el("div", { class: "cust-imgs" },                       // 3 containers na mesma linha, mesmo formato
        ui.Field("Ícone", icon.node),
        ui.Field("Fundo", cover.node),
        ui.Field("Painel", panelImg.node)),
      ui.Button({ label: "Salvar imagens", variant: "primary", block: true, onClick: function () {
        // painel: tem imagem → modo imagem; sem imagem → cor do tema (automático)
        var pimg = panelImg.getValue() || "";
        App.repo.updateCommunity(id, {
          icon: icon.getValue(), cover: cover.getValue(),
          settings: Object.assign({}, community.settings || {}, { panel: { mode: pimg ? "image" : "theme", image: pimg } })
        }).then(function () { ui.toast("Imagens salvas", "ok"); App.router.resolve(); });
      } }));

    return el("div", { class: "settings-section" }, [colorBlock, imagesBlock]);
  }

  /* ================= CUSTOMIZAÇÃO (tela cheia, só mod/dono) ================= */
  function renderCustomize(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var id = ctx.params.id;

    Promise.all([App.repo.getCommunity(id), App.repo.canModerate(id)])
      .then(function (r) {
        var community = r[0], canMod = r[1];
        if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
        if (!canMod) { App.router.navigate("/c/" + id + "/config"); return; }
        var accent = (community.theme && community.theme.accent) || App.store.get("accent");

        var header = el("div", { class: "cset-header" },
          ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate("/c/" + id + "/admin"); } }),
          el("div", { class: "u-grow" },
            el("div", { class: "cset-header__title" }, "Customização"),
            el("div", { class: "cset-header__sub u-truncate" }, community.name)),
          el("span", { class: "admin-badge" }, App.icon("palette", { size: "sm", fill: true })));

        var page = el("div", { class: "cset" }, header, el("div", { class: "cset-body" }, customizeArea(community)));
        page.style.setProperty("--accent", accent);
        page.style.setProperty("--accent-soft", App.store.color.hexA(accent, 0.16));
        page.style.setProperty("--on-accent", "#fff");
        App.util.mount(inner, page);
      });

    return { node: inner, active: "sanguao", title: "Customização", communityId: id, immersive: true, flush: true };
  }

  App.screens.settingsGlobal = renderGlobal;
  App.screens.settingsCommunity = renderCommunity;
  App.screens.settingsAdmin = renderAdmin;
  App.screens.settingsAdminSection = renderAdminSection;
  App.screens.settingsCustomize = renderCustomize;
})(window.App = window.App || {});
