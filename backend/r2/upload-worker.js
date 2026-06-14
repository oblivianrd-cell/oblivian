/* ============================================================
   Cloudflare Worker — assina uploads para o R2.
   O segredo do R2 NUNCA vai ao cliente: o cliente pede uma URL
   de upload aqui; o Worker valida e devolve uma URL temporária.
   Deploy: wrangler deploy. Bind do bucket R2 como env.BUCKET.
   ============================================================ */
export default {
  async fetch(request, env) {
    const cors = {
      "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    // TODO: validar o JWT do Supabase (Authorization: Bearer ...) antes de assinar.
    // Verifique a assinatura com a JWKS do seu projeto Supabase para impedir abuso.

    let body = {};
    try { body = await request.json(); } catch (_) {}
    const kind = (body.kind || "post").replace(/[^a-z0-9_-]/gi, "");
    const mime = body.mime === "image/webp" ? "image/webp" : "application/octet-stream";

    // chave única do objeto
    const id = crypto.randomUUID();
    const key = `${kind}/${id}.webp`;

    // Opção A (simples): o Worker recebe o arquivo e grava direto no bucket.
    //   -> troque o fluxo do cliente para enviar o blob aqui (multipart/PUT).
    // Opção B (URL assinada S3): gere uma presigned PUT com as credenciais S3 do R2.
    //   Requer assinatura AWS SigV4 (use aws4fetch). Mantenha as chaves em env.

    // Exemplo Opção A — grava agora se o corpo trouxer o arquivo via segundo passo PUT:
    // (este exemplo retorna a própria rota como "uploadUrl" para um PUT subsequente)
    const uploadUrl = new URL(request.url);
    uploadUrl.pathname = "/put";
    uploadUrl.searchParams.set("key", key);

    return new Response(JSON.stringify({ key, uploadUrl: uploadUrl.toString(), mime }), {
      headers: { "content-type": "application/json", ...cors },
    });
  },
};

/* Rota /put (mesma Worker) — exemplo de gravação direta no R2:
   if (url.pathname === "/put" && request.method === "PUT") {
     const key = url.searchParams.get("key");
     await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: "image/webp" } });
     return new Response(JSON.stringify({ ok: true, key }), { headers: cors });
   }
*/
