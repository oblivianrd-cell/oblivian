/* ============================================================
   screens/store.js — Loja de moedas + itens cosméticos.
   Ganhe moedas assistindo anúncio recompensado (simulado) e
   gaste em molduras, temas, bolhas e destaques.
   Crédito de moeda é feito pelo repositório (fronteira "servidor").
   Rota: /loja   Namespace: App.screens.store
   ============================================================ */
(function (App) {
  "use strict";
  var el = App.util.el, ui = App.ui, C = App.components;
  App.screens = App.screens || {};

  var CATS = [
    { key: "frame", label: "Molduras", icon: "profile" },
    { key: "theme", label: "Temas", icon: "palette" },
    { key: "bubble", label: "Bolhas de chat", icon: "chat" },
    { key: "postHighlight", label: "Destaques de postagem", icon: "featured" },
    { key: "profileHighlight", label: "Destaques de perfil", icon: "star" },
    { key: "special", label: "Especiais", icon: "shield" }
  ];
  var RARITY_CLS = { comum: "is-comum", raro: "is-raro", "épico": "is-epico", especial: "is-especial" };

  /* ---- prévia do cosmético (anel/cor) ---- */
  function swatchPreview(item) {
    var v = item.value || "var(--accent)";
    var node = el("div", { class: "store-item__preview" });
    if (item.category === "frame") {
      var ring = el("div", { class: "store-item__ring" });
      ring.style.background = v;
      node.appendChild(ring);
      node.appendChild(el("div", { class: "store-item__avatar" }, App.icon("profile")));
    } else {
      node.style.background = v;
      node.appendChild(App.icon(item.icon || "star"));
    }
    return node;
  }

  /* ====================== Anúncio recompensado (simulado) ====================== */
  function openRewardedAd(onClaimed) {
    var SECONDS = 5;
    var left = SECONDS, completed = false, timer = null;
    var bar = el("div", { class: "ad-sim__bar" });
    var barFill = el("div", { class: "ad-sim__fill" });
    bar.appendChild(barFill);
    var count = el("div", { class: "ad-sim__count" }, left + "s");
    var status = el("div", { class: "ad-sim__status u-muted" }, "Reproduzindo anúncio...");
    // criativo: promo animado do Oblivian. (No APP, o vídeo rewarded REAL do AdMob toca antes,
    //  via App.ads.rewarded; este modal é o fallback da web — não mostra banner aqui p/ não dar caixa em branco.)
    var PROMOS = [
      { e: "🌐", t: "Crie sua comunidade", s: "Espaços sobre o que você ama" },
      { e: "💬", t: "Converse em tempo real", s: "Chats privados e em grupo" },
      { e: "📝", t: "Publique do seu jeito", s: "Posts, enquetes, blogs e mais" },
      { e: "🎨", t: "Deixe com a sua cara", s: "Personalize perfil e comunidade" }
    ];
    var pIdx = 0;
    var pEmoji = el("div", { class: "adp__emoji" }, PROMOS[0].e);
    var pTitle = el("div", { class: "adp__title" }, PROMOS[0].t);
    var pSub = el("div", { class: "adp__sub" }, PROMOS[0].s);
    var fakeAd = el("div", { class: "ad-sim__creative adp" },
      el("div", { class: "adp__badge" }, "Oblivian"), pEmoji, pTitle, pSub);
    var promoTimer = setInterval(function () {
      pIdx = (pIdx + 1) % PROMOS.length;
      fakeAd.classList.add("is-fade");
      setTimeout(function () {
        pEmoji.textContent = PROMOS[pIdx].e; pTitle.textContent = PROMOS[pIdx].t; pSub.textContent = PROMOS[pIdx].s;
        fakeAd.classList.remove("is-fade");
      }, 220);
    }, 1500);

    var claimBtn = ui.Button({ label: "Coletar recompensa", icon: "coin", variant: "primary", block: true, disabled: true, onClick: function () {
      App.repo.claimAdReward(completed).then(function (res) {
        ref.close();
        ui.toast("Você ganhou " + res.reward + " moedas!", "ok");
        if (onClaimed) onClaimed(res);
      }).catch(function (e) { ui.toast(e.message, "danger"); });
    } });

    var ref = ui.openModal({
      title: "Assistir anúncio",
      scrimClass: "scrim--centered",
      dismissable: true,
      body: el("div", { class: "ad-sim" }, fakeAd, bar, count, status, claimBtn),
      onClose: function () { if (timer) clearInterval(timer); if (promoTimer) clearInterval(promoTimer); }
    });

    timer = setInterval(function () {
      left--;
      count.textContent = left > 0 ? left + "s" : "Concluído";
      barFill.style.width = ((SECONDS - left) / SECONDS * 100) + "%";
      if (left <= 0) {
        clearInterval(timer); timer = null;
        completed = true;
        status.textContent = "Anúncio concluído — recompensa liberada.";
        claimBtn.disabled = false;
        claimBtn.classList.add("is-ready");
      }
    }, 1000);
  }

  /* ====================== Tela ====================== */
  function render() {
    var inner = el("div", { class: "view__inner view__inner--wide" });

    Promise.all([App.repo.getWallet(), App.repo.listStoreItems()]).then(function (r) {
      var balance = r[0].balance, items = r[1];

      // --- saldo + ganhar moedas ---
      var balanceEl = el("strong", { class: "store-balance__num" }, App.util.formatCount(balance));
      function refreshBalance() { balanceEl.textContent = App.util.formatCount(App.repo.getBalance()); }

      var adInfo = el("div", { class: "store-earn__info u-muted" });
      var adBtn = ui.Button({ label: "Assistir anúncio", icon: "play", variant: "primary" });
      var cooldownTimer = null;
      function refreshAd() {
        var st = App.repo.adStatus();
        if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
        if (st.remaining <= 0) {
          adBtn.disabled = true;
          adInfo.textContent = "Limite diário atingido (" + st.limit + "/" + st.limit + "). Volte amanhã.";
        } else if (st.cooldownLeft > 0) {
          adBtn.disabled = true;
          var tick = function () {
            var s = App.repo.adStatus();
            if (s.cooldownLeft <= 0) { clearInterval(cooldownTimer); cooldownTimer = null; refreshAd(); return; }
            adInfo.textContent = "Aguarde " + Math.ceil(s.cooldownLeft / 1000) + "s · " + s.remaining + " de " + s.limit + " hoje";
          };
          tick(); cooldownTimer = setInterval(tick, 1000);
        } else {
          adBtn.disabled = false;
          adInfo.textContent = "+" + st.reward + " moedas por anúncio · " + st.remaining + " de " + st.limit + " disponíveis hoje";
        }
      }
      function grantReward() {
        App.repo.claimAdReward(true).then(function (res) {
          ui.toast("Você ganhou " + res.reward + " moedas!", "ok"); refreshBalance(); refreshAd();
        }).catch(function (e) { ui.toast(e.message, "danger"); });
      }
      adBtn.addEventListener("click", function () {
        function sim() { openRewardedAd(function () { refreshBalance(); refreshAd(); }); }
        // tenta rede real (AdMob nativo ou AdSense H5); senão, anúncio simulado
        if (App.ads && App.ads.available && App.ads.available()) {
          App.ads.rewarded(grantReward, sim);
        } else { sim(); }
      });
      refreshAd();

      var earnCard = el("section", { class: "store-earn card" },
        el("div", { class: "store-balance" },
          el("span", { class: "store-balance__icon" }, App.icon("coin")),
          el("div", null,
            el("div", { class: "store-balance__label u-muted" }, "Seu saldo"),
            el("div", { class: "store-balance__row" }, balanceEl, el("span", { class: "u-muted" }, "moedas")))),
        el("div", { class: "store-earn__cta" }, adBtn, adInfo));

      // --- catálogo por categoria ---
      var catalog = el("div", { class: "store-cats" });
      function itemCard(item) {
        var owned = App.repo.ownsItem(item.id);
        var equippable = ["frame", "theme", "bubble", "profileHighlight"].indexOf(item.category) >= 0;
        var equipped = equippable && App.repo.getEquipped(item.category) === item.id;

        var actionWrap = el("div", { class: "store-item__action" });
        var card = el("article", { class: "store-item card " + (RARITY_CLS[item.rarity] || "") + (equipped ? " is-equipped" : "") },
          swatchPreview(item),
          el("div", { class: "store-item__body" },
            el("div", { class: "store-item__name" }, item.name),
            el("div", { class: "store-item__desc u-muted" }, item.description),
            el("div", { class: "store-item__rarity" }, item.rarity)),
          actionWrap);

        function paintAction() {
          App.util.clear(actionWrap);
          owned = App.repo.ownsItem(item.id);
          equipped = equippable && App.repo.getEquipped(item.category) === item.id;
          if (!owned) {
            actionWrap.appendChild(el("div", { class: "store-item__price" }, App.icon("coin", { size: "sm" }), App.util.formatCount(item.price)));
            actionWrap.appendChild(ui.Button({ label: "Comprar", size: "sm", variant: "primary", onClick: function () {
              App.repo.buyItem(item.id).then(function () {
                ui.toast(item.name + " comprado!", "ok"); refreshBalance(); if (equippable) card.classList.add("is-equipped"); paintAction();
              }).catch(function (e) { ui.toast(e.message, "danger"); });
            } }));
          } else if (equippable) {
            actionWrap.appendChild(ui.Button({ label: equipped ? "Equipado" : "Equipar", size: "sm", variant: equipped ? "outline" : "secondary", icon: equipped ? "check" : null, onClick: function () {
              App.repo.equipItem(item.id).then(function () { card.classList.toggle("is-equipped"); paintAction(); });
            } }));
          } else {
            actionWrap.appendChild(el("span", { class: "store-item__owned" }, App.icon("check", { size: "sm" }), "Adquirido"));
          }
        }
        paintAction();
        return card;
      }

      CATS.forEach(function (cat) {
        var list = items.filter(function (i) { return i.category === cat.key; });
        if (!list.length) return;
        var grid = el("div", { class: "store-grid" });
        list.forEach(function (i) { grid.appendChild(itemCard(i)); });
        catalog.appendChild(el("section", { class: "store-cat" },
          el("div", { class: "section-title" }, App.icon(cat.icon), cat.label),
          grid));
      });

      App.util.mount(inner, el("div", { class: "u-col u-gap-5" },
        C.LargeTitle ? C.LargeTitle("Loja") : el("h1", "Loja"),
        earnCard,
        catalog,
        C.AdBanner ? C.AdBanner() : null
      ));
    });

    return { node: inner, active: "store", title: "Loja" };
  }

  App.screens.store = render;
})(window.App = window.App || {});
