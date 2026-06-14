/* ============================================================
   core/markup.js — Marcação leve de texto (estilo BBCode).
   Tags pareadas (letras combináveis num só colchete):
     B negrito · I itálico · U sublinhado · S tachado · C centralizar
     ex.: [CB]...[/CB] = centralizado + negrito
   Links: [Rótulo|url]  ·  URLs cruas (http/https)  ·  @menções
   Uso: App.markup.render(texto) -> DocumentFragment
        App.markup.toHTMLNode(texto) -> <span> já preenchido
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el;

  var OPEN = /^\[([BIUSC]+)\]/i;
  var CLOSE = /^\[\/([BIUSC]+)\]/i;

  // monta um nó aplicando todas as letras de formatação de uma vez
  function fmtNode(letters) {
    letters = letters.toUpperCase();
    var span = el("span", { class: "mk-fmt" });
    var deco = [];
    if (letters.indexOf("B") >= 0) span.style.fontWeight = "700";
    if (letters.indexOf("I") >= 0) span.style.fontStyle = "italic";
    if (letters.indexOf("U") >= 0) deco.push("underline");
    if (letters.indexOf("S") >= 0) deco.push("line-through");
    if (deco.length) span.style.textDecoration = deco.join(" ");
    if (letters.indexOf("C") >= 0) { span.style.display = "block"; span.style.textAlign = "center"; }
    return span;
  }

  function linkEl(label, url) {
    url = String(url || "").trim();
    if (/^#/.test(url)) return el("a", { class: "mk-link", href: url }, label);
    if (/^mailto:/i.test(url)) return el("a", { class: "mk-link", href: url }, label);
    var safe = /^https?:\/\//i.test(url) ? url : ("https://" + url);
    return el("a", { class: "mk-link", href: safe, target: "_blank", rel: "noopener noreferrer" }, label);
  }

  // realça @menções dentro de um trecho de texto puro
  function appendText(parent, str) {
    var re = /(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_.]+)/g, last = 0, m;
    while ((m = re.exec(str)) !== null) {
      var at = m.index + m[1].length;            // posição do '@'
      if (at > last) parent.appendChild(document.createTextNode(str.slice(last, at)));
      parent.appendChild(el("span", { class: "mk-mention" }, "@" + m[2]));
      last = at + 1 + m[2].length;
    }
    if (last < str.length) parent.appendChild(document.createTextNode(str.slice(last)));
  }

  // imagem inline por código curto: [IMG|código]
  // resolve a fonte em 3 níveis: 1) mapa de mídia do próprio post (payload.media),
  // 2) dataURL embutido direto no código (legado cross-user), 3) App.repo.getImage (código antigo).
  function imgEl(code, media) {
    code = String(code == null ? "" : code).trim();
    var src = null;
    if (media && Object.prototype.hasOwnProperty.call(media, code)) src = media[code];
    if (!src && code.indexOf("data:") === 0) src = code;
    if (!src && App.repo && App.repo.getImage) src = App.repo.getImage(code);
    if (!src) return document.createTextNode("");
    return el("img", { class: "mk-img", src: src, alt: "", loading: "lazy" });
  }

  // dentro de um trecho: [IMG|código], links [rótulo|url] e URLs cruas; resto -> appendText
  function appendInline(parent, str, media) {
    var re = /\[([^\]|[]+)\|([^\]]+)\]|(https?:\/\/[^\s]+)/g, last = 0, m;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) appendText(parent, str.slice(last, m.index));
      if (m[1] != null) {
        if (m[1].toUpperCase() === "IMG") parent.appendChild(imgEl(m[2], media));
        else parent.appendChild(linkEl(m[1], m[2]));
      } else parent.appendChild(linkEl(m[3], m[3]));
      last = re.lastIndex;
    }
    if (last < str.length) appendText(parent, str.slice(last));
  }

  // varredura com pilha p/ tags pareadas; texto entre tags passa por appendInline.
  // opts.media: mapa { código -> dataURL } do post (resolve [IMG|n] curto).
  function render(text, opts) {
    text = String(text == null ? "" : text);
    var media = (opts && opts.media) || null;
    var frag = document.createDocumentFragment();
    var stack = [frag];
    var i = 0, buf = "";
    function flush() { if (buf) { appendInline(stack[stack.length - 1], buf, media); buf = ""; } }
    while (i < text.length) {
      if (text.charCodeAt(i) === 91 /* [ */) {
        var rest = text.slice(i, i + 12);
        var mo = rest.match(OPEN), mc = rest.match(CLOSE);
        if (mo) { flush(); var node = fmtNode(mo[1]); stack[stack.length - 1].appendChild(node); stack.push(node); i += mo[0].length; continue; }
        if (mc) { flush(); if (stack.length > 1) stack.pop(); i += mc[0].length; continue; }
      }
      buf += text[i]; i++;
    }
    flush();
    return frag;
  }

  function toHTMLNode(text, cls, opts) {
    var span = el("span", cls ? { class: cls } : null);
    span.appendChild(render(text, opts));
    return span;
  }

  App.markup = { render: render, toHTMLNode: toHTMLNode };
})(window.App = window.App || {});
