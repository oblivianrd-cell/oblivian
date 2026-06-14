/* ============================================================
   core/util.js — Helpers de DOM e formatação.
   Namespace: App.util
   ============================================================ */
(function (App) {
  "use strict";

  function appendChildren(node, children) {
    children.forEach(function (child) {
      if (child == null || child === false) return;
      if (typeof child === "function") return; // nunca renderiza código-fonte de função como texto
      if (Array.isArray(child)) return appendChildren(node, child);
      if (child instanceof Node) return node.appendChild(child);
      node.appendChild(document.createTextNode(String(child)));
    });
  }

  /* Criador de elementos: el('div', {class:'x', onClick:fn}, child, child...) */
  function el(tag, props) {
    var node = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props && (props instanceof Node || typeof props === "string" || Array.isArray(props))) {
      children.unshift(props);
      props = null;
    }
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null) return;
        if (k === "class" || k === "className") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k.slice(0, 2) === "on" && typeof v === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === "for") node.setAttribute("for", v);
        else node.setAttribute(k, v);
      });
    }
    appendChildren(node, children);
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function mount(parent, node) { clear(parent); if (node) appendChildren(parent, [node]); return parent; }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0); }).join("").toUpperCase() || "?";
  }

  function formatCount(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(n);
    if (n < 1000000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0).replace(/\.0$/, "") + "k";
    return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }

  function timeAgo(ts) {
    var diff = Math.max(0, Date.now() - ts);
    var s = Math.floor(diff / 1000);
    if (s < 60) return "agora";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " h";
    var d = Math.floor(h / 24);
    if (d < 7) return d + " d";
    var w = Math.floor(d / 7);
    if (w < 5) return w + " sem";
    var mo = Math.floor(d / 30);
    if (mo < 12) return mo + " mês" + (mo > 1 ? "es" : "");
    return Math.floor(d / 365) + " a";
  }

  function clockTime(ts) {
    var dt = new Date(ts);
    return ("0" + dt.getHours()).slice(-2) + ":" + ("0" + dt.getMinutes()).slice(-2);
  }

  function dayLabel(ts) {
    var dt = new Date(ts);
    var today = new Date();
    var yest = new Date(); yest.setDate(today.getDate() - 1);
    function same(a, b) { return a.toDateString() === b.toDateString(); }
    if (same(dt, today)) return "Hoje";
    if (same(dt, yest)) return "Ontem";
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  }

  function fullDate(ts) {
    return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  }

  /* duração legível a partir de milissegundos */
  function humanDuration(ms) {
    if (ms == null) return "permanente";
    var d = Math.round(ms / 86400000);
    if (d % 365 === 0 && d >= 365) return (d / 365) + " ano(s)";
    if (d % 30 === 0 && d >= 30) return (d / 30) + " mês(es)";
    if (d % 7 === 0 && d >= 7) return (d / 7) + " semana(s)";
    return d + " dia(s)";
  }

  /* true se o navegador sabe ENCODAR webp via canvas (Safari < 16 não sabe). */
  function canEncodeWebp() {
    if (typeof document === "undefined") return false;
    try {
      var c = document.createElement("canvas"); c.width = c.height = 1;
      return c.toDataURL("image/webp").lastIndexOf("data:image/webp", 0) === 0;
    } catch (e) { return false; }
  }

  /* só imagem ou GIF (rejeita vídeo e qualquer outro tipo) */
  function isAllowedMedia(file) {
    var t = (file && file.type) || "";
    return t === "image/png" || t === "image/jpeg" || t === "image/webp" || t === "image/gif";
  }

  /* Lê uma imagem, reduz (canvas) e RE-ENCODA em WebP p/ ocupar menos
     (fallback JPEG onde não há encode webp). GIF mantém original (preserva
     animação); webp de entrada passa direto. Retorna Promise<dataURL>. */
  function downscaleImage(file, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 1280, quality = opts.quality || 0.82;
    var mime = opts.mime || "image/webp";
    if (mime === "image/webp" && !canEncodeWebp()) mime = "image/jpeg";
    return new Promise(function (resolve, reject) {
      if (typeof FileReader === "undefined") { reject(new Error("sem FileReader")); return; }
      var ftype = (file && file.type) || "";
      var rd = new FileReader();
      rd.onerror = function () { reject(rd.error || new Error("falha ao ler")); };
      rd.onload = function () {
        var dataUrl = rd.result;
        // GIF (animação) e webp já pronto: não re-encoda. Sem canvas: passthrough.
        if (ftype === "image/gif" || ftype === "image/webp" || typeof Image === "undefined" || typeof document === "undefined") { resolve(dataUrl); return; }
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          try {
            var c = document.createElement("canvas"); c.width = cw; c.height = ch;
            c.getContext("2d").drawImage(img, 0, 0, cw, ch);
            var out = c.toDataURL(mime, quality);
            // navegador devolveu outro formato (não suporta o mime pedido) → tenta jpeg
            if (out.lastIndexOf("data:" + mime, 0) !== 0) out = c.toDataURL("image/jpeg", quality);
            resolve(out);
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      };
      rd.readAsDataURL(file);
    });
  }

  /* Baixa uma mídia. Imagens (webp/png/jpeg) saem como PNG universal
     (re-encoda no canvas); GIF baixa o original (preserva animação).
     src = dataURL ou URL. */
  function downloadMedia(src, baseName) {
    baseName = baseName || "oblivian-img";
    function trigger(href, name, revoke) {
      var a = document.createElement("a"); a.href = href; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      if (revoke) setTimeout(function () { try { URL.revokeObjectURL(href); } catch (e) {} }, 4000);
    }
    var isGif = /^data:image\/gif/i.test(src) || /\.gif($|\?)/i.test(src);
    if (isGif || typeof document === "undefined") { trigger(src, baseName + (isGif ? ".gif" : "")); return; }
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      try {
        var c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        if (c.toBlob) c.toBlob(function (b) {
          if (!b) { trigger(c.toDataURL("image/png"), baseName + ".png"); return; }
          trigger(URL.createObjectURL(b), baseName + ".png", true);
        }, "image/png");
        else trigger(c.toDataURL("image/png"), baseName + ".png");
      } catch (e) { trigger(src, baseName); }   // CORS taint → baixa o original
    };
    img.onerror = function () { trigger(src, baseName); };
    img.src = src;
  }

  App.util = {
    el: el, clear: clear, mount: mount, qs: qs, qsa: qsa,
    escapeHtml: escapeHtml, uid: uid, initials: initials,
    formatCount: formatCount, timeAgo: timeAgo, clockTime: clockTime,
    dayLabel: dayLabel, fullDate: fullDate, debounce: debounce, humanDuration: humanDuration,
    appendChildren: appendChildren, downscaleImage: downscaleImage,
    canEncodeWebp: canEncodeWebp, isAllowedMedia: isAllowedMedia, downloadMedia: downloadMedia
  };
})(window.App = window.App || {});
