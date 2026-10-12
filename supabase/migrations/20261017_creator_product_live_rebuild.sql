-- Rebuild the warehouse around the three requested domains:
-- Creator, Product and completed LIVE sessions.
-- Intentionally preserves only authorization and the immutable API archive.
do $$
declare
  item record;
begin
  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname not in ('tts_connections', 'api_data')
  loop
    execute format('drop table if exists public.%I cascade', item.relname);
  end loop;
end $$;

create table public.tts_sync_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  stats jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

create table public.tts_sync_checkpoints (
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  endpoint_key text not null,
  context_key text not null default 'root',
  snapshot_date date not null,
  status text not null check (status in ('success', 'failed')),
  record_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (connection_id, endpoint_key, context_key, snapshot_date)
);

create table public.mcn_creators (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  open_id text not null,
  username text,
  display_name text,
  avatar_url text,
  platform text not null default 'tiktok',
  industry text,
  location text,
  pic_name text,
  mcn_status text not null default 'active',
  onboarding_status text not null default 'connected',
  connection_status text not null default 'active',
  share_commission_rate numeric,
  top_category text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index mcn_creators_connection_open_id_idx on public.mcn_creators(connection_id, open_id);

create table public.mcn_creator_profiles (
  id bigserial primary key,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null default '{}'::jsonb,
  followers numeric,
  avg_views numeric,
  engagement_rate numeric,
  top_category text,
  gmv numeric,
  nmv numeric,
  orders numeric,
  live_hours numeric,
  live_views numeric,
  video_views numeric,
  live_gmv numeric,
  video_gmv numeric,
  gmv_per_live_hour numeric,
  gmv_per_video numeric,
  live_aov numeric,
  video_aov numeric,
  ctr numeric,
  ctor numeric,
  video_count numeric,
  product_clicks numeric,
  product_orders numeric,
  synced_at timestamptz not null default now(),
  unique (creator_id, snapshot_date)
);

create table public.mcn_creator_metrics (
  id bigserial primary key,
  creator_id uuid references public.mcn_creators(id) on delete cascade,
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  endpoint_key text not null,
  record_key text not null,
  metric_key text not null,
  metric_path text not null,
  metric_value double precision not null,
  dimensions jsonb not null default '{}'::jsonb,
  snapshot_date date not null,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, endpoint_key, record_key, metric_path)
);

create table public.mcn_products (
  id bigserial primary key,
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  creator_id uuid references public.mcn_creators(id) on delete set null,
  product_id text not null,
  snapshot_date date not null,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, product_id, snapshot_date)
);

create table public.mcn_live_sessions (
  id bigserial primary key,
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  live_room_id text not null,
  snapshot_date date not null,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, live_room_id, snapshot_date)
);

create table public.mcn_live_metrics (
  id bigserial primary key,
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  live_room_id text not null,
  endpoint_key text not null,
  record_key text not null,
  metric_key text not null,
  metric_path text not null,
  metric_value double precision not null,
  dimensions jsonb not null default '{}'::jsonb,
  snapshot_date date not null,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, live_room_id, endpoint_key, record_key, metric_path)
);

create index mcn_creator_metrics_date_idx on public.mcn_creator_metrics(snapshot_date desc, endpoint_key, metric_key);
create index mcn_products_date_idx on public.mcn_products(snapshot_date desc, product_id);
create index mcn_products_creator_idx on public.mcn_products(creator_id, snapshot_date desc);
create index mcn_live_metrics_date_idx on public.mcn_live_metrics(snapshot_date desc, endpoint_key, metric_key);

-- Compatibility shape for the existing dashboard: only creator and LIVE
-- performance enters KPI aggregation; product catalogue stays separate.
create or replace view public.mcn_metric_points as
select
  cm.creator_id,
  cm.connection_id,
  cm.endpoint_key,
  cm.record_key,
  cm.metric_key,
  cm.metric_path,
  cm.metric_value,
  cm.dimensions,
  cm.snapshot_date as metric_date,
  cm.raw_payload,
  cm.synced_at
from public.mcn_creator_metrics cm
union all
select
  c.id as creator_id,
  lm.connection_id,
  lm.endpoint_key,
  lm.record_key,
  lm.metric_key,
  lm.metric_path,
  lm.metric_value,
  lm.dimensions,
  lm.snapshot_date as metric_date,
  lm.raw_payload,
  lm.synced_at
from public.mcn_live_metrics lm
left join public.mcn_creators c on c.connection_id = lm.connection_id;

create or replace view public.mcn_metric_daily_report as
select creator_id, metric_date, endpoint_key, metric_key, metric_path,
       count(*) as observations, sum(metric_value) as total_value,
       avg(metric_value) as average_value, min(metric_value) as minimum_value,
       max(metric_value) as maximum_value
from public.mcn_metric_points
group by creator_id, metric_date, endpoint_key, metric_key, metric_path;

alter table public.tts_sync_runs enable row level security;
alter table public.tts_sync_checkpoints enable row level security;
alter table public.mcn_creators enable row level security;
alter table public.mcn_creator_profiles enable row level security;
alter table public.mcn_creator_metrics enable row level security;
alter table public.mcn_products enable row level security;
alter table public.mcn_live_sessions enable row level security;
alter table public.mcn_live_metrics enable row level security;

revoke all on public.mcn_metric_points from anon, authenticated;
revoke all on public.mcn_metric_daily_report from anon, authenticated;
grant select on public.mcn_metric_points, public.mcn_metric_daily_report to service_role;
