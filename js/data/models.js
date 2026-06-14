/* ============================================================
   data/models.js — Fábricas de entidades (formato dos dados).
   Namespace: App.models
   IMPORTANTE: o perfil GLOBAL (conta) não tem reputação/tags/títulos.
   O perfil de COMUNIDADE (membership) carrega bio/tags/títulos/reputação.
   ============================================================ */
(function (App) {
  "use strict";
  var uid = App.util.uid;

  /* slug/ID legível p/ comunidade (a partir do nome) — minúsculas, sem acento, hífen */
  function slugify(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "comunidade";
  }

  /* Conta global do usuário — só muda dentro do Oblivian. */
  function User(data) {
    data = data || {};
    return {
      id: data.id || uid("user"),
      handle: data.handle || "usuario",
      name: data.name || "Usuário",
      avatar: data.avatar || null,   // dataURL/URL ou null (usa iniciais)
      cover: data.cover || null,     // CAPA (fundo superior) — global; 1ª imagem da galeria
      covers: data.covers || [],     // CAPA — galeria de imagens (ordem definida pelo usuário)
      coverFx: data.coverFx || "fade", // transição entre capas: fade|slide|zoom|dissolve
      coverFxSpeed: data.coverFxSpeed || "med", // velocidade do slideshow: slow|med|fast
      panel: data.panel || null,     // PAINEL (fundo inferior) — global
      panelColor: data.panelColor || "", // cor do perfil global (capa + fundo)
      textColor: data.textColor || "",   // (legado) cor única dos textos
      textColors: data.textColors || {}, // cor por elemento: name/handle/bio/since/stat/badge
      bio: data.bio || "",
      followers: data.followers || [], // ids de usuários (global)
      following: data.following || [], // ids de usuários (global)
      blocked: data.blocked || [],     // ids de usuários bloqueados (global)
      savedPosts: data.savedPosts || [],       // ids de posts salvos/favoritos
      favCommunities: data.favCommunities || [], // ids de comunidades favoritas
      createdAt: data.createdAt || Date.now()
      // sem reputação, sem tags, sem títulos — exclusivos de comunidade
    };
  }

  /* Comunidade. */
  function Community(data) {
    data = data || {};
    var cid = data.id || uid("comm");
    return {
      id: cid,
      name: data.name || "Nova comunidade",
      slug: data.slug || (slugify(data.name) + "-" + cid.slice(-4)),   // ID gerado do nome (alterável 1x)
      icon: data.icon || null,         // ícone da comunidade
      cover: data.cover || null,       // fundo/banner da comunidade
      description: data.description || "",
      ownerId: data.ownerId,
      tags: data.tags || [],           // tags/categorias da comunidade
      theme: data.theme || { accent: "#7c59ec" }, // customização visual independente
      settings: Object.assign({
        visibility: "public",          // 'public' | 'private'
        joinPolicy: "open",            // 'open' | 'request'
        allowMemberPosts: true,
        // ordem e nomes das abas internas (configurável pelo dono/admin)
        tabs: [
          { key: "featured", label: "Destaques" },
          { key: "latest", label: "Recentes" },
          { key: "guidelines", label: "Diretrizes" },
          { key: "official", label: "Oficial" }
        ]
      }, data.settings || {}),
      memberCount: data.memberCount || 0,
      createdAt: data.createdAt || Date.now()
    };
  }

  /* Perfil do usuário DENTRO de uma comunidade (independente por comunidade). */
  function Membership(data) {
    data = data || {};
    return {
      id: data.id || uid("mem"),
      communityId: data.communityId,
      userId: data.userId,
      role: data.role || "member",     // 'owner' | 'admin' | 'member'
      nickname: data.nickname || null, // apelido na comunidade (cai p/ nome global)
      avatar: data.avatar || null,     // avatar específico da comunidade
      cover: data.cover || null,       // CAPA específica da comunidade; 1ª da galeria
      covers: data.covers || [],       // CAPA — galeria de imagens (ordenável)
      coverFx: data.coverFx || "fade", // transição entre capas: fade|slide|zoom|dissolve
      coverFxSpeed: data.coverFxSpeed || "med", // velocidade do slideshow: slow|med|fast
      panel: data.panel || null,       // PAINEL específico da comunidade (imagem)
      panelColor: data.panelColor || "", // cor sólida do painel (fundo de bio/posts)
      textColor: data.textColor || "",   // (legado) cor única dos textos
      textColors: data.textColors || {}, // cor por elemento
      bio: data.bio || "",             // bio específica da comunidade
      tags: data.tags || [],           // tags internas da comunidade
      titles: data.titles || [],       // títulos conquistados
      reputation: data.reputation || 0,
      posts: data.posts || [],         // ids de posts
      status: data.status || null,     // moderação ativa (ver Moderation)
      joinedAt: data.joinedAt || Date.now()
    };
  }

  function Chat(data) {
    data = data || {};
    return {
      id: data.id || uid("chat"),
      // 'community' = chat interno da comunidade; 'direct'/'group' = conversa global do usuário
      type: data.type || (data.communityId ? "community" : "direct"),
      communityId: data.communityId || null,
      ownerId: data.ownerId || null,          // dono/anfitrião do chat
      name: data.name || "chat",
      description: data.description || "",
      readOnly: data.readOnly || false,        // somente leitura (só staff publica)
      visibility: data.visibility || "public", // comunidade: 'public' | 'private'
      allowedRoles: data.allowedRoles || null, // comunidade privada: roles que entram
      participants: data.participants || [],   // global direct/group: ids de usuários
      title: data.title || "",                 // grupo: nome do grupo
      requestedBy: data.requestedBy || null,   // direct: quem iniciou (p/ solicitações)
      accepted: data.accepted != null ? data.accepted : true, // direct pendente = false
      // anti-spam (config do responsável; vale para todos no chat público)
      cooldownSec: data.cooldownSec || 0,       // intervalo mínimo entre mensagens (0 = desligado)
      bannedWords: data.bannedWords || [],      // palavras bloqueadas (públicos)
      wallpaper: data.wallpaper || null,        // papel de parede COMPARTILHADO (todos veem igual)
      lastMessageAt: data.lastMessageAt || data.createdAt || Date.now(),
      createdAt: data.createdAt || Date.now()
    };
  }

  function Message(data) {
    data = data || {};
    return {
      id: data.id || uid("msg"),
      chatId: data.chatId,
      userId: data.userId,
      text: data.text || "",
      media: data.media || [],   // [{ type:'image'|'video', src }] (até 5)
      createdAt: data.createdAt || Date.now()
    };
  }

  /* type: 'blog' | 'image' | 'poll' | 'quiz' | 'link' | 'question' | 'answer' | 'wiki' | 'text'
     payload: campos específicos por tipo (ver seed). */
  function Post(data) {
    data = data || {};
    return {
      id: data.id || uid("post"),
      communityId: data.communityId,
      userId: data.userId,
      type: data.type || "text",
      title: data.title || "",
      text: data.text || "",
      payload: data.payload || {},
      likes: data.likes || [],   // ids de usuários
      reactions: data.reactions || {}, // { emoji: [userIds] } — 1 reação por usuário
      comments: data.comments || 0,
      featuredUntil: data.featuredUntil || null, // timestamp até quando fica em destaque
      pinned: data.pinned || false, // fixado no topo da comunidade (staff)
      hidden: data.hidden || false, // ocultado pela moderação
      editedAt: data.editedAt || null, // timestamp da última edição
      createdAt: data.createdAt || Date.now()
    };
  }

  /* Registro de moderação aplicado a um membro. */
  function Moderation(data) {
    data = data || {};
    return {
      id: data.id || uid("mod"),
      communityId: data.communityId,
      targetUserId: data.targetUserId,
      byUserId: data.byUserId,
      action: data.action,             // 'ban' | 'hide' | 'mute'
      reason: data.reason || "",
      createdAt: data.createdAt || Date.now(),
      expiresAt: data.expiresAt || null // null = permanente (ban) ou indef.
    };
  }

  /* Notificação. type 'roleInvite' usa status + payload p/ aceitar/recusar. */
  function Notification(data) {
    data = data || {};
    return {
      id: data.id || uid("ntf"),
      userId: data.userId,              // destinatário
      cat: data.cat || "all",           // 'all' | 'mention' | 'system' | 'invite'
      type: data.type || "generic",     // 'generic' | 'roleInvite'
      icon: data.icon || "bell",
      title: data.title || "",
      sub: data.sub || "",
      to: data.to || null,              // alvo de navegação (genérica)
      status: data.status || null,      // 'pending' | 'accepted' | 'rejected' (invites)
      payload: data.payload || {},      // { communityId, targetUserId, targetName, role }
      read: data.read || false,
      createdAt: data.createdAt || Date.now()
    };
  }

  function Comment(data) {
    data = data || {};
    return {
      id: data.id || uid("cmt"),
      postId: data.postId,
      userId: data.userId,
      name: data.name || "",
      text: data.text || "",
      media: data.media || [],   // [{ type:'image'|'video', src }] (até 5)
      parentId: data.parentId || null, // resposta a outro comentário (thread)
      likes: data.likes || [],   // ids de usuários que curtiram
      editedAt: data.editedAt || null,
      createdAt: data.createdAt || Date.now()
    };
  }

  /* Denúncia de conteúdo (post/comentário/usuário). */
  function Report(data) {
    data = data || {};
    return {
      id: data.id || uid("rep"),
      byUserId: data.byUserId,
      targetType: data.targetType,     // 'post' | 'comment' | 'user'
      targetId: data.targetId,
      communityId: data.communityId || null,
      reason: data.reason || "",
      status: data.status || "open",   // 'open' | 'reviewed' | 'dismissed'
      createdAt: data.createdAt || Date.now()
    };
  }

  /* ============ Economia: moedas, loja, itens ============ */

  /* Item da loja (cosmético). category: frame|theme|bubble|postHighlight|profileHighlight|special */
  function StoreItem(data) {
    data = data || {};
    return {
      id: data.id || uid("item"),
      category: data.category || "frame",
      name: data.name || "Item",
      description: data.description || "",
      price: data.price || 0,              // em moedas
      rarity: data.rarity || "comum",      // comum|raro|épico|especial
      value: data.value || null,           // dado do cosmético (cor, css, etc.)
      icon: data.icon || "star",
      createdAt: data.createdAt || Date.now()
    };
  }

  /* Item possuído pelo usuário (comprado ou desbloqueado). */
  function UserItem(data) {
    data = data || {};
    return {
      id: data.id || uid("uitem"),
      userId: data.userId,
      itemId: data.itemId,
      acquiredAt: data.acquiredAt || Date.now()
    };
  }

  /* Transação de moedas (histórico). kind: 'ad'|'purchase'|'grant'|'refund' */
  function CoinTransaction(data) {
    data = data || {};
    return {
      id: data.id || uid("ctx"),
      userId: data.userId,
      amount: data.amount || 0,            // + ganho, - gasto
      kind: data.kind || "grant",
      ref: data.ref || null,               // itemId / adId
      note: data.note || "",
      balanceAfter: data.balanceAfter != null ? data.balanceAfter : null,
      createdAt: data.createdAt || Date.now()
    };
  }

  App.models = {
    User: User, Community: Community, Membership: Membership,
    Chat: Chat, Message: Message, Post: Post, Moderation: Moderation,
    Notification: Notification, Comment: Comment, Report: Report,
    StoreItem: StoreItem, UserItem: UserItem, CoinTransaction: CoinTransaction,
    slugify: slugify
  };
})(window.App = window.App || {});
