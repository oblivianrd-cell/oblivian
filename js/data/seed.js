/* ============================================================
   data/seed.js — Conjunto inicial de dados (demonstração).
   UMA comunidade, conta global + perfis de comunidade + chats
   (público/privado) + posts de todos os tipos.
   Namespace: App.seed.build()
   ============================================================ */
(function (App) {
  "use strict";
  var M = App.models;
  var MIN = 60000, HR = 3600000, DAY = 86400000;

  function build() {
    var now = Date.now();
    var users = {}, communities = {}, chats = {};
    var memberships = [], messages = [], posts = [], moderation = [];

    function addUser(u) { users[u.id] = u; return u; }
    function addComm(c) { communities[c.id] = c; return c; }
    function addChat(c) { chats[c.id] = c; return c; }

    /* ---- Usuários (1 principal + NPCs p/ dar vida) ---- */
    var me = addUser(M.User({ id: "user_me", handle: "kazuki", name: "Kazuki", bio: "Conta principal no Oblivian." }));
    var theo = addUser(M.User({ id: "user_theo", handle: "theo", name: "Theo Lima", bio: "Fundador da comunidade." }));
    var ayla = addUser(M.User({ id: "user_ayla", handle: "ayla", name: "Ayla Moreira", bio: "Moderadora." }));
    var bia = addUser(M.User({ id: "user_bia", handle: "bia", name: "Bia Souza", bio: "Curadora." }));
    var nina = addUser(M.User({ id: "user_nina", handle: "nina", name: "Nina Castro", bio: "Ilustradora." }));
    var rafa = addUser(M.User({ id: "user_rafa", handle: "rafa", name: "Rafael Dias", bio: "Dev e gamer." }));

    me.following = [ayla.id, bia.id];
    me.followers = [ayla.id, nina.id, theo.id];
    ayla.followers = [me.id]; bia.followers = [me.id];

    /* ---- Comunidade única ---- */
    var com = addComm(M.Community({
      id: "comm_anime", name: "Comunidade Oblivian",
      description: "O ponto de encontro da rede. Publique, converse nos chats e participe das discussões.\n\n" +
        "O que rola por aqui:\n" +
        "• Publicações de todos os tipos (texto, blog, imagem, enquete, quiz, link, pergunta, wiki)\n" +
        "• Chats públicos e privados\n" +
        "• Destaques semanais escolhidos pela equipe\n\n" +
        "Regras simples: respeito sempre e nada de spam. Puxe uma cadeira e participe.",
      ownerId: theo.id, tags: ["Comunidade", "Geral", "Conversa"], theme: { accent: "#7c59ec" },
      memberCount: 6
    }));

    /* ---- Perfis de comunidade (memberships) ---- */
    function mem(d) { var m = M.Membership(d); memberships.push(m); return m; }
    mem({ communityId: com.id, userId: theo.id, role: "owner", reputation: 980, titles: ["Fundador"], tags: ["Veterano"], bio: "Fundei a comunidade. Pode perguntar." });
    mem({ communityId: com.id, userId: me.id, role: "admin", reputation: 420, titles: ["Equipe"], tags: ["Editor"], bio: "Meu perfil aqui. Admin da comunidade." });
    mem({ communityId: com.id, userId: ayla.id, role: "admin", reputation: 540, titles: ["Moderadora"], tags: ["Design"], bio: "Modero o chat. Sejam gentis." });
    mem({ communityId: com.id, userId: bia.id, role: "member", reputation: 230, tags: ["Música"], bio: "Curadoria e playlists." });
    mem({ communityId: com.id, userId: nina.id, role: "member", reputation: 90, tags: ["Arte"], bio: "" });
    mem({ communityId: com.id, userId: rafa.id, role: "member", reputation: 150, tags: ["Games"], bio: "" });

    /* ---- Chats (público + privado) ---- */
    var geral = addChat(M.Chat({ communityId: com.id, name: "geral", visibility: "public", createdAt: now - 9 * DAY }));
    var offtopic = addChat(M.Chat({ communityId: com.id, name: "off-topic", visibility: "public", createdAt: now - 8 * DAY }));
    var staff = addChat(M.Chat({ communityId: com.id, name: "staff", visibility: "private", allowedRoles: ["owner", "admin"], createdAt: now - 7 * DAY }));

    /* ---- Mensagens ---- */
    function msg(chat, userId, text, ago) {
      var m = M.Message({ chatId: chat.id, userId: userId, text: text, createdAt: now - ago });
      messages.push(m);
      if (m.createdAt > chat.lastMessageAt) chat.lastMessageAt = m.createdAt;
      return m;
    }
    msg(geral, theo.id, "Bem-vindos à comunidade! Se apresentem aqui.", 50 * MIN);
    msg(geral, ayla.id, "Qualquer dúvida, chama a equipe.", 44 * MIN);
    msg(geral, me.id, "Salve! Já comecei a postar por aqui.", 40 * MIN);
    msg(offtopic, nina.id, "Bom dia, gente. Café da manhã rendendo arte hoje.", 3 * HR);
    msg(offtopic, bia.id, "Playlist nova no ar pra acompanhar.", 2 * HR);
    msg(staff, theo.id, "Precisamos revisar as regras do canal.", 2 * HR);
    msg(staff, me.id, "Concordo, faço um rascunho hoje.", 110 * MIN);

    /* ---- Posts (todos os tipos) ---- */
    function post(userId, opts, ago, likes) {
      if (typeof opts === "string") opts = { text: opts };
      var p = M.Post(Object.assign({ communityId: com.id, userId: userId, createdAt: now - ago, likes: likes || [], comments: (likes || []).length }, opts));
      posts.push(p);
      return p;
    }

    // texto
    post(theo.id, { type: "text", text: "Lista das melhores aberturas da década — quem concorda?" }, 6 * HR, [me.id, ayla.id]);
    post(me.id, { type: "text", text: "Voltei a estudar com lo-fi de fundo. Rende muito mais." }, 30 * MIN, [bia.id]);
    // blog
    post(bia.id, { type: "blog", title: "Como estruturar um track do zero",
      text: "Fluxo completo: BPM, pads, baixo pulsante, arranjo em 8 partes e mix leve. No fim, um checklist pra não esquecer nada.",
      payload: { readMinutes: 6, cover: true } }, 12 * HR, [me.id, ayla.id]);
    post(me.id, { type: "blog", title: "Minha rotina de produção lo-fi",
      text: "Do esboço à master: sample, batida, textura e o toque final de ruído de fita.",
      payload: { readMinutes: 5, cover: true } }, 2 * HR, [bia.id, nina.id]);
    // imagem
    post(nina.id, { type: "image", title: "Estudo de paisagem urbana",
      text: "Estudo rápido de 2h, foco em luz e perspectiva.",
      payload: { images: 3, gallery: [img("paisagem-1", 1200, 1200), img("paisagem-2", 800, 800), img("paisagem-3", 800, 800)] } }, 5 * HR, [ayla.id, me.id]);
    post(me.id, { type: "image", title: "Meu setup", text: "Finalmente organizei a mesa.",
      payload: { images: 1, gallery: [img("setup-1", 1280, 720)] } }, 3 * HR, [bia.id]);
    // enquete
    post(rafa.id, { type: "poll", title: "Qual conteúdo vocês querem ver mais?",
      payload: { endsAt: now + 2 * DAY, options: [
        { label: "Tutoriais", votes: 42 }, { label: "Discussões", votes: 18 },
        { label: "Desafios", votes: 7 }, { label: "Lives", votes: 3 }
      ] } }, 7 * HR, [me.id, theo.id, bia.id]);
    // quiz
    post(theo.id, { type: "quiz", title: "Quiz: você conhece a comunidade?",
      payload: { plays: 134, best: 4, questions: [
        { q: "Onde rolam as conversas em tempo real?", options: ["Nos chats", "Nas enquetes", "Nos blogs"], correct: 0, bg: "https://picsum.photos/seed/quiz-chat/1280/720" },
        { q: "O que aparece em Destaques?", options: ["Posts aleatórios", "Conteúdos escolhidos pela equipe", "Só anúncios"], correct: 1, bg: "https://picsum.photos/seed/quiz-star/1280/720" },
        { q: "Qual regra vale sempre?", options: ["Pode spam", "Respeito com todos", "Só postar de madrugada"], correct: 1, bg: "https://picsum.photos/seed/quiz-rule/1280/720" },
        { q: "Quem pode publicar?", options: ["Só a equipe", "Ninguém", "Todos os membros"], correct: 2, bg: "https://picsum.photos/seed/quiz-people/1280/720" },
        { q: "Como salvar um post pra ver depois?", options: ["Tocando em salvar", "Tirando print", "Não dá"], correct: 0, bg: "https://picsum.photos/seed/quiz-save/1280/720" }
      ] } }, 4 * HR, [me.id, ayla.id, nina.id]);
    // link
    post(ayla.id, { type: "link", title: "Guia de boas-vindas",
      text: "Tudo que você precisa pra começar.",
      payload: { url: "Oblivian.app/guia", domain: "Oblivian.app" } }, 8 * HR, [me.id, bia.id]);
    // pergunta + resposta
    post(me.id, { type: "question", title: "Recomendações de algo recente e bom?",
      text: "Quero algo com narrativa forte.", payload: { answers: 2, solved: true } }, 2 * HR, [theo.id]);
    post(theo.id, { type: "answer", title: "Resposta: recomendações",
      text: "Vai de cabeça em algo com narrativa não-linear e protagonista pouco confiável. Marca como melhor resposta se curtir!",
      payload: { questionTitle: "Recomendações de algo recente e bom?", accepted: true } }, 100 * MIN, [me.id, nina.id]);

    // wiki (com galeria)
    post(ayla.id, { type: "wiki", title: "Linha do tempo da comunidade",
      text: "Marcos e momentos importantes, mantido pela equipe.",
      payload: { sections: 8, contributors: 3, updated: "ontem" } }, 40 * HR, [theo.id, me.id]);
    post(me.id, { type: "wiki", title: "Guia rápido de boas práticas",
      text: "Como postar, comentar e participar dos chats sem stress.",
      payload: { sections: 5, contributors: 1, updated: "hoje" } }, 10 * HR, [bia.id, nina.id]);

    // destaque inicial: marca o primeiro post como destaque por 7 dias
    if (posts[0]) posts[0].featuredUntil = now + 7 * DAY;

    /* ---- Notificações de exemplo ---- */
    var notifications = [
      M.Notification({ userId: me.id, cat: "mention", type: "generic", icon: "comment", title: "Theo respondeu você", sub: "\"Boa pergunta!\"", to: "/c/" + com.id + "/latest", createdAt: now - 5 * MIN }),
      M.Notification({ userId: me.id, cat: "all", type: "generic", icon: "heart", title: "Bia curtiu seu post", sub: "Meu setup", to: "/c/" + com.id + "/latest", createdAt: now - 12 * MIN }),
      M.Notification({ userId: me.id, cat: "system", type: "generic", icon: "star", title: "Você ganhou +20 de reputação", sub: "Boa! Continue ativo", read: true, createdAt: now - HR })
    ];

    /* ---- Imagens (placeholder por seed) em usuários, comunidade e posts ----
       Obs.: usa serviço externo (picsum). Depende de internet. */
    function img(seed, w, h) { return "https://picsum.photos/seed/" + encodeURIComponent(seed) + "/" + w + "/" + h; }
    Object.keys(users).forEach(function (id) {
      var u = users[id]; u.avatar = img("av-" + u.handle, 240, 240); u.cover = img("cv-" + u.handle, 1200, 420);
    });
    Object.keys(communities).forEach(function (id) {
      var c = communities[id]; c.icon = img("ic-" + id, 240, 240); c.cover = img("cc-" + id, 1200, 420);
    });
    memberships.forEach(function (m) {
      m.avatar = img("mav-" + m.communityId + "-" + m.userId, 240, 240); m.cover = img("mcv-" + m.communityId + "-" + m.userId, 1200, 420);
    });
    posts.forEach(function (p, i) {
      p.payload = p.payload || {};
      p.payload.image = img("po-" + i + "-" + p.type, 900, 700);
      if (p.type === "wiki") p.payload.gallery = [img("g" + i + "a", 420, 560), img("g" + i + "b", 420, 560), img("g" + i + "c", 420, 560), img("g" + i + "d", 420, 560)];
    });

    /* ---- Loja de itens cosméticos ---- */
    function item(d) { return M.StoreItem(d); }
    var storeItems = [
      // molduras (frame) — cor do anel ao redor do avatar
      item({ id: "frame_aqua", category: "frame", name: "Moldura Aqua", description: "Anel azul-piscina no avatar.", price: 500, rarity: "comum", value: "#22d3ee", icon: "profile" }),
      item({ id: "frame_rose", category: "frame", name: "Moldura Rosé", description: "Anel rosa suave.", price: 500, rarity: "comum", value: "#ec4899", icon: "profile" }),
      item({ id: "frame_gold", category: "frame", name: "Moldura Dourada", description: "Anel dourado raro.", price: 1500, rarity: "raro", value: "#f5c542", icon: "crown" }),
      item({ id: "frame_prism", category: "frame", name: "Moldura Prisma", description: "Anel gradiente épico.", price: 3000, rarity: "especial", value: "linear-gradient(135deg,#7c59ec,#22d3ee,#ec4899)", icon: "star" }),
      // temas de perfil (theme) — acento aplicado ao próprio perfil
      item({ id: "theme_violet", category: "theme", name: "Tema Violeta", description: "Acento violeta no seu perfil.", price: 1000, rarity: "comum", value: "#7c59ec", icon: "palette" }),
      item({ id: "theme_emerald", category: "theme", name: "Tema Esmeralda", description: "Acento verde-esmeralda.", price: 1000, rarity: "comum", value: "#10b981", icon: "palette" }),
      // bolhas de chat (bubble) — cor do balão
      item({ id: "bubble_blue", category: "bubble", name: "Bolha Azul", description: "Balão de chat azul.", price: 700, rarity: "comum", value: "#3b82f6", icon: "chat" }),
      item({ id: "bubble_amber", category: "bubble", name: "Bolha Âmbar", description: "Balão de chat âmbar.", price: 700, rarity: "comum", value: "#f59e0b", icon: "chat" }),
      // destaques
      item({ id: "hl_post", category: "postHighlight", name: "Destaque de Postagem", description: "Brilho nas suas postagens por 7 dias.", price: 300, rarity: "comum", value: "#7c59ec", icon: "featured" }),
      item({ id: "hl_profile", category: "profileHighlight", name: "Destaque de Perfil", description: "Selo de destaque no seu perfil.", price: 800, rarity: "raro", value: "#f5c542", icon: "star" }),
      // especial
      item({ id: "special_founder", category: "special", name: "Selo Fundador", description: "Item especial raríssimo.", price: 5000, rarity: "especial", value: "#f5c542", icon: "shield" })
    ];

    return {
      version: 1,
      currentUserId: me.id,
      users: users,
      communities: communities,
      memberships: memberships,
      chats: chats,
      messages: messages,
      posts: posts,
      moderation: moderation,
      notifications: notifications,
      // economia
      storeItems: storeItems,
      wallet: { balance: 200 },          // saldo inicial de cortesia
      userItems: [],                     // itens possuídos
      equipped: {},                      // { frame, theme, bubble, ... }: itemId
      coinTx: [],                        // histórico de transações
      adLog: { date: null, count: 0, lastAt: 0 } // controle anti-fraude de anúncios
    };
  }

  App.seed = { build: build };
})(window.App = window.App || {});
