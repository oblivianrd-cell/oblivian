import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
const OUT = "C:/Users/Kazuki/Documents/Projeto Oblivian/motions-full.html";

const j = JSON.parse(readFileSync(SRC, "utf8"));
const items = (j.result || []).filter(Boolean);

// alguns html vêm com entidades escapadas (&lt; &gt; &amp; &quot; &#39;)
function unesc(s) {
  if (!s) return "";
  // só desescapa se parecer escapado (tem &lt; mas não tem < real de tag)
  const looksEscaped = /&lt;\w/.test(s);
  if (!looksEscaped) return s;
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

items.sort((a, b) => a.id.localeCompare(b.id));

// alguns agentes esqueceram o elemento-root com a classe-prefixo (a caixa
// dimensionada/estilizada). Sem ele, CSS com seletor descendente ".PREFIX .X"
// não casa e o card fica em branco. Detecta e envolve.
function rootHasPrefix(html, prefix) {
  const m = (html || "").match(/^\s*<[a-zA-Z0-9]+\s+[^>]*class=["']([^"']+)["']/);
  return !!m && m[1].split(/\s+/).indexOf(prefix) >= 0;
}
let wrapped = [];
items.forEach(it => {
  let h = unesc(it.html || "");
  if (!rootHasPrefix(h, it.prefix)) { h = `<div class="${it.prefix}">${h}</div>`; wrapped.push(it.id); }
  it._html = h;   // html já desescapado e com root garantido
});
if (wrapped.length) console.log("[fix] root-prefix adicionado em:", wrapped.join(", "));

const styles = items.map(it => `/* ===== ${it.id} ===== */\n${it.css || ""}`).join("\n\n");

const cards = items.map((it, i) => {
  const html = it._html;
  return `<div class="g-card" data-kind="${it.kind || "loop"}">
  <div class="g-stage"><div class="g-holder" data-i="${i}" data-kind="${it.kind || "loop"}">${html}</div></div>
  <div class="g-meta">
    <div class="g-t"><span class="g-num">${String(i + 1).padStart(2, "0")}</span>${it.title || it.id}</div>
    <div class="g-d">${it.desc || ""}</div>
    <div class="g-s">Onde: <b>${it.suits || "—"}</b></div>
    <div class="g-src">${it.id}</div>
    <button class="g-replay">Repetir</button>
  </div>
</div>`;
}).join("\n");

const page = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Oblivian · Todos os Motions (yui540, MIT)</title>
<style>
:root{--bg:#0b0c11;--surface:#161823;--border:#2a2e3e;--text:#eef0f6;--mute:#9aa0b4;--accent:#7c59ec;--pink:#ff5fa2}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
header{max-width:1280px;margin:0 auto;padding:30px 24px 4px}
h1{margin:0;font-size:24px;letter-spacing:-.02em}
.sub{color:var(--mute);font-size:14px;margin-top:6px;max-width:760px}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 0}
.toolbar button,.toolbar input{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:9px 15px;font-size:13px;font-weight:600}
.toolbar button{cursor:pointer}.toolbar button:hover{border-color:var(--accent)}
.toolbar input{min-width:200px;font-weight:400}
.count{color:var(--mute);font-size:13px;align-self:center}
.g-grid{max-width:1280px;margin:18px auto 100px;padding:0 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.g-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:flex;flex-direction:column}
.g-stage{height:180px;display:grid;place-items:center;overflow:hidden;background:radial-gradient(120% 120% at 50% 0%,#1b1d2b,#0d0e15);position:relative}
.g-holder{display:grid;place-items:center}
.g-meta{padding:12px 14px 14px;border-top:1px solid var(--border)}
.g-t{font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px}
.g-num{font-size:10px;font-weight:800;color:#0b0c11;background:linear-gradient(135deg,var(--accent),var(--pink));padding:2px 7px;border-radius:6px}
.g-d{color:#cfd3e0;font-size:12px;margin-top:6px;line-height:1.45}
.g-s{color:var(--mute);font-size:12px;margin-top:5px}.g-s b{color:#c3b5ff}
.g-src{color:#5b6075;font-size:10px;margin-top:6px;font-family:ui-monospace,Menlo,Consolas,monospace}
.g-replay{margin-top:10px;cursor:pointer;border:1px solid var(--border);background:#1e2130;color:var(--text);padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600}
.g-replay:hover{border-color:var(--accent)}
.g-hide{display:none!important}

/* ====================== efeitos (escopados por prefixo) ====================== */
${styles}
</style>
</head>
<body>
<header>
  <h1>Todos os Motions — yui540/css-animations (MIT)</h1>
  <div class="sub">${items.length} efeitos extraídos do repo inteiro e recriados fiéis (keyframes reais, isolados por prefixo). Pesquise, toque todos, ou repita um. Diga os números que quer no Oblivian e eu aplico.</div>
  <div class="toolbar">
    <input id="q" placeholder="Filtrar (ex.: coração, loader, texto)…">
    <button id="all">▶ Repetir todos</button>
    <span class="count" id="count"></span>
  </div>
</header>
<div class="g-grid" id="grid">
${cards}
</div>
<script>
// guarda template inicial de cada holder p/ replay por re-montagem (reinicia animações CSS)
var holders = Array.prototype.map.call(document.querySelectorAll('.g-holder'), function(h){ return { el:h, tpl:h.innerHTML }; });
function replay(h){ var rec = holders.find(function(x){return x.el===h}); if(!rec) return; h.innerHTML=''; void h.offsetWidth; h.innerHTML=rec.tpl; }
document.querySelectorAll('.g-replay').forEach(function(b){ b.addEventListener('click', function(){ replay(b.closest('.g-card').querySelector('.g-holder')); }); });
document.getElementById('all').addEventListener('click', function(){
  var vis = Array.prototype.filter.call(document.querySelectorAll('.g-card'), function(c){return !c.classList.contains('g-hide')});
  vis.forEach(function(c,i){ setTimeout(function(){ replay(c.querySelector('.g-holder')); }, i*70); });
});
// busca
var cards = Array.prototype.slice.call(document.querySelectorAll('.g-card'));
var countEl = document.getElementById('count');
function refilter(q){
  q=(q||'').toLowerCase().trim(); var n=0;
  cards.forEach(function(c){
    var txt=c.querySelector('.g-meta').textContent.toLowerCase();
    var show=!q||txt.indexOf(q)>=0; c.classList.toggle('g-hide',!show); if(show)n++;
  });
  countEl.textContent=n+' / '+cards.length;
}
document.getElementById('q').addEventListener('input',function(e){refilter(e.target.value)});
refilter('');

// auto-repete os ONESHOT (entradas) p/ não congelarem na galeria; loops nativos seguem sozinhos.
holders.forEach(function(rec, idx){
  if(rec.el.getAttribute('data-kind') !== 'oneshot') return;
  setTimeout(function(){
    setInterval(function(){
      var card = rec.el.closest('.g-card');
      if(card && !card.classList.contains('g-hide')) replay(rec.el);
    }, 3600);
  }, (idx % 8) * 260);   // escalona o início p/ não piscar tudo junto
});
</script>
</body>
</html>`;

writeFileSync(OUT, page, "utf8");
console.log("[gallery] " + items.length + " efeitos → " + OUT + " (" + Math.round(page.length / 1024) + " KB)");
