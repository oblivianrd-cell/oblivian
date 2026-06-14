/* ============================================================
   screens/community.js — Página interna da comunidade (estilo Kyodo).
   Telas: intro (Sobre) · feed por abas (Destaques/Recentes/Diretrizes/Oficial)
   com filtro e ordenação · post individual (pv2) · notificações.
   Cada perfil aqui é INDEPENDENTE por comunidade.
   Rotas: /c/:id e /c/:id/:tab
   Namespace: App.screens.community
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  function nameIn(membership, user) { return (membership && membership.nickname) || user.name; }

  /* ---------------- Presença REAL (Supabase Realtime) ---------------- */
  // conjunto vivo de uids online na comunidade atual; atualizado pelo joinPresence.
  var ONLINE = new Set();
  var presencePanelCbs = [];            // callbacks do painel de atividade aberto (limpos ao fechar)
  function isOnline(id) { return ONLINE.has(id); }
  function onlineFrom(list) { return Math.max(0, list.filter(function (x) { return ONLINE.has(x.user.id); }).length); }
  function setOnline(set) {
    ONLINE = set || new Set();
    repaintPresenceDOM();
    presencePanelCbs.slice().forEach(function (cb) { try { cb(ONLINE); } catch (e) {} });
  }
  // atualiza o DOM visível sem re-render (pílula + bolinhas de online)
  function repaintPresenceDOM() {
    var c = App.util.formatCount(ONLINE.size) + " online";
    document.querySelectorAll(".camino-online-count").forEach(function (n) { n.textContent = c; });
    document.querySelectorAll("[data-presence-uid]").forEach(function (n) { n.classList.toggle("is-online", ONLINE.has(n.getAttribute("data-presence-uid"))); });
  }
  // "visto há X" (offline) — null se o usuário oculta presença ou sem dado
  function lastSeenText(user) {
    if (!user || user.hidePresence || !user.lastSeen) return null;
    return "visto " + App.util.timeAgo(user.lastSeen);
  }

  /* ---------------- Tela de entrada: "Sobre a comunidade" ---------------- */
  function introScreen(community, membership, ownerData) {
    var accent = (community.theme && community.theme.accent) || "#7c59ec";
    var icon = community.icon
      ? el("div", { class: "cintro__icon", style: { backgroundImage: "url(" + community.icon + ")" } })
      : el("div", { class: "cintro__icon", style: { background: "linear-gradient(135deg," + accent + "," + App.store.color.shade(accent, 25) + ")" } }, App.icon("community", { size: "xl" }));

    // barra de atividade (nível de movimento)
    var activity = Math.min(10, Math.max(1, Math.round((community.memberCount || 1) / 1)));
    var bars = el("div", { class: "cintro__activity" });
    for (var i = 0; i < 10; i++) bars.appendChild(el("span", { class: "cintro__bar" + (i < activity ? " is-on" : "") }));

    var ownerRow = ownerData ? el("a", { class: "cintro__owner", href: "#/c/" + community.id + "/u/" + ownerData.user.id },
      ui.Avatar({ name: nameIn(ownerData.mem, ownerData.user), src: (ownerData.mem && ownerData.mem.avatar) || ownerData.user.avatar, round: true }),
      el("div", { class: "u-grow" },
        el("strong", nameIn(ownerData.mem, ownerData.user)),
        el("div", { class: "u-muted", style: { fontSize: "var(--fs-xs)" } }, "Dono(a) · " + App.util.formatCount(community.memberCount) + " membros"))) : null;

    var joined = !!membership;
    var home = (community.settings && community.settings.home) || "featured"; // página inicial configurável
    var actionBtn = joined
      ? ui.Button({ label: "Entrar na comunidade", icon: "forward", variant: "primary", block: true, onClick: function () { App.router.navigate("/c/" + community.id + "/" + home + "?enter=1"); } })
      : ui.Button({ label: "Participar", icon: "add_user", variant: "primary", block: true, onClick: function () {
          App.repo.joinCommunity(community.id).then(function () { ui.toast("Bem-vindo(a)!", "ok"); App.router.navigate("/c/" + community.id + "/" + home + "?enter=1"); });
        } });

    var root = el("div", { class: "cintro" },
      el("div", { class: "cintro__head" },
        ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.back("/c/" + community.id); } }),
        el("strong", "Sobre a comunidade")),
      el("div", { class: "cintro__scroll" },
        el("div", { class: "cintro__top" },
          icon,
          el("div", { class: "cintro__meta" },
            el("h1", { class: "cintro__name" }, community.name),
            el("div", { class: "cintro__activity-row" }, el("span", { class: "u-muted" }, "Atividade"), bars),
            el("div", { class: "cintro__members" }, App.util.formatCount(community.memberCount) + " Membros"),
            el("div", { class: "u-muted" }, "Português"))),
        el("div", { class: "cintro__id" }, "ID Oblivian: " + community.id),
        community.description ? el("p", { class: "cintro__slogan" }, ((community.description.replace(/\[[^\]]*\]/g, "").split(".")[0] || community.name).trim() + "!") ) : null,
        ownerRow,
        el("div", { class: "cintro__cta" }, actionBtn),
        el("div", { class: "cintro__section" },
          el("h2", { class: "cintro__h" }, "Descrição"),
          el("div", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, "Criada em: " + App.util.fullDate(community.createdAt)),
          community.description ? el("div", { class: "cintro__desc mk-body" }, App.markup.render(community.description)) : el("p", { class: "cintro__desc" }, "Sem descrição."))));
    // fundo temático da comunidade: imagem de capa (se houver) + degradê do accent
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-soft", App.store.color.hexA(accent, 0.16));
    if (community.cover) { root.style.setProperty("--cintro-cover", "url(" + community.cover + ")"); root.classList.add("has-cover"); }
    return root;
  }

  /* Transição de entrada: véu de vidro com o ícone da comunidade,
     que desfoca/escurece e some aos poucos enquanto o feed surge. */
  function playEnterTransition(host, community) {
    var accent = (community.theme && community.theme.accent) || "#7c59ec";
    var glyph = community.icon
      ? el("div", { class: "enter-veil__glyph", style: { backgroundImage: "url(" + community.icon + ")" } })
      : el("div", { class: "enter-veil__glyph", style: { background: "linear-gradient(135deg," + accent + "," + App.store.color.shade(accent, 25) + ")" } }, App.icon("community", { size: "xl" }));

    var veil = el("div", { class: "enter-veil" },
      el("div", { class: "enter-veil__ring", style: { borderTopColor: accent } }),
      el("div", { class: "enter-veil__core" }, glyph, el("div", { class: "enter-veil__name" }, community.name)));
    host.appendChild(veil);

    // page começa esmaecida e amplia suave
    var page = host.querySelector(".community-page");
    if (page) page.classList.add("is-entering");

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        veil.classList.add("is-leaving");
        if (page) page.classList.remove("is-entering");
      });
    });
    veil.addEventListener("animationend", function () { veil.remove(); });
    // fallback caso animationend não dispare
    setTimeout(function () { if (veil.parentNode) veil.remove(); }, 1400);
  }

  /* ============================================================
     Interface da comunidade (modelo: Featured / Latest Feed / etc)
     ============================================================ */
  /* metadados de cada tipo de post: ícone + rótulo */
  var POST_TYPES = {
    text:     { icon: "comment",  label: "Post" },
    blog:     { icon: "edit",     label: "Blog" },
    image:    { icon: "image",    label: "Imagem" },
    poll:     { icon: "recent",   label: "Enquete" },
    quiz:     { icon: "star",     label: "Quiz" },
    link:     { icon: "globe",    label: "Link" },
    question: { icon: "info",     label: "Pergunta" },
    answer:   { icon: "check",    label: "Resposta" },
    wiki:     { icon: "members",  label: "Wiki" }
  };
  function postMeta(t) { return POST_TYPES[t] || POST_TYPES.text; }

  function typeBadge(type) {
    var m = postMeta(type);
    return el("span", { class: "camino-badge camino-badge--" + type }, App.icon(m.icon, { size: "sm" }), m.label);
  }

  /* corpo específico por tipo de post */
  function postBody(p) {
    var pl = p.payload || {};
    switch (p.type) {
      case "image": {
        var srcs = Array.isArray(pl.gallery) && pl.gallery.length ? pl.gallery : (pl.image ? [pl.image] : []);
        var total = srcs.length || (pl.images || 1);
        var shown = Math.min(3, total);
        var cells = [];
        for (var ci = 0; ci < shown; ci++) {
          var src = srcs[ci];
          cells.push(el("div", { class: "camino-img", style: src ? { backgroundImage: "url(" + src + ")" } : null }, src ? null : App.icon("image", { cls: "u-muted" })));
        }
        return el("div", { class: "camino-pbody" },
          p.text ? el("p", { class: "camino-pbody__text" }, App.markup.render(p.text, { media: p.payload && p.payload.media })) : null,
          el("div", { class: "camino-imgrid camino-imgrid--" + shown }, cells),
          (total > 3) ? el("div", { class: "camino-more-imgs" }, "+" + (total - 3)) : null);
      }
      case "poll": {
        var opts = (pl.options || []).map(function (o) { return { label: (o && o.label) || o }; });
        var wrap = el("div", { class: "camino-pbody camino-pollwrap" });
        var totalEl = el("div", { class: "camino-poll__total u-muted" });
        var st = (App.repo.pollState && App.repo.pollState(p.id)) || { counts: opts.map(function () { return 0; }), total: 0, myVote: null };
        var voted = st.myVote != null ? st.myVote : -1;
        var counts = st.counts.slice();
        var endsAt = pl.endsAt || null;
        var closed = !!(endsAt && Date.now() >= endsAt);
        function renderPoll() {
          App.util.clear(wrap);
          var reveal = voted >= 0 || closed; // encerrada também mostra resultado
          var total = counts.reduce(function (s, n) { return s + n; }, 0) || 1;
          opts.forEach(function (o, i) {
            var pct = Math.round(counts[i] / total * 100);
            var fill = el("div", { class: "camino-poll__fill", style: { width: "0%" } });
            var pctEl = el("span", { class: "camino-poll__pct" }, reveal ? "0%" : "");
            var row = el("button", { class: "camino-poll" + (voted === i ? " is-chosen" : "") + (reveal ? " is-voted" : "") + (closed ? " is-closed" : ""), type: "button" },
              fill, el("span", { class: "camino-poll__label" }, o.label), pctEl);
            // anima barra (largura via CSS transition) + número contando até o alvo
            if (reveal) {
              requestAnimationFrame(function () {
                fill.style.width = pct + "%";
                var start = null, dur = 600;
                function step(ts) {
                  if (start == null) start = ts;
                  var k = Math.min(1, (ts - start) / dur);
                  pctEl.textContent = Math.round(pct * k) + "%";
                  if (k < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
              });
            }
            row.addEventListener("click", function (e) {
              e.stopPropagation();
              if (closed) { ui.toast("Enquete encerrada", "danger"); return; }
              App.repo.votePoll(p.id, i).then(function (r) {
                counts = r.counts; voted = r.myVote != null ? r.myVote : -1;
                renderPoll();
                ui.toast(voted === i ? "Voto registrado" : "Voto removido", "ok");
              }).catch(function (err) { ui.toast(err.message, "err"); });
            });
            wrap.appendChild(row);
          });
          var realTotal = counts.reduce(function (s, n) { return s + n; }, 0);
          var statusTxt = closed ? "Encerrada"
            : endsAt ? ("Encerra em " + App.util.humanDuration(endsAt - Date.now()))
            : (voted >= 0 ? "você votou (toque p/ remover)" : "toque para votar");
          totalEl.textContent = realTotal + " votos · " + statusTxt;
          wrap.appendChild(totalEl);
        }
        renderPoll();
        return wrap;
      }
      case "quiz": {
        var qcount = Array.isArray(pl.questions) ? pl.questions.length : (pl.questions || 0);
        return el("div", { class: "camino-pbody" },
          el("div", { class: "camino-quiz" },
            el("div", { class: "camino-quiz__icon" }, App.icon("star", { size: "lg", fill: true })),
            el("div", { class: "u-grow" },
              el("div", null, qcount + " perguntas · " + (pl.plays || 0) + " jogadas"),
              el("div", { class: "u-muted", style: { fontSize: "var(--fs-xs)" } }, "Melhor resultado: " + (pl.best || 0) + "/" + qcount)),
            ui.Button({ label: "Jogar", size: "sm", variant: "primary", onClick: function (e) { e.stopPropagation(); openQuiz(p); } })));
      }
      case "link": {
        var href = pl.url || ("https://" + (pl.domain || ""));
        if (!/^https?:\/\//i.test(href)) href = "https://" + href;
        return el("a", { class: "camino-linkcard", href: href, target: "_blank", rel: "noopener noreferrer", onClick: function (e) { e.stopPropagation(); ui.toast("Abrindo " + (pl.domain || "link")); } },
          el("div", { class: "camino-linkcard__icon" }, App.icon("globe")),
          el("div", { class: "u-grow u-truncate" },
            p.text ? el("div", { class: "camino-linkcard__title u-truncate" }, p.text) : null,
            el("div", { class: "camino-linkcard__url u-truncate" }, pl.url || pl.domain)),
          App.icon("forward", { cls: "u-muted" }));
      }
      case "question":
        return el("div", { class: "camino-pbody" },
          p.text ? el("p", { class: "camino-pbody__text" }, App.markup.render(p.text, { media: p.payload && p.payload.media })) : null,
          el("div", { class: "camino-qrow" },
            el("span", { class: "camino-pill" + (pl.solved ? " is-solved" : "") }, pl.solved ? App.icon("check", { size: "sm" }) : App.icon("info", { size: "sm" }), pl.solved ? "Resolvida" : "Aberta"),
            el("span", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, (pl.answers || 0) + " respostas")));
      case "answer":
        return el("div", { class: "camino-pbody" },
          el("div", { class: "camino-answer-ref u-truncate" }, App.icon("info", { size: "sm" }), "Resposta a: " + (pl.questionTitle || "pergunta")),
          el("p", { class: "camino-pbody__text" }, App.markup.render(p.text, { media: p.payload && p.payload.media })),
          pl.accepted ? el("span", { class: "camino-pill is-solved" }, App.icon("check", { size: "sm" }), "Melhor resposta") : null);
      case "wiki":
        return el("div", { class: "camino-pbody" },
          p.text ? el("p", { class: "camino-pbody__text" }, App.markup.render(p.text, { media: p.payload && p.payload.media })) : null,
          el("div", { class: "camino-wiki" },
            el("span", { class: "u-muted" }, App.icon("members", { size: "sm" }), (pl.contributors || 1) + " colaboradores"),
            el("span", { class: "u-muted" }, (pl.sections || 0) + " seções"),
            el("span", { class: "u-muted" }, "atualizado " + (pl.updated || "—"))));
      case "blog":
        return el("div", { class: "camino-pbody" },
          el("p", { class: "camino-pbody__text camino-clamp" }, App.markup.render(p.text, { media: p.payload && p.payload.media })));
      default:
        return el("p", { class: "camino-pbody__text" }, App.markup.render(p.text, { media: p.payload && p.payload.media }));
    }
  }

  /* Painel lateral estilo Amino: capa da comunidade no topo, lista de
     navegação com ícones na cor do tema, rodapé com convidar/config. */
  function openSidePanel(community, membership, canMod, me) {
    var cid = community.id;
    var accent = (community.theme && community.theme.accent) || App.store.get("accent");
    var name = nameIn(membership, me);

    function go(path) { close(); App.router.navigate(path); }
    function row(icon, label, onClick, opts) {
      opts = opts || {};
      var r = el("button", { class: "sidepanel__row" + (opts.cls ? " " + opts.cls : ""), type: "button" },
        el("span", { class: "sidepanel__icon" }, App.icon(icon, { size: "sm" })),
        el("span", { class: "sidepanel__label" }, label));
      r.addEventListener("click", onClick);
      return r;
    }

    var items = [
      row("home", "Início", function () { go("/c/" + cid + "/featured"); }),
      row("community", "Sobre", function () { go("/c/" + cid); }),
      row("chats", "Chats", function () { go("/c/" + cid + "/chats"); }),
      row("members", "Membros", function () { go("/c/" + cid + "/membros"); }),
      row("recent", "Recentes", function () { go("/c/" + cid + "/latest"); }),
      row("profile", "Meu perfil", function () { go("/c/" + cid + "/u/" + me.id); })
    ];
    var isFav = App.repo.isFavoriteCommunity && App.repo.isFavoriteCommunity(cid);
    items.push(row("star", isFav ? "Remover dos favoritos" : "Favoritar comunidade", function () {
      App.repo.toggleFavoriteCommunity(cid).then(function (now) { ui.toast(now ? "Comunidade favoritada" : "Removida dos favoritos", "ok"); close(); });
    }));
    if (canMod) {
      items.push(row("settings", "Configurar", function () { go("/c/" + cid + "/config"); }));
    }
    if (membership && membership.role !== "owner") {
      items.push(row("leave", "Sair da comunidade", function () {
        ui.confirm({ title: "Sair da comunidade", message: "Seu perfil aqui será mantido, mas você deixará de participar.", confirmLabel: "Sair", danger: true })
          .then(function (ok) { if (ok) App.repo.leaveCommunity(cid).then(function () { ui.toast("Você saiu"); close(); App.router.navigate("/sanguao"); }); });
      }, { cls: "is-danger" }));
    }

    // fundo do painel lateral: imagem DEDICADA (settings.panel.image) OU, na falta dela,
    // a CAPA da comunidade — qualquer uma cobre o painel INTEIRO (has-img). Só o rodapé fica sólido.
    var _panelCfg = (community.settings && community.settings.panel) || {};
    var panelImg = (_panelCfg.mode === "image" && _panelCfg.image)
      ? _panelCfg.image
      : (community.cover || null);
    var headImg = null; // a imagem já cobre o topo via has-img (head fica transparente no CSS)
    var coverStyle = { background: "transparent" }; // com imagem, ela aparece no topo; sem, o head usa a cor do tema
    var myAvatar = (membership && membership.avatar) || me.avatar;
    var avatarNode = myAvatar
      ? el("div", { class: "sidepanel__avatar", style: { backgroundImage: "url(" + myAvatar + ")" } })
      : (function () { var a = ui.Avatar({ name: name, round: true }); a.classList.add("sidepanel__avatar"); a.style.background = accent; return a; })();

    var avatarBtn = el("button", { class: "sidepanel__avatarbtn", type: "button", title: "Meu perfil", onClick: function () { go("/c/" + cid + "/u/" + me.id); } }, avatarNode);

    // seta de voltar ao Saguão — canto superior esquerdo do painel
    var backArrow = el("button", { class: "sidepanel__back", type: "button", title: "Voltar ao Saguão", onClick: function () { go("/sanguao"); } }, App.icon("back"));
    // 7 círculos da semana (sigla por dia) — hoje destacado
    var DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
    var today = new Date().getDay(); // 0 = domingo
    var daysRow = el("div", { class: "sidepanel__days" },
      DAYS.map(function (d, i) { return el("span", { class: "sidepanel__day" + (i === today ? " is-today" : "") }, d); }));

    var head = el("div", { class: "sidepanel__head" + (headImg ? " has-headimg" : ""), style: headImg ? { backgroundImage: "url(" + headImg + ")" } : null },
      backArrow,
      el("div", { class: "sidepanel__cover", style: coverStyle }),
      el("div", { class: "sidepanel__heademb" },
        avatarBtn,
        el("div", { class: "sidepanel__name" }, name),
        daysRow));

    var foot = el("div", { class: "sidepanel__foot" },
      el("button", { class: "sidepanel__footrow", type: "button", onClick: function () { ui.toast("Convide pelo link da comunidade"); } }, App.icon("members", { size: "sm" }), el("span", "Convidar amigos")),
      el("button", { class: "sidepanel__footrow", type: "button", onClick: function () { go("/c/" + cid + "/membros"); } }, App.icon("members", { size: "sm" }), el("span", "Todos os membros")),
      el("button", { class: "sidepanel__footrow", type: "button", onClick: function () { go("/c/" + cid + "/config"); } }, App.icon("settings", { size: "sm" }), el("span", "Configurações")));

    // com imagem: cobre o painel inteiro (has-img + overlay no CSS); sem: sólido (head=tema, lista=escura)
    var panel = el("aside", { class: "sidepanel has-rail" + (panelImg ? " has-img" : ""), style: panelImg ? { backgroundImage: "url(" + panelImg + ")" } : null }, head, el("div", { class: "sidepanel__list" }, items), foot);

    // ----- trilho de comunidades (à esquerda) -----
    function railBtn(icon, title, active, onClick, iconSrc, label) {
      var inner = iconSrc ? el("div", { class: "rail-ico", style: { backgroundImage: "url(" + iconSrc + ")" } })
        : (label ? el("div", { class: "rail-ico rail-ico--txt" }, label) : el("div", { class: "rail-ico rail-ico--glyph" }, App.icon(icon)));
      var b = el("button", { class: "srail__btn" + (active ? " is-active" : ""), type: "button", title: title }, inner);
      b.addEventListener("click", onClick);
      return b;
    }
    var rail = el("div", { class: "srail" },
      railBtn("home", "Início", false, function () { go("/sanguao"); }),
      railBtn("explorer", "Explorar", false, function () { go("/explorer"); }),
      el("div", { class: "srail__sep" }));
    var railList = el("div", { class: "srail__list" });
    rail.appendChild(railList);
    rail.appendChild(railBtn("plus", "Criar comunidade", false, function () { go("/criar"); }));
    App.repo.getMyCommunities().then(function (list) {
      list.forEach(function (c) {
        railList.appendChild(railBtn(null, c.name, c.id === cid, function () { go("/c/" + c.id); }, c.icon || c.cover, (c.name || "?").charAt(0).toUpperCase()));
      });
    });

    var scrim = el("div", { class: "scrim scrim--side" }, rail, panel);
    scrim.style.setProperty("--c-base", accent);
    scrim.style.setProperty("--c-dark", App.store.color.shade(accent, -40));

    function close() {
      document.removeEventListener("keydown", onKey);
      scrim.classList.add("is-closing");
      setTimeout(function () { scrim.remove(); }, 240);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
  }

  /* monta uma linha de notificação (real). Convites de cargo trazem Aceitar/Recusar.
     rowClass: classe base da linha. trunc: trunca textos (painel). onAfter/onNav callbacks. */
  function notifRow(n, rowClass, trunc, onNav, onAfter) {
    var tcls = trunc ? " u-truncate" : "";
    var icon = el("span", { class: "notif__icon notif__icon--" + n.cat }, App.icon(n.icon || "bell", { size: "sm" }));
    var statusTxt = n.status === "accepted" ? " · Aceito" : n.status === "rejected" ? " · Recusado" : "";
    var body = el("div", { class: "notif__body" },
      el("div", { class: "notif__title" + tcls }, n.title),
      el("div", { class: "notif__sub" + tcls }, (n.sub || "") + statusTxt));

    if (n.type === "roleInvite" && n.status === "pending") {
      var acc = ui.Button({ label: "Aceitar", size: "sm", variant: "primary", onClick: function (e) {
        e.stopPropagation(); App.repo.respondRoleInvite(n.id, true).then(function () { ui.toast("Cargo atribuído", "ok"); onAfter && onAfter(); }).catch(function (err) { ui.toast(err.message || "Falha", "danger"); }); } });
      var rej = ui.Button({ label: "Recusar", size: "sm", variant: "ghost", onClick: function (e) {
        e.stopPropagation(); App.repo.respondRoleInvite(n.id, false).then(function () { ui.toast("Convite recusado"); onAfter && onAfter(); }); } });
      body.appendChild(el("div", { class: "notif__actions" }, acc, rej));
      return el("div", { class: rowClass + (n.read ? "" : " is-unread") + " notif__row--invite" }, icon, body);
    }
    var row = el("button", { class: rowClass + (n.read ? "" : " is-unread"), type: "button", onClick: function () {
      if (!n.read) { n.read = true; row.classList.remove("is-unread"); if (App.repo.markNotificationRead) { var _pr = App.repo.markNotificationRead(n.id); if (_pr && _pr.catch) _pr.catch(function () {}); } }
      if (onNav) onNav(n);
    } },
      icon, body, el("span", { class: "notif__time" }, App.util.timeAgo(n.createdAt)));
    return row;
  }

  var POST_ROLE = {
    owner: { label: "Dono", icon: "crown" },
    admin: { label: "Administrador", icon: "shield" },
    lider: { label: "Líder", icon: "shield" },
    curador: { label: "Curador", icon: "star" },
    mod: { label: "Mod", icon: "shield" }
  };

  /* ---------------- Tela de POST individual (estilo Kyodo) ---------------- */
  function postScreen(ctx) {
    var cid = ctx.params.id, pid = ctx.params.postId;
    var inner = el("div", { class: "view__inner view__inner--flush camino-host" });
    Promise.all([App.repo.getCommunity(cid), App.repo.listPosts(cid), App.repo.getCurrentUser(), App.repo.getMembership(cid)])
      .then(function (r) {
        var community = r[0], posts = r[1], me = r[2], membership = r[3];
        if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
        var canMod = membership && App.Roles.isMod(membership.role);
        var item = posts.filter(function (x) { return x.post.id === pid; })[0];
        var accent = (community.theme && community.theme.accent) || App.store.get("accent");
        var backBtn = el("button", { class: "pv2__back", type: "button", title: "Voltar", onClick: function () { App.router.back("/c/" + cid + "/latest", /\/p\//); } }, App.icon("back"));

        if (!item) {
          var pe = el("div", { class: "pv2" }, el("div", { class: "pv2__topbar" }, backBtn), ui.Empty("comment", "Publicação não encontrada", "Talvez tenha sido removida."));
          App.util.mount(inner, pe); return;
        }
        var p = item.post, u = item.user || { id: p.userId, name: "Usuário", avatar: null };
        var coverArr = (p.payload && Array.isArray(p.payload.cover)) ? p.payload.cover : [];
        var heroImg = coverArr[0] || (p.payload && p.payload.image) || null;

        // menu "..." (compartilhar / salvar / fixar / editar / denunciar / excluir)
        function openMore(anchor) {
          var saved = App.repo.isSaved && App.repo.isSaved(p.id);
          var items = [
            { icon: "send", label: "Compartilhar", onClick: function () {
              var link = location.origin + location.pathname + "#/c/" + cid + "/p/" + p.id;
              if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { ui.toast("Link copiado", "ok"); }, function () { ui.toast("Link: " + link); });
              else ui.toast("Link: " + link);
            } },
            { icon: "star", label: saved ? "Remover dos salvos" : "Salvar", onClick: function () {
              App.repo.toggleSavePost(p.id).then(function (now) { ui.toast(now ? "Salvo" : "Removido dos salvos", "ok"); });
            } }
          ];
          if (p.userId === me.id || canMod) items.push({ icon: "edit", label: "Editar", onClick: function () { editPost(p); } });
          if (p.userId === me.id || canMod) items.push({ sep: true }, { icon: "trash", label: "Excluir publicação", danger: true, onClick: function () {
            ui.confirm({ title: "Excluir publicação", message: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir", danger: true }).then(function (ok) {
              if (!ok) return;
              App.repo.deletePost(p.id).then(function () { ui.toast("Publicação excluída"); App.router.navigate("/c/" + cid + "/latest"); }).catch(function (e) { ui.toast(e.message, "err"); });
            });
          } });
          if (p.userId !== me.id) items.push({ icon: "ban", label: "Denunciar", danger: true, onClick: function () { reportPost(p); } });
          if (canMod) items.push({ sep: true }, { icon: "shield", iconFill: true, label: "Administração", onClick: function () { adminMenu(anchor, p, function () { App.router.resolve(); }); } });
          ui.openMenu(anchor, items);
        }
        // editar = MESMA tela de criar, já preenchida (interface unificada)
        function editPost(post) {
          App.store.set("editPost", post);
          App.router.navigate("/c/" + cid + "/criar-post?edit=" + post.id);
        }
        // denunciar post (motivo opcional)
        function reportPost(post) {
          ui.prompt({ title: "Denunciar publicação", label: "Motivo (opcional)", value: "", multiline: true, confirmLabel: "Enviar denúncia" }).then(function (val) {
            if (val == null) return;
            App.repo.reportContent("post", post.id, val, cid).then(function () { ui.toast("Denúncia enviada", "danger"); }).catch(function (e) { ui.toast(e.message, "err"); });
          });
        }
        var moreBtn = el("button", { class: "pv2__back pv2__more", type: "button", title: "Mais", onClick: function (e) { openMore(e.currentTarget); } }, App.icon("more"));

        var isWiki = p.type === "wiki";
        var typeMeta = postMeta(p.type) || {};

        // herói (imagem) full-bleed, ou topbar simples (wiki sempre topbar simples)
        var top = (!isWiki && heroImg)
          ? el("div", { class: "pv2__hero", style: { backgroundImage: "url(" + heroImg + ")" } }, el("div", { class: "pv2__herofade" }), el("div", { class: "pv2__topbar pv2__topbar--over" }, backBtn, el("div", { class: "u-grow" }), moreBtn))
          : el("div", { class: "pv2__topbar" }, backBtn, el("div", { class: "u-truncate u-grow", style: { fontWeight: "var(--fw-bold)" } }, isWiki ? "" : community.name), moreBtn);

        var titleEl = p.title ? el("h1", { class: "pv2__title" }, p.title) : null;

        // bloco autor: avatar + nome + cargo + tempo + seguir
        var authorWrap = el("div", { class: "pv2__author" });
        App.repo.getMembership(cid, p.userId).then(function (am) {
          var roleDef = am && POST_ROLE[am.role];
          var rolePill = roleDef ? el("span", { class: "pv2__role" }, App.icon(roleDef.icon, { size: "sm", fill: true }), roleDef.label) : null;
          var left = el("a", { class: "pv2__authorleft", href: "#/c/" + cid + "/u/" + u.id },
            ui.Avatar({ name: nameIn(am, u), src: (am && am.avatar) || u.avatar, round: true }),
            el("div", null,
              el("div", { class: "pv2__authorname" }, el("strong", nameIn(am, u)), rolePill),
              el("div", { class: "pv2__time" }, App.util.timeAgo(p.createdAt) + " atrás")));
          authorWrap.appendChild(left);
          if (p.userId !== me.id) {
            App.repo.isFollowing(p.userId).then(function (f) {
              var fb = ui.Button({ label: f ? "Seguindo" : "Seguir", icon: f ? "check" : "plus", size: "sm", variant: f ? "outline" : "primary" });
              fb.classList.add("pv2__follow");
              // segue/desfaz no lugar (sem re-render → sem flash branco)
              fb.addEventListener("click", function () {
                if (fb.classList.contains("is-loading")) return;
                fb.setLoading(true);
                App.repo[f ? "unfollow" : "follow"](p.userId).then(function () {
                  f = !f; fb.setLoading(false);
                  App.util.clear(fb);
                  fb.appendChild(App.icon(f ? "check" : "plus", { size: "sm" }));
                  fb.appendChild(el("span", f ? "Seguindo" : "Seguir"));
                  fb.classList.toggle("btn--outline", f);
                  fb.classList.toggle("btn--primary", !f);
                }).catch(function (e) { fb.setLoading(false); ui.toast((e && e.message) || "Falha", "danger"); });
              });
              authorWrap.appendChild(fb);
            });
          }
        });

        var article;
        if (isWiki) {
          // galeria (payload.gallery[] ou cai p/ imagem única)
          var gallery = (p.payload && p.payload.gallery && p.payload.gallery.length) ? p.payload.gallery : (heroImg ? [heroImg] : []);
          var heroCard = heroImg ? el("div", { class: "pv2__wikihero" }, el("div", { class: "pv2__wikiimg", style: { backgroundImage: "url(" + heroImg + ")" } })) : null;
          var label = el("div", { class: "pv2__typelabel" }, App.icon(typeMeta.icon || "shield", { size: "sm", fill: true }), el("span", typeMeta.label || "Wiki"));
          var galleryRow = null;
          if (gallery.length) {
            galleryRow = el("div", { class: "pv2__gallery" });
            gallery.forEach(function (src) { galleryRow.appendChild(el("div", { class: "pv2__gimg", style: { backgroundImage: "url(" + src + ")" } })); });
          }
          article = el("article", { class: "pv2__post pv2__post--wiki" },
            heroCard,
            label,
            p.title ? el("h1", { class: "pv2__title pv2__title--center" }, p.title) : null,
            el("div", { class: "pv2__sep" }),
            authorWrap,
            el("div", { class: "pv2__sep" }),
            p.text ? el("div", { class: "pv2__bodytext" }, App.markup.render(p.text, { media: p.payload && p.payload.media })) : null,
            galleryRow ? el("div", { class: "pv2__sep" }) : null,
            galleryRow);
        } else {
          // genérico: corpo + faixa "Imagens" + anexo (thumb)
          var bodyNode = postBody(p);
          var imgs = coverArr.length ? coverArr.slice() : ((p.payload && p.payload.gallery && p.payload.gallery.length) ? p.payload.gallery : (heroImg ? [heroImg] : []));
          var attachSec = null;
          if (imgs.length) {
            var grid = el("div", { class: "pv2__attach" });
            imgs.forEach(function (src) {
              var ai = el("div", { class: "pv2__attachimg", style: { backgroundImage: "url(" + src + ")", cursor: "zoom-in" } });
              ai.addEventListener("click", function () { if (App.components.openImageViewer) App.components.openImageViewer(src); });
              grid.appendChild(ai);
            });
            attachSec = el("div", { class: "pv2__comments" },
              el("div", { class: "pv2__clabel" }, el("span", "Imagens"), el("span", { class: "pv2__ccount" }, String(imgs.length))),
              grid);
          }
          article = el("article", { class: "pv2__post" },
            titleEl,
            el("div", { class: "pv2__sep" }),
            authorWrap,
            el("div", { class: "pv2__sep" }),
            el("div", { class: "pv2__bodytext" }, bodyNode),
            attachSec);
        }

        // ----- comentários reais (persistem + renderizam) -----
        function mediaGrid(media) {
          if (!media || !media.length) return null;
          var g = el("div", { class: "pv2__cmedia" });
          media.slice(0, 5).forEach(function (m) {
            if (m.type === "video") { g.appendChild(el("video", { class: "pv2__cmediaitem", src: m.src, controls: true, playsinline: true })); return; } // legado
            var node = el("div", { class: "pv2__cmediaitem", style: { backgroundImage: "url(" + m.src + ")", cursor: "zoom-in" } });
            node.addEventListener("click", function () { if (App.components.openImageViewer) App.components.openImageViewer(m.src); });
            g.appendChild(node);
          });
          return g;
        }
        var replyTo = null; // comentário sendo respondido { id, name }
        // realça @menções no texto do comentário (@ só no início ou após espaço — não pega e-mails)
        function mentionNodes(text) {
          text = String(text || "");
          var out = [], re = /(^|\s)@([a-zA-Z0-9_.]+)/g, last = 0, m;
          while ((m = re.exec(text)) !== null) {
            var at = m.index + m[1].length; // posição do '@'
            if (at > last) out.push(text.slice(last, at));
            out.push(el("span", { class: "pv2__mention" }, "@" + m[2]));
            last = at + 1 + m[2].length;
          }
          if (last < text.length) out.push(text.slice(last));
          return out;
        }
        function crow(c, isReply) {
          var name = c.name || "Usuário";
          var mine = c.userId === me.id;
          var clikes = Array.isArray(c.likes) ? c.likes : [];
          var iLiked = clikes.indexOf(me.id) >= 0;
          var likeBtn = el("button", { class: "pv2__caction" + (iLiked ? " is-on" : ""), type: "button" },
            App.icon("heart", { size: "sm", fill: iLiked }), el("span", String(clikes.length)));
          likeBtn.addEventListener("click", function () { App.repo.toggleLikeComment(c.id).then(paintComments); });
          var replyBtn = el("button", { class: "pv2__caction", type: "button" }, App.icon("comment", { size: "sm" }), el("span", "Responder"));
          replyBtn.addEventListener("click", function () { setReply(c); });
          var actions = [likeBtn, replyBtn];
          if (mine) {
            var editBtn = el("button", { class: "pv2__caction", type: "button" }, App.icon("edit", { size: "sm" }), el("span", "Editar"));
            editBtn.addEventListener("click", function () {
              ui.prompt({ title: "Editar comentário", label: "Texto", value: c.text || "", multiline: true, confirmLabel: "Salvar" }).then(function (val) {
                if (val == null) return;
                App.repo.editComment(c.id, val).then(paintComments).catch(function (e) { ui.toast(e.message, "err"); });
              });
            });
            actions.push(editBtn);
          }
          if (mine || canMod) {
            var delBtn = el("button", { class: "pv2__caction pv2__caction--del", type: "button" }, App.icon("trash", { size: "sm" }), el("span", "Excluir"));
            delBtn.addEventListener("click", function () {
              ui.confirm({ title: "Excluir comentário", message: "Remove o comentário" + (isReply ? "." : " e suas respostas."), confirmLabel: "Excluir", danger: true }).then(function (ok) {
                if (!ok) return; App.repo.deleteComment(c.id).then(paintComments).catch(function (e) { ui.toast(e.message, "err"); });
              });
            });
            actions.push(delBtn);
          }
          return el("div", { class: "pv2__crow" + (isReply ? " pv2__crow--reply" : "") },
            ui.Avatar({ name: name, round: true, size: "sm" }),
            el("div", { class: "u-grow" },
              el("strong", name),
              c.editedAt ? el("span", { class: "u-muted", style: { fontSize: "var(--fs-xs)", marginLeft: "6px" } }, "editado") : null,
              c.text ? el("p", { class: "u-dim", style: { fontSize: "var(--fs-sm)" } }, App.markup.render(c.text)) : null,
              mediaGrid(c.media),
              el("div", { class: "pv2__cactions" }, actions)));
        }
        var ccountChip = el("span", { class: "pv2__ccount" }, "0");
        var clist = el("div", { class: "pv2__clist" });
        var commentsSec = el("div", { class: "pv2__comments" },
          el("div", { class: "pv2__clabel" }, el("span", "Comentários"), ccountChip),
          clist);
        function paintComments() {
          App.repo.listComments(p.id).then(function (list) {
            App.util.clear(clist);
            ccountChip.textContent = String(list.length);
            if (!list.length) { clist.appendChild(el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, "Sem comentários ainda. Seja o primeiro.")); return; }
            var roots = list.filter(function (c) { return !c.parentId; });
            var byParent = {};
            list.forEach(function (c) { if (c.parentId) (byParent[c.parentId] = byParent[c.parentId] || []).push(c); });
            roots.forEach(function (c) {
              clist.appendChild(crow(c, false));
              (byParent[c.id] || []).forEach(function (r) { clist.appendChild(crow(r, true)); });
            });
          });
        }
        article.appendChild(commentsSec);
        paintComments();

        // barra inferior fixa: anexar (+) + comentar + confirmar + curtir
        var input = ui.Input({ placeholder: "Comentar...", maxlength: ui.LIMITS.comment });
        input.classList.add("pv2__cinput");
        var pending = [];   // [{type,src}] até 5
        var pendHost = el("div", { class: "pv2__pending" });
        function renderPending() {
          App.util.clear(pendHost);
          pendHost.style.display = pending.length ? "flex" : "none";
          pending.forEach(function (m, i) {
            var thumb = m.type === "video"
              ? el("div", { class: "pv2__pthumb pv2__pthumb--vid" }, App.icon("featured", { size: "sm" }))
              : el("div", { class: "pv2__pthumb", style: { backgroundImage: "url(" + m.src + ")" } });
            thumb.appendChild(el("button", { class: "pv2__prm", type: "button", title: "Remover", onClick: function () { pending.splice(i, 1); renderPending(); } }, App.icon("close", { size: "sm" })));
            pendHost.appendChild(thumb);
          });
        }
        renderPending();
        var fileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, style: { display: "none" } });
        fileInput.addEventListener("change", function () {
          var files = Array.prototype.slice.call(fileInput.files || []);
          files.forEach(function (f) {
            if (pending.length >= 5) { ui.toast("Máximo de 5 por comentário", "danger"); return; }
            if (!App.util.isAllowedMedia(f)) { ui.toast("Só imagem ou GIF (vídeo não permitido)", "danger"); return; }
            App.util.downscaleImage(f, { maxDim: 1280, quality: 0.82 }).then(function (src) {
              if (pending.length < 5) { pending.push({ type: "image", src: src }); renderPending(); }
            }).catch(function () { ui.toast("Falha ao carregar imagem", "danger"); });
          });
          fileInput.value = "";
        });
        var addMediaBtn = el("button", { class: "pv2__add", type: "button", title: "Anexar imagem ou GIF", onClick: function () { if (pending.length >= 5) { ui.toast("Máximo de 5", "danger"); return; } fileInput.click(); } }, App.icon("plus"));

        var replyBanner = el("div", { class: "pv2__replybar", style: { display: "none" } });
        function setReply(c) {
          replyTo = c;
          App.util.clear(replyBanner);
          replyBanner.style.display = "flex";
          replyBanner.appendChild(el("span", { class: "u-truncate" }, App.icon("comment", { size: "sm" }), " Respondendo a " + (c.name || "Usuário")));
          replyBanner.appendChild(el("button", { class: "pv2__replyx", type: "button", title: "Cancelar", onClick: clearReply }, App.icon("close", { size: "sm" })));
          try { input.focus(); } catch (e) {}
        }
        function clearReply() { replyTo = null; replyBanner.style.display = "none"; App.util.clear(replyBanner); }
        function addC() {
          var t = input.value.trim(); if (!t && !pending.length) return;
          App.repo.addComment(p.id, t, pending.slice(), replyTo ? replyTo.id : null).then(function () {
            input.value = ""; pending = []; renderPending(); clearReply(); paintComments();
            sendBtn.classList.remove("is-sent"); void sendBtn.offsetWidth; sendBtn.classList.add("is-sent");
          }).catch(function (e) { ui.toast(e.message || "Falha", "danger"); });
        }
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addC(); } });
        var sendBtn = el("button", { class: "pv2__send", type: "button", title: "Comentar", onClick: addC }, App.icon("send", { size: "sm" }));
        var liked = p.likes.indexOf(me.id) >= 0;
        var likeBtn = ui.LikeButton({ count: p.likes.length, liked: liked, onToggle: function () { return App.repo.toggleLikePost(p.id); } });
        likeBtn.classList.add("pv2__barbtn");
        var bar = el("div", { class: "pv2__bar" }, replyBanner, pendHost,
          el("div", { class: "pv2__barrow" },
            addMediaBtn, fileInput,
            el("div", { class: "pv2__composer" }, el("div", { class: "u-grow" }, input)),
            sendBtn, likeBtn));

        // hero/topbar dentro do scroll: a imagem fica travada (sticky) e o conteúdo desliza por cima
        var page = el("div", { class: "pv2" }, el("div", { class: "pv2__scroll" }, top, article), bar);
        page.style.setProperty("--accent", accent);
        App.util.mount(inner, page);
      });
    return { node: inner, active: "sanguao", title: "Publicação", communityId: cid, immersive: true, flush: true };
  }

  /* tela cheia de notificações */
  function notificationsScreen(ctx) {
    var cid = ctx.params.id;
    var inner = el("div", { class: "view__inner view__inner--flush camino-host" });
    var me = App.store.get("currentUserId");
    Promise.all([App.repo.getCommunity(cid), App.repo.listNotifications(me)]).then(function (rr) {
      var community = rr[0], data = rr[1];
      if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
      var accent = (community.theme && community.theme.accent) || App.store.get("accent");
      var filter = "all";

      function refresh() { App.repo.listNotifications(me).then(function (d) { data = d; paint(); }); }
      var listHost = el("div", { class: "nfull__list" });
      function paint() {
        App.util.clear(listHost);
        var rows = data.filter(function (n) { return n.type !== "message" && (filter === "all" || n.cat === filter || (filter === "invite" && n.type === "roleInvite")); });
        if (!rows.length) { listHost.appendChild(ui.Empty("bell", "Nada por aqui", "Sem notificações nesta aba.")); return; }
        rows.forEach(function (n) {
          listHost.appendChild(notifRow(n, "nfull__row", false, function (nn) { if (nn.to) App.router.navigate(nn.to); }, refresh));
        });
      }
      var tabs = [{ v: "all", label: "Tudo" }, { v: "invite", label: "Convites" }, { v: "mention", label: "Menções" }, { v: "system", label: "Sistema" }];
      var tabbar = el("div", { class: "nfull__tabs" }, tabs.map(function (t) {
        var b = el("button", { class: "nfull__tab" + (t.v === filter ? " is-active" : ""), type: "button" }, t.label);
        b.addEventListener("click", function () { filter = t.v; App.util.qsa(".nfull__tab", tabbar).forEach(function (x) { x.classList.remove("is-active"); }); b.classList.add("is-active"); paint(); });
        return b;
      }));
      var header = el("div", { class: "nfull__head" },
        ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.back("/c/" + cid + "/featured"); } }),
        el("div", { class: "u-grow" }, el("div", { class: "nfull__title" }, "Notificações"), el("div", { class: "nfull__sub u-truncate" }, community.name)),
        ui.IconButton("check", { title: "Marcar todas como lidas", onClick: function () { App.repo.markAllRead(me).then(function () { ui.toast("Notificações lidas", "ok"); refresh(); }); } }));

      var page = el("div", { class: "nfull" }, header, el("div", { class: "nfull__tabwrap" }, tabbar), listHost);
      page.style.setProperty("--accent", accent);
      App.util.mount(inner, page);
      paint();
      // recebe notificações ao vivo enquanto a tela está aberta
      var offNew = App.bus.on("notif:new", function () { if (!document.body.contains(inner)) { offNew(); return; } refresh(); });
    });
    return { node: inner, active: "sanguao", title: "Notificações", communityId: cid, immersive: true, flush: true };
  }

  function openNotifications(anchor, community) {
    var cid = community && community.id, me = App.store.get("currentUserId");
    var NOTIFS = [];
    function load() { App.repo.listNotifications(me).then(function (d) { NOTIFS = d; if (document.body.contains(listHost)) paint(); }); }
    load();

    var filter = "all";
    var listHost = el("div", { class: "notif__list" });
    // painel aberto recebe novas notificações ao vivo
    var offNotifNew = App.bus.on("notif:new", function () { if (!document.body.contains(listHost)) { offNotifNew(); return; } load(); });
    function paint() {
      App.util.clear(listHost);
      var rows = NOTIFS.filter(function (n) { return n.type !== "message" && (filter === "all" || n.cat === filter || (filter === "invite" && n.type === "roleInvite")); });
      if (!rows.length) { listHost.appendChild(App.ui.Empty("bell", "Nada por aqui", "Sem notificações nesta aba.")); return; }
      rows.forEach(function (n) {
        listHost.appendChild(notifRow(n, "notif__row", true, function (nn) { close(); if (nn.to) App.router.navigate(nn.to); }, load));
      });
    }

    var tabs = [{ v: "all", label: "Tudo" }, { v: "invite", label: "Convites" }, { v: "mention", label: "Menções" }, { v: "system", label: "Sistema" }];
    var order = ["all", "invite", "mention", "system"];
    function applyDir(v) {
      var dir = order.indexOf(v) >= order.indexOf(filter) ? "right" : "left";
      listHost.setAttribute("data-dir", dir);
    }
    var tabbar = el("div", { class: "notif__tabs" }, tabs.map(function (t) {
      var b = el("button", { class: "notif__tab" + (t.v === filter ? " is-active" : ""), type: "button" }, t.label);
      b.addEventListener("click", function () { applyDir(t.v); filter = t.v; App.util.qsa(".notif__tab", tabbar).forEach(function (x) { x.classList.remove("is-active"); }); b.classList.add("is-active"); paint(); });
      return b;
    }));

    var panel = el("div", { class: "notif" },
      el("div", { class: "notif__head" }, tabbar,
        el("button", { class: "notif__readall", title: "Opções", onClick: function (e) {
          var opts = [];
          if (cid) opts.push({ icon: "forward", label: "Expandir tudo", onClick: function () { close(); App.router.navigate("/c/" + cid + "/notificacoes"); } });
          opts.push({ icon: "check", label: "Marcar todas como lidas", onClick: function () { App.repo.markAllRead(me).then(function () { App.ui.toast("Notificações lidas", "ok"); load(); var b = anchor.querySelector(".camino-header__badge"); if (b) b.style.display = "none"; }); } });
          if (cid) opts.push({ icon: "settings", label: "Configurar", onClick: function () { close(); App.router.navigate("/c/" + cid + "/config"); } });
          App.ui.openMenu(e.currentTarget, opts);
        } }, App.icon("chevronDown", { size: "sm" }))),
      listHost);
    paint();

    var layer = el("div", { class: "notif-layer" }, panel);
    layer.addEventListener("mousedown", function (e) { if (e.target === layer) close(); });
    function onKey(e) { if (e.key === "Escape") close(); }
    function close() { document.removeEventListener("keydown", onKey); layer.classList.add("is-closing"); setTimeout(function () { layer.remove(); }, 180); }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(layer);

    // posiciona o painel sob o sino (alinhado à direita)
    var r = anchor.getBoundingClientRect();
    panel.style.top = (r.bottom + 10) + "px";
    var right = window.innerWidth - r.right;
    panel.style.right = Math.max(8, right) + "px";
  }

  function communityUI(community, membership, canMod, me, postItems, tab) {
    var cid = community.id;
    var accent = (community.theme && community.theme.accent) || "#7c59ec";

    // ----- Header preto -----
    function unreadNow() { return (App.repo.unreadCount ? App.repo.unreadCount(me.id) : 0) || 0; }
    var notifBadge = el("span", { class: "camino-header__badge" });
    function paintNotifBadge() {
      var n = unreadNow();
      notifBadge.textContent = n > 99 ? "99+" : String(n);
      notifBadge.style.display = n > 0 ? "" : "none";
    }
    var notifBtn = el("button", { class: "camino-header__chat", title: "Notificações", onClick: function (e) { openNotifications(e.currentTarget, community); } },
      App.icon("bell"), notifBadge);
    paintNotifBadge();
    // badge ao vivo: recebe de outros usuários sem re-render (auto-desliga quando o header sai do DOM)
    ["notif:new", "notif:read"].forEach(function (evt) {
      var off = App.bus.on(evt, function () {
        if (!document.body.contains(notifBtn)) { off(); return; }
        paintNotifBadge();
        if (evt === "notif:new") { notifBtn.classList.remove("has-pop"); void notifBtn.offsetWidth; notifBtn.classList.add("has-pop"); }
      });
    });
    var header = el("div", { class: "camino-header" },
      el("button", { class: "camino-header__chat", title: "Voltar ao menu", onClick: function () { App.router.navigate("/sanguao"); } }, App.icon("back")),
      el("button", { class: "camino-header__avatar", onClick: function () { App.router.navigate("/c/" + cid + "/u/" + me.id); } },
        ui.Avatar({ name: nameIn(membership, me), src: (membership && membership.avatar) || me.avatar, round: true, size: "sm" })),
      el("h1", { class: "camino-header__title u-truncate" }, community.name),
      notifBtn,
      el("button", { class: "camino-header__chat", title: "Chats", onClick: function () { App.router.navigate("/c/" + cid + "/chats"); } }, App.icon("chat")));

    // ----- Abas azuis -----
    // ordem e nomes das abas vêm das configurações da comunidade
    var TAB_ICON = { guidelines: "info", featured: "star", latest: "recent", official: "globe", chats: "chat" };
    // feeds = páginas separadas: cada um vira aba própria (tipo/ordem + ícone)
    var FEED_MAP = {
      populares:  { sort: "populares",  type: "all",      icon: "heart" },
      comentados: { sort: "comentados", type: "all",      icon: "comment" },
      posts:      { sort: "recentes",   type: "text",     icon: "edit" },
      imagens:    { sort: "recentes",   type: "image",    icon: "image" },
      enquetes:   { sort: "recentes",   type: "poll",     icon: "featured" },
      perguntas:  { sort: "recentes",   type: "question", icon: "info" },
      quizzes:    { sort: "recentes",   type: "quiz",     icon: "star" },
      links:      { sort: "recentes",   type: "link",     icon: "globe" },
      blogs:      { sort: "recentes",   type: "blog",     icon: "info" },
      wikis:      { sort: "recentes",   type: "wiki",     icon: "star" }
    };
    function tabIcon(t) { return TAB_ICON[t.key] || (FEED_MAP[t.key] && FEED_MAP[t.key].icon) || (t.custom ? "menu" : "info"); }
    var cfgTabs = (community.settings && community.settings.tabs) || [
      { key: "featured", label: "Destaques", on: true }, { key: "latest", label: "Recentes", on: true },
      { key: "guidelines", label: "Diretrizes", on: true }, { key: "official", label: "Oficial", on: true }, { key: "chats", label: "Chats", on: true }
    ];
    // páginas PADRÃO sempre aparecem; feeds/custom só se ligados
    var CORE_LABEL = { featured: "Destaques", latest: "Recentes", guidelines: "Diretrizes", official: "Oficial", chats: "Chats" };
    var CORE_ORDER = ["featured", "latest", "guidelines", "official", "chats"];
    var TABS = cfgTabs.filter(function (t) {
      if (CORE_LABEL[t.key]) return true;   // padrão: SEMPRE
      return t.on !== false;                // feed/custom: só ligadas
    }).map(function (t) { return { key: t.key, label: t.label || CORE_LABEL[t.key], icon: tabIcon(t), custom: !!t.custom, feeds: t.feeds || null }; });
    // garante todas as padrão presentes (mesmo que faltem nas configs)
    CORE_ORDER.forEach(function (k) {
      if (!TABS.some(function (t) { return t.key === k; })) TABS.push({ key: k, label: CORE_LABEL[k], icon: tabIcon({ key: k }), custom: false, feeds: null });
    });
    var validKeys = TABS.map(function (t) { return t.key; });
    var current = validKeys.indexOf(tab) >= 0 ? tab : validKeys[0];
    var activeTabEl = null;
    var tabsEl = el("nav", { class: "camino-tabs" }, TABS.map(function (t) {
      var item = el("a", { class: "camino-tabs__item" + (t.key === current ? " is-active" : ""), href: "#/c/" + cid + "/" + t.key },
        App.icon(t.icon, { size: "sm" }), el("span", t.label));
      if (t.key === current) activeTabEl = item;
      return item;
    }));
    // ao abrir uma aba ela desliza pra dentro da vista (a barra transiciona pro lado)
    requestAnimationFrame(function () {
      if (activeTabEl && activeTabEl.scrollIntoView) activeTabEl.scrollIntoView({ inline: "center", block: "nearest" });
    });

    // ----- Faixa roxa de pins -----
    // faixa de fixados: posts fixados reais (máx. 3), com linha entre eles
    var pinnedItems = postItems.filter(function (it) { return it.post.pinned; }).slice(0, 3);
    var pinned = pinnedItems.length ? el("div", { class: "camino-pins" }) : null;
    if (pinned) pinnedItems.forEach(function (it, i) {
      if (i > 0) pinned.appendChild(el("div", { class: "camino-pin__div" }));
      var p = it.post;
      pinned.appendChild(el("a", { class: "camino-pin", href: "#/c/" + cid + "/p/" + p.id },
        App.icon("pin", { size: "sm" }),
        el("span", { class: "u-truncate" }, p.title || (p.text || "").split("\n")[0].slice(0, 48) || "Publicação")));
    });

    var DAY = 86400000, NOW = Date.now();
    var sorted = postItems.slice().sort(function (a, b) {
      if (!!b.post.pinned !== !!a.post.pinned) return (b.post.pinned ? 1 : 0) - (a.post.pinned ? 1 : 0);
      return b.post.createdAt - a.post.createdAt;
    });
    // destaques marcados pela admin (não expirados); se nenhum, cai p/ recentes
    var feat = sorted.filter(function (x) { return x.post.featuredUntil && x.post.featuredUntil > NOW; });
    // destaques marcados primeiro; completa com os recentes (sem repetir) p/ sempre haver 2/3
    var featIds = {}; feat.forEach(function (x) { featIds[x.post.id] = 1; });
    var pool = feat.concat(sorted.filter(function (x) { return !featIds[x.post.id]; }));
    var featured = pool[0];

    function destacar(p) {
      function setFeat(ms) { App.repo.setFeatured(p.id, NOW + ms).then(function () { ui.toast("Publicação em destaque", "ok"); App.router.resolve(); }); }
      var items = [
        { icon: "star", label: "Destacar por 3 dias", onClick: function () { setFeat(3 * DAY); } },
        { icon: "star", label: "Destacar por 1 semana", onClick: function () { setFeat(7 * DAY); } },
        { icon: "star", label: "Destacar por 1 mês", onClick: function () { setFeat(30 * DAY); } },
        { icon: "calendar", label: "Personalizada...", onClick: function () {
          var inp = ui.Input({ type: "number", value: "5", placeholder: "Dias" });
          var ref = ui.openModal({ title: "Destaque personalizado", scrimClass: "scrim--centered", body: ui.Field("Dias em destaque", inp), actions: [
            ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
            ui.Button({ label: "Destacar", variant: "primary", onClick: function () { setFeat(Math.max(1, +inp.value || 1) * DAY); ref.close(); } })
          ] });
        } }
      ];
      if (p.featuredUntil) items.push({ icon: "close", label: "Remover destaque", danger: true, onClick: function () { App.repo.setFeatured(p.id, null).then(function () { ui.toast("Destaque removido"); App.router.resolve(); }); } });
      ui.openActionSheet(items, { title: "Destacar publicação" });
    }
    // ações reutilizáveis no feed (link real, salvar, fixar, editar, denunciar, excluir)
    function sharePost(p) {
      var link = location.origin + location.pathname + "#/c/" + cid + "/p/" + p.id;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { ui.toast("Link copiado", "ok"); }, function () { ui.toast("Link: " + link); });
      else ui.toast("Link: " + link);
    }
    function feedEdit(p) {
      App.store.set("editPost", p);
      App.router.navigate("/c/" + cid + "/criar-post?edit=" + p.id);
    }
    function feedReport(p) {
      ui.prompt({ title: "Denunciar publicação", label: "Motivo (opcional)", multiline: true, confirmLabel: "Enviar denúncia" }).then(function (val) {
        if (val == null) return;
        App.repo.reportContent("post", p.id, val, cid).then(function () { ui.toast("Denúncia enviada", "danger"); });
      });
    }
    function feedDelete(p) {
      ui.confirm({ title: "Excluir publicação", message: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir", danger: true }).then(function (ok) {
        if (!ok) return;
        App.repo.deletePost(p.id).then(function () { ui.toast("Publicação excluída"); App.router.resolve(); }).catch(function (e) { ui.toast(e.message, "err"); });
      });
    }
    function postMenu(anchor, p, open) {
      var saved = App.repo.isSaved && App.repo.isSaved(p.id);
      var items = [
        { icon: "forward", label: "Abrir publicação", onClick: open },
        { icon: "send", label: "Compartilhar", onClick: function () { sharePost(p); } },
        { icon: "star", label: saved ? "Remover dos salvos" : "Salvar", onClick: function () { App.repo.toggleSavePost(p.id).then(function (now) { ui.toast(now ? "Salvo" : "Removido dos salvos", "ok"); }); } }
      ];
      if (p.userId === me.id || canMod) items.push({ icon: "edit", label: "Editar", onClick: function () { feedEdit(p); } });
      if (p.userId === me.id || canMod) items.push({ sep: true }, { icon: "trash", label: "Excluir publicação", danger: true, onClick: function () { feedDelete(p); } });
      if (p.userId !== me.id) items.push({ icon: "ban", label: "Denunciar", danger: true, onClick: function () { feedReport(p); } });
      if (canMod) items.push({ sep: true }, { icon: "shield", iconFill: true, label: "Administração", onClick: function () { adminMenu(anchor, p, function () { App.router.resolve(); }); } });
      ui.openMenu(anchor, items);
    }

    // ----- Card destaque grande -----
    function bigCard(item) {
      if (!item) return el("div", { class: "camino-feature camino-feature--empty" }, el("span", "Sem publicações em destaque ainda."));
      var p = item.post, u = item.user;
      var mediaStyle = p.payload && p.payload.image ? { backgroundImage: "url(" + p.payload.image + ")" } : {};
      return el("article", { class: "camino-feature", onClick: function () { App.router.navigate("/c/" + cid + "/p/" + p.id); } },
        el("div", { class: "camino-feature__media", style: mediaStyle }),
        el("div", { class: "camino-feature__body" },
          el("h2", { class: "camino-feature__title" }, "『 " + (p.text.split("\n")[0].slice(0, 40) || "Publicação") + " 』"),
          el("div", { class: "camino-feature__more" }, "LER MAIS"),
          el("div", { class: "camino-feature__stats" },
            el("span", { class: "camino-stat" }, App.icon("heart", { size: "sm", fill: true }), String(p.likes.length)),
            el("span", { class: "camino-stat" }, App.icon("comment", { size: "sm", fill: true }), String(p.comments)),
            el("span", { class: "u-grow" }),
            el("button", { class: "camino-share", onClick: function (e) { e.stopPropagation(); sharePost(p); } }, App.icon("send", { size: "sm" })))));
    }

    // ----- More Featured Posts (mini cards) -----
    function miniCard(item, i) {
      var p = item.post, u = item.user;
      var mediaStyle = p.payload && p.payload.image ? { backgroundImage: "url(" + p.payload.image + ")" } : {};
      return el("article", { class: "camino-mini", onClick: function () { App.router.navigate("/c/" + cid + "/p/" + p.id); } },
        el("div", { class: "camino-mini__media", style: mediaStyle }),
        el("div", { class: "camino-mini__title u-truncate" }, p.text.split("\n")[0].slice(0, 22) || ("Post " + (i + 1))),
        el("div", { class: "camino-mini__stats" },
          el("span", { class: "camino-stat" }, App.icon("heart", { size: "sm", fill: true }), String(p.likes.length)),
          el("span", { class: "camino-stat" }, App.icon("comment", { size: "sm", fill: true }), String(p.comments))));
    }
    var moreRail = el("div", { class: "camino-mini-rail" });
    var moreItems = pool.slice(1);
    moreItems.slice(0, 3).forEach(function (it, i) { moreRail.appendChild(miniCard(it, i)); });
    if (moreItems.length > 3) {
      var peek = moreItems[3].post;
      var peekStyle = peek.payload && peek.payload.image ? { backgroundImage: "url(" + peek.payload.image + ")" } : {};
      var allCard = el("article", { class: "camino-mini camino-mini--all", role: "button", tabindex: "0" },
        el("div", { class: "camino-mini__media camino-mini__media--blur", style: peekStyle }),
        el("div", { class: "camino-mini__allinner" },
          App.icon("more", { size: "lg" }),
          el("div", { class: "camino-mini__alllbl" }, "Ver todos"),
          el("div", { class: "camino-mini__allcount" }, "+" + (moreItems.length - 3))));
      allCard.addEventListener("click", function () { openAllFeatured(pool); });
      allCard.addEventListener("keydown", function (e) { if (e.key === "Enter") openAllFeatured(pool); });
      moreRail.appendChild(allCard);
    }
    if (pool.length <= 1) moreRail.appendChild(el("div", { class: "camino-mini camino-mini--empty" }, "Sem mais posts"));

    // interface com TODAS as publicações em destaque (abre do card "Ver todos")
    function openAllFeatured(items) {
      var grid = el("div", { class: "allfeat-grid" });
      items.forEach(function (it) {
        var p = it.post;
        var ms = p.payload && p.payload.image ? { backgroundImage: "url(" + p.payload.image + ")" } : {};
        var card = el("article", { class: "allfeat-card", role: "button", tabindex: "0" },
          el("div", { class: "allfeat-card__media", style: ms },
            p.featuredUntil && p.featuredUntil > NOW ? el("span", { class: "allfeat-card__badge" }, App.icon("featured", { size: "sm", fill: true }), "Destaque") : null,
            el("div", { class: "allfeat-card__scrim" }),
            el("div", { class: "allfeat-card__title u-truncate" }, "『 " + (p.text.split("\n")[0].slice(0, 28) || "Publicação") + " 』")),
          el("div", { class: "allfeat-card__stats" },
            el("span", { class: "camino-stat" }, App.icon("heart", { size: "sm", fill: true }), String(p.likes.length)),
            el("span", { class: "camino-stat" }, App.icon("comment", { size: "sm", fill: true }), String(p.comments))));
        card.addEventListener("click", function () { close(); App.router.navigate("/c/" + cid + "/p/" + p.id); });
        grid.appendChild(card);
      });
      var sheet = el("div", { class: "act-sheet" },
        el("div", { class: "act-grab" }),
        el("div", { class: "act-head" },
          el("div", { class: "act-title" }, App.icon("featured", { size: "sm", fill: true }), "Em destaque"),
          ui.IconButton("close", { title: "Fechar", onClick: function () { close(); } })),
        el("div", { class: "act-scroll" }, grid));
      var scrim = el("div", { class: "scrim scrim--sheet act-scrim" }, sheet);
      scrim.style.setProperty("--accent", accent);
      function close() { scrim.classList.add("is-closing"); setTimeout(function () { scrim.remove(); }, 200); document.removeEventListener("keydown", onKey); }
      function onKey(e) { if (e.key === "Escape") close(); }
      scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(scrim);
    }

    // ----- Destaque 2 e 3 (quadrados menores, bloco separado) -----
    function squareCard(item, n) {
      var p = item.post;
      var mediaStyle = p.payload && p.payload.image ? { backgroundImage: "url(" + p.payload.image + ")" } : {};
      return el("article", { class: "camino-fsq", onClick: function () { App.router.navigate("/c/" + cid + "/p/" + p.id); } },
        el("div", { class: "camino-fsq__media", style: mediaStyle },
          el("div", { class: "camino-fsq__scrim" }),
          el("div", { class: "camino-fsq__title u-truncate" }, "『 " + (p.text.split("\n")[0].slice(0, 24) || "Publicação") + " 』"),
          el("div", { class: "camino-fsq__stats" },
            el("span", { class: "camino-stat" }, App.icon("heart", { size: "sm", fill: true }), String(p.likes.length)),
            el("span", { class: "camino-stat" }, App.icon("comment", { size: "sm", fill: true }), String(p.comments)),
            el("span", { class: "u-grow" }),
            el("button", { class: "camino-share", onClick: function (e) { e.stopPropagation(); sharePost(p); } }, App.icon("send", { size: "sm" })))));
    }
    var featDuo = el("div", { class: "camino-fduo" });
    if (pool[1]) featDuo.appendChild(squareCard(pool[1], 2));
    if (pool[2]) featDuo.appendChild(squareCard(pool[2], 3));

    // ----- Latest (lista) -----
    function postCard(it) {
      var p = it.post, u = it.user || { id: p.userId, name: "Usuário", avatar: null };
      var liked = p.likes.indexOf(me.id) >= 0;
      var likeBtn = ui.LikeButton({ count: p.likes.length, liked: liked, onToggle: function () { return App.repo.toggleLikePost(p.id); } });
      function open() { App.router.navigate("/c/" + cid + "/p/" + p.id); }
      var commentBtn = el("button", { class: "camino-stat", onClick: function (e) { e.stopPropagation(); open(); } }, App.icon("comment", { size: "sm" }), String(p.comments));
      return el("article", { class: "camino-post post-anim", onClick: open },
        el("div", { class: "camino-post__head" },
          el("a", { href: "#/c/" + cid + "/u/" + u.id, onClick: function (e) { e.stopPropagation(); } }, ui.Avatar({ name: u.name, src: u.avatar, round: true, size: "sm" })),
          el("div", { class: "u-grow" },
            el("a", { class: "camino-post__author", href: "#/c/" + cid + "/u/" + u.id, onClick: function (e) { e.stopPropagation(); } }, u.name),
            el("div", { class: "camino-post__time" }, (p.pinned ? "📌 Fixado · " : "") + (p.featuredUntil && p.featuredUntil > NOW ? "⭐ Destaque · " : "") + App.util.timeAgo(p.createdAt) + " atrás" + (p.editedAt ? " · editado" : ""))),
          el("button", { class: "camino-post__more", onClick: function (e) { e.stopPropagation(); postMenu(e.currentTarget, p, open); } }, App.icon("more", { size: "sm" }))),
        p.title ? el("div", { class: "camino-post__title" }, p.title) : null,
        postBody(p),
        el("div", { class: "camino-post__stats" }, likeBtn, commentBtn));
    }
    // ----- feed (ordem/tipo definidos pela página atual) -----
    var feedSort = "recentes", feedType = "all", restrictTypes = [];
    var latestList = el("div", { class: "camino-latest" });
    function applyFeed() {
      function bySort(a, b) {
        if (feedSort === "populares") return b.post.likes.length - a.post.likes.length;
        if (feedSort === "comentados") return (b.post.comments || 0) - (a.post.comments || 0);
        return b.post.createdAt - a.post.createdAt;
      }
      // fixados aparecem SEMPRE no topo, mesmo com filtro de tipo ativo
      var pinned = sorted.filter(function (it) { return it.post.pinned; }).sort(bySort);
      var rest = sorted.filter(function (it) { return !it.post.pinned; });
      if (feedType !== "all") rest = rest.filter(function (it) { return it.post.type === feedType; });
      else if (restrictTypes.length) rest = rest.filter(function (it) { return restrictTypes.indexOf(it.post.type) >= 0; }); // página custom: "Tudo" = união dos feeds dela
      rest.sort(bySort);
      var arr = pinned.concat(rest);
      App.util.clear(latestList);
      if (!arr.length) { latestList.appendChild(ui.Empty("comment", "Nada por aqui", "Tente outro filtro.")); return; }
      arr.forEach(function (it) { latestList.appendChild(postCard(it)); });
    }
    // ----- feed da PÁGINA atual -----
    // página de feed (Posts/Imagens/...) define tipo+ordem; custom = união dos feeds dela.
    var curPage = (cfgTabs.filter(function (t) { return t.key === current; })[0]) || {};
    if (FEED_MAP[current]) {
      feedType = FEED_MAP[current].type; feedSort = FEED_MAP[current].sort;
    } else if (curPage.custom && curPage.feeds && curPage.feeds.length) {
      restrictTypes = curPage.feeds.map(function (k) { return FEED_MAP[k] && FEED_MAP[k].type; })
        .filter(function (t, i, a) { return t && t !== "all" && a.indexOf(t) === i; });
      feedType = "all"; feedSort = "recentes";
    }
    applyFeed();

    // ----- Chats públicos (grade estilo "hangout") -----
    var hangoutAccent = (community.theme && community.theme.accent) || App.store.get("accent");
    var chatsGrid = el("div", { class: "hangout-grid" });
    function hangoutCard(ch) {
      var coverStyle = community.cover
        ? { backgroundImage: "url(" + community.cover + ")" }
        : { background: "linear-gradient(160deg," + hangoutAccent + "," + App.store.color.shade(hangoutAccent, -38) + ")" };
      var card = el("article", { class: "hangout-card", role: "button", tabindex: "0" },
        el("div", { class: "hangout-card__bg", style: coverStyle }),
        el("div", { class: "hangout-card__scrim" }),
        el("div", { class: "hangout-card__body" },
          el("div", { class: "hangout-card__name u-truncate" }, (ch.visibility === "private" ? App.icon("lock", { size: "sm" }) : null), ch.name),
          el("div", { class: "hangout-card__meta" },
            el("span", { class: "hangout-card__count" }, App.icon("members", { size: "sm" }), String(community.memberCount || 0)),
            el("span", { class: "hangout-card__time" }, ch.lastMessageAt ? App.util.timeAgo(ch.lastMessageAt) : "agora"))));
      function go() { App.router.navigate("/chats/" + ch.id); }
      card.addEventListener("click", go);
      card.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
      return card;
    }
    var chatsSection = el("div", { class: "camino-chats" }, chatsGrid);
    App.repo.listChats(cid, { visibility: "public" }).then(function (list) {
      App.util.clear(chatsGrid);
      if (!list.length) { chatsGrid.appendChild(el("div", { class: "u-muted", style: { padding: "var(--s-3)", gridColumn: "1 / -1" } }, "Sem chats públicos ainda.")); return; }
      list.forEach(function (ch) { chatsGrid.appendChild(hangoutCard(ch)); });
    });

    // ----- Conteúdo por aba -----
    var content = el("div", { class: "camino-content" });
    if (current === "guidelines") {
      content.appendChild(el("div", { class: "camino-section camino-guidelines" },
        el("h3", { class: "camino-h" }, "Diretrizes"),
        community.description ? el("div", { class: "u-dim mk-body" }, App.markup.render(community.description)) : el("p", { class: "u-dim" }, "Sem diretrizes definidas."),
        el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, "Respeite os membros, credite criadores e use os canais certos.")));
    } else if (current === "chats") {
      content.appendChild(chatsSection);
    } else if (current === "latest") {
      content.appendChild(latestList);
    } else if (current === "official") {
      // oficial = curadoria da administração: posts fixados ou em destaque
      var officialList = el("div", { class: "camino-latest" });
      var official = sorted.filter(function (it) { return it.post.pinned || (it.post.featuredUntil && it.post.featuredUntil > NOW); });
      if (!official.length) officialList.appendChild(ui.Empty("info", "Nada oficial ainda", "Posts fixados ou destacados pela administração aparecem aqui."));
      else official.forEach(function (it) { officialList.appendChild(postCard(it)); });
      content.appendChild(officialList);
    } else if (current === "featured") {
      // Featured = hub: destaque + mais + CHATS públicos + todas publicações
      if (pinned) content.appendChild(pinned);
      content.appendChild(bigCard(featured));
      if (pool[1]) content.appendChild(featDuo);
      // "Mais Destaques" só quando há MAIS DE 3 publicações em destaque (senão fica vazio/"Sem mais posts")
      if (feat.length > 3) {
        content.appendChild(el("h3", { class: "camino-h camino-h--pad" }, "Mais Destaques"));
        content.appendChild(moreRail);
      }
      content.appendChild(el("div", { class: "camino-latest-bar" }, "Todas as publicações"));
      content.appendChild(latestList);
    } else if (FEED_MAP[current] || (curPage.custom && curPage.feeds && curPage.feeds.length)) {
      // página de FEED (Posts/Imagens/Wikis...) ou custom com feeds → lista filtrada
      content.appendChild(latestList);
    } else {
      // página personalizada sem feeds → orienta configurar
      var curLabel = (TABS.filter(function (t) { return t.key === current; })[0] || {}).label || "Página";
      content.appendChild(el("div", { class: "camino-section" },
        el("h3", { class: "camino-h" }, curLabel),
        ui.Empty("info", "Página vazia", "Adicione feeds a esta página nas configurações da comunidade.")));
    }

    // ----- Dock central flutuante (não rola, sem fundo de container) -----
    // estimativa inicial ≤ membros; refinada com os membros reais abaixo
    var onlineCount = Math.max(1, Math.min(community.memberCount || 1, Math.round((community.memberCount || 1) * 0.66)));
    function dockItem(icon, label, active, onClick) {
      var b = el("button", { class: "camino-dock__item" + (active ? " is-active" : ""), type: "button" }, App.icon(icon, { size: "sm", fill: true }), el("span", label));
      b.addEventListener("click", onClick);
      return b;
    }
    var createBtn = el("button", { class: "camino-dock__create", type: "button", title: "Criar publicação" }, App.icon("plus"));
    createBtn.addEventListener("click", function (e) {
      if (App.preview && App.preview.active(cid)) { ui.toast("Disponível depois de criar a comunidade", "ok"); return; }
      if (!membership) { ui.toast("Participe para publicar", "danger"); return; }
      openCreateMenu(e.currentTarget, community);
    });

    // item "Online" DENTRO da barra (presença real; ponto verde sobrevive ao modo icon-only do mobile)
    var onlineItem = el("button", { class: "camino-dock__item camino-dock__item--online", type: "button", title: "Atividade / online" },
      App.icon("bolt", { size: "sm" }),
      el("span", { class: "camino-online-count" }, App.util.formatCount(ONLINE.size) + " online"));
    onlineItem.addEventListener("click", function () { openActivityPanel(community); });

    var dock = el("div", { class: "camino-dock" },
      // barra única: Menu · Online · (+) · Chat · Eu
      el("div", { class: "camino-dock__bar" },
        dockItem("menu", "Menu", false, function () { openSidePanel(community, membership, canMod, me); }),
        onlineItem,
        createBtn,
        dockItem("chat", "Chat", false, function () {
          if (App.preview && App.preview.active(cid)) { ui.toast("Disponível depois de criar a comunidade", "ok"); return; }
          if (!membership) { ui.toast("Participe para abrir o chat", "danger"); return; }
          App.router.navigate("/c/" + cid + "/chats");
        }),
        dockItem("profile", "Eu", false, function () { App.router.navigate("/c/" + cid + "/u/" + me.id); })));

    var page = el("div", { class: "camino" }, header, tabsEl, content, dock);
    // paleta derivada do acento (shade<0 escurece, >0 clareia)
    var sh = App.store.color.shade, hexA = App.store.color.hexA;
    page.style.setProperty("--c-base", accent);
    page.style.setProperty("--c-tabs", sh(accent, -22));   // abas: médio-escuro
    page.style.setProperty("--c-pins", sh(accent, -42));   // pins: escuro
    page.style.setProperty("--c-bar",  sh(accent, -30));   // faixa recentes: escuro p/ contraste c/ texto branco
    page.style.setProperty("--c-fab",  accent);
    page.style.setProperty("--c-tint", hexA(accent, 0.16));
    page.style.setProperty("--c-line", sh(accent, -55));

    // === Efeito vidro do dock (portal) ===
    // backdrop-filter NÃO desfoca conteúdo rolado quando o elemento fixo vive
    // dentro de um container com overflow (.view é o scroller). Movemos o dock
    // pro <body> (fora do scroller) → o vidro passa a desfocar o feed atrás.
    dock.style.setProperty("--c-base", accent);
    dock.style.setProperty("--c-fab", accent);
    var prevDock = document.getElementById("camino-dock-portal");
    if (prevDock) prevDock.remove();
    dock.id = "camino-dock-portal";
    requestAnimationFrame(function () {
      if (!page.isConnected) return;                 // tela já trocou antes de pintar
      document.body.appendChild(dock);               // sai do scroller → backdrop real
      var mo = new MutationObserver(function () {
        if (!page.isConnected) { dock.remove(); mo.disconnect(); }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
    return page;
  }

  /* cor de fundo do ícone por tipo (estilo do modelo) */
  var TYPE_COLOR = {
    text: "#ef9aa0", blog: "#7c59ec", image: "#36d399", poll: "#3b82f6",
    quiz: "#ffcf5c", link: "#14b8a6", question: "#ff5470", wiki: "#a855f7"
  };

  /* menu de Administração do post (staff): destacar c/ prazo, ocultar, deletar */
  function adminMenu(anchor, p, onChange) {
    var ui = App.ui, DAY = 86400000;
    var DUR = [["1 dia", 1], ["3 dias", 3], ["7 dias", 7], ["1 mês", 30]];
    function refresh() { if (onChange) onChange(); }
    var items = [
      { icon: "featured", iconFill: true, label: p.featuredUntil ? "Remover destaque" : "Destacar", onClick: function () {
        if (p.featuredUntil) { App.repo.setFeatured(p.id, null).then(function () { ui.toast("Destaque removido"); refresh(); }); return; }
        ui.openMenu(anchor, DUR.map(function (d) {
          return { icon: "featured", iconFill: true, label: d[0], onClick: function () {
            App.repo.setFeatured(p.id, Date.now() + d[1] * DAY).then(function () { ui.toast("Destacado por " + d[0], "ok"); refresh(); }).catch(function (e) { ui.toast(e.message, "err"); });
          } };
        }));
      } },
      { icon: "hide", iconFill: true, label: p.hidden ? "Mostrar" : "Ocultar", onClick: function () {
        App.repo.setPostHidden(p.id, !p.hidden).then(function () { ui.toast(p.hidden ? "Publicação visível" : "Publicação ocultada"); refresh(); }).catch(function (e) { ui.toast(e.message, "err"); });
      } },
      { icon: "pin", iconFill: true, label: p.pinned ? "Desafixar" : "Fixar", onClick: function () {
        App.repo.togglePin(p.id).then(function (np) { ui.toast(np.pinned ? "Fixado" : "Desafixado", "ok"); refresh(); }).catch(function (e) { ui.toast(e.message, "err"); });
      } },
      { sep: true },
      { icon: "trash", iconFill: true, label: "Deletar", danger: true, onClick: function () {
        ui.confirm({ title: "Deletar publicação", message: "Esta ação não pode ser desfeita.", confirmLabel: "Deletar", danger: true }).then(function (ok) {
          if (ok) App.repo.deletePost(p.id).then(function () { ui.toast("Publicação deletada"); refresh(); }).catch(function (e) { ui.toast(e.message, "err"); });
        });
      } }
    ];
    ui.openMenu(anchor, items);
  }

  /* painel "Atividade em círculo": online + proprietário/admins/mods (abre do chip online) */
  function openActivityPanel(community) {
    var cid = community.id;
    var accent = (community.theme && community.theme.accent) || App.store.get("accent");

    var grab = el("div", { class: "act-grab" });
    var closeBtn = ui.IconButton("close", { title: "Fechar", onClick: function () { close(); } });
    var onlineNum = el("span", App.util.formatCount(0));
    var totalNum = el("span", App.util.formatCount(community.memberCount || 0));
    var head = el("div", { class: "act-head" },
      el("div", { class: "act-title" }, App.icon("featured", { size: "sm", fill: true }), "Atividade em círculo"),
      el("div", { class: "act-counts" },
        el("span", { class: "act-pill act-pill--on" }, el("span", { class: "act-dot act-dot--on" }), onlineNum),
        el("span", { class: "act-pill" }, el("span", { class: "act-dot" }), totalNum),
        closeBtn));
    var sheet = el("div", { class: "act-sheet" }, grab, head);
    var scroll = el("div", { class: "act-scroll" });
    sheet.appendChild(scroll);

    function memberRow(x, compact) {
      var u = x.user, m = x.membership, nm = m.nickname || u.name;
      return el("a", { class: "act-row", href: "#/c/" + cid + "/u/" + u.id },
        (function () { var a = ui.Avatar({ name: nm, src: m.avatar || u.avatar, round: true, size: "sm" }); return a; })(),
        el("span", { class: "act-row__name u-truncate" }, nm));
    }
    function section(icon, title, rows, rail, iconFill) {
      if (!rows.length) return null;
      var head = el("div", { class: "act-sec__head" },
        el("div", { class: "act-sec__title" }, App.icon(icon, { size: "sm", fill: iconFill }), title),
        rows.length > 6 ? el("span", { class: "act-sec__all" }, "Ver tudo") : null);
      var body = rail
        ? el("div", { class: "act-rail" }, rows.slice(0, 16).map(function (x) {
            var u = x.user, m = x.membership, nm = m.nickname || u.name;
            return el("a", { class: "act-railitem", href: "#/c/" + cid + "/u/" + u.id },
              ui.Avatar({ name: nm, src: m.avatar || u.avatar, round: true }),
              el("span", { class: "act-railitem__name u-truncate" }, nm));
          }))
        : el("div", { class: "act-list" }, rows.slice(0, 6).map(function (x) { return memberRow(x); }));
      return el("div", { class: "act-sec" }, head, body);
    }

    var allList = [];
    function renderSections() {
      App.util.clear(scroll);
      var online = allList.filter(function (x) { return ONLINE.has(x.user.id); });   // presença REAL
      onlineNum.textContent = App.util.formatCount(online.length);
      totalNum.textContent = App.util.formatCount(allList.length);
      var owner = allList.filter(function (x) { return x.membership.role === "owner"; });
      var admins = allList.filter(function (x) { return x.membership.role === "admin" || x.membership.role === "lider"; });
      var mods = allList.filter(function (x) { return x.membership.role === "mod" || x.membership.role === "curador"; });
      [
        section("plus", "Online agora", online, true),
        section("crown", "Proprietário", owner, false, true),
        section("shield", "Administradores", admins, false),
        section("shield", "Mods", mods, false)
      ].forEach(function (s) { if (s) scroll.appendChild(s); });
      if (!scroll.childElementCount) scroll.appendChild(ui.Empty("members", "Sem atividade", "Ninguém online agora."));
    }
    App.repo.listMembers(cid).then(function (list) { allList = list; renderSections(); });
    // atualiza ao vivo quando a presença muda (limpo no close)
    presencePanelCbs.push(renderSections);

    var scrim = el("div", { class: "scrim scrim--sheet act-scrim" }, sheet);
    scrim.style.setProperty("--accent", accent);
    function close() {
      var i = presencePanelCbs.indexOf(renderSections); if (i >= 0) presencePanelCbs.splice(i, 1);
      scrim.classList.add("is-closing"); setTimeout(function () { scrim.remove(); }, 200);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousemove", dragMove); document.removeEventListener("touchmove", dragMove);
      document.removeEventListener("mouseup", dragEnd); document.removeEventListener("touchend", dragEnd);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
    document.addEventListener("keydown", onKey);

    // arrastar a alça/cabeçalho pra baixo fecha
    var startY = null, curY = 0, dragging = false;
    function clientY(e) { return e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY; }
    function dragStart(e) { startY = clientY(e); dragging = true; curY = 0; sheet.style.transition = "none"; }
    function dragMove(e) {
      if (!dragging) return;
      curY = Math.max(0, clientY(e) - startY);
      sheet.style.transform = "translateY(" + curY + "px)";
      if (e.cancelable) e.preventDefault();
    }
    function dragEnd() {
      if (!dragging) return; dragging = false; sheet.style.transition = "";
      if (curY > 110) { sheet.style.transform = "translateY(100%)"; close(); }
      else { sheet.style.transform = ""; }
      curY = 0;
    }
    [grab, head].forEach(function (h) {
      h.style.touchAction = "none"; h.style.cursor = "grab";
      h.addEventListener("mousedown", dragStart);
      h.addEventListener("touchstart", dragStart, { passive: true });
    });
    document.addEventListener("mousemove", dragMove);
    document.addEventListener("touchmove", dragMove, { passive: false });
    document.addEventListener("mouseup", dragEnd);
    document.addEventListener("touchend", dragEnd);

    document.body.appendChild(scrim);
  }

  /* player de quiz em tela cheia: uma pergunta por vez, placar e melhor resultado */
  function openQuiz(post) {
    var pl = post.payload || {};
    var questions = Array.isArray(pl.questions) ? pl.questions.filter(function (q) { return q && q.options && q.options.length >= 2; }) : [];
    if (!questions.length) { ui.toast("Este quiz ainda não tem perguntas", "danger"); return; }
    var idx = 0, score = 0, locked = false;

    var scrim = el("div", { class: "scrim scrim--centered quiz-scrim" });
    var card = el("div", { class: "quiz-play" });
    scrim.appendChild(card);
    function close() { scrim.classList.add("is-closing"); setTimeout(function () { scrim.remove(); }, 180); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });

    function renderQuestion() {
      locked = false;
      var q = questions[idx];
      App.util.clear(card);
      // fundo da pergunta (se houver)
      if (q.bg) { card.classList.add("has-bg"); card.style.backgroundImage = "url(" + q.bg + ")"; }
      else { card.classList.remove("has-bg"); card.style.backgroundImage = ""; }
      var bar = el("div", { class: "quiz-play__bar" }, el("div", { class: "quiz-play__fill", style: { width: ((idx) / questions.length * 100) + "%" } }));
      var head = el("div", { class: "quiz-play__head" },
        el("span", { class: "quiz-play__count" }, "Pergunta " + (idx + 1) + "/" + questions.length),
        ui.IconButton("close", { title: "Fechar", onClick: close }));
      var prompt = el("div", { class: "quiz-play__q" }, q.q);
      var opts = el("div", { class: "quiz-play__opts" });
      q.options.forEach(function (opt, i) {
        var b = el("button", { class: "quiz-play__opt", type: "button" }, opt);
        b.addEventListener("click", function () {
          if (locked) return; locked = true;
          var correct = i === q.correct;
          if (correct) score++;
          App.util.qsa(".quiz-play__opt", opts).forEach(function (el2, j) {
            el2.classList.add("is-done");
            if (j === q.correct) el2.classList.add("is-correct");
            else if (j === i) el2.classList.add("is-wrong");
          });
          var next = el("div", { class: "quiz-play__next" },
            ui.Button({ label: idx + 1 < questions.length ? "Próxima" : "Ver resultado", variant: "primary", onClick: function () { idx++; if (idx < questions.length) renderQuestion(); else renderResult(); } }));
          card.appendChild(next);
        });
        opts.appendChild(b);
      });
      card.appendChild(bar); card.appendChild(head); card.appendChild(prompt); card.appendChild(opts);
    }
    function renderResult() {
      App.util.clear(card);
      card.classList.remove("has-bg"); card.style.backgroundImage = "";
      App.repo.recordQuizPlay(post.id, score).then(function () { App.bus.emit("post:updated", post); }).catch(function () {});
      var pct = Math.round(score / questions.length * 100);
      card.appendChild(el("div", { class: "quiz-play__result" },
        el("div", { class: "quiz-play__resicon" }, App.icon("star", { size: "lg", fill: true })),
        el("div", { class: "quiz-play__score" }, score + "/" + questions.length),
        el("div", { class: "u-muted" }, pct + "% de acerto"),
        el("div", { class: "quiz-play__resacts" },
          ui.Button({ label: "Jogar de novo", icon: "recent", variant: "outline", onClick: function () { idx = 0; score = 0; renderQuestion(); } }),
          ui.Button({ label: "Fechar", variant: "primary", onClick: close }))));
    }
    renderQuestion();
    document.body.appendChild(scrim);
  }

  /* painel de criação: lista vertical empilhada, item central destacado */
  function openCreateMenu(anchor, community) {
    var types = ["blog", "image", "poll", "quiz", "link", "question", "wiki"];
    var labels = { blog: "Blog", image: "Imagem", poll: "Enquete", quiz: "Quiz", link: "Link", question: "Pergunta", wiki: "Wiki" };

    var list = el("div", { class: "create-stack__list" });
    types.forEach(function (t) {
      var m = postMeta(t);
      var row = el("button", { class: "create-stack__item", type: "button", "data-type": t },
        el("span", { class: "create-stack__icon", style: { background: TYPE_COLOR[t] || "#888" } }, App.icon(m.icon, { size: "sm" })),
        el("span", { class: "create-stack__label" }, labels[t]));
      row.addEventListener("click", function () {
        // clicar num item não-central só centraliza; central abre
        if (row.classList.contains("is-active")) { close(); App.router.navigate("/c/" + community.id + "/criar-post?tipo=" + t); }
        else centerOn(row);
      });
      list.appendChild(row);
    });

    var items = App.util.qsa(".create-stack__item", list);

    /* item mais próximo do centro do viewport = ativo; distância controla escala/opacidade */
    function update() {
      var mid = list.scrollTop + list.clientHeight / 2;
      var best = null, bestD = Infinity;
      items.forEach(function (r) {
        var c = r.offsetTop + r.offsetHeight / 2;
        var d = Math.abs(c - mid);
        if (d < bestD) { bestD = d; best = r; }
        // proximidade 1 (centro) -> 0 (longe) em ~2 alturas
        var prox = Math.max(0, 1 - d / (r.offsetHeight * 2.2));
        r.style.setProperty("--prox", prox.toFixed(3));
      });
      items.forEach(function (r) { r.classList.toggle("is-active", r === best); });
    }
    function centerOn(row) {
      list.scrollTo({ top: row.offsetTop - (list.clientHeight - row.offsetHeight) / 2, behavior: "smooth" });
    }
    list.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });

    var accent = (community.theme && community.theme.accent) || App.store.get("accent");
    var panel = el("div", { class: "create-stack" },
      el("div", { class: "create-stack__head" }, "Criar"),
      list);
    var scrim = el("div", { class: "scrim scrim--create" }, panel);
    scrim.style.setProperty("--c-base", accent);
    scrim.style.setProperty("--c-item", App.store.color.shade(accent, -38));
    scrim.style.setProperty("--c-active", App.store.color.shade(accent, -12));
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });
    function onKey(e) {
      if (e.key === "Escape") return close();
      var act = list.querySelector(".create-stack__item.is-active");
      var idx = items.indexOf(act);
      if (e.key === "ArrowDown" && idx < items.length - 1) { e.preventDefault(); centerOn(items[idx + 1]); }
      if (e.key === "ArrowUp" && idx > 0) { e.preventDefault(); centerOn(items[idx - 1]); }
      if (e.key === "Enter" && act) { close(); App.router.navigate("/c/" + community.id + "/criar-post?tipo=" + act.getAttribute("data-type")); }
    }
    function close() {
      document.removeEventListener("keydown", onKey);
      scrim.classList.add("is-closing");
      setTimeout(function () { scrim.remove(); }, 200);
    }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
    // centraliza no "Imagem" inicialmente + primeira medição
    window.requestAnimationFrame(function () { centerOn(items[2] || items[0]); window.requestAnimationFrame(update); });
  }

  /* ---------------- Tela de Membros ---------------- */
  var MEMBER_ROLE = { owner: "Dono", admin: "Administrador", lider: "Líder", curador: "Curador", mod: "Mod", member: "Membro" };
  function memberStatusBadge(status) {
    if (!status) return null;
    var map = { ban: ["ban", "Banido"], mute: ["mute", "Silenciado"], hide: ["hide", "Oculto"] };
    var m = map[status.action]; if (!m) return null;
    var label = m[1] + (status.expiresAt ? " · " + App.util.humanDuration(status.expiresAt - Date.now()) : "");
    return el("span", { class: "mod-badge mod-badge--" + status.action }, App.icon(m[0], { size: "sm" }), label);
  }
  function membersScreen(community, membership, canMod, me, inner, ctx) {
    var cid = community.id;
    var accent = (community.theme && community.theme.accent) || App.store.get("accent");

    var listHost = el("div", { class: "member-list" });
    var countEl = el("span", { class: "cmembers__count" }, "");
    var search = el("input", { class: "cmembers__input", type: "search", placeholder: "Buscar membros…", autocomplete: "off", spellcheck: "false" });
    var clearBtn = el("button", { class: "cmembers__clear", type: "button", "aria-label": "Limpar busca" }, App.icon("close", { size: "sm" }));
    clearBtn.addEventListener("click", function () { search.value = ""; search.focus(); applyFilters(); });
    var searchBox = el("div", { class: "cmembers__search" },
      App.icon("search", { cls: "cmembers__search-ic" }),
      search, clearBtn);
    var tagBar = el("div", { class: "cmembers__tags" });
    var all = [];
    var tagFilter = (ctx && ctx.query && ctx.query.tag) ? String(ctx.query.tag) : null;

    function rolePill(role) {
      return el("span", { class: "role-pill role-pill--" + role }, MEMBER_ROLE[role] || "Membro");
    }
    function setTag(t) { tagFilter = (tagFilter === t) ? null : t; paintTags(); applyFilters(); }
    function tagChip(label, count, active) {
      var c = el("button", { class: "member-tagchip" + (active ? " is-on" : ""), type: "button" },
        "#" + label, count != null ? el("span", { class: "member-tagchip__n" }, String(count)) : null);
      c.addEventListener("click", function () { setTag(label); });
      return c;
    }
    function memberTag(t) {
      var c = el("button", { class: "member-row__tag" + (tagFilter === t ? " is-on" : ""), type: "button" }, t);
      c.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); setTag(t); });
      return c;
    }
    function paint(list) {
      App.util.clear(listHost);
      if (!list.length) { listHost.appendChild(ui.Empty("members", "Nenhum membro", tagFilter ? "Ninguém com #" + tagFilter + "." : "Tente outra busca.")); return; }
      list.forEach(function (x) {
        var u = x.user, m = x.membership, nm = m.nickname || u.name;
        var tags = (m.tags || []).slice(0, 3).map(memberTag);
        var seen = lastSeenText(u);   // "visto há X" se offline + permitido
        var avatarWrap = el("span", { class: "member-row__av", "data-presence-uid": u.id }, ui.Avatar({ name: nm, src: m.avatar || u.avatar, round: true, size: "sm" }), el("span", { class: "member-row__dot" }));
        if (ONLINE.has(u.id)) avatarWrap.classList.add("is-online");
        if (m.status && m.status.action === "hide" && (!m.status.expiresAt || m.status.expiresAt > Date.now())) avatarWrap.classList.add("is-hidden");
        var row = el("a", { class: "member-row", href: "#/c/" + cid + "/u/" + u.id },
          avatarWrap,
          el("div", { class: "member-row__body" },
            el("div", { class: "member-row__name" }, nm, rolePill(m.role), m.status ? memberStatusBadge(m.status) : null),
            el("div", { class: "member-row__sub" },
              App.icon("star", { size: "sm", fill: true }), App.util.formatCount(m.reputation || 0) + " rep",
              seen ? el("span", { class: "member-row__seen u-muted" }, " · " + seen) : null,
              tags.length ? el("span", { class: "member-row__tags" }, tags) : null)),
          App.icon("forward", { cls: "u-muted" }));
        listHost.appendChild(row);
      });
    }
    function applyFilters() {
      var q = (search.value || "").trim().toLowerCase();
      searchBox.classList.toggle("has-value", !!search.value);
      var out = all.filter(function (x) {
        if (tagFilter && (x.membership.tags || []).indexOf(tagFilter) < 0) return false;
        if (!q) return true;
        var nm = (x.membership.nickname || x.user.name || "").toLowerCase();
        return nm.indexOf(q) >= 0 || (x.user.handle || "").toLowerCase().indexOf(q) >= 0;
      });
      paint(out);
    }
    search.addEventListener("input", App.util.debounce(applyFilters, 150));

    function paintTags() {
      App.repo.listCommunityTags(cid).then(function (tags) {
        App.util.clear(tagBar);
        if (!tags.length) { tagBar.style.display = "none"; return; }
        tagBar.style.display = "flex";
        if (tagFilter) {
          var clear = el("button", { class: "member-tagchip is-on", type: "button" }, App.icon("close", { size: "sm" }), tagFilter);
          clear.addEventListener("click", function () { tagFilter = null; paintTags(); applyFilters(); });
          tagBar.appendChild(clear);
        }
        tags.slice(0, 12).forEach(function (t) { if (t.tag !== tagFilter) tagBar.appendChild(tagChip(t.tag, t.count, false)); });
      });
    }
    paintTags();

    App.repo.listMembers(cid).then(function (list) {
      all = list;
      countEl.textContent = list.length + (list.length === 1 ? " membro" : " membros");
      applyFilters();
    });

    var header = el("div", { class: "cmembers__head" },
      ui.IconButton("back", { title: "Voltar", onClick: function () { App.router.back("/c/" + cid + "/featured"); } }),
      el("div", { class: "u-grow" }, el("div", { class: "cmembers__title" }, "Membros"), countEl));
    var page = el("div", { class: "cmembers" }, header, el("div", { class: "cmembers__bar" }, searchBox), tagBar, listHost);
    page.style.setProperty("--accent", accent);
    App.util.mount(inner, page);
  }

  /* ---------------- Render ---------------- */
  function render(ctx) {
    var id = ctx.params.id;
    var tab = ctx.params.tab;
    // sempre full-bleed (sem max-width / padding) — a comunidade ocupa a tela toda
    // camino-host: fundo escuro p/ não piscar branco entre abas (fetch async)
    var inner = el("div", { class: "view__inner view__inner--flush camino-host" });
    // descritor da tela; resolvemos a Promise só DEPOIS de preencher o `inner`
    // → o router mantém o conteúdo atual durante o load (sem flash preto entre abas).
    var ret = { node: inner, active: "sanguao", title: "Comunidade", communityId: id, immersive: true, flush: !tab };

    // PERF: tudo em paralelo numa só rodada (antes era community/membership →
    // getCurrentUser → listPosts em série = ~3 idas à rede). getCurrentUser é
    // cacheado; canMod sai da própria membership (sem a query canModerate extra);
    // os posts carregam JUNTO da comunidade em vez de esperar.
    var needPosts = !!tab && tab !== "membros";
    var ROLES_MOD = ["owner", "admin", "lider", "curador", "mod"];
    return Promise.all([
      App.repo.getCommunity(id),
      App.repo.getMembership(id),
      App.repo.getCurrentUser(),
      needPosts ? App.repo.listPosts(id) : Promise.resolve(null)
    ]).then(function (r) {
        var community = r[0], membership = r[1], me = r[2], postItems = r[3];
        var canMod = !!membership && ROLES_MOD.indexOf(membership.role) >= 0;
        if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada", "Talvez tenha sido removida.")); return ret; }

        // prévia da DESCRIÇÃO (do editor de admin): mostra o "Sobre" com o texto em edição
        var pvDesc = (ctx.query && ctx.query.previewDesc) ? App.store.get("commDescPreview") : null;
        if (pvDesc && pvDesc.id === id) community.description = pvDesc.desc;

        // presença real: entra no canal da comunidade (só dentro do reino; saguão não tem presença)
        if (tab && App.repo.joinPresence) { ONLINE = new Set(); App.repo.joinPresence(id, setOnline); }

        // sem tab: MEMBRO entra direto no feed (com a barra de abas); visitante vê o "Sobre".
        if (!tab) {
          if (membership && !pvDesc) {
            var home = (community.settings && community.settings.home) || "featured";
            App.router.navigate("/c/" + community.id + "/" + home, { replace: true });
            return ret; // navegação substitui; o router descarta este commit pelo token
          }
          return Promise.all([App.repo.getUser(community.ownerId), App.repo.getMembership(community.id, community.ownerId)])
            .then(function (rr) {
              App.util.mount(inner, introScreen(community, membership, rr[0] ? { user: rr[0], mem: rr[1] } : null));
              return ret;
            });
        }

        // aba "membros" → tela dedicada de membros
        if (tab === "membros") { membersScreen(community, membership, canMod, me, inner, ctx); return ret; }

        var page;
        // rede de segurança: qualquer erro ao montar a aba vira mensagem visível (nunca tela branca)
        try { page = communityUI(community, membership, canMod, me, postItems, tab); }
        catch (err) {
          console.error("[community]", err);
          App.util.mount(inner, ui.Empty("info", "Erro ao abrir esta página", (err && err.message) || String(err)));
          return ret;
        }
        App.util.mount(inner, page);
        if (ctx.query && ctx.query.enter) playEnterTransition(inner, community);
        return ret;
      });
  }

  App.screens.community = render;
  App.screens.notifications = notificationsScreen;
  App.screens.post = postScreen;
  // painel de notificações reutilizável GLOBALMENTE (sino do topbar, fora de comunidade): community pode ser null
  App.components = App.components || {};
  App.components.openNotifications = openNotifications;
  // helpers de render de post (reusados em outras telas, ex.: perfil)
  App.postRender = { body: postBody, badge: typeBadge, meta: postMeta };
})(window.App = window.App || {});
