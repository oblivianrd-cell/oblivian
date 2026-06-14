/* ============================================================
   components/imagePicker.js — Seletor de imagem (avatar, ícone,
   capa, painel, fundo). Lê o arquivo como dataURL (offline) ou URL.
   Com opts.aspect: abre ENQUADRADOR (quadro na proporção + arrastar
   + zoom: slider, roda do mouse e pinça) e recorta no canvas.
   Também expõe os visualizadores:
     · openImageViewer  — lightbox genérico (formato original)
     · openAvatarViewer — avatar quadrado + salvar + molduras
   Namespace: App.components.*
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.components = App.components || {};

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---- enquadrador: quadro na proporção, arrasta + zoom, recorta no canvas ----
     Regra de cobertura: a imagem SEMPRE preenche o quadro (sem bordas vazias).
     scale = 1 é o "cover" mínimo; o usuário só aumenta a partir daí. O recorte
     é assado no canvas, então o resultado é idêntico ao que aparece na prévia. */
  function openCropper(src, aspect, outW, cb) {
    var img = new Image();
    img.onerror = function () { ui.toast("Falha ao carregar imagem", "danger"); cb(src); };
    img.onload = function () { build(); };
    img.src = src;

    function build() {
      var isSquare = Math.abs(aspect - 1) < 0.01;
      // quadro responsivo: grande no PC, cabe no celular. Desconta o padding do
      // modal (~96px entre scrim e corpo) p/ nunca estourar largura no celular.
      var maxW = Math.min(window.innerWidth - 96, 460);
      var maxH = Math.min(Math.round(window.innerHeight * 0.52), 460);
      var frameW, frameH;
      if (aspect >= 1) { frameW = maxW; frameH = Math.round(frameW / aspect); if (frameH > maxH) { frameH = maxH; frameW = Math.round(frameH * aspect); } }
      else { frameH = maxH; frameW = Math.round(frameH * aspect); if (frameW > maxW) { frameW = maxW; frameH = Math.round(frameW / aspect); } }

      var coverScale = Math.max(frameW / img.width, frameH / img.height);
      var MIN = 1, MAX = 5;                 // 1 = cobre o quadro · 5 = 500%
      var scale = 1, ox = 0, oy = 0;

      var im = el("img", { src: src, class: "cropper__img", draggable: "false" });
      var frame = el("div", { class: "cropper__frame" + (isSquare ? " cropper__frame--round" : ""), style: { width: frameW + "px", height: frameH + "px" } },
        im, el("div", { class: "cropper__guide", "aria-hidden": "true" }));

      function paint() {
        var dw = img.width * coverScale * scale, dh = img.height * coverScale * scale;
        ox = clamp(ox, frameW - dw, 0);   // mantém cobertura (sem buracos)
        oy = clamp(oy, frameH - dh, 0);
        im.style.width = dw + "px"; im.style.height = dh + "px";
        im.style.transform = "translate(" + ox + "px," + oy + "px)";
      }
      // zoom em torno de um ponto (cx,cy) do quadro: o pixel sob o ponto não desliza
      function zoomAround(ns, cx, cy) {
        ns = clamp(ns, MIN, MAX);
        var dwOld = img.width * coverScale * scale, dhOld = img.height * coverScale * scale;
        var fx = dwOld ? (cx - ox) / dwOld : 0.5, fy = dhOld ? (cy - oy) / dhOld : 0.5;
        scale = ns;
        var dwNew = img.width * coverScale * scale, dhNew = img.height * coverScale * scale;
        ox = cx - fx * dwNew; oy = cy - fy * dhNew;
        paint(); syncZoom();
      }
      // centraliza no início
      ox = (frameW - img.width * coverScale) / 2;
      oy = (frameH - img.height * coverScale) / 2;
      paint();

      // ---- gestos: 1 dedo/mouse = arrastar · 2 dedos = pinça (zoom) ----
      var pointers = {}, rect = null, panX = 0, panY = 0, ox0 = 0, oy0 = 0, pinchD = 0, pinchMid = null;
      function local(e) { return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
      function ids() { return Object.keys(pointers); }
      function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
      function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

      frame.addEventListener("pointerdown", function (e) {
        rect = frame.getBoundingClientRect();
        try { frame.setPointerCapture(e.pointerId); } catch (er) {}
        pointers[e.pointerId] = local(e);
        var k = ids();
        if (k.length === 1) { var p = pointers[k[0]]; panX = p.x; panY = p.y; ox0 = ox; oy0 = oy; }
        else if (k.length === 2) { pinchD = dist(pointers[k[0]], pointers[k[1]]); pinchMid = mid(pointers[k[0]], pointers[k[1]]); }
      });
      frame.addEventListener("pointermove", function (e) {
        if (!(e.pointerId in pointers)) return;
        if (!rect) rect = frame.getBoundingClientRect();
        pointers[e.pointerId] = local(e);
        var k = ids();
        if (k.length >= 2) {
          var a = pointers[k[0]], b = pointers[k[1]], d = dist(a, b), m = mid(a, b);
          if (pinchD > 0) { zoomAround(scale * (d / pinchD), m.x, m.y); }
          if (pinchMid) { ox += (m.x - pinchMid.x); oy += (m.y - pinchMid.y); paint(); }
          pinchD = d; pinchMid = m;
        } else if (k.length === 1) {
          var p = pointers[k[0]]; ox = ox0 + (p.x - panX); oy = oy0 + (p.y - panY); paint();
        }
      });
      function release(e) {
        delete pointers[e.pointerId];
        try { frame.releasePointerCapture(e.pointerId); } catch (er) {}
        var k = ids();
        if (k.length === 1) { var p = pointers[k[0]]; panX = p.x; panY = p.y; ox0 = ox; oy0 = oy; }
        pinchD = 0; pinchMid = null;
      }
      frame.addEventListener("pointerup", release);
      frame.addEventListener("pointercancel", release);
      // roda do mouse = zoom no cursor
      frame.addEventListener("wheel", function (e) {
        e.preventDefault(); rect = frame.getBoundingClientRect();
        var p = local(e); zoomAround(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
      }, { passive: false });

      // zoom por slider (em torno do centro) + botões − / +
      var zoom = el("input", { type: "range", min: "100", max: "500", value: "100", step: "1", class: "cropper__zoom", "aria-label": "Zoom" });
      function syncZoom() { zoom.value = String(Math.round(scale * 100)); }
      zoom.addEventListener("input", function () { zoomAround((+zoom.value) / 100, frameW / 2, frameH / 2); });
      var zOut = el("button", { class: "cropper__zbtn", type: "button", "aria-label": "Menos zoom" }, "−");
      var zIn = el("button", { class: "cropper__zbtn", type: "button", "aria-label": "Mais zoom" }, "+");
      zOut.addEventListener("click", function () { zoomAround(scale - 0.2, frameW / 2, frameH / 2); });
      zIn.addEventListener("click", function () { zoomAround(scale + 0.2, frameW / 2, frameH / 2); });

      var ref = ui.openModal({
        title: isSquare ? "Ajustar avatar" : "Enquadrar imagem", scrimClass: "scrim--centered",
        body: el("div", { class: "cropper" },
          el("div", { class: "cropper__stage" }, frame),
          el("div", { class: "cropper__ctrl" }, zOut, zoom, zIn),
          el("p", { class: "cropper__hint" }, "Arraste para posicionar · pinça, roda ou o controle para dar zoom." +
            (isSquare ? " O círculo mostra como o avatar fica no perfil." : ""))),
        actions: [
          ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
          ui.Button({ label: "Aplicar", variant: "primary", icon: "check", onClick: function () {
            paint();
            var cs = coverScale * scale;
            var sxr = -ox / cs, syr = -oy / cs, swr = frameW / cs, shr = frameH / cs;
            var outH = Math.round(outW / aspect);
            var cv = document.createElement("canvas"); cv.width = outW; cv.height = outH;
            try {
              cv.getContext("2d").drawImage(img, sxr, syr, swr, shr, 0, 0, outW, outH);
              var mime = App.util.canEncodeWebp() ? "image/webp" : "image/jpeg";  // WebP = menor
              cb(cv.toDataURL(mime, 0.86));
            } catch (er) { cb(src); }
            ref.close();
          } })
        ]
      });
    }
  }

  function ImagePicker(opts) {
    opts = opts || {};
    var value = opts.value || null;
    var aspect = opts.aspect || null;        // largura/altura: 1, 16/9, 9/16…
    var outW = opts.outW || 1080;

    var preview = el("button", { class: "upload__preview", type: "button", title: "Enviar / trocar imagem" });
    function paintPreview() {
      App.util.clear(preview);
      preview.classList.toggle("is-empty", !value);
      preview.style.backgroundImage = value ? "url(" + value + ")" : "";
      if (aspect) { preview.style.aspectRatio = String(aspect); preview.classList.add("upload__preview--frame"); }
      if (!value) preview.appendChild(el("span", { class: "upload__empty" }, App.icon("upload", { size: "lg" }), el("span", "Enviar imagem")));
      else preview.appendChild(el("span", { class: "upload__overlay" }, App.icon("upload", { size: "sm" }), el("span", "Trocar")));
    }
    paintPreview();
    preview.addEventListener("click", function () { file.click(); });   // toque no preview = enviar

    var file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
    var MAX = 3000000;
    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (f.size > MAX) { ui.toast("Arquivo muito grande (máx ~3MB)", "danger"); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var data = reader.result;
        // GIF mantém animação (não recorta); demais, se tem proporção, enquadra
        if (aspect && (f.type || "").indexOf("gif") < 0) openCropper(data, aspect, outW, setValue);
        else setValue(data);
      };
      reader.readAsDataURL(f);
      file.value = "";
    });

    var actions = el("div", { class: "u-row u-gap-2 u-wrap" });
    function paintActions() {
      App.util.clear(actions);
      actions.appendChild(ui.Button({ label: value ? "Trocar imagem" : "Enviar imagem", icon: "upload", size: "sm", variant: value ? "outline" : "primary", onClick: function () { file.click(); } }));
      if (aspect && value) actions.appendChild(ui.Button({ label: "Enquadrar", icon: "edit", size: "sm", variant: "outline", onClick: function () { openCropper(value, aspect, outW, setValue); } }));
      if (value && opts.removable !== false) actions.appendChild(ui.Button({ label: "Remover", icon: "trash", size: "sm", variant: "ghost", class: "btn--danger-ghost", onClick: function () { setValue(null); } }));
    }
    paintActions();

    function setValue(v) {
      value = v || null;
      paintPreview();
      paintActions();
      opts.onChange && opts.onChange(value);
    }

    var node = el("div", { class: "upload" }, preview,
      el("div", { class: "u-col u-gap-2 u-grow" },
        actions,
        el("span", { class: "field__hint" }, opts.hint || "PNG / JPG / GIF até ~3MB.")),
      file);

    return { node: node, getValue: function () { return value; }, setValue: setValue };
  }

  App.components.ImagePicker = ImagePicker;

  /* ============================================================
     Visualizador genérico (lightbox) — formato ORIGINAL da imagem.
     opts: { title, name, shape:"free"|"square", fit, pos }
     · "free" (padrão): imagem inteira, toque/click p/ ampliar (zoom).
     · "square": recorte quadrado (avatar) com object-fit cover + pos.
     ============================================================ */
  function openImageViewer(src, opts) {
    opts = opts || {};
    if (!src) return;
    var square = opts.shape === "square";
    var name = opts.name || ("oblivian-" + Date.now());

    // estados: carregando (spinner) → ok | erro
    var loader = el("div", { class: "imgview__loader", "aria-label": "Carregando" }, el("span", { class: "imgview__spin" }));
    var errBox = el("div", { class: "imgview__error" }, App.icon("alert", { size: "lg" }), el("span", "Não foi possível carregar a imagem."));
    errBox.style.display = "none";

    var stage, img;
    if (square) {
      img = el("img", { class: "imgview__sqimg", src: src, alt: "", draggable: "false" });
      if (opts.fit) img.style.objectFit = opts.fit;
      if (opts.pos) img.style.objectPosition = opts.pos;
      stage = el("div", { class: "imgview__square is-loading" }, img, loader, errBox);
    } else {
      img = el("img", { class: "imgview__img", src: src, alt: "", draggable: "false" });
      img.addEventListener("click", function () {   // toque/click amplia
        var on = img.classList.toggle("is-zoomed");
        stage.classList.toggle("is-zoomed", on);
      });
      stage = el("div", { class: "imgview__scroll is-loading" }, img, loader, errBox);
    }
    img.addEventListener("load", function () { stage.classList.remove("is-loading"); loader.style.display = "none"; });
    img.addEventListener("error", function () {
      stage.classList.remove("is-loading"); loader.style.display = "none";
      img.style.display = "none"; errBox.style.display = "";
    });

    // download com feedback (desabilita + spinner enquanto baixa)
    var dlBtn = ui.Button({ label: "Salvar", icon: "download", variant: "primary", onClick: function () {
      if (dlBtn.disabled) return;
      dlBtn.disabled = true; dlBtn.setLoading(true);
      try { App.util.downloadMedia(src, name); } catch (e) {}
      setTimeout(function () { dlBtn.disabled = false; dlBtn.setLoading(false); }, 1200);
    } });

    var actions = [ ui.Button({ label: "Fechar", variant: "ghost", onClick: function () { ref.close(); } }) ];
    // "Abrir original" só quando permitido (opts.allowOriginal) e há URL real
    if (opts.allowOriginal && opts.original) {
      actions.push(ui.Button({ label: "Abrir original", icon: "globe", variant: "outline", onClick: function () {
        try { window.open(opts.original, "_blank", "noopener"); } catch (e) {}
      } }));
    }
    actions.push(dlBtn);

    var ref = ui.openModal({
      title: opts.title || "Imagem", scrimClass: "scrim--centered scrim--imgview",
      body: el("div", { class: "imgview" + (square ? " imgview--square" : "") }, stage),
      actions: actions
    });
    return ref;
  }
  App.components.openImageViewer = openImageViewer;

  /* ============================================================
     Visualizador de AVATAR — quadrado, mantém o enquadramento do
     perfil, com botão Salvar em destaque e uma faixa de MOLDURAS.
     Tocar numa moldura abre a tela de compra (visual).
     opts: { src, name, pos }
     ============================================================ */
  function frameRing(value) {
    // anel colorido (cor sólida ou gradiente) ao redor de um avatar
    var ring = el("div", { class: "frame-ring" });
    ring.style.background = value || "var(--accent)";
    return ring;
  }

  function openFramePurchase(item, avatarSrc) {
    var preview = el("div", { class: "framebuy__preview" },
      frameRing(item.value),
      el("div", { class: "framebuy__av" }, avatarSrc
        ? el("img", { src: avatarSrc, alt: "" })
        : App.icon("profile", { size: "lg" })));

    var owned = !!(App.repo && App.repo.ownsItem && App.repo.ownsItem(item.id));
    var priceRow = el("div", { class: "framebuy__price" }, App.icon("coin", { size: "sm" }),
      el("strong", App.util.formatCount(item.price || 0)), el("span", { class: "u-muted" }, "moedas"));

    // Compra é só VISUAL por enquanto (sem cobrar moedas nem aplicar a moldura).
    var buyBtn = ui.Button({
      label: owned ? "Adquirida" : "Comprar", icon: owned ? "check" : "coin",
      variant: owned ? "outline" : "primary", disabled: owned,
      onClick: function () {
        if (owned) return;
        ui.toast("Molduras chegam em breve!", "ok");
        ref.close();
      }
    });

    var ref = ui.openModal({
      title: "Moldura", scrimClass: "scrim--centered",
      body: el("div", { class: "framebuy" },
        preview,
        el("div", { class: "framebuy__name" }, item.name || "Moldura"),
        item.rarity ? el("span", { class: "framebuy__rarity" }, item.rarity) : null,
        item.description ? el("p", { class: "framebuy__desc u-muted" }, item.description) : null,
        priceRow),
      actions: [
        ui.Button({ label: "Voltar", variant: "ghost", onClick: function () { ref.close(); } }),
        buyBtn
      ]
    });
    return ref;
  }
  App.components.openFramePurchase = openFramePurchase;

  // Visualizador de foto em tela cheia (estilo galeria nativa):
  // fundo preto, voltar (esq) + baixar (dir) no topo, imagem inteira centrada.
  function openAvatarViewer(opts) {
    opts = opts || {};
    var src = opts.src;
    if (!src) return openImageViewer(src, opts);   // sem foto: nada a mostrar

    var img = el("img", { class: "photoview__img", src: src, alt: opts.name || "", draggable: "false" });

    var backBtn = el("button", { class: "photoview__btn", type: "button", title: "Voltar", "aria-label": "Voltar" }, App.icon("back"));
    var dlBtn = el("button", { class: "photoview__btn", type: "button", title: "Baixar", "aria-label": "Baixar" }, App.icon("download"));
    dlBtn.addEventListener("click", function () {
      App.util.downloadMedia(src, opts.name ? "avatar-" + opts.name : ("avatar-" + Date.now()));
    });

    var stage = el("div", { class: "photoview__stage" }, img);
    var scrim = el("div", { class: "scrim photoview" },
      el("div", { class: "photoview__bar" }, backBtn, dlBtn), stage);

    var closing = false;
    var prevFocus = document.activeElement;
    function close() {
      if (closing) return; closing = true;
      if (App.sound) App.sound.play("close");
      document.removeEventListener("keydown", onKey);
      scrim.classList.add("is-closing");
      setTimeout(function () { scrim.remove(); }, 180);
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
      opts.onClose && opts.onClose();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    backBtn.addEventListener("click", close);
    // toque fora da imagem fecha
    scrim.addEventListener("mousedown", function (e) {
      if (e.target === scrim || e.target === stage) close();
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
    if (App.sound) App.sound.play("open");
    return { close: close, root: scrim };
  }
  App.components.openAvatarViewer = openAvatarViewer;
})(window.App = window.App || {});
