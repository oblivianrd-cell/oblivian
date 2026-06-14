# Estrutura do projeto — Obliviny

App web (vanilla JS, sem build) + wrapper Android (Capacitor) + scaffold de backend.
Sem framework/bundler: o `index.html` carrega os scripts por `<script>` na ordem certa
(núcleo → dados → componentes → telas → bootstrap). Tudo conversa pelo namespace global `App`.

## Raiz
| Arquivo | Papel |
|--------|-------|
| `index.html` | Entrada do app. Só `<div id="app">` + links de CSS + scripts. Shell montado via JS. |
| `privacidade.html` | Política de Privacidade estática (exigência AdSense). URL: `/privacidade`. |
| `manifest.webmanifest` | PWA (nome, ícone, cores). |
| `README.md` | Visão geral + deploy. |
| `netlify.toml` · `vercel.json` | Configs de deploy alternativas (atual: Cloudflare Pages). |
| `Obliviny-debug.apk` | Build Android de teste (gerado em `mobile/`). |

## `js/` — aplicação
- **`app.js`** — bootstrap: instancia repo, aplica tema, monta shell, registra rotas.
- **`core/`** — base sem UI:
  - `util.js` (el/DOM/format), `markup.js` (texto rico), `events.js` (bus), `icons.js` (SVGs),
    `store.js` (tema/acento/prefs em localStorage), `sound.js` (sons de UI), `router.js` (hash router).
- **`data/`** — camada de dados (contrato `Repository`, troca de backend sem mexer nas telas):
  - `models.js` (fábricas), `seed.js` (dados demo), `repository.js` (contrato abstrato),
    `localRepository.js` (impl. localStorage — ativa), `supabaseRepository.js` (scaffold nuvem),
    `config.example.js` (modelo de config; copiar p/ `config.js`, não comitar).
- **`components/`** — UI reutilizável: `ui.js` (primitivas), `shell.js` (chrome/nav), `adBanner.js`,
  `ads.js` (AdMob/AdSense bridge), `imagePicker.js`, `colorPicker.js`, `tagEditor.js`,
  `communityCard.js`, `profileHeader.js`, `moderation.js`, `onboarding.js`, `effects.js`.
- **`screens/`** — uma por área: `explorer`, `sanguao`, `chats`, `chatSettings`, `community`,
  `createCommunity`, `createPost`, `comments`, `profile`, `settings`, `store`.

## `styles/` — CSS (espelha as telas)
- `tokens.css` (variáveis: cores/espaços/raios/fontes — **único lugar p/ identidade visual**),
  `base.css` (reset + @font-face Inter + utilidades + transições globais),
  `layout.css` (shell/nav/responsivo), `components.css` (componentes).
- `screens/` — um CSS por tela (mesmos nomes das telas) + `effects.css`, `interactions.css`.

## `assets/` · `fonts/`
- `assets/icon.svg` — ícone da marca (favicon + manifest).
- `fonts/` — Inter (woff2 latin / latin-ext), carregado via `@font-face` em `base.css`.

## `backend/` — nuvem (scaffold, precisa de chaves)
- `supabase/schema.sql` — 10 tabelas + RLS + funções server-side (crédito de moeda / compra).
- `r2/upload-worker.js` — Cloudflare Worker que assina uploads do R2 (segredo fica no servidor).
- `INTEGRACAO_BACKEND.md` — passo a passo p/ ligar Supabase + R2.

## `mobile/` — app Android (Capacitor)
- `capacitor.config.json` (appId `com.obliviny.app`), `package.json`, `www/` (cópia do site),
  `android/` (projeto nativo gerado), `_art/` (fontes do ícone/splash), `README.md` (build/publish).
- Envolve o site num WebView + plugin `@capacitor-community/admob` (rewarded real).

## `docs/`
- `PLANO_MONETIZACAO.md` — plano de produto (anúncios/moedas/armazenamento).
- `ESTRUTURA.md` — este arquivo.

## Hospedagem atual
- **Cloudflare Pages**: projetos `obliviny` (https://obliviny.pages.dev) e `sanguao` (legado).
- Conta Cloudflare ID: `b851193bcdd9a4fe035662c44485cca5`.

## Convenções
- Identificadores internos usam `sanguao` (rota `/sanguao`, classes, chaves de storage); o **nome
  visível** é **Obliviny**. Não renomear identificadores sem atualizar todas as referências.
- Ao mudar `seed.js`/modelos, subir `DB_KEY` em `localRepository.js` força recriar o banco local.
