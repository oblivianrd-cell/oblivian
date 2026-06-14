/* ============================================================
   screens/profile.js — Perfis.
   GLOBAL  (/perfil ou /u/:id): conta principal do Oblivian.
   COMUNIDADE (/c/:id/u/:userId): perfil independente por comunidade.
   Inclui diálogos de edição e modal de seguidores/seguindo.
   Namespace: App.screens.profileGlobal / profileCommunity
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  /* cor clara? (luminância) — define texto escuro vs claro sobre o painel */
  function isLight(hex) {
    if (!hex) return false;
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (x) { return x + x; }).join("");
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
  }


  /* presença determinística por usuário (demo) — viés p/ online, sem offline fixo */
  function presenceFor(u, PRESENCE) {
    var id = (u && u.id) || "";
    var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var keys = ["online", "online", "ausente", "online", "ocupado", "ausente"];
    return PRESENCE[keys[h % keys.length]] || PRESENCE.online;
  }

  /* Seletor de cor geral do app (componente compartilhado) */
  function colorPicker(initial) { return App.components.ColorPicker(initial); }

  /* editor de cor por elemento do perfil (Nome, @, Bio, Seguidores...) */
  var TEXT_PARTS = [
    { key: "name", label: "Nome" },
    { key: "handle", label: "@usuário" },
    { key: "bio", label: "Bio" },
    { key: "since", label: "Membro desde" },
    { key: "rep", label: "Reputação" },
    { key: "following", label: "Seguindo" },
    { key: "followers", label: "Seguidores" }
  ];
  // UNIFICADO: uma única cor para TODOS os textos do perfil.
  function textColorEditor(initial) {
    var init = initial || {};
    var cur = "";
    // só considera as partes de texto conhecidas (ignora chaves reservadas: "t:<tag>", "__fit", "__pos")
    TEXT_PARTS.forEach(function (p) { if (!cur && init[p.key]) cur = init[p.key]; });
    var host = el("div", { class: "textcolors" });
    var swatch = el("button", { class: "textcolors__sw" + (cur ? " is-set" : ""), type: "button", title: "Escolher cor" });
    swatch.style.background = cur || "";
    swatch.addEventListener("click", function () {
      ui.pickColor(cur || "#ffffff", function (hex) {
        cur = hex || ""; swatch.style.background = cur; swatch.classList.toggle("is-set", !!cur);
      }, { title: "Cor dos textos", allowClear: true });
    });
    var clr = el("button", { class: "textcolors__clear", type: "button", title: "Padrão" }, App.icon("close", { size: "sm" }));
    clr.addEventListener("click", function () { cur = ""; swatch.style.background = ""; swatch.classList.remove("is-set"); });
    host.appendChild(el("div", { class: "textcolors__row" },
      el("span", { class: "textcolors__label u-grow" }, "Todos os textos"),
      swatch, clr));
    return { node: host, getValue: function () {
      var out = {}; if (cur) TEXT_PARTS.forEach(function (p) { out[p.key] = cur; });   // mesma cor em todos
      return out;
    } };
  }

  /* badge flutuante de modo prévia (canto) — clica p/ fechar e voltar a editar */
  function previewBadge(onExit) {
    var b = el("button", { class: "preview-badge", type: "button", title: "Fechar pré-visualização" },
      App.icon("eye", { size: "sm", cls: "preview-badge__eye" }),
      el("span", "Fechar pré-visualização"));
    b.addEventListener("click", onExit);
    return b;
  }

  /* -------- Modal seguidores / seguindo -------- */
  function listModal(title, usersPromise) {
    var body = el("div", { class: "u-col u-gap-2" }, el("div", { class: "skeleton", style: { height: "48px" } }));
    var ref = ui.openModal({ title: title, body: body });
    usersPromise.then(function (users) {
      App.util.clear(body);
      if (!users.length) { body.appendChild(ui.Empty("profile", "Ninguém por aqui")); return; }
      var me = App.store.get("currentUserId");
      users.forEach(function (u) {
        var row = el("a", { class: "list-item", href: "#/u/" + u.id, onClick: function () { ref.close(); } },
          ui.Avatar({ name: u.name, src: u.avatar, round: true }),
          el("div", { class: "list-item__body" },
            el("div", { class: "list-item__title" }, u.name),
            el("div", { class: "list-item__sub" }, "@" + u.handle)));
        if (u.id !== me) {
          App.repo.isFollowing(u.id).then(function (f) {
            row.appendChild(ui.Button({ label: f ? "Seguindo" : "Seguir", size: "sm", variant: f ? "outline" : "primary",
              onClick: function (e) { e.preventDefault(); var fn = f ? "unfollow" : "follow"; App.repo[fn](u.id).then(function () { ref.close(); App.router.resolve(); }); } }));
          });
        }
        body.appendChild(row);
      });
    });
  }

  /* -------- Edição: perfil GLOBAL -------- */
  function editGlobal(user, onDone) {
    var name = ui.Input({ value: user.name, placeholder: "Seu nome", maxlength: ui.LIMITS.name });
    var handle = ui.Input({ value: user.handle, placeholder: "usuario", maxlength: ui.LIMITS.handle });
    var bio = ui.Textarea({ value: user.bio, placeholder: "Fale sobre você", maxlength: ui.LIMITS.bio });
    var bioCounter = ui.limitField(bio, ui.LIMITS.bio);
    var avatar = C.ImagePicker({ value: user.avatar, hint: "Avatar (quadrado)." });
    var cover = C.ImagePicker({ value: user.cover, hint: "Capa — imagem (opcional)." });
    var color = colorPicker(user.panelColor);
    var textColors = textColorEditor(user.textColors);

    var ref = ui.openModal({
      title: "Editar perfil global",
      body: el("div", { class: "u-col u-gap-4" },
        el("div", { class: "scope-banner" }, App.icon("profile", { size: "sm" }), "Conta principal do Oblivian — sem reputação ou tags"),
        ui.Field("Nome", name),
        ui.Field("Identificador", handle, "Aparece como @identificador"),
        ui.Field("Bio", bio, bioCounter),
        ui.Field("Avatar", avatar.node),
        ui.Field("Cor do perfil", color.node, "Recolore a capa e o fundo. A imagem da capa tem prioridade."),
        ui.Field("Cor dos textos", textColors.node, "Escolha a cor de cada parte do perfil."),
        ui.Field("Capa (imagem)", cover.node)),
      actions: [
        ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
        ui.Button({ label: "Salvar", variant: "primary", onClick: function () {
          App.repo.updateUser(user.id, {
            name: name.value.trim() || user.name,
            handle: (handle.value.trim() || user.handle).replace(/^@/, "").replace(/\s+/g, ""),
            bio: bio.value.trim(),
            avatar: avatar.getValue(), cover: cover.getValue(), panelColor: color.getValue(),
            textColors: Object.assign({}, user.textColors || {}, textColors.getValue())   // preserva chaves reservadas (capa fit/pos)
          }).then(function () { ui.toast("Perfil atualizado", "ok"); ref.close(); onDone && onDone(); });
        } })
      ]
    });
  }

  /* -------- Menu do "..." (ancorado ao botão) -------- */
  /* modal de editar tags com efeito vidro (todas as tags + adicionar) */
  function editTagsModal(community, membership, user, onDone) {
    // cores iniciais a partir das chaves "t:<tag>" do textColors do membro
    var baseTC = Object.assign({}, membership.textColors || {});
    var initColors = {};
    (membership.tags || []).forEach(function (t) { if (baseTC["t:" + t]) initColors[t] = baseTC["t:" + t]; });
    var ed = C.TagEditor({
      value: membership.tags || [], placeholder: "Novo título (máx 20)", colors: initColors,
      fullscreen: true,
      sectionTitle: "Títulos deste Membro",
      addLabel: "Adicionar um Novo Título",
      catalogTitle: "Todos os Títulos Criados"
    });

    // ---- overlay tela cheia próprio (header: X · título · Salvar) ----
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      document.removeEventListener("keydown", onKey);
      scrim.classList.add("is-closing");
      setTimeout(function () { if (scrim.parentNode) scrim.remove(); }, 180);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    function save() {
      var newTags = ed.getValue(), newColors = ed.getColors();
      var merged = Object.assign({}, membership.textColors || {});
      Object.keys(merged).forEach(function (k) { if (k.indexOf("t:") === 0) delete merged[k]; });
      newTags.forEach(function (t) { if (newColors[t]) merged["t:" + t] = newColors[t]; });
      if (roleColorVal) merged.__role = roleColorVal; else delete merged.__role;   // cor própria do cargo
      App.repo.updateMembership(community.id, user.id, { tags: newTags, textColors: merged })
        .then(function () { ui.toast("Títulos atualizados", "ok"); close(); onDone && onDone(); })
        .catch(function (e) { ui.toast((e && e.message) || "Falha ao salvar", "danger"); });
    }

    var saveBtn = el("button", { class: "tagfs-top__save", type: "button", onClick: save }, "Salvar");
    var top = el("div", { class: "tagfs-top" },
      el("button", { class: "tagfs-top__x", type: "button", title: "Fechar", onClick: close }, App.icon("close")),
      el("div", { class: "tagfs-top__title" }, "Editar Títulos"),
      saveBtn);
    var av = ui.Avatar({ name: membership.nickname || user.name, src: (membership.avatar || user.avatar), round: true });
    var roleTag = App.profileMeta.roleTag && App.profileMeta.roleTag(membership.role);
    var roleColorVal = (membership.textColors && membership.textColors.__role) || "";   // cor própria do cargo
    var roleEl = null;
    if (roleTag) {
      roleEl = el("span", { class: "level-chip tagfs-role", title: "Tocar para mudar a cor do cargo" },
        App.icon(roleTag.icon, { size: "sm", fill: true }), roleTag.label);
      if (roleColorVal) roleEl.style.background = roleColorVal;
      roleEl.addEventListener("click", function () {
        ui.pickColor(roleColorVal || "", function (hex) {
          roleColorVal = hex || "";
          roleEl.style.background = roleColorVal || "var(--accent)";
        }, { title: "Cor do cargo", allowClear: true });
      });
    }
    var avatarBlock = el("div", { class: "tagfs-av" },
      av,
      el("div", { class: "tagfs-av__name" }, membership.nickname || user.name),
      roleEl);
    var screen = el("div", { class: "tagfs-screen" }, top, avatarBlock, el("div", { class: "tagfs-body" }, ed.node));
    var scrim = el("div", { class: "scrim scrim--full tagfs-scrim" }, screen);
    document.body.appendChild(scrim);
    document.addEventListener("keydown", onKey);

    // registro da comunidade: união das tags de todos os membros (nome + cor)
    App.repo.listMembers(community.id).then(function (list) {
      var seen = {}, catalog = [];
      (list || []).forEach(function (it) {
        var m = it.membership; if (!m) return;
        (m.tags || []).forEach(function (t) {
          var c = (m.textColors && m.textColors["t:" + t]) || "";
          if (!(t in seen)) { seen[t] = c; catalog.push({ name: t, color: c }); }
          else if (!seen[t] && c) { seen[t] = c; catalog.forEach(function (e) { if (e.name === t) e.color = c; }); }
        });
      });
      catalog.sort(function (a, b) { return a.name.localeCompare(b.name); });
      ed.setSuggestions(catalog);
    }).catch(function () {});
  }

  function profileMenu(user, isMe, anchor, opts) {
    opts = opts || {};
    var community = opts.community, membership = opts.membership, canMod = opts.canMod;
    var url = location.origin + location.pathname + "#/u/" + user.id;
    var items = [
      { icon: "globe", label: "Copiar link", onClick: function () {
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { ui.toast("Link copiado", "ok"); }, function () { ui.toast(url); });
        else ui.toast(url);
      } },
      { icon: "send", label: "Compartilhar", onClick: function () {
        if (navigator.share) navigator.share({ title: user.name, url: url }).catch(function () {});
        else ui.toast("Compartilhar: " + url);
      } }
    ];

    // moderação (comunidade, mod, não é o próprio, não é dono)
    if (community && membership && canMod && !isMe && membership.role !== "owner") {
      items.push({ sep: true });
      items.push({ icon: "shield", label: "Moderar...", onClick: function () {
        C.openModerationDialog(community.id, { user: user, membership: membership }, function () { App.router.resolve(); });
      } });
      items.push({ icon: "ban", label: "Banir", danger: true, onClick: function () {
        ui.confirm({ title: "Banir " + user.name + "?", message: "Remove o acesso à comunidade.", confirmLabel: "Banir", danger: true })
          .then(function (ok) { if (ok) App.repo.moderate(community.id, user.id, { action: "ban", durationMs: null }).then(function () { ui.toast("Usuário banido", "danger"); App.router.resolve(); }).catch(function (e) { ui.toast(e.message, "danger"); }); });
      } });
      items.push({ icon: "hide", label: "Ocultar perfil", onClick: function () {
        App.repo.moderate(community.id, user.id, { action: "hide", durationMs: 7 * 86400000 }).then(function () { ui.toast("Perfil ocultado (7 dias)", "ok"); App.router.resolve(); }).catch(function (e) { ui.toast(e.message, "danger"); });
      } });
      items.push({ icon: "tag", label: "Editar tags", onClick: function () { editTagsModal(community, membership, user, function () { App.router.resolve(); }); } });
    }
    // editar minhas próprias tags na comunidade
    if (community && membership && isMe) {
      items.push({ sep: true });
      items.push({ icon: "tag", label: "Editar tags", onClick: function () { editTagsModal(community, membership, user, function () { App.router.resolve(); }); } });
    }

    if (!isMe) {
      items.push({ sep: true });
      items.push({ icon: "ban", label: "Denunciar usuário", danger: true, onClick: function () {
        ui.prompt({ title: "Denunciar " + user.name, label: "Motivo (opcional)", multiline: true, confirmLabel: "Enviar denúncia" }).then(function (val) {
          if (val == null) return;
          App.repo.reportContent("user", user.id, val, community ? community.id : null).then(function () { ui.toast("Denúncia enviada", "danger"); });
        });
      } });
      var blocked = App.repo.isBlocked && App.repo.isBlocked(user.id);
      items.push({ icon: "ban", label: blocked ? "Desbloquear usuário" : "Bloquear usuário", danger: !blocked, onClick: function () {
        if (blocked) { App.repo.unblockUser(user.id).then(function () { ui.toast("Usuário desbloqueado", "ok"); App.router.resolve(); }); return; }
        ui.confirm({ title: "Bloquear " + user.name + "?", message: "Vocês deixarão de se ver e interagir.", confirmLabel: "Bloquear", danger: true })
          .then(function (ok) { if (ok) App.repo.blockUser(user.id).then(function () { ui.toast("Usuário bloqueado", "danger"); App.router.resolve(); }).catch(function (e) { ui.toast(e.message, "danger"); }); });
      } });
    }
    if (anchor) ui.openMenu(anchor, items);
    else ui.openActionSheet(items, { title: user.name });
  }

  /* -------- Abas reutilizáveis (Posts / Wall / Bookmark) -------- */
  function tabsBlock(tabs, render) {
    var bar = el("div", { class: "profile-tabs" });
    var panel = el("div", { class: "profile-tabs__panel" });
    function select(i) {
      App.util.qsa(".profile-tabs__tab", bar).forEach(function (t, j) { t.classList.toggle("is-active", j === i); });
      App.util.mount(panel, render(tabs[i].key));
    }
    tabs.forEach(function (t, i) {
      var tab = el("button", { class: "profile-tabs__tab", type: "button" }, t.label + (t.count != null ? " " + t.count : ""));
      tab.addEventListener("click", function () { select(i); });
      bar.appendChild(tab);
    });
    var wrap = el("div", { class: "profile-tabs-wrap" }, bar, panel);
    select(0);
    return wrap;
  }

  function feedEmpty(msg) {
    return el("div", { class: "feed-empty" },
      App.icon("explorer", { cls: "feed-empty__planet" }),
      el("p", msg || "Nenhum item no feed."));
  }

  /* compositor da PRIMEIRA mensagem (DM). Ao enviar, cria a conversa e abre o bate-papo. */
  function firstMessageDialog(targetUser) {
    var ta = ui.Textarea({ placeholder: "Escreva uma mensagem para " + targetUser.name + "...", maxlength: ui.LIMITS.message });
    var to = el("div", { class: "firstmsg__to" },
      ui.Avatar({ name: targetUser.name, src: targetUser.avatar, round: true, size: "sm" }),
      el("div", { class: "u-grow" },
        el("strong", targetUser.name),
        el("div", { class: "u-muted", style: { fontSize: "var(--fs-xs)" } }, "@" + targetUser.handle)));
    var ref = ui.openModal({
      title: "Nova mensagem", scrimClass: "scrim--centered",
      body: el("div", { class: "firstmsg" }, to, ta),
      actions: [
        ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
        ui.Button({ label: "Enviar", icon: "send", variant: "primary", onClick: function () {
          var text = (ta.value || "").trim();
          if (!text) { ta.focus(); return; }
          App.repo.getOrCreateDirect(targetUser.id).then(function (c) {
            App.repo.sendMessage(c.id, text).then(function () {
              ref.close(); App.router.navigate("/chats/" + c.id);
            }).catch(function (e) { ui.toast(e.message || "Falha", "danger"); });
          }).catch(function (e) { ui.toast(e.message || "Falha", "danger"); });
        } })
      ]
    });
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 30);
  }
  /* abre conversa: se já existe DM com histórico, vai direto; senão pede a 1ª mensagem */
  function startConversation(targetUser) {
    App.repo.findDirect(targetUser.id).then(function (c) {
      if (c) {
        App.repo.listMessages(c.id).then(function (msgs) {
          if (msgs && msgs.length) App.router.navigate("/chats/" + c.id);
          else firstMessageDialog(targetUser);
        });
      } else firstMessageDialog(targetUser);
    }).catch(function (e) { ui.toast(e.message || "Falha", "danger"); });
  }

  /* painel de Nível + Conquistas (perfil de comunidade) */
  function achievementsPanel(communityId, userId, membership) {
    var host = el("div", { class: "u-col u-gap-4" });
    var lv = App.repo.levelInfo(membership.reputation || 0);
    var bar = el("div", { class: "lvl-card__track" }, el("div", { class: "lvl-card__fill", style: { width: lv.pct + "%" } }));
    host.appendChild(el("div", { class: "lvl-card" },
      el("div", { class: "lvl-card__badge" }, App.icon("star", { size: "lg", fill: true }), el("span", { class: "lvl-card__num" }, String(lv.level))),
      el("div", { class: "u-grow" },
        el("div", { class: "lvl-card__title" }, "Nível " + lv.level),
        el("div", { class: "lvl-card__sub" }, App.util.formatCount(lv.rep) + " de reputação · " + lv.into + "/" + lv.need + " p/ nível " + (lv.level + 1)),
        bar)));

    var grid = el("div", { class: "ach-grid" }, el("div", { class: "skeleton", style: { height: "72px" } }));
    host.appendChild(el("div", null, el("h3", { class: "section-title", style: { marginBottom: "var(--s-2)" } }, App.icon("crown"), "Conquistas"), grid));
    App.repo.listAchievements(communityId, userId).then(function (list) {
      App.util.clear(grid);
      list.forEach(function (a) {
        grid.appendChild(el("div", { class: "ach" + (a.earned ? " is-earned" : " is-locked"), title: a.desc },
          el("div", { class: "ach__icon" }, App.icon(a.earned ? a.icon : "lock", { size: "lg", fill: a.earned })),
          el("div", { class: "ach__label" }, a.label),
          el("div", { class: "ach__desc" }, a.desc)));
      });
    });
    return host;
  }

  /* ================= Perfil GLOBAL ================= */
  function renderGlobal(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var me = App.store.get("currentUserId");
    var userId = ctx.params.id || me;

    var preview = ctx.query && ctx.query.preview ? App.store.get("profilePreview") : null;
    if (preview && (preview.scope !== "global" || preview.userId !== userId)) preview = null;

    Promise.all([App.repo.getUser(userId), App.repo.isFollowing(userId)])
      .then(function (r) {
        var user = r[0], following = r[1];
        if (!user) { App.util.mount(inner, ui.Empty("profile", "Usuário não encontrado")); return; }
        if (preview) user = Object.assign({}, user, preview.fields);
        var isMe = !preview && user.id === me;   // em prévia, trata como visitante (sem editar)

        var PRESENCE = {
          online: { key: "online", label: "Online", color: "var(--ok)" },
          ausente: { key: "ausente", label: "Ausente", color: "var(--warn)" },
          ocupado: { key: "ocupado", label: "Ocupado", color: "var(--danger)" },
          invisivel: { key: "invisivel", label: "Invisível", color: "var(--text-mute)" }
        };
        var myStatus = isMe ? (PRESENCE[App.store.get("presence")] || PRESENCE.online)
                            : presenceFor(user, PRESENCE);

        var header = C.ProfileHeader({
          scope: "global", user: user, isMe: isMe, following: following, previewMode: !!preview,
          statusInfo: myStatus, visitors: 0, backHref: isMe ? "#/sanguao" : "#/explorer",
          onBack: preview ? function () { var b = (preview && preview.back) || "/perfil/editar"; App.store.set("profilePreview", null); App.router.navigate(b); } : null,
          backTitle: preview ? "Fechar pré-visualização" : null,
          onStatus: function (anchor) {
            ui.openMenu(anchor, Object.keys(PRESENCE).map(function (k) {
              var s = PRESENCE[k];
              return { icon: s.key === "invisivel" ? "hide" : "globe", label: s.label, onClick: function () {
                App.store.set("presence", k); ui.toast("Status: " + s.label, "ok"); App.router.resolve();
              } };
            }));
          },
          onEdit: function () { App.router.navigate("/perfil/editar"); },
          onToggleFollow: function (cur) { var fn = cur ? "unfollow" : "follow"; return App.repo[fn](user.id).then(function () { return !cur; }); },
          onFollowers: function () { listModal("Seguidores", App.repo.listFollowers(user.id)); },
          onFollowing: function () { listModal("Seguindo", App.repo.listFollowing(user.id)); },
          onComments: function () { App.router.navigate("/u/" + user.id + "/comentarios"); },
          onChat: function () { startConversation(user); },
          onMenu: function (anchor) { profileMenu(user, isMe, anchor); }
        });

        // painel "Salvos": posts que salvei (de qualquer comunidade)
        function savedPanel() {
          var host = el("div", { class: "profile-feed" });
          App.repo.listSaved().then(function (list) {
            App.util.clear(host);
            if (!list.length) { host.appendChild(feedEmpty("Nenhuma publicação salva")); return; }
            list.forEach(function (it) {
              var p = it.post, au = it.user;
              var row = el("button", { class: "saved-row", type: "button", onClick: function () { App.router.navigate("/c/" + p.communityId + "/p/" + p.id); } },
                el("div", { class: "saved-row__body" },
                  el("strong", { class: "u-truncate" }, p.title || (p.text || "").split("\n")[0].slice(0, 60) || "Publicação"),
                  el("div", { class: "u-muted", style: { fontSize: "var(--fs-xs)" } }, (au ? au.name : "?") + " · " + App.util.timeAgo(p.createdAt))),
                App.icon("forward", { cls: "u-muted" }));
              host.appendChild(row);
            });
          });
          return host;
        }
        // painel "Favoritos": comunidades favoritadas
        function favsPanel() {
          var host = el("div", { class: "profile-feed u-col u-gap-2" });
          App.repo.listFavoriteCommunities().then(function (list) {
            App.util.clear(host);
            if (!list.length) { host.appendChild(feedEmpty("Nenhuma comunidade favorita")); return; }
            list.forEach(function (c) { host.appendChild(C.CommunityCard(c)); });
          });
          return host;
        }
        // só o Mural (= mural de comentários). Barra própria: título + Recentes/Top à direita.
        var gWall = App.components.commentWall(user.id, null, { externalSort: true });
        var gMuralBar = el("div", { class: "mural-bar" },
          el("span", { class: "mural-bar__title" }, "Mural"),
          el("span", { class: "mural-bar__sort" }, gWall.sortControl));
        var content = el("div", { class: "profile-tabs-wrap" }, gMuralBar,
          el("div", { class: "profile-tabs__panel" }, gWall));

        var gscreen = el("div", { class: "profile-screen profile-screen--global" }, header, content);
        var gEnter = App.profileMeta.enter(user);
        if (gEnter && gEnter !== "none") gscreen.classList.add("pfx", "pfx-" + gEnter);
        if (user.panelColor) {
          gscreen.classList.add("has-panel-color");
          if (isLight(user.panelColor)) gscreen.classList.add("panel-light");
          gscreen.style.setProperty("--panel-bg", user.panelColor);
          gscreen.style.setProperty("--panel-accent", user.panelColor);
        }
        if (preview) {
          gscreen.classList.add("is-preview");
          App.util.mount(inner, gscreen);
          inner.appendChild(previewBadge(function () { var b = (preview && preview.back) || "/perfil/editar"; App.store.set("profilePreview", null); App.router.navigate(b); }));
        } else App.util.mount(inner, gscreen);
      });

    return { node: inner, active: ctx.params.id ? undefined : "profile", title: preview ? "Pré-visualização" : "Perfil", immersive: true };
  }

  /* ================= Perfil de COMUNIDADE ================= */
  function renderCommunity(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var communityId = ctx.params.id;
    var userId = ctx.params.userId;
    var me = App.store.get("currentUserId");

    var preview = ctx.query && ctx.query.preview ? App.store.get("profilePreview") : null;
    if (preview && (preview.scope !== "community" || preview.communityId !== communityId || preview.userId !== userId)) preview = null;

    Promise.all([
      App.repo.getCommunity(communityId), App.repo.getUser(userId),
      App.repo.getMembership(communityId, userId), App.repo.isFollowing(userId),
      App.repo.canModerate(communityId)
    ]).then(function (r) {
      var community = r[0], user = r[1], membership = r[2], following = r[3], canMod = r[4];
      if (!community || !user) { App.util.mount(inner, ui.Empty("info", "Perfil não encontrado")); return; }
      if (!membership) { App.util.mount(inner, ui.Empty("profile", user.name + " não participa desta comunidade")); return; }
      if (preview) membership = Object.assign({}, membership, preview.fields);
      var isMe = !preview && user.id === me;   // em prévia, trata como visitante

      // moderação vive no menu "..." (profileMenu) — sem botão de ação separado
      var extra = [];

      var PRESENCE = {
        online: { key: "online", label: "Online", color: "var(--ok)" },
        ausente: { key: "ausente", label: "Ausente", color: "var(--warn)" },
        ocupado: { key: "ocupado", label: "Ocupado", color: "var(--danger)" },
        invisivel: { key: "invisivel", label: "Invisível", color: "var(--text-mute)" }
      };
      var myStatus = isMe ? (PRESENCE[App.store.get("presence")] || PRESENCE.online)
                          : presenceFor(user, PRESENCE);

      var header = C.ProfileHeader({
        scope: "community", community: community, user: user, membership: membership,
        isMe: isMe, following: following, extraActions: extra, previewMode: !!preview,
        statusInfo: myStatus, visitors: 0, backHref: "#/c/" + community.id,
        onBack: preview
          ? function () { var b = (preview && preview.back) || ("/c/" + community.id + "/u/" + user.id + "/editar"); App.store.set("profilePreview", null); App.router.navigate(b); }
          : function () { App.router.back("/c/" + community.id + "/featured", /(\/u\/|\/perfil)/); },
        backIcon: preview ? "close" : "back",
        backTitle: preview ? "Fechar pré-visualização" : "Voltar",
        onStatus: function (anchor) {
          ui.openMenu(anchor, Object.keys(PRESENCE).map(function (k) {
            var s = PRESENCE[k];
            return { icon: s.key === "invisivel" ? "hide" : "globe", label: s.label, onClick: function () {
              App.store.set("presence", k); ui.toast("Status: " + s.label, "ok"); App.router.resolve();
            } };
          }));
        },
        onEdit: function () { App.router.navigate("/c/" + community.id + "/u/" + user.id + "/editar"); },
        onToggleFollow: function () { App.repo[following ? "unfollow" : "follow"](user.id).then(function () { App.router.resolve(); }); },
        onFollowers: function () { listModal("Seguidores", App.repo.listFollowers(user.id)); },
        onFollowing: function () { listModal("Seguindo", App.repo.listFollowing(user.id)); },
        onComments: function () { App.router.navigate("/c/" + community.id + "/u/" + user.id + "/comentarios"); },
        onChat: function () { startConversation(user); },
        onMenu: function (anchor) { profileMenu(user, isMe, anchor, { community: community, membership: membership, canMod: canMod }); }
      });

      var commTabs = [{ key: "posts", label: "Posts" }, { key: "conquistas", label: "Conquistas" }, { key: "wall", label: "Mural" }];
      var content = tabsBlock(commTabs, function (key) {
        if (key === "wall") return App.components.commentWall(user.id, community.id);   // mural = comentários
        var host = el("div", { class: "u-col u-gap-4", style: { padding: "var(--s-4)" } });
        if (key === "conquistas") { host.appendChild(achievementsPanel(community.id, user.id, membership)); return host; }
        App.repo.listPosts(community.id).then(function (items) {
          var mine = items.filter(function (x) { return x.post.userId === userId; });
          if (!mine.length) { host.appendChild(feedEmpty("Sem publicações aqui")); return; }
          var PR = App.postRender || {};
          mine.forEach(function (it) {
            var p = it.post;
            var likedP = p.likes.indexOf(me) >= 0;
            var likeP = ui.LikeButton({ count: p.likes.length, liked: likedP, onToggle: function () { return App.repo.toggleLikePost(p.id); } });
            var commentP = el("button", { class: "post__action", onClick: function (e) { e.stopPropagation(); App.router.navigate("/c/" + community.id + "/p/" + p.id); } }, App.icon("comment", { size: "sm" }), String(p.comments));
            host.appendChild(el("article", { class: "card post post-anim", style: { cursor: "pointer" }, onClick: function () { App.router.navigate("/c/" + community.id + "/p/" + p.id); } },
              el("div", { class: "post__head" },
                el("div", { class: "post__time" }, App.util.timeAgo(p.createdAt) + " atrás")),
              p.title ? el("div", { class: "post__title-strong" }, p.title) : null,
              PR.body ? PR.body(p) : el("div", { class: "post__body" }, p.text),
              el("div", { class: "post__actions" }, likeP, commentP)));
          });
        });
        return host;
      });

      var pscreen = el("div", { class: "profile-screen profile-screen--global" }, header, content);
      var pEnter = App.profileMeta.enter(membership);
      if (pEnter && pEnter !== "none") pscreen.classList.add("pfx", "pfx-" + pEnter);
      var ac = (community.theme && community.theme.accent) || App.store.get("accent");
      pscreen.style.setProperty("--c-base", ac);
      pscreen.style.setProperty("--c-tint", App.store.color.hexA(ac, 0.16));
      pscreen.style.setProperty("--c-line", App.store.color.shade(ac, -55));
      // cor do perfil escolhida: fundo de bio/posts = versão escura da cor (legível)
      if (membership.panelColor) {
        pscreen.classList.add("has-panel-color");
        if (isLight(membership.panelColor)) pscreen.classList.add("panel-light");
        pscreen.style.setProperty("--panel-bg", membership.panelColor);
        pscreen.style.setProperty("--panel-accent", membership.panelColor);
      }
      if (preview) {
        pscreen.classList.add("is-preview");
        App.util.mount(inner, pscreen);
        inner.appendChild(previewBadge(function () { var b = (preview && preview.back) || ("/c/" + community.id + "/u/" + user.id + "/editar"); App.store.set("profilePreview", null); App.router.navigate(b); }));
      } else App.util.mount(inner, pscreen);
    });

    return { node: inner, active: "sanguao", title: preview ? "Pré-visualização" : "Perfil na comunidade", communityId: communityId, immersive: true };
  }

  /* ================= Helpers compartilhados do editor ================= */
  var COVER_FX = [
    { key: "fade", label: "Esmaecer", icon: "image" },
    { key: "slide", label: "Deslizar", icon: "forward" },
    { key: "zoom", label: "Zoom", icon: "search" },
    { key: "dissolve", label: "Dissolver", icon: "star" },
    { key: "circle", label: "Circular", icon: "globe" },
    { key: "curtain", label: "Cortina", icon: "featured" },
    { key: "shutter", label: "Persiana", icon: "menu" },
    { key: "theater", label: "Cortinas", icon: "crown" },
    { key: "brush", label: "Pinceladas", icon: "edit" },
    { key: "loom", label: "Tear", icon: "shield" },
    { key: "zipper", label: "Zíper", icon: "send" }
  ];
  var COVER_SPEED = { slow: 5200, med: 3600, fast: 2200 };
  var COVER_SPEED_OPTS = [{ value: "slow", label: "Lenta" }, { value: "med", label: "Média" }, { value: "fast", label: "Rápida" }];

  /* Transição de ENTRADA do perfil (animação ao abrir o perfil) — guardada em
     textColors.__enter. Set curado das animações que importamos (yui540, MIT). */
  var ENTER_FX = [
    { key: "none", label: "Nenhuma", icon: "close" },
    { key: "fade", label: "Suave", icon: "image" },
    { key: "blur", label: "Desfoque", icon: "search" },
    { key: "rise", label: "Subir", icon: "forward" },
    { key: "curtain", label: "Cortina", icon: "featured" },
    { key: "pop", label: "Pop", icon: "star" },
    { key: "zoom", label: "Zoom", icon: "globe" }
  ];

  /* permissão p/ adicionar/remover títulos: Dono, Líder e Curador */
  var TAG_MANAGE_ROLES = ["owner", "admin", "lider", "curador"];
  function canManageTags(role) { return TAG_MANAGE_ROLES.indexOf(role) >= 0; }
  var TAG_PALETTE = ["#22c55e", "#ef4444", "#06b6d4", "#a855f7", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#10b981", "#f97316", "#0ea5e9"];
  function tagColorFor(textColors, tag, idx) { return (textColors && textColors["t:" + tag]) || TAG_PALETTE[idx % TAG_PALETTE.length]; }

  /* lista arrastável com motion suave (sem re-render durante o arraste).
     getArr() devolve o array vivo; onCommit() re-renderiza após soltar. */
  function makeSortable(listEl, getArr, onCommit, rowSel, gripSel) {
    rowSel = rowSel || ".titrow"; gripSel = gripSel || ".titrow__grip";
    listEl.addEventListener("pointerdown", function (e) {
      var grip = e.target.closest(gripSel); if (!grip) return;
      var row = grip.closest(rowSel); if (!row) return;
      e.preventDefault();
      var rows = App.util.qsa(rowSel, listEl);
      var from = rows.indexOf(row); if (from < 0) return;
      var rect = row.getBoundingClientRect();
      var gap = 8, H = rect.height + gap;     // altura uniforme das linhas + gap
      var startY = e.clientY, cur = from, pid = e.pointerId;
      row.classList.add("is-dragging");
      try { listEl.setPointerCapture(pid); } catch (er) {}
      rows.forEach(function (r) { if (r !== row) r.style.transition = "transform .18s cubic-bezier(.22,1,.36,1)"; });
      function mv(ev) {
        var dy = ev.clientY - startY;
        row.style.transform = "translateY(" + dy + "px)";
        var target = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / H)));
        if (target !== cur) {
          cur = target;
          rows.forEach(function (r, idx) {
            if (r === row) return;
            var shift = 0;
            if (from < cur && idx > from && idx <= cur) shift = -H;
            else if (from > cur && idx < from && idx >= cur) shift = H;
            r.style.transform = shift ? "translateY(" + shift + "px)" : "";
          });
        }
      }
      function up() {
        listEl.removeEventListener("pointermove", mv);
        listEl.removeEventListener("pointerup", up);
        listEl.removeEventListener("pointercancel", up);
        try { listEl.releasePointerCapture(pid); } catch (er) {}
        row.classList.remove("is-dragging");
        rows.forEach(function (r) { r.style.transition = ""; r.style.transform = ""; });
        if (cur !== from) { var arr = getArr(); var it = arr.splice(from, 1)[0]; arr.splice(cur, 0, it); onCommit(); }
      }
      listEl.addEventListener("pointermove", mv);
      listEl.addEventListener("pointerup", up);
      listEl.addEventListener("pointercancel", up);
    });
  }

  /* prévia da capa (círculo ou retângulo): vazio = ícone; com imagens = cicla suave */
  function coverDisc(covers, opts) {
    opts = opts || {};
    var host = el("div", { class: "coverdisc" + (opts.wide ? " coverdisc--wide" : "") });
    if (!covers.length) { host.appendChild(el("div", { class: "coverdisc__empty" }, App.icon("image"))); return host; }
    covers.forEach(function (s, i) {
      host.appendChild(el("div", { class: "coverdisc__slide" + (i === 0 ? " is-on" : ""), style: { backgroundImage: "url(" + s + ")" } }));
    });
    if (covers.length > 1) {
      var badge = el("span", { class: "coverdisc__badge" }, "1/" + covers.length);
      host.appendChild(badge);
      var idx = 0, slides = App.util.qsa(".coverdisc__slide", host);
      var t = setInterval(function () {
        if (!host.isConnected) { clearInterval(t); return; }
        slides[idx].classList.remove("is-on");
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add("is-on");
        badge.textContent = (idx + 1) + "/" + slides.length;
      }, opts.speed || 2400);
    }
    return host;
  }

  /* editor de bio com formatação ([B][I][U][S][C]), links e imagens inline
     (mesma marcação/mecânica do editor de publicações). */
  function bioRichEditor(initialText, opts) {
    opts = opts || {};   // { draftKey, onPreview }
    // o base64 da imagem NÃO fica no textarea (vira um blocão). Guardamos fora e
    // mostramos só um token curto [IMG#N]; expandimos pro markup real no getValue().
    var imgStore = [];
    function tokenize(text) {
      return String(text || "").replace(/\[IMG\|([^\]]*)\]/gi, function (_, b64) { return "[IMG#" + (imgStore.push(b64) - 1) + "]"; });
    }
    function expand(text) {
      return String(text || "").replace(/\[IMG#(\d+)\]/g, function (_, i) { var b = imgStore[+i]; return b != null ? "[IMG|" + b + "]" : ""; });
    }
    var ta = ui.Textarea({ value: tokenize(initialText), placeholder: opts.placeholder || "Apresente-se ou conte sua história. Use formatação e insira imagens." });
    var imgFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });

    function visibleLen(v) {
      // conta só o texto visível: imagens e tags de formatação não pesam no limite
      return String(v || "").replace(/\[IMG#\d+\]/g, "").replace(/\[IMG\|[^\]]*\]/gi, "").replace(/\[\/?[BIUSC]+\]/gi, "").length;
    }
    var counter = el("span", { class: "char-counter" });
    function paintCount() {
      var n = visibleLen(ta.value);
      counter.textContent = n + "/" + ui.LIMITS.bio;
      counter.classList.toggle("is-warn", n >= ui.LIMITS.bio * 0.9);
      counter.classList.toggle("is-full", n > ui.LIMITS.bio);
    }
    function insertAtCursor(snippet) {
      var s = ta.selectionStart || 0, e = ta.selectionEnd || 0, v = ta.value;
      ta.value = v.slice(0, s) + snippet + v.slice(e);
      ta.selectionStart = ta.selectionEnd = s + snippet.length;
      ta.focus(); paintCount();
    }
    function wrapSel(tag) {
      var s = ta.selectionStart || 0, e = ta.selectionEnd || 0, v = ta.value, sel = v.slice(s, e);
      if (!sel) { insertAtCursor("[" + tag + "]"); return; }
      var pre = "[" + tag + "]", suf = "[/" + tag + "]";
      ta.value = v.slice(0, s) + pre + sel + suf + v.slice(e);
      ta.selectionStart = s + pre.length; ta.selectionEnd = s + pre.length + sel.length;
      ta.focus(); paintCount();
    }
    function storeAndInsert(fileOrBlob) {
      App.util.downscaleImage(fileOrBlob, { maxDim: 1024, quality: 0.8 })
        .then(function (src) { return App.repo.addImage(src); })
        .then(function (code) { insertAtCursor("[IMG#" + (imgStore.push(code) - 1) + "]"); ui.toast("Imagem inserida na bio", "ok"); })
        .catch(function () { ui.toast("Falha ao inserir imagem", "danger"); });
    }
    imgFile.addEventListener("change", function () { var f = (imgFile.files || [])[0]; if (f) storeAndInsert(f); imgFile.value = ""; });
    ta.addEventListener("paste", function (e) {
      if (opts.noImage) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var k = 0; k < items.length; k++) { if (items[k].type && items[k].type.indexOf("image") === 0) { var blob = items[k].getAsFile(); if (blob) { e.preventDefault(); storeAndInsert(blob); return; } } }
    });
    function insertLink() {
      var s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
      var label = (ta.value.slice(s, e) || "").trim();
      var nameInp = ui.Input({ value: label, placeholder: "Ex.: Meu site" });
      var urlInp = ui.Input({ value: "", placeholder: "https://..." });
      var ref = ui.openModal({
        title: "Inserir link", scrimClass: "scrim--centered", dismissable: true,
        body: el("div", { class: "linkdlg" }, ui.Field("Texto do link", nameInp), ui.Field("Endereço (url)", urlInp)),
        actions: [
          ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
          ui.Button({ label: "Inserir", variant: "primary", onClick: function () {
            var u = (urlInp.value || "").trim(); if (!u) { ui.toast("Informe o endereço", "danger"); return; }
            insertAtCursor("[" + ((nameInp.value || "").trim() || u) + "|" + u + "]"); ref.close();
          } })
        ]
      });
      setTimeout(function () { try { (label ? urlInp : nameInp).focus(); } catch (er) {} }, 30);
    }
    // rascunho no cache (localStorage): tudo que não foi salvo fica aqui; só vai pra
    // nuvem quando o usuário confirma "Salvar" (o editScreen limpa o draftKey ao commitar).
    function saveDraft() { if (opts.draftKey) try { App.store.set(opts.draftKey, { bio: expand(ta.value), ts: Date.now() }); } catch (e) {} }
    function toolBtn(label, title, onClick) {
      var b = el("button", { class: "fmt-btn", type: "button", title: title }, label);
      b.addEventListener("click", function (e) { e.preventDefault(); onClick(); });
      return b;
    }
    // editor em TELA CHEIA: move o próprio node p/ um overlay e devolve ao fechar (mesmo estado)
    function openFull() {
      var anchor = document.createComment("bio-slot");
      if (!node.parentNode) return;
      node.parentNode.insertBefore(anchor, node);
      node.classList.add("fmt-field--full");
      var closed = false, offRoute = null;
      function close() {
        if (closed) return; closed = true;
        document.removeEventListener("keydown", onKey);
        if (offRoute) { try { offRoute(); } catch (e) {} offRoute = null; }
        node.classList.remove("fmt-field--full");
        if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
        if (anchor.parentNode) anchor.remove();
        scrim.classList.add("is-closing");
        setTimeout(function () { if (scrim.parentNode) scrim.remove(); }, 180);
      }
      function onKey(e) { if (e.key === "Escape") close(); }
      var eyeTop = opts.onPreview ? el("button", { class: "tagfs-top__eye", type: "button", title: opts.previewTitle || "Pré-visualizar" }, App.icon("eye")) : null;
      if (eyeTop) eyeTop.addEventListener("click", function () { saveDraft(); close(); if (opts.onPreview) opts.onPreview(expand(ta.value)); });
      var top = el("div", { class: "tagfs-top" },
        el("button", { class: "tagfs-top__x", type: "button", title: "Fechar", onClick: close }, App.icon("close")),
        el("div", { class: "tagfs-top__title" }, opts.fullTitle || "Biografia"),
        eyeTop,
        el("button", { class: "tagfs-top__save", type: "button", onClick: close }, "Concluir"));
      var screen = el("div", { class: "tagfs-screen biofs" }, top, el("div", { class: "biofs__body" }, node));
      var scrim = el("div", { class: "scrim scrim--full tagfs-scrim" }, screen);
      document.body.appendChild(scrim);
      document.addEventListener("keydown", onKey);
      offRoute = App.bus.on("route:change", close);   // troca de rota → fecha (não deixa o overlay preso)
      setTimeout(function () { try { ta.focus(); } catch (e) {} }, 50);
    }
    var toolbar = el("div", { class: "fmt-bar is-open" },
      toolBtn(el("strong", "B"), "Negrito", function () { wrapSel("B"); }),
      toolBtn(el("em", "I"), "Itálico", function () { wrapSel("I"); }),
      toolBtn(el("u", "U"), "Sublinhado", function () { wrapSel("U"); }),
      toolBtn(el("s", "S"), "Tachado", function () { wrapSel("S"); }),
      toolBtn(App.icon("forward", { size: "sm" }), "Centralizar", function () { wrapSel("C"); }),
      el("span", { class: "fmt-sep" }),
      toolBtn(App.icon("globe", { size: "sm" }), "Inserir link", insertLink),
      opts.noImage ? null : toolBtn(App.icon("image", { size: "sm" }), "Inserir imagem", function () { imgFile.click(); }),
      el("span", { class: "fmt-sep fmt-sep--xtra" }),
      (function () { var b = toolBtn(App.icon("expand", { size: "sm" }), "Expandir (tela cheia)", openFull); b.classList.add("fmt-btn--expand"); return b; })());
    var _insert = insertAtCursor;
    insertAtCursor = function (s) { _insert(s); saveDraft(); };
    ta.addEventListener("input", function () { paintCount(); saveDraft(); });
    paintCount();

    var node = el("div", { class: "fmt-field" }, ta, toolbar, imgFile, el("div", { class: "fmt-field__foot" }, counter));
    return {
      node: node,
      getValue: function () { return expand(ta.value); },
      visibleLength: function () { return visibleLen(ta.value); },
      clearDraft: function () { if (opts.draftKey) try { App.store.set(opts.draftKey, null); } catch (e) {} }
    };
  }

  /* seção de Títulos (tags coloridas do perfil): reordenar (motion), cor por
     título e permissões. opts: { tags, textColors, role } */
  function titlesEditor(opts) {
    var tags = (opts.tags || []).slice();
    var textColors = opts.textColors;                 // mutado p/ guardar cores ("t:<tag>")
    var canManage = opts.canManage != null ? opts.canManage : canManageTags(opts.role);
    var host = el("div", { class: "u-col u-gap-3" });
    var list = el("div", { class: "titlist" });
    var compact = !!opts.compact;     // mostra só o 1º + botão p/ abrir o editor cheio
    var preview = null;
    var modalRef = null;              // modal da interface cheia (p/ fechar antes da prévia)
    function colorOf(t, i) { return tagColorFor(textColors, t, i); }
    function renderPreview() {
      if (!preview) return;
      App.util.clear(preview);
      // cargo (admin) é SEPARADO — não conta no limite de 20 títulos
      var rt = App.profileMeta.roleTag && App.profileMeta.roleTag(opts.role);
      if (rt) {
        var rchip = el("span", { class: "level-chip" }, App.icon(rt.icon, { size: "sm", fill: true }), rt.label);
        if (textColors && textColors.__role) rchip.style.background = textColors.__role;
        preview.appendChild(rchip);
      }
      if (!tags.length) { if (!rt) preview.appendChild(el("span", { class: "u-muted" }, "Nenhum título ainda.")); return; }
      preview.appendChild(ui.Tag(tags[0], { variant: "color", color: colorOf(tags[0], 0) }));
      if (tags.length > 1) preview.appendChild(el("span", { class: "titcompact__more" }, "+" + (tags.length - 1)));
    }

    function rowFor(t, i) {
      var row = el("div", { class: "titrow", "data-k": t });
      row.appendChild(el("span", { class: "titrow__grip", title: "Arraste para reordenar" }, App.icon("menu", { size: "sm" })));
      var chip = el("span", { class: "titrow__chip", style: { background: colorOf(t, i) } }, t);
      row.appendChild(chip);
      row.appendChild(el("span", { class: "titrow__spacer" }));
      var colorBtn = el("button", { class: "titrow__act titrow__act--color", type: "button", title: "Mudar cor" }, App.icon("palette", { size: "sm" }));
      colorBtn.addEventListener("click", function () {
        ui.pickColor(colorOf(t, i), function (hex) {
          if (hex) textColors["t:" + t] = hex; else delete textColors["t:" + t];
          chip.style.background = colorOf(t, i);
          renderPreview();
        }, { title: "Cor de “" + t + "”", allowClear: true });
      });
      row.appendChild(colorBtn);
      if (canManage) {
        var delBtn = el("button", { class: "titrow__act titrow__act--del", type: "button", title: "Remover" }, App.icon("trash", { size: "sm" }));
        delBtn.addEventListener("click", function () {
          tags = tags.filter(function (x) { return x !== t; });
          delete textColors["t:" + t];
          render();
        });
        row.appendChild(delBtn);
      }
      return row;
    }
    function render() {
      App.util.clear(list);
      if (!tags.length) { list.appendChild(el("div", { class: "titlist__empty" }, canManage ? "Nenhum título ainda — adicione abaixo." : "Você ainda não tem títulos.")); }
      else { tags.forEach(function (t, i) { list.appendChild(rowFor(t, i)); }); }
      renderPreview();
    }

    // interface cheia (lista + adicionar + pré-visualizar)
    var fullWrap = el("div", { class: "u-col u-gap-3" });
    makeSortable(list, function () { return tags; }, render);
    render();
    fullWrap.appendChild(list);

    // adicionar (só staff) ou aviso de permissão
    if (canManage) {
      var addInput = ui.Input({ placeholder: "Novo título (máx " + ui.LIMITS.tag + ")", maxlength: ui.LIMITS.tag });
      var addTag = function () {
        var v = (addInput.value || "").trim().slice(0, ui.LIMITS.tag);
        if (!v) return;
        if (tags.length >= 20) { ui.toast("Máximo de 20 títulos", "danger"); return; }
        if (tags.indexOf(v) >= 0) { ui.toast("Título já adicionado", "danger"); return; }
        tags.push(v); addInput.value = ""; render();
      };
      addInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addTag(); } });
      fullWrap.appendChild(el("div", { class: "titadd" }, addInput, ui.Button({ label: "Adicionar", icon: "plus", size: "sm", variant: "outline", onClick: addTag })));
    } else {
      fullWrap.appendChild(el("span", { class: "titlist__locked" }, App.icon("lock", { size: "sm" }), "Títulos são atribuídos pela moderação no menu (•••) do perfil. Aqui você só reordena e muda a cor."));
    }

    // pré-visualizar como aparece NO PERFIL (mesmo badge do poster)
    fullWrap.appendChild(el("div", { class: "u-row", style: { justifyContent: "center" } },
      ui.Button({ label: "Pré-visualizar no perfil", icon: "eye", size: "sm", variant: "ghost", onClick: function () {
        if (opts.onPreview) {                               // abre o PERFIL completo (igual o olho do topo)
          if (modalRef) { modalRef.close(); modalRef = null; }   // fecha o modal de títulos p/ revelar o perfil
          opts.onPreview(); return;
        }
        var badge = el("div", { class: "profile-poster__badge" });
        var rt = App.profileMeta.roleTag && App.profileMeta.roleTag(opts.role);
        if (rt) badge.appendChild(el("span", { class: "level-chip" }, App.icon(rt.icon, { size: "sm", fill: true }), rt.label));
        if (!tags.length && !rt) badge.appendChild(el("span", { class: "u-muted" }, "Sem títulos."));
        tags.forEach(function (t, i) { badge.appendChild(ui.Tag(t, { variant: "color", color: colorOf(t, i) })); });
        var poster = el("div", { class: "titprev-poster" },
          el("div", { class: "titprev-poster__hint" }, "Como os títulos aparecem no seu perfil"),
          badge);
        var ref = ui.openModal({ title: "Prévia no perfil", scrimClass: "scrim--centered", dismissable: true, body: poster,
          actions: [ui.Button({ label: "Fechar", variant: "primary", onClick: function () { ref.close(); } })] });
      } })));

    if (compact) {
      // mostra só o 1º título + botão que abre a interface cheia num modal
      preview = el("div", { class: "titcompact__chips" });
      renderPreview();
      var openBtn = ui.Button({ label: "Gerenciar títulos", icon: "edit", size: "sm", variant: "outline", onClick: function () {
        modalRef = ui.openModal({ title: "Títulos", scrimClass: "scrim--full", dismissable: true, body: fullWrap,
          onClose: function () { modalRef = null; },
          actions: [ui.Button({ label: "Concluir", variant: "primary", onClick: function () { if (modalRef) modalRef.close(); } })] });
      } });
      host.appendChild(el("div", { class: "titcompact" }, preview, openBtn));
    } else {
      host.appendChild(fullWrap);
    }

    return { node: host, getTags: function () { return tags.slice(); } };
  }

  /* ================= EDITAR PERFIL — tela cheia própria ================= */
  function editScreen(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var communityId = ctx.params.id || null;     // /c/:id/u/:userId/editar
    var me = App.store.get("currentUserId");
    var titlesRef = null;

    function build(user, membership) {
      var isComm = !!communityId;
      var src = isComm ? membership : user;
      var nameVal = isComm ? (membership.nickname || user.name) : user.name;   // mostra o nome atual como valor editável

      // estado das escolhas
      var avatarVal = src.avatar || null;
      var coversVal = (src.covers && src.covers.length) ? src.covers.slice() : (src.cover ? [src.cover] : []);
      var coverFxVal = src.coverFx || "fade";
      var coverFxSpeedVal = src.coverFxSpeed || "med";
      var colorVal = src.panelColor || "";
      var textColorsVal = Object.assign({}, src.textColors || {});
      var tagsVal = isComm ? (membership.tags || []).slice() : [];
      var role = isComm ? (membership.role || "member") : "";

      var nameInput = ui.Input({ value: nameVal, placeholder: isComm ? user.name : "Seu nome", maxlength: ui.LIMITS.name });
      // rascunho de bio no cache do celular: se houver edição não salva, restaura ela
      var bioDraftKey = "bioDraft:" + (isComm ? communityId : "global") + ":" + me;
      var _bd = App.store.get(bioDraftKey);
      var bioInit = (_bd && _bd.bio != null) ? _bd.bio : src.bio;
      function previewBio(bioVal) {
        // abre a tela "Biografia" (biblioteca) com a bio ATUAL (do cache), sem subir pra nuvem
        App.store.set("bioPreview", { scope: isComm ? "community" : "global", communityId: communityId, userId: me, bio: bioVal });
        App.router.navigate((isComm ? "/c/" + communityId + "/u/" + me : "/u/" + me) + "/comentarios?preview=1");
      }
      var bioEd = bioRichEditor(bioInit, { draftKey: bioDraftKey, onPreview: previewBio });

      var handleLocked = !isComm && user.handleChanged;   // ID só troca 1x
      var handle = isComm ? null : ui.Input({ value: user.handle, placeholder: "usuario", maxlength: ui.LIMITS.handle });
      if (handle && handleLocked) { handle.readOnly = true; handle.classList.add("is-locked"); }
      var handleHint = isComm ? null : el("div", { class: "field__hint", style: handleLocked ? { color: "var(--warn)" } : null },
        handleLocked ? "O ID já foi alterado — só pode trocar uma vez." : "O ID (@usuário) só pode ser trocado UMA vez. Escolha com cuidado.");
      var handleTaken = false;   // checagem ao vivo: ID já usado por outro
      if (handle && !handleLocked) {
        var checkHandleNow = App.util.debounce(function () {
          var v = (handle.value || "").trim().replace(/^@/, "").replace(/\s+/g, "");
          if (!v || v === user.handle) { handleTaken = false; handleHint.textContent = "O ID (@usuário) só pode ser trocado UMA vez. Escolha com cuidado."; handleHint.style.color = ""; return; }
          if (!App.repo.checkHandle) return;
          App.repo.checkHandle(v).then(function (res) {
            handleTaken = !!res.taken;
            handleHint.textContent = res.taken ? "Esse ID já está em uso — escolha outro." : "ID disponível ✓";
            handleHint.style.color = res.taken ? "var(--danger)" : "var(--ok)";
          });
        }, 350);
        handle.addEventListener("input", checkHandleNow);
      }

      // avatar central (abre seletor de imagem em modal)
      var avatarBtn = el("button", { class: "editp2__avatarbtn", type: "button" });
      function avatarNode() {
        return avatarVal
          ? el("div", { class: "editp2__avatar", style: { backgroundImage: "url(" + avatarVal + ")" } })
          : (function () { var a = ui.Avatar({ name: nameVal || (isComm ? user.name : "?"), round: true }); a.classList.add("editp2__avatar"); return a; })();
      }
      avatarBtn.appendChild(avatarNode());
      function rerenderAvatar() { avatarBtn.replaceChild(avatarNode(), avatarBtn.firstChild); }
      function pickImage() {
        var ip = C.ImagePicker({ value: avatarVal, aspect: 1, outW: 512, hint: "Avatar (quadrado)." });
        var ref = ui.openModal({
          title: "Foto de perfil", scrimClass: "scrim--centered", body: ip.node,
          actions: [
            ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
            ui.Button({ label: "Usar", variant: "primary", onClick: function () { avatarVal = ip.getValue(); rerenderAvatar(); ref.close(); } })
          ]
        });
      }
      avatarBtn.addEventListener("click", pickImage);

      function typedPatch() {
        return isComm
          ? { nickname: nameInput.value.trim() || null, bio: bioEd.getValue(), avatar: avatarVal, panelColor: colorVal, textColors: textColorsVal, tags: titlesRef ? titlesRef.getTags() : tagsVal }
          : { name: nameInput.value.trim() || user.name, handle: (handle.value.trim() || user.handle).replace(/^@/, "").replace(/\s+/g, ""), bio: bioEd.getValue(), avatar: avatarVal, panelColor: colorVal, textColors: textColorsVal };
      }
      function gotoSub(path) {
        // salva o digitado (sem perder) e abre a tela dedicada (capa/fundo)
        var saver = isComm ? App.repo.updateMembership(communityId, me, typedPatch()) : App.repo.updateUser(me, typedPatch());
        saver.then(function () { App.router.navigate(path); }).catch(function (e) { ui.toast(e.message || "Falha ao salvar", "danger"); });
      }
      function openCover() { gotoSub(isComm ? "/c/" + communityId + "/u/" + me + "/capa" : "/perfil/capa"); }
      function chooseBackground() { gotoSub(isComm ? "/c/" + communityId + "/u/" + me + "/fundo" : "/perfil/fundo"); }

      function save() {
        if (!isComm && handleTaken) { ui.toast("Esse ID (@usuário) já está em uso. Escolha outro.", "danger"); return; }
        if (bioEd.visibleLength() > ui.LIMITS.bio) { ui.toast("Bio muito longa (máx " + ui.LIMITS.bio + " caracteres de texto)", "danger"); return; }
        if (isComm) {
          App.repo.updateMembership(communityId, me, {
            nickname: nameInput.value.trim() || null, bio: bioEd.getValue(), tags: titlesRef ? titlesRef.getTags() : tagsVal,
            avatar: avatarVal, cover: coversVal[0] || null, covers: coversVal, coverFx: coverFxVal, coverFxSpeed: coverFxSpeedVal, panelColor: colorVal, textColors: textColorsVal
          }).then(function () { bioEd.clearDraft(); ui.toast("Perfil atualizado", "ok"); App.router.navigate("/c/" + communityId + "/u/" + me); })
            .catch(function (e) { ui.toast(e.message || "Falha ao salvar", "danger"); });
        } else {
          App.repo.updateUser(me, {
            name: nameInput.value.trim() || user.name,
            handle: (handle.value.trim() || user.handle).replace(/^@/, "").replace(/\s+/g, ""),
            bio: bioEd.getValue(), avatar: avatarVal, cover: coversVal[0] || null, covers: coversVal, coverFx: coverFxVal, coverFxSpeed: coverFxSpeedVal,
            panelColor: colorVal, textColors: textColorsVal
          }).then(function () { bioEd.clearDraft(); ui.toast("Perfil atualizado", "ok"); App.router.navigate("/profile"); })
            .catch(function (e) { ui.toast(e.message || "Falha ao salvar", "danger"); });
        }
      }

      function preview() {
        // SALVA o que foi editado (p/ não perder ao voltar) e abre o PERFIL REAL em modo prévia
        var back = isComm ? "/c/" + communityId + "/u/" + me + "/editar" : "/perfil/editar";
        var draft = {
          scope: isComm ? "community" : "global",
          communityId: communityId, userId: me, back: back,
          fields: {
            nickname: isComm ? (nameInput.value.trim() || null) : undefined,
            name: isComm ? undefined : (nameInput.value.trim() || user.name),
            handle: isComm ? undefined : (handle.value.trim() || user.handle),
            bio: bioEd.getValue(), avatar: avatarVal, cover: coversVal[0] || null, covers: coversVal.slice(),
            coverFx: coverFxVal, coverFxSpeed: coverFxSpeedVal,
            panelColor: colorVal, textColors: textColorsVal,
            tags: isComm ? (titlesRef ? titlesRef.getTags() : tagsVal) : undefined
          }
        };
        App.store.set("profilePreview", draft);
        var go = function () { App.router.navigate((isComm ? "/c/" + communityId + "/u/" + me : "/u/" + me) + "?preview=1"); };
        var saver = isComm ? App.repo.updateMembership(communityId, me, typedPatch()) : App.repo.updateUser(me, typedPatch());
        saver.then(go).catch(go);   // mesmo se o save falhar, mostra a prévia
      }

      function closeEdit() { App.router.navigate(isComm ? "/c/" + communityId + "/u/" + me : "/perfil"); }
      var header = el("div", { class: "editp2__head" },
        ui.IconButton("back", { title: "Fechar", onClick: closeEdit }),
        el("div", { class: "editp2__title u-grow" }, "Meu Perfil"),
        ui.IconButton("eye", { title: "Pré-visualizar", onClick: preview }),
        ui.IconButton("check", { title: "Salvar", onClick: save }));

      var center = el("div", { class: "editp2__center" },
        avatarBtn,
        el("button", { class: "editp2__editpic", type: "button", onClick: pickImage }, "Editar foto de perfil"));

      // ---- Cartão: Identidade ----
      var idBody = el("div", { class: "edcard__body" },
        el("div", { class: "edcard__field" }, nameInput));
      if (handle) idBody.appendChild(el("div", { class: "edcard__field" }, el("span", { class: "edcard__fieldlabel" }, "@usuário"), handle, handleHint));
      var idCard = el("div", { class: "edcard" },
        el("div", { class: "edcard__head" },
          el("div", { class: "edcard__headicon" }, App.icon("profile")),
          el("div", { class: "edcard__headtext" },
            el("div", { class: "edcard__title" }, "Identidade"),
            el("div", { class: "edcard__desc" }, isComm ? "Seu apelido nesta comunidade." : "Como você aparece no Oblivian."))),
        idBody);

      // ---- Cartão: Capa + Plano de fundo (blocos separados, mesma área) ----
      var coverCell = el("button", { class: "edcover2__cell", type: "button", onClick: openCover },
        el("span", { class: "edcover2__ic" }, App.icon("image", { size: "lg" })),
        el("div", { class: "edcover2__cap" },
          el("div", { class: "edcover2__captitle" }, "Capa"),
          el("div", { class: "edcover2__capdesc" }, coversVal.length ? coversVal.length + (coversVal.length === 1 ? " imagem" : " imagens") : "Adicionar imagens")));
      var bgSwatch = el("span", { class: "edcover2__dot" });
      function paintBgSwatch() { bgSwatch.style.background = colorVal ? "linear-gradient(160deg," + colorVal + "," + App.store.color.shade(colorVal, -18) + ")" : "var(--surface-3)"; }
      paintBgSwatch();
      var bgCell = el("button", { class: "edcover2__cell", type: "button", onClick: chooseBackground },
        bgSwatch,
        el("div", { class: "edcover2__cap" },
          el("div", { class: "edcover2__captitle" }, "Plano de fundo"),
          el("div", { class: "edcover2__capdesc" }, colorVal ? "Cor aplicada" : "Escolher cor")));
      var coverCard = el("div", { class: "edcard" },
        el("div", { class: "edcard__head" },
          el("div", { class: "edcard__headicon" }, App.icon("image")),
          el("div", { class: "edcard__headtext" },
            el("div", { class: "edcard__title" }, "Capa e plano de fundo"),
            el("div", { class: "edcard__desc" }, "A capa é o topo do perfil; o plano de fundo é a cor por trás de tudo. Cada um no seu lugar."))),
        el("div", { class: "edcover2" }, coverCell, bgCell));

      // ---- Cartão: Bio ----
      var bioCard = el("div", { class: "edcard" },
        el("div", { class: "edcard__head" },
          el("div", { class: "edcard__headicon" }, App.icon("edit")),
          el("div", { class: "edcard__headtext" },
            el("div", { class: "edcard__title" }, "Bio"),
            el("div", { class: "edcard__desc" }, "Negrito, itálico, links e imagens. As imagens aparecem dentro do texto, não como capa."))),
        bioEd.node);

      var cards = el("div", { class: "editp2__cards" }, idCard, coverCard, bioCard);

      // ---- Cartão: Títulos (só perfil de comunidade) ----
      if (isComm) {
        titlesRef = titlesEditor({ tags: tagsVal, textColors: textColorsVal, role: role, canManage: false, compact: true, onPreview: preview });
        cards.appendChild(el("div", { class: "edcard" },
          el("div", { class: "edcard__head" },
            el("div", { class: "edcard__headicon" }, App.icon("tag")),
            el("div", { class: "edcard__headtext" },
              el("div", { class: "edcard__title" }, "Títulos"),
              el("div", { class: "edcard__desc" }, "Arraste para reordenar, toque na paleta para mudar a cor e pré-visualize."))),
          titlesRef.node));
      }

      var page = el("div", { class: "editp2 editp3" }, header, center, cards);
      App.util.mount(inner, page);
    }

    if (communityId) {
      Promise.all([App.repo.getUser(me), App.repo.getMembership(communityId, me)]).then(function (r) {
        if (!r[1]) { App.util.mount(inner, ui.Empty("profile", "Você não participa desta comunidade")); return; }
        build(r[0], r[1]);
      });
    } else {
      App.repo.getCurrentUser().then(function (u) { build(u, null); });
    }
    return { node: inner, active: communityId ? "Oblivian" : "profile", title: "Editar perfil", communityId: communityId, immersive: true, flush: true };
  }

  /* ================= PLANO DE FUNDO — tela cheia separada (cor sólida limpa) ================= */
  function backgroundScreen(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var communityId = ctx.params.id || null;
    var me = App.store.get("currentUserId");

    function build(src, isComm) {
      var colorVal = src.panelColor || "";
      var textColorsVal = Object.assign({}, src.textColors || {});   // preserva cores de títulos/fit/pos
      var backTo = isComm ? "/c/" + communityId + "/u/" + me + "/editar" : "/perfil/editar";

      // prévia grande e limpa (gradiente da cor — sem malha/retângulo que muda de cor)
      var preview = el("div", { class: "bgscreen__preview" });
      function refreshPreview() { preview.style.background = colorVal ? "linear-gradient(160deg," + colorVal + "," + App.store.color.shade(colorVal, -18) + ")" : "var(--surface-2)"; }
      refreshPreview();

      // swatch grande p/ cor do perfil
      var sw = el("button", { class: "bgcolor__sw" + (colorVal ? " is-set" : ""), type: "button", title: "Escolher cor" });
      sw.style.background = colorVal || "";
      function paintSw() { sw.classList.toggle("is-set", !!colorVal); sw.style.background = colorVal || ""; }
      sw.addEventListener("click", function () {
        ui.pickColor(colorVal || "#7c59ec", function (hex) { colorVal = hex || ""; paintSw(); refreshPreview(); }, { title: "Cor do perfil", allowClear: true });
      });
      var clrBtn = ui.Button({ label: "Sem cor", icon: "close", size: "sm", variant: "ghost", onClick: function () { colorVal = ""; paintSw(); refreshPreview(); } });

      // cores dos textos do perfil
      var tcp = textColorEditor(textColorsVal, isComm ? {} : { exclude: ["rep"] });

      function buildPatch() {
        // mescla a cor dos textos no objeto preservando títulos/fit/pos (chaves reservadas)
        return { panel: null, panelColor: colorVal, textColors: Object.assign(textColorsVal, tcp.getValue()) };
      }
      function apply() {
        var patch = buildPatch();
        var saver = isComm ? App.repo.updateMembership(communityId, me, patch) : App.repo.updateUser(me, patch);
        saver.then(function () { ui.toast("Plano de fundo aplicado", "ok"); App.router.navigate(backTo); }).catch(function (e) { ui.toast(e.message || "Falha ao salvar", "danger"); });
      }
      function openPreview() {
        var p = buildPatch();
        var back = isComm ? "/c/" + communityId + "/u/" + me + "/fundo" : "/perfil/fundo";
        App.store.set("profilePreview", { scope: isComm ? "community" : "global", communityId: communityId, userId: me, back: back,
          fields: { panel: null, panelColor: p.panelColor, textColors: p.textColors } });
        var go = function () { App.router.navigate((isComm ? "/c/" + communityId + "/u/" + me : "/u/" + me) + "?preview=1"); };
        var saver = isComm ? App.repo.updateMembership(communityId, me, p) : App.repo.updateUser(me, p);
        saver.then(go).catch(go);   // salva antes p/ não perder a info ao voltar
      }

      var header = el("div", { class: "editp2__head" },
        ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate(backTo); } }),
        el("div", { class: "editp2__title u-grow" }, "Plano de fundo"),
        ui.IconButton("eye", { title: "Pré-visualizar", onClick: openPreview }),
        ui.IconButton("check", { title: "Aplicar", onClick: apply }));

      var colorCard = el("div", { class: "edcard" },
        el("div", { class: "edcard__head" },
          el("div", { class: "edcard__headicon" }, App.icon("palette")),
          el("div", { class: "edcard__headtext" },
            el("div", { class: "edcard__title" }, "Cor do perfil"),
            el("div", { class: "edcard__desc" }, "Pinta o fundo atrás da bio e das publicações. A capa fica por cima, no topo."))),
        el("div", { class: "bgcolor" }, sw, clrBtn));

      var textCard = el("div", { class: "edcard" },
        el("div", { class: "edcard__head" },
          el("div", { class: "edcard__headicon" }, App.icon("edit")),
          el("div", { class: "edcard__headtext" },
            el("div", { class: "edcard__title" }, "Cor dos textos"),
            el("div", { class: "edcard__desc" }, "Aplica uma cor aos textos do perfil para contrastar com o fundo."))),
        tcp.node);

      var body = el("div", { class: "bgscreen__body" }, colorCard, textCard);
      App.util.mount(inner, el("div", { class: "editp2 editp3 bgscreen" }, header, body));
    }

    if (communityId) {
      App.repo.getMembership(communityId, me).then(function (m) {
        if (!m) { App.util.mount(inner, ui.Empty("profile", "Você não participa")); return; }
        build(m, true);
      });
    } else {
      App.repo.getCurrentUser().then(function (u) { build(u, false); });
    }
    return { node: inner, active: communityId ? "Oblivian" : "profile", title: "Plano de fundo", communityId: communityId, immersive: true, flush: true };
  }

  /* ================= IMAGEM — tela cheia separada (avatar|capa) ================= */
  function imageScreen(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var communityId = ctx.params.userId ? ctx.params.id : (ctx.params.id || null);
    // rota global /perfil/imagem não tem :id; comunidade /c/:id/u/:userId/imagem
    var isComm = !!ctx.params.userId;
    if (!isComm) communityId = null;
    var me = App.store.get("currentUserId");
    var field = (ctx.query && ctx.query.campo) === "cover" ? "cover" : "avatar";
    var isAvatar = field === "avatar";

    function build(src) {
      var ip = C.ImagePicker({ value: src[field] || null, hint: isAvatar ? "Avatar (quadrado)." : "Capa — imagem (opcional)." });
      var backTo = isComm ? "/c/" + communityId + "/u/" + me + "/editar" : "/perfil/editar";

      function use() {
        var patch = {}; patch[field] = ip.getValue();
        var saver = isComm ? App.repo.updateMembership(communityId, me, patch) : App.repo.updateUser(me, patch);
        saver.then(function () { ui.toast(patch[field] ? "Imagem definida" : "Imagem removida", "ok"); App.router.navigate(backTo); });
      }

      var header = el("div", { class: "editp2__head" },
        ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate(backTo); } }),
        el("div", { class: "editp2__title u-grow" }, isAvatar ? "Foto de perfil" : "Capa"),
        ui.IconButton("check", { title: "Usar", onClick: use }));

      var body = el("div", { class: "bgscreen__body" },
        el("div", { class: "editp2__field" }, ip.node));

      App.util.mount(inner, el("div", { class: "editp2 bgscreen" }, header, body));
    }

    if (isComm) {
      App.repo.getMembership(communityId, me).then(function (m) {
        if (!m) { App.util.mount(inner, ui.Empty("profile", "Você não participa")); return; }
        build(m);
      });
    } else {
      App.repo.getCurrentUser().then(build);
    }
    return { node: inner, active: isComm ? "Oblivian" : "profile", title: "Imagem", communityId: communityId, immersive: true, flush: true };
  }

  /* ================= CAPA — galeria multi-imagem (Configurações + Imagens) ================= */
  function coverScreen(ctx) {
    var inner = el("div", { class: "view__inner view__inner--flush" });
    var isComm = !!ctx.params.userId;
    var communityId = isComm ? ctx.params.id : null;
    var me = App.store.get("currentUserId");

    function build(src) {
      var covers = (src.covers && src.covers.length) ? src.covers.slice() : (src.cover ? [src.cover] : []);
      var fx = src.coverFx || "fade";
      var fxSpeed = src.coverFxSpeed || "med";
      var fit = App.profileMeta.fit(src);           // "Dentro": cover | contain
      var pos = App.profileMeta.pos(src);           // foco/posição
      var backTo = isComm ? "/c/" + communityId + "/u/" + me + "/editar" : "/perfil/editar";

      /* ---- prévia GRANDE (maior na vertical) — cicla com cross-fade, aplica Dentro/posição ---- */
      var big = el("div", { class: "coverbig" });
      var bigTimer = null;
      function renderBig() {
        if (bigTimer) { clearInterval(bigTimer); bigTimer = null; }
        App.util.clear(big);
        if (!covers.length) { big.appendChild(el("div", { class: "coverbig__empty" }, App.icon("image"), el("span", "Sem imagens — adicione abaixo"))); return; }
        covers.forEach(function (s, i) {
          big.appendChild(el("div", { class: "coverbig__slide" + (i === 0 ? " is-on" : ""), style: { backgroundImage: "url(" + s + ")", backgroundSize: fit, backgroundPosition: pos } }));
        });
        if (covers.length > 1) {
          var idx = 0, slides = App.util.qsa(".coverbig__slide", big);
          bigTimer = setInterval(function () {
            if (!big.isConnected) { clearInterval(bigTimer); bigTimer = null; return; }
            slides[idx].classList.remove("is-on");
            idx = (idx + 1) % slides.length;
            slides[idx].classList.add("is-on");
          }, COVER_SPEED[fxSpeed] || 3600);
        }
      }

      /* ---- galeria com seleção por toque longo (sem "arraste para ordenar") ---- */
      var selectMode = false, selected = {};
      var grid = el("div", { class: "covergal covergal--list" });   // lista única com alça arrastável
      var bar = el("div", { class: "covergal__barhost" });
      // arrastar pela alça (círculo) p/ reordenar — igual aos títulos
      makeSortable(grid, function () { return covers; }, function () { renderGrid(); renderBig(); }, ".covrow", ".covrow__grip");

      function selectedIndexes() { return Object.keys(selected).filter(function (k) { return selected[k]; }).map(Number).sort(function (a, b) { return a - b; }); }
      function exitSelect() { selectMode = false; selected = {}; renderGrid(); renderBar(); }

      function moveSelected(dir) {
        var ids = selectedIndexes(); if (!ids.length) return;
        if (dir < 0 && ids[0] === 0) return;                       // já no início
        if (dir > 0 && ids[ids.length - 1] === covers.length - 1) return;  // já no fim
        var order = dir < 0 ? ids.slice() : ids.slice().reverse();
        var marks = covers.map(function (_, i) { return !!selected[i]; });
        order.forEach(function (i) {
          var j = i + dir;
          if (j < 0 || j >= covers.length || marks[j]) return;     // vizinho selecionado: move na sua vez
          var t = covers[i]; covers[i] = covers[j]; covers[j] = t;
          marks[i] = false; marks[j] = true;
        });
        selected = {}; marks.forEach(function (m, i) { if (m) selected[i] = true; });
        renderGrid(); renderBar(); renderBig();
      }
      function deleteSelected() {
        var ids = selectedIndexes(); if (!ids.length) return;
        ui.confirm({ title: "Apagar " + ids.length + " imagem" + (ids.length === 1 ? "" : "ns") + "?", message: "Remove as imagens selecionadas da capa.", confirmLabel: "Apagar", danger: true }).then(function (okc) {
          if (!okc) return;
          ids.slice().reverse().forEach(function (idx) { covers.splice(idx, 1); });
          exitSelect(); renderBig();
        });
      }
      function deleteAll() {
        if (!covers.length) return;
        ui.confirm({ title: "Apagar todas as imagens?", message: "Remove todas as " + covers.length + " imagens da capa. Não dá para desfazer.", confirmLabel: "Apagar tudo", danger: true }).then(function (okc) {
          if (!okc) return; covers = []; exitSelect(); renderBig();
        });
      }

      function renderBar() {
        App.util.clear(bar);
        if (!selectMode) { bar.style.display = "none"; return; }
        bar.style.display = "";
        var ids = selectedIndexes();
        var moveL = el("button", { class: "covergal__barbtn", type: "button", title: "Mover para a esquerda" }, App.icon("back", { size: "sm" }));
        moveL.disabled = !ids.length; moveL.addEventListener("click", function () { moveSelected(-1); });
        var moveR = el("button", { class: "covergal__barbtn", type: "button", title: "Mover para a direita" }, App.icon("forward", { size: "sm" }));
        moveR.disabled = !ids.length; moveR.addEventListener("click", function () { moveSelected(1); });
        var del = el("button", { class: "covergal__barbtn covergal__barbtn--danger", type: "button" }, App.icon("trash", { size: "sm" }), el("span", "Apagar (" + ids.length + ")"));
        del.disabled = !ids.length; del.addEventListener("click", deleteSelected);
        var done = el("button", { class: "covergal__barbtn", type: "button" }, App.icon("check", { size: "sm" }), el("span", "Concluir"));
        done.addEventListener("click", exitSelect);
        bar.appendChild(el("div", { class: "covergal__bar" },
          el("span", { class: "covergal__barcount" }, ids.length + " selecionada" + (ids.length === 1 ? "" : "s")),
          el("span", { class: "covergal__barspace" }), moveL, moveR, del, done));
      }

      function attachTile(tile, i) {
        var lpTimer = null, moved = false, down = null;
        tile.addEventListener("pointerdown", function (e) {
          moved = false; down = { x: e.clientX, y: e.clientY };
          lpTimer = setTimeout(function () {
            lpTimer = null;
            if (!selectMode) selectMode = true;
            selected[i] = true;
            renderGrid(); renderBar();
            if (navigator.vibrate) { try { navigator.vibrate(15); } catch (er) {} }
          }, 420);
        });
        tile.addEventListener("pointermove", function (e) {
          if (!down) return;
          if (Math.abs(e.clientX - down.x) > 10 || Math.abs(e.clientY - down.y) > 10) { moved = true; if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }
        });
        tile.addEventListener("pointerup", function () {
          if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; if (!moved) onTap(); }
          down = null;
        });
        tile.addEventListener("pointercancel", function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } down = null; });
        function onTap() {
          if (selectMode) { selected[i] = !selected[i]; renderGrid(); renderBar(); }
          else openTile(i);
        }
      }

      function renderGrid() {
        App.util.clear(grid);
        covers.forEach(function (s, i) {
          var row = el("div", { class: "covrow", "data-i": i },
            el("span", { class: "covrow__grip", title: "Arraste para reordenar" }, App.icon("menu", { size: "sm" })),
            el("span", { class: "covrow__ord" }, String(i + 1)),
            el("div", { class: "covrow__thumb", style: { backgroundImage: "url(" + s + ")" } }),
            el("button", { class: "covrow__del", type: "button", title: "Remover" }, App.icon("trash", { size: "sm" })));
          row.querySelector(".covrow__thumb").addEventListener("click", function () { openTile(i); });
          row.querySelector(".covrow__del").addEventListener("click", function (e) {
            e.stopPropagation();
            covers.splice(i, 1); renderGrid(); renderBig();
          });
          grid.appendChild(row);
        });
        var add = el("button", { class: "covrow covrow--add", type: "button", title: "Adicionar imagem" }, App.icon("plus"), el("span", "Adicionar imagem"));
        add.addEventListener("click", addImage);
        grid.appendChild(add);
      }

      function addImage() {
        var file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
        file.addEventListener("change", function () {
          var f = file.files && file.files[0]; if (!f) return;
          if (!App.util.isAllowedMedia(f)) { ui.toast("Só imagem ou GIF", "danger"); return; }
          App.util.downscaleImage(f, { maxDim: 1280, quality: 0.85 }).then(function (s) { covers.push(s); renderGrid(); renderBig(); })
            .catch(function () { ui.toast("Falha ao carregar imagem", "danger"); });
          file.value = "";
        });
        file.click();
      }

      /* ---- modal: pré-visualizar maior + posicionar (arrastar o foco) ---- */
      function openTile(i) {
        var localPos = pos;
        var img = el("div", { class: "covpos__img", style: { backgroundImage: "url(" + covers[i] + ")", backgroundPosition: localPos } });
        var stage = el("div", { class: "covpos__stage" }, img, el("div", { class: "covpos__reticle" }));
        var dragging = false;
        function setFrom(ev) {
          var r = stage.getBoundingClientRect();
          var x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
          var y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
          localPos = Math.round(x * 100) + "% " + Math.round(y * 100) + "%";
          img.style.backgroundPosition = localPos;
        }
        stage.addEventListener("pointerdown", function (e) { dragging = true; try { stage.setPointerCapture(e.pointerId); } catch (er) {} setFrom(e); });
        stage.addEventListener("pointermove", function (e) { if (dragging) setFrom(e); });
        stage.addEventListener("pointerup", function () { dragging = false; });
        stage.addEventListener("pointercancel", function () { dragging = false; });
        var makePrimary = (covers.length > 1 && i !== 0)
          ? ui.Button({ label: "Tornar capa principal", icon: "star", size: "sm", variant: "outline", onClick: function () { var it = covers.splice(i, 1)[0]; covers.unshift(it); renderGrid(); renderBig(); ref.close(); } })
          : null;
        var ref = ui.openModal({
          title: "Imagem " + (i + 1) + " de " + covers.length, scrimClass: "scrim--centered", dismissable: true,
          body: el("div", { class: "covpos" }, stage, el("p", { class: "covpos__hint" }, "Arraste para ajustar o foco da capa."), makePrimary),
          actions: [
            ui.Button({ label: "Fechar", variant: "ghost", onClick: function () { ref.close(); } }),
            ui.Button({ label: "Aplicar posição", variant: "primary", onClick: function () { pos = localPos; renderBig(); ref.close(); } })
          ]
        });
      }

      function buildPatch() {
        var merged = Object.assign({}, src.textColors || {});
        if (fit === "contain") merged.__fit = "contain"; else delete merged.__fit;
        if (pos && pos !== "50% 50%") merged.__pos = pos; else delete merged.__pos;
        return { covers: covers, coverFx: fx, coverFxSpeed: fxSpeed, cover: covers[0] || null, textColors: merged };
      }
      function save() {
        var patch = buildPatch();
        var saver = isComm ? App.repo.updateMembership(communityId, me, patch) : App.repo.updateUser(me, patch);
        saver.then(function () { ui.toast("Capa atualizada", "ok"); App.router.navigate(backTo); }).catch(function (e) { ui.toast(e.message || "Falha ao salvar", "danger"); });
      }
      function openPreview() {
        var p = buildPatch();
        var back = isComm ? "/c/" + communityId + "/u/" + me + "/capa" : "/perfil/capa";
        App.store.set("profilePreview", { scope: isComm ? "community" : "global", communityId: communityId, userId: me, back: back,
          fields: { covers: covers.slice(), cover: covers[0] || null, coverFx: fx, coverFxSpeed: fxSpeed, panelColor: src.panelColor, textColors: p.textColors } });
        var go = function () { App.router.navigate((isComm ? "/c/" + communityId + "/u/" + me : "/u/" + me) + "?preview=1"); };
        var saver = isComm ? App.repo.updateMembership(communityId, me, p) : App.repo.updateUser(me, p);
        saver.then(go).catch(go);   // salva antes p/ não perder a info ao voltar
      }

      /* ---- controles de Configurações ---- */
      var fitOpts = el("div", { class: "coveropt" });
      [{ v: "cover", l: "Preencher", ic: "image" }, { v: "contain", l: "Ajustar", ic: "search" }].forEach(function (o) {
        var b = el("button", { class: "coveropt__b" + (o.v === fit ? " is-active" : ""), type: "button" }, App.icon(o.ic, { size: "sm" }), el("span", o.l));
        b.addEventListener("click", function () { fit = o.v; App.util.qsa(".coveropt__b", fitOpts).forEach(function (x) { x.classList.remove("is-active"); }); b.classList.add("is-active"); renderBig(); });
        fitOpts.appendChild(b);
      });
      function curFx() { for (var i = 0; i < COVER_FX.length; i++) if (COVER_FX[i].key === fx) return COVER_FX[i]; return COVER_FX[0]; }
      // botão compacto: mostra a transição atual e abre o picker dedicado (tela cheia)
      var fxTrigger = el("button", { class: "fxtrigger", type: "button" });
      function refreshFxTrigger() {
        var f = curFx();
        App.util.mount(fxTrigger, [
          App.icon(f.icon || "image", { size: "sm", cls: "fxtrigger__ic" }),
          el("span", { class: "fxtrigger__name" }, f.label),
          App.icon("forward", { size: "sm", cls: "fxtrigger__chev" })
        ]);
      }
      refreshFxTrigger();
      fxTrigger.addEventListener("click", openFxPicker);

      // ===== picker dedicado: prévia ao vivo + grade de transições =====
      function openFxPicker() {
        var closed = false, prevTimer = null;
        function close() {
          if (closed) return; closed = true;
          if (prevTimer) { clearInterval(prevTimer); prevTimer = null; }
          document.removeEventListener("keydown", onKey);
          scrim.classList.add("is-closing");
          setTimeout(function () { if (scrim.parentNode) scrim.remove(); }, 180);
          refreshFxTrigger();
        }
        function onKey(e) { if (e.key === "Escape") close(); }

        // prévia: capa real ciclando (ou gradientes de exemplo) com o fx atual
        var stage = el("div", { class: "fxpick__stage" });
        function buildPreview() {
          if (prevTimer) { clearInterval(prevTimer); prevTimer = null; }
          App.util.clear(stage);
          var imgs = covers.slice(0, 3);
          var demo = imgs.length < 2;
          var slidesWrap = el("div", { class: "cover-slides fx-" + fx + (demo ? "" : "") });
          var list = demo ? ["__g1", "__g2", "__g3"] : imgs;
          list.forEach(function (s, i) {
            var img = el("div", { class: "cover-slide__img" });
            if (s === "__g1") img.style.background = "linear-gradient(135deg,#7c59ec,#3b82f6)";
            else if (s === "__g2") img.style.background = "linear-gradient(135deg,#ff5fa2,#f59e0b)";
            else if (s === "__g3") img.style.background = "linear-gradient(135deg,#22c55e,#14b8a6)";
            else { img.style.backgroundImage = "url(" + s + ")"; img.style.backgroundSize = "cover"; img.style.backgroundPosition = "center"; }
            slidesWrap.appendChild(el("div", { class: "cover-slide" + (i === 0 ? " is-active" : "") }, img));
          });
          stage.appendChild(slidesWrap);
          var slides = App.util.qsa(".cover-slide", slidesWrap);
          if (slides.length > 1) {
            var idx = 0;
            prevTimer = setInterval(function () {
              if (!slidesWrap.isConnected) { clearInterval(prevTimer); prevTimer = null; return; }
              var cur = slides[idx];
              cur.classList.remove("is-active"); cur.classList.add("is-leaving");
              idx = (idx + 1) % slides.length;
              slides[idx].classList.remove("is-leaving"); slides[idx].classList.add("is-active");
              (function (prev) { setTimeout(function () { prev.classList.remove("is-leaving"); }, 1100); })(cur);
            }, Math.max(1800, COVER_SPEED[fxSpeed] || 2600));
          }
        }

        var grid = el("div", { class: "coverfx coverfx--grid fxpick__grid" });
        COVER_FX.forEach(function (f) {
          var b = el("button", { class: "coverfx__tile" + (f.key === fx ? " is-active" : ""), type: "button" },
            App.icon(f.icon || "image", { size: "sm" }), el("span", { class: "coverfx__label" }, f.label));
          b.addEventListener("click", function () {
            fx = f.key;
            App.util.qsa(".coverfx__tile", grid).forEach(function (x) { x.classList.remove("is-active"); });
            b.classList.add("is-active");
            buildPreview();   // re-toca a prévia no novo efeito (não fecha → dá p/ comparar)
          });
          grid.appendChild(b);
        });

        var top = el("div", { class: "tagfs-top" },
          el("button", { class: "tagfs-top__x", type: "button", title: "Fechar", onClick: close }, App.icon("close")),
          el("div", { class: "tagfs-top__title" }, "Transição da capa"),
          el("button", { class: "tagfs-top__save", type: "button", onClick: close }, "Concluir"));
        var screen = el("div", { class: "tagfs-screen fxpick" }, top,
          el("div", { class: "fxpick__body" }, stage,
            el("div", { class: "fxpick__hint" }, "Toque numa transição para ver a prévia"),
            grid));
        var scrim = el("div", { class: "scrim scrim--full tagfs-scrim" }, screen);
        document.body.appendChild(scrim);
        document.addEventListener("keydown", onKey);
        requestAnimationFrame(buildPreview);
      }
      var speedOpts = el("div", { class: "coveropt coveropt--3" });
      COVER_SPEED_OPTS.forEach(function (o) {
        var b = el("button", { class: "coveropt__b" + (o.value === fxSpeed ? " is-active" : ""), type: "button" }, el("span", o.label));
        b.addEventListener("click", function () { fxSpeed = o.value; App.util.qsa(".coveropt__b", speedOpts).forEach(function (x) { x.classList.remove("is-active"); }); b.classList.add("is-active"); renderBig(); });
        speedOpts.appendChild(b);
      });

      var header = el("div", { class: "editp2__head" },
        ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.navigate(backTo); } }),
        el("div", { class: "editp2__title u-grow" }, "Capa"),
        ui.IconButton("eye", { title: "Pré-visualizar", onClick: openPreview }),
        ui.IconButton("check", { title: "Salvar", onClick: save }));

      var settingsCard = el("div", { class: "edcard" },
        el("div", { class: "edcard__head" },
          el("div", { class: "edcard__headicon" }, App.icon("settings")),
          el("div", { class: "edcard__headtext" },
            el("div", { class: "edcard__title" }, "Configurações da capa"),
            el("div", { class: "edcard__desc" }, "Como a imagem se ajusta, a animação entre as imagens e o ritmo."))),
        el("div", { class: "edcard__field" }, el("span", { class: "edcard__fieldlabel" }, "Dentro"), fitOpts),
        el("div", { class: "edcard__field" }, el("span", { class: "edcard__fieldlabel" }, "Transição"), fxTrigger),
        el("div", { class: "edcard__field" }, el("span", { class: "edcard__fieldlabel" }, "Velocidade"), speedOpts));

      var delAllBtn = ui.Button({ label: "Apagar tudo", icon: "trash", size: "sm", variant: "ghost", onClick: deleteAll });
      var imagesCard = el("div", { class: "edcard" },
        el("div", { class: "edcard__head" },
          el("div", { class: "edcard__headicon" }, App.icon("image")),
          el("div", { class: "edcard__headtext" },
            el("div", { class: "edcard__title" }, "Imagens"),
            el("div", { class: "edcard__desc" }, "Arraste pela alça para reordenar. Toque na imagem para ver maior e posicionar."))),
        bar, grid,
        el("div", { class: "u-row u-gap-2", style: { justifyContent: "space-between", flexWrap: "wrap" } },
          ui.Button({ label: "Adicionar imagem", icon: "plus", size: "sm", variant: "outline", onClick: addImage }),
          delAllBtn));

      renderGrid(); renderBar(); renderBig();
      App.util.mount(inner, el("div", { class: "editp2 editp3" }, header, el("div", { class: "coveredit2" }, settingsCard, imagesCard)));
    }

    if (isComm) {
      App.repo.getMembership(communityId, me).then(function (m) {
        if (!m) { App.util.mount(inner, ui.Empty("profile", "Você não participa")); return; }
        build(m);
      });
    } else {
      App.repo.getCurrentUser().then(build);
    }
    return { node: inner, active: isComm ? "Oblivian" : "profile", title: "Capa", communityId: communityId, immersive: true, flush: true };
  }

  App.components = App.components || {};
  App.components.richText = bioRichEditor;   // editor com toolbar (B/I/U/S/link/imagem) + expandir, reutilizável
  App.screens.editProfile = editScreen;
  App.screens.editImage = imageScreen;
  App.screens.editBackground = backgroundScreen;
  App.screens.editCover = coverScreen;
  App.screens.profileGlobal = renderGlobal;
  App.screens.profileCommunity = renderCommunity;
  /* reaproveitado por outras telas (ex.: configurações) */
  App.screensInternal = App.screensInternal || {};
  App.screensInternal.editGlobal = editGlobal;
})(window.App = window.App || {});
