/* ============================================================
   build.mjs — Monta dist/ só com os arquivos web do app.
   Exclui mobile/ (Capacitor, 230M), backend/, docs/, apk.
   Uso: node build.mjs   (gera dist/ pronto p/ Cloudflare Pages)
   ============================================================ */
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";

const OUT = "dist";

// arquivos soltos da raiz que vão pro deploy
// APK NÃO vai pro dist: é servido pelo GitHub Releases (releases/latest/download/oblivian.apk),
// evitando o limite de 25MiB do Cloudflare. Atualize com `node scripts/apk-release.mjs`.
// logo.png vive em assets/ (copiado junto com a pasta) — não precisa estar aqui.
const FILES = ["index.html", "manifest.webmanifest", ".nojekyll"];
// páginas estáticas que vivem em pages/ mas são servidas na raiz do site (links do rodapé)
const PAGES = ["privacidade.html", "termos.html", "diretrizes.html", "glass-test.html", "add-to-basket.html"];
// pastas que vão pro deploy
const DIRS = ["assets", "styles", "js", "fonts"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const d of DIRS) {
  if (existsSync(d)) cpSync(d, `${OUT}/${d}`, { recursive: true });
  else console.warn(`[build] aviso: pasta ausente: ${d}`);
}
for (const f of FILES) {
  if (existsSync(f)) cpSync(f, `${OUT}/${f}`);
  else console.warn(`[build] aviso: arquivo ausente: ${f}`);
}
// pages/ → raiz do dist (mantém URLs /privacidade.html etc dos links do rodapé)
for (const f of PAGES) {
  if (existsSync(`pages/${f}`)) cpSync(`pages/${f}`, `${OUT}/${f}`);
  else console.warn(`[build] aviso: página ausente: pages/${f}`);
}

/* _headers (Cloudflare Pages): fontes imutáveis (nome estável);
   js/styles/html revalidam (sem hash no nome → evita app velho em cache);
   headers de segurança em tudo. */
writeFileSync(`${OUT}/_headers`, `/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/oblivian.apk
  Content-Type: application/vnd.android.package-archive
  Content-Disposition: attachment; filename="Oblivian.apk"
  Cache-Control: public, max-age=3600
/assets/*
  Cache-Control: public, max-age=86400
/js/*
  Cache-Control: no-cache
/styles/*
  Cache-Control: no-cache
/*
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
`);

/* _redirects (Cloudflare Pages): força o domínio bonito.
   Qualquer acesso ao subdomínio padrão *.pages.dev vai 301 p/ oblivian.net.
   :splat preserva o caminho; o fragmento (#/rota) é mantido pelo navegador. */
writeFileSync(`${OUT}/_redirects`, `https://obliviny.pages.dev/* https://oblivian.net/:splat 301
`);

/* carimbo de versão: o app compara com /version.txt e recarrega quando muda.
   Gravamos o MESMO carimbo dentro do bundle (app.js) p/ comparar carregado-vs-servidor:
   assim a SPA aberta detecta que está velha mesmo se a 1ª leitura já vier nova. */
const STAMP = String(Date.now());
writeFileSync(`${OUT}/version.txt`, STAMP);
const appPath = `${OUT}/js/app.js`;
if (existsSync(appPath)) {
  const src = readFileSync(appPath, "utf8");
  if (src.indexOf("__BUILD_STAMP__") < 0) console.warn("[build] aviso: placeholder __BUILD_STAMP__ não encontrado em app.js");
  writeFileSync(appPath, src.replace("__BUILD_STAMP__", STAMP));
}

/* cache-busting: carimba ?v=STAMP em todo <script>/<link> local (js/ e styles/).
   index.html é no-cache (sempre revalida) → as URLs novas obrigam o navegador a
   buscar JS/CSS frescos em vez de reaproveitar uma cópia velha da URL "pelada". */
const idxPath = `${OUT}/index.html`;
if (existsSync(idxPath)) {
  let html = readFileSync(idxPath, "utf8");
  html = html.replace(/(src|href)="((?:js|styles)\/[^"?#]+)"/g, `$1="$2?v=${STAMP}"`);
  writeFileSync(idxPath, html);
}

const count = (p) => existsSync(p) ? readdirSync(p, { recursive: true }).length : 0;
console.log(`[build] dist/ pronto — ${DIRS.reduce((n, d) => n + count(`${OUT}/${d}`), 0)} arquivos em pastas + ${FILES.length} soltos`);
