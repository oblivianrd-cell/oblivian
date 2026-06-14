/* ============================================================
   components/tagEditor.js — Editor de tags (chips adicionáveis/
   removíveis). Usado em perfis de comunidade e na criação de
   comunidades. Namespace: App.components.TagEditor
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.components = App.components || {};

  var CHARS = 20;   // limite de caracteres por tag

  function TagEditor(opts) {
    opts = opts || {};
    var tags = (opts.value || []).slice();
    var max = opts.max || 20;   // limite de tags
    // modo cor: se opts.colors vier (mesmo {}), cada chip vira clicável p/ escolher o #
    var colorMode = !!opts.colors;
    var colors = opts.colors ? Object.assign({}, opts.colors) : {};

    var suggestions = (opts.suggestions || []).slice();   // [{name, color}] — registro da comunidade
    var chips = el("div", { class: "u-row u-gap-2 u-wrap tageditor__chips" });
    var input = ui.Input({ placeholder: opts.placeholder || "Tag (máx " + CHARS + " caracteres)", maxlength: CHARS });
    var counter = el("span", { class: "tageditor__count u-muted" });
    var suggHost = el("div", { class: "tageditor__sugg" });

    function updateCount() {
      counter.textContent = opts.fullscreen
        ? tags.length + "/" + max
        : tags.length + "/" + max + " tags · " + (input.value || "").length + "/" + CHARS;
    }
    function paint() {
      App.util.clear(chips);
      if (!tags.length) { chips.appendChild(el("span", { class: "tageditor__empty u-muted" }, "Nenhuma tag ainda.")); return; }
      tags.forEach(function (t, i) {
        var cur = colors[t];   // cor custom escolhida (#) ou undefined → paleta por índice
        var chip = ui.Tag(t, { variant: "color", color: cur || undefined, colorIndex: i, onRemove: function () {
          tags = tags.filter(function (x) { return x !== t; });
          delete colors[t];
          paint(); updateCount(); paintSugg();
        } });
        if (colorMode) {
          chip.classList.add("tag--pickcolor");
          chip.title = "Clique para escolher a cor";
          chip.addEventListener("click", function (e) {
            if (e.target.closest(".tag__x")) return;   // o X cuida da remoção
            ui.pickColor(colors[t] || "", function (hex) {
              if (hex) colors[t] = hex; else delete colors[t];
              paint();
            }, { title: "Cor de “" + t + "”", allowClear: true });
          });
        }
        chips.appendChild(chip);
      });
    }
    // registro da comunidade: chips clicáveis que adicionam sem digitar
    function paintSugg() {
      App.util.clear(suggHost);
      var avail = suggestions.filter(function (s) { return tags.indexOf(s.name) < 0; });
      if (!avail.length) { suggHost.style.display = "none"; return; }
      suggHost.style.display = "";
      suggHost.appendChild(el("div", { class: "tageditor__suggtitle" }, opts.catalogTitle || "Tags da comunidade · toque para adicionar"));
      var row = el("div", { class: "tageditor__suggchips" });
      avail.forEach(function (s) {
        // chip "outline": borda na cor da tag, texto na cor da tag (igual à referência)
        var b = el("button", { class: "tageditor__suggchip", type: "button", title: "Adicionar “" + s.name + "”" },
          App.icon("plus", { size: "sm" }), el("span", s.name));
        if (s.color) { b.style.borderColor = s.color; b.style.color = s.color; }
        b.addEventListener("click", function () {
          if (tags.length >= max) { ui.toast("Máximo de " + max + " tags", "danger"); return; }
          if (tags.indexOf(s.name) >= 0) return;
          tags.push(s.name);
          if (colorMode && s.color) colors[s.name] = s.color;
          paint(); updateCount(); paintSugg();
        });
        row.appendChild(b);
      });
      suggHost.appendChild(row);
    }
    function add() {
      var v = input.value.trim().slice(0, CHARS);
      if (!v) return;
      if (tags.length >= max) { ui.toast("Máximo de " + max + " tags", "danger"); return; }
      if (v.length > CHARS) { ui.toast("Máx " + CHARS + " caracteres por tag", "danger"); return; }
      if (tags.indexOf(v) < 0) tags.push(v); else { ui.toast("Tag já adicionada", "danger"); }
      input.value = "";
      paint(); updateCount(); paintSugg();
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
    input.addEventListener("input", updateCount);

    var node;
    if (opts.fullscreen) {
      // layout tela cheia (igual à referência): seção do membro + tracejado + catálogo
      var addRow = el("div", { class: "u-row u-gap-2 tageditor__add", style: { display: "none" } },
        el("div", { class: "u-grow" }, input),
        ui.Button({ label: "Adicionar", icon: "plus", size: "sm", variant: "primary", onClick: add }));
      var dashed = el("button", { class: "tageditor__dashed", type: "button" }, App.icon("plus", { size: "sm" }), el("span", opts.addLabel || "Adicionar uma nova tag"));
      dashed.addEventListener("click", function () {
        var open = addRow.style.display === "none";
        addRow.style.display = open ? "" : "none";
        if (open) setTimeout(function () { try { input.focus(); } catch (e) {} }, 0);
      });
      node = el("div", { class: "u-col u-gap-3 tageditor tageditor--full" },
        el("div", { class: "tageditor__sechead" },
          el("span", { class: "tageditor__seclabel" }, opts.sectionTitle || "Tags deste membro"),
          counter),
        chips,
        dashed, addRow,
        suggHost);
    } else {
      node = el("div", { class: "u-col u-gap-3 tageditor" }, chips,
        el("div", { class: "u-row u-gap-2 tageditor__add" }, el("div", { class: "u-grow" }, input),
          ui.Button({ label: "Adicionar", icon: "plus", size: "sm", variant: "primary", onClick: add })),
        counter, suggHost);
    }
    paint(); updateCount(); paintSugg();

    return {
      node: node,
      getValue: function () { return tags.slice(); },
      getColors: function () {   // só cores de tags ainda existentes
        var out = {};
        tags.forEach(function (t) { if (colors[t]) out[t] = colors[t]; });
        return out;
      },
      setSuggestions: function (arr) { suggestions = (arr || []).slice(); paintSugg(); }   // registro async da comunidade
    };
  }

  App.components.TagEditor = TagEditor;
})(window.App = window.App || {});
