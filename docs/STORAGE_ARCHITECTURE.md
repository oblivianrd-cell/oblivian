# Oblivian — Arquitetura de Storage (app / web / shared)

Documenta a divisão lógica **sem** mover fisicamente os arquivos do app
(mover quebraria `scripts/build.mjs`, o empacotamento `mobile/www` do Capacitor e os
caminhos de script de `index.html`). A divisão é por **responsabilidade**, e o
código comum vive uma vez só (shared) — nada duplicado.

## 1. app  (mobile / Capacitor)
- `mobile/` — projeto Capacitor; empacota `mobile/www/` no APK.
- `scripts/apk-release.mjs` — publica `oblivian.apk` no GitHub Releases.
- Regras de storage do app = mesmas regras de `App.storage` (shared), embutidas no bundle.

## 2. web  (Cloudflare Pages)
- Raiz servida por `scripts/build.mjs` → `dist/` (exclui mobile/, backend/, docs/, apk).
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
- Compressão: avatar (agressiva, 256px) · banner (moderada) · post (segura).
- Saída: estáticas → **AVIF** (quando o browser encoda) → WebP → JPEG; GIF → WebP/WebM; animação grande → WebM.
- EXIF removido na re-codificação por canvas. Nome de arquivo saneado.

## Reduções de storage (implementadas — client-side, sem cloud)
1. **Re-encode forçado** — `reencode()` SEMPRE redimensiona+recodifica, inclusive
   webp/png de entrada. Conserta o vazamento antigo (webp 4000px passava intacto).
2. **AVIF quando suportado** (`canEncodeAvif`) — ~20-30% menor que WebP.
3. **Miniaturas** (`thumbnail`, 320px) — feeds/listas carregam o thumb, não a imagem cheia.
4. **Dedup por conteúdo** — `hashId(dataUrl)` (FNV-1a) → `meta.id`; conteúdo igual,
   chave igual: guarda uma vez só.
5. **Avatar agressivo** — 512→256px (exibido ~96px no app).

### Próximas reduções (precisam de cloud/token)
- **R2 binário + CDN** em vez de base64 inline no DB (base64 = +33% e re-baixa sempre).
- **GIF→WebM animado** server-side (`App.config.storage.gifConvertEndpoint`).

## Limpeza ao banir (`App.banCleanup`)
- `dryRun` (padrão) prevê; modo real faz backup → aplica patch (avatar/cover → placeholder/null).
- Mantém: ID, motivo, data do ban, logs de moderação, registro mínimo.
- Remove: avatar, banner, imagens de perfil, temporários, caches pessoais.
- Não toca conteúdo público sem regra de moderação. Placeholder: `assets/placeholder-avatar.svg`.
