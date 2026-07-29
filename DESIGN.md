# Oblivian — DESIGN.md

Guia de identidade visual para gerar telas novas consistentes. Fonte da verdade: `styles/tokens.css` (tokens), `styles/base.css` (reset/utilitários), `styles/components.css` (componentes). **Nunca hardcodar cor/spacing/raio — sempre usar os tokens abaixo.**

## Personalidade

App social mobile-first estilo Amino. Dark por padrão, acento roxo vibrante, superfícies em camadas, cantos generosos, movimento sutil. Denso mas respirável. Idioma da UI: **português (BR)**.

## Cores

Tema via `[data-theme]` (dark é o padrão). Comunidades sobrescrevem `--accent` dentro de `.community-scope`.

| Token | Dark | Uso |
|---|---|---|
| `--bg` | `#0e0f15` | fundo (usar `--bg-grad`: radial roxo sutil no topo-direito) |
| `--surface` | `#171922` | cards, modais, painéis |
| `--surface-2` | `#1f222e` | inputs, hover, chips |
| `--surface-3` | `#272b39` | hover de nível 2, thumbs |
| `--border` / `--border-strong` | `#2a2e3c` / `#3a3f50` | bordas 1px em toda superfície |
| `--text` / `--text-dim` / `--text-mute` | `#f2f3f7` / `#b9bdcc` / `#7d8295` | hierarquia de texto em 3 níveis |
| `--accent` | `oklch(0.58 0.21 289)` ≈ `#7c59ec` | ação primária, links, aba ativa (AA c/ branco) |
| `--accent-2` | `oklch(0.585 0.21 310)` | segunda parada de gradientes |
| `--accent-soft` | `rgba(124,89,236,.16)` | fundos de tag/ícone com texto `--accent` |
| `--danger` / `--warn` / `--ok` / `--rep` | `#ff5470` / `#ffb454` / `#36d399` / `#ffcf5c` | status; variantes `-soft` p/ fundo |

Regras: superfícies empilham surface→2→3 (nunca sombra pra separar níveis internos); gradiente accent→accent-2 em 135deg (`in oklch`) só p/ avatares fallback e destaques; status sempre par soft-bg + cor-texto.

## Tipografia

- `--font-sans`: Inter (variável, auto-hospedada — sem CDN). `--font-display` (Clash Display) reservada p/ títulos hero.
- Escala: 12 / 14 / 16 / 18 / 22 / 28 / 36 (`--fs-xs`…`--fs-3xl`). Corpo = 16, secundário = 14, meta/labels = 12.
- Pesos: 400 corpo, 500 medium, 600 botões/nomes, 700 títulos. Títulos `line-height: 1.2`, corpo `1.5`.
- Labels de seção (catálogos, grupos): `--fs-xs` + bold + `uppercase` + `letter-spacing: .06em` + `--text-mute`.
- Números (contadores): `font-variant-numeric: tabular-nums`.

## Espaçamento, raios, sombra

- Escala 4px: `--s-1`(4) `--s-2`(8) `--s-3`(12) `--s-4`(16) `--s-5`(24) `--s-6`(32) `--s-7`(48). Padding padrão de card/tela = `--s-4`.
- Raios: `--r-sm` 8 (código, focus) · `--r-md` 12 (botões, inputs, avatar quadrado, menus) · `--r-lg` 16 (cards, sheets) · `--r-xl` 24 (modais) · `--r-pill` (chips, tags, searchbar, toasts).
- Sombras só em elementos flutuantes: `--shadow-soft` (cards) e `--shadow-pop` (modal, menu, toast). Elementos no fluxo separam por **borda**, não sombra.

## Componentes (reusar, não recriar)

- **Botão** `.btn`: 40px alto, `--r-md`, semibold 14px. Variantes: `--primary` (accent sólido), `--ghost`, `--outline`, `--danger` (soft→sólido no hover), `--sm` 34px, `--lg` 48px, `--icon`. Ativo: `translateY(1px)`. Loading: `.is-loading` (conteúdo some, spinner herda cor).
- **Card** `.card` / `.panel`: surface + borda 1px + `--r-lg`; `.card--pad` = `--s-4`.
- **Avatar** `.avatar`: quadrado `--r-md` por padrão (`--round` p/ círculo), fallback = gradiente accent + inicial. Tamanhos 28/36/44/64/104.
- **Tag/chip**: `.tag` 26px pill accent-soft; `.chip` 30px pill neutro, `.is-active` = accent sólido.
- **Input** `.input`/`.textarea`/`.select`: surface-2, borda 1px, `--r-md`, min-height 44px; focus = borda accent (sem glow). `.searchbar` = pill 42px.
- **Tabs** `.tabs`: underline 2px accent na ativa. `.segmented`: pill com thumb deslizante (spring cubic-bezier).
- **Modal** `.modal`: `--r-xl`, `--shadow-pop`; **em mobile (<640px) vira bottom-sheet** (raio só em cima, anima de baixo). `.action-sheet` p/ menus de ação; `.menu` p/ dropdown de contexto.
- **Toast**: pill flutuante embaixo, centro; acima da bottom-nav no mobile.
- **Vazio** `.empty`: ícone 40px opacidade .6 + texto mute, centrado, padding `--s-7`.
- **Skeleton** `.skeleton`: shimmer surface-2↔3.
- **Ícones** `svg.icon`: linha 2px, round caps, `currentColor`, 22px (18/26/34 via `data-size`). Nunca emoji como ícone de UI.

## Layout

- Mobile-first. Desktop: sidebar `--sidebar-w` 264px (rail 76px), conteúdo máx `--content-max` 1080px. Mobile: bottom-nav 64px, topbar 60px.
- Scroll vive em `.view` (body é `overflow:hidden`); scrollbars ocultas globalmente.
- Touch targets ≥ 40px. `env(safe-area-inset-*)` em barras fixas (Capacitor).

## Movimento

- Durações: `--t-fast` 120ms, `--t-mid` 200ms, ease. Entradas: `fade`, `pop` (fade+8px+scale .98), `sheet` (de baixo). Saídas = mesma animação em `reverse`.
- Troca de tela: `.route-enter` 260ms `cubic-bezier(0.2,0.8,0.3,1)`, só translateY(8px) — sem fade de tela inteira, sem flash branco (router segura a tela antiga até a nova ter conteúdo).
- Hover de chips/cards clicáveis: `translateY(-1px)` + sombra leve. Press: `scale(.96)`.
- **Sempre** respeitar `prefers-reduced-motion` e `[data-reduce-motion="1"]` (config do usuário).

## Acessibilidade

- `:focus-visible`: outline 2px accent, offset 2px.
- Texto sobre accent = branco (par testado AA 4.67:1). Não colocar texto mute sobre surface-3.
- `.u-sr` p/ labels só-de-leitor.

## Não fazer

- Não usar CDN de fontes/libs (build Capacitor offline).
- Não criar novo tom de cinza/roxo — só tokens.
- Não usar sombra p/ separar itens de lista (usar hover surface-2 ou borda).
- Não animar `width/height/top/left` — só `transform`/`opacity`.
- Não usar emoji como ícone; ícones são SVG stroke.
- Não esquecer tema claro: toda cor nova precisa funcionar nos dois temas (usar tokens resolve).
