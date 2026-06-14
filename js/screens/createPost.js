/* ============================================================
   screens/createPost.js — Criar publicação em TELA CHEIA própria.
   Seletor de tipo + campos por tipo + pré-visualização ao vivo.
   Rota: /c/:id/criar-post
   Namespace: App.screens.createPost
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  var TYPES = [
    { key: "text", label: "Post", icon: "comment" },
    { key: "blog", label: "Blog", icon: "featured" },
    { key: "image", label: "Imagem", icon: "image" },
    { key: "poll", label: "Enquete", icon: "recent" },
    { key: "quiz", label: "Quiz", icon: "star" },
    { key: "link", label: "Link", icon: "globe" },
    { key: "question", label: "Pergunta", icon: "info" },
    { key: "wiki", label: "Wiki", icon: "shield" }
  ];

  function render(ctx) {
    var cid = ctx.params.id;
    var inner = el("div", { class: "view__inner view__inner--flush" });

    // pré-visualização: ainda não existe comunidade real → publicar é bloqueado
    if (App.preview && App.preview.active(cid)) {
      App.util.mount(inner, ui.Empty("eye", "Pré-visualização", "Crie a comunidade para publicar."));
      return { node: inner, active: "sanguao", title: "Pré-visualização", communityId: cid, immersive: true, flush: true };
    }

    // ---- MODO EDIÇÃO: a MESMA tela de criar serve p/ editar (?edit=<id>) ----
    // o post completo chega via store (App.store.set("editPost", p)) antes de navegar.
    var editId = ctx.query && ctx.query.edit;
    var editing = null;
    if (editId) { var _ep = App.store.get("editPost"); if (_ep && _ep.id === editId) editing = _ep; }
    var backTo = editing ? ("/c/" + cid + "/p/" + editId) : ("/c/" + cid + "/latest");

    Promise.all([App.repo.getCommunity(cid), App.repo.getMembership(cid), App.repo.getCurrentUser()]).then(function (r) {
      var community = r[0], membership = r[1], meUser = r[2];
      if (!community) { App.util.mount(inner, ui.Empty("info", "Comunidade não encontrada")); return; }
      if (!membership) { App.util.mount(inner, ui.Empty("profile", "Participe da comunidade para publicar")); return; }
      var accent = (community.theme && community.theme.accent) || App.store.get("accent");

      var qtipo = ctx.query && ctx.query.tipo;
      var seed = (editing && editing.payload) || null;  // payload do post sendo editado
      var type = editing ? (editing.type || "text")
        : (TYPES.some(function (x) { return x.key === qtipo; }) ? qtipo : TYPES[0].key);
      var titleInput = ui.Input({ placeholder: "Título", maxlength: ui.LIMITS.postTitle });
      var bodyInput = ui.Textarea({ placeholder: "Escreva aqui...", maxlength: ui.LIMITS.postBody });
      var bodyCounter = ui.limitField(bodyInput, ui.LIMITS.postBody);
      if (editing) { titleInput.value = editing.title || ""; bodyInput.value = editing.text || ""; }

      // ---- mídia inserida NO TEXTO: código curto [IMG|1], [IMG|2]... ----
      // o dataURL fica num mapa que vai no payload.media (curto no texto, completo no post).
      var media = {}; var mediaSeq = 0;
      if (seed && seed.media) {
        Object.keys(seed.media).forEach(function (k) { media[k] = seed.media[k]; var n = parseInt(k, 10); if (n > mediaSeq) mediaSeq = n; });
      }
      // ---- imagens de CAPA (até 4) — separadas da imagem do texto ----
      var covers = (seed && Array.isArray(seed.cover)) ? seed.cover.slice(0, 4) : [];

      var fieldsHost = el("div", { class: "cpost__fields" });
      var previewHost = el("div", { class: "cpost__preview" });

      // ---- coletores de payload por tipo ----
      var collectors = {};

      function buildFields() {
        App.util.clear(fieldsHost);
        collectors = {};
        var t = type;
        // título — toda publicação tem
        fieldsHost.appendChild(field("Título", titleInput));
        // corpo
        bodyInput.placeholder = t === "question" ? "Detalhe sua pergunta..." : "Conteúdo...";
        // ---- barra de formatação (abre ao clicar) ----
        var imgFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
        function insertAtCursor(snippet) {
          var s = bodyInput.selectionStart || 0, e = bodyInput.selectionEnd || 0, v = bodyInput.value;
          bodyInput.value = v.slice(0, s) + snippet + v.slice(e);
          bodyInput.selectionStart = bodyInput.selectionEnd = s + snippet.length;
          bodyInput.focus();
        }
        function wrapSel(tag) {
          var s = bodyInput.selectionStart || 0, e = bodyInput.selectionEnd || 0, v = bodyInput.value;
          var sel = v.slice(s, e);
          if (!sel) { insertAtCursor("[" + tag + "]"); return; } // sem seleção: só a tag de abrir
          var pre = "[" + tag + "]", suf = "[/" + tag + "]";
          bodyInput.value = v.slice(0, s) + pre + sel + suf + v.slice(e);
          bodyInput.selectionStart = s + pre.length; bodyInput.selectionEnd = s + pre.length + sel.length;
          bodyInput.focus();
        }
        function storeAndInsert(fileOrBlob) {
          App.util.downscaleImage(fileOrBlob, { maxDim: 1024, quality: 0.8 })
            .then(function (src) {
              var code = String(++mediaSeq);   // código curto e limpo: [IMG|1], [IMG|2]...
              media[code] = src;               // dataURL guardado fora do texto (vai no payload.media)
              insertAtCursor("[IMG|" + code + "]");
              ui.toast("Imagem inserida no texto", "ok");
            })
            .catch(function () { ui.toast("Falha ao inserir imagem", "danger"); });
        }
        imgFile.addEventListener("change", function () { var f = (imgFile.files || [])[0]; if (f) storeAndInsert(f); imgFile.value = ""; });
        bodyInput.addEventListener("paste", function (e) {
          var items = (e.clipboardData && e.clipboardData.items) || [];
          for (var k = 0; k < items.length; k++) { if (items[k].type && items[k].type.indexOf("image") === 0) { var blob = items[k].getAsFile(); if (blob) { e.preventDefault(); storeAndInsert(blob); return; } } }
        });
        function insertLink() {
          var s = bodyInput.selectionStart || 0, e = bodyInput.selectionEnd || 0;
          var label = (bodyInput.value.slice(s, e) || "").trim();
          var nameInp = ui.Input({ value: label, placeholder: "Ex.: Meu site" });
          var urlInp = ui.Input({ value: "", placeholder: "https://..." });
          var body = el("div", { class: "linkdlg" }, ui.Field("Texto do link", nameInp), ui.Field("Endereço (url)", urlInp));
          var ref = ui.openModal({
            title: "Inserir link", scrimClass: "scrim--centered", dismissable: true, body: body,
            actions: [
              ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
              ui.Button({ label: "Inserir", variant: "primary", onClick: function () {
                var u = (urlInp.value || "").trim();
                if (!u) { ui.toast("Informe o endereço", "danger"); return; }
                var n = (nameInp.value || "").trim() || u;
                insertAtCursor("[" + n + "|" + u + "]"); ref.close();
              } })
            ]
          });
          setTimeout(function () { try { (label ? urlInp : nameInp).focus(); } catch (er) {} }, 30);
        }
        function toolBtn(label, title, onClick) {
          var b = el("button", { class: "fmt-btn", type: "button", title: title || label }, label);
          // mousedown preventDefault → o textarea NÃO perde foco/seleção ao clicar no botão,
          // então o trecho selecionado continua destacado enquanto se formata.
          b.addEventListener("mousedown", function (e) { e.preventDefault(); });
          b.addEventListener("click", function (e) { e.preventDefault(); onClick(); });
          return b;
        }
        // barra de formatação SEMPRE aberta, em coluna (vertical), ao lado da escrita.
        var toolbar = el("div", { class: "fmt-bar fmt-bar--v is-open" },
          toolBtn(el("strong", "B"), "Negrito", function () { wrapSel("B"); }),
          toolBtn(el("em", "I"), "Itálico", function () { wrapSel("I"); }),
          toolBtn(el("u", "U"), "Sublinhado", function () { wrapSel("U"); }),
          toolBtn(el("s", "S"), "Tachado", function () { wrapSel("S"); }),
          toolBtn(App.icon("forward", { size: "sm" }), "Centralizar", function () { wrapSel("C"); }),
          el("span", { class: "fmt-sep" }),
          toolBtn(App.icon("globe", { size: "sm" }), "Inserir link", insertLink),
          toolBtn(App.icon("image", { size: "sm" }), "Imagem no texto", function () { imgFile.click(); }));
        fieldsHost.appendChild(field(t === "link" ? "Descrição" : "Conteúdo",
          el("div", { class: "fmt-field fmt-field--v" },
            el("div", { class: "fmt-editor" }, toolbar, bodyInput),
            imgFile, el("div", { class: "fmt-field__foot" }, bodyCounter))));

        if (t === "image") {
          var ip = C.ImagePicker({ value: (seed && seed.image) || null, hint: "Imagem da publicação (PNG/JPG/GIF)." });
          ip.node.addEventListener("input", refreshPreview);
          collectors.payload = function () { var v = ip.getValue(); return { image: v || null, images: v ? 1 : 0 }; };
          fieldsHost.appendChild(field("Imagem", ip.node));
        } else if (t === "poll") {
          var opts = [];
          var optHost = el("div", { class: "u-col u-gap-2" });
          function addOpt(val) {
            var inp = ui.Input({ value: val || "", placeholder: "Opção " + (opts.length + 1), maxlength: ui.LIMITS.pollOption });
            inp.addEventListener("input", refreshPreview);
            var rm = ui.IconButton("close", { title: "Remover", onClick: function () {
              var i = opts.indexOf(o); if (i >= 0) opts.splice(i, 1); optHost.removeChild(row); refreshPreview();
            } });
            var row = el("div", { class: "u-row u-gap-2", style: { alignItems: "center" } }, el("div", { class: "u-grow" }, inp), rm);
            var o = { inp: inp };
            opts.push(o); optHost.appendChild(row);
          }
          if (seed && Array.isArray(seed.options) && seed.options.length) { seed.options.forEach(function (o) { addOpt((o && o.label) || o); }); }
          else { addOpt(); addOpt(); }
          var addBtn = ui.Button({ label: "Adicionar opção", icon: "plus", size: "sm", variant: "outline", onClick: function () { if (opts.length < 6) { addOpt(); refreshPreview(); } } });
          // prazo da enquete
          var DUR = [
            { v: "0", label: "Sem prazo" }, { v: "3600000", label: "1 hora" },
            { v: "21600000", label: "6 horas" }, { v: "86400000", label: "1 dia" },
            { v: "259200000", label: "3 dias" }, { v: "604800000", label: "7 dias" }
          ];
          var durSel = el("select", { class: "input cpost-select" }, DUR.map(function (d) { return el("option", { value: d.v }, d.label); }));
          durSel.value = "86400000";
          collectors.payload = function () {
            var ms = +durSel.value || 0;
            return {
              options: opts.map(function (o) { return { label: o.inp.value.trim(), votes: 0 }; }).filter(function (o) { return o.label; }),
              endsAt: ms ? (Date.now() + ms) : null
            };
          };
          fieldsHost.appendChild(field("Opções da enquete", el("div", { class: "u-col u-gap-2" }, optHost, addBtn)));
          fieldsHost.appendChild(field("Prazo", durSel));
        } else if (t === "quiz") {
          var qs = [];                       // { promptInp, optHost, opts:[{inp, radio}] }
          var qHost = el("div", { class: "u-col u-gap-3" });
          function addQuestion(seed) {
            var promptInp = ui.Input({ value: (seed && seed.q) || "", placeholder: "Pergunta " + (qs.length + 1), maxlength: ui.LIMITS.quizText });
            promptInp.addEventListener("input", refreshPreview);
            var q = { promptInp: promptInp, opts: [], bg: (seed && seed.bg) || null };
            // imagem de fundo da pergunta
            var bgFile = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
            var bgTile = el("button", { class: "cpost-quizq__bg" + (q.bg ? " has-img" : ""), type: "button",
              style: q.bg ? { backgroundImage: "url(" + q.bg + ")" } : {} },
              el("span", { class: "cpost-quizq__bglbl" }, App.icon("image", { size: "sm" }), el("span", q.bg ? "Trocar fundo" : "Fundo da pergunta")),
              bgFile);
            bgFile.addEventListener("change", function () {
              var f = (bgFile.files || [])[0]; if (!f) return;
              App.util.downscaleImage(f, { maxDim: 1280, quality: 0.8 }).then(function (src) {
                q.bg = src; bgTile.style.backgroundImage = "url(" + src + ")"; bgTile.classList.add("has-img");
                bgTile.querySelector(".cpost-quizq__bglbl span:last-child").textContent = "Trocar fundo";
                if (!bgTile.querySelector(".cpost-quizq__bgrm")) bgTile.appendChild(bgRm);
              }).catch(function () { ui.toast("Falha ao carregar imagem", "danger"); });
              bgFile.value = "";
            });
            var bgRm = el("button", { class: "cpost-quizq__bgrm", type: "button", title: "Remover fundo" }, App.icon("close", { size: "sm" }));
            bgRm.addEventListener("click", function (e) {
              e.stopPropagation(); q.bg = null; bgTile.style.backgroundImage = ""; bgTile.classList.remove("has-img");
              bgTile.querySelector(".cpost-quizq__bglbl span:last-child").textContent = "Fundo da pergunta";
              if (bgRm.parentNode) bgRm.parentNode.removeChild(bgRm);
            });
            if (q.bg) bgTile.appendChild(bgRm);
            bgTile.addEventListener("click", function () { bgFile.click(); });
            var optHost = el("div", { class: "u-col u-gap-2" });
            var name = "qz-" + qs.length + "-" + Math.max(1, qHost.childElementCount + 1);
            function addOpt(val, isCorrect) {
              var inp = ui.Input({ value: val || "", placeholder: "Resposta " + (q.opts.length + 1), maxlength: ui.LIMITS.pollOption });
              inp.addEventListener("input", refreshPreview);
              var radio = el("input", { type: "radio", name: name, title: "Marcar como correta" });
              if (isCorrect) radio.checked = true;
              radio.addEventListener("change", refreshPreview);
              var rm = ui.IconButton("close", { title: "Remover resposta", onClick: function () {
                var i = q.opts.indexOf(o); if (i >= 0 && q.opts.length > 2) { q.opts.splice(i, 1); optHost.removeChild(row); refreshPreview(); }
              } });
              var row = el("div", { class: "u-row u-gap-2", style: { alignItems: "center" } },
                radio, el("div", { class: "u-grow" }, inp), rm);
              var o = { inp: inp, radio: radio };
              q.opts.push(o); optHost.appendChild(row);
            }
            (seed && seed.options ? seed.options : ["", ""]).forEach(function (op, i) { addOpt(op, seed && seed.correct === i); });
            if (!seed) q.opts[0].radio.checked = true;
            var addOptBtn = ui.Button({ label: "Adicionar resposta", icon: "plus", size: "sm", variant: "outline", onClick: function () { if (q.opts.length < 5) { addOpt(); refreshPreview(); } } });
            var rmQ = ui.Button({ label: "Remover pergunta", icon: "trash", size: "sm", variant: "ghost", onClick: function () {
              var i = qs.indexOf(q); if (i >= 0 && qs.length > 1) { qs.splice(i, 1); qHost.removeChild(card); refreshPreview(); }
            } });
            var card = el("div", { class: "cpost-quizq" },
              field("Pergunta", promptInp),
              field("Imagem de fundo (opcional)", bgTile),
              field("Respostas (marque a correta)", el("div", { class: "u-col u-gap-2" }, optHost, addOptBtn)),
              rmQ);
            q.optHost = optHost;
            qs.push(q); qHost.appendChild(card);
          }
          if (seed && Array.isArray(seed.questions) && seed.questions.length) { seed.questions.forEach(function (q) { addQuestion(q); }); }
          else { addQuestion(); }
          var addQBtn = ui.Button({ label: "Adicionar pergunta", icon: "plus", size: "sm", variant: "primary", onClick: function () { if (qs.length < 15) { addQuestion(); refreshPreview(); } } });
          collectors.payload = function () {
            var questions = qs.map(function (q) {
              var options = [], correct = 0;
              q.opts.forEach(function (o) {
                var v = o.inp.value.trim(); if (!v) return;
                if (o.radio.checked) correct = options.length;
                options.push(v);
              });
              return { q: q.promptInp.value.trim(), options: options, correct: correct, bg: q.bg || null };
            }).filter(function (q) { return q.q && q.options.length >= 2; });
            return { questions: questions, plays: 0, best: 0 };
          };
          fieldsHost.appendChild(field("Quiz", el("div", { class: "u-col u-gap-3" }, qHost, addQBtn)));
        } else if (t === "link") {
          var url = ui.Input({ placeholder: "https://...", maxlength: ui.LIMITS.url });
          if (seed && seed.url) url.value = seed.url;
          url.addEventListener("input", refreshPreview);
          collectors.payload = function () { var v = url.value.trim(); return { url: v, domain: (v.split("/")[2] || v) }; };
          fieldsHost.appendChild(field("URL", url));
        } else if (t === "wiki") {
          var cover = C.ImagePicker({ value: (seed && seed.image) || null, hint: "Capa da wiki." });
          cover.node.addEventListener("input", refreshPreview);
          var gal = (seed && Array.isArray(seed.gallery)) ? seed.gallery.slice() : [];
          var galHost = el("div", { class: "u-row u-gap-2", style: { flexWrap: "wrap" } });
          function renderGal() {
            App.util.clear(galHost);
            gal.forEach(function (src, i) {
              var th = el("div", { class: "cpost__galthumb", style: { backgroundImage: "url(" + src + ")" } },
                el("button", { class: "cpost__galrm", type: "button", title: "Remover", onClick: function () { gal.splice(i, 1); renderGal(); refreshPreview(); } }, App.icon("close", { size: "sm" })));
              galHost.appendChild(th);
            });
          }
          renderGal();
          var addGal = ui.Button({ label: "Adicionar à galeria", icon: "plus", size: "sm", variant: "outline", onClick: function () {
            var ip = C.ImagePicker({ value: null, hint: "Imagem da galeria." });
            var ref = ui.openModal({ title: "Adicionar imagem", scrimClass: "scrim--centered", body: ip.node, actions: [
              ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
              ui.Button({ label: "Adicionar", variant: "primary", onClick: function () { var v = ip.getValue(); if (v) { gal.push(v); renderGal(); refreshPreview(); } ref.close(); } })
            ] });
          } });
          collectors.payload = function () { return { image: cover.getValue() || (gal[0] || null), gallery: gal.slice(), sections: gal.length || 1, contributors: 1, updated: "hoje" }; };
          fieldsHost.appendChild(field("Capa", cover.node));
          fieldsHost.appendChild(field("Galeria", el("div", { class: "u-col u-gap-2" }, galHost, addGal)));
        } else if (t === "blog") {
          collectors.payload = function () { return { readMinutes: Math.max(1, Math.round((bodyInput.value || "").length / 600)) || 1, cover: false }; };
        }
        refreshPreview();
      }

      function field(label, control) {
        return el("div", { class: "cpost__field" }, el("div", { class: "cpost__label" }, label), control);
      }

      // ---- CAPA do conteúdo (até 4) — galeria visual: adicionar / visualizar / trocar / remover.
      // Lógica SEPARADA da imagem inserida no texto: a capa NÃO vira [IMG|n], vai em payload.cover. ----
      var coverHost = el("div", { class: "cpost-cover__gal" });
      function pickCover(idx) {
        var ip = C.ImagePicker({ value: null, hint: "Imagem de capa do conteúdo.", aspect: 16 / 9 });
        var ref = ui.openModal({ title: idx == null ? "Adicionar capa" : "Trocar capa", scrimClass: "scrim--centered", body: ip.node, actions: [
          ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
          ui.Button({ label: "Salvar", variant: "primary", onClick: function () { var v = ip.getValue(); if (v) { if (idx == null) covers.push(v); else covers[idx] = v; renderCovers(); } ref.close(); } })
        ] });
      }
      function renderCovers() {
        App.util.clear(coverHost);
        covers.forEach(function (src, i) {
          var th = el("div", { class: "cpost-cover__thumb", style: { backgroundImage: "url(" + src + ")" } },
            el("button", { class: "cpost-cover__rm", type: "button", title: "Remover", onClick: function () { covers.splice(i, 1); renderCovers(); } }, App.icon("close", { size: "sm" })),
            el("button", { class: "cpost-cover__swap", type: "button", title: "Trocar", onClick: function () { pickCover(i); } }, App.icon("edit", { size: "sm" })));
          coverHost.appendChild(th);
        });
        if (covers.length < 4) {
          var add = el("button", { class: "cpost-cover__add", type: "button", title: "Adicionar capa" }, App.icon("plus"), el("span", "Capa"));
          add.addEventListener("click", function () { pickCover(null); });
          coverHost.appendChild(add);
        }
      }
      renderCovers();
      var coverField = el("div", { class: "cpost__field" },
        el("div", { class: "cpost__label" }, "Capa do conteúdo (até 4)"),
        el("div", { class: "cpost-cover__hint" }, "A capa aparece no topo do conteúdo — diferente das imagens inseridas no texto."),
        coverHost);

      function buildPost() {
        var payload = collectors.payload ? collectors.payload() : {};
        // editando: preserva chaves do payload original que a UI não reconstrói (ex.: question/answer)
        if (editing && seed) payload = Object.assign({}, seed, payload);
        if (Object.keys(media).length) payload.media = media;           // imagens do texto (códigos curtos)
        else if (editing) delete payload.media;
        if (covers.length) payload.cover = covers.slice();              // imagens de capa (até 4)
        else if (editing) delete payload.cover;
        var data = { type: type, title: titleInput.value.trim(), text: bodyInput.value.trim(),
          userId: App.store.get("currentUserId"), likes: [], comments: 0, createdAt: Date.now(), payload: payload };
        return data;
      }

      // prévia ao vivo removida do editor — usar o botão de olho (openPreview)
      function refreshPreview() {}

      // ---- seletor de tipo: SÓ quando aberto sem tipo definido.
      // Aberto via pilha (?tipo) = interface dedicada do tipo (sem seletor). ----
      var typeBar = el("div", { class: "cpost__types" });
      if (!qtipo && !editing) {
        TYPES.forEach(function (tp) {
          var b = el("button", { class: "cpost__type" + (tp.key === type ? " is-active" : ""), type: "button", "data-t": tp.key },
            App.icon(tp.icon, { size: "sm" }), el("span", tp.label));
          b.addEventListener("click", function () {
            type = tp.key;
            App.util.qsa(".cpost__type", typeBar).forEach(function (x) { x.classList.remove("is-active"); });
            b.classList.add("is-active");
            buildFields();
          });
          typeBar.appendChild(b);
        });
      } else {
        typeBar = null; // interface dedicada / edição: sem troca de tipo
      }

      bodyInput.addEventListener("input", refreshPreview);
      titleInput.addEventListener("input", refreshPreview);

      // ---- pré-visualização: abre a publicação como vista de fora + comentários ----
      function openPreview() {
        var p = buildPost();
        if (!p.text && !p.title && !(p.payload && (p.payload.image || (p.payload.options && p.payload.options.length)))) {
          ui.toast("Escreva algo para pré-visualizar", "danger"); return;
        }
        var PR = App.postRender || {};
        var meName = (membership && membership.nickname) || meUser.name;
        var meAvatar = (membership && membership.avatar) || meUser.avatar;
        var isWiki = type === "wiki";
        var coverArr = (p.payload && p.payload.cover) || [];
        var heroImg = coverArr[0] || (!isWiki && p.payload && (p.payload.image || (p.payload.gallery && p.payload.gallery[0]))) || null;
        var showHeroOnly = heroImg && type !== "image"; // imagem já aparece no corpo (grid)

        var closeBtn = el("button", { class: "pv2__back", type: "button", title: "Fechar", onClick: close }, App.icon("close"));
        var top = showHeroOnly
          ? el("div", { class: "pv2__hero", style: { backgroundImage: "url(" + heroImg + ")" } },
              el("div", { class: "pv2__herofade" }),
              el("div", { class: "pv2__topbar pv2__topbar--over" }, closeBtn, el("div", { class: "u-grow" }), el("span", { class: "pview__tag" }, "Prévia")))
          : el("div", { class: "pv2__topbar" }, closeBtn, el("div", { class: "u-truncate u-grow", style: { fontWeight: "var(--fw-bold)" } }, community.name), el("span", { class: "pview__tag" }, "Prévia"));

        var authorWrap = el("div", { class: "pv2__author" },
          el("div", { class: "pv2__authorleft" },
            ui.Avatar({ name: meName, src: meAvatar, round: true }),
            el("div", { class: "pv2__authormeta" },
              el("div", { class: "pv2__authorname" }, el("strong", meName)),
              el("div", { class: "pv2__time" }, "agora"))));

        var bodyNode = PR.body ? PR.body(p) : el("p", { class: "pv2__bodytext" }, App.markup.render(p.text, { media: p.payload && p.payload.media }));
        var article = el("article", { class: "pv2__post" },
          p.title ? el("h1", { class: "pv2__title" }, p.title) : null,
          el("div", { class: "pv2__sep" }),
          authorWrap,
          el("div", { class: "pv2__sep" }),
          el("div", { class: "pv2__bodytext" }, bodyNode),
          el("div", { class: "pv2__comments" },
            el("div", { class: "pv2__clabel" }, el("span", "Comentários")),
            ui.Empty("comment", "Sem comentários ainda", "Aparecem depois de publicar.")));

        var bar = el("div", { class: "pv2__bar" },
          el("div", { class: "pv2__barrow" },
            ui.IconButton("plus", { title: "Indisponível na prévia" }),
            el("div", { class: "u-grow" }, ui.Input({ placeholder: "Comente após publicar" })),
            ui.IconButton("send", { title: "Indisponível na prévia" })));

        var overlay = el("div", { class: "pv2 cpost-preview" }, el("div", { class: "pv2__scroll" }, top, article), bar);
        overlay.style.setProperty("--accent", accent);
        var badge = el("button", { class: "preview-badge", type: "button" }, App.icon("eye", { size: "sm" }), el("span", "Fechar pré-visualização"));
        badge.addEventListener("click", close);
        function close() { overlay.remove(); badge.remove(); }
        inner.appendChild(overlay);
        inner.appendChild(badge);
      }

      function publish() {
        var data = buildPost();
        if (!data.title) { ui.toast("Adicione um título", "danger"); return; }
        if (data.type === "poll" && (!data.payload || (data.payload.options || []).length < 2)) { ui.toast("Enquete precisa de pelo menos 2 opções", "danger"); return; }
        if (data.type === "quiz" && (!data.payload || (data.payload.questions || []).length < 1)) { ui.toast("Quiz precisa de pelo menos 1 pergunta", "danger"); return; }
        delete data.userId; delete data.likes; delete data.comments; delete data.createdAt; // repo define
        if (editing) {
          // MESMA tela serve p/ editar: salva por cima (título, texto, payload c/ capa+mídia)
          App.repo.editPost(editing.id, { title: data.title, text: data.text, payload: data.payload }).then(function () {
            App.store.set("editPost", null);
            ui.toast("Alterações salvas", "ok");
            App.router.navigate("/c/" + cid + "/p/" + editing.id);
          }).catch(function (e) { ui.toast(e.message || "Falha ao salvar", "danger"); });
          return;
        }
        App.repo.createPost(cid, data).then(function (res) {
          ui.toast("Publicado!", "ok");
          App.router.navigate("/c/" + cid + "/p/" + res.post.id);
        }).catch(function (e) { ui.toast(e.message || "Falha ao publicar", "danger"); });
      }

      var typeLabel = (TYPES.filter(function (x) { return x.key === type; })[0] || {}).label || "publicação";
      var header = el("div", { class: "editp2__head" },
        ui.IconButton("back", { title: "Voltar", onClick: function () { if (editing) App.store.set("editPost", null); App.router.navigate(backTo); } }),
        el("div", { class: "editp2__title u-grow" }, editing ? "Editar publicação" : (qtipo ? "Nova " + typeLabel : "Nova publicação")),
        ui.IconButton("eye", { title: "Pré-visualizar", onClick: openPreview }),
        ui.IconButton("check", { title: "Publicar", onClick: publish }));

      var page = el("div", { class: "editp2 cpost" }, header,
        el("div", { class: "cpost__body" }, typeBar, coverField, fieldsHost));
      page.style.setProperty("--accent", accent);
      buildFields();
      App.util.mount(inner, page);
    });

    return { node: inner, active: "sanguao", title: "Nova publicação", communityId: cid, immersive: true, flush: true };
  }

  App.screens.createPost = render;
})(window.App = window.App || {});
