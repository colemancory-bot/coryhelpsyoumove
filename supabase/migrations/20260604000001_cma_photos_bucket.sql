-- Public storage bucket for agent-uploaded CMA subject photos.
-- The generated CMA report embeds these via <img src>, so the bucket must be
-- public-read (the report HTML is often opened/printed without an auth session).
insert into storage.buckets (id, name, public)
values ('cma-photos', 'cma-photos', true)
on conflict (id) do nothing;

-- Authenticated agents can upload / replace / delete CMA subject photos.
drop policy if exists "cma-photos authenticated insert" on storage.objects;
create policy "cma-photos authenticated insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cma-photos');

drop policy if exists "cma-photos authenticated update" on storage.objects;
create policy "cma-photos authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'cma-photos');

drop policy if exists "cma-photos authenticated delete" on storage.objects;
create policy "cma-photos authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cma-photos');

-- Explicit public read (bucket is public, but make the SELECT path unambiguous).
drop policy if exists "cma-photos public read" on storage.objects;
create policy "cma-photos public read"
  on storage.objects for select to public
  using (bucket_id = 'cma-photos');
