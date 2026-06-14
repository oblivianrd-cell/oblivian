/* ============================================================
   apk-release.mjs — Publica/atualiza o APK no GitHub Releases.
   O app (site) baixa SEMPRE de:
     https://github.com/oblivianrd-cell/oblivian/releases/latest/download/oblivian.apk
   Uso: node apk-release.mjs [versao]
        node apk-release.mjs            -> sobe como "manual-<timestamp>" (clobber em latest)
        node apk-release.mjs v1.2.0     -> cria release v1.2.0 com o APK
   Requer: gh CLI autenticado (gh auth status).
   ============================================================ */
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

const REPO = "oblivianrd-cell/oblivian";
const APK = "oblivian.apk";

if (!existsSync(APK)) { console.error(`[apk] ${APK} não encontrado na raiz. Rode o build do APK antes (cap sync + gradlew).`); process.exit(1); }
const mb = (statSync(APK).size / 1048576).toFixed(1);

// tag: argumento OU latest existente (clobber) OU uma nova
const arg = process.argv[2];
let tag = arg;
if (!tag) {
  try { tag = execSync(`gh release view --repo ${REPO} --json tagName -q .tagName`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { tag = null; }
}
if (!tag) tag = "v1.0.0";

const exists = (() => { try { execSync(`gh release view ${tag} --repo ${REPO}`, { stdio: "ignore" }); return true; } catch { return false; } })();

console.log(`[apk] ${APK} (${mb} MB) -> ${REPO} @ ${tag} (${exists ? "atualizando asset" : "criando release"})`);
if (exists) {
  execSync(`gh release upload ${tag} "${APK}" --clobber --repo ${REPO}`, { stdio: "inherit" });
} else {
  execSync(`gh release create ${tag} "${APK}" --repo ${REPO} -t "Oblivian ${tag}" -n "Baixe o app Oblivian para Android."`, { stdio: "inherit" });
}
console.log(`[apk] OK -> https://github.com/${REPO}/releases/latest/download/${APK}`);
