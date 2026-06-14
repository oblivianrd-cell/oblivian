# storage/ — convenção de chaves de objeto (object-key prefixes)

Estas pastas **não guardam binários no Git** (só `.gitkeep`). Elas documentam o
*layout de chaves* usado pelo armazenamento real (R2/Worker em `backend/r2/`) e
pelo serviço de upload do cliente (`js/core/storage.js` → `App.storage`).

O Worker grava objetos como `${kind}/${id}.${ext}`. O `kind` é mapeado para uma
destas pastas por `App.storage.folderFor(kind)`.

| kind        | pasta                     | uso                                  |
|-------------|---------------------------|--------------------------------------|
| `avatar`    | `storage/users/avatar`    | foto de perfil (compressão agressiva)|
| `banner`    | `storage/users/banner`    | capa de perfil (compressão moderada) |
| `profile`   | `storage/users/profile`   | outras imagens do perfil             |
| `post`      | `storage/posts`           | imagens de post (compressão segura)  |
| `comment`   | `storage/comments`        | imagens em comentários               |
| `chat`      | `storage/chats`           | mídia de chat / wallpaper            |
| `community` | `storage/communities`     | ícone / banner de comunidade         |
| `temp`      | `storage/temp`            | uploads em processamento             |
| —           | `storage/deleted`         | metadados de itens removidos (log)   |
| —           | `storage/banned`          | registro mínimo de contas banidas    |

## Divisão do projeto (app / web / shared)

Ver `docs/STORAGE_ARCHITECTURE.md`. Resumo:

- **app**  → `mobile/` (Capacitor, empacota `mobile/www/`). Regras de storage do app.
- **web**  → raiz servida por `build.mjs` → `dist/` (Cloudflare Pages).
- **shared** → `js/core/` (util, storage, banCleanup), `js/components/`,
  `js/data/` (repositórios), `styles/`. Código comum a app e web; **nunca duplicar**.

## Regras de storage (aplicadas por `App.storage`)

- Tamanho máx.: **10 MB** (imagem e GIF).
- Tipos permitidos: `jpg, jpeg, png, webp, gif, webm`.
- Saída preferida: estáticas → **WebP**; GIF animado → **WebP/WebM**; animação grande → **WebM**.
- Compressão: avatar (agressiva) · banner (moderada) · post (segura).
- Metadados (EXIF) removidos na re-codificação por canvas.
- Nome de arquivo saneado; tipos inválidos bloqueados.
