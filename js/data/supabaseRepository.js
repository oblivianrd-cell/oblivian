/* ============================================================
   data/supabaseRepository.js — Backend real (Supabase).
   Implementa o contrato de App.Repository contra o schema do repo
   (backend/supabase/schema.sql). Colunas snake_case ↔ camelCase.

   Métodos SÍNCRONOS do contrato (isSaved, getBalance, ownsItem,
   getEquipped, isFavoriteCommunity, isBlocked, adStatus, reactionState,
   pollState, getChatPrefs, getChatConfig, levelInfo, unreadCount) leem
   CACHES em memória, populados em getCurrentUser()/_prime() e mantidos
   nas escritas. Por isso: chame getCurrentUser() no boot (o app já faz).

   Ativar: em app.js trocar  App.repo = new App.LocalRepository();
   por (auto-detecção segura):  App.repo = App.makeRepository();
   ============================================================ */
(function (App) {
  "use strict";

  function SupabaseRepository() {
    if (!App.config || !App.config.supabase) throw new Error("App.config.supabase ausente (veja config.example.js)");
    if (typeof window.supabase === "undefined") throw new Error("supabase-js não carregado");
    this.sb = window.supabase.createClient(App.config.supabase.url, App.config.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    // ---- caches p/ métodos síncronos ----
    this._meId = null;
    this._me = null;
    this._balance = 0;
    this._savedIds = new Set();
    this._blockedIds = new Set();
    this._favIds = new Set();
    this._ownedItems = new Set();
    this._equipped = {};
    this._reads = {};        // chatId -> ISO string
    this._posts = {};        // postId -> row (p/ pollState/reactionState síncronos)
    this._adToday = { date: null, count: 0, lastAt: 0 };
    this._chatSubs = {};     // chatId -> channel
    this._chatCache = {};    // chatId -> row (p/ getChatConfig síncrono)
    this._presChan = null; this._presCid = null;   // presença Realtime (1 canal por comunidade ativa)
    this._presBeat = null;
    this._unread = 0;        // badge de notificações (síncrono — refreshUnread atualiza)
    this._unreadConvos = 0;  // badge de conversas (síncrono)
    this._convoUnread = {};  // chatId -> nº não-lidas (mantém _unreadConvos ao vivo sem requery)
    this._notifChan = null;  // canal Realtime das notificações do usuário
    this._loggingOut = false;
    // sessão caiu sozinha (token expirou / refresh falhou) enquanto logado:
    // recarrega p/ o boot cair no portão de login (evita telas quebradas com 401 silencioso).
    var self = this;
    this.sb.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT" && self._meId && !self._loggingOut) {
        self._meId = null; self._me = null; self._unread = 0; self._unreadConvos = 0; self._convoUnread = {};
        self.unsubscribeNotifications();
        location.reload();
      }
    });
    // APP nativo: captura o retorno do login OAuth (deep link oblivian://auth-callback)
    // e finaliza a sessão DENTRO do app — sem jogar pro navegador.
    var AppPlugin = _cap("App");
    if (_isNative() && AppPlugin && AppPlugin.addListener) {
      AppPlugin.addListener("appUrlOpen", function (ev) {
        var url = (ev && ev.url) || "";
        if (url.indexOf("auth-callback") < 0) return;
        var Browser = _cap("Browser"); if (Browser) { try { Browser.close(); } catch (e) {} }
        try {
          var qs = url.split("?")[1] || "";
          var code = qs ? new URLSearchParams(qs).get("code") : null;
          if (code) { self.sb.auth.exchangeCodeForSession(code).then(function () { location.reload(); }).catch(function () { location.reload(); }); return; }
          var hash = url.split("#")[1] || "";
          var hp = new URLSearchParams(hash), at = hp.get("access_token"), rt = hp.get("refresh_token");
          if (at && rt) self.sb.auth.setSession({ access_token: at, refresh_token: rt }).then(function () { location.reload(); });
        } catch (e) {}
      });
    }
  }
  if (App.Repository) {
    SupabaseRepository.prototype = Object.create(App.Repository.prototype);
    SupabaseRepository.prototype.constructor = SupabaseRepository;
  }
  var P = SupabaseRepository.prototype;

  /* ---------- helpers ---------- */
  // Capacitor (app nativo) — usado p/ OAuth via deep link (não joga pro navegador)
  function _isNative() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  function _cap(n) { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[n]) || null; }
  var OAUTH_REDIRECT = "oblivian://auth-callback";
  function pick(r) { if (r.error) throw r.error; return r.data; }
  function ms(iso) { return iso ? Date.parse(iso) : 0; }       // ISO -> epoch ms
  var AD_REWARD = 50, AD_DAILY_LIMIT = 5, AD_COOLDOWN_MS = 60000;
  var EQUIP_SLOTS = { frame: 1, theme: 1, bubble: 1, profileHighlight: 1 };
  var REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👏"];
  P.REACTIONS = REACTIONS;
  P.LEVEL_STEP = 100;

  /* ---------- mapeadores (row snake_case -> model camelCase) ---------- */
  P._mapUser = function (row) {
    if (!row) return null;
    return {
      id: row.id, handle: row.handle, name: row.name || row.handle,
      handleChanged: !!row.handle_changed,
      avatar: row.avatar_url || null, cover: row.cover_url || null,
      covers: row.covers || [], coverFx: row.cover_fx || "fade", coverFxSpeed: row.cover_fx_speed || "med",
      panel: row.panel || null, panelColor: row.panel_color || "",
      textColor: row.text_color || "", textColors: row.text_colors || {},
      bio: row.bio || "", followers: [], following: [],
      blocked: Array.from(this._blockedIds), savedPosts: Array.from(this._savedIds),
      favCommunities: Array.from(this._favIds), createdAt: ms(row.created_at),
      lastSeen: ms(row.last_seen), hidePresence: !!row.hide_presence
    };
  };
  // autor sempre presente: se o embed do perfil veio null (RLS/perfil ausente),
  // devolve um usuário "fantasma" pra a UI não quebrar (evita tela branca em postCard).
  P._userOr = function (row, fallbackId) {
    return this._mapUser(row) || {
      id: fallbackId || "", handle: "", name: "Usuário", avatar: null, cover: null,
      covers: [], coverFx: "fade", coverFxSpeed: "med", panel: null, panelColor: "",
      textColor: "", textColors: {}, bio: "", followers: [], following: [],
      blocked: [], savedPosts: [], favCommunities: [], createdAt: 0
    };
  };
  P._mapCommunity = function (row) {
    if (!row) return null;
    return {
      id: row.id, name: row.name, slug: row.slug || null, icon: row.icon || null, cover: row.cover || null,
      description: row.description || "", ownerId: row.owner_id, tags: row.tags || [],
      theme: row.theme || { accent: "#7c59ec" }, settings: row.settings || {},
      memberCount: row.members_count != null ? row.members_count : (row.memberCount || 0),
      createdAt: ms(row.created_at)
    };
  };
  P._mapMembership = function (row) {
    if (!row) return null;
    return {
      id: row.id, communityId: row.community_id, userId: row.user_id, role: row.role || "member",
      nickname: row.nickname || null, avatar: row.avatar_url || null, cover: row.cover_url || null,
      covers: row.covers || [], coverFx: row.cover_fx || "fade", coverFxSpeed: row.cover_fx_speed || "med",
      panel: row.panel || null, panelColor: row.panel_color || "", textColor: row.text_color || "",
      textColors: row.text_colors || {}, bio: row.bio || "", tags: row.tags || [], titles: row.titles || [],
      reputation: row.reputation || 0, status: row.status || null, joinedAt: ms(row.joined_at)
    };
  };
  P._mapPost = function (row) {
    if (!row) return null;
    this._posts[row.id] = row; // cache p/ síncronos
    return {
      id: row.id, communityId: row.community_id, userId: row.user_id, type: row.type || "text",
      title: row.title || "", text: row.body || "", payload: row.payload || {},
      likes: row._likes || [], reactions: row.reactions || {}, comments: row._comments || 0,
      featuredUntil: ms(row.featured_until) || null, pinned: !!row.pinned, hidden: !!row.hidden,
      editedAt: ms(row.edited_at) || null, createdAt: ms(row.created_at)
    };
  };
  P._mapComment = function (row) {
    if (!row) return null;
    return {
      id: row.id, postId: row.post_id, userId: row.user_id, name: "", text: row.body || "",
      media: row.media || [], parentId: row.parent_id || null, likes: row._likes || [],
      editedAt: ms(row.edited_at) || null, createdAt: ms(row.created_at)
    };
  };
  P._mapChat = function (row) {
    if (!row) return null;
    this._chatCache[row.id] = row;
    return {
      id: row.id, type: row.type, communityId: row.community_id || null, ownerId: row.owner_id || null,
      name: row.name || "chat", description: row.description || "", readOnly: !!row.read_only,
      visibility: row.visibility || "public", allowedRoles: row.allowed_roles || null,
      participants: row.participants || [], title: row.title || "", requestedBy: row.requested_by || null,
      accepted: row.accepted != null ? row.accepted : true, cooldownSec: row.cooldown_sec || 0,
      bannedWords: row.banned_words || [], wallpaper: row.wallpaper || null, lastMessageAt: ms(row.last_message_at), createdAt: ms(row.created_at)
    };
  };
  P._mapMessage = function (row) {
    if (!row) return null;
    return { id: row.id, chatId: row.chat_id, userId: row.user_id, text: row.text || "", media: row.media || [], createdAt: ms(row.created_at) };
  };
  P._mapNotif = function (row) {
    if (!row) return null;
    return {
      id: row.id, userId: row.user_id, cat: row.cat || "all", type: row.type || "generic", icon: row.icon || "bell",
      title: row.title || "", sub: row.sub || "", to: row.to || null, status: row.status || null,
      payload: row.payload || {}, read: !!row.read, createdAt: ms(row.created_at)
    };
  };

  /* ============ Auth + sessão ============ */
  P.signUp = function (email, password) {
    return this.sb.auth.signUp({ email: email, password: password }).then(function (r) { if (r.error) throw r.error; return r.data.user; });
  };
  P.signIn = function (email, password) {
    var self = this;
    return this.sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (r) { if (r.error) throw r.error; return self._prime().then(function () { return self._me; }); });
  };
  P.signOut = function () { var self = this; self._loggingOut = true; this.leavePresence(); this.unsubscribeNotifications(); return this.sb.auth.signOut().then(function () { self._meId = null; self._me = null; self._unread = 0; self._unreadConvos = 0; self._convoUnread = {}; }); };
  // recuperação de senha: envia e-mail com link (fluxo padrão do Supabase)
  P.resetPassword = function (email) { return this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) { if (r && r.error) throw r.error; return true; }); };
  // login social (Google/Discord/GitHub).
  // WEB: redirect normal. APP (Capacitor): deep link → in-app browser → volta pro app (sem jogar pro navegador).
  P.signInWithOAuth = function (provider) {
    if (_isNative()) {
      return this.sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true } })
        .then(function (r) {
          if (r.error) throw r.error;
          var Browser = _cap("Browser"), url = r.data && r.data.url;
          if (!url) return r.data;
          if (Browser) return Browser.open({ url: url, presentationStyle: "popover" });
          window.location.href = url;   // sem plugin Browser: abre e volta pelo deep link
          return r.data;
        });
    }
    return this.sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: location.origin + location.pathname } })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  };

  // popula caches a partir do usuário logado
  P._prime = function () {
    var self = this;
    return this.sb.auth.getUser().then(function (r) {
      var u = r.data && r.data.user; if (!u) { self._meId = null; self._me = null; return null; }
      self._meId = u.id;
      return Promise.all([
        self.sb.from("profiles").select("*").eq("id", u.id).maybeSingle(),
        self.sb.from("wallets").select("balance").eq("user_id", u.id).maybeSingle(),
        self.sb.from("saved_posts").select("post_id").eq("user_id", u.id),
        self.sb.from("blocks").select("blocked_id").eq("user_id", u.id),
        self.sb.from("fav_communities").select("community_id").eq("user_id", u.id),
        self.sb.from("user_items").select("item_id, equipped, item:store_items(category)").eq("user_id", u.id),
        self.sb.from("store_items").select("*")
      ]).then(function (res) {
        var prof = res[0].data, wal = res[1].data;
        self._balance = wal ? wal.balance : 0;
        // signup recém-feito: carteira pode não ter sido criada ainda (trigger ensure_wallet).
        // Refaz a leitura logo depois → pega o saldo inicial (200) e atualiza o coin pill.
        if (!wal) setTimeout(function () { if (self._meId) self.getWallet().catch(function () {}); }, 1200);
        self._savedIds = new Set((res[2].data || []).map(function (x) { return x.post_id; }));
        self._blockedIds = new Set((res[3].data || []).map(function (x) { return x.blocked_id; }));
        self._favIds = new Set((res[4].data || []).map(function (x) { return x.community_id; }));
        self._ownedItems = new Set(); self._equipped = {};
        (res[5].data || []).forEach(function (ui) {
          self._ownedItems.add(ui.item_id);
          if (ui.equipped && ui.item) self._equipped[ui.item.category] = ui.item_id;
        });
        self._storeCatalog = {};
        (res[6].data || []).forEach(function (it) { self._storeCatalog[it.id] = it; });
        // perfil pode não existir ainda (trigger handle_new_user cria no signup)
        self._me = prof ? self._mapUser(prof) : { id: u.id, handle: (u.email || "user").split("@")[0], name: (u.email || "Usuário").split("@")[0], followers: [], following: [], blocked: [], savedPosts: [], favCommunities: [], createdAt: Date.now() };
        // notificações: conta inicial do badge + canal Realtime (recebe de outros usuários ao vivo)
        self.refreshUnread().then(function () { App.bus.emit("notif:read"); }).catch(function () {});
        self.subscribeNotifications();
        return self._me;
      });
    });
  };

  P.getCurrentUser = function () {
    var self = this;
    if (self._me && self._meId) return Promise.resolve(self._me);
    return self._prime();
  };
  P._uid = function () { return this._meId; };
  /* garante o uid real + revalida a sessão (getUser refresha JWT expirado) antes de writes
     que dependem de auth.uid() no RLS. Erro claro se a sessão morreu. */
  P._requireMe = function () {
    var self = this;
    return this.sb.auth.getUser().then(function (r) {
      var u = r.data && r.data.user;
      if (!u) throw new Error("Sessão expirada — entre novamente.");
      self._meId = u.id;
      return u.id;
    });
  };

  P.getUser = function (id) {
    var self = this;
    return this.sb.from("profiles").select("*").eq("id", id).maybeSingle().then(function (r) { return self._mapUser(pick(r)); });
  };
  P.updateUser = function (id, patch) {
    var up = {};
    if (patch.name !== undefined) up.name = patch.name;
    if (patch.handle !== undefined) up.handle = patch.handle;
    if (patch.bio !== undefined) up.bio = patch.bio;
    if (patch.avatar !== undefined) up.avatar_url = patch.avatar;
    if (patch.cover !== undefined) up.cover_url = patch.cover;
    if (patch.covers !== undefined) up.covers = patch.covers;
    if (patch.coverFx !== undefined) up.cover_fx = patch.coverFx;
    if (patch.coverFxSpeed !== undefined) up.cover_fx_speed = patch.coverFxSpeed;
    if (patch.panel !== undefined) up.panel = patch.panel;
    if (patch.panelColor !== undefined) up.panel_color = patch.panelColor;
    if (patch.textColor !== undefined) up.text_color = patch.textColor;
    if (patch.textColors !== undefined) up.text_colors = patch.textColors;
    var self = this;
    return this.sb.from("profiles").update(up).eq("id", id).select().single().then(function (r) {
      if (r.error) {
        if (r.error.code === "23505") throw new Error("Esse ID (@usuário) já está em uso. Escolha outro.");
        if (/uma vez/i.test(r.error.message || "")) throw new Error("O ID de usuário só pode ser alterado uma vez.");
        throw r.error;
      }
      var u = self._mapUser(pick(r)); if (id === self._meId) self._me = u; App.bus.emit("user:updated", u); return u;
    });
  };
  // checa se um @usuário está livre (ignora o próprio). Retorna {ok, taken, handle}
  P.checkHandle = function (handle) {
    var self = this, h = String(handle || "").trim().replace(/^@/, "").replace(/\s+/g, "");
    if (!h) return Promise.resolve({ ok: false, taken: false, handle: h });
    return this.sb.from("profiles").select("id").eq("handle", h).maybeSingle().then(function (r) {
      var taken = !!(r.data && r.data.id && r.data.id !== self._meId);
      return { ok: !taken, taken: taken, handle: h };
    }).catch(function () { return { ok: true, taken: false, handle: h }; });
  };

  /* ============ Follows ============ */
  P.follow = function (targetId) {
    if (!targetId || targetId === this._meId) return Promise.resolve(false);  // não segue a si mesmo (viola follows_check)
    var self = this;
    return this.sb.from("follows").insert({ follower_id: this._meId, following_id: targetId }).then(function (r) {
      if (r.error && r.error.code !== "23505") throw r.error;
      if (!(r.error && r.error.code === "23505")) {   // follow NOVO (não duplicado) → notifica o seguido
        var myName = (self._me && self._me.name) || "Alguém";
        self.addNotification({ userId: targetId, cat: "all", type: "follow", icon: "profile",
          title: myName + " começou a seguir você", sub: "", to: "/u/" + self._meId, payload: { userId: self._meId } }).catch(function () {});
      }
      return true;
    });
  };
  P.unfollow = function (targetId) {
    return this.sb.from("follows").delete().eq("follower_id", this._meId).eq("following_id", targetId).then(function () { return true; });
  };
  P.isFollowing = function (targetId) {
    return this.sb.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", this._meId).eq("following_id", targetId).then(function (r) { return (r.count || 0) > 0; });
  };
  P.listFollowers = function (userId) {
    var self = this;
    return this.sb.from("follows").select("follower:profiles!follows_follower_id_fkey(*)").eq("following_id", userId).then(function (r) { return (pick(r) || []).map(function (x) { return self._mapUser(x.follower); }); });
  };
  P.listFollowing = function (userId) {
    var self = this;
    return this.sb.from("follows").select("followee:profiles!follows_following_id_fkey(*)").eq("follower_id", userId).then(function (r) { return (pick(r) || []).map(function (x) { return self._mapUser(x.followee); }); });
  };

  /* ============ Blocks / Saves / Favoritos ============ */
  P.blockUser = function (targetId) {
    var self = this;
    return this.sb.from("blocks").insert({ user_id: this._meId, blocked_id: targetId }).then(function (r) { if (r.error && r.error.code !== "23505") throw r.error; self._blockedIds.add(targetId); App.bus.emit("user:updated", self._me); return true; });
  };
  P.unblockUser = function (targetId) {
    var self = this;
    return this.sb.from("blocks").delete().eq("user_id", this._meId).eq("blocked_id", targetId).then(function () { self._blockedIds.delete(targetId); App.bus.emit("user:updated", self._me); return true; });
  };
  P.isBlocked = function (targetId) { return this._blockedIds.has(targetId); }; // SÍNCRONO
  P.listBlocked = function () {
    var self = this;
    return this.sb.from("blocks").select("blocked:profiles!blocks_blocked_id_fkey(*)").eq("user_id", this._meId).then(function (r) { return (pick(r) || []).map(function (x) { return self._mapUser(x.blocked); }); });
  };

  P.toggleSavePost = function (postId) {
    var self = this, has = this._savedIds.has(postId);
    if (has) return this.sb.from("saved_posts").delete().eq("user_id", this._meId).eq("post_id", postId).then(function () { self._savedIds.delete(postId); App.bus.emit("user:updated", self._me); return false; });
    return this.sb.from("saved_posts").insert({ user_id: this._meId, post_id: postId }).then(function (r) { if (r.error && r.error.code !== "23505") throw r.error; self._savedIds.add(postId); App.bus.emit("user:updated", self._me); return true; });
  };
  P.isSaved = function (postId) { return this._savedIds.has(postId); }; // SÍNCRONO
  P.listSaved = function () {
    var self = this;
    return this.sb.from("saved_posts").select("post:posts(*, author:profiles!user_id(*))").eq("user_id", this._meId).then(function (r) {
      return (pick(r) || []).map(function (x) { return x.post ? { post: self._mapPost(x.post), user: self._userOr(x.post.author, x.post.user_id) } : null; }).filter(Boolean);
    });
  };
  P.toggleFavoriteCommunity = function (communityId) {
    var self = this, has = this._favIds.has(communityId);
    if (has) return this.sb.from("fav_communities").delete().eq("user_id", this._meId).eq("community_id", communityId).then(function () { self._favIds.delete(communityId); App.bus.emit("user:updated", self._me); return false; });
    return this.sb.from("fav_communities").insert({ user_id: this._meId, community_id: communityId }).then(function (r) { if (r.error && r.error.code !== "23505") throw r.error; self._favIds.add(communityId); App.bus.emit("user:updated", self._me); return true; });
  };
  P.isFavoriteCommunity = function (communityId) { return this._favIds.has(communityId); }; // SÍNCRONO
  P.listFavoriteCommunities = function () {
    var self = this;
    return this.sb.from("fav_communities").select("community:communities(*)").eq("user_id", this._meId).then(function (r) { return (pick(r) || []).map(function (x) { return self._mapCommunity(x.community); }).filter(Boolean); });
  };

  /* ============ Comunidades ============ */
  P._allCommunities = function (q) {
    var self = this, query = this.sb.from("communities").select("*");
    return query.then(function (r) {
      var list = (pick(r) || []).map(function (c) { return self._mapCommunity(c); });
      if (q) { var s = q.toLowerCase(); list = list.filter(function (c) { return (c.name + " " + c.description + " " + (c.tags || []).join(" ")).toLowerCase().indexOf(s) >= 0; }); }
      return list;
    });
  };
  P.listCommunities = function (opts) { opts = opts || {}; return this._allCommunities(opts.query); };
  /* busca do Explorer: SÓ comunidades + usuários (sem publicações).
     Privada só casa por nome completo (filtro client-side via App.search).
     Usuários só com "@" (ilike em handle/name). */
  P.searchExplore = function (raw) {
    var self = this, p = App.search.parse(raw);
    if (p.mode === "users") {
      if (!p.term) return Promise.resolve({ mode: "users", communities: [], users: [] });
      var safe = p.term.replace(/[%,()*]/g, ""); if (!safe) return Promise.resolve({ mode: "users", communities: [], users: [] });
      var like = "%" + safe + "%";
      return self.sb.from("profiles").select("*").or("handle.ilike." + like + ",name.ilike." + like).limit(30)
        .then(function (r) {
          var users = (pick(r) || []).map(function (row) { return self._mapUser(row); }).filter(function (u) {
            return u && u.id !== self._meId && !self._blockedIds.has(u.id);
          });
          return { mode: "users", communities: [], users: users };
        });
    }
    if (!p.term) return Promise.resolve({ mode: "communities", communities: [], users: [] });
    return self._allCommunities().then(function (list) {
      var communities = list.filter(function (c) { return App.search.matchCommunity(c, p.term); }).slice(0, 50);
      return { mode: "communities", communities: communities, users: [] };
    });
  };
  // descoberta pública: nunca expõe comunidade privada (só via link/nome completo)
  P._publicOnly = function (l) { return (l || []).filter(function (c) { return !(c.settings && c.settings.visibility === "private"); }); };
  P.getFeatured = function () { var self = this; return this._allCommunities().then(function (l) { return self._publicOnly(l).sort(function (a, b) { return b.memberCount - a.memberCount; })[0] || null; }); };
  P.getRecentCommunities = function () { var self = this; return this._allCommunities().then(function (l) { return self._publicOnly(l).sort(function (a, b) { return b.createdAt - a.createdAt; }); }); };
  P.getMyCommunities = function () {
    var self = this;
    return this.sb.from("community_profiles").select("community:communities(*)").eq("user_id", this._meId)
      .then(function (r) { return (pick(r) || []).map(function (x) { return self._mapCommunity(x.community); }).filter(Boolean); });
  };
  P.getUserCommunities = function (userId) {
    var self = this;
    return this.sb.from("community_profiles").select("community:communities(*)").eq("user_id", userId).then(function (r) { return (pick(r) || []).map(function (x) { return self._mapCommunity(x.community); }).filter(Boolean); });
  };
  P.getCommunity = function (id) { var self = this; return this.sb.from("communities").select("*").eq("id", id).maybeSingle().then(function (r) { return self._mapCommunity(pick(r)); }); };
  P.isMember = function (communityId, userId) {
    return this.sb.from("community_profiles").select("user_id", { count: "exact", head: true }).eq("community_id", communityId).eq("user_id", userId || this._meId).then(function (r) { return (r.count || 0) > 0; });
  };
  P.createCommunity = function (data) {
    var self = this, me = this._meId;
    var autoSlug = (App.models.slugify(data.name) + "-" + Math.random().toString(36).slice(2, 6));
    var ins = { name: data.name, slug: data.slug || autoSlug, description: data.description || "", icon: data.icon || null, cover: data.cover || null, owner_id: me, tags: data.tags || [], theme: data.theme || { accent: "#7c59ec" }, settings: data.settings || {} };
    return this.sb.from("communities").insert(ins).select().single().then(function (r) {
      var c = self._mapCommunity(pick(r));
      return self.sb.from("community_profiles").insert({ community_id: c.id, user_id: me, role: "owner", titles: ["Fundador(a)"] })
        .then(function () {
          // post de boas-vindas fixado (comunidade "já vem pronta")
          return self.sb.from("posts").insert({
            community_id: c.id, user_id: me, type: "text", pinned: true,
            title: "Bem-vindo(a) à " + c.name + "! 🎉",
            body: "Esta comunidade já vem pronta. Personalize em Configurar, publique o primeiro conteúdo e chame a galera. Boas criações!"
          });
        })
        .then(function () { App.bus.emit("community:created", c); return c; });
    });
  };
  P.updateCommunity = function (id, patch) {
    var up = {}; ["name", "description", "icon", "cover", "tags", "theme", "settings", "slug"].forEach(function (k) { if (patch[k] !== undefined) up[k] = patch[k]; });
    var self = this;
    return this.sb.from("communities").update(up).eq("id", id).select().single().then(function (r) { var c = self._mapCommunity(pick(r)); App.bus.emit("community:updated", c); return c; });
  };
  P.joinCommunity = function (communityId) {
    var self = this;
    return this.sb.from("community_profiles").insert({ community_id: communityId, user_id: this._meId, role: "member" }).select().single()
      .then(function (r) { if (r.error && r.error.code !== "23505") throw r.error; App.bus.emit("membership:changed", { communityId: communityId }); return self._mapMembership(r.data); });
  };
  P.leaveCommunity = function (communityId) {
    return this.sb.from("community_profiles").delete().eq("community_id", communityId).eq("user_id", this._meId).then(function () { App.bus.emit("membership:changed", { communityId: communityId }); return true; });
  };
  P.deleteCommunity = function (id) { return this.sb.from("communities").delete().eq("id", id).then(function (r) { if (r.error) throw r.error; App.bus.emit("community:deleted", { id: id }); return true; }); };

  /* ============ Membership ============ */
  P._membership = function (communityId, userId) {
    var self = this;
    if (!communityId || !userId) return Promise.resolve(null);   // sem usuário/comunidade → sem membership (evita query com null)
    return this.sb.from("community_profiles").select("*").eq("community_id", communityId).eq("user_id", userId).maybeSingle().then(function (r) { return self._mapMembership(r.data); });
  };
  P.getMembership = function (communityId, userId) { return this._membership(communityId, userId || this._meId); };

  /* conquistas (mesmas regras do repo local) */
  P.ACHIEVEMENTS = [
    { key: "joined", icon: "members", label: "Membro", desc: "Entrou na comunidade", test: function () { return true; } },
    { key: "first_post", icon: "edit", label: "Primeiro post", desc: "Publicou pela 1ª vez", test: function (s) { return s.posts >= 1; } },
    { key: "active", icon: "recent", label: "Ativo", desc: "10 publicações", test: function (s) { return s.posts >= 10; } },
    { key: "prolific", icon: "featured", label: "Prolífico", desc: "50 publicações", test: function (s) { return s.posts >= 50; } },
    { key: "respected", icon: "star", label: "Respeitado", desc: "100 de reputação", test: function (s) { return s.rep >= 100; } },
    { key: "legend", icon: "crown", label: "Lenda", desc: "500 de reputação", test: function (s) { return s.rep >= 500; } },
    { key: "staff", icon: "shield", label: "Equipe", desc: "Faz parte da staff", test: function (s) { return s.staff; } }
  ];
  P.listAchievements = function (communityId, userId) {
    var self = this, uid = userId || this._meId;
    return this._membership(communityId, uid).then(function (mem) {
      if (!mem) return [];
      return self.sb.from("posts").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("user_id", uid)
        .then(function (r) {
          var s = { posts: r.count || 0, rep: mem.reputation || 0, staff: App.Roles.isMod(mem.role) };
          return self.ACHIEVEMENTS.map(function (a) { return { key: a.key, icon: a.icon, label: a.label, desc: a.desc, earned: !!a.test(s) }; });
        });
    });
  };
  /* DM 1:1 existente com um usuário (null se não houver) — sem criar */
  P.findDirect = function (targetUserId) {
    var self = this, me = this._meId;
    return this.sb.from("chats").select("*").eq("type", "direct").contains("participants", [me, targetUserId]).maybeSingle()
      .then(function (r) { return r.data ? self._mapChat(r.data) : null; });
  };
  P.updateMembership = function (communityId, userId, patch) {
    var up = {};
    if (patch.nickname !== undefined) up.nickname = patch.nickname;
    if (patch.avatar !== undefined) up.avatar_url = patch.avatar;
    if (patch.cover !== undefined) up.cover_url = patch.cover;
    if (patch.covers !== undefined) up.covers = patch.covers;
    if (patch.coverFx !== undefined) up.cover_fx = patch.coverFx;
    if (patch.coverFxSpeed !== undefined) up.cover_fx_speed = patch.coverFxSpeed;
    if (patch.panel !== undefined) up.panel = patch.panel;
    if (patch.panelColor !== undefined) up.panel_color = patch.panelColor;
    if (patch.textColor !== undefined) up.text_color = patch.textColor;
    if (patch.textColors !== undefined) up.text_colors = patch.textColors;
    if (patch.bio !== undefined) up.bio = patch.bio;
    if (patch.tags !== undefined) up.tags = patch.tags;
    var self = this;
    return this.sb.from("community_profiles").update(up).eq("community_id", communityId).eq("user_id", userId).select().single().then(function (r) { var m = self._mapMembership(pick(r)); App.bus.emit("membership:updated", m); return m; });
  };
  P.listMembers = function (communityId) {
    var self = this;
    return this.sb.from("community_profiles").select("*, user:profiles!user_id(*)").eq("community_id", communityId).then(function (r) {
      return (pick(r) || []).map(function (m) { return { membership: self._mapMembership(m), user: self._mapUser(m.user) }; });
    });
  };
  P.adjustReputation = function (communityId, userId, delta) {
    var self = this;
    return this._membership(communityId, userId).then(function (m) {
      if (!m) throw new Error("Perfil não encontrado");
      var v = Math.max(0, (m.reputation || 0) + delta);
      return self.sb.from("community_profiles").update({ reputation: v }).eq("community_id", communityId).eq("user_id", userId).then(function () { return v; });
    });
  };
  P.levelInfo = function (reputation) { var rep = Math.max(0, reputation || 0), step = this.LEVEL_STEP, level = Math.floor(rep / step) + 1, into = rep % step; return { level: level, into: into, need: step, pct: Math.round(into / step * 100), rep: rep }; };
  P.canModerate = function (communityId, userId) {
    return this._membership(communityId, userId || this._meId).then(function (m) { return !!m && App.Roles.isMod(m.role); });
  };
  P.setRole = function (communityId, userId, role) {
    var self = this;
    return this.sb.from("community_profiles").update({ role: role }).eq("community_id", communityId).eq("user_id", userId).select().single().then(function (r) { var m = self._mapMembership(pick(r)); App.bus.emit("membership:updated", m); return m; });
  };
  P.assignRole = P.setRole;

  // responder convite de cargo (notificação): aceita → aplica o cargo; recusa → marca.
  P.respondRoleInvite = function (notifId, accept) {
    var self = this;
    return this.sb.from("notifications").select("*").eq("id", notifId).maybeSingle().then(function (r) {
      var n = r.data; if (!n) throw new Error("Notificação não encontrada");
      var p = n.payload || {};
      return self.sb.from("notifications").update({ read: true, status: accept ? "accepted" : "rejected" }).eq("id", notifId).then(function () {
        var cid = p.communityId || p.community_id, tid = p.targetUserId || p.target_user_id, role = p.role;
        function done() { if (!n.read) self._unread = Math.max(0, (+self._unread || 0) - 1); App.bus.emit("notif:read"); return self._mapNotif(n); }
        if (accept && cid && tid && role) return self.setRole(cid, tid, role).then(done, done);
        return done();
      });
    });
  };

  // tags distintas usadas pelos membros da comunidade, com contagem (desc)
  P.listCommunityTags = function (communityId) {
    return this.sb.from("community_profiles").select("tags").eq("community_id", communityId).then(function (r) {
      var counts = {};
      (pick(r) || []).forEach(function (m) { (m.tags || []).forEach(function (t) { t = String(t).trim(); if (t) counts[t] = (counts[t] || 0) + 1; }); });
      return Object.keys(counts).map(function (t) { return { tag: t, count: counts[t] }; })
        .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
    });
  };

  // exportar meus dados (LGPD): JSON com perfil + memberships + posts + comentários + follows/saved
  P.exportData = function () {
    var self = this, me = this._meId;
    if (!me) return Promise.reject(new Error("Sessão expirada — entre novamente."));
    return Promise.all([
      self.sb.from("profiles").select("*").eq("id", me).maybeSingle(),
      self.sb.from("community_profiles").select("*").eq("user_id", me),
      self.sb.from("posts").select("*").eq("user_id", me),
      self.sb.from("comments").select("*").eq("user_id", me),
      self.sb.from("follows").select("following_id").eq("follower_id", me),
      self.sb.from("saved_posts").select("post_id").eq("user_id", me)
    ]).then(function (r) {
      return JSON.stringify({
        app: "oblivian", exportedAt: new Date().toISOString(), userId: me,
        profile: r[0].data || null,
        memberships: pick(r[1]) || [], posts: pick(r[2]) || [], comments: pick(r[3]) || [],
        following: (pick(r[4]) || []).map(function (x) { return x.following_id; }),
        saved: (pick(r[5]) || []).map(function (x) { return x.post_id; })
      }, null, 2);
    });
  };

  // importar backup: na conta online os dados ficam no servidor (ids/auth próprios) →
  // restaurar um backup local não é seguro/possível. Decisão: bloquear com mensagem clara.
  P.importData = function () {
    return Promise.reject(new Error("Importar backup não funciona na conta online — seus dados já ficam salvos no servidor. Use 'Exportar' para baixar uma cópia."));
  };

  /* ============ Posts / Feed ============ */
  // anexa contagens de likes/comentários + meus likes a uma lista de rows
  P._hydratePosts = function (rows) {
    var self = this, ids = rows.map(function (p) { return p.id; });
    if (!ids.length) return Promise.resolve([]);
    return Promise.all([
      self.sb.from("post_likes").select("post_id, user_id").in("post_id", ids),
      self.sb.from("comments").select("post_id").in("post_id", ids)
    ]).then(function (res) {
      var likes = {}, mine = {}, comm = {};
      (res[0].data || []).forEach(function (l) { (likes[l.post_id] = likes[l.post_id] || []).push(l.user_id); });
      (res[1].data || []).forEach(function (c) { comm[c.post_id] = (comm[c.post_id] || 0) + 1; });
      rows.forEach(function (p) { p._likes = likes[p.id] || []; p._comments = comm[p.id] || 0; });
      return rows;
    });
  };
  P.listPosts = function (communityId) {
    var self = this;
    return this.sb.from("posts").select("*, author:profiles!user_id(*)").eq("community_id", communityId).order("created_at", { ascending: false })
      .then(function (r) {
        var rows = pick(r) || [];
        return self._hydratePosts(rows).then(function () {
          return rows.filter(function (p) { return !self._blockedIds.has(p.user_id) || p.user_id === self._meId; })
            .map(function (p) { return { post: self._mapPost(p), user: self._userOr(p.author, p.user_id) }; });
        });
      });
  };
  P.createPost = function (communityId, data) {
    if (typeof data === "string") data = { text: data };
    data = data || {};
    var ins = { community_id: communityId, user_id: this._meId, type: data.type || "text", title: data.title || "", body: (data.text || "").trim(), payload: data.payload || {} };
    var self = this;
    return this.sb.from("posts").insert(ins).select("*, author:profiles!user_id(*)").single().then(function (r) { var row = pick(r); App.bus.emit("post:new", self._mapPost(row)); return { post: self._mapPost(row), user: self._userOr(row.author, row.user_id) }; });
  };
  P.deletePost = function (postId) { return this.sb.from("posts").delete().eq("id", postId).then(function (r) { if (r.error) throw r.error; App.bus.emit("post:deleted", { id: postId }); return true; }); };
  P.editPost = function (postId, patch) {
    var up = { edited_at: new Date().toISOString() };
    if (patch.title !== undefined) up.title = patch.title;
    if (patch.text !== undefined) up.body = patch.text;
    if (patch.payload !== undefined) up.payload = patch.payload;
    var self = this;
    return this.sb.from("posts").update(up).eq("id", postId).select().single().then(function (r) { var p = self._mapPost(pick(r)); App.bus.emit("post:updated", p); return p; });
  };
  P.toggleLikePost = function (postId) {
    var self = this;
    return this.sb.from("post_likes").select("user_id", { count: "exact", head: true }).eq("post_id", postId).eq("user_id", this._meId).then(function (r) {
      var liked = (r.count || 0) > 0;
      var op = liked
        ? self.sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", self._meId)
        : self.sb.from("post_likes").insert({ post_id: postId, user_id: self._meId });
      return op.then(function () {
        if (!liked) self._notifyLikePost(postId).catch(function () {});   // novo like → notifica o autor
        return self.sb.from("post_likes").select("user_id", { count: "exact", head: true }).eq("post_id", postId);
      }).then(function (r2) { return r2.count || 0; });
    });
  };
  P._notifyLikePost = function (postId) {
    var self = this, myName = (self._me && self._me.name) || "Alguém";
    return self.sb.from("posts").select("user_id, community_id, title, text").eq("id", postId).maybeSingle().then(function (pr) {
      var post = pr.data; if (!post || !post.user_id || post.user_id === self._meId) return;
      return self.addNotification({ userId: post.user_id, cat: "all", type: "like", icon: "heart",
        title: myName + " curtiu sua publicação", sub: (post.title || post.text || "").slice(0, 60), to: "/c/" + post.community_id + "/p/" + postId }).catch(function () {});
    });
  };
  P.setFeatured = function (postId, until) {
    var self = this;
    return this.sb.from("posts").update({ featured_until: until ? new Date(until).toISOString() : null }).eq("id", postId).select().single().then(function (r) { var p = self._mapPost(pick(r)); App.bus.emit("post:updated", p); return p; });
  };
  P.setPostHidden = function (postId, hidden) {
    var self = this;
    return this.sb.from("posts").update({ hidden: !!hidden }).eq("id", postId).select().single().then(function (r) { var p = self._mapPost(pick(r)); App.bus.emit("post:updated", p); return p; });
  };
  P.setPinned = function (postId, pinned) {
    var self = this;
    return this.sb.from("posts").update({ pinned: !!pinned }).eq("id", postId).select().single().then(function (r) { var p = self._mapPost(pick(r)); App.bus.emit("post:updated", p); return p; });
  };
  P.togglePin = function (postId) { var self = this, cur = this._posts[postId]; return this.setPinned(postId, !(cur && cur.pinned)); };

  /* enquete: votes jsonb { userId: idx } no payload */
  P.votePoll = function (postId, optionIndex) {
    var self = this, row = this._posts[postId];
    var load = row ? Promise.resolve(row) : this.sb.from("posts").select("*").eq("id", postId).single().then(pick);
    return load.then(function (p) {
      var payload = p.payload || {}; payload.votes = payload.votes || {};
      if (payload.votes[self._meId] === optionIndex) delete payload.votes[self._meId]; else payload.votes[self._meId] = optionIndex;
      return self.sb.from("posts").update({ payload: payload }).eq("id", postId).select().single().then(function (r) {
        var np = pick(r); self._posts[postId] = np; App.bus.emit("post:updated", self._mapPost(np)); return self.pollState(postId);
      });
    });
  };
  P.pollState = function (postId) { // SÍNCRONO (lê cache)
    var p = this._posts[postId]; if (!p) return null;
    var opts = (p.payload && p.payload.options) || [];
    var base = opts.map(function (o) { return o && typeof o.votes === "number" ? o.votes : 0; });
    var votes = (p.payload && p.payload.votes) || {};
    Object.keys(votes).forEach(function (uid) { var i = votes[uid]; if (Number.isInteger(i) && i >= 0 && i < base.length) base[i]++; });
    return { counts: base, total: base.reduce(function (a, b) { return a + b; }, 0), myVote: votes[this._meId] != null ? votes[this._meId] : null };
  };
  P.recordQuizPlay = function (postId, score) {
    var self = this, row = this._posts[postId];
    var load = row ? Promise.resolve(row) : this.sb.from("posts").select("*").eq("id", postId).single().then(pick);
    return load.then(function (p) {
      var pl = p.payload || {}; pl.plays = (pl.plays || 0) + 1; pl.best = Math.max(pl.best || 0, score || 0);
      return self.sb.from("posts").update({ payload: pl }).eq("id", postId).select().single().then(function (r) { self._posts[postId] = pick(r); return { plays: pl.plays, best: pl.best }; });
    });
  };

  /* reações: tabela post_reactions (1 por usuário) + espelho no posts.reactions */
  P.reactPost = function (postId, emoji) {
    var self = this;
    return this.sb.from("post_reactions").select("emoji").eq("post_id", postId).eq("user_id", this._meId).maybeSingle().then(function (r) {
      var cur = r.data && r.data.emoji;
      var op;
      if (cur === emoji) op = self.sb.from("post_reactions").delete().eq("post_id", postId).eq("user_id", self._meId);
      else op = self.sb.from("post_reactions").upsert({ post_id: postId, user_id: self._meId, emoji: emoji }, { onConflict: "post_id,user_id" });
      return op.then(function () { return self._refreshReactions(postId); });
    });
  };
  P._refreshReactions = function (postId) {
    var self = this;
    return this.sb.from("post_reactions").select("emoji, user_id").eq("post_id", postId).then(function (r) {
      var rows = r.data || [], counts = {}, mine = null, map = {};
      rows.forEach(function (x) { counts[x.emoji] = (counts[x.emoji] || 0) + 1; (map[x.emoji] = map[x.emoji] || []).push(x.user_id); if (x.user_id === self._meId) mine = x.emoji; });
      if (self._posts[postId]) self._posts[postId].reactions = map;
      self._lastReact = self._lastReact || {}; self._lastReact[postId] = { counts: counts, mine: mine };
      return { counts: counts, mine: mine };
    });
  };
  P.reactionState = function (postId) { // SÍNCRONO (cache; chame reactPost/listPosts antes p/ popular)
    if (this._lastReact && this._lastReact[postId]) return this._lastReact[postId];
    var p = this._posts[postId]; var r = (p && p.reactions) || {}, counts = {}, mine = null;
    Object.keys(r).forEach(function (e) { if (Array.isArray(r[e])) { counts[e] = r[e].length; if (r[e].indexOf(this._meId) >= 0) mine = e; } }, this);
    return { counts: counts, mine: mine };
  };

  /* ============ Comentários ============ */
  P.listComments = function (postId) {
    var self = this;
    return this.sb.from("comments").select("*, author:profiles!user_id(*)").eq("post_id", postId).order("created_at").then(function (r) {
      return (pick(r) || []).map(function (c) { var m = self._mapComment(c); m.name = c.author ? (c.author.name || c.author.handle) : ""; m._user = self._mapUser(c.author); return m; });
    });
  };
  P.addComment = function (postId, text, media, parentId) {
    var self = this, body = (text || "").trim(), ins = { post_id: postId, user_id: this._meId, body: body, media: media || [], parent_id: parentId || null };
    return this.sb.from("comments").insert(ins).select("*, author:profiles!user_id(*)").single().then(function (r) {
      if (r.error) throw r.error;
      var c = pick(r); App.bus.emit("comment:new", self._mapComment(c));
      self._notifyComment(postId, body, parentId).catch(function () {});   // notifica autor do post / pai / mencionados (best-effort)
      return { comment: self._mapComment(c), user: self._mapUser(c.author) };
    });
  };
  // @handles → lista de handles minúsculos (sem capturar e-mails)
  P._mentionHandles = function (text) {
    var re = /(^|\s)@([a-zA-Z0-9_.]+)/g, m, out = [];
    while ((m = re.exec(text || "")) !== null) { var h = m[2].toLowerCase().replace(/\.+$/, ""); if (h && out.indexOf(h) < 0) out.push(h); }
    return out;
  };
  // cria notificações ao comentar: autor do post, autor do comentário-pai (resposta) e mencionados
  P._notifyComment = function (postId, text, parentId) {
    var self = this, me = this._meId, myName = (self._me && self._me.name) || "Alguém";
    return self.sb.from("posts").select("user_id, community_id").eq("id", postId).maybeSingle().then(function (pr) {
      var post = pr.data; if (!post) return;
      var nav = "/c/" + post.community_id + "/p/" + postId, notified = {}; notified[me] = true;
      var jobs = [];
      function push(uid, cat, type, icon, title) {
        if (!uid || notified[uid]) return; notified[uid] = true;
        jobs.push(self.addNotification({ userId: uid, cat: cat, type: type, icon: icon, title: title, sub: text.slice(0, 60), to: nav }).catch(function () {}));
      }
      push(post.user_id, "all", "comment", "comment", myName + " comentou sua publicação");
      function mentions() {
        var handles = self._mentionHandles(text);
        if (!handles.length) return Promise.all(jobs);
        // ilike → menção funciona independente de maiúsculas no handle
        var orF = handles.map(function (h) { return "handle.ilike." + h; }).join(",");
        return self.sb.from("profiles").select("id, handle").or(orF).then(function (hr) {
          (hr.data || []).forEach(function (p) { push(p.id, "mention", "mention", "profile", myName + " mencionou você"); });
          return Promise.all(jobs);
        });
      }
      if (parentId) {
        return self.sb.from("comments").select("user_id").eq("id", parentId).maybeSingle().then(function (cr) {
          push(cr.data && cr.data.user_id, "all", "comment", "comment", myName + " respondeu seu comentário");
          return mentions();
        });
      }
      return mentions();
    });
  };
  P.toggleLikeComment = function (commentId) {
    var self = this;
    return this.sb.from("comment_likes").select("user_id", { count: "exact", head: true }).eq("comment_id", commentId).eq("user_id", this._meId).then(function (r) {
      var liked = (r.count || 0) > 0;
      var op = liked ? self.sb.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", self._meId) : self.sb.from("comment_likes").insert({ comment_id: commentId, user_id: self._meId });
      return op.then(function () { return self.sb.from("comment_likes").select("user_id", { count: "exact", head: true }).eq("comment_id", commentId); }).then(function (r2) { return r2.count || 0; });
    });
  };
  P.deleteComment = function (commentId) { return this.sb.from("comments").delete().eq("id", commentId).then(function (r) { if (r.error) throw r.error; App.bus.emit("comment:deleted", { id: commentId }); return true; }); };
  P.editComment = function (commentId, text) {
    var self = this;
    return this.sb.from("comments").update({ body: (text || "").trim(), edited_at: new Date().toISOString() }).eq("id", commentId).select().single().then(function (r) { var c = self._mapComment(pick(r)); App.bus.emit("comment:updated", c); return c; });
  };

  /* ============ Comentários de PERFIL (mural / "Biografia") ============ */
  P._mapPComment = function (c, me) {
    if (!c) return null;
    var au = this._mapUser(c.author) || {};
    var likes = Array.isArray(c.likes) ? c.likes : [];
    return {
      id: c.id, parentId: c.parent_id, byUserId: c.by_user_id,
      targetUserId: c.target_user_id, communityId: c.community_id,
      text: c.text || "", ts: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
      likes: likes.length, liked: me ? likes.indexOf(me) >= 0 : false,
      name: au.name || au.handle || "Usuário", handle: au.handle || "", avatar: au.avatar || null,
      mine: me ? c.by_user_id === me : false
    };
  };
  P.listProfileComments = function (targetUserId, communityId) {
    var self = this, me = this._meId;
    var q = this.sb.from("profile_comments").select("*, author:profiles!by_user_id(*)").eq("target_user_id", targetUserId);
    q = communityId ? q.eq("community_id", communityId) : q.is("community_id", null);
    return q.order("created_at").then(function (r) { if (r.error) throw r.error; return (pick(r) || []).map(function (c) { return self._mapPComment(c, me); }); });
  };
  P.addProfileComment = function (targetUserId, communityId, text, parentId) {
    var self = this, me = this._meId;
    var ins = { target_user_id: targetUserId, community_id: communityId || null, by_user_id: me, text: (text || "").trim(), parent_id: parentId || null };
    return this.sb.from("profile_comments").insert(ins).select("*, author:profiles!by_user_id(*)").single().then(function (r) { if (r.error) throw r.error; return self._mapPComment(pick(r), me); });
  };
  P.toggleProfileCommentLike = function (commentId) {
    var self = this, me = this._meId;
    return this.sb.rpc("toggle_pcomment_like", { cid: commentId }).then(function (r) { if (r.error) throw r.error; return self._mapPComment(r.data, me); });
  };
  P.deleteProfileComment = function (commentId) {
    return this.sb.from("profile_comments").delete().eq("id", commentId).then(function (r) { if (r.error) throw r.error; return true; });
  };

  /* ============ Notificações ============ */
  P.listNotifications = function (userId) { var self = this; return this.sb.from("notifications").select("*").eq("user_id", userId || this._meId).order("created_at", { ascending: false }).then(function (r) { return (pick(r) || []).map(function (n) { return self._mapNotif(n); }); }); };
  P.unreadCount = function () { return (+this._unread || 0); }; // SÍNCRONO (atualizado em refreshUnread); +coerção evita vazar função
  P.refreshUnread = function () { var self = this; return this.sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", this._meId).eq("read", false).neq("type", "message").then(function (r) { self._unread = r.count || 0; return self._unread; }); };
  P._sumConvo = function () { var s = 0, m = this._convoUnread || {}; for (var k in m) s += (m[k] || 0); this._unreadConvos = s; return s; };
  P.addNotification = function (data) { var self = this; return this.sb.rpc("push_notification", { p_user: data.userId, p_cat: data.cat || "all", p_type: data.type || "generic", p_icon: data.icon || "bell", p_title: data.title || "", p_sub: data.sub || "", p_to: data.to || null, p_payload: data.payload || {} }).then(function (r) { if (r.error) throw r.error; return self._mapNotif(r.data); }); };
  P.markAllRead = function (userId) { var self = this; return this.sb.from("notifications").update({ read: true }).eq("user_id", userId || this._meId).then(function () { self._unread = 0; App.bus.emit("notif:read", userId); return true; }); };
  // marca UMA notificação como lida (ao clicar). Decremento otimista — chamador só chama p/ não-lidas.
  P.markNotificationRead = function (notifId) {
    var self = this; if (!notifId) return Promise.resolve(false);
    self._unread = Math.max(0, (+self._unread || 0) - 1);
    App.bus.emit("notif:read");
    return this.sb.from("notifications").update({ read: true }).eq("id", notifId).eq("user_id", this._meId)
      .then(function (r) { if (r.error) throw r.error; return true; })
      .catch(function () { self.refreshUnread().then(function () { App.bus.emit("notif:read"); }).catch(function () {}); return false; });
  };
  // marca lidas todas as notificações cujo destino (to) é este caminho — ao ENTRAR no contexto
  P.markNotificationsReadByPath = function (path) {
    var self = this; if (!path || !this._meId) return Promise.resolve(0);
    return this.sb.from("notifications").update({ read: true }).eq("user_id", this._meId).eq("read", false).eq("to", path).select("id")
      .then(function (r) { if (r.error) throw r.error; var n = (r.data || []).length; if (n) { self._unread = Math.max(0, (+self._unread || 0) - n); App.bus.emit("notif:read"); } return n; })
      .catch(function () { return 0; });
  };
  // assina Realtime das notificações do usuário → badge ao vivo + som + evento (sem isso nada chega de outros usuários em tempo real)
  P.subscribeNotifications = function () {
    var self = this, me = this._meId;
    if (!me || this._notifChan) return this._notifChan;
    var ch = this.sb.channel("notif:" + me)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + me }, function (payload) {
        var n = self._mapNotif(payload.new);
        if (n && n.type === "message") {
          // DM/grupo → conta no badge de CONVERSAS (não no sino)
          var cidc = n.payload && n.payload.chatId;
          if (cidc && !n.read) { self._convoUnread[cidc] = (self._convoUnread[cidc] || 0) + 1; self._sumConvo(); App.bus.emit("chats:read", { chatId: cidc }); }
        } else if (n && !n.read) {
          self._unread = (+self._unread || 0) + 1;
        }
        App.bus.emit("notif:new", n);   // o toast global (app.js) cuida do som — evita som duplicado
      }).subscribe();
    this._notifChan = ch; return ch;
  };
  P.unsubscribeNotifications = function () { if (this._notifChan) { try { this.sb.removeChannel(this._notifChan); } catch (e) {} this._notifChan = null; } };

  /* ============ Chats / Mensagens (+ Realtime) ============ */
  P.getChat = function (chatId) { var self = this; return this.sb.from("chats").select("*").eq("id", chatId).maybeSingle().then(function (r) { return self._mapChat(r.data); }); };
  P.listChats = function (communityId, opts) {
    opts = opts || {}; var self = this;
    var q = this.sb.from("chats").select("*").eq("community_id", communityId);
    if (opts.visibility) q = q.eq("visibility", opts.visibility);
    return q.order("last_message_at", { ascending: false }).then(function (r) { return (pick(r) || []).map(function (c) { return self._mapChat(c); }); });
  };
  P.createChat = function (communityId, data) {
    var self = this, ins = { community_id: communityId, type: "community", name: data.name || "chat", visibility: data.visibility || "public", allowed_roles: data.allowedRoles || null };
    return this.sb.from("chats").insert(ins).select().single().then(function (r) { var c = self._mapChat(pick(r)); App.bus.emit("chat:created", c); return c; });
  };
  // chats de UMA comunidade, enriquecidos (última msg + autor + não-lidas) p/ o hub "Meus Chats"
  P.listCommunityConversations = function (communityId) {
    var self = this, me = this._meId;
    return this.listChats(communityId).then(function (chats) {
      if (!chats.length) return [];
      return self.sb.from("chat_reads").select("chat_id, read_at").eq("user_id", me)
        .then(function (rr) { var m = {}; (pick(rr) || []).forEach(function (x) { m[x.chat_id] = x.read_at; }); return m; })
        .catch(function () { return {}; })
        .then(function (readMap) {
          return Promise.all(chats.map(function (chat) {
            var cidc = chat.id, cv = { chat: chat, lastMessage: null, lastUser: null, unread: 0 };
            var pLast = self.sb.from("messages").select("*, author:profiles!user_id(*)").eq("chat_id", cidc).order("created_at", { ascending: false }).limit(1).maybeSingle()
              .then(function (mr) { if (mr && mr.data) { cv.lastMessage = self._mapMessage(mr.data); cv.lastUser = self._mapUser(mr.data.author); } }).catch(function () {});
            var readAt = readMap[cidc] || self._reads[cidc] || null;
            var uq = self.sb.from("messages").select("id", { count: "exact", head: true }).eq("chat_id", cidc).neq("user_id", me);
            if (readAt) uq = uq.gt("created_at", readAt);
            var pUnread = uq.then(function (ur) { cv.unread = ur.count || 0; }).catch(function () {});
            return Promise.all([pLast, pUnread]).then(function () { return cv; });
          })).then(function (items) {
            items.sort(function (a, b) {
              var ta = a.lastMessage ? a.lastMessage.createdAt : a.chat.lastMessageAt;
              var tb = b.lastMessage ? b.lastMessage.createdAt : b.chat.lastMessageAt;
              return tb - ta;
            });
            return items;
          });
        });
    });
  };
  P.listMessages = function (chatId) {
    var self = this;
    // últimas 50 (desc + limit) e reverte p/ exibir em ordem — não baixa histórico inteiro
    return this.sb.from("messages").select("*, author:profiles!user_id(*)").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(50).then(function (r) {
      self.markRead(chatId);
      return (pick(r) || []).map(function (m) { return { message: self._mapMessage(m), user: self._mapUser(m.author) }; }).reverse();
    });
  };
  // anti-spam do CLIENTE (defesa-em-profundidade; o ideal é trigger no DB).
  // usa a config em cache (banned_words/cooldown_sec) de _mapChat. Sem cache → deixa o servidor decidir.
  P._clientSpamGuard = function (chatId, text) {
    var ch = this._chatCache[chatId]; if (!ch) return null;
    var t = (text || "").trim();
    if (ch.type === "community" && ch.visibility !== "private" && (ch.banned_words || []).length) {
      var low = t.toLowerCase();
      var hit = ch.banned_words.filter(Boolean).map(function (w) { return String(w).toLowerCase().trim(); }).filter(function (w) { return w && low.indexOf(w) >= 0; })[0];
      if (hit) return new Error("Mensagem bloqueada: contém termo não permitido.");
    }
    var cd = (ch.cooldown_sec || 0) * 1000;
    if (cd) {
      if (!this._sendT) this._sendT = {};
      var now = Date.now(), last = this._sendT[chatId] || 0;
      if (last && (now - last) < cd) { var e = new Error("Aguarde " + Math.ceil((cd - (now - last)) / 1000) + "s para enviar outra mensagem."); e.spam = true; e.until = last + cd; return e; }
    }
    return null;
  };
  P.sendMessage = function (chatId, text, media) {
    var self = this;
    var guard = this._clientSpamGuard(chatId, text);
    if (guard) return Promise.reject(guard);
    return this._requireMe().then(function (me) {
      var ins = { chat_id: chatId, user_id: me, text: (text || "").trim(), media: media || [] };
      return self.sb.from("messages").insert(ins).select("*, author:profiles!user_id(*)").single().then(function (r) {
        if (r.error) throw r.error;
        if (!self._sendT) self._sendT = {}; self._sendT[chatId] = Date.now();   // marca p/ cooldown
        var m = pick(r), msg = self._mapMessage(m);
        App.bus.emit("message:new", { chatId: chatId, message: msg });
        self._notifyMessage(chatId, msg).catch(function () {}); // notifica destinatários (não bloqueia envio)
        return { message: msg, user: self._mapUser(m.author) };
      });
    });
  };
  // cria notificação p/ os OUTROS participantes de uma conversa (DM/grupo).
  // Chat de comunidade é aberto (sem participants) → não notifica por mensagem.
  P._notifyMessage = function (chatId, msg) {
    var self = this, me = this._meId;
    return this.getChat(chatId).then(function (chat) {
      if (!chat) return;
      var recipients = (chat.participants || []).filter(function (uid) { return uid && uid !== me; });
      if (!recipients.length) return;
      var senderName = (self._me && self._me.name) || "Nova mensagem";
      var preview = (msg.text || "").slice(0, 80) || (msg.media && msg.media.length ? "enviou uma imagem" : "enviou uma mensagem");
      return Promise.all(recipients.map(function (uid) {
        return self.addNotification({
          userId: uid, cat: "all", type: "message", icon: "mail",
          title: senderName, sub: preview, to: "/chats/" + chatId, payload: { chatId: chatId }
        }).catch(function () {});
      }));
    });
  };
  P.markRead = function (chatId) {
    var self = this, now = new Date().toISOString(); this._reads[chatId] = now;
    if (this._convoUnread && this._convoUnread[chatId]) { this._convoUnread[chatId] = 0; this._sumConvo(); }   // abriu o chat → zera o badge na hora
    return this.sb.from("chat_reads").upsert({ user_id: this._meId, chat_id: chatId, read_at: now }, { onConflict: "user_id,chat_id" }).then(function () { App.bus.emit("chats:read", { chatId: chatId }); return true; });
  };
  // assina Realtime de um chat → emite message:new (mensagens) e chat:updated (ex.: papel de parede compartilhado) ao vivo
  P.subscribeChat = function (chatId) {
    var self = this; if (this._chatSubs[chatId]) return this._chatSubs[chatId];
    var ch = this.sb.channel("chat:" + chatId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "chat_id=eq." + chatId }, function (payload) {
        if (payload.new.user_id === self._meId) return; // já renderizei o meu
        App.bus.emit("message:new", { chatId: chatId, message: self._mapMessage(payload.new) });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chats", filter: "id=eq." + chatId }, function (payload) {
        var row = payload.new || {}; self._chatCache[chatId] = row;
        App.bus.emit("chat:updated", { chatId: chatId, wallpaper: row.wallpaper || null });
      }).subscribe();
    this._chatSubs[chatId] = ch; return ch;
  };
  P.unsubscribeChat = function (chatId) { var ch = this._chatSubs[chatId]; if (ch) { this.sb.removeChannel(ch); delete this._chatSubs[chatId]; } };

  /* ============ Presença (Realtime, 1 canal por comunidade) ============ */
  // conjunto de uids online no canal atual
  P._presOnline = function () {
    var set = new Set();
    if (!this._presChan) return set;
    var st; try { st = this._presChan.presenceState(); } catch (e) { return set; }
    Object.keys(st || {}).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m && m.uid) set.add(m.uid); }); });
    return set;
  };
  // entra (ou troca) na presença de uma comunidade. onSync(Set<uid>) a cada mudança.
  P.joinPresence = function (communityId, onSync) {
    var self = this, me = this._meId;
    if (this._presCid === communityId && this._presChan) { this._presOnSync = onSync; if (onSync) onSync(this._presOnline()); return; }
    this.leavePresence();
    this._presCid = communityId; this._presOnSync = onSync;
    var hidden = !!(this._me && this._me.hidePresence);
    var ch = this.sb.channel("presence:comm:" + communityId, { config: { presence: { key: me || "anon" } } });
    this._presChan = ch;
    function fire() { if (self._presOnSync && self._presChan === ch) self._presOnSync(self._presOnline()); }
    ch.on("presence", { event: "sync" }, fire)
      .on("presence", { event: "join" }, fire)
      .on("presence", { event: "leave" }, fire)
      .subscribe(function (status) {
        if (status !== "SUBSCRIBED" || self._presChan !== ch) return;
        if (!hidden && me) { ch.track({ uid: me, at: Date.now() }); self.touchLastSeen(); }
        // heartbeat: mantém last_seen fresco enquanto está na comunidade
        if (!hidden && me) { self._presBeat = setInterval(function () { self.touchLastSeen(); }, 45000); }
        fire();
      });
  };
  P.leavePresence = function () {
    if (this._presBeat) { clearInterval(this._presBeat); this._presBeat = null; }
    if (this._presChan) {
      try { this._presChan.untrack(); } catch (e) {}
      this.touchLastSeen();
      try { this.sb.removeChannel(this._presChan); } catch (e) {}
    }
    this._presChan = null; this._presCid = null; this._presOnSync = null;
  };
  // marca "visto por último" agora (não grava se o usuário ocultou presença)
  P.touchLastSeen = function () {
    var me = this._meId; if (!me) return Promise.resolve();
    if (this._me && this._me.hidePresence) return Promise.resolve();
    return this.sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", me).then(function () {}, function () {});
  };
  // privacidade: ocultar presença/visto-por-último
  P.setHidePresence = function (v) {
    var self = this, me = this._meId; v = !!v;
    if (this._me) this._me.hidePresence = v;
    if (!me) return Promise.resolve(v);
    return this.sb.from("profiles").update({ hide_presence: v }).eq("id", me).then(function () {
      // aplica na hora: se ocultou e está num canal, para de transmitir; se reativou, re-entra
      if (self._presChan) { var cid = self._presCid, cb = self._presOnSync; self.leavePresence(); self.joinPresence(cid, cb); }
      return v;
    });
  };

  /* conversas globais (direct/group) */
  P.getOrCreateDirect = function (targetUserId) {
    var self = this;
    // via função SECURITY DEFINER: usa auth.uid() no servidor (cliente não controla
    // participants/requested_by) → sem brigar com o RLS WITH CHECK. Erro claro se sem sessão.
    return this.sb.rpc("get_or_create_direct", { target: targetUserId }).then(function (r) {
      if (r.error) {
        if (/not authenticated/i.test(r.error.message || "")) throw new Error("Sessão expirada — entre novamente.");
        throw r.error;
      }
      var c = self._mapChat(r.data); App.bus.emit("chat:created", c); return c;
    });
  };
  P.createGroup = function (userIds, title) {
    var self = this, ids = [this._meId].concat((userIds || []).filter(function (x) { return x !== self._meId; }));
    return this.sb.from("chats").insert({ type: "group", participants: ids, title: (title || "").trim(), requested_by: this._meId, accepted: true }).select().single().then(function (r) { var c = self._mapChat(pick(r)); App.bus.emit("chat:created", c); return c; });
  };
  P.listConversations = function () {
    var self = this, me = this._meId;
    return this.sb.from("chats").select("*").in("type", ["direct", "group"]).contains("participants", [me]).order("last_message_at", { ascending: false })
      .then(function (r) {
        var convos = (pick(r) || []).filter(function (c) { return c.accepted || c.requested_by === me; }).map(function (c) { return self._convoInfo(c); });
        if (!convos.length) { self._unreadConvos = 0; self._convoUnread = {}; return convos; }
        // avatares dos parceiros de DM (1 query) + minhas leituras p/ não-lidas (1 query)
        var dmIds = {}; convos.forEach(function (cv) { if (cv.direct && cv.others[0]) dmIds[cv.others[0]] = 1; });
        var ids = Object.keys(dmIds);
        var pUsers = ids.length
          ? self.sb.from("profiles").select("*").in("id", ids).then(function (pr) { var m = {}; (pick(pr) || []).forEach(function (u) { m[u.id] = self._mapUser(u); }); return m; }).catch(function () { return {}; })
          : Promise.resolve({});
        var pReads = self.sb.from("chat_reads").select("chat_id, read_at").eq("user_id", me).then(function (rr) { var m = {}; (pick(rr) || []).forEach(function (x) { m[x.chat_id] = x.read_at; }); return m; }).catch(function () { return {}; });
        return Promise.all([pUsers, pReads]).then(function (res) {
          var userMap = res[0], readMap = res[1];
          return Promise.all(convos.map(function (cv) {
            var cid = cv.chat.id;
            if (cv.direct && cv.others[0]) { var ou = userMap[cv.others[0]]; if (ou) { cv.avatarUser = ou; cv.title = ou.name || cv.title; } }
            // última mensagem (com autor) p/ preview + nome do remetente
            var pLast = self.sb.from("messages").select("*, author:profiles!user_id(*)").eq("chat_id", cid).order("created_at", { ascending: false }).limit(1).maybeSingle()
              .then(function (mr) { if (mr && mr.data) { cv.lastMessage = self._mapMessage(mr.data); cv.lastUser = self._mapUser(mr.data.author); } }).catch(function () {});
            // não-lidas: mensagens após minha última leitura, que não são minhas
            var readAt = readMap[cid] || self._reads[cid] || null;
            var uq = self.sb.from("messages").select("id", { count: "exact", head: true }).eq("chat_id", cid).neq("user_id", me);
            if (readAt) uq = uq.gt("created_at", readAt);
            var pUnread = uq.then(function (ur) { cv.unread = ur.count || 0; }).catch(function () {});
            return Promise.all([pLast, pUnread]).then(function () { return cv; });
          })).then(function (list) {
            self._convoUnread = {}; list.forEach(function (cv) { self._convoUnread[cv.chat.id] = cv.unread || 0; });
            self._unreadConvos = list.reduce(function (n, cv) { return n + (cv.unread || 0); }, 0);
            return list;
          });
        });
      });
  };
  P._convoInfo = function (row) {
    var self = this, me = this._meId, chat = this._mapChat(row);
    var others = (row.participants || []).filter(function (id) { return id !== me; });
    return { chat: chat, direct: row.type === "direct", title: chat.title || "Conversa", others: others, avatarUser: null, lastMessage: null, lastUser: null, unread: 0 };
  };
  // solicitações de conversa: DM pendente iniciada por OUTRA pessoa
  P.listConversationRequests = function () {
    var self = this, me = this._meId;
    return this.sb.from("chats").select("*").eq("type", "direct").eq("accepted", false).contains("participants", [me])
      .then(function (r) {
        var rows = (pick(r) || []).filter(function (c) { return c.requested_by && c.requested_by !== me; });
        var convos = rows.map(function (c) { return self._convoInfo(c); });
        if (!convos.length) return convos;
        var idset = {}; convos.forEach(function (cv) { if (cv.others[0]) idset[cv.others[0]] = 1; });
        var ids = Object.keys(idset);
        if (!ids.length) return convos;
        return self.sb.from("profiles").select("*").in("id", ids).then(function (pr) {
          var m = {}; (pick(pr) || []).forEach(function (u) { m[u.id] = self._mapUser(u); });
          convos.forEach(function (cv) { var ou = m[cv.others[0]]; if (ou) { cv.avatarUser = ou; cv.title = ou.name || cv.title; } });
          return convos;
        }).catch(function () { return convos; });
      });
  };
  // contatos = quem eu sigo (global)
  P.listContacts = function () {
    var self = this;
    return this.sb.from("follows").select("following_id").eq("follower_id", this._meId).then(function (r) {
      var ids = (pick(r) || []).map(function (x) { return x.following_id; });
      if (!ids.length) return [];
      return self.sb.from("profiles").select("*").in("id", ids).then(function (pr) { return (pick(pr) || []).map(function (u) { return self._mapUser(u); }).filter(Boolean); });
    });
  };
  P.acceptConversation = function (chatId) { var self = this; return this.sb.from("chats").update({ accepted: true }).eq("id", chatId).select().single().then(function (r) { var c = self._mapChat(pick(r)); App.bus.emit("chat:created", c); return c; }); };
  P.declineConversation = function (chatId) { return this.sb.from("chats").delete().eq("id", chatId).then(function () { App.bus.emit("chats:read", {}); return true; }); };
  P.deleteChat = function (chatId) { return this.sb.from("chats").delete().eq("id", chatId).then(function () { App.bus.emit("chat:deleted", { chatId: chatId }); return true; }); };

  /* badge de conversas não lidas — SÍNCRONO (cache) */
  P.unreadConversations = function () { return this._unreadConvos || 0; };

  /* preferências por conversa (mudo/papel de parede/balão) — locais por dispositivo */
  P._prefsKey = function (chatId) { return "oblivian.chatprefs." + (this._meId || "anon") + "." + chatId; };
  P.getChatPrefs = function (chatId) { // SÍNCRONO
    try { var p = JSON.parse(localStorage.getItem(this._prefsKey(chatId)) || "{}"); return { muted: !!p.muted, wallpaper: p.wallpaper || null, bubble: p.bubble || "accent" }; }
    catch (e) { return { muted: false, wallpaper: null, bubble: "accent" }; }
  };
  P.setChatPrefs = function (chatId, patch) {
    var next = Object.assign(this.getChatPrefs(chatId), patch || {});
    try { localStorage.setItem(this._prefsKey(chatId), JSON.stringify(next)); } catch (e) {}
    App.bus.emit("chat:prefs", { chatId: chatId });
    return Promise.resolve(next);
  };
  // papel de parede COMPARTILHADO: vive na linha do chat → todos os participantes veem a mesma troca
  P.setChatWallpaper = function (chatId, wp) {
    var self = this;
    return this.sb.from("chats").update({ wallpaper: wp || null }).eq("id", chatId).then(function (r) {
      if (r.error) throw r.error;
      var row = self._chatCache[chatId]; if (row) row.wallpaper = wp || null;
      App.bus.emit("chat:updated", { chatId: chatId, wallpaper: wp || null });
      return true;
    }).catch(function () {
      // coluna 'wallpaper' ainda não migrada no DB → guarda local (degrada sem quebrar)
      self.setChatPrefs(chatId, { wallpaper: wp || null });
      App.bus.emit("chat:updated", { chatId: chatId, wallpaper: wp || null });
      return false;
    });
  };

  /* config anti-spam do chat (cooldown/banidos) — SÍNCRONO via cache do chat */
  P.getChatConfig = function (chatId) {
    var c = this._chatCache[chatId] || {};
    return { cooldownSec: c.cooldown_sec || 0, bannedWords: (c.banned_words || []).slice() };
  };
  // pode gerir o chat? (síncrono) — dono, criador da DM/grupo (mod de comunidade é checado à parte)
  P._canManageChat = function (chat) {
    if (!chat) return false;
    var me = this._meId;
    if (chat.ownerId && chat.ownerId === me) return true;
    if (chat.communityId) return false;     // moderação de comunidade é assíncrona; conservador aqui
    return chat.requestedBy === me;
  };
  P.setChatReadOnly = function (chatId, value) {
    var self = this;
    return this.sb.from("chats").update({ read_only: !!value }).eq("id", chatId).select().single().then(function (r) { var c = self._mapChat(pick(r)); App.bus.emit("chat:updated", c); return c; });
  };
  P.transferChatOwnership = function (chatId, userId) {
    var self = this;
    return this.sb.from("chats").update({ owner_id: userId }).eq("id", chatId).select().single().then(function (r) { var c = self._mapChat(pick(r)); App.bus.emit("chat:updated", c); return c; });
  };
  P.leaveConversation = function (chatId) {
    var self = this, me = this._meId;
    return this.sb.from("chats").select("*").eq("id", chatId).maybeSingle().then(function (r) {
      var row = r.data; if (!row) throw new Error("Conversa não encontrada");
      if (row.type === "group") {
        var parts = (row.participants || []).filter(function (x) { return x !== me; });
        if (parts.length > 1) return self.sb.from("chats").update({ participants: parts }).eq("id", chatId).then(function () { App.bus.emit("chat:deleted", { chatId: chatId }); return true; });
      }
      return self.sb.from("chats").delete().eq("id", chatId).then(function () { App.bus.emit("chat:deleted", { chatId: chatId }); return true; });
    });
  };
  P.setChatConfig = function (chatId, patch) {
    var up = {}, self = this;
    if (patch.cooldownSec != null) up.cooldown_sec = Math.max(0, Math.min(3600, +patch.cooldownSec || 0));
    if (patch.bannedWords != null) up.banned_words = (patch.bannedWords || []).map(function (w) { return String(w).toLowerCase().trim(); }).filter(Boolean);
    return this.sb.from("chats").update(up).eq("id", chatId).select().single().then(function (r) { if (r.data) self._chatCache[chatId] = r.data; App.bus.emit("chat:config", { chatId: chatId }); return self.getChatConfig(chatId); });
  };

  /* ============ Moderação ============ */
  P.moderate = function (communityId, targetUserId, opts) {
    opts = opts || {}; var self = this, expires = opts.durationMs ? new Date(Date.now() + opts.durationMs).toISOString() : null;
    var status = { action: opts.action, expiresAt: expires ? Date.parse(expires) : null, reason: opts.reason || "", byUserId: this._meId, createdAt: Date.now() };
    return this.sb.from("community_profiles").update({ status: status }).eq("community_id", communityId).eq("user_id", targetUserId)
      .then(function () { return self.sb.from("moderation").insert({ community_id: communityId, target_user_id: targetUserId, by_user_id: self._meId, action: opts.action, reason: opts.reason || "", expires_at: expires }); })
      .then(function () {
        // avisa o usuário moderado (notificação)
        var L = {
          hide: ["Seu perfil foi ocultado", "A moderação ocultou seu perfil nesta comunidade."],
          mute: ["Você foi silenciado", "A moderação silenciou você nesta comunidade."],
          ban: ["Você foi banido", "A moderação removeu seu acesso a esta comunidade."]
        };
        var m = L[opts.action];
        if (!m) return;
        var sub = m[1] + (opts.reason ? " Motivo: " + opts.reason : "");
        return self.addNotification({
          userId: targetUserId, cat: "system", type: "moderation", icon: opts.action,
          title: m[0], sub: sub, to: "#/c/" + communityId + "/u/" + targetUserId,
          payload: { communityId: communityId, action: opts.action }
        }).catch(function () {});   // notificação é best-effort, não derruba a moderação
      })
      .then(function () { App.bus.emit("moderation:changed", { communityId: communityId, targetUserId: targetUserId }); return status; });
  };
  P.liftModeration = function (communityId, targetUserId) { return this.sb.from("community_profiles").update({ status: null }).eq("community_id", communityId).eq("user_id", targetUserId).then(function () { App.bus.emit("moderation:changed", { communityId: communityId, targetUserId: targetUserId }); return true; }); };
  P.listModeration = function (communityId) {
    var self = this;
    return this.sb.from("community_profiles").select("*, user:profiles!user_id(*)").eq("community_id", communityId).not("status", "is", null).then(function (r) {
      return (pick(r) || []).map(function (m) { return { membership: self._mapMembership(m), user: self._mapUser(m.user), status: m.status }; });
    });
  };
  P.reportContent = function (targetType, targetId, reason, communityId) {
    return this.sb.from("reports").insert({ by_user_id: this._meId, target_type: targetType, target_id: String(targetId), community_id: communityId || null, reason: reason || "" }).select().single().then(function (r) { return pick(r); });
  };
  P.listReports = function (communityId) {
    var q = this.sb.from("reports").select("*").order("created_at", { ascending: false });
    if (communityId) q = q.eq("community_id", communityId);
    return q.then(function (r) { return pick(r) || []; });
  };

  /* ============ Mídia inline [IMG|code] ============
     Embute o dataURL (webp) DIRETO no código → vai pro corpo do post (DB) e
     todos enxergam (antes salvava só no localStorage do autor = quebrado p/ outros).
     getImage aceita dataURL novo e ainda resolve códigos antigos do localStorage. */
  P.addImage = function (dataURL) { if (!dataURL) return Promise.reject(new Error("Imagem inválida")); return Promise.resolve(dataURL); };
  P.getImage = function (code) {
    code = String(code || "");
    if (code.indexOf("data:") === 0) return code;   // dataURL embutido (novo, cross-user)
    try { return localStorage.getItem("oblivian.media." + code) || localStorage.getItem("obliviny.media." + code) || null; } catch (e) { return null; }  // legado
  };

  /* ============ Economia (RPCs server-side) ============ */
  P.getWallet = function () { var self = this; return this.sb.from("wallets").select("balance").eq("user_id", this._meId).maybeSingle().then(function (r) { self._balance = r.data ? r.data.balance : 0; App.bus.emit("econ:change", { balance: self._balance }); return { balance: self._balance }; }); };
  P.getBalance = function () { return this._balance; }; // SÍNCRONO
  P.listStoreItems = function () { return this.sb.from("store_items").select("*").eq("active", true).order("price").then(function (r) { return pick(r) || []; }); };
  P.getStoreItem = function (id) { return (this._storeCatalog && this._storeCatalog[id]) || null; }; // SÍNCRONO (cache do catálogo)
  P.listMyItems = function () { return this.sb.from("user_items").select("*, item:store_items(*)").eq("user_id", this._meId).then(function (r) { return (pick(r) || []).map(function (u) { return { userItem: u, item: u.item }; }); }); };
  P.ownsItem = function (itemId) { return this._ownedItems.has(itemId); }; // SÍNCRONO
  P.getEquipped = function (category) { return this._equipped[category] || null; }; // SÍNCRONO
  P.equipItem = function (itemId) {
    var self = this;
    return this.sb.rpc("equip_item", { p_item_id: itemId }).then(function (r) {
      if (r.error) {
        // fallback: marca equipped direto (RPC pode não existir nesse nome)
        return self.sb.from("user_items").update({ equipped: true }).eq("item_id", itemId).eq("user_id", self._meId).then(function () { return null; });
      }
      return r.data;
    }).then(function () { App.bus.emit("econ:equip", {}); return { equipped: self._equipped }; });
  };
  P.buyItem = function (itemId) {
    var self = this;
    return this.sb.rpc("purchase_item", { p_item_id: itemId }).then(function (r) { if (r.error) throw r.error; var row = (r.data && r.data[0]) || {}; self._balance = row.balance; self._ownedItems.add(itemId); App.bus.emit("econ:change", { balance: self._balance }); return { balance: row.balance }; });
  };
  P.adStatus = function () { // SÍNCRONO
    var today = new Date(); var key = today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
    var log = this._adToday; if (log.date !== key) return { remaining: AD_DAILY_LIMIT, limit: AD_DAILY_LIMIT, cooldownLeft: 0, reward: AD_REWARD };
    return { remaining: Math.max(0, AD_DAILY_LIMIT - log.count), limit: AD_DAILY_LIMIT, cooldownLeft: Math.max(0, AD_COOLDOWN_MS - (Date.now() - log.lastAt)), reward: AD_REWARD };
  };
  P.claimAdReward = function (completed) {
    if (!completed) return Promise.reject(new Error("Anúncio não concluído — sem recompensa"));
    var self = this, today = new Date(), key = today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
    return this.sb.rpc("credit_ad_reward").then(function (r) {
      if (r.error) throw r.error;
      var row = (r.data && r.data[0]) || {}; self._balance = row.balance;
      if (self._adToday.date !== key) self._adToday = { date: key, count: 0, lastAt: 0 };
      self._adToday.count++; self._adToday.lastAt = Date.now();
      App.bus.emit("econ:change", { balance: self._balance });
      return { balance: row.balance, reward: row.reward, remaining: row.remaining };
    });
  };
  P.listCoinTransactions = function () { return this.sb.from("coin_transactions").select("*").eq("user_id", this._meId).order("created_at", { ascending: false }).limit(100).then(function (r) { return pick(r) || []; }); };

  /* ---------- upload de mídia (R2 via Worker) ---------- */
  P.uploadImage = function (file, opts) {
    opts = opts || {}; var cfg = App.config.r2 || {};
    return App.util.downscaleImage(file, { maxDim: opts.maxDim || 1280, quality: opts.quality || 0.85, mime: "image/webp" })
      .then(function (dataUrl) { return fetch(dataUrl).then(function (r) { return r.blob(); }); })
      .then(function (blob) {
        return fetch(cfg.uploadEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: opts.kind || "post", mime: "image/webp" }) })
          .then(function (r) { return r.json(); })
          .then(function (sig) { return fetch(sig.uploadUrl, { method: "PUT", headers: { "content-type": "image/webp" }, body: blob }).then(function () { return cfg.publicBase + "/" + sig.key; }); });
      });
  };

  /* ============ Utilidades ============ */
  P.resetData = function () { return Promise.reject(new Error("resetData indisponível no backend Supabase")); };
  P.search = function (query) {
    query = (query || "").trim(); if (!query) return Promise.resolve({ communities: [], users: [], posts: [] });
    var self = this, like = "%" + query + "%";
    return Promise.all([
      this._allCommunities(query),
      this.sb.from("profiles").select("*").or("name.ilike." + like + ",handle.ilike." + like).limit(20),
      this.sb.from("posts").select("*, author:profiles!user_id(*)").or("title.ilike." + like + ",body.ilike." + like).order("created_at", { ascending: false }).limit(30)
    ]).then(function (res) {
      return { communities: res[0], users: (res[1].data || []).map(function (u) { return self._mapUser(u); }), posts: (res[2].data || []).map(function (p) { return { post: self._mapPost(p), user: self._userOr(p.author, p.user_id) }; }) };
    });
  };

  /* ---------- rede de segurança: métodos do contrato ainda não portados ----------
     evita "is not a function": qualquer método de LocalRepository ausente vira
     stub que rejeita com mensagem clara (não derruba a tela; o router trata). */
  if (App.LocalRepository) {
    Object.keys(App.LocalRepository.prototype).forEach(function (k) {
      // NUNCA stubar internos "_" do LocalRepository: são privados dele e, no
      // SupabaseRepository, esses nomes são CACHES de instância (ex.: this._unread,
      // this._me). Um stub no protótipo apareceria como valor quando o cache ainda
      // não foi populado (ex.: badge renderizando o código-fonte da função). #bug
      if (k.charAt(0) === "_") return;
      if (typeof P[k] !== "function" && typeof App.LocalRepository.prototype[k] === "function") {
        P[k] = function () { return Promise.reject(new Error("SupabaseRepository." + k + " ainda não implementado")); };
      }
    });
    // rede reversa: métodos SÓ do Supabase (ex.: signIn/signOut/signUp) viram stub
    // que REJEITA no LocalRepository (demo) em vez de TypeError cru. Aqui os dois protótipos já existem.
    var LP = App.LocalRepository.prototype;
    Object.keys(P).forEach(function (k) {
      if (k.charAt(0) === "_") return;
      if (typeof LP[k] !== "function" && typeof P[k] === "function") {
        LP[k] = function () { return Promise.reject(new Error("LocalRepository." + k + " indisponível no modo demo")); };
      }
    });
  }

  App.SupabaseRepository = SupabaseRepository;

  /* ---------- fábrica: escolhe backend de forma SEGURA ----------
     Usa Supabase só se config tiver chave real e supabase-js carregou;
     senão cai p/ LocalRepository (demo). Erros → Local. */
  App.makeRepository = function () {
    try {
      var c = App.config && App.config.supabase;
      var keyOk = c && c.anonKey && c.anonKey.indexOf("COLE_AQUI") < 0 && c.url && c.url.indexOf("SEU-PROJETO") < 0;
      if (keyOk && typeof window.supabase !== "undefined" && !App.FORCE_LOCAL) return new SupabaseRepository();
    } catch (e) { console.warn("[repo] Supabase indisponível, usando local:", e && e.message); }
    return new App.LocalRepository();
  };
})(window.App = window.App || {});
