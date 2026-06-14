/* ============================================================
   screens/createCommunity.js — Criação de comunidade (tela imersiva).
   Fluxo: preenche identidade/aparência → botão "Pré-visualizar" abre
   um TEMPLATE fiel (Sobre → revela layout + rodapé). A comunidade só é
   CRIADA ao CONFIRMAR no template (rascunho não persiste: fechou, perdeu).
   Mínimo p/ criar: foto do ícone (o resto usa padrão/paleta).
   Rota: /criar   Namespace: App.screens.createCommunity
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  var PALETTE = ["#7c59ec", "#ff5fa2", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7"];

  function render() {
    // retornou de uma pré-visualização ("Voltar a editar") → repopula o formulário
    var pre = (App.preview && App.preview.payload) ? App.preview.consumePayload() : null;
    var accent = (pre && pre.theme && pre.theme.accent) || "#7c59ec";
    var visibility = (pre && pre.settings && pre.settings.visibility) || "public";
    var root = null;

    var name = ui.Input({ placeholder: "Nome da comunidade", maxlength: 40 });
    if (pre && pre.name && pre.name !== "Nova comunidade") name.value = pre.name;
    var desc = ui.Textarea({ placeholder: "Sobre o que é a comunidade?", maxlength: 280 });
    if (pre && pre.description) desc.value = pre.description;
    var icon = C.ImagePicker({ value: (pre && pre.icon) || null, hint: "Ícone (quadrado) — OBRIGATÓRIO. PNG/JPG/GIF.", onChange: syncAccent });
    var cover = C.ImagePicker({ value: (pre && pre.cover) || null, hint: "Capa/fundo (opcional).", onChange: function () {} });
    var tags = C.TagEditor({ value: (pre && pre.tags) || [], placeholder: "Categoria (ex.: Anime, Games...)" });

    function syncAccent() {
      if (!root) return;
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-2", App.store.color.shade(accent, 25));
    }

    /* ---------- cor de destaque ---------- */
    var swatchBox = el("div", { class: "swatches" });
    PALETTE.forEach(function (hex) {
      var s = el("button", { class: "swatch" + (hex === accent ? " is-active" : ""), type: "button", style: { background: hex } });
      s.addEventListener("click", function () {
        accent = hex;
        App.util.qsa(".swatch", swatchBox).forEach(function (x) { x.classList.remove("is-active"); });
        s.classList.add("is-active");
        syncAccent();
      });
      swatchBox.appendChild(s);
    });
    var visSeg = ui.Segmented([{ value: "public", label: "Pública" }, { value: "private", label: "Privada" }], visibility, function (v) { visibility = v; });

    function group(title) {
      var rows = Array.prototype.slice.call(arguments, 1);
      var card = el("div", { class: "cset-card cc-section" });
      rows.forEach(function (r) { if (r) card.appendChild(r); });
      return el("section", { class: "cset-group" },
        el("div", { class: "cset-group__title" }, title), card);
    }
    function cancel() { if (App.preview) App.preview.clear(); App.router.navigate("/sanguao"); }

    /* ---------- pré-visualização REAL: monta a comunidade virtual e abre a TELA real ----------
       Nada é gravado: App.preview intercepta o repo até o usuário confirmar (barra flutuante). */
    function openPreview() {
      if (!icon.getValue()) { ui.toast("Adicione a foto do ícone (obrigatório).", "danger"); return; }
      var nameErr = App.search.validateCommunityName((name.value || "").trim());
      if (nameErr) { ui.toast(nameErr, "danger"); name.focus(); return; }
      var payload = {
        name: (name.value || "").trim() || "Nova comunidade",
        description: (desc.value || "").trim(),
        icon: icon.getValue(), cover: cover.getValue(),
        tags: tags.getValue(), theme: { accent: accent }, settings: { visibility: visibility }
      };
      App.repo.getCurrentUser().then(function (me) {
        if (!me) { ui.toast("Faça login para pré-visualizar.", "danger"); return; }
        var community = App.preview.buildCommunity(payload, me);
        App.preview.start(payload, community, me);
        App.router.navigate("/c/" + App.preview.id + "/featured?preview=1");
      });
    }

    /* ---------- montagem ---------- */
    var header = el("div", { class: "cset-header" },
      ui.IconButton("back", { title: "Voltar", onClick: cancel }),
      el("div", { class: "u-grow" }, el("div", { class: "cset-header__title" }, "Criar comunidade")),
      ui.IconButton("eye", { title: "Pré-visualizar", onClick: openPreview }));

    var scroll = el("div", { class: "cset-scroll cc-scroll" },
      group("Identidade", ui.Field("Nome", name), ui.Field("Descrição (Sobre)", desc)),
      group("Aparência",
        ui.Field("Cor de destaque", swatchBox),
        el("div", { class: "cc-media" }, ui.Field("Ícone *", icon.node), ui.Field("Capa", cover.node))),
      group("Descoberta", ui.Field("Tags", tags.node), ui.Field("Visibilidade", visSeg)));

    var footer = el("div", { class: "cc-footer" },
      ui.Button({ label: "Cancelar", variant: "ghost", onClick: cancel }),
      ui.Button({ label: "Pré-visualizar comunidade", icon: "eye", variant: "primary", onClick: openPreview }));

    var body = el("div", { class: "cset-body" }, header, scroll, footer);
    root = el("div", { class: "cset cset--chat cc-create" }, body);

    var inner = el("div", { class: "view__inner view__inner--flush" }, root);
    syncAccent();
    return { node: inner, active: "sanguao", title: "Criar comunidade", immersive: true, flush: true };
  }

  App.screens.createCommunity = render;
})(window.App = window.App || {});
