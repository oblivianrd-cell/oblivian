/* ============================================================
   config.example.js — Modelo de configuração de backend.
   COPIE para config.js e preencha. NÃO comite config.js com chaves.
   Apenas chaves PÚBLICAS (anon) vão aqui — segredos ficam no servidor.
   ============================================================ */
(function (App) {
  "use strict";
  App.config = {
    // Supabase: Project URL + anon key (pública; RLS protege os dados)
    supabase: {
      url: "https://SEU-PROJETO.supabase.co",
      anonKey: "SUA_ANON_KEY_PUBLICA"
    },
    // Endpoint do Worker que assina uploads do R2 (NUNCA expor o secret do R2 aqui)
    r2: {
      uploadEndpoint: "https://SEU-WORKER.workers.dev/sign",
      publicBase: "https://cdn.SEU-DOMINIO.com" // base pública dos objetos R2
    },
    // Captcha (anti-bot no registro/login). SÓ a site key (PÚBLICA) vai aqui.
    // O SECRET fica no painel do Supabase (Auth → Bot & Abuse Protection), nunca no front.
    // Vazio = captcha desligado (o fluxo continua funcionando). Provider: 'turnstile' (Cloudflare) ou 'hcaptcha'.
    captcha: {
      provider: "turnstile",
      siteKey: "" // ex.: "0x4AAAAAAA..." (Cloudflare Turnstile → Site key)
    },
    // Anúncios (web). enabled=false → placeholder/simulação.
    // Preencha após aprovação no Google AdSense.
    ads: {
      enabled: false,
      adsenseClient: "ca-pub-XXXXXXXXXXXXXXXX", // Publisher ID
      bannerSlot: "XXXXXXXXXX"                  // ID da unidade de banner
      // recompensado web exige AdSense H5 Games Ads (Ad Placement API)
    }
  };
})(window.App = window.App || {});
