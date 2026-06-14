-- ============================================================
-- ⚠️ APLICAR SOMENTE EM UM PROJETO SUPABASE NOVO/VAZIO deste app.
-- NÃO aplicar sobre o backend "realms" antigo (qetxkvzcdgwqcjkrzrof,
-- 114 tabelas) — modelo incompatível (community_id vs realm_id).
-- Aquele schema antigo está arquivado em backend/supabase/EXISTING_*.json.
-- Em projeto novo e vazio, este arquivo é o schema correto do repo.
-- ============================================================
-- ============================================================
-- Obliviny — Supabase schema (Postgres + RLS)
-- Moedas, loja, anúncios, posts, mídia. Crédito de moeda é
-- SERVER-SIDE via funções SECURITY DEFINER (cliente não escreve
-- saldo direto). Rode no SQL Editor do Supabase.
-- ============================================================

-- Extensões
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PERFIS (espelho de auth.users)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  handle      text unique not null,
  name        text not null default '',
  bio         text default '',
  avatar_url  text,
  cover_url   text,
  created_at  timestamptz not null default now()
);

-- perfil por comunidade/reino (independente do global)
create table if not exists public.community_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  community_id  uuid not null,
  nickname      text,
  bio           text default '',
  reputation    int not null default 0,
  role          text not null default 'member',
  created_at    timestamptz not null default now(),
  unique (user_id, community_id)
);

-- ============================================================
-- 2. CARTEIRA + TRANSAÇÕES
-- ============================================================
create table if not exists public.wallets (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        bigint not null,                 -- + ganho, - gasto
  kind          text not null check (kind in ('ad','purchase','grant','refund')),
  ref           text,
  note          text default '',
  balance_after bigint,
  created_at    timestamptz not null default now()
);
create index if not exists idx_coin_tx_user on public.coin_transactions(user_id, created_at desc);

-- registro de anúncios assistidos (anti-fraude)
create table if not exists public.ads_rewards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      bigint not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ads_user_time on public.ads_rewards(user_id, created_at desc);

-- ============================================================
-- 3. LOJA
-- ============================================================
create table if not exists public.store_items (
  id          text primary key,
  category    text not null,        -- frame|theme|bubble|postHighlight|profileHighlight|special
  name        text not null,
  description text default '',
  price       bigint not null check (price >= 0),
  rarity      text not null default 'comum',
  value       text,
  icon        text default 'star',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     text not null references public.store_items(id),
  equipped    boolean not null default false,
  acquired_at timestamptz not null default now(),
  unique (user_id, item_id)
);

-- ============================================================
-- 4. CONTEÚDO
-- ============================================================
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null default 'text',
  title        text default '',
  body         text default '',
  payload      jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_posts_comm on public.posts(community_id, created_at desc);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  parent_id  uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- arquivos de mídia (apontam para objetos no Cloudflare R2)
create table if not exists public.media_files (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  r2_key      text not null,        -- chave do objeto no bucket R2
  url         text not null,        -- URL pública/assinada
  mime        text,                 -- ex.: image/webp
  bytes       bigint,
  width       int,
  height      int,
  kind        text,                 -- avatar|cover|post|frame|icon
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 5. CRÉDITO DE ANÚNCIO (server-side, atômico)
--    Regras: 50 moedas, máx 5/dia, cooldown 60s. NUNCA chamado
--    sem o callback de conclusão da rede de anúncios (no servidor).
-- ============================================================
create or replace function public.credit_ad_reward()
returns table (balance bigint, reward bigint, remaining int)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  reward_amt constant bigint := 50;
  daily_limit constant int := 5;
  cooldown interval := interval '60 seconds';
  today_count int;
  last_at timestamptz;
  new_balance bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select count(*), max(created_at) into today_count, last_at
    from public.ads_rewards
   where user_id = uid and created_at >= date_trunc('day', now());

  if today_count >= daily_limit then
    raise exception 'daily ad limit reached';
  end if;
  if last_at is not null and now() - last_at < cooldown then
    raise exception 'cooldown active';
  end if;

  insert into public.ads_rewards(user_id, amount) values (uid, reward_amt);

  insert into public.wallets(user_id, balance) values (uid, reward_amt)
    on conflict (user_id) do update set balance = wallets.balance + reward_amt, updated_at = now()
    returning wallets.balance into new_balance;

  insert into public.coin_transactions(user_id, amount, kind, note, balance_after)
    values (uid, reward_amt, 'ad', 'Recompensa de anúncio', new_balance);

  return query select new_balance, reward_amt, daily_limit - (today_count + 1);
end; $$;

-- ============================================================
-- 6. COMPRA DE ITEM (server-side, atômico)
-- ============================================================
create or replace function public.purchase_item(p_item_id text)
returns table (balance bigint, out_item_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  it public.store_items%rowtype;
  new_balance bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into it from public.store_items where id = p_item_id and active;
  if not found then raise exception 'item not found'; end if;
  if exists (select 1 from public.user_items ui where ui.user_id = uid and ui.item_id = p_item_id) then
    raise exception 'already owned';
  end if;

  update public.wallets set balance = balance - it.price, updated_at = now()
    where user_id = uid and balance >= it.price
    returning balance into new_balance;
  if not found then raise exception 'insufficient coins'; end if;

  insert into public.user_items(user_id, item_id) values (uid, p_item_id);
  insert into public.coin_transactions(user_id, amount, kind, ref, note, balance_after)
    values (uid, -it.price, 'purchase', p_item_id, 'Compra: ' || it.name, new_balance);

  return query select new_balance, p_item_id;
end; $$;

-- cria carteira automaticamente ao criar perfil
create or replace function public.ensure_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallets(user_id, balance) values (new.id, 200)
    on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists trg_ensure_wallet on public.profiles;
create trigger trg_ensure_wallet after insert on public.profiles
  for each row execute function public.ensure_wallet();

-- ============================================================
-- 7. RLS — Row Level Security
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.community_profiles  enable row level security;
alter table public.wallets             enable row level security;
alter table public.coin_transactions   enable row level security;
alter table public.ads_rewards         enable row level security;
alter table public.store_items         enable row level security;
alter table public.user_items          enable row level security;
alter table public.posts               enable row level security;
alter table public.comments            enable row level security;
alter table public.media_files         enable row level security;

-- perfis: leitura pública, escrita só do dono
create policy "profiles read"   on public.profiles for select using (true);
create policy "profiles write"  on public.profiles for update using (auth.uid() = id);
create policy "profiles insert" on public.profiles for insert with check (auth.uid() = id);

create policy "cprofiles read"  on public.community_profiles for select using (true);
create policy "cprofiles own"   on public.community_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- carteira: o dono SÓ LÊ. Escrita exclusivamente via funções (definer).
create policy "wallet read" on public.wallets for select using (auth.uid() = user_id);
-- (sem policy de insert/update p/ cliente → bloqueado; funções definer ignoram RLS)

create policy "coin_tx read" on public.coin_transactions for select using (auth.uid() = user_id);
create policy "ads read"     on public.ads_rewards       for select using (auth.uid() = user_id);

-- loja: catálogo público (leitura)
create policy "store read" on public.store_items for select using (true);

-- itens do usuário: dono lê; equip (update) do dono; compra via função
create policy "uitems read"   on public.user_items for select using (auth.uid() = user_id);
create policy "uitems equip"  on public.user_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- posts/comentários: leitura pública, escrita do autor
create policy "posts read"    on public.posts for select using (true);
create policy "posts write"   on public.posts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "comments read" on public.comments for select using (true);
create policy "comments write" on public.comments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- mídia: dono gerencia, leitura pública
create policy "media read"  on public.media_files for select using (true);
create policy "media write" on public.media_files for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 8. SEED do catálogo (espelha js/data/seed.js)
-- ============================================================
insert into public.store_items (id, category, name, description, price, rarity, value, icon) values
  ('frame_aqua','frame','Moldura Aqua','Anel azul-piscina no avatar.',500,'comum','#22d3ee','profile'),
  ('frame_rose','frame','Moldura Rosé','Anel rosa suave.',500,'comum','#ec4899','profile'),
  ('frame_gold','frame','Moldura Dourada','Anel dourado raro.',1500,'raro','#f5c542','crown'),
  ('frame_prism','frame','Moldura Prisma','Anel gradiente épico.',3000,'especial','linear-gradient(135deg,#7c5cff,#22d3ee,#ec4899)','star'),
  ('theme_violet','theme','Tema Violeta','Acento violeta no seu perfil.',1000,'comum','#7c5cff','palette'),
  ('theme_emerald','theme','Tema Esmeralda','Acento verde-esmeralda.',1000,'comum','#10b981','palette'),
  ('bubble_blue','bubble','Bolha Azul','Balão de chat azul.',700,'comum','#3b82f6','chat'),
  ('bubble_amber','bubble','Bolha Âmbar','Balão de chat âmbar.',700,'comum','#f59e0b','chat'),
  ('hl_post','postHighlight','Destaque de Postagem','Brilho nas suas postagens por 7 dias.',300,'comum','#7c5cff','featured'),
  ('hl_profile','profileHighlight','Destaque de Perfil','Selo de destaque no seu perfil.',800,'raro','#f5c542','star'),
  ('special_founder','special','Selo Fundador','Item especial raríssimo.',5000,'especial','#f5c542','shield')
on conflict (id) do nothing;

-- ============================================================
-- 9. NÚCLEO SOCIAL (comunidades, membros, chats, mensagens,
--    follows, bloqueios, salvos, favoritos, curtidas, reações,
--    notificações, moderação, denúncias).
--    Mapeia os models de js/data/models.js. Colunas em snake_case;
--    o supabaseRepository converte camelCase <-> snake_case.
-- ============================================================

-- ---------- 9.1 Comunidades ----------
create table if not exists public.communities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  icon        text,                                   -- url/r2 ou null
  cover       text,
  description text default '',
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  tags        text[] not null default '{}',
  theme       jsonb not null default '{"accent":"#7c59ec"}'::jsonb,
  settings    jsonb not null default '{}'::jsonb,     -- visibility/joinPolicy/tabs...
  created_at  timestamptz not null default now()
);
create index if not exists idx_comm_owner on public.communities(owner_id);

-- ---------- 9.2 Funções auxiliares (SECURITY DEFINER p/ evitar recursão de RLS) ----------
create or replace function public.is_member(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.community_profiles
                 where community_id = cid and user_id = auth.uid());
$$;

create or replace function public.my_role(cid uuid)
returns text language sql security definer stable set search_path = public as $$
  select role from public.community_profiles
   where community_id = cid and user_id = auth.uid();
$$;

create or replace function public.is_staff(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.community_profiles
                 where community_id = cid and user_id = auth.uid()
                   and role in ('owner','admin','lider','curador','mod'));
$$;

-- ---------- 9.3 Estende community_profiles p/ o model Membership completo ----------
alter table public.community_profiles
  add column if not exists nickname       text,
  add column if not exists avatar_url     text,
  add column if not exists cover_url      text,
  add column if not exists covers         jsonb  not null default '[]'::jsonb,
  add column if not exists cover_fx       text   default 'fade',
  add column if not exists cover_fx_speed text   default 'med',
  add column if not exists panel          text,
  add column if not exists panel_color    text   default '',
  add column if not exists text_color     text   default '',
  add column if not exists text_colors    jsonb  not null default '{}'::jsonb,
  add column if not exists tags           text[] not null default '{}',
  add column if not exists titles         text[] not null default '{}',
  add column if not exists status         jsonb,                       -- moderação ativa
  add column if not exists joined_at      timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cprofiles_community_fk') then
    alter table public.community_profiles
      add constraint cprofiles_community_fk
      foreign key (community_id) references public.communities(id) on delete cascade;
  end if;
end $$;

-- ---------- 9.4 Estende posts/comments p/ os models completos ----------
alter table public.posts
  add column if not exists reactions      jsonb  not null default '{}'::jsonb,  -- {emoji:[uid]}
  add column if not exists featured_until timestamptz,
  add column if not exists pinned         boolean not null default false,
  add column if not exists hidden         boolean not null default false,
  add column if not exists edited_at      timestamptz;
-- obs.: posts.body == post.text do app (o repo mapeia text<->body)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_community_fk') then
    alter table public.posts
      add constraint posts_community_fk
      foreign key (community_id) references public.communities(id) on delete cascade;
  end if;
end $$;

alter table public.comments
  add column if not exists media     jsonb not null default '[]'::jsonb,
  add column if not exists edited_at timestamptz;

-- ---------- 9.5 Grafo social (follows / blocks) ----------
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists idx_follows_following on public.follows(following_id);

create table if not exists public.blocks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

-- ---------- 9.6 Salvos / Favoritos / Curtidas / Reações ----------
create table if not exists public.saved_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table if not exists public.fav_communities (
  user_id      uuid not null references public.profiles(id)    on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, community_id)
);
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id)    on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id)    on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji   text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)            -- 1 reação por usuário por post
);

-- ---------- 9.7 Chats + mensagens ----------
create table if not exists public.chats (
  id              uuid primary key default gen_random_uuid(),
  type            text not null default 'community',     -- community|direct|group
  community_id    uuid references public.communities(id) on delete cascade,
  owner_id        uuid references public.profiles(id)    on delete set null,
  name            text default 'chat',
  description     text default '',
  read_only       boolean not null default false,
  visibility      text not null default 'public',        -- public|private
  allowed_roles   text[],                                -- privado: roles liberados
  participants    uuid[] not null default '{}',          -- direct/group
  title           text default '',
  requested_by    uuid references public.profiles(id)    on delete set null,
  accepted        boolean not null default true,
  cooldown_sec    int not null default 0,
  banned_words    text[] not null default '{}',
  wallpaper       text,                                  -- papel de parede COMPARTILHADO (todos os participantes veem)
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists idx_chats_comm  on public.chats(community_id);
create index if not exists idx_chats_parts on public.chats using gin(participants);
-- migração: papel de parede COMPARTILHADO do chat (DBs antigos não tinham a coluna)
alter table public.chats add column if not exists wallpaper text;

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats(id)    on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  text       text default '',
  media      jsonb not null default '[]'::jsonb,          -- [{type,src}] até 5
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_chat on public.messages(chat_id, created_at);

-- bump last_message_at quando chega mensagem (p/ ordenar conversas)
create or replace function public.bump_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  return new;
end $$;
drop trigger if exists trg_bump_chat on public.messages;
create trigger trg_bump_chat after insert on public.messages
  for each row execute function public.bump_chat();

-- quem pode ver um chat (definer → ignora RLS, sem recursão)
create or replace function public.can_see_chat(cid uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare ch public.chats%rowtype;
begin
  select * into ch from public.chats where id = cid;
  if not found then return false; end if;
  if ch.type in ('direct','group') then
    return auth.uid() = any(ch.participants);
  end if;
  if ch.visibility = 'public' then
    return public.is_member(ch.community_id);
  end if;
  return public.is_staff(ch.community_id)
      or (ch.allowed_roles is null and public.is_member(ch.community_id))
      or public.my_role(ch.community_id) = any(ch.allowed_roles);
end $$;

-- ---------- 9.8 Notificações ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,  -- destinatário
  cat        text not null default 'all',
  type       text not null default 'generic',
  icon       text default 'bell',
  title      text default '',
  sub        text default '',
  "to"       text,
  status     text,
  payload    jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, created_at desc);

-- cria notificação p/ OUTRO usuário (server-side; cliente não insere direto)
create or replace function public.push_notification(
  p_user uuid, p_cat text, p_type text, p_icon text,
  p_title text, p_sub text, p_to text, p_payload jsonb default '{}'::jsonb)
returns public.notifications language plpgsql security definer set search_path = public as $$
declare n public.notifications;
begin
  insert into public.notifications(user_id,cat,type,icon,title,sub,"to",payload)
    values (p_user,p_cat,p_type,p_icon,p_title,p_sub,p_to,coalesce(p_payload,'{}'::jsonb))
    returning * into n;
  return n;
end $$;

-- ---------- 9.9 Moderação + denúncias ----------
create table if not exists public.moderation (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid not null references public.communities(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id)    on delete cascade,
  by_user_id     uuid references public.profiles(id)             on delete set null,
  action         text not null,            -- ban|hide|mute
  reason         text default '',
  expires_at     timestamptz,              -- null = permanente
  created_at     timestamptz not null default now()
);
create index if not exists idx_mod_comm on public.moderation(community_id, created_at desc);

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  by_user_id   uuid not null references public.profiles(id) on delete cascade,
  target_type  text not null,             -- post|comment|user
  target_id    text not null,
  community_id uuid references public.communities(id) on delete cascade,
  reason       text default '',
  status       text not null default 'open',
  created_at   timestamptz not null default now()
);
create index if not exists idx_reports_comm on public.reports(community_id, created_at desc);

-- ============================================================
-- 10. RLS do núcleo social
-- ============================================================
alter table public.communities    enable row level security;
alter table public.follows        enable row level security;
alter table public.blocks         enable row level security;
alter table public.saved_posts    enable row level security;
alter table public.fav_communities enable row level security;
alter table public.post_likes     enable row level security;
alter table public.comment_likes  enable row level security;
alter table public.post_reactions enable row level security;
alter table public.chats          enable row level security;
alter table public.messages       enable row level security;
alter table public.notifications  enable row level security;
alter table public.moderation     enable row level security;
alter table public.reports        enable row level security;

-- comunidades: lê se pública, membro ou dono; cria como dono; edita staff/dono
create policy "comm read"   on public.communities for select
  using ((settings->>'visibility') is distinct from 'private'
         or public.is_member(id) or owner_id = auth.uid());
create policy "comm insert" on public.communities for insert with check (owner_id = auth.uid());
create policy "comm update" on public.communities for update
  using (owner_id = auth.uid() or public.is_staff(id));
create policy "comm delete" on public.communities for delete using (owner_id = auth.uid());

-- membership: staff edita os outros (role/status/moderação).
-- (As policies de leitura/dono já existem na seção 7: "cprofiles read"/"cprofiles own".)
-- PRODUÇÃO: mover setRole/moderação p/ RPCs SECURITY DEFINER e restringir colunas.
create policy "cprofiles staff" on public.community_profiles for update
  using (public.is_staff(community_id)) with check (true);

-- follows: leitura pública; só eu crio/removo os meus
create policy "follows read"  on public.follows for select using (true);
create policy "follows write" on public.follows for all
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());

-- bloqueios: privados (só eu vejo/edito os meus)
create policy "blocks own" on public.blocks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- salvos / favoritos: privados do dono
create policy "saved own" on public.saved_posts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fav own"   on public.fav_communities for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- curtidas / reações: leitura pública; escrita do próprio usuário
create policy "plike read"  on public.post_likes for select using (true);
create policy "plike write" on public.post_likes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clike read"  on public.comment_likes for select using (true);
create policy "clike write" on public.comment_likes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "react read"  on public.post_reactions for select using (true);
create policy "react write" on public.post_reactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- chats: lê quem pode ver; cria/edita staff (comunidade) ou participante (direct/group)
create policy "chats read" on public.chats for select using (public.can_see_chat(id));
create policy "chats insert" on public.chats for insert with check (
  case when type in ('direct','group')
       then auth.uid() = any(participants) or requested_by = auth.uid()
       else public.is_staff(community_id) end);
create policy "chats update" on public.chats for update using (
  case when type in ('direct','group')
       then auth.uid() = any(participants) or owner_id = auth.uid()
       else public.is_staff(community_id) or owner_id = auth.uid() end);
create policy "chats delete" on public.chats for delete using (
  case when type in ('direct','group')
       then auth.uid() = any(participants) or owner_id = auth.uid()
       else public.is_staff(community_id) or owner_id = auth.uid() end);

-- mensagens: lê se enxerga o chat; envia como você mesmo num chat que enxerga
create policy "msg read"   on public.messages for select using (public.can_see_chat(chat_id));
create policy "msg insert" on public.messages for insert
  with check (user_id = auth.uid() and public.can_see_chat(chat_id));
create policy "msg delete" on public.messages for delete using (user_id = auth.uid());

-- notificações: só o destinatário lê/atualiza. Inserção via push_notification() (definer).
create policy "notif read"   on public.notifications for select using (user_id = auth.uid());
create policy "notif update" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- moderação: staff da comunidade gerencia; alvo vê o próprio registro
create policy "mod read"  on public.moderation for select
  using (public.is_staff(community_id) or target_user_id = auth.uid());
create policy "mod write" on public.moderation for all
  using (public.is_staff(community_id)) with check (public.is_staff(community_id));

-- denúncias: qualquer autenticado abre (como você); staff da comunidade lê
create policy "reports insert" on public.reports for insert with check (by_user_id = auth.uid());
create policy "reports read"   on public.reports for select
  using (by_user_id = auth.uid() or (community_id is not null and public.is_staff(community_id)));

-- ============================================================
-- 11. REALTIME — habilita replicação p/ chat/feed/notificações ao vivo
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['messages','posts','comments','notifications','chats',
                            'post_likes','post_reactions'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================
-- 12. EXTRAS DE PARIDADE com o app (cosméticos do perfil global,
--     controle de não-lidas por chat).
-- ============================================================

-- perfil global ganha os campos cosméticos do model User
alter table public.profiles
  add column if not exists covers         jsonb  not null default '[]'::jsonb,
  add column if not exists cover_fx        text   default 'fade',
  add column if not exists cover_fx_speed  text   default 'med',
  add column if not exists panel           text,
  add column if not exists panel_color     text   default '',
  add column if not exists text_color      text   default '',
  add column if not exists text_colors     jsonb  not null default '{}'::jsonb;

-- marca de leitura por (usuário, chat) → base das não-lidas
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.chats(id)    on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);
alter table public.chat_reads enable row level security;
create policy "reads own" on public.chat_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- cria profile + wallet automaticamente quando um usuário se cadastra (auth.users)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base_handle text;
begin
  base_handle := split_part(new.email, '@', 1);
  insert into public.profiles (id, handle, name)
    values (new.id, base_handle || '_' || substr(new.id::text, 1, 4), base_handle)
    on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 13. HARDENING (Security Advisor / Postgres linter)
-- ============================================================

-- 13.1 policy de staff: WITH CHECK não-trivial (antes era 'true' = permissivo)
drop policy if exists "cprofiles staff" on public.community_profiles;
create policy "cprofiles staff" on public.community_profiles for update
  using (public.is_staff(community_id)) with check (public.is_staff(community_id));

-- 13.2 funções de TRIGGER não devem ser chamáveis via /rest/v1/rpc
--      (o trigger dispara mesmo sem EXECUTE concedido ao chamador)
revoke execute on function public.bump_chat()        from public, anon, authenticated;
revoke execute on function public.ensure_wallet()    from public, anon, authenticated;
revoke execute on function public.handle_new_user()  from public, anon, authenticated;

-- 13.3 RPCs de escrita: só usuário logado (tira do anon; mantém authenticated)
revoke execute on function public.credit_ad_reward() from anon;
revoke execute on function public.purchase_item(text) from anon;
revoke execute on function public.push_notification(uuid,text,text,text,text,text,text,jsonb) from anon;

-- NOTA: as funções helper de RLS (is_member/is_staff/my_role/can_see_chat) seguem
-- como SECURITY DEFINER no schema public porque as POLICIES as chamam (o papel
-- precisa de EXECUTE p/ avaliar a policy). O linter ainda avisa sobre elas — risco
-- baixo (só revelam booleanos da PRÓPRIA conta). P/ zerar o aviso: mover p/ um schema
-- 'private' (não exposto pela API) e apontar as policies p/ private.*. Pendência.
-- Os avisos de credit_ad_reward/purchase_item/push_notification p/ 'authenticated'
-- são INTENCIONAIS: o app chama essas RPCs logado.

-- ============================================================
-- MIGRATIONS aplicadas pós-baseline (via Management API no projeto ao vivo).
-- Idempotentes — rode de novo sem problema.
-- ============================================================

-- Presença/visto-por-último + privacidade (Realtime presence usa estas colunas p/ offline)
alter table public.profiles add column if not exists last_seen timestamptz;
alter table public.profiles add column if not exists hide_presence boolean not null default false;

-- DM 1:1: cria/acha via SECURITY DEFINER (usa auth.uid() no servidor → evita brigar com
-- o RLS WITH CHECK de chats quando o cliente não casa participants/requested_by).
create or replace function public.get_or_create_direct(target uuid)
returns public.chats
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ch public.chats;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target is null then raise exception 'target required'; end if;
  select * into ch from public.chats
    where type = 'direct'
      and participants @> array[me, target]::uuid[]
      and coalesce(array_length(participants,1),0) = 2
    limit 1;
  if found then return ch; end if;
  insert into public.chats(type, participants, requested_by, accepted)
    values ('direct', array[me, target]::uuid[], me,
            (me = target) or exists(select 1 from public.follows where follower_id = me and following_id = target))
    returning * into ch;
  return ch;
end $$;
grant execute on function public.get_or_create_direct(uuid) to authenticated;

-- ============================================================
-- PERF OPTIMIZATION (Performance Advisor 2026-06-07)
--   1) auth.uid() -> (select auth.uid())  → InitPlan, avaliado 1x/query (não por linha)
--   2) policies FOR ALL que coexistiam com "read"(SELECT true) viraram INSERT/UPDATE/DELETE
--      (removem a sobreposição no SELECT = multiple_permissive_policies)
--   3) community_profiles: own(FOR ALL) + staff(UPDATE) → insert/delete + 1 update merged
-- Semântica idêntica — só performance. Idempotente.
-- ============================================================

-- profiles
drop policy if exists "profiles write"  on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
create policy "profiles write"  on public.profiles for update using ((select auth.uid()) = id);
create policy "profiles insert" on public.profiles for insert with check ((select auth.uid()) = id);

-- community_profiles
drop policy if exists "cprofiles own"   on public.community_profiles;
drop policy if exists "cprofiles staff" on public.community_profiles;
create policy "cprofiles insert" on public.community_profiles for insert
  with check (user_id = (select auth.uid()));
create policy "cprofiles update" on public.community_profiles for update
  using (user_id = (select auth.uid()) or public.is_staff(community_id))
  with check (user_id = (select auth.uid()) or public.is_staff(community_id));
create policy "cprofiles delete" on public.community_profiles for delete
  using (user_id = (select auth.uid()));

-- wallets / coin_tx / ads / user_items
drop policy if exists "wallet read"  on public.wallets;
create policy "wallet read" on public.wallets for select using (user_id = (select auth.uid()));
drop policy if exists "coin_tx read" on public.coin_transactions;
create policy "coin_tx read" on public.coin_transactions for select using (user_id = (select auth.uid()));
drop policy if exists "ads read"     on public.ads_rewards;
create policy "ads read" on public.ads_rewards for select using (user_id = (select auth.uid()));
drop policy if exists "uitems read"  on public.user_items;
drop policy if exists "uitems equip" on public.user_items;
create policy "uitems read"  on public.user_items for select using (user_id = (select auth.uid()));
create policy "uitems equip" on public.user_items for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- posts / comments / media_files (write FOR ALL -> insert/update/delete)
drop policy if exists "posts write" on public.posts;
create policy "posts insert" on public.posts for insert with check (user_id = (select auth.uid()));
create policy "posts update" on public.posts for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "posts delete" on public.posts for delete using (user_id = (select auth.uid()));
drop policy if exists "comments write" on public.comments;
create policy "comments insert" on public.comments for insert with check (user_id = (select auth.uid()));
create policy "comments update" on public.comments for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "comments delete" on public.comments for delete using (user_id = (select auth.uid()));
drop policy if exists "media write" on public.media_files;
create policy "media insert" on public.media_files for insert with check (user_id = (select auth.uid()));
create policy "media update" on public.media_files for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "media delete" on public.media_files for delete using (user_id = (select auth.uid()));

-- communities
drop policy if exists "comm read"   on public.communities;
drop policy if exists "comm insert" on public.communities;
drop policy if exists "comm update" on public.communities;
drop policy if exists "comm delete" on public.communities;
create policy "comm read"   on public.communities for select
  using ((settings->>'visibility') is distinct from 'private'
         or public.is_member(id) or owner_id = (select auth.uid()));
create policy "comm insert" on public.communities for insert with check (owner_id = (select auth.uid()));
create policy "comm update" on public.communities for update
  using (owner_id = (select auth.uid()) or public.is_staff(id));
create policy "comm delete" on public.communities for delete using (owner_id = (select auth.uid()));

-- follows (write FOR ALL -> insert/update/delete)
drop policy if exists "follows write" on public.follows;
create policy "follows insert" on public.follows for insert with check (follower_id = (select auth.uid()));
create policy "follows update" on public.follows for update using (follower_id = (select auth.uid())) with check (follower_id = (select auth.uid()));
create policy "follows delete" on public.follows for delete using (follower_id = (select auth.uid()));

-- blocks / saved / fav (FOR ALL privado, sem read separado -> mantém FOR ALL)
drop policy if exists "blocks own" on public.blocks;
create policy "blocks own" on public.blocks for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "saved own" on public.saved_posts;
create policy "saved own" on public.saved_posts for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "fav own" on public.fav_communities;
create policy "fav own" on public.fav_communities for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- post_likes / comment_likes / post_reactions (write FOR ALL -> insert/update/delete)
drop policy if exists "plike write" on public.post_likes;
create policy "plike insert" on public.post_likes for insert with check (user_id = (select auth.uid()));
create policy "plike update" on public.post_likes for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "plike delete" on public.post_likes for delete using (user_id = (select auth.uid()));
drop policy if exists "clike write" on public.comment_likes;
create policy "clike insert" on public.comment_likes for insert with check (user_id = (select auth.uid()));
create policy "clike update" on public.comment_likes for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "clike delete" on public.comment_likes for delete using (user_id = (select auth.uid()));
drop policy if exists "react write" on public.post_reactions;
create policy "react insert" on public.post_reactions for insert with check (user_id = (select auth.uid()));
create policy "react update" on public.post_reactions for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "react delete" on public.post_reactions for delete using (user_id = (select auth.uid()));

-- chats
drop policy if exists "chats insert" on public.chats;
drop policy if exists "chats update" on public.chats;
drop policy if exists "chats delete" on public.chats;
create policy "chats insert" on public.chats for insert with check (
  case when type in ('direct','group')
       then (select auth.uid()) = any(participants) or requested_by = (select auth.uid())
       else public.is_staff(community_id) end);
create policy "chats update" on public.chats for update using (
  case when type in ('direct','group')
       then (select auth.uid()) = any(participants) or owner_id = (select auth.uid())
       else public.is_staff(community_id) or owner_id = (select auth.uid()) end);
create policy "chats delete" on public.chats for delete using (
  case when type in ('direct','group')
       then (select auth.uid()) = any(participants) or owner_id = (select auth.uid())
       else public.is_staff(community_id) or owner_id = (select auth.uid()) end);

-- messages
drop policy if exists "msg insert" on public.messages;
drop policy if exists "msg delete" on public.messages;
create policy "msg insert" on public.messages for insert
  with check (user_id = (select auth.uid()) and public.can_see_chat(chat_id));
create policy "msg delete" on public.messages for delete using (user_id = (select auth.uid()));

-- notifications
drop policy if exists "notif read"   on public.notifications;
drop policy if exists "notif update" on public.notifications;
create policy "notif read"   on public.notifications for select using (user_id = (select auth.uid()));
create policy "notif update" on public.notifications for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- moderation (write FOR ALL -> insert/update/delete; read mantém)
drop policy if exists "mod read"  on public.moderation;
drop policy if exists "mod write" on public.moderation;
create policy "mod read" on public.moderation for select
  using (public.is_staff(community_id) or target_user_id = (select auth.uid()));
create policy "mod insert" on public.moderation for insert with check (public.is_staff(community_id));
create policy "mod update" on public.moderation for update using (public.is_staff(community_id)) with check (public.is_staff(community_id));
create policy "mod delete" on public.moderation for delete using (public.is_staff(community_id));

-- reports
drop policy if exists "reports insert" on public.reports;
drop policy if exists "reports read"   on public.reports;
create policy "reports insert" on public.reports for insert with check (by_user_id = (select auth.uid()));
create policy "reports read"   on public.reports for select
  using (by_user_id = (select auth.uid()) or (community_id is not null and public.is_staff(community_id)));

-- chat_reads
drop policy if exists "reads own" on public.chat_reads;
create policy "reads own" on public.chat_reads for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- anon revoke também na DM (faltava no 13.3)
revoke execute on function public.get_or_create_direct(uuid) from anon;

-- ============================================================
-- ÍNDICES DE FK (Performance Advisor: unindexed foreign keys, 2026-06-07)
-- FK sem índice de cobertura → join/cascade-delete lento em escala.
-- (Só listadas as FKs cujo lado NÃO é coberto por PK/unique/índice já existente.)
-- ============================================================
create index if not exists idx_cprofiles_comm     on public.community_profiles(community_id);
create index if not exists idx_uitems_item        on public.user_items(item_id);
create index if not exists idx_posts_user         on public.posts(user_id);
create index if not exists idx_comments_post      on public.comments(post_id);
create index if not exists idx_comments_user      on public.comments(user_id);
create index if not exists idx_comments_parent    on public.comments(parent_id);
create index if not exists idx_media_user         on public.media_files(user_id);
create index if not exists idx_blocks_blocked     on public.blocks(blocked_id);
create index if not exists idx_saved_post         on public.saved_posts(post_id);
create index if not exists idx_fav_comm           on public.fav_communities(community_id);
create index if not exists idx_plike_user         on public.post_likes(user_id);
create index if not exists idx_clike_user         on public.comment_likes(user_id);
create index if not exists idx_react_user         on public.post_reactions(user_id);
create index if not exists idx_chats_owner        on public.chats(owner_id);
create index if not exists idx_chats_requested    on public.chats(requested_by);
create index if not exists idx_msg_user           on public.messages(user_id);
create index if not exists idx_mod_target         on public.moderation(target_user_id);
create index if not exists idx_mod_by             on public.moderation(by_user_id);
create index if not exists idx_reports_by         on public.reports(by_user_id);
create index if not exists idx_chatreads_chat     on public.chat_reads(chat_id);

-- ============================================================
-- SECURITY HARDENING (Security Advisor 0028/0029, 2026-06-07)
-- Tira SECURITY DEFINER da superfície da API: helpers de RLS vão p/ schema
-- 'private' (não exposto); RPCs de ação ganham wrapper SECURITY INVOKER no
-- 'public' (impl definer fica em private). Aplicado AO VIVO em transação.
-- Resultado: 16/17 warnings zerados (sobra só leaked-password = exige Pro).
-- Políticas referenciam helpers por OID → SET SCHEMA não as quebra.
-- ============================================================
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_member(uuid) set schema private;
alter function public.my_role(uuid)   set schema private;
alter function public.is_staff(uuid)  set schema private;

create or replace function public.can_see_chat(cid uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare ch public.chats%rowtype;
begin
  select * into ch from public.chats where id = cid;
  if not found then return false; end if;
  if ch.type in ('direct','group') then
    return auth.uid() = any(ch.participants);
  end if;
  if ch.visibility = 'public' then
    return private.is_member(ch.community_id);
  end if;
  return private.is_staff(ch.community_id)
      or (ch.allowed_roles is null and private.is_member(ch.community_id))
      or private.my_role(ch.community_id) = any(ch.allowed_roles);
end $$;
alter function public.can_see_chat(uuid) set schema private;

alter function public.purchase_item(text)        set schema private;
alter function public.get_or_create_direct(uuid) set schema private;
alter function public.credit_ad_reward()         set schema private;
alter function public.push_notification(uuid,text,text,text,text,text,text,jsonb) set schema private;

create or replace function public.purchase_item(p_item_id text)
returns table(balance bigint, out_item_id text)
language sql security invoker set search_path = public as $$
  select * from private.purchase_item(p_item_id);
$$;
create or replace function public.get_or_create_direct(target uuid)
returns public.chats
language plpgsql security invoker set search_path = public as $$
begin return private.get_or_create_direct(target); end $$;
create or replace function public.credit_ad_reward()
returns table(balance bigint, reward bigint, remaining int)
language sql security invoker set search_path = public as $$
  select * from private.credit_ad_reward();
$$;
create or replace function public.push_notification(
  p_user uuid, p_cat text, p_type text, p_icon text,
  p_title text, p_sub text, p_to text, p_payload jsonb default '{}'::jsonb)
returns public.notifications
language plpgsql security invoker set search_path = public as $$
begin return private.push_notification(p_user,p_cat,p_type,p_icon,p_title,p_sub,p_to,p_payload); end $$;

grant execute on function
  private.purchase_item(text), private.get_or_create_direct(uuid),
  private.credit_ad_reward(),  private.push_notification(uuid,text,text,text,text,text,text,jsonb)
  to authenticated;
revoke execute on function
  public.purchase_item(text), public.get_or_create_direct(uuid),
  public.credit_ad_reward(),  public.push_notification(uuid,text,text,text,text,text,text,jsonb)
  from public, anon;
grant execute on function
  public.purchase_item(text), public.get_or_create_direct(uuid),
  public.credit_ad_reward(),  public.push_notification(uuid,text,text,text,text,text,text,jsonb)
  to authenticated;

-- ============================================================
-- COMENTÁRIOS DE PERFIL / MURAL (2026-06-07)
-- "Biografia" do perfil agora persiste (era só em memória). communityId null
-- = perfil global (Saguão); preenchido = perfil daquela comunidade.
-- ============================================================
create table if not exists public.profile_comments (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  community_id   uuid references public.communities(id) on delete cascade,  -- null = perfil global
  by_user_id     uuid not null references public.profiles(id) on delete cascade,
  text           text not null,
  parent_id      uuid references public.profile_comments(id) on delete cascade,
  likes          uuid[] not null default '{}',
  created_at     timestamptz not null default now()
);
create index if not exists idx_pcomments_target on public.profile_comments(target_user_id, created_at desc);
create index if not exists idx_pcomments_by     on public.profile_comments(by_user_id);
create index if not exists idx_pcomments_parent on public.profile_comments(parent_id);
create index if not exists idx_pcomments_comm   on public.profile_comments(community_id);

alter table public.profile_comments enable row level security;
create policy "pcomments read"   on public.profile_comments for select using (true);
create policy "pcomments insert" on public.profile_comments for insert with check (by_user_id = (select auth.uid()));
create policy "pcomments delete" on public.profile_comments for delete
  using (by_user_id = (select auth.uid()) or target_user_id = (select auth.uid()));

create or replace function private.toggle_pcomment_like(cid uuid)
returns public.profile_comments language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); row public.profile_comments;
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.profile_comments
     set likes = case when me = any(likes) then array_remove(likes, me) else array_append(likes, me) end
   where id = cid returning * into row;
  return row;
end $$;
create or replace function public.toggle_pcomment_like(cid uuid)
returns public.profile_comments language plpgsql security invoker set search_path = public as $$
begin return private.toggle_pcomment_like(cid); end $$;
grant execute on function private.toggle_pcomment_like(uuid) to authenticated;
revoke execute on function public.toggle_pcomment_like(uuid) from public, anon;
grant execute on function public.toggle_pcomment_like(uuid) to authenticated;

do $$ begin
  begin execute 'alter publication supabase_realtime add table public.profile_comments'; exception when duplicate_object then null; end;
end $$;

-- ============================================================
-- LIMPEZA: rls_auto_enable() (event-trigger herdada do projeto antigo)
-- ficava como SECURITY DEFINER exposta. Event trigger dispara mesmo sem
-- EXECUTE → revogar não quebra. Guardado caso não exista.
-- ============================================================
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- ============================================================
-- ID (@usuário/handle) só pode ser trocado UMA vez (2026-06-07)
-- ============================================================
alter table public.profiles add column if not exists handle_changed boolean not null default false;
create or replace function public.enforce_handle_once()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.handle is distinct from old.handle then
    if old.handle_changed then
      raise exception 'O ID de usuário só pode ser alterado uma vez';
    end if;
    new.handle_changed := true;
  end if;
  return new;
end $$;
drop trigger if exists trg_handle_once on public.profiles;
create trigger trg_handle_once before update on public.profiles
  for each row execute function public.enforce_handle_once();

-- ============================================================
-- SECURITY HARDENING II — ESCALADA DE PRIVILÉGIO (2026-06-13)
-- BURACO: as policies "cprofiles insert/update" só checam user_id = auth.uid(),
-- e RLS do Postgres NÃO filtra por coluna. Via REST direto um membro podia:
--   • UPDATE community_profiles SET role='owner'  WHERE user_id=eu  → vira dono
--   • UPDATE community_profiles SET status=null   WHERE user_id=eu  → tira o próprio ban/mute
--   • INSERT ... role='owner'                                       → entra já como dono
-- BLINDAGEM: trigger BEFORE INSERT/UPDATE. Backward-compatible — setRole/moderate
-- legítimos rodam como STAFF (is_staff=true) e passam direto; só o auto-promote /
-- auto-unban do PRÓPRIO usuário é barrado. O dono que cria a comunidade ainda
-- entra como 'owner' (auth.uid() = communities.owner_id). Idempotente.
-- ============================================================
create or replace function public.guard_cprofile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid        uuid    := auth.uid();
  staff      boolean := private.is_staff(new.community_id);
  comm_owner uuid;
begin
  if staff then return new; end if;                 -- staff/owner já autorizado

  if tg_op = 'INSERT' then
    select owner_id into comm_owner from public.communities where id = new.community_id;
    if uid is distinct from comm_owner then          -- não é o dono fazendo o bootstrap
      new.role       := 'member';
      new.titles     := '{}'::text[];
      new.reputation := 0;
      new.status     := null;
    end if;
    return new;
  end if;

  -- UPDATE por NÃO-staff: campos privilegiados são imutáveis
  if new.role       is distinct from old.role       then raise exception 'forbidden: cannot change role'; end if;
  if new.status     is distinct from old.status     then raise exception 'forbidden: cannot change moderation status'; end if;
  if new.reputation is distinct from old.reputation then raise exception 'forbidden: cannot change reputation'; end if;
  if new.titles     is distinct from old.titles     then raise exception 'forbidden: cannot change titles'; end if;
  return new;
end $$;
revoke execute on function public.guard_cprofile_privilege() from public, anon, authenticated;
drop trigger if exists trg_guard_cprofile on public.community_profiles;
create trigger trg_guard_cprofile before insert or update on public.community_profiles
  for each row execute function public.guard_cprofile_privilege();

-- ============================================================
-- POSTS: pin/featured só por STAFF (era editável pelo próprio autor → self-pin /
-- self-feature furava a economia de moedas). Autor segue editando título/corpo/etc.
-- ============================================================
create or replace function public.guard_post_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.community_id is null then return new; end if;   -- post de perfil/saguão: sem staff
  if private.is_staff(new.community_id) then return new; end if;
  if new.pinned         is distinct from old.pinned         then raise exception 'forbidden: only staff can pin'; end if;
  if new.featured_until is distinct from old.featured_until then raise exception 'forbidden: only staff can feature'; end if;
  return new;
end $$;
revoke execute on function public.guard_post_privilege() from public, anon, authenticated;
drop trigger if exists trg_guard_post on public.posts;
create trigger trg_guard_post before update on public.posts
  for each row execute function public.guard_post_privilege();

-- ============================================================
-- CAPS DE TAMANHO — só em campos de IDENTIFICAÇÃO (texto puro de 1 linha, nunca
-- contêm imagem). NÃO aplicar em posts.body / comments.body / messages.text:
-- imagens vão inline (base64) no corpo → um cap quebraria. (Migrar p/ R2 resolve
-- isso e ainda habilita moderação de imagem — ver nota no fim.) NOT VALID = não
-- revalida linhas existentes (seguro no banco ao vivo), mas vale p/ escritas novas.
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_name_len')   then alter table public.profiles    add constraint profiles_name_len   check (char_length(name) <= 80)  not valid; end if;
  if not exists (select 1 from pg_constraint where conname='profiles_handle_len') then alter table public.profiles    add constraint profiles_handle_len check (char_length(handle) <= 32) not valid; end if;
  if not exists (select 1 from pg_constraint where conname='comm_name_len')       then alter table public.communities add constraint comm_name_len       check (char_length(name) <= 80)  not valid; end if;
end $$;

-- ============================================================
-- ANTI-SPAM — rate limit de inserts por usuário (defesa server-side; o cliente já
-- tem cooldown, mas é burlável via REST). Limites GENEROSOS p/ humano — ajuste o
-- 'cap' ou remova os triggers se atrapalhar. Janela: 60s. Idempotente.
-- ============================================================
create or replace function public.rate_limit_inserts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cnt int;
  cap int;
begin
  if uid is null then return new; end if;
  cap := case tg_table_name
           when 'messages' then 30
           when 'comments' then 20
           when 'posts'    then 10
           else 60 end;
  execute format(
    'select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''60 seconds''',
    tg_table_name) into cnt using uid;
  if cnt >= cap then
    raise exception 'rate limit: muitas ações em pouco tempo — aguarde um momento.';
  end if;
  return new;
end $$;
revoke execute on function public.rate_limit_inserts() from public, anon, authenticated;
drop trigger if exists trg_rl_messages on public.messages;
create trigger trg_rl_messages before insert on public.messages for each row execute function public.rate_limit_inserts();
drop trigger if exists trg_rl_comments on public.comments;
create trigger trg_rl_comments before insert on public.comments for each row execute function public.rate_limit_inserts();
drop trigger if exists trg_rl_posts on public.posts;
create trigger trg_rl_posts    before insert on public.posts    for each row execute function public.rate_limit_inserts();

-- ============================================================
-- NOTA — para fechar #upload/#imagem-adulta (futuro): hoje a imagem é base64 inline
-- no corpo (sem storage real). Migrar p/ Cloudflare R2 via o Worker (backend/r2/
-- upload-worker.js — FALTA validar o JWT do Supabase antes de assinar, linha ~17)
-- destrava: (1) cap de tamanho real, (2) coluna media_files.scan_status='pending',
-- (3) gancho p/ API de moderação de imagem. Placeholder de moderação fica p/ depois.
-- ============================================================

-- ============================================================
-- HARDENING push_notification (2026-06-13): exige auth, valida tipo + rota,
-- limita tamanho e taxa por remetente. Fecha spam/phishing em massa.
-- ============================================================
alter table public.notifications add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists idx_notif_createdby on public.notifications(created_by, created_at desc);

create or replace function private.push_notification(
  p_user uuid, p_cat text, p_type text, p_icon text,
  p_title text, p_sub text, p_to text, p_payload jsonb default '{}'::jsonb)
returns public.notifications language plpgsql security definer set search_path = public as $$
declare
  n public.notifications;
  uid uuid := auth.uid();
  recent int;
begin
  if uid is null then raise exception 'auth required'; end if;
  -- tipos permitidos (bloqueia "você ganhou moedas" e afins)
  if coalesce(p_type,'') not in ('follow','comment','mention','like','message','roleInvite','moderation','system','generic') then
    raise exception 'invalid notification type';
  end if;
  -- destino: só rotas internas conhecidas (anti-phishing via campo to)
  if p_to is not null and p_to !~ '^/(c/|chats/|u/|perfil|loja|config)' then
    raise exception 'invalid notification target';
  end if;
  -- rate-limit: máx 30 criadas por mim no último minuto
  select count(*) into recent from public.notifications
    where created_by = uid and created_at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'notification rate limit'; end if;

  insert into public.notifications(user_id,cat,type,icon,title,sub,"to",payload,created_by)
    values (p_user,p_cat,p_type,p_icon, left(coalesce(p_title,''),140), left(coalesce(p_sub,''),200),
            p_to, coalesce(p_payload,'{}'::jsonb), uid)
    returning * into n;
  return n;
end $$;

-- ============================================================
-- EXCLUIR A PRÓPRIA CONTA (Configurações → Segurança, 2026-06-13)
-- O cliente (anon key) NÃO pode apagar auth.users. RPC SECURITY DEFINER apaga só a
-- conta do PRÓPRIO chamador (auth.uid()); profiles.id → auth.users(id) ON DELETE
-- CASCADE, e todo o grafo referencia profiles(id) ON DELETE CASCADE → some tudo junto.
-- ============================================================
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'auth required'; end if;
  delete from auth.users where id = uid;   -- cascateia profiles + todo o conteúdo do usuário
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
