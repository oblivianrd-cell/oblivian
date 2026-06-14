# Integração de backend — Supabase + Cloudflare R2

Estado atual: app roda 100% local (`LocalRepository` + localStorage). Já existe um
**protótipo funcional de moedas/loja/anúncio** local. Este guia liga o backend real
mantendo o mesmo contrato (`App.Repository`), sem reescrever as telas.

> ⚠️ Segredos NUNCA no repositório. Só a `anon key` (pública) do Supabase vai ao
> cliente — a RLS protege os dados. Chaves do R2 ficam só no Worker.

## Arquivos
- `backend/supabase/schema.sql` — schema completo:
  - **Economia** (seções 1–8): perfis, carteira, loja, anúncio. Funções `credit_ad_reward`, `purchase_item`.
  - **Núcleo social** (seções 9–11): comunidades, membros, chats, mensagens, follows, bloqueios, salvos, favoritos, curtidas, reações, notificações, moderação, denúncias. RLS por tabela + **Realtime** ligado em messages/posts/comments/notifications/chats. Helpers `is_member/is_staff/my_role/can_see_chat`, trigger `bump_chat`, função `push_notification`.
- `js/data/config.example.js` — modelo de config (copie p/ `js/data/config.js`).
- `js/data/supabaseRepository.js` — implementação real (auth + economia prontos).
- `backend/r2/upload-worker.js` — Worker que assina/recebe uploads p/ o R2.

## Passo a passo

### 1. Supabase
1. Crie projeto em supabase.com.
2. SQL Editor → cole e rode `backend/supabase/schema.sql`.
3. Settings → API → copie **Project URL** e **anon key**.
4. Authentication → habilite Email (ou OAuth).

### 2. Config no front
```bash
cp js/data/config.example.js js/data/config.js   # preencha url + anonKey
echo "js/data/config.js" >> .gitignore            # não comitar chaves
```

### 3. Ativar SupabaseRepository
No `index.html`, antes de `js/app.js`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/data/config.js"></script>
<script src="js/data/supabaseRepository.js"></script>
```
No `js/app.js`, troque:
```js
App.repo = new App.LocalRepository();
// por:
App.repo = new App.SupabaseRepository();
```
(Falta tela de login — `signIn/signUp` já existem no repo; criar UI.)

### 4. Cloudflare R2
1. Crie bucket no R2.
2. `wrangler deploy` do `backend/r2/upload-worker.js` com bind `BUCKET` → seu bucket.
3. Defina `ALLOWED_ORIGIN` = domínio da Vercel.
4. **Valide o JWT do Supabase no Worker** antes de assinar (TODO marcado no arquivo).
5. Preencha `r2.uploadEndpoint` e `r2.publicBase` no `config.js`.

### 5. Imagens → WebP
`supabaseRepository.uploadImage()` converte p/ WebP no cliente (via `App.util.downscaleImage`)
antes de subir. Ajuste `quality`/`maxDim` por tipo (avatar 300KB, capa 1MB, post 1–1.5MB).
> Confirme se `downscaleImage` aceita `mime:"image/webp"`; se não, ajuste o util p/ exportar WebP.

## Regras server-side (anti-fraude) — já no schema
- `credit_ad_reward()`: 50 moedas, máx **5/dia**, **cooldown 60s**, grava `ads_rewards` + `coin_transactions`.
- `purchase_item()`: debita atômico, impede saldo negativo e item duplicado.
- RLS: cliente **lê** a carteira mas **não escreve** — saldo só muda pelas funções `SECURITY DEFINER`.

## Anúncios reais
Trocar o anúncio simulado (`openRewardedAd` em `js/screens/store.js`) pelo SDK escolhido
(AdMob/AppLovin). No callback de **conclusão** da rede → chamar `App.repo.claimAdReward(true)`.
Em mobile/WebView, o SDK nativo confirma; idealmente o callback bate num endpoint server-to-server
antes de creditar (server-side verification).

## Pendências desta fase
- **Portar métodos sociais no `supabaseRepository.js`** — tabelas já existem (schema seções 9–11). Falta implementar contra elas: comunidades, memberships, chats/mensagens (com Realtime subscriptions), follows, posts/comentários, notificações, moderação. Mesmo padrão da economia.
- UI de login/cadastro (auth).
- Validação de JWT no Worker do R2.
- Verificação server-to-server do anúncio (produção).
- PRODUÇÃO: mover `setRole`/moderação p/ RPCs `SECURITY DEFINER` (hoje liberados por policy de staff com `with check (true)`).

## Realtime (chat ao vivo)
Schema já adiciona as tabelas à publicação `supabase_realtime`. No repo, assinar:
```js
this.sb.channel('chat:' + chatId)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'chat_id=eq.' + chatId },
      function (p) { App.bus.emit('message:new', { chatId: chatId, message: p.new }); })
  .subscribe();
```
