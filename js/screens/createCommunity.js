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

  // 13 cores + o lápis (personalizada) = 14 itens → 7 por linha, duas linhas iguais.
  // As 5 últimas preenchem vãos de matiz que faltavam (ciano, lima, laranja,
  // índigo) e um neutro, p/ comunidade que não quer cor saturada.
  var PALETTE = [
    "#3f3f46", "#ff5fa2", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#14b8a6",
    "#a855f7", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#64748b"
  ];

  function render() {
    // retornou de uma pré-visualização ("Voltar a editar") → repopula o formulário
    var pre = (App.preview && App.preview.payload) ? App.preview.consumePayload() : null;
    var accent = (pre && pre.theme && pre.theme.accent) || "#3f3f46";
    var visibility = (pre && pre.settings && pre.settings.visibility) || "public";
    var root = null;

    var name = ui.Input({ placeholder: "Nome da comunidade", maxlength: 40 });
    if (pre && pre.name && pre.name !== "Nova comunidade") name.value = pre.name;
    // Editor rico (negrito/itálico/sublinhado/tachado/link + expandir), o MESMO
    // App.components.richText usado na descrição em Configurações da comunidade e
    // na bio do perfil. noImage: a descrição vira slogan no "Sobre" e imagem em
    // base64 ali só engordaria a linha da comunidade.
    var descEd = App.components.richText((pre && pre.description) || "", {
      fullTitle: "Descrição",
      placeholder: "Conte sobre a comunidade. Use negrito, itálico e links.",
      noImage: true
    });
    // hint:"" omite a legenda — o "*" no rótulo já sinaliza obrigatório e o
    // seletor de arquivo já filtra os formatos.
    var icon = C.ImagePicker({ value: (pre && pre.icon) || null, hint: "", onChange: syncAccent });
    var cover = C.ImagePicker({ value: (pre && pre.cover) || null, hint: "", onChange: function () {} });
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
    // lápis = cor personalizada. Mesmo padrão de settings.js (ui.pickColor):
    // a cor escolhida entra no swatch e vira a ativa.
    var customSw = el("button", { class: "swatch swatch--custom", type: "button", title: "Cor personalizada" }, App.icon("edit", { size: "sm" }));
    customSw.addEventListener("click", function () {
      ui.pickColor(accent, function (hex) {
        if (!hex) return;
        accent = hex;
        App.util.qsa(".swatch", swatchBox).forEach(function (x) { x.classList.remove("is-active"); });
        customSw.classList.add("is-active");
        customSw.style.background = hex;
        syncAccent();
      }, { title: "Cor de destaque", allowClear: false });
    });
    swatchBox.appendChild(customSw);
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
        description: (descEd.getValue() || "").trim(),
        icon: icon.getValue(), cover: cover.getValue(),
        tags: tags.getValue(), theme: { accent: accent }, settings: { visibility: visibility }
      };
      App.repo.getCurrentUser().then(function (me) {
        if (!me) { ui.toast("Faça login para pré-visualizar.", "danger"); return; }
        var community = App.preview.buildCommunity(payload, me);
        App.preview.start(payload, community, me);
        // abre no "Sobre a comunidade" (rota /c/<id>, sem sufixo): mostra ícone,
        // capa, nome e descrição — o que o usuário acabou de preencher.
        // Antes ia pro /featured, que numa comunidade nova está sempre vazio.
        App.router.navigate("/c/" + App.preview.id + "?preview=1");
      });
    }

    /* ---------- montagem ---------- */
    var header = el("div", { class: "cset-header" },
      ui.IconButton("back", { title: "Voltar", onClick: cancel }),
      el("div", { class: "u-grow" }, el("div", { class: "cset-header__title" }, "Criar comunidade")),
      ui.IconButton("eye", { title: "Pré-visualizar", onClick: openPreview }));

    var scroll = el("div", { class: "cset-scroll cc-scroll" },
      // Visibilidade vive em Identidade: pública/privada é o que a comunidade É,
      // e a pessoa decide isso junto com o nome — não no fim do formulário.
      group("Identidade", ui.Field("Nome", name), ui.Field("Visibilidade", visSeg)),
      // Descrição em seção PRÓPRIA: com a barra de formatação e o botão de
      // expandir, ela é alta demais p/ dividir card com Nome e Visibilidade.
      group("Descrição", descEd.node),
      group("Aparência",
        el("div", { class: "cc-media" }, ui.Field("Ícone *", icon.node), ui.Field("Capa", cover.node)),
        ui.Field("Cor de destaque", swatchBox)),
      group("Descoberta", ui.Field("Tags", tags.node)));

    // Barra de ações removida: era redundante e cobria o fim do formulário.
    // As duas ações vivem no header — seta "←" = cancelar, olho = pré-visualizar.
    var body = el("div", { class: "cset-body" }, header, scroll);
    root = el("div", { class: "cset cset--chat cc-create" }, body);

    var inner = el("div", { class: "view__inner view__inner--flush" }, root);
    syncAccent();
    return { node: inner, active: "sanguao", title: "Criar comunidade", immersive: true, flush: true };
  }

  App.screens.createCommunity = render;
})(window.App = window.App || {});
