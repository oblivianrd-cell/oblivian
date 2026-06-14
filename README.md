# Oblivian

Rede social de comunidades feita em **HTML + CSS + JavaScript puro** (sem frameworks, sem build, sem servidor). Abra `index.html` no navegador e funciona.

## Como abrir

Basta abrir `index.html` num navegador moderno (Chrome, Edge, Firefox).
Os dados ficam salvos no `localStorage` do navegador (persistem ao recarregar).
Para zerar: **Configurações → Dados → Restaurar dados de exemplo**.

## Áreas principais

| Área | O que tem |
|------|-----------|
| **Explorer** | Destaque da semana + Recentes + busca/descoberta de comunidades |
| **Oblivian** | Minhas comunidades (com card de criação) + Recentes (atividade) |
| **Chats** | Todos os chats das comunidades em que você participa |

## Conceito central: dois tipos de perfil

- **Perfil global** (`/profile`, `/u/:id`) — a conta principal do Oblivian.
  Só muda dentro do Oblivian. **Não** tem reputação, tags nem títulos.
- **Perfil de comunidade** (`/c/:id/u/:userId`) — **independente por comunidade**.
  Cada comunidade tem o seu: bio, avatar, capa, painel, tags, títulos e reputação
  próprios. O mesmo usuário tem um perfil diferente em Anime e outro em Gamer.

Seguidores / Seguindo são **globais** (da conta). Reputação é **por comunidade**.

## Estrutura do projeto

Cada parte é separada, rotulada e independente — alterar uma tela/componente não afeta os demais.

```
index.html                 ordem de carregamento dos scripts/estilos
styles/
  tokens.css               variáveis: cores, espaçamento, tema claro/escuro
  base.css                 reset + utilitários
  layout.css               shell + navegação + responsivo (desktop/tablet/mobile)
  components.css           botões, cards, avatar, tags, modais, etc.
  screens/                 1 arquivo por tela
js/
  core/                    util, events (bus), icons (SVG), store, router
  data/                    models, seed, repository (contrato), localRepository
  components/              ui, shell, communityCard, profileHeader,
                           moderation, imagePicker, tagEditor
  screens/                 explorer, Oblivian, chats, community,
                           profile, settings, createCommunity
  app.js                   bootstrap + rotas
```

Para achar algo: o nome do arquivo = o nome da interface/componente.
Ex.: tela de comunidade → `js/screens/community.js` + `styles/screens/community.css`.

## Responsivo (três layouts distintos)

Não é só encolher — cada formato muda de estrutura:

- **Desktop (≥1024px)**: sidebar com rótulos + conteúdo largo.
- **Tablet (640–1023px)**: sidebar vira um *rail* só de ícones.
- **Mobile (<640px)**: topbar + barra de abas inferior; chats alternam lista/conversa.

## Comunidades

- Card inicial gerado na área Oblivian, interligado à página interna.
- Página interna com abas: **Feed · Chats · Membros · Sobre a comunidade · Administração**.
- **Sobre a comunidade**: ícone, fundo, descrição, dono e informações.
- **Chats públicos e privados** (privados só para dono/admin).
- **Administração**: banir / ocultar / silenciar.
  - Ocultar e silenciar aceitam duração em **dias, semanas, meses** ou **personalizada**.
  - Banir é permanente.
- **Configuração da comunidade**: identidade, regras e customização visual
  (acento próprio, independente do tema global).

## Personalização do perfil

- Dois fundos separados: **capa** (topo) e **painel** (base).
- Sistema de **tags** e **avatar**, mantidos separados por comunidade quando internos.

## Ícones

Todos em **SVG**, estilo branco/flat/linear, via `currentColor` (adaptam à cor do tema).
Registro único em `js/core/icons.js` — adicione novos só ali. Sem emojis.

## Deploy (cloud)

100% estático + **hash routing** (`#/rota`) → não precisa rewrite de SPA.
Host atual: **Cloudflare Pages** (`oblivian.net`).

- **Build**: `npm run build` → gera `dist/` (só `js styles assets fonts` + `pages/*` + carimbo de versão). Ver `scripts/build.mjs`.
- **Deploy**: `npm run deploy` (= build + `wrangler pages deploy dist`). Config em `wrangler.toml`.
- **APK Android**: `npm run apk` (`node scripts/apk-release.mjs`) publica `oblivian.apk` no GitHub Releases (não vai pro `dist/`).
- **Qualquer host estático**: publique `dist/`; entrada `index.html`. `.nojekyll` impede ignorar `js/`.

Para PWA/manifest: sirva por HTTP (`npx serve .` ou Live Server), não `file://`.
Reset/seed: bump do `DB_KEY` em `js/data/localRepository.js` ou limpe o `localStorage`.

## Criar publicação

Tela cheia própria (`/c/:id/criar-post`, botão **+** do dock): seletor de tipo
(texto/blog/imagem/enquete/quiz/link/pergunta/wiki) + campos por tipo +
pré-visualização ao vivo + publicar (persiste via `repo.createPost`).

## Trocar para um backend de verdade

A camada de dados é abstrata (`js/data/repository.js`). Hoje usa
`LocalRepository` (localStorage). Para usar uma API, implemente os mesmos
métodos retornando *Promises* (ex.: `ApiRepository` com `fetch`) e troque
a instância em `js/app.js`. As telas não mudam.
