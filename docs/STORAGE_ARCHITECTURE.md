# Oblivian — Arquitetura de Storage (app / web / shared)

Documenta a divisão lógica **sem** mover fisicamente os arquivos do app
(mover quebraria `build.mjs`, o empacotamento `mobile/www` do Capacitor e os
caminhos de script de `index.html`). A divisão é por **responsabilidade**, e o
código comum vive uma vez só (shared) — nada duplicado.

## 1. app  (mobile / Capacitor)
- `mobile/` — projeto Capacitor; empacota `mobile/www/` no APK.
- `apk-release.mjs` — publica `oblivian.apk` no GitHub Releases.
- Regras de storage do app = mesmas regras de `App.storage` (shared), embutidas no bundle.

## 2. web  (Cloudflare Pages)
- Raiz servida por `build.mjs` → `dist/` (exclui mobile/, backend/, docs/, apk).
- `index.html`, `manifest.webmanifest`, `pages/`, `_headers`, `_redirects`.
- Regras de storage web = mesmas de `App.storage` (shared).

## 3. shared  (comum a app + web — fonte única)
| Tipo                     | Caminho                                   |
|--------------------------|-------------------------------------------|
| utils comuns             | `js/core/util.js`                         |
| **serviço de storage**   | `js/core/storage.js` → `App.storage`      |
| **limpeza ao banir**     | `js/core/banCleanup.js` → `App.banCleanup`|
| componentes comuns       | `js/components/*` (ex.: `imagePicker.js`) |
| estilos comuns           | `styles/*`                                |
| tipos / modelos          | `js/data/models.js`                       |
| serviços de dados        | `js/data/*Repository.js`                  |

O mobile consome o mesmo `js/` (copiado para `mobile/www` no sync). Por isso o
serviço de storage é **escrito uma vez** e usado nas duas divisões.

## Camada de storage de mídia
- **Convenção de pastas/chaves:** `storage/` (+ `storage/README.md`).
- **Serviço cliente:** `App.storage` — valida, comprime, converte, roteia, gera metadados.
- **Backend real:** `backend/r2/upload-worker.js` (Cloudflare R2; grava `${kind}/${id}.ext`).
- **Estado atual do app:** mídia embutida inline (WebP base64 no registro do DB);
  `App.storage.upload(file, {uploader})` aceita um `uploader` para migrar p/ R2 sem
  reescrever as telas.

## Regras (em `App.storage`)
- Máx **10 MB** (imagem e GIF).
- Permitidos: `jpg, jpeg, png, webp, gif, webm`. Resto bloqueado.
- Compressão: avatar (agressiva) · banner (moderada) · post (segura).
- Saída: estáticas → WebP; GIF → WebP/WebM; animação grande → WebM.
- EXIF removido na re-codificação por canvas. Nome de arquivo saneado.

## Limpeza ao banir (`App.banCleanup`)
- `dryRun` (padrão) prevê; modo real faz backup → aplica patch (avatar/cover → placeholder/null).
- Mantém: ID, motivo, data do ban, logs de moderação, registro mínimo.
- Remove: avatar, banner, imagens de perfil, temporários, caches pessoais.
- Não toca conteúdo público sem regra de moderação. Placeholder: `assets/placeholder-avatar.svg`.
