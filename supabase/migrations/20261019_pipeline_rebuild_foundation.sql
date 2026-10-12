-- Pipeline rebuild foundation.
-- Keeps tts_connections and api_data. The reset is intentionally separate so
-- it can be reviewed and executed explicitly in production.

alter table public.api_data
  add column if not exists http_status integer,
  add column if not exists tiktok_code bigint,
  add column if not exists tiktok_message text,
  add column if not exists tiktok_request_id text,
  add column if not exists response_envelope jsonb not null default '{}'::jsonb,
  add column if not exists record_count integer not null default 0,
  add column if not exists parser_status text not null default 'pending',
  add column if not exists parser_reason text,
  add column if not exists parser_version text not null default 'v2',
  add column if not exists parser_details jsonb not null default '{}'::jsonb;

alter table public.api_data
  drop constraint if exists api_data_parser_status_check;

alter table public.api_data
  add constraint api_data_parser_status_check
  check (parser_status in ('pending', 'parsed', 'empty', 'skipped', 'api_error', 'missing_scope', 'schema_mismatch'));

alter table public.mcn_creator_profiles
  add column if not exists source_api_data_id bigint references public.api_data(id) on delete set null;

alter table public.mcn_creator_metrics
  add column if not exists source_api_data_id bigint references public.api_data(id) on delete set null;

alter table public.mcn_products
  add column if not exists source_api_data_id bigint references public.api_data(id) on delete set null;

alter table public.mcn_live_sessions
  add column if not exists source_api_data_id bigint references public.api_data(id) on delete set null;

alter table public.mcn_live_metrics
  add column if not exists source_api_data_id bigint references public.api_data(id) on delete set null;

create index if not exists api_data_parser_status_idx
  on public.api_data (parser_status, snapshot_date desc, endpoint_key);

create index if not exists api_data_tiktok_code_idx
  on public.api_data (tiktok_code, snapshot_date desc)
  where tiktok_code is not null and tiktok_code <> 0;

create index if not exists api_data_source_id_idx
  on public.api_data (id, endpoint_key, snapshot_date desc);

-- Explicit production cleanup requested by the owner.
-- It preserves authorization and raw API evidence, but removes all derived
-- MCN rows and stale sync state so the next run starts from a clean warehouse.
create or replace function public.reset_mcn_derived_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table
    public.mcn_live_metrics,
    public.mcn_live_sessions,
    public.mcn_products,
    public.mcn_creator_metrics,
    public.mcn_creator_profiles,
    public.mcn_creators,
    public.tts_sync_checkpoints,
    public.tts_sync_runs
  restart identity cascade;

  return jsonb_build_object(
    'reset', true,
    'preserved_tables', jsonb_build_array('tts_connections', 'api_data'),
    'reset_at', now()
  );
end;
$$;

revoke all on function public.reset_mcn_derived_data() from public, anon, authenticated;
grant execute on function public.reset_mcn_derived_data() to service_role;
