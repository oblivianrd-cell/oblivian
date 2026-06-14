# Storage real (Supabase Storage) — setup

Hoje a mídia é embutida (base64 inline). Pra usar storage binário + CDN (sem
base64, dedup nativo), crie 1 bucket e ligue o provider. ~2 min.

> A compressão (AVIF/WebP, resize forçado, EXIF removido, miniatura) **já está
> aplicada** no cliente — funciona com ou sem bucket. O bucket só troca *onde*
> os bytes ficam (binário no CDN em vez de base64 no DB).

## 1. Criar bucket + policies

Supabase → projeto `iukovmmphkpshrpxymri` → **SQL Editor** → cole e rode:

```sql
-- bucket público, 10 MB, só mídia permitida
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media','media', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- policies em storage.objects p/ o bucket 'media'
drop policy if exists "media public read"  on storage.objects;
drop policy if exists "media auth insert"  on storage.objects;
drop policy if exists "media auth update"  on storage.objects;
drop policy if exists "media owner delete" on storage.objects;

create policy "media public read"  on storage.objects
  for select using (bucket_id = 'media');                                  -- leitura pública
create policy "media auth insert"  on storage.objects
  for insert to authenticated with check (bucket_id = 'media');            -- upload: logado
create policy "media auth update"  on storage.objects
  for update to authenticated using (bucket_id = 'media');                 -- upsert: logado
create policy "media owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and owner = auth.uid());
```

## 2. Ligar o provider

`js/data/config.js` (local, não versionado):

```js
storage: { provider: "supabase", bucket: "media" }
```

Pronto. `App.storage.upload(file, {kind})` passa a subir no bucket
(`<kind>/<hash>.<ext>`) e devolve a URL pública. Conteúdo igual = mesma chave =
não duplica. Se o upload falhar, cai pro base64 inline (degrada sem quebrar).

## Segurança
- Cliente usa só a **publishable key** (já no config). Nenhum segredo no front.
- O token `sbp_…` (management) **não** vai pro código — só pra rodar SQL/CLI uma vez.
  Como foi exposto em texto, **rotacione** em Supabase → Account → Access Tokens.
