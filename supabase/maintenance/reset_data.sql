-- Destructive maintenance: clears analytics/application data but preserves the
-- TikTok authorization ledger. Deleting tts_connections would delete creator
-- access/refresh tokens and make an automatic resync impossible.
do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and (
        tablename like 'mcn_%'
        or (tablename like 'tts_%' and tablename <> 'tts_connections')
      )
  loop
    execute format('truncate table public.%I restart identity cascade', table_name);
  end loop;
end;
$$;

-- Rebuild the CRM identity rows from the preserved TikTok connections so the
-- next sync can immediately attach raw records to a creator.
insert into public.mcn_creators (
  connection_id,
  open_id,
  display_name,
  user_type,
  connection_status,
  metadata,
  created_at,
  updated_at
)
select
  c.id,
  c.open_id,
  c.display_name,
  c.user_type,
  c.status,
  jsonb_build_object('granted_scopes', coalesce(to_jsonb(c.granted_scopes), '[]'::jsonb)),
  coalesce(c.created_at, now()),
  now()
from public.tts_connections c
on conflict (connection_id) do update set
  open_id = excluded.open_id,
  display_name = excluded.display_name,
  user_type = excluded.user_type,
  connection_status = excluded.connection_status,
  metadata = public.mcn_creators.metadata || excluded.metadata,
  updated_at = now();
