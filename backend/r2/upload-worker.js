/* ============================================================
   Cloudflare Worker — upload de mídia para o R2 (Oblivian).
   O segredo do R2 NUNCA vai ao cliente. O cliente envia o blob
   já processado (storage.js: comprimido/WebP, ≤10MB, EXIF removido)
   com o JWT do Supabase no header Authorization; o Worker VALIDA o
   JWT, valida mime/tamanho e grava no bucket. Devolve a URL pública.

   Deploy:
     wrangler deploy
   wrangler.toml:
     [[r2_buckets]] binding = "BUCKET"  bucket_name = "oblivian-media"
     [vars] ALLOWED_ORIGIN = "https://oblivian.net"  PUBLIC_BASE = "https://cdn.SEU-DOMINIO.com"
     # segredo: wrangler secret put SUPABASE_JWT_SECRET   (Supabase → Settings → API → JWT Secret, HS256)

   Contrato (cliente — opts.uploader em App.storage.upload):
     POST <endpoint>            (mesmo URL de config.r2.uploadEndpoint)
       headers: Authorization: Bearer <supabase access_token>
                x-kind: post|avatar|banner|profile|comment|chat|community|temp
                x-mime: image/webp|image/jpeg|image/png|image/gif|video/webm
       body: o binário do arquivo (ArrayBuffer/Blob)
     resposta: { url, key }
   ============================================================ */

const ALLOWED_MIME = {
  "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png",
  "image/gif": "gif", "video/webm": "webm",
};
const MAX_BYTES = 10 * 1024 * 1024;          // 10 MB (igual ao storage.js do cliente)
const KINDS = { post: 1, avatar: 1, banner: 1, profile: 1, comment: 1, chat: 1, community: 1, temp: 1 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Verifica um JWT HS256 do Supabase com o JWT Secret do projeto.
   Retorna o payload se válido (assinatura + exp + aud), senão null. */
async function verifyJWT(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "HMAC", key, b64urlToBytes(sig), new TextEncoder().encode(h + "." + p)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;       // expirado
    if (payload.aud && payload.aud !== "authenticated") return null;        // só usuário logado
    if (!payload.sub) return null;                                          // sem user id
    return payload;
  } catch (_) { return null; }
}

export default {
  async fetch(request, env) {
    const cors = {
      "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, x-kind, x-mime",
      "access-control-max-age": "86400",
    };
    const json = (obj, status) => new Response(JSON.stringify(obj), {
      status: status || 200, headers: { "content-type": "application/json", ...cors },
    });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    // 1) autentica — JWT do Supabase obrigatório (fecha o abuso: ninguém sobe sem login)
    const auth = request.headers.get("authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const user = await verifyJWT(token, env.SUPABASE_JWT_SECRET);
    if (!user) return json({ error: "unauthorized" }, 401);

    // 2) valida mime + kind
    const mime = request.headers.get("x-mime") || "";
    const ext = ALLOWED_MIME[mime];
    if (!ext) return json({ error: "tipo não permitido" }, 415);
    const kind = (request.headers.get("x-kind") || "post").replace(/[^a-z0-9_-]/gi, "");
    if (!KINDS[kind]) return json({ error: "kind inválido" }, 400);

    // 3) lê o corpo + valida tamanho (≤10MB) — Content-Length antes de ler quando possível
    const declared = parseInt(request.headers.get("content-length") || "0", 10);
    if (declared && declared > MAX_BYTES) return json({ error: "arquivo muito grande (máx 10MB)" }, 413);
    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ error: "corpo vazio" }, 400);
    if (body.byteLength > MAX_BYTES) return json({ error: "arquivo muito grande (máx 10MB)" }, 413);

    // 4) grava no R2 sob caminho previsível por usuário (facilita limpeza ao banir)
    const id = crypto.randomUUID();
    const key = `${kind}/${user.sub}/${id}.${ext}`;
    try {
      await env.BUCKET.put(key, body, { httpMetadata: { contentType: mime } });
    } catch (e) {
      return json({ error: "falha ao gravar", detail: String(e && e.message || e) }, 500);
    }

    const base = (env.PUBLIC_BASE || "").replace(/\/+$/, "");
    return json({ key, url: base ? `${base}/${key}` : key });
  },
};
