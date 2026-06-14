/* ============================================================
   core/i18n.js — Internacionalização (PT / ES / EN).
   Detecta o idioma do usuário (preferência salva > navegador),
   permite troca manual e aplica nas telas. Namespace: App.i18n

   Uso:
     - Estático (landing): elementos com data-i18n="chave" (textContent)
       ou data-i18n-html="chave" (innerHTML). App.i18n.apply() traduz.
     - JS: App.i18n.t("chave").
   Fase 1: landing. (Telas internas = próxima fase.)
   ============================================================ */
(function (App) {
  "use strict";
  var KEY = "oblivian.lang";
  var SUPPORTED = ["pt", "es", "en"];

  var DICT = {
    pt: {
      "nav.features": "Recursos", "nav.how": "Como funciona", "nav.faq": "Perguntas", "nav.enter": "Entrar",
      "hero.title": "Encontre sua gente.<br><span>Crie seu mundo.</span>",
      "hero.sub": "O Oblivian é uma rede social de comunidades. Crie espaços sobre o que você ama, converse em tempo real, publique e personalize tudo do seu jeito, de graça.",
      "hero.cta1": "Download", "hero.cta2": "Entrar",
      "hero.note": "Grátis para Android · Português, Espanhol e Inglês",
      "feat.h": "Tudo num só lugar", "feat.sub": "Comunidades, conversas, publicações e perfis feitos pra você criar e participar sem complicação.",
      "feat.1t": "Comunidades", "feat.1d": "Crie e descubra comunidades sobre qualquer assunto, com páginas, regras e papéis (dono, líder, moderador, curador).",
      "feat.2t": "Chats em tempo real", "feat.2d": "Conversas privadas, grupos e canais públicos da comunidade, com solicitações, contatos e anti-spam.",
      "feat.3t": "Publicações ricas", "feat.3d": "Poste texto, imagens, enquetes, perguntas, links, blogs e wikis. Fixe destaques e organize por feeds.",
      "feat.4t": "Perfis personalizáveis", "feat.4d": "Capa, painel, cores e avatar. Um perfil global e um perfil próprio por comunidade.",
      "feat.5t": "Moedas e loja", "feat.5d": "Ganhe moedas e troque por molduras, temas e destaques cosméticos pra deixar tudo com a sua cara.",
      "feat.6t": "Privado e seguro", "feat.6d": "Login com e-mail ou Google. Você controla o que compartilha e com quem conversa.",
      "steps.h": "Comece em 3 passos", "steps.sub": "Leva menos de um minuto pra entrar e começar a participar.",
      "steps.1t": "Crie sua conta", "steps.1d": "Cadastre-se grátis com e-mail ou Google. Sem cartão, sem complicação.",
      "steps.2t": "Entre em comunidades", "steps.2d": "Descubra espaços que combinam com você, ou crie a sua própria do zero.",
      "steps.3t": "Converse e publique", "steps.3d": "Mande mensagens, faça posts, participe de enquetes e construa sua reputação.",
      "faq.h": "Perguntas frequentes",
      "faq.q1": "O que é o Oblivian?", "faq.a1": "O Oblivian é uma rede social baseada em comunidades. Em vez de um feed único, você participa de espaços (comunidades) sobre temas específicos, cada um com seus chats, publicações, páginas e perfis. É o lugar pra encontrar gente que curte o que você curte.",
      "faq.q2": "É grátis?", "faq.a2": "Sim. Criar conta, entrar em comunidades, conversar e publicar é totalmente gratuito. Há itens cosméticos opcionais comprados com moedas que você ganha usando o app.",
      "faq.q3": "Preciso instalar algum app?", "faq.a3": "Não. O Oblivian funciona direto no navegador, no celular ou no computador. Você também pode adicioná-lo à tela inicial como um aplicativo (PWA).",
      "faq.q4": "Em quais idiomas o Oblivian está disponível?", "faq.a4": "Português, Espanhol e Inglês. O app detecta o seu idioma automaticamente e você pode trocar quando quiser.",
      "faq.q5": "Como crio a minha própria comunidade?", "faq.a5": "Depois de entrar, clique em \"Criar comunidade\", escolha nome, ícone, capa e tema, defina as regras e pronto. Sua comunidade já fica disponível para outras pessoas.",
      "faq.q6": "Meus dados estão seguros?", "faq.a6": "Sim. Usamos autenticação segura (e-mail ou Google) e você controla o que publica e com quem fala.",
      "faq.privacy": "Política de Privacidade",
      "cta.h": "Leve o Oblivian com você", "cta.p": "Baixe o aplicativo oficial para Android e participe de onde estiver.", "cta.btn": "Download", "cta.note": "APK oficial · Android 7.0 ou superior",
      "footer.resources": "Recursos", "footer.legal": "Legal", "footer.support": "Suporte",
      "footer.terms": "Termos de Serviço", "footer.guidelines": "Diretrizes da Comunidade",
      "footer.tm": "Rede social de comunidades. Feito com 💜.",
      "footer.tag": "© 2026 Oblivian · Rede social de comunidades"
    },
    es: {
      "nav.features": "Funciones", "nav.how": "Cómo funciona", "nav.faq": "Preguntas", "nav.enter": "Entrar",
      "hero.title": "Encuentra tu gente.<br><span>Crea tu mundo.</span>",
      "hero.sub": "Oblivian es una red social de comunidades. Crea espacios sobre lo que amas, conversa en tiempo real, publica y personaliza todo a tu manera, gratis.",
      "hero.cta1": "Descargar", "hero.cta2": "Entrar",
      "hero.note": "Gratis para Android · Portugués, Español e Inglés",
      "feat.h": "Todo en un solo lugar", "feat.sub": "Comunidades, conversaciones, publicaciones y perfiles hechos para que crees y participes sin complicaciones.",
      "feat.1t": "Comunidades", "feat.1d": "Crea y descubre comunidades sobre cualquier tema, con páginas, reglas y roles (dueño, líder, moderador, curador).",
      "feat.2t": "Chats en tiempo real", "feat.2d": "Conversaciones privadas, grupos y canales públicos de la comunidad, con solicitudes, contactos y anti-spam.",
      "feat.3t": "Publicaciones ricas", "feat.3d": "Publica texto, imágenes, encuestas, preguntas, enlaces, blogs y wikis. Fija destacados y organiza por feeds.",
      "feat.4t": "Perfiles personalizables", "feat.4d": "Portada, panel, colores y avatar. Un perfil global y un perfil propio por comunidad.",
      "feat.5t": "Monedas y tienda", "feat.5d": "Gana monedas y cámbialas por marcos, temas y destacados cosméticos para darle tu estilo.",
      "feat.6t": "Privado y seguro", "feat.6d": "Inicia sesión con e-mail o Google. Tú controlas lo que compartes y con quién hablas.",
      "steps.h": "Empieza en 3 pasos", "steps.sub": "Toma menos de un minuto entrar y empezar a participar.",
      "steps.1t": "Crea tu cuenta", "steps.1d": "Regístrate gratis con e-mail o Google. Sin tarjeta, sin complicaciones.",
      "steps.2t": "Únete a comunidades", "steps.2d": "Descubre espacios que van contigo, o crea el tuyo desde cero.",
      "steps.3t": "Conversa y publica", "steps.3d": "Envía mensajes, haz publicaciones, participa en encuestas y construye tu reputación.",
      "faq.h": "Preguntas frecuentes",
      "faq.q1": "¿Qué es Oblivian?", "faq.a1": "Oblivian es una red social basada en comunidades. En vez de un feed único, participas en espacios (comunidades) sobre temas específicos, cada uno con sus chats, publicaciones, páginas y perfiles. Es el lugar para encontrar gente con tus mismos gustos.",
      "faq.q2": "¿Es gratis?", "faq.a2": "Sí. Crear cuenta, unirse a comunidades, conversar y publicar es totalmente gratis. Hay artículos cosméticos opcionales que se compran con monedas que ganas usando la app.",
      "faq.q3": "¿Necesito instalar alguna app?", "faq.a3": "No. Oblivian funciona directo en el navegador, en el móvil o en la computadora. También puedes añadirlo a la pantalla de inicio como una app (PWA).",
      "faq.q4": "¿En qué idiomas está disponible Oblivian?", "faq.a4": "Portugués, Español e Inglés. La app detecta tu idioma automáticamente y puedes cambiarlo cuando quieras.",
      "faq.q5": "¿Cómo creo mi propia comunidad?", "faq.a5": "Tras entrar, pulsa \"Crear comunidad\", elige nombre, ícono, portada y tema, define las reglas y listo. Tu comunidad queda disponible para los demás.",
      "faq.q6": "¿Mis datos están seguros?", "faq.a6": "Sí. Usamos autenticación segura (e-mail o Google) y tú controlas lo que publicas y con quién hablas.",
      "faq.privacy": "Política de Privacidad",
      "cta.h": "Lleva Oblivian contigo", "cta.p": "Descarga la aplicación oficial para Android y participa desde donde estés.", "cta.btn": "Descargar", "cta.note": "APK oficial · Android 7.0 o superior",
      "footer.resources": "Recursos", "footer.legal": "Legal", "footer.support": "Soporte",
      "footer.terms": "Términos de Servicio", "footer.guidelines": "Normas de la Comunidad",
      "footer.tm": "Red social de comunidades. Hecho con 💜.",
      "footer.tag": "© 2026 Oblivian · Red social de comunidades"
    },
    en: {
      "nav.features": "Features", "nav.how": "How it works", "nav.faq": "FAQ", "nav.enter": "Sign in",
      "hero.title": "Find your people.<br><span>Build your world.</span>",
      "hero.sub": "Oblivian is a community-based social network. Create spaces about what you love, chat in real time, post and customize everything your way, for free.",
      "hero.cta1": "Download", "hero.cta2": "Sign in",
      "hero.note": "Free for Android · Portuguese, Spanish & English",
      "feat.h": "Everything in one place", "feat.sub": "Communities, conversations, posts and profiles built for you to create and join without hassle.",
      "feat.1t": "Communities", "feat.1d": "Create and discover communities about any topic, with pages, rules and roles (owner, leader, moderator, curator).",
      "feat.2t": "Real-time chats", "feat.2d": "Private chats, groups and public community channels, with requests, contacts and anti-spam.",
      "feat.3t": "Rich posts", "feat.3d": "Post text, images, polls, questions, links, blogs and wikis. Pin highlights and organize by feeds.",
      "feat.4t": "Customizable profiles", "feat.4d": "Cover, panel, colors and avatar. One global profile and a dedicated profile per community.",
      "feat.5t": "Coins and store", "feat.5d": "Earn coins and trade them for frames, themes and cosmetic highlights to make it yours.",
      "feat.6t": "Private and secure", "feat.6d": "Sign in with e-mail or Google. You control what you share and who you talk to.",
      "steps.h": "Get started in 3 steps", "steps.sub": "It takes less than a minute to sign in and start participating.",
      "steps.1t": "Create your account", "steps.1d": "Sign up free with e-mail or Google. No card, no hassle.",
      "steps.2t": "Join communities", "steps.2d": "Discover spaces that match you, or create your own from scratch.",
      "steps.3t": "Chat and post", "steps.3d": "Send messages, make posts, join polls and build your reputation.",
      "faq.h": "Frequently asked questions",
      "faq.q1": "What is Oblivian?", "faq.a1": "Oblivian is a community-based social network. Instead of a single feed, you join spaces (communities) about specific topics, each with its own chats, posts, pages and profiles. It's the place to find people who like what you like.",
      "faq.q2": "Is it free?", "faq.a2": "Yes. Creating an account, joining communities, chatting and posting is completely free. There are optional cosmetic items bought with coins you earn by using the app.",
      "faq.q3": "Do I need to install an app?", "faq.a3": "No. Oblivian runs right in the browser, on mobile or desktop. You can also add it to your home screen as an app (PWA).",
      "faq.q4": "Which languages is Oblivian available in?", "faq.a4": "Portuguese, Spanish and English. The app detects your language automatically and you can switch anytime.",
      "faq.q5": "How do I create my own community?", "faq.a5": "After signing in, tap \"Create community\", choose a name, icon, cover and theme, set the rules and that's it. Your community is available for others.",
      "faq.q6": "Is my data safe?", "faq.a6": "Yes. We use secure authentication (e-mail or Google) and you control what you post and who you talk to.",
      "faq.privacy": "Privacy Policy",
      "cta.h": "Take Oblivian with you", "cta.p": "Download the official Android app and join from anywhere.", "cta.btn": "Download", "cta.note": "Official APK · Android 7.0 or higher",
      "footer.resources": "Resources", "footer.legal": "Legal", "footer.support": "Support",
      "footer.terms": "Terms of Service", "footer.guidelines": "Community Guidelines",
      "footer.tm": "Community social network. Made with 💜.",
      "footer.tag": "© 2026 Oblivian · Community social network"
    }
  };

  function detect() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    var navs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || "pt"];
    for (var i = 0; i < navs.length; i++) {
      var code = String(navs[i] || "").slice(0, 2).toLowerCase();
      if (SUPPORTED.indexOf(code) >= 0) return code;
    }
    return "pt";
  }

  var _lang = detect();

  function t(key) {
    var d = DICT[_lang] || DICT.pt;
    return (key in d) ? d[key] : (DICT.pt[key] != null ? DICT.pt[key] : key);
  }

  function apply(root) {
    root = root || document;
    var i, els = root.querySelectorAll("[data-i18n]");
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute("data-i18n"));
    var html = root.querySelectorAll("[data-i18n-html]");
    for (i = 0; i < html.length; i++) html[i].innerHTML = t(html[i].getAttribute("data-i18n-html"));
    try { document.documentElement.setAttribute("lang", _lang); } catch (e) {}
  }

  function set(lang) {
    if (SUPPORTED.indexOf(lang) < 0) return;
    _lang = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    apply();
    syncSwitchers();
    if (App.bus) App.bus.emit("i18n:change", { lang: lang });
  }

  App.i18n = {
    t: t, apply: apply, set: set,
    lang: function () { return _lang; },
    supported: SUPPORTED.slice(),
    label: { pt: "Português", es: "Español", en: "English" }
  };

  // dropdown de idioma custom (.lp-lang) — botão + menu estilizado
  function syncSwitchers() {
    var dds = document.querySelectorAll(".lp-lang");
    for (var i = 0; i < dds.length; i++) {
      var cur = dds[i].querySelector(".lp-lang__cur");
      if (cur) cur.textContent = _lang.toUpperCase();
      var opts = dds[i].querySelectorAll("[data-lang]");
      for (var j = 0; j < opts.length; j++) opts[j].classList.toggle("is-active", opts[j].getAttribute("data-lang") === _lang);
    }
  }
  function initSwitchers() {
    var dds = document.querySelectorAll(".lp-lang");
    for (var i = 0; i < dds.length; i++) {
      var dd = dds[i];
      if (dd._wired) continue;
      var btn = dd.querySelector(".lp-lang__btn");
      var menu = dd.querySelector(".lp-lang__menu");
      if (!btn || !menu) continue;
      dd._wired = true;
      (function (dd, btn, menu) {
        function close() { menu.hidden = true; dd.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var willOpen = menu.hidden;
          menu.hidden = !willOpen; dd.classList.toggle("is-open", willOpen); btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        });
        menu.addEventListener("click", function (e) {
          var b = e.target.closest ? e.target.closest("[data-lang]") : null;
          if (!b) return;
          set(b.getAttribute("data-lang")); close();
        });
        document.addEventListener("click", function (e) { if (!dd.contains(e.target)) close(); });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
      })(dd, btn, menu);
    }
    syncSwitchers();
  }
  function boot() { apply(); initSwitchers(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.App = window.App || {});
