/* ============================================================
   components/profileHeader.js — Cabeçalho de perfil centralizado
   (estilo pôster). Capa de bolinhas na cor do tema, avatar redondo
   central, nome, nível+título, status, ações e faixa de stats.
   Serve dois escopos:
     'global'    — conta Oblivian (SEM nível/título/reputação).
     'community' — perfil independente (nível/título/reputação/tags).
   Namespace: App.components.ProfileHeader
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.components = App.components || {};

  /* nível e título derivados da reputação (só comunidade) */
  function levelOf(rep) { return Math.max(1, Math.floor((rep || 0) / 150) + 1); }
  function titleOf(rep) {
    if (rep >= 1000) return "Lenda";
    if (rep >= 600) return "Veterano";
    if (rep >= 300) return "Ativo";
    if (rep >= 100) return "Membro";
    return "Iniciante";
  }

  /* cargos de administração — só staff recebe a tag */
  var ROLE_TAGS = {
    owner: { label: "Dono", icon: "crown" },
    leader: { label: "Líder", icon: "shield" },
    lider: { label: "Líder", icon: "shield" },
    admin: { label: "Líder", icon: "shield" },
    curator: { label: "Curador", icon: "star" },
    curador: { label: "Curador", icon: "star" },
    mod: { label: "Mod", icon: "shield" },
    moderator: { label: "Mod", icon: "shield" }
  };
  /* paleta por índice — IGUAL à de ui.js/profile.js (cor das tags sem cor custom) */
  var TAG_PALETTE = ["#22c55e", "#ef4444", "#06b6d4", "#a855f7", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#10b981", "#f97316", "#0ea5e9"];

  function memberSince(ts) {
    var d = new Date(ts);
    var mes = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    var dias = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
    return "Membro desde " + mes + " (" + dias + " dia" + (dias === 1 ? "" : "s") + ")";
  }

  /* capa padrão: gradiente liso na cor do tema (sem bolinhas) */
  function dotCover(accent) {
    return {
      backgroundImage: "linear-gradient(160deg, " + accent + ", " + App.store.color.shade(accent, -18) + ")"
    };
  }

  /* ---- meta de exibição guardado dentro de textColors (sem coluna nova no banco) ----
     __fit = "cover"|"contain" (opção "Dentro") · __pos = "x% y%" (posição/foco)
     "t:<tag>" = cor custom de cada título/tag.  Compartilhado com o editor (profile.js). */
  function metaOf(src) { return (src && src.textColors) || {}; }
  App.profileMeta = {
    fit: function (src) { return metaOf(src).__fit === "contain" ? "contain" : "cover"; },
    pos: function (src) { return metaOf(src).__pos || "50% 50%"; },
    enter: function (src) { return metaOf(src).__enter || "none"; },   // transição de entrada do perfil
    tagColor: function (src, tag) { return metaOf(src)["t:" + tag] || ""; },
    roleTag: function (role) { return ROLE_TAGS[role] || null; },   // {label, icon} do cargo (ou null)
    roleColor: function (src) { return metaOf(src).__role || ""; }   // cor custom do cargo (ou "" = accent)
  };

  /* aplica a cor do fundo (panelColor/tema) às pregas da cortina */
  function setCurtainColor(node, base) {
    if (!base || !/^#?[0-9a-f]{6}$/i.test(base)) return;
    var sh = App.store.color.shade;
    node.style.setProperty("--curtain-m", base);
    node.style.setProperty("--curtain-d", sh(base, -28));  // prega de sombra (suave, perto da cor)
    node.style.setProperty("--curtain-l", sh(base, 24));   // prega de brilho
  }

  /* slideshow de capas: empilha imagens e cicla com a transição escolhida.
     Mantém só 1 timer ativo (limpa o anterior ao reconstruir o cabeçalho). */
  var coverTimer = null;
  var COVER_SPEED = { slow: 5200, med: 3600, fast: 2200 };
  function buildCover(covers, fx, accent, speed, opts) {
    opts = opts || {};
    var fit = opts.fit === "contain" ? "contain" : "cover";   // opção "Dentro"
    var pos = opts.pos || "50% 50%";                          // foco/posição
    if (coverTimer) { clearInterval(coverTimer); coverTimer = null; }
    // sem imagem: capa limpa = gradiente liso na cor do tema (sem malha animada)
    if (!covers.length) return el("div", { class: "profile-poster__cover profile-poster__cover--empty", style: dotCover(accent) });
    var FX = { fade: 1, slide: 1, zoom: 1, dissolve: 1, circle: 1, curtain: 1 };
    if (!FX[fx]) fx = "fade";
    var wrap = el("div", { class: "profile-poster__cover cover-slides fx-" + fx + (covers.length <= 1 ? " cover-slides--single" : "") + (fit === "contain" ? " cover-slides--contain" : "") });
    wrap.style.backgroundImage = dotCover(accent).backgroundImage; // fundo base (atrás de imagens transparentes durante transição)
    setCurtainColor(wrap, accent);   // cortina baseada na cor do fundo (panelColor/tema)
    covers.forEach(function (s, i) {
      wrap.appendChild(el("div", { class: "cover-slide" + (i === 0 ? " is-active" : "") },
        el("div", { class: "cover-slide__img", style: { backgroundImage: "url(" + s + ")", backgroundSize: fit, backgroundPosition: pos } })));
    });
    if (covers.length > 1) {
      var idx = 0;
      coverTimer = setInterval(function () {
        if (!wrap.isConnected) { clearInterval(coverTimer); coverTimer = null; return; }
        var slides = wrap.children, prev = idx;
        idx = (idx + 1) % slides.length;
        slides[prev].classList.remove("is-active");
        slides[prev].classList.add("is-leaving");
        slides[idx].classList.add("is-active");
        (function (p) { setTimeout(function () { slides[p] && slides[p].classList.remove("is-leaving"); }, 950); })(prev);
      }, COVER_SPEED[speed] || 3600);
    }
    return wrap;
  }

  function ProfileHeader(opts) {
    opts = opts || {};
    var scope = opts.scope || "global";
    var user = opts.user;
    var mem = opts.membership;
    var isCommunity = scope === "community" && mem;

    // moderação "ocultar": perfil escondido enquanto status.action === "hide" e não expirou
    var status = isCommunity ? mem.status : null;
    var hidden = !!(status && status.action === "hide" && (!status.expiresAt || status.expiresAt > Date.now()));

    var name = isCommunity ? (mem.nickname || user.name) : user.name;
    var avatar = isCommunity ? (mem.avatar || user.avatar) : user.avatar;
    var src = isCommunity ? mem : user;
    // galeria de capas (ordenada). Compatível com capa única antiga.
    var covers = (src.covers && src.covers.length) ? src.covers.slice() : (src.cover ? [src.cover] : []);
    var coverFx = src.coverFx || "fade";
    var coverFxSpeed = src.coverFxSpeed || "med";
    var cover = covers[0] || null;
    // cores de texto por elemento (objeto). Helper aplica style se houver.
    var tc = (isCommunity ? mem.textColors : user.textColors) || {};
    function tcStyle(key) { return tc[key] ? { color: tc[key] } : null; }
    // cor da capa: comunidade usa acento da comunidade; global deriva do id (cor própria por usuário)
    var palette = ["#7c59ec", "#ff5fa2", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7"];
    function hashColor(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return palette[h % palette.length]; }
    // cor base da capa: cor escolhida pelo usuário (panelColor) > acento da comunidade > hash
    var chosenColor = (isCommunity && mem && mem.panelColor) ? mem.panelColor : (!isCommunity && user.panelColor ? user.panelColor : "");
    var accent = chosenColor
      ? chosenColor
      : ((isCommunity && opts.community && opts.community.theme && opts.community.theme.accent)
        ? opts.community.theme.accent : hashColor(user.id || "x"));

    // CAPA — slideshow de imagens (com transição) ou gradiente na cor do tema
    var coverEl = buildCover(covers, coverFx, accent, coverFxSpeed, { fit: App.profileMeta.fit(src), pos: App.profileMeta.pos(src) });

    // Status: { key, label, color }. Vira um ponto no avatar; offline some (exceto no próprio perfil, p/ poder trocar).
    var st = opts.statusInfo || (opts.online != null ? { key: opts.online ? "online" : "offline", label: opts.online ? "Online" : "Offline", color: opts.online ? "var(--ok)" : "var(--text-mute)" } : null);
    // só na visão de outro usuário e quando não estiver offline
    var statusDot = null;
    if (st && !opts.isMe && st.key !== "offline") {
      statusDot = el("span", { class: "profile-poster__avstatus", title: st.label, style: { background: st.color } });
    }

    // botão de voltar — vira "fechar" quando há onBack (ex.: modo prévia)
    var backBtn = opts.onBack
      ? el("button", { class: "profile-poster__iconbtn", type: "button", title: opts.backTitle || "Fechar", onClick: opts.onBack }, App.icon(opts.backIcon || "close"))
      : el("a", { class: "profile-poster__iconbtn", href: opts.backHref || "#/explorer", title: opts.backTitle || "Voltar" }, App.icon(opts.backIcon || "back"));

    // modo de visualização/prévia: oculta a seta de voltar e o "..." (evita
    // cliques indevidos, loops e falhas de navegação). Saída é pela badge flutuante.
    var topbar = el("div", { class: "profile-poster__topbar" });
    if (!opts.previewMode) {
      topbar.appendChild(backBtn);
      topbar.appendChild(el("div", { class: "u-grow" }));
      topbar.appendChild(el("button", { class: "profile-poster__iconbtn", type: "button", title: "Mais", onClick: function (e) { opts.onMenu(e.currentTarget); } }, App.icon("more")));
    }

    // Avatar central — toque abre o visualizador quadrado (mantém o enquadramento do perfil)
    var avatarNode = ui.Avatar({ name: name, src: avatar, round: true });
    avatarNode.classList.add("profile-poster__avatar");
    var avatarWrap = el("div", { class: "profile-poster__avatarwrap" }, avatarNode);
    if (avatar && !hidden && App.components.openAvatarViewer) {
      avatarWrap.classList.add("is-clickable");
      avatarWrap.setAttribute("role", "button");
      avatarWrap.setAttribute("tabindex", "0");
      avatarWrap.setAttribute("title", "Ver foto de perfil");
      var openAv = function () { App.components.openAvatarViewer({ src: avatar, name: name }); };
      avatarWrap.addEventListener("click", openAv);
      avatarWrap.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAv(); } });
    }

    // Nível + título + TAGS (só comunidade) — tudo na mesma faixa
    var badge = null;
    if (isCommunity) {
      badge = el("div", { class: "profile-poster__badge" });
      var roleTag = ROLE_TAGS[mem.role];
      if (roleTag) {
        var rchip = el("span", { class: "level-chip" }, App.icon(roleTag.icon, { size: "sm", fill: true }), roleTag.label);
        var rcolor = App.profileMeta.roleColor(src);
        if (rcolor) rchip.style.background = rcolor;
        badge.appendChild(rchip);
      }
      var allTags = mem.tags || [];
      var LIMIT = 8;   // até ~2 linhas no badge antes do "..."
      function tagChipColor(t, i) { var c = App.profileMeta.tagColor(src, t); return c ? { variant: "color", color: c } : { variant: "color", colorIndex: i }; }
      allTags.slice(0, LIMIT).forEach(function (t, i) { badge.appendChild(ui.Tag(t, tagChipColor(t, i))); });
      if (allTags.length > LIMIT) {
        var moreBtn = el("button", { class: "profile-poster__moretags", type: "button", title: "Ver todas as tags" }, App.icon("more", { size: "sm" }));
        moreBtn.addEventListener("click", function () {
          var rt = ROLE_TAGS[mem.role];
          var cargoChip = rt
            ? el("span", { class: "tags-modal__chip is-active" }, App.icon(rt.icon, { size: "sm", fill: true }), rt.label)
            : el("span", { class: "tags-modal__chip is-active" }, titleOf(mem.reputation));
          var rcCargo = App.profileMeta.roleColor(src);
          if (rt && rcCargo) cargoChip.style.background = rcCargo;
          var chips = [cargoChip];
          allTags.forEach(function (t, i) {
            // mesma cor do badge: custom ("t:<tag>") OU paleta por índice
            var cc = App.profileMeta.tagColor(src, t) || TAG_PALETTE[i % TAG_PALETTE.length];
            var chip = el("span", { class: "tags-modal__chip" }, t);
            chip.style.background = cc; chip.style.color = "#fff";
            chips.push(chip);
          });
          var grid = el("div", { class: "tags-modal__grid" }, chips);
          ui.openModal({ title: "Todos os Títulos", body: el("div", { class: "tags-modal" }, grid), dismissable: true, scrimClass: "scrim--centered" });
        });
        badge.appendChild(moreBtn);
      }
    }

    // Ações centrais
    var followersNumEl = null;   // ref. do nº de seguidores (atualizado ao seguir, sem re-render)
    var actions = el("div", { class: "profile-poster__actions" });
    if (opts.isMe) {
      actions.appendChild(ui.Button({ label: "Editar", icon: "editpen", iconFill: true, class: "btn--editpen", variant: "outline", onClick: opts.onEdit }));
    } else {
      var isFollowing = !!opts.following;
      var followBtn = ui.Button({ label: isFollowing ? "Seguindo" : "Seguir", icon: isFollowing ? "check" : "plus", variant: "outline" });
      followBtn.classList.add("pa-follow");
      function paintFollow() {
        App.util.clear(followBtn);
        followBtn.appendChild(App.icon(isFollowing ? "check" : "plus"));
        followBtn.appendChild(el("span", isFollowing ? "Seguindo" : "Seguir"));
        followBtn.classList.toggle("is-following", isFollowing);
      }
      // segue/desfaz SEM re-render da tela (evita flash branco): atualiza botão + contador no lugar
      followBtn.addEventListener("click", function () {
        if (!opts.onToggleFollow || followBtn.classList.contains("is-loading")) return;
        followBtn.setLoading(true);
        Promise.resolve(opts.onToggleFollow(isFollowing)).then(function (now) {
          followBtn.setLoading(false);
          isFollowing = (typeof now === "boolean") ? now : !isFollowing;
          paintFollow();
          if (followersNumEl) {
            var n = Math.max(0, (parseInt(followersNumEl.getAttribute("data-n"), 10) || 0) + (isFollowing ? 1 : -1));
            followersNumEl.setAttribute("data-n", n);
            followersNumEl.textContent = App.util.formatCount(n);
          }
        }).catch(function (e) { followBtn.setLoading(false); App.ui.toast((e && e.message) || "Falha", "danger"); });
      });
      actions.appendChild(followBtn);
      var msgBtn = ui.IconButton("chat", { title: "Mensagem", onClick: opts.onChat || function () { App.ui.toast("Abrindo conversa..."); } });
      msgBtn.classList.add("btn--msg", "pa-msg");
      actions.appendChild(msgBtn);
    }
    if (opts.extraActions) opts.extraActions.forEach(function (a) { actions.appendChild(a); });
    if (statusDot) actions.appendChild(statusDot);

    // Faixa de stats — cores por elemento
    function stat(num, label, onClick, key) {
      var n = el("div", { class: "profile-poster__stat" + (onClick ? " is-clickable" : "") },
        el("span", { class: "profile-poster__statnum", style: tcStyle(key) }, App.util.formatCount(num)),
        el("span", { class: "profile-poster__statlabel", style: tcStyle(key) }, label));
      if (onClick) n.addEventListener("click", onClick);
      return n;
    }
    var followersStat = stat((user.followers || []).length, "Seguidores", opts.onFollowers, "followers");
    followersNumEl = followersStat.querySelector(".profile-poster__statnum");
    if (followersNumEl) followersNumEl.setAttribute("data-n", (user.followers || []).length);
    var statsStrip = el("div", { class: "profile-poster__stats" },
      isCommunity ? stat(mem.reputation, "Reputação", null, "rep") : null,
      stat((user.following || []).length, "Seguindo", opts.onFollowing, "following"),
      followersStat
    );

    // interface de "perfil ocultado" — sobreposta às fotos borradas
    var hiddenNote = null;
    if (hidden) {
      var expTxt = status.expiresAt ? " · " + App.util.humanDuration(status.expiresAt - Date.now()) : "";
      hiddenNote = el("div", { class: "profile-hidden" },
        el("div", { class: "profile-hidden__icon" }, App.icon("hide", { size: "lg" })),
        el("div", { class: "profile-hidden__title" }, opts.isMe ? "Seu perfil foi ocultado" : "Perfil ocultado"),
        el("p", { class: "profile-hidden__sub" }, opts.isMe
          ? ("A moderação ocultou seu perfil nesta comunidade" + expTxt + ".")
          : ("Este perfil foi ocultado pela moderação" + expTxt + ".")),
        (status.reason ? el("p", { class: "profile-hidden__reason" }, "Motivo: " + status.reason) : null));
    }

    var headEl = el("section", { class: "profile-poster" + (hidden ? " is-hidden" : "") },
      coverEl,
      topbar,
      el("div", { class: "profile-poster__center" },
        avatarWrap,
        el("h2", { class: "profile-poster__name", style: tcStyle("name") }, name),
        badge,
        actions),
      statsStrip,
      hiddenNote
    );


    // Bloco de bio (tags ficam na faixa do nível, acima)
    var tagNodes = [];
    var bio = isCommunity ? mem.bio : user.bio;

    var bioHead = el("div", { class: "profile-bio__head" },
      el("strong", { style: tcStyle("bio") }, "Bio"),
      el("span", { class: "profile-bio__since", style: tcStyle("since") }, memberSince(isCommunity ? mem.joinedAt : user.createdAt)),
      el("span", { class: "u-grow" }),
      opts.onComments ? App.icon("forward", { size: "sm", cls: "profile-bio__arrow" }) : null);

    // bio completa, com formatação [B][I]… e imagens inline (mesma marcação dos posts)
    var bioContent;
    if (bio) {
      bioContent = el("div", { class: "profile-bio__text profile-bio__richtext", style: tcStyle("bio") });
      bioContent.appendChild(App.markup.render(bio));
    } else if (opts.isMe) {
      bioContent = el("button", { class: "profile-bio__empty", type: "button", onClick: opts.onEdit }, "Toque aqui para adicionar sua bio!");
    } else {
      bioContent = el("p", { class: "profile-bio__text u-muted" }, "Nenhuma bio escrita ainda!");
    }

    var bioBlock = el("div", { class: "profile-bio" + (opts.onComments ? " profile-bio--clickable" : "") },
      bioHead,
      bioContent,
      tagNodes.length ? el("div", { class: "profile-bio__tags" }, tagNodes) : null
    );
    // bio inteira clicável → abre comentários (exceto editar, links e imagens inline)
    if (opts.onComments) bioBlock.addEventListener("click", function (e) {
      if (e.target.closest(".profile-bio__more, .profile-bio__empty, a, .mk-img")) return;
      opts.onComments();
    });

    return el("div", { class: "profile-wrap" + (hidden ? " is-hidden" : "") }, headEl, bioBlock);
  }

  App.components.ProfileHeader = ProfileHeader;
  App.components.profileLevel = levelOf;
})(window.App = window.App || {});
