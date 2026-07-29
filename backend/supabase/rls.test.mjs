// Teste de RLS/hardening do schema.sql contra um backend Supabase-compatível
// (tinbase no CI — npx tinbase start — ou um projeto Supabase de teste).
// Uso: node backend/supabase/rls.test.mjs   (precisa de @supabase/supabase-js instalado)
// Env: TINBASE_URL (default http://127.0.0.1:54321), TINBASE_ANON_KEY, TINBASE_SERVICE_KEY
import { createClient } from "@supabase/supabase-js";

const URL = process.env.TINBASE_URL || "http://127.0.0.1:54321";
// chaves demo padrão do Supabase local-dev (tinbase usa as mesmas)
const ANON = process.env.TINBASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.TINBASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let fails = 0;
const pass = (n) => console.log("  PASS", n);
const fail = (n, d) => { fails++; console.error("  FAIL", n, d || ""); };

const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL, SERVICE, noSession);

const RUN = Date.now().toString(36); // emails únicos por run → re-rodável contra DB persistente
async function makeUser(tag) {
  const email = `${tag}-${RUN}@rls-test.local`;
  const password = "senha-teste-123";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  const client = createClient(URL, ANON, noSession);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`signIn ${tag}: ${e2.message}`);
  return { client, id: data.user.id };
}

// espera erro cujo message casa com `re`
async function expectError(name, builder, re) {
  const { error } = await builder;
  if (error && (!re || re.test(error.message))) pass(name);
  else fail(name, error ? `erro errado: ${error.message}` : "AÇÃO PERMITIDA (deveria bloquear)");
}

const A = await makeUser("alice");
const B = await makeUser("bob");

console.log("perfil + carteira (triggers handle_new_user / ensure_wallet)");
{
  const { data: p } = await A.client.from("profiles").select("handle").eq("id", A.id).single();
  p?.handle ? pass("profile criado no signup") : fail("profile criado no signup");
  const { data: w } = await A.client.from("wallets").select("balance").eq("user_id", A.id).single();
  w?.balance === 200 ? pass("wallet inicia com 200") : fail("wallet inicia com 200", JSON.stringify(w));
}

console.log("wallet: cliente não escreve, nem lê a dos outros");
{
  const { data } = await A.client.from("wallets").update({ balance: 999999 }).eq("user_id", A.id).select();
  (!data || data.length === 0) ? pass("update no próprio saldo bloqueado") : fail("update no próprio saldo bloqueado");
  const { data: w } = await A.client.from("wallets").select("*").eq("user_id", B.id);
  (!w || w.length === 0) ? pass("saldo alheio invisível") : fail("saldo alheio invisível");
}

console.log("escalada de privilégio em community_profiles (trg_guard_cprofile)");
{
  const { data: comm, error } = await A.client.from("communities")
    .insert({ name: "Reino Teste", owner_id: A.id }).select().single();
  if (error) fail("criar comunidade", error.message);
  else {
    pass("criar comunidade");
    await A.client.from("community_profiles").insert({ user_id: A.id, community_id: comm.id, role: "owner" });
    const { data: bRow } = await B.client.from("community_profiles")
      .insert({ user_id: B.id, community_id: comm.id, role: "owner" }).select().single();
    bRow?.role === "member" ? pass("insert role=owner rebaixado p/ member") : fail("insert role=owner rebaixado p/ member", JSON.stringify(bRow));
    await expectError("self-promote via UPDATE role bloqueado",
      B.client.from("community_profiles").update({ role: "owner" }).eq("id", bRow.id).select().single(),
      /cannot change role/i);
    await expectError("self-unban via UPDATE status bloqueado",
      B.client.from("community_profiles").update({ status: { x: 1 } }).eq("id", bRow.id).select().single(),
      /cannot change moderation status/i);
  }
}

console.log("anti-spam: rate limit de posts (10/60s)");
{
  let hit = null;
  for (let i = 0; i < 11; i++) {
    const { error } = await A.client.from("posts").insert({ user_id: A.id, title: "t" + i, body: "x" });
    if (error) { hit = { i, error }; break; }
  }
  (hit && hit.i === 10 && /rate limit/i.test(hit.error.message))
    ? pass("11º post barrado")
    : fail("11º post barrado", hit ? `parou no ${hit.i}: ${hit.error.message}` : "11 posts passaram");
}

console.log("handle só muda uma vez (trg_handle_once)");
{
  const { error: e1 } = await A.client.from("profiles").update({ handle: "alice_nova" }).eq("id", A.id);
  e1 ? fail("1ª troca de handle", e1.message) : pass("1ª troca de handle");
  await expectError("2ª troca bloqueada",
    A.client.from("profiles").update({ handle: "alice_denovo" }).eq("id", A.id).select().single(),
    /uma vez/i);
}

console.log("economia: credit_ad_reward + purchase_item");
{
  const { data, error } = await A.client.rpc("credit_ad_reward");
  const row = Array.isArray(data) ? data[0] : data;
  (!error && row?.balance === 250) ? pass("recompensa de anúncio credita 50") : fail("recompensa de anúncio credita 50", error?.message || JSON.stringify(data));
  await expectError("cooldown de anúncio ativo", A.client.rpc("credit_ad_reward"), /cooldown/i);
  await expectError("compra sem saldo bloqueada", A.client.rpc("purchase_item", { p_item_id: "frame_gold" }), /insufficient/i);

  // caminho feliz: service_role dá saldo, compra debita e entrega o item
  await admin.from("wallets").update({ balance: 1000 }).eq("user_id", A.id);
  const { data: buy, error: eBuy } = await A.client.rpc("purchase_item", { p_item_id: "hl_post" });
  const bought = Array.isArray(buy) ? buy[0] : buy;
  (!eBuy && bought?.balance === 700) ? pass("compra debita saldo (1000-300=700)") : fail("compra debita saldo (1000-300=700)", eBuy?.message || JSON.stringify(buy));
  const { data: owned } = await A.client.from("user_items").select("item_id").eq("user_id", A.id).eq("item_id", "hl_post");
  owned?.length === 1 ? pass("item entregue em user_items") : fail("item entregue em user_items");
  await expectError("recompra do mesmo item bloqueada", A.client.rpc("purchase_item", { p_item_id: "hl_post" }), /already owned/i);
}

console.log("push_notification endurecida");
{
  await expectError("tipo inválido rejeitado",
    B.client.rpc("push_notification", { p_user: A.id, p_cat: "all", p_type: "voce_ganhou", p_icon: "bell", p_title: "x", p_sub: "", p_to: null }),
    /invalid notification type/i);
  await expectError("rota externa rejeitada",
    B.client.rpc("push_notification", { p_user: A.id, p_cat: "all", p_type: "follow", p_icon: "bell", p_title: "x", p_sub: "", p_to: "https://phish.example" }),
    /invalid notification target/i);
}

console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO PASSOU");
process.exit(fails ? 1 : 0);
