/* ============================================================
   screens/login.js — Tela de autenticação (entrar / criar conta).
   Backend-agnóstica: usa App.repo.signIn/signUp quando existem
   (SupabaseRepository). Sem backend (LocalRepository) → modo demo:
   entra direto na conta local. Namespace: App.screens.login + App.auth
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.screens = App.screens || {};

  /* ---------- captcha anti-bot (Turnstile/hCaptcha) — gated em config.captcha.siteKey.
     SEM siteKey: tudo no-op (comportamento atual 100% preservado). Só a site key
     PÚBLICA vive no front; o SECRET fica no painel do Supabase (Auth → Bot Protection). */
  App.captcha = (function () {
    var cfg = (App.config && App.config.captcha) || {};
    var enabled = !!cfg.siteKey;
    var SCRIPT = {
      turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit"
    };
    var loaded = null, widgetId = null;
    function api() { return window.turnstile || window.hcaptcha || null; }
    function load() {
      if (!enabled) return Promise.resolve(false);
      if (loaded) return loaded;
      loaded = new Promise(function (resolve) {
        var s = document.createElement("script");
        s.src = SCRIPT[cfg.provider] || SCRIPT.turnstile; s.async = true; s.defer = true;
        s.onload = function () { resolve(true); };
        s.onerror = function () { resolve(false); };
        document.head.appendChild(s);
      });
      return loaded;
    }
    function render(container) {
      if (!enabled || !container) return;
      load().then(function (ok) {
        if (!ok) return;
        try { var a = api(); if (a && widgetId == null) widgetId = a.render(container, { sitekey: cfg.siteKey }); } catch (e) {}
      });
    }
    function token() { try { var a = api(); return (a && widgetId != null) ? (a.getResponse(widgetId) || null) : null; } catch (e) { return null; } }
    function reset() { try { var a = api(); if (a && widgetId != null) a.reset(widgetId); } catch (e) {} }
    return { enabled: enabled, render: render, token: token, reset: reset };
  })();

  /* ---------- helper de auth (ponte p/ o repositório) ---------- */
  var hasBackend = function () { return !!(App.repo && typeof App.repo.signIn === "function"); };
  function demoEnter() {
    // sem backend: aceita e entra na conta local do seed
    return App.repo.getCurrentUser().then(function (u) {
      if (!u) throw new Error("Nenhuma conta local disponível");
      return u;
    });
  }
  App.auth = {
    enabled: hasBackend,
    signIn: function (email, pw, cap) {
      return hasBackend() ? App.repo.signIn(email, pw, cap) : demoEnter();
    },
    // cadastro: resolve { user, session }. session null = "Confirm email" ligado no
    // Supabase → a UI pede o código de 6 dígitos. No demo, devolve sessão fake (entra direto).
    signUp: function (email, pw, cap) {
      return hasBackend() ? App.repo.signUp(email, pw, cap) : demoEnter().then(function (u) { return { user: u, session: {} }; });
    },
    verifyEmailCode: function (email, code) {
      if (!hasBackend() || typeof App.repo.verifyEmailCode !== "function") return demoEnter();
      return App.repo.verifyEmailCode(email, code);
    },
    resendEmailCode: function (email, cap) {
      if (!hasBackend() || typeof App.repo.resendEmailCode !== "function") return Promise.resolve(true);
      return App.repo.resendEmailCode(email, cap);
    },
    signOut: function () {
      if (App.repo && typeof App.repo.signOut === "function") {
        return App.repo.signOut().then(function () { location.hash = "#/login"; location.reload(); });
      }
      return Promise.resolve();
    },
    // login social (provider: 'google' | 'discord' | 'github')
    oauth: function (provider) {
      if (App.repo && typeof App.repo.signInWithOAuth === "function") {
        return App.repo.signInWithOAuth(provider).catch(function (e) { ui.toast(friendlyError(e), "danger"); });
      }
      ui.toast("Login social precisa do backend Supabase ligado.", "danger");
      return Promise.resolve();
    },
    // ponto de entrada p/ o "portão" de login (boot sem usuário logado)
    mountGate: function (root) {
      App.util.mount(root, view(function (user, opts) {
        var dest = (opts && opts.dest) || "/explorer";
        location.hash = "#" + dest; location.reload();
      }));
    }
  };

  /* ---------- validação + mensagens ---------- */
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ""); }
  function friendlyError(err) {
    var m = (err && err.message) || String(err || "Erro");
    if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/token has expired or is invalid|otp.*(expired|invalid)|invalid.*otp/i.test(m)) return "Código inválido ou expirado. Peça um novo.";
    if (/for security purposes|only request this after/i.test(m)) return "Aguarde alguns segundos antes de pedir outro código.";
    if (/email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar.";
    if (/user already registered|already registered/i.test(m)) return "Esse e-mail já tem conta. Tente entrar.";
    if (/password should be at least/i.test(m)) return "Senha muito curta (mínimo 8 caracteres).";
    if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Aguarde um pouco.";
    if (/network|fetch|timeout|connection/i.test(m)) return "Falha na conexão. Verifique sua internet.";
    if (/unauthorized|invalid token|jwt/i.test(m)) return "Sessão expirada. Faça login novamente.";
    if (/500|server error|internal/i.test(m)) return "Erro no servidor. Tente novamente em alguns momentos.";
    return "Erro ao autenticar. Tente novamente.";
  }

  /* ---------- modal do código de verificação (cadastro por e-mail) ----------
     Aberto quando o Supabase exige confirmação (session null no signUp). O código
     é validado SERVER-SIDE pelo Supabase: hash, expiração (10 min), uso único,
     limite de tentativas e de reenvio. Aqui só coletamos os 6 dígitos. */
  function openCodeModal(email, onVerified) {
    var codeInput = ui.Input({ type: "text", placeholder: "------" });
    codeInput.setAttribute("inputmode", "numeric");
    codeInput.setAttribute("autocomplete", "one-time-code");
    codeInput.setAttribute("maxlength", "6");
    codeInput.style.letterSpacing = "0.4em"; codeInput.style.textAlign = "center"; codeInput.style.fontSize = "var(--fs-lg)";
    codeInput.addEventListener("input", function () { codeInput.value = (codeInput.value || "").replace(/\D/g, "").slice(0, 6); });

    var err = el("div", { class: "auth__error" }); err.style.display = "none";
    function showErr(m) { err.textContent = m; err.style.display = ""; }

    var resend = el("button", { class: "auth__link", type: "button" }, "Reenviar código");
    var cooldown = 0, timer = null;
    function tick() {
      if (cooldown <= 0) { resend.disabled = false; resend.textContent = "Reenviar código"; if (timer) { clearInterval(timer); timer = null; } return; }
      resend.disabled = true; resend.textContent = "Reenviar em " + cooldown + "s"; cooldown--;
    }
    resend.addEventListener("click", function () {
      cooldown = 30; tick(); timer = setInterval(tick, 1000);
      App.auth.resendEmailCode(email, App.captcha ? App.captcha.token() : null)
        .then(function () { ui.toast("Novo código enviado para " + email, "ok"); })
        .catch(function (e) { showErr(friendlyError(e)); });
    });

    var confirmBtn = ui.Button({ label: "Confirmar", variant: "primary", onClick: function () {
      var code = (codeInput.value || "").trim();
      if (code.length !== 6) return showErr("Digite os 6 dígitos do código.");
      confirmBtn.setLoading(true); err.style.display = "none";
      App.auth.verifyEmailCode(email, code).then(function (user) {
        if (timer) clearInterval(timer);
        ref.close();
        onVerified(user);
      }).catch(function (e) { showErr(friendlyError(e)); }).then(function () { confirmBtn.setLoading(false); });
    } });

    var body = el("div", { class: "u-col", style: { gap: "12px" } },
      el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)", margin: 0 } },
        "Enviamos um código de 6 dígitos para ", el("strong", email), ". Ele expira em 10 minutos."),
      ui.Field("Código", codeInput), err,
      el("div", { class: "u-row", style: { justifyContent: "center" } }, resend));

    var ref = ui.openModal({
      title: "Verifique seu e-mail",
      body: body,
      actions: [
        ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { if (timer) clearInterval(timer); ref.close(); } }),
        confirmBtn
      ]
    });
    setTimeout(function () { try { codeInput.focus(); } catch (e) {} }, 30);
  }

  /* ---------- login do modo desenvolvedor (email + senha) ---------- */
  var DEV_CRED = { email: "dev@oblivian.app", pass: "obliviandev" };
  function openDevLogin() {
    var email = ui.Input({ type: "email", placeholder: "dev@oblivian.app" });
    var pass = ui.Input({ type: "password", placeholder: "senha" });
    var err = el("div", { class: "auth__error" }); err.style.display = "none";
    var body = el("div", { class: "u-col", style: { gap: "12px" } },
      el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)", margin: "0 0 4px" } }, "Acesso restrito — inspeciona e ajusta a interface."),
      ui.Field("E-mail", email), ui.Field("Senha", pass), err);
    var ref = ui.openModal({
      title: "🔧 Modo desenvolvedor",
      body: body,
      actions: [
        ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
        ui.Button({
          label: "Entrar", variant: "primary", onClick: function () {
            var e = (email.value || "").trim().toLowerCase(), p = pass.value || "";
            if (e === DEV_CRED.email && p === DEV_CRED.pass) {
              if (App.devmode) App.devmode.setOn(true);
              ref.close();
              ui.toast("Modo dev ligado — Alt+clique inspeciona", "ok");
            } else { err.textContent = "Credenciais inválidas."; err.style.display = ""; }
          }
        })
      ]
    });
    setTimeout(function () { try { email.focus(); } catch (e) {} }, 30);
  }

  /* ---------- campo de senha com mostrar/ocultar ---------- */
  function passwordField(placeholder) {
    var input = ui.Input({ type: "password", placeholder: placeholder || "Sua senha" });
    var toggle = el("button", { class: "auth__eye", type: "button", "aria-label": "Mostrar senha" }, "Mostrar");
    toggle.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.textContent = show ? "Ocultar" : "Mostrar";
      if (App.components && App.components.CatLookAway) App.components.CatLookAway(show);  // gato desvia o olhar
      input.focus();
    });
    var wrap = el("div", { class: "auth__pw" }, input, toggle);
    wrap.input = input;
    return wrap;
  }

  /* ---------- ícones de marca (SVG inline) ---------- */
  var BRAND_SVG = {
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4V6.5H1.4C.5 8.1 0 9.9 0 12s.5 3.9 1.4 5.5l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#5865F2"><path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 3c-.21.375-.444.88-.608 1.28a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 8.71 3a19.74 19.74 0 0 0-4.885 1.37C.746 8.78-.32 13.08.137 17.32a19.9 19.9 0 0 0 6.073 3.08c.49-.67.927-1.382 1.304-2.13a12.9 12.9 0 0 1-2.054-.99c.172-.126.34-.258.503-.39a14.2 14.2 0 0 0 12.073 0c.165.137.333.268.503.39-.656.388-1.345.72-2.058.99.377.748.814 1.46 1.304 2.13a19.84 19.84 0 0 0 6.077-3.08c.537-4.91-.917-9.18-3.842-12.95zM8.02 14.91c-1.183 0-2.156-1.085-2.156-2.42 0-1.334.952-2.42 2.156-2.42 1.21 0 2.176 1.096 2.156 2.42 0 1.335-.952 2.42-2.156 2.42zm7.96 0c-1.183 0-2.156-1.085-2.156-2.42 0-1.334.952-2.42 2.156-2.42 1.21 0 2.176 1.096 2.156 2.42 0 1.335-.946 2.42-2.156 2.42z"/></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-1.8c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>'
  };
  function socialRow() {
    var providers = [{ id: "google", label: "Google" }, { id: "discord", label: "Discord" }, { id: "github", label: "GitHub" }];
    var row = el("div", { class: "auth__social" });
    providers.forEach(function (p) {
      var b = el("button", { class: "auth__social-btn auth__social-btn--" + p.id, type: "button", title: "Continuar com " + p.label, "aria-label": "Continuar com " + p.label });
      b.innerHTML = BRAND_SVG[p.id];
      b.addEventListener("click", function () { App.auth.oauth(p.id); });
      row.appendChild(b);
    });
    return el("div", { class: "auth__social-wrap" }, el("div", { class: "auth__divider" }, el("span", "ou continue com")), row);
  }

  /* ---------- a view (card centralizado) ---------- */
  function view(onSuccess) {
    var mode = "in"; // 'in' = entrar | 'up' = criar conta

    var emailInput = ui.Input({ type: "email", placeholder: "voce@email.com" });
    var pwField = passwordField("Sua senha");
    var pw2Field = passwordField("Repita a senha");
    var pw2Row = ui.Field("Confirmar senha", pw2Field);
    pw2Row.style.display = "none"; // só no cadastro

    var errorBox = el("div", { class: "auth__error", role: "alert" });
    errorBox.style.display = "none";

    var submitBtn = ui.Button({ label: "Entrar", variant: "primary", block: true, type: "submit" });

    var forgot = el("button", { class: "auth__link", type: "button" }, "Esqueci a senha");
    forgot.addEventListener("click", function () {
      var resetEmail = (emailInput.value || "").trim();
      if (!validEmail(resetEmail)) return showError("Digite um e-mail válido para recuperação.");
      if (App.repo && typeof App.repo.resetPassword === "function") {
        App.repo.resetPassword(resetEmail).then(function () {
          ui.toast("Link de recuperação enviado para " + resetEmail, "ok");
        }).catch(function (err) { ui.toast(friendlyError(err), "danger"); });
      } else {
        ui.toast("Recuperação de senha indisponível. Contate o suporte.", "danger");
      }
    });

    var toggleMode = el("div", { class: "auth__switch" },
      el("span", { class: "u-muted" }, "Ainda não tem conta?"),
      el("button", { class: "auth__link", type: "button" }, "Criar conta"));

    var segmented = ui.Segmented(
      [{ value: "in", label: "Entrar" }, { value: "up", label: "Criar conta" }],
      "in", function (v) { setMode(v); });

    function setMode(v) {
      mode = v;
      var up = v === "up";
      pw2Row.style.display = up ? "" : "none";
      submitBtn.querySelector("span").textContent = up ? "Criar conta" : "Entrar";
      forgot.style.display = up ? "none" : "";
      toggleMode.firstChild.textContent = up ? "Já tem conta?" : "Ainda não tem conta?";
      toggleMode.lastChild.textContent = up ? "Entrar" : "Criar conta";
      // sincroniza o segmented quando trocado pelo link
      App.util.qsa(".segmented__item", segmented).forEach(function (b) {
        b.classList.toggle("is-active", b.textContent === (up ? "Criar conta" : "Entrar"));
      });
      clearError();
    }
    toggleMode.lastChild.addEventListener("click", function () { setMode(mode === "in" ? "up" : "in"); });

    function clearError() { errorBox.style.display = "none"; errorBox.textContent = ""; }
    function showError(msg) { errorBox.textContent = msg; errorBox.style.display = ""; }

    function submit(e) {
      if (e) e.preventDefault();
      clearError();
      var email = (emailInput.value || "").trim();
      var pw = pwField.input.value || "";
      var cap = App.captcha ? App.captcha.token() : null;

      if (!validEmail(email)) return showError("Digite um e-mail válido.");
      if (mode === "up" && App.util.isDisposableEmail(email)) return showError("Use um e-mail permanente — e-mails temporários não são aceitos.");
      if (pw.length < 8) return showError("Senha precisa de ao menos 8 caracteres.");
      if (mode === "up" && pw !== pw2Field.input.value) return showError("As senhas não conferem.");

      submitBtn.setLoading(true);
      function fail(err) { showError(friendlyError(err)); if (App.captcha) App.captcha.reset(); }
      function done() { submitBtn.setLoading(false); }

      if (mode === "up") {
        App.auth.signUp(email, pw, cap).then(function (data) {
          data = data || {};
          if (data.session) {
            // confirmação DESLIGADA no Supabase → já entrou. Segue p/ completar o perfil.
            var u = data.user || data;
            if (App.store && u && u.id) App.store.set("currentUserId", u.id);
            ui.toast("Conta criada! Complete seu perfil.", "ok");
            onSuccess(u, { dest: "/perfil/editar" });
            return;
          }
          // confirmação LIGADA → pede o código de 6 dígitos (só cria a conta cheia após verificar)
          openCodeModal(email, function (me) {
            if (App.store && me && me.id) App.store.set("currentUserId", me.id);
            ui.toast("E-mail verificado! Complete seu perfil.", "ok");
            onSuccess(me, { dest: "/perfil/editar" });
          });
        }).catch(fail).then(done);
      } else {
        App.auth.signIn(email, pw, cap).then(function (user) {
          if (App.store && user && user.id) App.store.set("currentUserId", user.id);
          ui.toast("Bem-vindo(a) de volta!", "ok");
          onSuccess(user);
        }).catch(fail).then(done);
      }
    }

    var captchaSlot = el("div", { class: "auth__captcha" });   // widget só aparece se config.captcha.siteKey existir

    var form = el("form", { class: "auth__form" },
      ui.Field("E-mail", emailInput),
      ui.Field("Senha", pwField),
      pw2Row,
      forgot,
      captchaSlot,
      errorBox,
      submitBtn);
    form.addEventListener("submit", submit);
    submitBtn.addEventListener("click", submit);
    // renderiza o captcha após montar (no-op sem siteKey)
    setTimeout(function () { try { if (App.captcha) App.captcha.render(captchaSlot); } catch (e) {} }, 0);

    var brand = el("div", { class: "auth__brand" },
      (App.components && App.components.CatBadge) ? App.components.CatBadge() : el("img", { class: "auth__logo", src: "assets/icon.svg?v=cat5", alt: "Oblivian" }),
      el("h1", { class: "auth__title" }, "Oblivian"),
      el("p", { class: "auth__subtitle" }, "Entre para suas comunidades, chats e perfil."));

    var card = el("div", { class: "auth__card" }, brand, segmented, form, socialRow(), toggleMode);

    // 🐱 o gato OLHA o que você digita (segue o caret até o limite do campo)
    if (App.components && App.components.CatLookAt) {
      var caretPos = function (inp) {
        var r = inp.getBoundingClientRect(), cs = getComputedStyle(inp);
        var cnv = caretPos._c || (caretPos._c = document.createElement("canvas"));
        var c = cnv.getContext("2d");
        c.font = (cs.fontSize || "16px") + " " + (cs.fontFamily || "sans-serif");
        var val = inp.type === "password" ? new Array((inp.value || "").length + 1).join("•") : (inp.value || inp.placeholder || "");
        var w = c.measureText(val).width;
        var pad = parseFloat(cs.paddingLeft) || 14;
        var x = Math.min(r.right - 14, r.left + pad + w);     // caret, travado no limite do campo
        return { x: x, y: r.top + r.height / 2 };
      };
      var track = function (e) {
        var t = e.target;
        if (!t || t.tagName !== "INPUT") return;
        var p = caretPos(t);
        App.components.CatLookAt(p.x, p.y);
      };
      card.addEventListener("input", track);
      card.addEventListener("focusin", track);
    }

    // aviso de modo demo quando backend não está ligado
    if (!hasBackend()) {
      card.appendChild(el("div", { class: "auth__demo" },
        App.icon("info", { size: "sm" }),
        el("span", "Modo demo: backend desligado. Qualquer e-mail/senha entra na conta local.")));
    }

    return el("div", { class: "auth" }, el("div", { class: "auth__bg" }), card);
  }

  /* rota /login (dentro do shell, p/ visualizar/testar) */
  App.screens.login = function () {
    return { node: view(function (user, opts) { App.router.navigate((opts && opts.dest) || "/explorer"); }), title: "Entrar", flush: true, immersive: true };
  };
})(window.App = window.App || {});
