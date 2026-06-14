/* ============================================================
   data/localRepository.js — Implementação da camada de dados
   sobre localStorage. Persiste o banco gerado pelo seed.
   Namespace: App.LocalRepository (extends App.Repository)
   Métodos assíncronos (Promise) para troca futura por API.
   ============================================================ */
(function (App) {
  "use strict";
  var M = App.models;
  var DB_KEY = "sanguao.db.v21"; // bump = força reseed (seed novo) — v21: economia/moedas/loja

  function LocalRepository() {
    this.db = this._load();
  }
  LocalRepository.prototype = Object.create(App.Repository.prototype);
  LocalRepository.prototype.constructor = LocalRepository;

  var P = LocalRepository.prototype;

  /* ---------- persistência ---------- */
  P._load = function () {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) {
        var db = JSON.parse(raw);
        if (!db.reads) db.reads = {};
        return db;
      }
    } catch (e) { console.warn("[db] falha ao ler, recriando", e); }
    var fresh = App.seed.build();
    fresh.reads = {};
    this._save(fresh);
    return fresh;
  };
  P._save = function (db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db || this.db)); return true; }
    catch (e) { console.error("[db] falha ao salvar", e); return false; }
  };
  P._commit = function () { return this._save(this.db); };
  var FULL_MSG = "Armazenamento cheio — não foi possível salvar. Use uma imagem/GIF menor ou remova capas.";
  function ok(v) { return Promise.resolve(v); }
  function fail(msg) { return Promise.reject(new Error(msg)); }

  P._uid = function () { return this.db.currentUserId; };

  /* ---------- moderação: limpa status expirado ---------- */
  P._activeStatus = function (membership) {
    if (!membership || !membership.status) return null;
    var s = membership.status;
    if (s.expiresAt && s.expiresAt <= Date.now()) {
      membership.status = null;
      this._commit();
      return null;
    }
    return membership.status;
  };

  /* ============ Conta global ============ */
  P.getCurrentUser = function () { return ok(this.db.users[this._uid()] || null); };
  P.resetPassword = function () { return ok(true); };   // demo: simula envio do link de recuperação
  P.getUser = function (id) { return ok(this.db.users[id] || null); };

  P.checkHandle = function (handle) {
    var me = this._uid(), h = String(handle || "").trim().replace(/^@/, "").replace(/\s+/g, "");
    if (!h) return ok({ ok: false, taken: false, handle: h });
    var users = this.db.users || {}, taken = false;
    for (var k in users) { if (users[k] && users[k].handle === h && k !== me) { taken = true; break; } }
    return ok({ ok: !taken, taken: taken, handle: h });
  };
  P.updateUser = function (id, patch) {
    var u = this.db.users[id];
    if (!u) return fail("Usuário não encontrado");
    // ID (@usuário) único: não pode repetir de outro usuário
    if (patch.handle !== undefined && patch.handle !== u.handle) {
      var users = this.db.users || {};
      for (var k in users) { if (k !== id && users[k] && users[k].handle === patch.handle) return fail("Esse ID (@usuário) já está em uso. Escolha outro."); }
      if (u.handleChanged) return fail("O ID de usuário só pode ser alterado uma vez.");
      patch.handleChanged = true;
    }
    // Bloqueio de campos exclusivos de comunidade na conta global
    ["reputation", "tags", "titles"].forEach(function (k) { delete patch[k]; });
    var backup = {}; Object.keys(patch).forEach(function (k) { backup[k] = u[k]; });
    Object.assign(u, patch);
    if (!this._commit()) { Object.assign(u, backup); return fail(FULL_MSG); }
    App.bus.emit("user:updated", u);
    return ok(u);
  };

  P.follow = function (targetId) {
    var me = this.db.users[this._uid()], t = this.db.users[targetId];
    if (targetId === (me && me.id)) return ok(false);   // não segue a si mesmo
    if (!me || !t) return fail("Inválido");
    var isNew = me.following.indexOf(targetId) < 0;
    if (isNew) me.following.push(targetId);
    if (t.followers.indexOf(me.id) < 0) t.followers.push(me.id);
    this._commit();
    if (isNew) this.addNotification({ userId: targetId, cat: "all", type: "follow", icon: "profile",
      title: (me.name || "Alguém") + " começou a seguir você", sub: "", to: "/u/" + me.id, payload: { userId: me.id } });
    return ok(true);
  };
  P.unfollow = function (targetId) {
    var me = this.db.users[this._uid()], t = this.db.users[targetId];
    if (!me || !t) return fail("Inválido");
    me.following = me.following.filter(function (x) { return x !== targetId; });
    t.followers = t.followers.filter(function (x) { return x !== me.id; });
    this._commit();
    return ok(true);
  };
  P.isFollowing = function (targetId) {
    var me = this.db.users[this._uid()];
    return ok(!!me && me.following.indexOf(targetId) >= 0);
  };
  P.listFollowers = function (userId) {
    var u = this.db.users[userId]; if (!u) return ok([]);
    var self = this;
    return ok(u.followers.map(function (id) { return self.db.users[id]; }).filter(Boolean));
  };
  P.listFollowing = function (userId) {
    var u = this.db.users[userId]; if (!u) return ok([]);
    var self = this;
    return ok(u.following.map(function (id) { return self.db.users[id]; }).filter(Boolean));
  };

  /* ============ Salvar posts / Favoritar comunidades / Bloquear / Denunciar ============
     Tudo no perfil GLOBAL do usuário (conta), não por comunidade. */
  P._me = function () { return this.db.users[this._uid()]; };

  /* ---- Comentários de perfil (mural / "Biografia") — demo local persistido ---- */
  P.listProfileComments = function (targetUserId, communityId) {
    var db = this.db, me = this._uid();
    var arr = (db.profileComments || []).filter(function (c) { return c.targetUserId === targetUserId && (c.communityId || null) === (communityId || null); });
    return ok(arr.map(function (c) {
      var au = db.users[c.byUserId] || {}, likes = c.likes || [];
      return { id: c.id, parentId: c.parentId || null, byUserId: c.byUserId, targetUserId: c.targetUserId, communityId: c.communityId || null,
        text: c.text, ts: c.ts, likes: likes.length, liked: likes.indexOf(me) >= 0,
        name: au.name || au.handle || "Usuário", handle: au.handle || "", avatar: au.avatar || null, mine: c.byUserId === me };
    }));
  };
  P.addProfileComment = function (targetUserId, communityId, text, parentId) {
    var me = this._me(); if (!me) return fail("Sem usuário");
    if (!this.db.profileComments) this.db.profileComments = [];
    var c = { id: App.util.uid("pc"), targetUserId: targetUserId, communityId: communityId || null, byUserId: me.id, text: (text || "").trim(), parentId: parentId || null, likes: [], ts: Date.now() };
    this.db.profileComments.push(c); this._commit();
    return ok({ id: c.id });
  };
  P.toggleProfileCommentLike = function (commentId) {
    var me = this._uid(), c = (this.db.profileComments || []).filter(function (x) { return x.id === commentId; })[0];
    if (!c) return fail("Comentário não encontrado");
    c.likes = c.likes || []; var i = c.likes.indexOf(me);
    if (i >= 0) c.likes.splice(i, 1); else c.likes.push(me);
    this._commit(); return ok({ id: c.id, likes: c.likes.length, liked: i < 0 });
  };
  P.deleteProfileComment = function (commentId) {
    var me = this._uid();
    this.db.profileComments = (this.db.profileComments || []).filter(function (x) {
      return !(x.id === commentId && (x.byUserId === me || x.targetUserId === me)) && x.parentId !== commentId;
    });
    this._commit(); return ok(true);
  };

  P.toggleSavePost = function (postId) {
    var me = this._me(); if (!me) return fail("Sem usuário");
    if (!me.savedPosts) me.savedPosts = [];
    var i = me.savedPosts.indexOf(postId);
    if (i >= 0) me.savedPosts.splice(i, 1); else me.savedPosts.unshift(postId);
    this._commit();
    App.bus.emit("user:updated", me);
    return ok(i < 0); // true = salvou agora
  };
  // SÍNCRONO de propósito: usado direto na renderização de menus/labels (sem await).
  P.isSaved = function (postId) {
    var me = this._me();
    return !!(me && Array.isArray(me.savedPosts) && me.savedPosts.indexOf(postId) >= 0);
  };
  P.listSaved = function () {
    var me = this._me(), db = this.db; if (!me) return ok([]);
    var list = (me.savedPosts || []).map(function (id) {
      var p = db.posts.filter(function (x) { return x.id === id; })[0];
      return p ? { post: p, user: db.users[p.userId] } : null;
    }).filter(Boolean);
    return ok(list);
  };
  P.toggleFavoriteCommunity = function (communityId) {
    var me = this._me(); if (!me) return fail("Sem usuário");
    if (!me.favCommunities) me.favCommunities = [];
    var i = me.favCommunities.indexOf(communityId);
    if (i >= 0) me.favCommunities.splice(i, 1); else me.favCommunities.unshift(communityId);
    this._commit();
    App.bus.emit("user:updated", me);
    return ok(i < 0);
  };
  // SÍNCRONO de propósito (render direto).
  P.isFavoriteCommunity = function (communityId) {
    var me = this._me();
    return !!(me && Array.isArray(me.favCommunities) && me.favCommunities.indexOf(communityId) >= 0);
  };
  P.listFavoriteCommunities = function () {
    var me = this._me(), self = this; if (!me) return ok([]);
    var list = (me.favCommunities || []).map(function (id) {
      var c = self.db.communities[id];
      if (c) c.memberCount = self.db.memberships.filter(function (m) { return m.communityId === id; }).length;
      return c;
    }).filter(Boolean);
    return ok(list);
  };
  P.blockUser = function (targetId) {
    var me = this._me(); if (!me) return fail("Sem usuário");
    if (targetId === me.id) return fail("Não dá para bloquear a si mesmo");
    if (!me.blocked) me.blocked = [];
    if (me.blocked.indexOf(targetId) < 0) me.blocked.push(targetId);
    // bloquear também deixa de seguir nos dois sentidos
    me.following = (me.following || []).filter(function (x) { return x !== targetId; });
    var t = this.db.users[targetId];
    if (t) { t.followers = (t.followers || []).filter(function (x) { return x !== me.id; }); }
    this._commit();
    App.bus.emit("user:updated", me);
    return ok(true);
  };
  P.unblockUser = function (targetId) {
    var me = this._me(); if (!me) return fail("Sem usuário");
    me.blocked = (me.blocked || []).filter(function (x) { return x !== targetId; });
    this._commit();
    App.bus.emit("user:updated", me);
    return ok(true);
  };
  // SÍNCRONO de propósito (render direto).
  P.isBlocked = function (targetId) {
    var me = this._me();
    return !!(me && Array.isArray(me.blocked) && me.blocked.indexOf(targetId) >= 0);
  };
  P.listBlocked = function () {
    var me = this._me(), db = this.db; if (!me) return ok([]);
    return ok((me.blocked || []).map(function (id) { return db.users[id]; }).filter(Boolean));
  };
  P._reports = function () { if (!this.db.reports) this.db.reports = []; return this.db.reports; };
  P.reportContent = function (targetType, targetId, reason, communityId) {
    var me = this._uid();
    if (!targetType || !targetId) return fail("Alvo inválido");
    var r = M.Report({ byUserId: me, targetType: targetType, targetId: targetId, reason: reason || "", communityId: communityId || null });
    this._reports().push(r);
    this._commit();
    App.bus.emit("report:new", r);
    return ok(r);
  };
  P.listReports = function (communityId) {
    var list = this._reports().filter(function (r) {
      return !communityId || r.communityId === communityId;
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    return ok(list);
  };

  /* ============ Comunidades ============ */
  P._allCommunities = function () {
    var db = this.db;
    return Object.keys(db.communities).map(function (id) {
      var c = db.communities[id];
      c.memberCount = db.memberships.filter(function (m) { return m.communityId === id; }).length;
      return c;
    });
  };
  P.listCommunities = function (opts) {
    opts = opts || {};
    var list = this._allCommunities();
    if (opts.query) {
      var q = opts.query.toLowerCase();
      list = list.filter(function (c) {
        return c.name.toLowerCase().indexOf(q) >= 0 ||
          c.description.toLowerCase().indexOf(q) >= 0 ||
          c.tags.join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    return ok(list);
  };
  /* busca global: comunidades + usuários + publicações */
  P.search = function (query) {
    query = (query || "").trim().toLowerCase();
    if (!query) return ok({ communities: [], users: [], posts: [] });
    var db = this.db, me = this._uid();
    var blocked = (db.users[me] && db.users[me].blocked) || [];
    var communities = this._allCommunities().filter(function (c) {
      return c.name.toLowerCase().indexOf(query) >= 0 ||
        (c.description || "").toLowerCase().indexOf(query) >= 0 ||
        (c.tags || []).join(" ").toLowerCase().indexOf(query) >= 0;
    });
    var users = Object.keys(db.users).map(function (id) { return db.users[id]; }).filter(function (u) {
      if (blocked.indexOf(u.id) >= 0) return false;
      return (u.name || "").toLowerCase().indexOf(query) >= 0 ||
        (u.handle || "").toLowerCase().indexOf(query) >= 0 ||
        (u.bio || "").toLowerCase().indexOf(query) >= 0;
    });
    var posts = db.posts.filter(function (p) {
      if (blocked.indexOf(p.userId) >= 0) return false;
      return (p.title || "").toLowerCase().indexOf(query) >= 0 ||
        (p.text || "").toLowerCase().indexOf(query) >= 0;
    }).sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 30)
      .map(function (p) { return { post: p, user: db.users[p.userId] }; });
    return ok({ communities: communities, users: users, posts: posts });
  };

  /* busca do Explorer: SÓ comunidades + usuários (sem publicações).
     Privacidade tratada aqui: comunidade privada só casa por nome completo.
     Usuários só com "@". Ver App.search. */
  P.searchExplore = function (raw) {
    var p = App.search.parse(raw);
    var db = this.db, me = this._uid();
    var blocked = (db.users[me] && db.users[me].blocked) || [];
    var communities = [], users = [];
    if (p.mode === "users") {
      if (p.term) {
        users = Object.keys(db.users).map(function (id) { return db.users[id]; }).filter(function (u) {
          if (u.id === me || blocked.indexOf(u.id) >= 0) return false;
          return App.search.matchUser(u, p.term);
        }).slice(0, 30);
      }
    } else if (p.term) {
      communities = this._allCommunities().filter(function (c) {
        return App.search.matchCommunity(c, p.term);
      }).slice(0, 50);
    }
    return ok({ mode: p.mode, communities: communities, users: users });
  };

  // descoberta pública: nunca expõe comunidade privada (só via link/nome completo)
  P._publicCommunities = function () {
    return this._allCommunities().filter(function (c) { return !(c.settings && c.settings.visibility === "private"); });
  };
  P.getFeatured = function () {
    var list = this._publicCommunities().slice().sort(function (a, b) { return b.memberCount - a.memberCount; });
    return ok(list[0] || null);
  };
  P.getRecentCommunities = function () {
    var list = this._publicCommunities().slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    return ok(list);
  };
  P.getMyCommunities = function () {
    var me = this._uid(), db = this.db;
    var ids = db.memberships.filter(function (m) { return m.userId === me; }).map(function (m) { return m.communityId; });
    var self = this;
    var list = ids.map(function (id) {
      var c = db.communities[id];
      if (c) c.memberCount = db.memberships.filter(function (m) { return m.communityId === id; }).length;
      return c;
    }).filter(Boolean);
    return ok(list);
  };
  P.getUserCommunities = function (userId) {
    var db = this.db, me = this._uid();
    var ids = db.memberships.filter(function (m) { return m.userId === userId; }).map(function (m) { return m.communityId; });
    var list = ids.map(function (id) {
      var c = db.communities[id];
      if (c) c.memberCount = db.memberships.filter(function (m) { return m.communityId === id; }).length;
      return c;
    }).filter(Boolean).filter(function (c) { return c.settings.visibility === "public" || userId === me; });
    return ok(list);
  };
  P.getCommunity = function (id) {
    var c = this.db.communities[id];
    if (c) c.memberCount = this.db.memberships.filter(function (m) { return m.communityId === id; }).length;
    return ok(c || null);
  };
  P.isMember = function (communityId, userId) {
    userId = userId || this._uid();
    return ok(this.db.memberships.some(function (m) { return m.communityId === communityId && m.userId === userId; }));
  };

  P.createCommunity = function (data) {
    var me = this._uid(), now = Date.now();
    // TEMPLATE: comunidade nasce pronta (diretrizes, chats, post de boas-vindas).
    var tpl = Object.assign({ ownerId: me, memberCount: 1 }, data);
    if (!tpl.description) {
      tpl.description = "Bem-vindo(a) à comunidade!\n\n" +
        "• Publique de tudo: texto, imagem, enquete, quiz, link, pergunta e wiki\n" +
        "• Converse nos chats públicos\n" +
        "• Destaques escolhidos pela equipe\n\n" +
        "Regras: respeito sempre e nada de spam.";
    }
    var community = M.Community(tpl);
    this.db.communities[community.id] = community;
    // perfil de dono
    this.db.memberships.push(M.Membership({
      communityId: community.id, userId: me, role: "owner",
      reputation: 0, titles: ["Fundador(a)"], bio: ""
    }));
    // chats padrão (2 públicos + 1 staff)
    this.db.chats[community.id + "_geral"] = M.Chat({ id: community.id + "_geral", communityId: community.id, name: "geral", visibility: "public", createdAt: now });
    this.db.chats[community.id + "_offtopic"] = M.Chat({ id: community.id + "_offtopic", communityId: community.id, name: "off-topic", visibility: "public", createdAt: now });
    this.db.chats[community.id + "_staff"] = M.Chat({ id: community.id + "_staff", communityId: community.id, name: "staff", visibility: "private", allowedRoles: ["owner", "admin"], createdAt: now });
    // post de boas-vindas (fixado + em destaque por 7 dias)
    this.db.posts.push(M.Post({
      communityId: community.id, userId: me, type: "text",
      title: "Bem-vindo(a) à " + community.name + "! 🎉",
      text: "Esta comunidade já vem pronta: chats, abas e diretrizes configurados.\n\nÉ só personalizar em **Configurar**, publicar o primeiro conteúdo e chamar a galera. Boas criações!",
      pinned: true, featuredUntil: now + 7 * 86400000, createdAt: now
    }));
    this._commit();
    App.bus.emit("community:created", community);
    return ok(community);
  };

  P.updateCommunity = function (id, patch) {
    var c = this.db.communities[id];
    if (!c) return fail("Comunidade não encontrada");
    if (patch.theme) c.theme = Object.assign({}, c.theme, patch.theme);
    if (patch.settings) c.settings = Object.assign({}, c.settings, patch.settings);
    ["name", "description", "icon", "cover", "tags", "slug"].forEach(function (k) {
      if (patch[k] !== undefined) c[k] = patch[k];
    });
    this._commit();
    App.bus.emit("community:updated", c);
    return ok(c);
  };

  P.joinCommunity = function (communityId) {
    var me = this._uid();
    var exists = this.db.memberships.some(function (m) { return m.communityId === communityId && m.userId === me; });
    if (exists) return ok(this._membership(communityId, me));
    var membership = M.Membership({ communityId: communityId, userId: me, role: "member" });
    this.db.memberships.push(membership);
    this._commit();
    App.bus.emit("membership:changed", { communityId: communityId });
    return ok(membership);
  };
  P.leaveCommunity = function (communityId) {
    var me = this._uid();
    var mem = this._membership(communityId, me);
    if (mem && mem.role === "owner") return fail("O dono não pode sair da comunidade");
    this.db.memberships = this.db.memberships.filter(function (m) { return !(m.communityId === communityId && m.userId === me); });
    this._commit();
    App.bus.emit("membership:changed", { communityId: communityId });
    return ok(true);
  };

  P.deleteCommunity = function (id) {
    var me = this._uid(), c = this.db.communities[id];
    if (!c) return fail("Comunidade não encontrada");
    if (c.ownerId !== me) return fail("Apenas o dono pode excluir a comunidade");
    var chatIds = this._chatsOf(id).map(function (ch) { return ch.id; });
    delete this.db.communities[id];
    this.db.memberships = this.db.memberships.filter(function (m) { return m.communityId !== id; });
    chatIds.forEach(function (cid) { delete this.db.chats[cid]; }, this);
    this.db.messages = this.db.messages.filter(function (m) { return chatIds.indexOf(m.chatId) < 0; });
    this.db.posts = this.db.posts.filter(function (p) { return p.communityId !== id; });
    this.db.moderation = this.db.moderation.filter(function (m) { return m.communityId !== id; });
    this._commit();
    App.bus.emit("community:deleted", { id: id });
    return ok(true);
  };

  /* ============ Perfil de comunidade ============ */
  P._membership = function (communityId, userId) {
    var found = this.db.memberships.filter(function (m) { return m.communityId === communityId && m.userId === userId; })[0] || null;
    if (found) this._activeStatus(found);
    return found;
  };
  P.getMembership = function (communityId, userId) {
    return ok(this._membership(communityId, userId || this._uid()));
  };
  P.updateMembership = function (communityId, userId, patch) {
    // só o próprio dono do perfil OU staff da comunidade pode editar (guard na camada de dados)
    if (userId !== this._uid() && !this._isMod(communityId, this._uid())) return fail("Sem permissão");
    var mem = this._membership(communityId, userId);
    if (!mem) return fail("Perfil de comunidade não encontrado");
    var keys = ["nickname", "avatar", "cover", "covers", "coverFx", "coverFxSpeed", "panel", "panelColor", "textColor", "textColors", "bio", "tags"];
    var backup = {}; keys.forEach(function (k) { if (patch[k] !== undefined) backup[k] = mem[k]; });
    keys.forEach(function (k) { if (patch[k] !== undefined) mem[k] = patch[k]; });
    if (!this._commit()) { Object.assign(mem, backup); return fail(FULL_MSG); }
    App.bus.emit("membership:updated", mem);
    return ok(mem);
  };
  P.listMembers = function (communityId) {
    var db = this.db, self = this;
    var list = db.memberships.filter(function (m) { return m.communityId === communityId; })
      .map(function (m) { self._activeStatus(m); return { membership: m, user: db.users[m.userId] }; })
      .filter(function (x) { return x.user; })
      .sort(function (a, b) {
        var rank = { owner: 0, admin: 1, member: 2 };
        if (rank[a.membership.role] !== rank[b.membership.role]) return rank[a.membership.role] - rank[b.membership.role];
        return b.membership.reputation - a.membership.reputation;
      });
    return ok(list);
  };
  P.adjustReputation = function (communityId, userId, delta) {
    var mem = this._membership(communityId, userId);
    if (!mem) return fail("Perfil não encontrado");
    mem.reputation = Math.max(0, mem.reputation + delta);
    this._commit();
    return ok(mem.reputation);
  };
  /* nível derivado da reputação: cada nível custa LEVEL_STEP de rep */
  P.LEVEL_STEP = 100;
  P.levelInfo = function (reputation) {
    var rep = Math.max(0, reputation || 0), step = this.LEVEL_STEP;
    var level = Math.floor(rep / step) + 1;
    var into = rep % step;
    return { level: level, into: into, need: step, pct: Math.round(into / step * 100), rep: rep };
  };
  /* conquistas (medalhas) calculadas do estado do membro */
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
    var mem = this._membership(communityId, userId || this._uid());
    if (!mem) return ok([]);
    var postCount = this.db.posts.filter(function (p) { return p.communityId === communityId && p.userId === mem.userId; }).length;
    var s = { posts: postCount, rep: mem.reputation || 0, staff: App.Roles.isMod(mem.role) };
    return ok(this.ACHIEVEMENTS.map(function (a) {
      return { key: a.key, icon: a.icon, label: a.label, desc: a.desc, earned: !!a.test(s) };
    }));
  };

  // tags distintas usadas pelos membros desta comunidade, com contagem (desc)
  P.listCommunityTags = function (communityId) {
    var counts = {};
    this.db.memberships.forEach(function (m) {
      if (m.communityId !== communityId) return;
      (m.tags || []).forEach(function (t) { t = String(t).trim(); if (t) counts[t] = (counts[t] || 0) + 1; });
    });
    var list = Object.keys(counts).map(function (t) { return { tag: t, count: counts[t] }; })
      .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
    return ok(list);
  };
  // cargos de staff (escopo da comunidade). 'admin' e 'owner' = autoridade máxima.
  var STAFF_ROLES = ["member", "mod", "curador", "lider", "admin"];
  var MOD_ROLES = ["owner", "admin", "lider", "curador", "mod"];
  P._isMod = function (communityId, userId) {
    var mem = this._membership(communityId, userId || this._uid());
    return !!mem && MOD_ROLES.indexOf(mem.role) >= 0;
  };
  P._isAdmin = function (communityId, userId) {
    var mem = this._membership(communityId, userId || this._uid());
    return !!mem && (mem.role === "owner" || mem.role === "admin");
  };
  P.canModerate = function (communityId, userId) {
    return ok(this._isMod(communityId, userId));
  };
  P.setRole = function (communityId, userId, role) {
    if (!this._isAdmin(communityId, this._uid())) return fail("Sem permissão");
    var mem = this._membership(communityId, userId);
    if (!mem) return fail("Perfil não encontrado");
    if (mem.role === "owner") return fail("Não é possível alterar o dono");
    mem.role = role;
    this._commit();
    App.bus.emit("membership:updated", mem);
    return ok(mem);
  };

  /* atribui um cargo de equipe (não mexe no dono). Só owner/admin podem. */
  P.assignRole = function (communityId, userId, role) {
    if (!this._isAdmin(communityId, this._uid())) return fail("Sem permissão");
    var mem = this._membership(communityId, userId);
    if (!mem) return fail("Perfil não encontrado");
    if (mem.role === "owner") return fail("Não é possível alterar o dono");
    if (STAFF_ROLES.indexOf(role) < 0) return fail("Cargo inválido");
    mem.role = role;
    this._commit();
    App.bus.emit("membership:updated", mem);
    return ok(mem);
  };

  /* ============ Comentários ============ */
  P._comments = function () { if (!this.db.comments) this.db.comments = []; return this.db.comments; };
  // extrai @handles de um texto e resolve para ids de usuário
  P._mentionedIds = function (text) {
    var db = this.db, ids = [], handles = [];
    // @ deve vir no início ou após espaço (evita capturar e-mails como user@dominio)
    var re = /(^|\s)@([a-zA-Z0-9_.]+)/g, m;
    while ((m = re.exec(text || "")) !== null) { handles.push(m[2].toLowerCase().replace(/\.+$/, "")); }
    if (!handles.length) return ids;
    Object.keys(db.users).forEach(function (id) {
      var h = (db.users[id].handle || "").toLowerCase();
      if (h && handles.indexOf(h) >= 0 && ids.indexOf(id) < 0) ids.push(id);
    });
    return ids;
  };
  P.listComments = function (postId) {
    var a = this._comments().filter(function (c) { return c.postId === postId; })
      .sort(function (x, y) { return x.createdAt - y.createdAt; });
    return ok(a);
  };
  P.addComment = function (postId, text, media, parentId) {
    text = (text || "").trim();
    media = (media || []).slice(0, 5);   // até 5 anexos
    if (!text && !media.length) return fail("Comentário vazio");
    var post = this.db.posts.filter(function (p) { return p.id === postId; })[0];
    if (!post) return fail("Publicação não encontrada");
    var me = this._uid(), u = this.db.users[me];
    var c = M.Comment({ postId: postId, userId: me, name: (u && u.name) || "Você", text: text, media: media, parentId: parentId || null });
    this._comments().push(c);
    post.comments = (post.comments || 0) + 1;
    this._commit();
    // notifica o autor do post (se não for eu)
    var notified = {};
    var nav = "/c/" + post.communityId + "/p/" + post.id;
    if (post.userId !== me) {
      notified[post.userId] = true;
      this.addNotification({ userId: post.userId, cat: "all", type: "generic", icon: "comment",
        title: ((u && u.name) || "Alguém") + " comentou sua publicação", sub: text.slice(0, 60), to: nav });
    }
    // notifica o autor do comentário pai (resposta), se diferente
    if (parentId) {
      var parent = this._comments().filter(function (x) { return x.id === parentId; })[0];
      if (parent && parent.userId !== me && !notified[parent.userId]) {
        notified[parent.userId] = true;
        this.addNotification({ userId: parent.userId, cat: "all", type: "generic", icon: "comment",
          title: ((u && u.name) || "Alguém") + " respondeu seu comentário", sub: text.slice(0, 60), to: nav });
      }
    }
    // menções @handle → notifica cada mencionado
    var self = this;
    this._mentionedIds(text).forEach(function (mid) {
      if (mid === me || notified[mid]) return;
      notified[mid] = true;
      self.addNotification({ userId: mid, cat: "mention", type: "generic", icon: "profile",
        title: ((u && u.name) || "Alguém") + " mencionou você", sub: text.slice(0, 60), to: nav });
    });
    App.bus.emit("comment:new", c);
    return ok({ comment: c, user: u });
  };
  P.toggleLikeComment = function (commentId) {
    var me = this._uid();
    var c = this._comments().filter(function (x) { return x.id === commentId; })[0];
    if (!c) return fail("Comentário não encontrado");
    if (!c.likes) c.likes = [];
    var i = c.likes.indexOf(me);
    if (i >= 0) c.likes.splice(i, 1); else c.likes.push(me);
    this._commit();
    App.bus.emit("comment:updated", c);
    return ok(c.likes.length);
  };
  P.deleteComment = function (commentId) {
    var me = this._uid(), all = this._comments();
    var c = all.filter(function (x) { return x.id === commentId; })[0];
    if (!c) return fail("Comentário não encontrado");
    var post = this._post(c.postId);
    var canMod = post && this._isMod(post.communityId, me);
    if (c.userId !== me && !canMod) return fail("Sem permissão");
    // remove o comentário e respostas diretas a ele
    var removed = all.filter(function (x) { return x.id === commentId || x.parentId === commentId; });
    this.db.comments = all.filter(function (x) { return x.id !== commentId && x.parentId !== commentId; });
    if (post) post.comments = Math.max(0, (post.comments || 0) - removed.length);
    this._commit();
    App.bus.emit("comment:deleted", { id: commentId });
    return ok(true);
  };
  P.editComment = function (commentId, text) {
    var me = this._uid();
    var c = this._comments().filter(function (x) { return x.id === commentId; })[0];
    if (!c) return fail("Comentário não encontrado");
    if (c.userId !== me) return fail("Sem permissão");
    text = (text || "").trim();
    if (!text && !(c.media || []).length) return fail("Comentário vazio");
    c.text = text; c.editedAt = Date.now();
    this._commit();
    App.bus.emit("comment:updated", c);
    return ok(c);
  };

  /* ============ Notificações ============ */
  P._notifs = function () { if (!this.db.notifications) this.db.notifications = []; return this.db.notifications; };
  P.listNotifications = function (userId) {
    var arr = this._notifs().filter(function (n) { return n.userId === userId; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
    return ok(arr);
  };
  P.unreadCount = function (userId) {
    return this._notifs().filter(function (n) { return n.userId === userId && !n.read; }).length;
  };
  P.addNotification = function (data) {
    var n = App.models.Notification(data);
    this._notifs().push(n);
    this._commit();
    App.bus.emit("notif:added", n);
    return ok(n);
  };
  P.markAllRead = function (userId) {
    this._notifs().forEach(function (n) { if (n.userId === userId) n.read = true; });
    this._commit();
    App.bus.emit("notif:read", userId);
    return ok(true);
  };
  // marca UMA notificação como lida (ao clicar)
  P.markNotificationRead = function (notifId) {
    var n = this._notifs().filter(function (x) { return x.id === notifId; })[0];
    if (n && !n.read) { n.read = true; this._commit(); App.bus.emit("notif:read"); }
    return ok(true);
  };
  // marca lidas as notificações cujo destino é este caminho — ao ENTRAR no contexto
  P.markNotificationsReadByPath = function (path) {
    if (!path) return ok(0);
    var me = this._uid(), c = 0;
    this._notifs().forEach(function (n) { if (n.userId === me && !n.read && n.to === path) { n.read = true; c++; } });
    if (c) { this._commit(); App.bus.emit("notif:read"); }
    return ok(c);
  };
  /* responde convite de cargo: aplica o cargo ao destino se aceito */
  P.respondRoleInvite = function (notifId, accept) {
    var n = this._notifs().filter(function (x) { return x.id === notifId; })[0];
    if (!n) return fail("Notificação não encontrada");
    n.read = true;
    n.status = accept ? "accepted" : "rejected";
    var self = this;
    if (accept && n.payload && n.payload.targetUserId) {
      var r = this.assignRole(n.payload.communityId, n.payload.targetUserId, n.payload.role);
      // assignRole já commitou; r pode ser rejeição
      return r.then(function () { self._commit(); App.bus.emit("notif:read"); return n; });
    }
    this._commit();
    App.bus.emit("notif:read");
    return ok(n);
  };

  /* ============ Chats / mensagens ============ */
  P._chatsOf = function (communityId) {
    var db = this.db;
    return Object.keys(db.chats).map(function (k) { return db.chats[k]; })
      .filter(function (c) { return c.communityId === communityId; });
  };
  P._canSeeChat = function (chat, membership) {
    if (chat.visibility === "public") return true;
    if (!membership) return false;
    if (!chat.allowedRoles) return true;
    return chat.allowedRoles.indexOf(membership.role) >= 0;
  };
  P.listChats = function (communityId, opts) {
    opts = opts || {};
    var me = opts.userId || this._uid();
    var mem = this._membership(communityId, me);
    var self = this;
    var list = this._chatsOf(communityId).filter(function (c) {
      if (opts.visibility && c.visibility !== opts.visibility) return false;
      return self._canSeeChat(c, mem);
    }).sort(function (a, b) { return b.lastMessageAt - a.lastMessageAt; });
    return ok(list);
  };
  P.getChat = function (chatId) { return ok(this.db.chats[chatId] || null); };

  /* gestão de chat (dono/staff) */
  P._canManageChat = function (chat) {
    if (!chat) return false;
    var me = this._uid();
    if (chat.ownerId && chat.ownerId === me) return true;
    if (chat.communityId) return this._isMod(chat.communityId, me);
    return chat.requestedBy === me;
  };
  P.setChatReadOnly = function (chatId, value) {
    var chat = this.db.chats[chatId]; if (!chat) return fail("Chat não encontrado");
    if (!this._canManageChat(chat)) return fail("Sem permissão");
    chat.readOnly = !!value; this._commit();
    return ok(chat);
  };
  P.transferChatOwnership = function (chatId, userId) {
    var chat = this.db.chats[chatId]; if (!chat) return fail("Chat não encontrado");
    if (!this._canManageChat(chat)) return fail("Sem permissão");
    chat.ownerId = userId; this._commit();
    App.bus.emit("chat:updated", chat);
    return ok(chat);
  };
  P.deleteChat = function (chatId) {
    var chat = this.db.chats[chatId]; if (!chat) return fail("Chat não encontrado");
    if (!this._canManageChat(chat)) return fail("Sem permissão");
    delete this.db.chats[chatId];
    if (Array.isArray(this.db.messages)) this.db.messages = this.db.messages.filter(function (m) { return m.chatId !== chatId; });
    this._commit();
    App.bus.emit("chat:deleted", { chatId: chatId });
    return ok(true);
  };

  P.createChat = function (communityId, data) {
    if (!this._isMod(communityId, this._uid())) return fail("Sem permissão para criar chats");
    var chat = M.Chat(Object.assign({ communityId: communityId }, data));
    this.db.chats[chat.id] = chat;
    this._commit();
    App.bus.emit("chat:created", chat);
    return ok(chat);
  };

  P._lastMessage = function (chatId) {
    var msgs = this.db.messages.filter(function (m) { return m.chatId === chatId; });
    return msgs.length ? msgs[msgs.length - 1] : null;
  };
  P._unread = function (chatId) {
    var me = this._uid();
    var read = this.db.reads[chatId] || 0;
    return this.db.messages.filter(function (m) {
      return m.chatId === chatId && m.userId !== me && m.createdAt > read;
    }).length;
  };

  P.listMyChats = function () {
    var me = this._uid(), db = this.db, self = this;
    var myComms = db.memberships.filter(function (m) { return m.userId === me; });
    var result = [];
    myComms.forEach(function (mem) {
      var community = db.communities[mem.communityId];
      if (!community) return;
      self._chatsOf(mem.communityId).forEach(function (chat) {
        if (!self._canSeeChat(chat, mem)) return;
        var last = self._lastMessage(chat.id);
        result.push({
          chat: chat,
          community: community,
          lastMessage: last,
          lastUser: last ? db.users[last.userId] : null,
          unread: self._unread(chat.id)
        });
      });
    });
    result.sort(function (a, b) { return (b.lastMessage ? b.lastMessage.createdAt : 0) - (a.lastMessage ? a.lastMessage.createdAt : 0); });
    return ok(result);
  };

  // chats de UMA comunidade, enriquecidos (última msg + autor + não-lidas) p/ o hub "Meus Chats"
  P.listCommunityConversations = function (communityId) {
    var me = this._uid(), self = this, mem = this._membership(communityId, me), db = this.db;
    var list = this._chatsOf(communityId).filter(function (c) { return self._canSeeChat(c, mem); })
      .map(function (chat) {
        var last = self._lastMessage(chat.id);
        return { chat: chat, lastMessage: last, lastUser: last ? db.users[last.userId] : null, unread: self._unread(chat.id) };
      })
      .sort(function (a, b) {
        var ta = a.lastMessage ? a.lastMessage.createdAt : a.chat.lastMessageAt;
        var tb = b.lastMessage ? b.lastMessage.createdAt : b.chat.lastMessageAt;
        return tb - ta;
      });
    return ok(list);
  };

  P.listMessages = function (chatId) {
    var db = this.db, self = this;
    var list = db.messages.filter(function (m) { return m.chatId === chatId; })
      .map(function (m) { return { message: m, user: db.users[m.userId] }; });
    self.markRead(chatId);
    return ok(list);
  };

  var MSG_MAX = 2000;
  // erro com metadados de spam (a UI mostra a "interface de flood" quando .spam)
  function failSpam(msg, until) { var e = new Error(msg); e.spam = true; e.until = until || 0; return Promise.reject(e); }

  /* Detecção de spam/flood por (chat, usuário). Estado em memória (não persiste).
     Regras: cooldown configurável, flood (>5 msgs/8s) e repetição (3x idêntica). */
  P._antiSpam = function (chat, userId, text) {
    var now = Date.now();
    var key = chat.id + "::" + userId;
    if (!this._spam) this._spam = {};
    var st = this._spam[key] || (this._spam[key] = { times: [], last: 0, lastText: "", repeats: 0, lockUntil: 0 });

    // bloqueio temporário ativo (flood já detectado)
    if (st.lockUntil > now) return failSpam("Você enviou mensagens demais. Aguarde um pouco.", st.lockUntil);

    // palavras proibidas (apenas chats públicos de comunidade)
    if (chat.type === "community" && chat.visibility !== "private" && (chat.bannedWords || []).length) {
      var low = text.toLowerCase();
      var hit = chat.bannedWords.filter(Boolean).map(function (w) { return String(w).toLowerCase().trim(); })
        .filter(function (w) { return w && low.indexOf(w) >= 0; })[0];
      if (hit) return fail("Mensagem bloqueada: contém termo não permitido.");
    }

    // cooldown configurável (temporizador entre mensagens)
    var cd = (chat.cooldownSec || 0) * 1000;
    if (cd && st.last && (now - st.last) < cd) {
      var wait = Math.ceil((cd - (now - st.last)) / 1000);
      return failSpam("Aguarde " + wait + "s para enviar outra mensagem.", st.last + cd);
    }

    // repetição idêntica consecutiva
    if (text && text === st.lastText) {
      st.repeats++;
      if (st.repeats >= 3) { st.lockUntil = now + 15000; st.repeats = 0; return failSpam("Mensagem repetida demais. Aguarde 15s.", st.lockUntil); }
    } else { st.repeats = 0; }

    // flood: mais de 5 mensagens em 8s
    st.times = st.times.filter(function (t) { return now - t < 8000; });
    st.times.push(now);
    if (st.times.length > 5) { st.lockUntil = now + 15000; st.times = []; return failSpam("Muitas mensagens seguidas. Aguarde 15s.", st.lockUntil); }

    st.last = now; st.lastText = text;
    return null; // ok
  };

  P.sendMessage = function (chatId, text, media) {
    text = (text || "").trim();
    media = (media || []).slice(0, 5);
    if (!text && !media.length) return fail("Mensagem vazia");
    if (text.length > MSG_MAX) return fail("Mensagem muito longa (máx. " + MSG_MAX + " caracteres)");
    var chat = this.db.chats[chatId];
    if (!chat) return fail("Chat não encontrado");
    var me = this._uid();
    // conversa global (direct/group): autoriza por participante, NÃO por comunidade
    if (chat.type === "direct" || chat.type === "group") {
      if (chat.participants.indexOf(me) < 0) return fail("Você não participa desta conversa");
      if (chat.type === "direct" && !chat.accepted) chat.accepted = true; // responder aceita
    } else {
      var mem = this._membership(chat.communityId, me);
      if (!mem) return fail("Participe da comunidade para conversar");
      var status = this._activeStatus(mem);
      if (status && (status.action === "ban" || status.action === "mute")) {
        return fail(status.action === "ban" ? "Você está banido desta comunidade" : "Você está silenciado nesta comunidade");
      }
    }

    // ---- anti-spam ----
    var antiErr = this._antiSpam(chat, me, text);
    if (antiErr) return antiErr;

    var msg = M.Message({ chatId: chatId, userId: me, text: text, media: media });
    this.db.messages.push(msg);
    chat.lastMessageAt = msg.createdAt;
    this.db.reads[chatId] = msg.createdAt;
    this._commit();
    App.bus.emit("message:new", { chatId: chatId, message: msg });
    // notifica os outros participantes (DM/grupo) — chat de comunidade é aberto, sem destinatário
    if (chat.type === "direct" || chat.type === "group") {
      var senderName = (this.db.users[me] && this.db.users[me].name) || "Nova mensagem";
      var preview = text.slice(0, 80) || (media.length ? "enviou uma imagem" : "enviou uma mensagem");
      var self = this;
      (chat.participants || []).forEach(function (uid) {
        if (uid && uid !== me) self.addNotification({ userId: uid, cat: "all", type: "message", icon: "mail", title: senderName, sub: preview, to: "/chats/" + chatId, payload: { chatId: chatId } });
      });
    }
    return ok({ message: msg, user: this.db.users[me] });
  };

  P.markRead = function (chatId) {
    this.db.reads[chatId] = Date.now();
    this._commit();
    App.bus.emit("chats:read", { chatId: chatId });
    return ok(true);
  };

  /* ============ Conversas privadas GLOBAIS (DM 1:1 + grupos) ============
     Sistema do usuário (conta), separado dos chats de comunidade. */
  P._convos = function () {
    var db = this.db;
    return Object.keys(db.chats).map(function (k) { return db.chats[k]; })
      .filter(function (c) { return c.type === "direct" || c.type === "group"; });
  };
  P._convoInfo = function (chat) {
    var me = this._uid(), db = this.db, self = this;
    var others = chat.participants.filter(function (id) { return id !== me; });
    var title = chat.type === "group"
      ? (chat.title || others.map(function (id) { return (db.users[id] || {}).name || "?"; }).join(", "))
      : ((db.users[others[0]] || {}).name || "Conversa");
    var avatarUser = chat.type === "direct" ? db.users[others[0]] : null;
    var last = self._lastMessage(chat.id);
    return {
      chat: chat, direct: chat.type === "direct", title: title,
      avatarUser: avatarUser, others: others,
      lastMessage: last, lastUser: last ? db.users[last.userId] : null,
      unread: self._unread(chat.id)
    };
  };
  // conversas aceitas onde participo (recentes)
  P.listConversations = function () {
    var me = this._uid(), self = this;
    var list = this._convos().filter(function (c) {
      return c.participants.indexOf(me) >= 0 && (c.accepted || c.requestedBy === me);
    }).map(function (c) { return self._convoInfo(c); })
      .sort(function (a, b) { return (b.lastMessage ? b.lastMessage.createdAt : b.chat.createdAt) - (a.lastMessage ? a.lastMessage.createdAt : a.chat.createdAt); });
    return ok(list);
  };
  // solicitações de conversa: direct pendente iniciada por OUTRA pessoa
  P.listConversationRequests = function () {
    var me = this._uid(), self = this;
    var list = this._convos().filter(function (c) {
      return c.type === "direct" && !c.accepted && c.requestedBy !== me && c.participants.indexOf(me) >= 0;
    }).map(function (c) { return self._convoInfo(c); });
    return ok(list);
  };
  // contatos = quem eu sigo (global)
  P.listContacts = function () {
    var me = this._uid(), db = this.db;
    var u = db.users[me] || {};
    var ids = (u.following || []);
    return ok(ids.map(function (id) { return db.users[id]; }).filter(Boolean));
  };
  // abre (ou cria) DM 1:1 com um usuário
  // procura a DM 1:1 existente SEM criar (null se não houver)
  P._findDirect = function (targetUserId) {
    var me = this._uid();
    return this._convos().filter(function (c) {
      return c.type === "direct" && c.participants.length === 2 &&
        c.participants.indexOf(me) >= 0 && c.participants.indexOf(targetUserId) >= 0;
    })[0] || null;
  };
  P.findDirect = function (targetUserId) { return ok(this._findDirect(targetUserId)); };

  /* ---------------- Presença (demo local: ~2/3 dos membros online) ---------------- */
  P._fakeOnline = function (id) { var h = 0; id = String(id || ""); for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return (h % 3) !== 0; };
  P.joinPresence = function (communityId, onSync) {
    var me = this._uid(), self = this, set = new Set([me]);
    this.db.memberships.forEach(function (m) { if (m.communityId === communityId && (m.userId === me || self._fakeOnline(m.userId))) set.add(m.userId); });
    this._presCid = communityId; this._presCb = onSync;
    if (onSync) onSync(set);
  };
  P.leavePresence = function () { this._presCid = null; this._presCb = null; };
  P.touchLastSeen = function () { return ok(true); };
  P.setHidePresence = function (v) { var u = this.db.users[this._uid()]; if (u) { u.hidePresence = !!v; this._commit(); } return ok(!!v); };
  P.getOrCreateDirect = function (targetUserId) {
    var me = this._uid(), db = this.db;
    if (targetUserId === me) return fail("Não dá para conversar consigo mesmo");
    if (!db.users[targetUserId]) return fail("Usuário não encontrado");
    var existing = this._findDirect(targetUserId);
    if (existing) return ok(existing);
    // se eu já sigo o alvo, conversa aceita direto; senão entra como solicitação
    var following = (db.users[me].following || []).indexOf(targetUserId) >= 0;
    var chat = M.Chat({ type: "direct", communityId: null, participants: [me, targetUserId], requestedBy: me, accepted: following });
    db.chats[chat.id] = chat;
    this._commit();
    App.bus.emit("chat:created", chat);
    return ok(chat);
  };
  /* preferências por conversa (mudo, papel de parede, balão). Local/por chat. */
  P._chatPrefs = function () { if (!this.db.chatPrefs) this.db.chatPrefs = {}; return this.db.chatPrefs; };
  P.getChatPrefs = function (chatId) { // SÍNCRONO (render direto)
    var p = this._chatPrefs()[chatId] || {};
    return { muted: !!p.muted, wallpaper: p.wallpaper || null, bubble: p.bubble || "accent" };
  };
  P.setChatPrefs = function (chatId, patch) {
    var pf = this._chatPrefs();
    pf[chatId] = Object.assign({ muted: false, wallpaper: null, bubble: "accent" }, pf[chatId] || {}, patch || {});
    this._commit();
    App.bus.emit("chat:prefs", { chatId: chatId });
    return ok(pf[chatId]);
  };
  /* papel de parede COMPARTILHADO: vive no objeto do chat (todos os participantes veem igual) */
  P.setChatWallpaper = function (chatId, wp) {
    var c = this.db.chats[chatId];
    if (c) { c.wallpaper = wp || null; this._commit(); }
    App.bus.emit("chat:updated", { chatId: chatId, wallpaper: wp || null });
    return ok(true);
  };
  /* config anti-spam do CHAT (afeta todos; só dono/staff edita). Vive no objeto chat. */
  P.getChatConfig = function (chatId) { // SÍNCRONO
    var c = this.db.chats[chatId] || {};
    return { cooldownSec: c.cooldownSec || 0, bannedWords: (c.bannedWords || []).slice() };
  };
  P.setChatConfig = function (chatId, patch) {
    var c = this.db.chats[chatId];
    if (!c) return fail("Chat não encontrado");
    if (patch.cooldownSec != null) c.cooldownSec = Math.max(0, Math.min(3600, +patch.cooldownSec || 0));
    if (patch.bannedWords != null) {
      // normaliza: minúsculas, sem vazios/duplicados, máx. 100 termos
      var seen = {}, out = [];
      (patch.bannedWords || []).forEach(function (w) {
        w = String(w).toLowerCase().trim();
        if (w && !seen[w] && out.length < 100) { seen[w] = 1; out.push(w); }
      });
      c.bannedWords = out;
    }
    this._commit();
    App.bus.emit("chat:config", { chatId: chatId });
    return ok(this.getChatConfig(chatId));
  };
  P.leaveConversation = function (chatId) {
    var c = this.db.chats[chatId]; if (!c) return fail("Conversa não encontrada");
    var me = this._uid();
    if (c.type === "group") {
      c.participants = (c.participants || []).filter(function (x) { return x !== me; });
      if (c.participants.length <= 1) delete this.db.chats[chatId];
    } else {
      delete this.db.chats[chatId];
    }
    if (this._chatPrefs()[chatId]) delete this._chatPrefs()[chatId];
    this._commit();
    App.bus.emit("chats:read", {});
    return ok(true);
  };
  P.createGroup = function (userIds, title) {
    var me = this._uid(), db = this.db;
    var ids = [me].concat((userIds || []).filter(function (id) { return id !== me && db.users[id]; }));
    if (ids.length < 2) return fail("Selecione ao menos um participante");
    var chat = M.Chat({ type: "group", communityId: null, participants: ids, title: (title || "").trim(), requestedBy: me, accepted: true });
    db.chats[chat.id] = chat;
    this._commit();
    App.bus.emit("chat:created", chat);
    return ok(chat);
  };
  P.acceptConversation = function (chatId) {
    var c = this.db.chats[chatId]; if (!c) return fail("Conversa não encontrada");
    c.accepted = true; this._commit(); App.bus.emit("chat:created", c); return ok(c);
  };
  P.declineConversation = function (chatId) {
    var c = this.db.chats[chatId]; if (!c) return fail("Conversa não encontrada");
    delete this.db.chats[chatId]; this._commit(); App.bus.emit("chats:read", {}); return ok(true);
  };
  P.unreadConversations = function () {
    var me = this._uid(), self = this;
    return this._convos().filter(function (c) {
      return c.participants.indexOf(me) >= 0 && c.accepted;
    }).reduce(function (n, c) { return n + self._unread(c.id); }, 0);
  };

  /* ============ Feed ============ */
  P.listPosts = function (communityId) {
    var db = this.db, self = this;
    var me = this._uid();
    var myBlocked = (db.users[me] && db.users[me].blocked) || [];
    // limpa destaque expirado (não fica pendurado no post)
    var now = Date.now(), dirty = false;
    db.posts.forEach(function (p) {
      if (p.communityId === communityId && p.featuredUntil && p.featuredUntil <= now) { p.featuredUntil = null; dirty = true; }
    });
    if (dirty) this._commit();
    var list = db.posts.filter(function (p) { return p.communityId === communityId; })
      .filter(function (p) { return p.userId === me || myBlocked.indexOf(p.userId) < 0; })
      .filter(function (p) {
        // post ocultado pela moderação: só autor e mod veem
        if (p.hidden) { var mm = self._membership(communityId, me); return p.userId === me || (mm && App.Roles.isMod(mm.role)); }
        return true;
      })
      .filter(function (p) {
        // posts de usuários ocultos não aparecem (exceto p/ moderador)
        var authorMem = self._membership(communityId, p.userId);
        var st = authorMem && authorMem.status;
        if (st && st.action === "hide") {
          var myMem = self._membership(communityId, me);
          var iMod = myMem && (myMem.role === "owner" || myMem.role === "admin");
          return p.userId === me || iMod;
        }
        return true;
      })
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .map(function (p) { return { post: p, user: db.users[p.userId] }; });
    return ok(list);
  };
  /* store de imagens por código curto (p/ marcação [IMG|código] no texto) */
  P.addImage = function (dataURL) {
    if (!dataURL) return fail("Imagem inválida");
    if (!this.db.media) this.db.media = {};
    this.db.mediaSeq = (this.db.mediaSeq || 0) + 1;
    var code = this.db.mediaSeq.toString(36);
    this.db.media[code] = dataURL;
    this._commit();
    return ok(code);
  };
  P.getImage = function (code) { return (this.db.media || {})[code] || null; };

  P.createPost = function (communityId, data) {
    // aceita string (texto) ou objeto { type, title, text, payload }
    if (typeof data === "string") data = { text: data };
    data = data || {};
    var text = (data.text || "").trim();
    if (!text && !data.title) return fail("Post vazio");
    var me = this._uid();
    var mem = this._membership(communityId, me);
    if (!mem) return fail("Participe da comunidade para publicar");
    var status = this._activeStatus(mem);
    if (status && status.action === "ban") return fail("Você está banido desta comunidade");
    var post = M.Post(Object.assign({ communityId: communityId, userId: me }, data, { text: text }));
    this.db.posts.push(post);
    this._commit();
    App.bus.emit("post:new", post);
    return ok({ post: post, user: this.db.users[me] });
  };
  P.setFeatured = function (postId, until) {
    var post = this.db.posts.filter(function (p) { return p.id === postId; })[0];
    if (!post) return fail("Publicação não encontrada");
    if (!this._isMod(post.communityId, this._uid())) return fail("Sem permissão");
    post.featuredUntil = until || null;
    this._commit();
    App.bus.emit("post:updated", post);
    return ok(post);
  };
  P.setPostHidden = function (postId, hidden) {
    var post = this.db.posts.filter(function (p) { return p.id === postId; })[0];
    if (!post) return fail("Publicação não encontrada");
    if (!this._isMod(post.communityId, this._uid())) return fail("Sem permissão");
    post.hidden = !!hidden;
    this._commit();
    App.bus.emit("post:updated", post);
    return ok(post);
  };
  P.deletePost = function (postId) {
    var me = this._uid();
    var post = this.db.posts.filter(function (p) { return p.id === postId; })[0];
    if (!post) return fail("Publicação não encontrada");
    if (post.userId !== me && !this._isMod(post.communityId, me)) return fail("Sem permissão");
    this.db.posts = this.db.posts.filter(function (p) { return p.id !== postId; });
    if (this.db.comments) this.db.comments = this.db.comments.filter(function (c) { return c.postId !== postId; });
    this._commit();
    App.bus.emit("post:deleted", { id: postId });
    return ok(true);
  };
  P.toggleLikePost = function (postId) {
    var me = this._uid();
    var post = this.db.posts.filter(function (p) { return p.id === postId; })[0];
    if (!post) return fail("Post não encontrado");
    var i = post.likes.indexOf(me);
    if (i >= 0) post.likes.splice(i, 1);
    else {
      post.likes.push(me);
      if (post.userId !== me) {
        var liker = this.db.users[me] || {};
        this.addNotification({
          userId: post.userId, cat: "all", type: "generic", icon: "heart",
          title: (liker.name || "Alguém") + " curtiu sua publicação",
          sub: (post.title || post.text || "").slice(0, 60),
          to: "/c/" + post.communityId + "/p/" + post.id
        });
      }
    }
    this._commit();
    return ok(post.likes.length);
  };
  P._post = function (postId) {
    return this.db.posts.filter(function (p) { return p.id === postId; })[0] || null;
  };
  // contagem base vinda do seed (option.votes) + votos reais rastreados
  P._pollBase = function (post) {
    return (post.payload.options || []).map(function (o) {
      return o && typeof o.votes === "number" ? o.votes : 0;
    });
  };
  P._pollCounts = function (post) {
    var counts = this._pollBase(post);
    var votes = post.payload.votes || {};
    Object.keys(votes).forEach(function (uid) {
      var ix = votes[uid];
      if (Number.isInteger(ix) && ix >= 0 && ix < counts.length) counts[ix]++;
    });
    return counts;
  };
  /* voto em enquete — persiste. 1 voto por usuário; clicar de novo remove. */
  P.votePoll = function (postId, optionIndex) {
    var me = this._uid(), post = this._post(postId);
    if (!post || post.type !== "poll") return fail("Enquete não encontrada");
    if (post.payload && post.payload.endsAt && Date.now() >= post.payload.endsAt) return fail("Enquete encerrada");
    var opts = post.payload.options || [];
    if (optionIndex < 0 || optionIndex >= opts.length) return fail("Opção inválida");
    if (!post.payload.votes) post.payload.votes = {}; // userId -> índice
    var prev = post.payload.votes[me];
    if (prev === optionIndex) delete post.payload.votes[me]; // desfaz voto
    else post.payload.votes[me] = optionIndex;
    var counts = this._pollCounts(post);
    this._commit();
    App.bus.emit("post:updated", post);
    return ok({ counts: counts, total: counts.reduce(function (a, b) { return a + b; }, 0), myVote: post.payload.votes[me] != null ? post.payload.votes[me] : null });
  };
  P.pollState = function (postId) {
    var me = this._uid(), post = this._post(postId);
    if (!post) return null;
    var counts = this._pollCounts(post);
    var votes = post.payload.votes || {};
    return { counts: counts, total: counts.reduce(function (a, b) { return a + b; }, 0), myVote: votes[me] != null ? votes[me] : null };
  };
  /* registrar jogada de quiz: incrementa jogadas e guarda melhor resultado */
  P.recordQuizPlay = function (postId, score) {
    var post = this._post(postId);
    if (!post || post.type !== "quiz") return fail("Quiz não encontrado");
    var pl = post.payload || (post.payload = {});
    pl.plays = (pl.plays || 0) + 1;
    pl.best = Math.max(pl.best || 0, score || 0);
    this._commit();
    App.bus.emit("post:updated", post);
    return ok({ plays: pl.plays, best: pl.best });
  };
  /* fixar/desfixar post no topo (staff da comunidade) */
  P.setPinned = function (postId, pinned) {
    var post = this._post(postId);
    if (!post) return fail("Publicação não encontrada");
    if (!this._isMod(post.communityId, this._uid())) return fail("Sem permissão");
    if (pinned && !post.pinned) {
      var cnt = this.db.posts.filter(function (x) { return x.communityId === post.communityId && x.pinned; }).length;
      if (cnt >= 3) return fail("Máximo de 3 publicações fixadas");
    }
    post.pinned = !!pinned;
    this._commit();
    App.bus.emit("post:updated", post);
    return ok(post);
  };
  P.togglePin = function (postId) {
    var post = this._post(postId);
    if (!post) return fail("Publicação não encontrada");
    return this.setPinned(postId, !post.pinned);
  };
  /* editar post (autor ou staff) */
  P.editPost = function (postId, patch) {
    var me = this._uid(), post = this._post(postId);
    if (!post) return fail("Publicação não encontrada");
    if (post.userId !== me && !this._isMod(post.communityId, me)) return fail("Sem permissão");
    patch = patch || {};
    ["title", "text", "payload"].forEach(function (k) {
      if (patch[k] !== undefined) post[k] = patch[k];
    });
    post.editedAt = Date.now();
    this._commit();
    App.bus.emit("post:updated", post);
    return ok(post);
  };

  /* reações com emoji — 1 por usuário; mesma emoji remove, outra troca */
  P.REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👏"];
  P.reactPost = function (postId, emoji) {
    var me = this._uid(), post = this._post(postId);
    if (!post) return fail("Post não encontrado");
    if (!post.reactions) post.reactions = {};
    var r = post.reactions, mine = null;
    Object.keys(r).forEach(function (e) {
      if (!Array.isArray(r[e])) { delete r[e]; return; } // sanitiza dado corrompido
      var i = r[e].indexOf(me);
      if (i >= 0) { mine = e; r[e].splice(i, 1); if (!r[e].length) delete r[e]; }
    });
    if (mine !== emoji) { (r[emoji] = r[emoji] || []).push(me); } // adiciona nova reação
    this._commit();
    App.bus.emit("post:updated", post);
    return ok(this.reactionState(postId));
  };
  P.reactionState = function (postId) {
    var me = this._uid(), post = this._post(postId);
    if (!post) return { counts: {}, mine: null };
    var r = post.reactions || {}, counts = {}, mine = null;
    Object.keys(r).forEach(function (e) { if (!Array.isArray(r[e])) return; counts[e] = r[e].length; if (r[e].indexOf(me) >= 0) mine = e; });
    return { counts: counts, mine: mine };
  };

  /* ============ Moderação ============ */
  P.moderate = function (communityId, targetUserId, opts) {
    opts = opts || {};
    var me = this._uid();
    var myMem = this._membership(communityId, me);
    if (!myMem || (myMem.role !== "owner" && myMem.role !== "admin")) return fail("Sem permissão");
    var target = this._membership(communityId, targetUserId);
    if (!target) return fail("Membro não encontrado");
    if (target.role === "owner") return fail("Não é possível moderar o dono");
    var expiresAt = opts.durationMs ? Date.now() + opts.durationMs : null;
    target.status = { action: opts.action, expiresAt: expiresAt, reason: opts.reason || "", byUserId: me, createdAt: Date.now() };
    this.db.moderation.push(M.Moderation({
      communityId: communityId, targetUserId: targetUserId, byUserId: me,
      action: opts.action, reason: opts.reason || "", expiresAt: expiresAt
    }));
    var L = {
      hide: ["Seu perfil foi ocultado", "A moderação ocultou seu perfil nesta comunidade."],
      mute: ["Você foi silenciado", "A moderação silenciou você nesta comunidade."],
      ban: ["Você foi banido", "A moderação removeu seu acesso a esta comunidade."]
    };
    var L2 = L[opts.action];
    if (L2) {
      this._notifs().push(M.Notification({
        userId: targetUserId, cat: "system", type: "moderation", icon: opts.action,
        title: L2[0], sub: L2[1] + (opts.reason ? " Motivo: " + opts.reason : ""),
        to: "/c/" + communityId + "/u/" + targetUserId, payload: { communityId: communityId, action: opts.action }
      }));
    }
    this._commit();
    App.bus.emit("moderation:changed", { communityId: communityId, targetUserId: targetUserId });
    return ok(target.status);
  };
  P.liftModeration = function (communityId, targetUserId) {
    var me = this._uid();
    var myMem = this._membership(communityId, me);
    if (!myMem || (myMem.role !== "owner" && myMem.role !== "admin")) return fail("Sem permissão");
    var target = this._membership(communityId, targetUserId);
    if (target) { target.status = null; this._commit(); }
    App.bus.emit("moderation:changed", { communityId: communityId, targetUserId: targetUserId });
    return ok(true);
  };
  P.listModeration = function (communityId) {
    var db = this.db, self = this;
    var list = db.memberships
      .filter(function (m) { return m.communityId === communityId; })
      .map(function (m) { self._activeStatus(m); return m; })
      .filter(function (m) { return m.status; })
      .map(function (m) { return { membership: m, user: db.users[m.userId], status: m.status }; });
    return ok(list);
  };

  /* ============ Utilidades ============ */
  P.resetData = function () {
    this.db = App.seed.build();
    this.db.reads = {};
    this._commit();
    App.bus.emit("data:reset", {});
    return ok(true);
  };

  /* ---------- Backup: exportar / importar ---------- */
  P.exportData = function () {
    var payload = {
      app: "sanguao", version: DB_KEY,
      exportedAt: Date.now(),
      db: this.db,
      prefs: (function () { try { return JSON.parse(localStorage.getItem("sanguao.prefs.v1") || "{}"); } catch (e) { return {}; } })()
    };
    return ok(JSON.stringify(payload, null, 2));
  };
  // valida a forma mínima de um backup antes de aplicar
  P._validBackup = function (data) {
    return data && typeof data === "object" && data.db && typeof data.db === "object" &&
      data.db.users && data.db.communities && Array.isArray(data.db.memberships) &&
      Array.isArray(data.db.posts) && data.db.currentUserId;
  };
  P.importData = function (jsonStr) {
    var data;
    try { data = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr; }
    catch (e) { return fail("Arquivo inválido (não é JSON)"); }
    if (!this._validBackup(data)) return fail("Backup inválido ou incompleto");
    this.db = data.db;
    if (!this.db.reads) this.db.reads = {};
    if (!this._commit()) return fail(FULL_MSG);
    // restaura preferências (tema/acento) se vierem no backup
    if (data.prefs && typeof data.prefs === "object") {
      try { localStorage.setItem("sanguao.prefs.v1", JSON.stringify(data.prefs)); } catch (e) {}
    }
    App.bus.emit("data:reset", {});
    return ok(true);
  };

  /* ============================================================
     Economia: moedas, anúncios recompensados, loja, itens
     Regras de crédito ficam AQUI (fronteira "servidor"): a UI nunca
     credita moeda direto — sempre passa por claimAdReward/buyItem.
     ============================================================ */
  var AD_REWARD = 50;        // moedas por anúncio
  var AD_DAILY_LIMIT = 5;    // máx. anúncios/dia
  var AD_COOLDOWN_MS = 60000; // tempo mínimo entre anúncios (anti-spam)
  // categorias com só 1 equipado por vez
  var EQUIP_SLOTS = { frame: 1, theme: 1, bubble: 1, profileHighlight: 1 };

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  // garante os campos de economia mesmo em DBs antigos (defensivo)
  P._econ = function () {
    var db = this.db;
    if (!db.wallet) db.wallet = { balance: 0 };
    if (!db.storeItems) db.storeItems = (App.seed.build().storeItems || []);
    if (!db.userItems) db.userItems = [];
    if (!db.equipped) db.equipped = {};
    if (!db.coinTx) db.coinTx = [];
    if (!db.adLog) db.adLog = { date: null, count: 0, lastAt: 0 };
    return db;
  };

  P._pushTx = function (amount, kind, ref, note) {
    var db = this._econ();
    db.wallet.balance = Math.max(0, db.wallet.balance + amount);
    var tx = M.CoinTransaction({ userId: this._uid(), amount: amount, kind: kind, ref: ref, note: note, balanceAfter: db.wallet.balance });
    db.coinTx.unshift(tx);
    if (db.coinTx.length > 200) db.coinTx.length = 200; // não crescer infinito
    return tx;
  };

  P.getWallet = function () { return ok({ balance: this._econ().wallet.balance }); };
  P.getBalance = function () { return this._econ().wallet.balance; }; // SÍNCRONO (chips)
  P.listCoinTransactions = function () { return ok(this._econ().coinTx.slice()); };
  P.listStoreItems = function () { return ok(this._econ().storeItems.slice()); };
  P.getStoreItem = function (id) { return this._econ().storeItems.filter(function (i) { return i.id === id; })[0] || null; };
  P.listMyItems = function () {
    var db = this._econ(), me = this._uid(), self = this;
    return ok(db.userItems.filter(function (u) { return u.userId === me; }).map(function (u) {
      return { userItem: u, item: self.getStoreItem(u.itemId) };
    }).filter(function (x) { return x.item; }));
  };
  P.ownsItem = function (itemId) { // SÍNCRONO
    var me = this._uid();
    return this._econ().userItems.some(function (u) { return u.userId === me && u.itemId === itemId; });
  };
  P.getEquipped = function (category) { return this._econ().equipped[category] || null; }; // SÍNCRONO

  P.equipItem = function (itemId) {
    var item = this.getStoreItem(itemId);
    if (!item) return fail("Item não encontrado");
    if (!this.ownsItem(itemId)) return fail("Você não possui este item");
    var db = this._econ();
    if (EQUIP_SLOTS[item.category]) {
      // toggle: clicar no já equipado desequipa
      if (db.equipped[item.category] === itemId) delete db.equipped[item.category];
      else db.equipped[item.category] = itemId;
    }
    this._commit();
    App.bus.emit("econ:equip", { category: item.category, itemId: db.equipped[item.category] || null });
    return ok({ equipped: db.equipped });
  };

  P.buyItem = function (itemId) {
    var item = this.getStoreItem(itemId);
    if (!item) return fail("Item não encontrado");
    if (this.ownsItem(itemId)) return fail("Você já possui este item");
    var db = this._econ();
    if (db.wallet.balance < item.price) return fail("Moedas insuficientes");
    this._pushTx(-item.price, "purchase", itemId, "Compra: " + item.name);
    db.userItems.push(M.UserItem({ userId: this._uid(), itemId: itemId }));
    // equipa automaticamente o que é equipável (feedback imediato)
    if (EQUIP_SLOTS[item.category]) db.equipped[item.category] = itemId;
    this._commit();
    App.bus.emit("econ:change", { balance: db.wallet.balance });
    App.bus.emit("econ:equip", { category: item.category, itemId: db.equipped[item.category] || null });
    return ok({ balance: db.wallet.balance, item: item });
  };

  // estado dos anúncios HOJE (limite + cooldown)
  P.adStatus = function () { // SÍNCRONO
    var db = this._econ(), log = db.adLog, now = Date.now();
    if (log.date !== todayKey()) return { remaining: AD_DAILY_LIMIT, limit: AD_DAILY_LIMIT, cooldownLeft: 0, reward: AD_REWARD };
    var cd = Math.max(0, AD_COOLDOWN_MS - (now - log.lastAt));
    return { remaining: Math.max(0, AD_DAILY_LIMIT - log.count), limit: AD_DAILY_LIMIT, cooldownLeft: cd, reward: AD_REWARD };
  };

  // CRÉDITO do anúncio — só aqui (simula "rede confirma → servidor credita").
  // completed=false (usuário fechou antes) NÃO credita.
  P.claimAdReward = function (completed) {
    if (!completed) return fail("Anúncio não concluído — sem recompensa");
    var db = this._econ(), log = db.adLog, now = Date.now();
    if (log.date !== todayKey()) { log.date = todayKey(); log.count = 0; log.lastAt = 0; }
    if (log.count >= AD_DAILY_LIMIT) return fail("Limite diário de anúncios atingido. Volte amanhã.");
    if (now - log.lastAt < AD_COOLDOWN_MS) {
      var wait = Math.ceil((AD_COOLDOWN_MS - (now - log.lastAt)) / 1000);
      return fail("Aguarde " + wait + "s antes do próximo anúncio.");
    }
    log.count++; log.lastAt = now;
    this._pushTx(AD_REWARD, "ad", "ad_" + now, "Recompensa de anúncio");
    this._commit();
    App.bus.emit("econ:change", { balance: db.wallet.balance });
    return ok({ balance: db.wallet.balance, reward: AD_REWARD, remaining: Math.max(0, AD_DAILY_LIMIT - log.count) });
  };

  App.LocalRepository = LocalRepository;
})(window.App = window.App || {});
