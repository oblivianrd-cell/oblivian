/* ============================================================
   core/storage.js — Serviço de storage COMPARTILHADO (app + web).
   Centraliza as regras de upload de mídia: tipo permitido, limite
   de tamanho, compressão por destino, conversão, saneamento de
   nome, remoção de metadados e roteamento para a pasta correta.
   Reaproveita App.util.downscaleImage / isAllowedMedia (não duplica).
   Namespace: App.storage
   ============================================================ */
(function (App) {
  "use strict";
  var util = App.util;

  var MB = 1024 * 1024;
  var MAX_BYTES = 10 * MB;                 // imagem e GIF: 10 MB

  // tipos permitidos (extensão → mime). webm = animação grande.
  var ALLOWED = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", webm: "video/webm"
  };
  var ALLOWED_MIME = { "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1, "video/webm": 1 };

  // presets de compressão por destino. avatar = agressivo · banner = moderado · post = seguro.
  var PRESETS = {
    avatar:    { maxDim: 512,  quality: 0.72 },   // agressivo (foto pequena no perfil)
    banner:    { maxDim: 1280, quality: 0.82 },   // moderado
    profile:   { maxDim: 1024, quality: 0.80 },
    post:      { maxDim: 1600, quality: 0.86 },   // seguro (preserva qualidade)
    comment:   { maxDim: 1280, quality: 0.82 },
    chat:      { maxDim: 1600, quality: 0.85 },
    community: { maxDim: 1280, quality: 0.82 },
    temp:      { maxDim: 1600, quality: 0.85 },
    "default": { maxDim: 1600, quality: 0.85 }
  };

  // kind → pasta de storage (ver storage/README.md)
  var FOLDERS = {
    avatar: "storage/users/avatar",
    banner: "storage/users/banner",
    profile: "storage/users/profile",
    post: "storage/posts",
    comment: "storage/comments",
    chat: "storage/chats",
    community: "storage/communities",
    temp: "storage/temp"
  };

  function extOf(file) {
    var name = (file && file.name) || "";
    var m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  }
  function folderFor(kind) { return FOLDERS[kind] || FOLDERS.post; }
  function presetFor(kind) { return PRESETS[kind] || PRESETS["default"]; }

  /* nome de arquivo seguro: minúsculo, só [a-z0-9-_], sem espaços/acentos,
     extensão validada. Evita path traversal e nomes hostis. */
  function safeName(name, ext) {
    var base = String(name || "file").toLowerCase();
    if (base.normalize) base = base.normalize("NFD").replace(/[̀-ͯ]/g, "");  // tira acentos
    base = base.replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "file";
    ext = String(ext || "").toLowerCase().replace(/[^a-z0-9]/g, "") || "webp";
    return base + "." + ext;
  }

  /* valida tipo + tamanho. Retorna { ok, reason }. */
  function validate(file) {
    if (!file) return { ok: false, reason: "Nenhum arquivo." };
    var mime = file.type || "";
    var ext = extOf(file);
    var typeOk = ALLOWED_MIME[mime] || (ext && ALLOWED[ext]);
    if (!typeOk) return { ok: false, reason: "Tipo não permitido. Use JPG, PNG, WebP, GIF ou WebM." };
    if (file.size > MAX_BYTES) return { ok: false, reason: "Arquivo muito grande (máx. 10 MB)." };
    return { ok: true };
  }

  function isGif(file) { return (file && file.type) === "image/gif" || extOf(file) === "gif"; }
  function isWebm(file) { return (file && file.type) === "video/webm" || extOf(file) === "webm"; }

  /* Conversão. Estáticas (jpg/png) → WebP via downscaleImage (já remove EXIF).
     GIF animado: WebP/WebM animado NÃO é gerável por <canvas> no cliente sem
     libs pesadas; mantemos o GIF (preserva animação) e marcamos para conversão
     server-side opcional (App.config.storage.gifConvertEndpoint). WebM passa direto. */
  function processUpload(file, opts) {
    opts = opts || {};
    var kind = opts.kind || "post";
    var v = validate(file);
    if (!v.ok) return Promise.reject(new Error(v.reason));

    var preset = presetFor(kind);
    var sizeBefore = file.size;
    var gif = isGif(file), webm = isWebm(file);

    function meta(dataUrl, outExt, note) {
      var sizeAfter = dataUrlBytes(dataUrl, file.size);
      return {
        dataUrl: dataUrl,
        kind: kind,
        folder: folderFor(kind),
        filename: safeName(opts.name || (file.name || kind), outExt),
        ext: outExt,
        mime: ALLOWED[outExt] || ("image/" + outExt),
        bytesBefore: sizeBefore,
        bytesAfter: sizeAfter,
        saved: Math.max(0, sizeBefore - sizeAfter),
        savedPct: sizeBefore ? Math.round((1 - sizeAfter / sizeBefore) * 100) : 0,
        metadataStripped: !gif && !webm,   // canvas re-encode remove EXIF
        animated: gif || webm,
        note: note || "",
        createdAt: Date.now()
      };
    }

    if (webm) {
      // animação grande: passa direto (sem re-encode no cliente)
      return readDataUrl(file).then(function (d) { return meta(d, "webm", "WebM mantido (sem re-encode no cliente)."); });
    }
    if (gif) {
      var ep = (App.config && App.config.storage && App.config.storage.gifConvertEndpoint) || null;
      return readDataUrl(file).then(function (d) {
        // GIF animado: mantém. Conversão real p/ WebP/WebM é server-side (endpoint opcional).
        return meta(d, "gif", ep ? "GIF mantido; conversão p/ WebP/WebM disponível via servidor." : "GIF mantido (anima); conversão p/ WebP/WebM requer servidor.");
      });
    }
    // estáticas: comprime + re-encoda WebP (fallback JPEG), remove EXIF
    var outExt = util.canEncodeWebp() ? "webp" : "jpg";
    return util.downscaleImage(file, { maxDim: preset.maxDim, quality: preset.quality, mime: "image/webp" })
      .then(function (dataUrl) { return meta(dataUrl, outExt, "Comprimido (" + kind + ") + EXIF removido."); });
  }

  function readDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(r.error || new Error("falha ao ler")); };
      r.onload = function () { resolve(r.result); };
      r.readAsDataURL(file);
    });
  }
  // estimativa de bytes de um dataURL (base64 → ~3/4)
  function dataUrlBytes(dataUrl, fallback) {
    var i = String(dataUrl || "").indexOf(",");
    if (i < 0) return fallback || 0;
    var b64 = dataUrl.slice(i + 1);
    return Math.round(b64.length * 0.75);
  }

  /* Fluxo de upload de ponta a ponta (8 passos do briefing):
     1 seleciona → 2 valida tipo → 3 valida 10MB → 4 comprime →
     5 converte se preciso → 6 sobe na pasta certa → 7 salva metadados →
     8 devolve a imagem final. `uploader` opcional (file/blob → URL real);
     sem ele, devolve o dataURL inline (modo atual do app). */
  function upload(file, opts) {
    opts = opts || {};
    return processUpload(file, opts).then(function (m) {
      if (typeof opts.uploader === "function") {
        return Promise.resolve(opts.uploader(m)).then(function (url) {
          m.url = url || m.dataUrl; return m;
        });
      }
      m.url = m.dataUrl;   // app atual: embute inline (sem storage externo)
      return m;
    });
  }

  App.storage = {
    MAX_BYTES: MAX_BYTES, ALLOWED: ALLOWED, PRESETS: PRESETS, FOLDERS: FOLDERS,
    validate: validate, safeName: safeName, folderFor: folderFor, presetFor: presetFor,
    extOf: extOf, isGif: isGif, isWebm: isWebm,
    processUpload: processUpload, upload: upload
  };
})(window.App = window.App || {});
