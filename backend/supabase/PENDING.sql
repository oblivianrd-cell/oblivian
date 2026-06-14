-- ============================================================
-- PENDING.sql — cole TUDO de uma vez no Supabase → SQL Editor.
-- Tudo idempotente (pode rodar 2x). App degrada gracioso até aplicar.
-- (Já está dentro de schema.sql; este arquivo é só o "delta" pendente.)
-- ============================================================

-- (1) wallpaper de chat COMPARTILHADO ---------------------------------------
alter table public.chats add column if not exists wallpaper text;

-- (2) ESCALADA DE PRIVILÉGIO: cprofiles role/status/reputation/titles imutáveis p/ não-staff
create or replace function public.guard_cprofile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid        uuid    := auth.uid();
  staff      boolean := private.is_staff(new.community_id);
  comm_owner uuid;
begin
  if staff then return new; end if;
  if tg_op = 'INSERT' then
    select owner_id into comm_owner from public.communities where id = new.community_id;
    if uid is distinct from comm_owner then
      new.role := 'member'; new.titles := '{}'::text[]; new.reputation := 0; new.status := null;
    end if;
    return new;
  end if;
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

-- (3) POSTS: pin/featured só por STAFF
create or replace function public.guard_post_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.community_id is null then return new; end if;
  if private.is_staff(new.community_id) then return new; end if;
  if new.pinned         is distinct from old.pinned         then raise exception 'forbidden: only staff can pin'; end if;
  if new.featured_until is distinct from old.featured_until then raise exception 'forbidden: only staff can feature'; end if;
  return new;
end $$;
revoke execute on function public.guard_post_privilege() from public, anon, authenticated;
drop trigger if exists trg_guard_post on public.posts;
create trigger trg_guard_post before update on public.posts
  for each row execute function public.guard_post_privilege();

-- (4) CAPS de tamanho em campos de identificação (NOT VALID = só escritas novas)
do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_name_len')   then alter table public.profiles    add constraint profiles_name_len   check (char_length(name) <= 80)  not valid; end if;
  if not exists (select 1 from pg_constraint where conname='profiles_handle_len') then alter table public.profiles    add constraint profiles_handle_len check (char_length(handle) <= 32) not valid; end if;
  if not exists (select 1 from pg_constraint where conname='comm_name_len')       then alter table public.communities add constraint comm_name_len       check (char_length(name) <= 80)  not valid; end if;
end $$;

-- (5) ANTI-SPAM: rate limit de inserts por usuário (janela 60s)
create or replace function public.rate_limit_inserts()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cnt int; cap int;
begin
  if uid is null then return new; end if;
  cap := case tg_table_name when 'messages' then 30 when 'comments' then 20 when 'posts' then 10 else 60 end;
  execute format('select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''60 seconds''', tg_table_name) into cnt using uid;
  if cnt >= cap then raise exception 'rate limit: muitas ações em pouco tempo — aguarde um momento.'; end if;
  return new;
end $$;
revoke execute on function public.rate_limit_inserts() from public, anon, authenticated;
drop trigger if exists trg_rl_messages on public.messages;
create trigger trg_rl_messages before insert on public.messages for each row execute function public.rate_limit_inserts();
drop trigger if exists trg_rl_comments on public.comments;
create trigger trg_rl_comments before insert on public.comments for each row execute function public.rate_limit_inserts();
drop trigger if exists trg_rl_posts on public.posts;
create trigger trg_rl_posts    before insert on public.posts    for each row execute function public.rate_limit_inserts();

-- (6) HARDENING push_notification: auth + tipo + rota + tamanho + rate-limit
alter table public.notifications add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists idx_notif_createdby on public.notifications(created_by, created_at desc);

create or replace function private.push_notification(
  p_user uuid, p_cat text, p_type text, p_icon text,
  p_title text, p_sub text, p_to text, p_payload jsonb default '{}'::jsonb)
returns public.notifications language plpgsql security definer set search_path = public as $$
declare n public.notifications; uid uuid := auth.uid(); recent int;
begin
  if uid is null then raise exception 'auth required'; end if;
  if coalesce(p_type,'') not in ('follow','comment','mention','like','message','roleInvite','moderation','system','generic') then
    raise exception 'invalid notification type'; end if;
  if p_to is not null and p_to !~ '^/(c/|chats/|u/|perfil|loja|config)' then
    raise exception 'invalid notification target'; end if;
  select count(*) into recent from public.notifications
    where created_by = uid and created_at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'notification rate limit'; end if;
  insert into public.notifications(user_id,cat,type,icon,title,sub,"to",payload,created_by)
    values (p_user,p_cat,p_type,p_icon, left(coalesce(p_title,''),140), left(coalesce(p_sub,''),200),
            p_to, coalesce(p_payload,'{}'::jsonb), uid)
    returning * into n;
  return n;
end $$;

-- (7) EXCLUIR A PRÓPRIA CONTA (Configurações → Segurança) -------------------
-- anon key não apaga auth.users; RPC definer apaga só a conta do chamador.
-- profiles.id → auth.users(id) ON DELETE CASCADE → some todo o grafo do usuário.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'auth required'; end if;
  delete from auth.users where id = uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
