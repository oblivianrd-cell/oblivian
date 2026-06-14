/* ============================================================
   components/moderation.js — Seletor de duração + diálogo de
   moderação (banir / ocultar / silenciar). Ocultar e silenciar
   aceitam duração em dias/semanas/meses + personalizada.
   Namespace: App.components.DurationPicker / openModerationDialog
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui;
  App.components = App.components || {};

  var DAY = 86400000;
  var UNIT_MS = { dias: DAY, semanas: 7 * DAY, meses: 30 * DAY };

  /* Retorna { node, getValue() } onde getValue → ms ou null (permanente). */
  function DurationPicker(opts) {
    opts = opts || {};
    var presets = [
      { label: "1 dia", ms: DAY },
      { label: "7 dias", ms: 7 * DAY },
      { label: "30 dias", ms: 30 * DAY },
      { label: "Personalizado", custom: true },
      { label: "Permanente", ms: null }
    ];
    if (opts.allowPermanent === false) presets = presets.filter(function (p) { return p.ms !== null || p.custom; });

    var selected = presets[1]; // 7 dias por padrão
    var customWrap = el("div", { class: "duration__custom u-hidden" });
    var numInput = ui.Input({ type: "number", value: "1" });
    numInput.min = "1"; numInput.style.width = "90px";
    var unitSel = el("select", { class: "select", style: { width: "140px" } },
      Object.keys(UNIT_MS).map(function (u) { return el("option", { value: u }, u); }));
    customWrap.appendChild(ui.Field("Quantidade", numInput));
    customWrap.appendChild(ui.Field("Unidade", unitSel));

    var chips = el("div", { class: "duration__units" });
    presets.forEach(function (p) {
      var chip = el("button", { class: "chip" + (p === selected ? " is-active" : ""), type: "button" }, p.label);
      chip.addEventListener("click", function () {
        selected = p;
        App.util.qsa(".chip", chips).forEach(function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");
        customWrap.classList.toggle("u-hidden", !p.custom);
      });
      chips.appendChild(chip);
    });

    var node = el("div", { class: "duration" }, chips, customWrap);

    function getValue() {
      if (selected.custom) {
        var n = Math.max(1, parseInt(numInput.value, 10) || 1);
        return n * (UNIT_MS[unitSel.value] || DAY);
      }
      return selected.ms; // pode ser null (permanente)
    }
    return { node: node, getValue: getValue };
  }

  var ACTIONS = [
    { value: "mute", label: "Silenciar", icon: "mute", desc: "Impede de enviar mensagens.", duration: true },
    { value: "hide", label: "Ocultar", icon: "hide", desc: "Borra o perfil e esconde os posts do usuário.", duration: true },
    { value: "ban", label: "Banir", icon: "ban", desc: "Remove o acesso à comunidade.", duration: false }
  ];

  /* Abre o diálogo de moderação para um membro. */
  function openModerationDialog(communityId, target, onDone) {
    var current = ACTIONS[0];
    var picker = DurationPicker({});
    var durationSlot = el("div", picker.node);
    var reason = ui.Textarea({ placeholder: "Motivo (opcional)", maxlength: 240 });

    var actionRow = el("div", { class: "segmented" });
    ACTIONS.forEach(function (a) {
      var b = el("button", { class: "segmented__item" + (a === current ? " is-active" : ""), type: "button" }, a.label);
      b.addEventListener("click", function () {
        current = a;
        App.util.qsa(".segmented__item", actionRow).forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        descEl.textContent = a.desc;
        durationSlot.classList.toggle("u-hidden", !a.duration);
      });
      actionRow.appendChild(b);
    });

    var descEl = el("p", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, current.desc);

    var body = el("div", { class: "u-col u-gap-4" },
      el("div", { class: "u-row u-gap-3" },
        ui.Avatar({ name: target.user.name, src: target.user.avatar, round: true }),
        el("div", null,
          el("strong", target.user.name),
          el("div", { class: "u-muted", style: { fontSize: "var(--fs-sm)" } }, "@" + target.user.handle))),
      ui.Field("Ação", actionRow),
      descEl,
      ui.Field("Duração", durationSlot),
      ui.Field("Motivo", reason)
    );

    var ref = ui.openModal({
      title: "Moderar membro",
      body: body,
      actions: [
        ui.Button({ label: "Cancelar", variant: "ghost", onClick: function () { ref.close(); } }),
        ui.Button({
          label: "Aplicar", variant: "danger", onClick: function () {
            var durationMs = current.duration ? picker.getValue() : null;
            App.repo.moderate(communityId, target.user.id, {
              action: current.value, durationMs: durationMs, reason: reason.value.trim()
            }).then(function () {
              ui.toast("Ação aplicada: " + current.label, "ok");
              ref.close();
              onDone && onDone();
            }).catch(function (e) { ui.toast(e.message, "danger"); });
          }
        })
      ]
    });
  }

  App.components.DurationPicker = DurationPicker;
  App.components.openModerationDialog = openModerationDialog;
})(window.App = window.App || {});
