# Smoke test contra o Supabase REAL + site no ar — o que o rls-test (WASM) não pega:
# projeto pausado, config de auth, deploy quebrado.
# A key é a publishable (anon) — pública por design, já servida em oblivian.net.
# Rodar local: hurl --test backend/supabase/smoke.hurl

# Auth API de pé (health exige apikey desde 2025)
GET https://iukovmmphkpshrpxymri.supabase.co/auth/v1/health
apikey: sb_publishable_nrsuEnyv8UFQ6lf3tTMR_Q_s3XQtcK6
HTTP 200

# REST responde com anon key (também serve de keepalive do free tier)
GET https://iukovmmphkpshrpxymri.supabase.co/rest/v1/profiles?select=id&limit=1
apikey: sb_publishable_nrsuEnyv8UFQ6lf3tTMR_Q_s3XQtcK6
Authorization: Bearer sb_publishable_nrsuEnyv8UFQ6lf3tTMR_Q_s3XQtcK6
HTTP 200

# RLS de produção: anônimo não escreve
POST https://iukovmmphkpshrpxymri.supabase.co/rest/v1/profiles
apikey: sb_publishable_nrsuEnyv8UFQ6lf3tTMR_Q_s3XQtcK6
Authorization: Bearer sb_publishable_nrsuEnyv8UFQ6lf3tTMR_Q_s3XQtcK6
Content-Type: application/json
{}
HTTP *
[Asserts]
status >= 400

# Site no ar
GET https://oblivian.net
HTTP 200
