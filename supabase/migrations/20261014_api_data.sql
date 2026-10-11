-- Immutable-ish API response archive.
-- Keep the complete TikTok response envelope separate from the flattened
-- business metrics. This is the source used when a new metric is added later.
create table if not exists public.api_data (
  id bigserial primary key,
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  endpoint_key text not null,
  method text not null check (method in ('GET', 'POST')),
  path text not null,
  context_key text not null default 'root',
  page_number integer not null default 0,
  page_token text,
  request_query jsonb not null default '{}'::jsonb,
  request_body jsonb not null default '{}'::jsonb,
  response_data jsonb not null default '{}'::jsonb,
  response_code integer not null default 0,
  snapshot_date date not null,
  fetched_at timestamptz not null default now(),
  unique (connection_id, endpoint_key, context_key, snapshot_date, page_number)
);

create index if not exists api_data_endpoint_date_idx
  on public.api_data (endpoint_key, snapshot_date desc, fetched_at desc);
create index if not exists api_data_connection_date_idx
  on public.api_data (connection_id, snapshot_date desc);
create index if not exists api_data_response_gin_idx
  on public.api_data using gin (response_data);

alter table public.api_data enable row level security;

-- A compact inventory for the dashboard/report page. It only counts numeric
-- metrics already normalized from real API responses; raw JSON remains in
-- api_data and tts_raw_records.
create or replace view public.api_data_metric_inventory as
select
  mp.endpoint_key,
  mp.metric_key,
  count(*)::bigint as observations,
  sum(mp.metric_value)::double precision as total_value,
  avg(mp.metric_value)::double precision as average_value,
  min(mp.snapshot_date) as first_snapshot_date,
  max(mp.snapshot_date) as last_snapshot_date
from public.tts_metric_points mp
group by mp.endpoint_key, mp.metric_key;
