/* ============================================================
   components/ads.js — Camada de anúncios (web).
   Se App.config.ads.enabled + publisher/slot definidos → usa
   Google AdSense (banner) e a Ad Placement API (recompensado).
   Senão → placeholder/simulação (estado atual).
   Trocar de rede = só preencher config.js. Nenhuma tela muda.
   Namespace: App.ads
   ============================================================ */
(function (App) {
  "use strict";

  function cfg() { return (App.config && App.config.ads) || {}; }
  function enabled() { var c = cfg(); return !!(c.enabled && c.adsenseClient); }

  var _loaded = false;
  function loadAdSense() {
    if (_loaded || !enabled()) return _loaded;
    var c = cfg();
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(c.adsenseClient);
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
    // habilita anúncios recompensados/intersticiais (Ad Placement API / H5)
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push({ google_ad_client: c.adsenseClient, enable_page_level_ads: true });
    _loaded = true;
    return true;
  }

  /* Adsterra Social Bar — barra flutuante (auto-injeta). Carrega 1x. */
  var _sbLoaded = false;
  function loadSocialBar() {
    if (_sbLoaded) return false;
    var url = cfg().socialBar;
    if (!url) return false;
    _sbLoaded = true;
    var s = document.createElement("script");
    s.src = url; s.async = true; s.setAttribute("data-cfasync", "false");
    (document.body || document.head).appendChild(s);
    return true;
  }

  /* Preenche um nó com uma unidade de banner real do AdSense.
     Retorna true se um anúncio real foi inserido. */
  function renderBanner(host) {
    var c = cfg();
    if (!enabled() || !c.bannerSlot || !host) return false;
    loadAdSense();
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", c.adsenseClient);
    ins.setAttribute("data-ad-slot", c.bannerSlot);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    host.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { return false; }
    return true;
  }

  /* ---- AdMob nativo (Capacitor) — rewarded REAL em app Android/iOS ---- */
  function nativeAdMob() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  }
  function isNative() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && nativeAdMob()); }

  var _admobInit = false;
  function initAdMob() {
    var AdMob = nativeAdMob();
    if (!AdMob || _admobInit) return Promise.resolve(_admobInit);
    _admobInit = true;
    return AdMob.initialize({ initializeForTesting: true }).catch(function () {});
  }

  // IDs de TESTE do Google (funcionam sem conta AdMob). Troque pelos reais depois.
  var AD_UNITS = {
    rewarded: (cfg().admob && cfg().admob.rewardedId) || "ca-app-pub-3940256099942544/5224354917"
  };

  function rewardedNative(onReward, onFail) {
    var AdMob = nativeAdMob();
    var granted = false, sub = [];
    function cleanup() { sub.forEach(function (h) { try { h && h.remove && h.remove(); } catch (e) {} }); }
    initAdMob().then(function () {
      return AdMob.addListener("onRewardedVideoAdReward", function () { granted = true; if (onReward) onReward(); }).then(function (h) { sub.push(h); });
    }).then(function () {
      return AdMob.addListener("onRewardedVideoAdDismissed", function () { cleanup(); if (!granted && onFail) onFail(new Error("Anúncio fechado antes da recompensa")); }).then(function (h) { sub.push(h); });
    }).then(function () {
      return AdMob.prepareRewardVideoAd({ adId: AD_UNITS.rewarded });
    }).then(function () {
      return AdMob.showRewardVideoAd();
    }).catch(function (e) { cleanup(); if (onFail) onFail(e); });
    return true;
  }

  /* Anúncio recompensado. Chama onReward() SÓ quando a rede confirma
     a conclusão. onFail() se não disponível/erro (o chamador faz fallback). */
  function rewarded(onReward, onFail) {
    var c = cfg();
    // 1) AdMob nativo (app empacotado) — melhor para rewarded
    if (isNative()) return rewardedNative(onReward, onFail);
    // 2) Ad Placement API (H5 Games Ads) — adBreak/adConfig
    if (enabled() && typeof window.adBreak === "function") {
      var rewardedGranted = false;
      window.adBreak({
        type: "reward",
        name: "coins_reward",
        beforeReward: function (showAdFn) { showAdFn(); },
        adDismissed: function () { if (!rewardedGranted && onFail) onFail(new Error("Anúncio fechado antes da recompensa")); },
        adViewed: function () { rewardedGranted = true; if (onReward) onReward(); },
        adBreakDone: function (info) { if (!rewardedGranted && info && info.breakStatus !== "viewed" && onFail) onFail(new Error("Anúncio indisponível")); }
      });
      return true;
    }
    if (onFail) onFail(new Error("Rede de anúncios não configurada"));
    return false;
  }

  // há alguma rede de rewarded disponível? (AdMob nativo ou AdSense H5)
  function available() { return isNative() || (enabled() && typeof window.adBreak === "function"); }

  App.ads = { enabled: enabled, available: available, isNative: isNative, initAdMob: initAdMob, loadAdSense: loadAdSense, loadSocialBar: loadSocialBar, renderBanner: renderBanner, rewarded: rewarded };
})(window.App = window.App || {});
