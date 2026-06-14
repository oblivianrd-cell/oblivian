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
  // (avatar exibido ~96px no app → 256px sobra; corta MUITO o peso)
  var PRESETS = {
    avatar:    { maxDim: 256,  quality: 0.70 },   // agressivo (foto pequena no perfil)
    banner:    { maxDim: 1280, quality: 0.80 },   // moderado
    profile:   { maxDim: 1024, quality: 0.78 },
    post:      { maxDim: 1600, quality: 0.82 },   // seguro (preserva qualidade)
    comment:   { maxDim: 1280, quality: 0.80 },
    chat:      { maxDim: 1600, quality: 0.82 },
    community: { maxDim: 1280, quality: 0.80 },
    temp:      { maxDim: 1600, quality: 0.82 },
    "default": { maxDim: 1600, quality: 0.82 }
  };
  var THUMB = { maxDim: 320, quality: 0.62 };     // miniatura p/ feeds/listas

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

  /* AVIF encoda menor que WebP (~20-30%). Nem todo browser ENCODA via canvas
     (só decodifica) → detecta de verdade e cacheia. Fallback WebP → JPEG. */
  var _avif = null;
  function canEncodeAvif() {
    if (_avif !== null) return _avif;
    _avif = false;
    if (typeof document === "undefined") return false;
    try {
      var c = document.createElement("canvas"); c.width = c.height = 1;
      _avif = c.toDataURL("image/avif").lastIndexOf("data:image/avif", 0) === 0;
    } catch (e) {}
    return _avif;
  }
  // melhor formato de saída suportado p/ estáticas
  function bestMime() {
    if (canEncodeAvif()) return { mime: "image/avif", ext: "avif" };
    if (util.canEncodeWebp()) return { mime: "image/webp", ext: "webp" };
    return { mime: "image/jpeg", ext: "jpg" };
  }

  /* Re-encoda SEMPRE (mesmo webp/png de entrada) redimensionando p/ maxDim e
     trocando p/ o melhor formato. Conserta o vazamento do passthrough: um webp
     4000px de entrada saía intacto. Remove EXIF (canvas). Retorna Promise<dataURL>. */
  function reencode(dataUrl, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 1600, quality = opts.quality || 0.82;
    var target = opts.mime || bestMime().mime;
    return new Promise(function (resolve) {
      if (typeof Image === "undefined" || typeof document === "undefined") { resolve(dataUrl); return; }
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        try {
          var c = document.createElement("canvas"); c.width = cw; c.height = ch;
          c.getContext("2d").drawImage(img, 0, 0, cw, ch);
          var out = c.toDataURL(target, quality);
          if (out.lastIndexOf("data:" + target, 0) !== 0) out = c.toDataURL("image/webp", quality);
          if (out.lastIndexOf("data:image/webp", 0) !== 0) out = c.toDataURL("image/jpeg", quality);
          // se ficou MAIOR que a entrada (raro p/ PNG já pequeno), mantém a entrada
          resolve(out.length < dataUrl.length ? out : dataUrl);
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  /* miniatura leve p/ feeds/listas (não baixa a imagem cheia na rolagem) */
  function thumbnail(dataUrl) { return reencode(dataUrl, { maxDim: THUMB.maxDim, quality: THUMB.quality, mime: bestMime().mime }); }

  /* hash de conteúdo (FNV-1a 32b, hex) p/ DEDUP: mesma imagem → mesma chave,
     guarda uma vez só. Rápido, sem libs. Não é cripto. */
  function hashId(str) {
    str = String(str || "");
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }

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

    function meta(dataUrl, outExt, note, thumbUrl) {
      var sizeAfter = dataUrlBytes(dataUrl, file.size);
      return {
        dataUrl: dataUrl,
        thumbUrl: thumbUrl || null,        // miniatura p/ feeds (null em gif/webm)
        id: hashId(dataUrl),               // chave de DEDUP (conteúdo igual → mesma chave)
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
    // estáticas: SEMPRE redimensiona+re-encoda (melhor formato: AVIF→WebP→JPEG),
    // remove EXIF, e gera miniatura. Conserta o passthrough de webp/png grande.
    var best = bestMime(), outExt = best.ext;
    return readDataUrl(file).then(function (raw) {
      return reencode(raw, { maxDim: preset.maxDim, quality: preset.quality, mime: best.mime }).then(function (full) {
        if (opts.thumb === false) return meta(full, outExt, "Comprimido " + outExt.toUpperCase() + " (" + kind + ") + EXIF removido.");
        return thumbnail(full).then(function (th) {
          return meta(full, outExt, "Comprimido " + outExt.toUpperCase() + " (" + kind + ") + miniatura + EXIF removido.", th);
        });
      });
    });
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
      var uploader = opts.uploader || (r2Configured() ? r2Upload : null);
      if (typeof uploader === "function") {
        return Promise.resolve(uploader(m))
          .then(function (url) { m.url = url || m.dataUrl; return m; })
          .catch(function () { m.url = m.dataUrl; return m; });
      }
      m.url = m.dataUrl;
      return m;
    });
  }

  function r2Configured() { var r = App.config && App.config.r2; return !!(r && r.uploadEndpoint && r.uploadEndpoint.indexOf("SEU-WORKER") < 0); }
  function dataUrlToBlob(d) { var i = String(d||"").indexOf(","); var head=d.slice(0,i), b64=d.slice(i+1); var mime=(head.match(/data:([^;]+)/)||[])[1]||"application/octet-stream"; var bin=atob(b64), arr=new Uint8Array(bin.length); for(var j=0;j<bin.length;j++)arr[j]=bin.charCodeAt(j); return new Blob([arr],{type:mime}); }
  function r2Upload(m) { var ep=App.config.r2.uploadEndpoint; var blob=dataUrlToBlob(m.dataUrl); var tokP=(App.repo&&App.repo.getAccessToken)?App.repo.getAccessToken():Promise.resolve(null); return tokP.then(function(tok){ var headers={"x-kind":m.kind,"x-mime":m.mime}; if(tok)headers.authorization="Bearer "+tok; return fetch(ep,{method:"POST",headers:headers,body:blob}).then(function(r){if(!r.ok)throw new Error("upload "+r.status);return r.json();}).then(function(j){return j.url;}); }); }

  App.storage = {
    MAX_BYTES: MAX_BYTES, ALLOWED: ALLOWED, PRESETS: PRESETS, FOLDERS: FOLDERS, THUMB: THUMB,
    validate: validate, safeName: safeName, folderFor: folderFor, presetFor: presetFor,
    extOf: extOf, isGif: isGif, isWebm: isWebm,
    canEncodeAvif: canEncodeAvif, bestMime: bestMime, reencode: reencode,
    thumbnail: thumbnail, hashId: hashId,
    processUpload: processUpload, upload: upload
  };
})(window.App = window.App || {});
