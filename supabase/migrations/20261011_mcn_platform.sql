-- MCN operational data model for TikTok Shop Partner data.
-- This migration is additive: existing tts_* tables remain the source of truth
-- for raw API responses and generic extracted metrics.

create extension if not exists pgcrypto;

create table if not exists public.mcn_creators (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid unique references public.tts_connections(id) on delete set null,
  open_id text not null unique,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  user_type integer,
  connection_status text not null default 'active',
  mcn_status text not null default 'active' check (mcn_status in ('prospect', 'invited', 'active', 'paused', 'left', 'blocked')),
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending', 'in_progress', 'completed', 'blocked')),
  source text not null default 'tiktok_partner',
  owner_name text,
  joined_at timestamptz,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_creators_status_idx on public.mcn_creators (mcn_status, connection_status);
create index if not exists mcn_creators_username_idx on public.mcn_creators (lower(username));

create table if not exists public.mcn_creator_profiles (
  id bigserial primary key,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  snapshot_date date not null,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  followers numeric,
  avg_views numeric,
  views numeric,
  live_hours numeric,
  live_views numeric,
  video_views numeric,
  gmv numeric,
  nmv numeric,
  live_gmv numeric,
  video_gmv numeric,
  orders numeric,
  products_sold numeric,
  aov numeric,
  ctr numeric,
  cvr numeric,
  commission numeric,
  extra_metrics jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, snapshot_date)
);

create index if not exists mcn_creator_profiles_date_idx on public.mcn_creator_profiles (snapshot_date desc);
create index if not exists mcn_creator_profiles_creator_date_idx on public.mcn_creator_profiles (creator_id, snapshot_date desc);

create table if not exists public.mcn_creator_notes (
  id bigserial primary key,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  note_type text not null default 'general' check (note_type in ('general', 'contact', 'onboarding', 'performance', 'issue')),
  note text not null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_creator_notes_creator_idx on public.mcn_creator_notes (creator_id, created_at desc);

create table if not exists public.mcn_metric_definitions (
  metric_key text primary key,
  display_name text not null,
  domain text not null default 'other' check (domain in ('profile', 'order', 'product', 'showcase', 'sample', 'live', 'campaign', 'traffic', 'other')),
  unit text not null default 'number' check (unit in ('number', 'currency', 'percent', 'duration_seconds', 'hours', 'count', 'ratio')),
  source_endpoint text,
  description text,
  is_kpi boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.mcn_metric_definitions (metric_key, display_name, domain, unit, source_endpoint, description, is_kpi)
values
  ('followers', 'Followers', 'profile', 'count', 'creator_profile', 'Creator follower count.', true),
  ('avg_views', 'Average views', 'profile', 'count', 'creator_profile', 'Average views per published content item.', true),
  ('views', 'Views', 'profile', 'count', null, 'Views across the source record or reporting period.', true),
  ('live_hours', 'Live hours', 'live', 'hours', 'live_core_stats', 'Total live duration converted to hours.', true),
  ('live_views', 'Live views', 'live', 'count', 'live_core_stats', 'Views attributed to live sessions.', true),
  ('video_views', 'Video views', 'profile', 'count', null, 'Views attributed to short video content.', true),
  ('gmv', 'GMV', 'order', 'currency', null, 'Gross merchandise value.', true),
  ('nmv', 'NMV', 'order', 'currency', null, 'Net merchandise value after deductions.', true),
  ('live_gmv', 'Live GMV', 'live', 'currency', 'live_core_stats', 'GMV attributed to live sessions.', true),
  ('video_gmv', 'Video GMV', 'profile', 'currency', null, 'GMV attributed to video content.', true),
  ('orders', 'Orders', 'order', 'count', 'affiliate_orders', 'Order count.', true),
  ('products_sold', 'Products sold', 'product', 'count', null, 'Quantity of products sold.', true),
  ('commission', 'Commission', 'order', 'currency', null, 'Commission amount.', true),
  ('commission_rate', 'Commission rate', 'campaign', 'percent', null, 'Commission rate applied to a campaign or product.' , true),
  ('creator_commission_reward_rate', 'Creator reward commission rate', 'campaign', 'percent', 'partner_campaigns', 'Reward rate offered to creators.', false),
  ('shop_ads_commission_rate', 'Shop ads commission rate', 'campaign', 'percent', 'partner_campaigns', 'Shop ads commission rate.', false),
  ('returned_quantity', 'Returned quantity', 'order', 'count', 'affiliate_orders', 'Returned product quantity.', false),
  ('refunded_quantity', 'Refunded quantity', 'order', 'count', 'affiliate_orders', 'Refunded product quantity.', false),
  ('aov', 'Average order value', 'order', 'currency', null, 'Average order value.', true),
  ('ctr', 'Click-through rate', 'traffic', 'percent', null, 'Click-through rate.', true),
  ('cvr', 'Conversion rate', 'traffic', 'percent', null, 'Conversion rate.', true),
  ('likes', 'Likes', 'live', 'count', null, 'Like count.', false),
  ('comments', 'Comments', 'live', 'count', null, 'Comment count.', false),
  ('shares', 'Shares', 'live', 'count', null, 'Share count.', false),
  ('new_followers', 'New followers', 'live', 'count', 'live_user_portraits', 'New followers during the reporting period.', false),
  ('product_clicks', 'Product clicks', 'traffic', 'count', null, 'Clicks on promoted products.', false),
  ('product_orders', 'Product orders', 'product', 'count', null, 'Orders attributed to a product.', false),
  ('target_gmv', 'Target GMV', 'campaign', 'currency', 'partner_campaigns', 'Campaign GMV target.', false),
  ('achievement_rate', 'Achievement rate', 'campaign', 'percent', 'partner_campaign_performance', 'Campaign target achievement rate.', true),
  ('total_suspend_duration', 'Total suspend duration', 'live', 'duration_seconds', 'live_core_stats', 'Total live suspension duration.', false)
on conflict (metric_key) do update set
  display_name = excluded.display_name,
  domain = excluded.domain,
  unit = excluded.unit,
  source_endpoint = excluded.source_endpoint,
  description = excluded.description,
  is_kpi = excluded.is_kpi,
  updated_at = now();

create table if not exists public.mcn_metric_points (
  id bigserial primary key,
  creator_id uuid references public.mcn_creators(id) on delete set null,
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  endpoint_key text not null,
  record_key text not null default 'root',
  metric_key text not null,
  metric_path text not null,
  metric_value numeric,
  metric_text text,
  dimensions jsonb not null default '{}'::jsonb,
  metric_date date,
  period_start timestamptz,
  period_end timestamptz,
  source_kind text not null default 'api' check (source_kind in ('api', 'manual', 'derived')),
  is_derived boolean not null default false,
  raw_payload jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, endpoint_key, record_key, metric_path)
);

create index if not exists mcn_metric_points_creator_date_idx on public.mcn_metric_points (creator_id, metric_date desc);
create index if not exists mcn_metric_points_metric_date_idx on public.mcn_metric_points (metric_key, metric_date desc);
create index if not exists mcn_metric_points_endpoint_path_idx on public.mcn_metric_points (endpoint_key, metric_path, metric_date desc);
create index if not exists mcn_metric_points_dimensions_gin_idx on public.mcn_metric_points using gin (dimensions);

create or replace view public.mcn_metric_daily_report
with (security_invoker = true)
as
select
  creator_id,
  metric_date,
  endpoint_key,
  metric_key,
  metric_path,
  count(*) as observations,
  sum(metric_value) as total_value,
  avg(metric_value) as average_value,
  min(metric_value) as minimum_value,
  max(metric_value) as maximum_value
from public.mcn_metric_points
where metric_value is not null
group by
  creator_id,
  metric_date,
  endpoint_key,
  metric_key,
  metric_path;

create table if not exists public.mcn_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('prospect', 'active', 'paused', 'inactive')),
  contact_name text,
  contact_channel text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mcn_brands_name_unique_idx on public.mcn_brands (lower(name));

create table if not exists public.mcn_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.mcn_brands(id) on delete set null,
  name text not null,
  campaign_type text not null default 'mixed' check (campaign_type in ('affiliate', 'livestream', 'video', 'mixed', 'other')),
  status text not null default 'draft' check (status in ('draft', 'planned', 'active', 'paused', 'completed', 'cancelled')),
  owner_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  target_gmv numeric,
  target_orders numeric,
  target_creators integer,
  budget numeric,
  voucher_budget numeric,
  default_commission_rate numeric,
  brief text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_campaigns_status_date_idx on public.mcn_campaigns (status, starts_at desc);

create table if not exists public.mcn_campaign_creators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mcn_campaigns(id) on delete cascade,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'active', 'completed', 'declined', 'cancelled')),
  invited_at timestamptz,
  accepted_at timestamptz,
  target_gmv numeric,
  actual_gmv numeric,
  target_orders numeric,
  actual_orders numeric,
  contribution numeric,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create index if not exists mcn_campaign_creators_creator_idx on public.mcn_campaign_creators (creator_id, status);

create table if not exists public.mcn_deals (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.mcn_campaigns(id) on delete set null,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  deal_type text not null default 'affiliate' check (deal_type in ('affiliate', 'livestream', 'video', 'product_seeding', 'other')),
  status text not null default 'draft' check (status in ('draft', 'negotiating', 'confirmed', 'in_progress', 'delivered', 'approved', 'paid', 'cancelled')),
  deliverables jsonb not null default '[]'::jsonb,
  agreed_fee numeric,
  commission_rate numeric,
  voucher_amount numeric,
  agreed_at timestamptz,
  due_at timestamptz,
  delivered_at timestamptz,
  paid_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_deals_creator_status_idx on public.mcn_deals (creator_id, status);
create index if not exists mcn_deals_campaign_idx on public.mcn_deals (campaign_id, status);

create table if not exists public.mcn_bookings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.mcn_deals(id) on delete set null,
  campaign_id uuid references public.mcn_campaigns(id) on delete set null,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  channel text not null default 'livestream' check (channel in ('livestream', 'video', 'affiliate', 'other')),
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'live', 'completed', 'cancelled', 'no_show')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  expected_gmv numeric,
  actual_gmv numeric,
  expected_hours numeric,
  actual_hours numeric,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_bookings_creator_time_idx on public.mcn_bookings (creator_id, scheduled_start desc);
create index if not exists mcn_bookings_campaign_time_idx on public.mcn_bookings (campaign_id, scheduled_start desc);

create table if not exists public.mcn_tasks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.mcn_creators(id) on delete cascade,
  campaign_id uuid references public.mcn_campaigns(id) on delete cascade,
  deal_id uuid references public.mcn_deals(id) on delete cascade,
  title text not null,
  task_type text not null default 'general' check (task_type in ('onboarding', 'matching', 'booking', 'content_review', 'fulfillment', 'payment', 'issue', 'general')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  owner_name text,
  due_at timestamptz,
  sla_due_at timestamptz,
  completed_at timestamptz,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_tasks_status_due_idx on public.mcn_tasks (status, priority, due_at);
create index if not exists mcn_tasks_creator_idx on public.mcn_tasks (creator_id, status);

create table if not exists public.mcn_issues (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.mcn_creators(id) on delete set null,
  campaign_id uuid references public.mcn_campaigns(id) on delete set null,
  task_id uuid references public.mcn_tasks(id) on delete set null,
  category text not null default 'other' check (category in ('creator', 'brand', 'platform', 'content', 'payment', 'api', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'investigating', 'waiting', 'resolved', 'closed')),
  title text not null,
  description text,
  owner_name text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_issues_status_severity_idx on public.mcn_issues (status, severity, opened_at desc);
create index if not exists mcn_issues_creator_idx on public.mcn_issues (creator_id, status);

create or replace function public.mcn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.mcn_jsonb_numeric(payload jsonb, variadic keys text[])
returns numeric
language plpgsql
immutable
as $$
declare
  key_name text;
  value_text text;
begin
  foreach key_name in array keys loop
    value_text := payload ->> key_name;
    if value_text is null and jsonb_typeof(payload -> 'data') = 'object' then
      value_text := payload -> 'data' ->> key_name;
    end if;
    if value_text is not null and value_text ~ '^-?[0-9]+(\.[0-9]+)?$' then
      return value_text::numeric;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.mcn_sync_creator_from_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mcn_creators (
    connection_id,
    open_id,
    display_name,
    user_type,
    connection_status,
    metadata
  )
  values (
    new.id,
    new.open_id,
    new.display_name,
    new.user_type,
    new.status,
    jsonb_build_object('granted_scopes', coalesce(to_jsonb(new.granted_scopes), '[]'::jsonb))
  )
  on conflict (open_id) do update set
    connection_id = excluded.connection_id,
    display_name = coalesce(excluded.display_name, public.mcn_creators.display_name),
    user_type = coalesce(excluded.user_type, public.mcn_creators.user_type),
    connection_status = excluded.connection_status,
    metadata = public.mcn_creators.metadata || excluded.metadata,
    updated_at = now();
  return new;
end;
$$;

create or replace function public.mcn_sync_metric_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_creator_id uuid;
  resolved_payload jsonb;
begin
  select id into resolved_creator_id
  from public.mcn_creators
  where connection_id = new.connection_id;

  select payload into resolved_payload
  from public.tts_raw_records
  where connection_id = new.connection_id
    and endpoint_key = new.endpoint_key
    and record_key = new.record_key;

  insert into public.mcn_metric_points (
    creator_id,
    connection_id,
    endpoint_key,
    record_key,
    metric_key,
    metric_path,
    metric_value,
    dimensions,
    metric_date,
    raw_payload,
    synced_at
  )
  values (
    resolved_creator_id,
    new.connection_id,
    new.endpoint_key,
    new.record_key,
    new.metric_key,
    new.metric_key,
    new.metric_value::numeric,
    coalesce(new.dimensions, '{}'::jsonb),
    new.snapshot_date,
    resolved_payload,
    new.synced_at
  )
  on conflict (connection_id, endpoint_key, record_key, metric_path) do update set
    creator_id = excluded.creator_id,
    metric_key = excluded.metric_key,
    metric_value = excluded.metric_value,
    dimensions = excluded.dimensions,
    metric_date = excluded.metric_date,
    raw_payload = coalesce(excluded.raw_payload, public.mcn_metric_points.raw_payload),
    synced_at = excluded.synced_at;
  return new;
end;
$$;

create or replace function public.mcn_sync_creator_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_creator_id uuid;
  resolved_date date;
begin
  if new.endpoint_key <> 'creator_profile' then
    return new;
  end if;

  select id into resolved_creator_id
  from public.mcn_creators
  where connection_id = new.connection_id;

  if resolved_creator_id is null then
    return new;
  end if;

  resolved_date := coalesce(new.snapshot_date, new.synced_at::date);

  insert into public.mcn_creator_profiles (
    creator_id,
    snapshot_date,
    username,
    display_name,
    avatar_url,
    bio,
    followers,
    avg_views,
    views,
    live_hours,
    live_views,
    video_views,
    gmv,
    nmv,
    live_gmv,
    video_gmv,
    orders,
    products_sold,
    aov,
    ctr,
    cvr,
    commission,
    extra_metrics,
    payload,
    synced_at
  )
  values (
    resolved_creator_id,
    resolved_date,
    coalesce(new.payload ->> 'username', new.payload ->> 'user_name', new.payload ->> 'handle'),
    coalesce(new.payload ->> 'display_name', new.payload ->> 'nickname', new.payload ->> 'name'),
    coalesce(new.payload ->> 'avatar_url', new.payload ->> 'avatar'),
    new.payload ->> 'bio',
    public.mcn_jsonb_numeric(new.payload, 'followers', 'follower_count', 'fans_count'),
    public.mcn_jsonb_numeric(new.payload, 'avg_views', 'average_views'),
    public.mcn_jsonb_numeric(new.payload, 'views', 'view_count'),
    public.mcn_jsonb_numeric(new.payload, 'live_hours', 'live_duration_hours'),
    public.mcn_jsonb_numeric(new.payload, 'live_views'),
    public.mcn_jsonb_numeric(new.payload, 'video_views'),
    public.mcn_jsonb_numeric(new.payload, 'gmv', 'total_gmv'),
    public.mcn_jsonb_numeric(new.payload, 'nmv', 'net_gmv'),
    public.mcn_jsonb_numeric(new.payload, 'live_gmv'),
    public.mcn_jsonb_numeric(new.payload, 'video_gmv'),
    public.mcn_jsonb_numeric(new.payload, 'orders', 'order_count'),
    public.mcn_jsonb_numeric(new.payload, 'products_sold', 'quantity_sold'),
    public.mcn_jsonb_numeric(new.payload, 'aov', 'average_order_value'),
    public.mcn_jsonb_numeric(new.payload, 'ctr'),
    public.mcn_jsonb_numeric(new.payload, 'cvr', 'conversion_rate'),
    public.mcn_jsonb_numeric(new.payload, 'commission'),
    coalesce(new.payload, '{}'::jsonb),
    coalesce(new.payload, '{}'::jsonb),
    new.synced_at
  )
  on conflict (creator_id, snapshot_date) do update set
    username = coalesce(excluded.username, public.mcn_creator_profiles.username),
    display_name = coalesce(excluded.display_name, public.mcn_creator_profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.mcn_creator_profiles.avatar_url),
    bio = coalesce(excluded.bio, public.mcn_creator_profiles.bio),
    followers = coalesce(excluded.followers, public.mcn_creator_profiles.followers),
    avg_views = coalesce(excluded.avg_views, public.mcn_creator_profiles.avg_views),
    views = coalesce(excluded.views, public.mcn_creator_profiles.views),
    live_hours = coalesce(excluded.live_hours, public.mcn_creator_profiles.live_hours),
    live_views = coalesce(excluded.live_views, public.mcn_creator_profiles.live_views),
    video_views = coalesce(excluded.video_views, public.mcn_creator_profiles.video_views),
    gmv = coalesce(excluded.gmv, public.mcn_creator_profiles.gmv),
    nmv = coalesce(excluded.nmv, public.mcn_creator_profiles.nmv),
    live_gmv = coalesce(excluded.live_gmv, public.mcn_creator_profiles.live_gmv),
    video_gmv = coalesce(excluded.video_gmv, public.mcn_creator_profiles.video_gmv),
    orders = coalesce(excluded.orders, public.mcn_creator_profiles.orders),
    products_sold = coalesce(excluded.products_sold, public.mcn_creator_profiles.products_sold),
    aov = coalesce(excluded.aov, public.mcn_creator_profiles.aov),
    ctr = coalesce(excluded.ctr, public.mcn_creator_profiles.ctr),
    cvr = coalesce(excluded.cvr, public.mcn_creator_profiles.cvr),
    commission = coalesce(excluded.commission, public.mcn_creator_profiles.commission),
    extra_metrics = public.mcn_creator_profiles.extra_metrics || excluded.extra_metrics,
    payload = excluded.payload,
    synced_at = excluded.synced_at,
    updated_at = now();
  return new;
end;
$$;


do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mcn_creators',
    'mcn_creator_profiles',
    'mcn_creator_notes',
    'mcn_metric_definitions',
    'mcn_brands',
    'mcn_campaigns',
    'mcn_campaign_creators',
    'mcn_deals',
    'mcn_bookings',
    'mcn_tasks',
    'mcn_issues'
  ] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.mcn_touch_updated_at()', table_name, table_name);
end loop;
end;
$$;

drop trigger if exists mcn_sync_creator_from_connection on public.tts_connections;
create trigger mcn_sync_creator_from_connection
after insert or update of open_id, display_name, user_type, status, granted_scopes
on public.tts_connections
for each row execute function public.mcn_sync_creator_from_connection();

drop trigger if exists mcn_sync_metric_point on public.tts_metric_points;
create trigger mcn_sync_metric_point
after insert or update
on public.tts_metric_points
for each row execute function public.mcn_sync_metric_point();

drop trigger if exists mcn_sync_creator_profile on public.tts_raw_records;
create trigger mcn_sync_creator_profile
after insert or update
on public.tts_raw_records
for each row execute function public.mcn_sync_creator_profile();

-- Backfill creators from all existing authorizations.
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
  c.created_at,
  c.updated_at
from public.tts_connections c
on conflict (open_id) do update set
  connection_id = excluded.connection_id,
  display_name = coalesce(excluded.display_name, public.mcn_creators.display_name),
  user_type = coalesce(excluded.user_type, public.mcn_creators.user_type),
  connection_status = excluded.connection_status,
  metadata = public.mcn_creators.metadata || excluded.metadata,
  updated_at = now();

-- Backfill normalized profile snapshots without deleting the original payload.
insert into public.mcn_creator_profiles (
  creator_id,
  snapshot_date,
  username,
  display_name,
  avatar_url,
  bio,
  followers,
  avg_views,
  views,
  live_hours,
  live_views,
  video_views,
  gmv,
  nmv,
  live_gmv,
  video_gmv,
  orders,
  products_sold,
  aov,
  ctr,
  cvr,
  commission,
  extra_metrics,
  payload,
  synced_at
)
select distinct on (mc.id, coalesce(r.snapshot_date, r.synced_at::date))
  mc.id,
  coalesce(r.snapshot_date, r.synced_at::date),
  coalesce(r.payload ->> 'username', r.payload ->> 'user_name', r.payload ->> 'handle'),
  coalesce(r.payload ->> 'display_name', r.payload ->> 'nickname', r.payload ->> 'name'),
  coalesce(r.payload ->> 'avatar_url', r.payload ->> 'avatar'),
  r.payload ->> 'bio',
  public.mcn_jsonb_numeric(r.payload, 'followers', 'follower_count', 'fans_count'),
  public.mcn_jsonb_numeric(r.payload, 'avg_views', 'average_views'),
  public.mcn_jsonb_numeric(r.payload, 'views', 'view_count'),
  public.mcn_jsonb_numeric(r.payload, 'live_hours', 'live_duration_hours'),
  public.mcn_jsonb_numeric(r.payload, 'live_views'),
  public.mcn_jsonb_numeric(r.payload, 'video_views'),
  public.mcn_jsonb_numeric(r.payload, 'gmv', 'total_gmv'),
  public.mcn_jsonb_numeric(r.payload, 'nmv', 'net_gmv'),
  public.mcn_jsonb_numeric(r.payload, 'live_gmv'),
  public.mcn_jsonb_numeric(r.payload, 'video_gmv'),
  public.mcn_jsonb_numeric(r.payload, 'orders', 'order_count'),
  public.mcn_jsonb_numeric(r.payload, 'products_sold', 'quantity_sold'),
  public.mcn_jsonb_numeric(r.payload, 'aov', 'average_order_value'),
  public.mcn_jsonb_numeric(r.payload, 'ctr'),
  public.mcn_jsonb_numeric(r.payload, 'cvr', 'conversion_rate'),
  public.mcn_jsonb_numeric(r.payload, 'commission'),
  coalesce(r.payload, '{}'::jsonb),
  coalesce(r.payload, '{}'::jsonb),
  r.synced_at
from public.tts_raw_records r
join public.mcn_creators mc on mc.connection_id = r.connection_id
where r.endpoint_key = 'creator_profile'
order by mc.id, coalesce(r.snapshot_date, r.synced_at::date), r.synced_at desc
on conflict (creator_id, snapshot_date) do update set
  payload = excluded.payload,
  extra_metrics = excluded.extra_metrics,
  synced_at = excluded.synced_at,
  updated_at = now();

-- Backfill the generic metric warehouse. Unknown/new TikTok numeric fields stay here.
insert into public.mcn_metric_points (
  creator_id,
  connection_id,
  endpoint_key,
  record_key,
  metric_key,
  metric_path,
  metric_value,
  dimensions,
  metric_date,
  raw_payload,
  synced_at
)
select
  mc.id,
  mp.connection_id,
  mp.endpoint_key,
  mp.record_key,
  mp.metric_key,
  mp.metric_key,
  mp.metric_value::numeric,
  coalesce(mp.dimensions, '{}'::jsonb),
  mp.snapshot_date,
  rr.payload,
  mp.synced_at
from public.tts_metric_points mp
left join public.mcn_creators mc on mc.connection_id = mp.connection_id
left join public.tts_raw_records rr
  on rr.connection_id = mp.connection_id
 and rr.endpoint_key = mp.endpoint_key
 and rr.record_key = mp.record_key
on conflict (connection_id, endpoint_key, record_key, metric_path) do update set
  creator_id = excluded.creator_id,
  metric_key = excluded.metric_key,
  metric_value = excluded.metric_value,
  dimensions = excluded.dimensions,
  metric_date = excluded.metric_date,
  raw_payload = coalesce(excluded.raw_payload, public.mcn_metric_points.raw_payload),
  synced_at = excluded.synced_at;

-- No browser role can read creator tokens or operational data by default.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mcn_creators',
    'mcn_creator_profiles',
    'mcn_creator_notes',
    'mcn_metric_definitions',
    'mcn_metric_points',
    'mcn_brands',
    'mcn_campaigns',
    'mcn_campaign_creators',
    'mcn_deals',
    'mcn_bookings',
    'mcn_tasks',
    'mcn_issues'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke all on public.mcn_metric_daily_report from anon, authenticated;
grant select on public.mcn_metric_daily_report to service_role;
grant all on sequence
  public.mcn_creator_profiles_id_seq,
  public.mcn_creator_notes_id_seq,
  public.mcn_metric_points_id_seq
to service_role;

revoke execute on function public.mcn_jsonb_numeric(jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.mcn_sync_creator_from_connection() from public, anon, authenticated;
revoke execute on function public.mcn_sync_metric_point() from public, anon, authenticated;
revoke execute on function public.mcn_sync_creator_profile() from public, anon, authenticated;

-- Requirement alignment: CRM fields, discovery funnel, benefits, commercial
-- deal history, MCN reporting and order/resource planning.
alter table public.mcn_creators
  add column if not exists contact_info jsonb not null default '{}'::jsonb,
  add column if not exists username text,
  add column if not exists channel_url text,
  add column if not exists platform text not null default 'tiktok',
  add column if not exists industry text,
  add column if not exists location text,
  add column if not exists pic_name text,
  add column if not exists share_commission_rate numeric,
  add column if not exists onboarded_at timestamptz,
  add column if not exists top_category text;

alter table public.mcn_creator_profiles
  add column if not exists engagement_rate numeric,
  add column if not exists top_category text,
  add column if not exists live_sessions numeric,
  add column if not exists video_count numeric,
  add column if not exists gmv_per_live_hour numeric,
  add column if not exists gmv_per_video numeric,
  add column if not exists live_aov numeric,
  add column if not exists video_aov numeric,
  add column if not exists ctor numeric,
  add column if not exists product_clicks numeric,
  add column if not exists product_orders numeric,
  add column if not exists likes numeric,
  add column if not exists comments numeric,
  add column if not exists shares numeric,
  add column if not exists new_followers numeric;

create table if not exists public.mcn_creator_discovery (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null unique references public.mcn_creators(id) on delete cascade,
  stage text not null default 'discovered' check (stage in ('discovered', 'screening', 'contacted', 'offered', 'onboarded', 'rejected')),
  source text,
  source_url text,
  category text,
  under_mcn boolean,
  mcn_name text,
  live_hours_l30d numeric,
  duplicate_checked boolean not null default false,
  contact_status text not null default 'not_contacted' check (contact_status in ('not_contacted', 'contacted', 'replied', 'no_response', 'declined')),
  offer_status text not null default 'not_offered' check (offer_status in ('not_offered', 'offered', 'accepted', 'declined')),
  last_contacted_at timestamptz,
  next_action_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_creator_discovery_stage_idx on public.mcn_creator_discovery (stage, next_action_at);

create table if not exists public.mcn_benefit_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'expired')),
  benefit text not null,
  value numeric,
  unit text,
  duration_days integer,
  conditions jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcn_creator_benefits (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  policy_id uuid references public.mcn_benefit_policies(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'cancelled')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  actual_value numeric,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_creator_benefits_creator_idx on public.mcn_creator_benefits (creator_id, status, expires_at);

alter table public.mcn_deals
  add column if not exists exclusive_deal boolean not null default false,
  add column if not exists deal_conditions jsonb not null default '{}'::jsonb,
  add column if not exists source_deal_id text,
  add column if not exists historical_period text,
  add column if not exists l30_gmv numeric,
  add column if not exists l60_gmv numeric,
  add column if not exists l90_gmv numeric,
  add column if not exists l30_orders numeric,
  add column if not exists l60_orders numeric,
  add column if not exists l90_orders numeric;

create table if not exists public.mcn_deal_history (
  id bigserial primary key,
  deal_id uuid not null references public.mcn_deals(id) on delete cascade,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gmv numeric,
  nmv numeric,
  orders numeric,
  live_hours numeric,
  video_count numeric,
  commission numeric,
  roi numeric,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (deal_id, period_start, period_end)
);

create table if not exists public.mcn_report_snapshots (
  id bigserial primary key,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  report_date date not null,
  gmv numeric,
  nmv numeric,
  roi_target numeric,
  booking_cast_type text,
  booking_cast_count numeric,
  mega_creator_count numeric,
  mid_creator_count numeric,
  mass_creator_count numeric,
  livestream_atc numeric,
  livestream_hours numeric,
  live_count numeric,
  review_content_hours numeric,
  review_content_count numeric,
  product_clicks numeric,
  product_sold numeric,
  ads_spending numeric,
  commercial_deal numeric,
  commission numeric,
  voucher_value numeric,
  gifted_hours numeric,
  stock_commitment numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, report_date)
);

create index if not exists mcn_report_snapshots_date_idx on public.mcn_report_snapshots (report_date desc, creator_id);

create table if not exists public.mcn_brand_commitments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.mcn_brands(id) on delete set null,
  campaign_id uuid references public.mcn_campaigns(id) on delete set null,
  commitment_type text not null check (commitment_type in ('ads_spending', 'commercial_deal', 'commission', 'voucher', 'gift', 'live_hours', 'stock', 'other')),
  status text not null default 'planned' check (status in ('planned', 'approved', 'in_progress', 'fulfilled', 'cancelled')),
  amount numeric,
  quantity numeric,
  unit text,
  due_at timestamptz,
  fulfilled_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcn_resource_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.mcn_campaigns(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'in_progress', 'completed', 'cancelled')),
  period_start date,
  period_end date,
  target_gmv numeric,
  target_nmv numeric,
  live_hours_target numeric,
  video_count_target numeric,
  booking_cast_target numeric,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcn_resource_allocations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.mcn_resource_plans(id) on delete cascade,
  creator_id uuid not null references public.mcn_creators(id) on delete cascade,
  allocation_type text not null check (allocation_type in ('livestream', 'video', 'product_seeding', 'affiliate', 'other')),
  target_gmv numeric,
  target_nmv numeric,
  target_live_hours numeric,
  target_video_count numeric,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'executing', 'completed', 'cancelled')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcn_resource_allocations_creator_idx on public.mcn_resource_allocations (creator_id, scheduled_start);

insert into public.mcn_metric_definitions (metric_key, display_name, domain, unit, source_endpoint, description, is_kpi)
values
  ('engagement_rate', 'Engagement rate', 'profile', 'percent', 'creator_profile', 'Creator engagement rate.', true),
  ('top_category', 'Top category', 'profile', 'number', 'creator_profile', 'Top content/product category kept in dimensions.', false),
  ('live_sessions', 'Live sessions', 'live', 'count', 'live_core_stats', 'Number of livestream sessions.', true),
  ('video_count', 'Video count', 'profile', 'count', null, 'Number of videos in the reporting period.', true),
  ('gmv_per_live_hour', 'GMV per live hour', 'live', 'currency', 'live_core_stats', 'GMV divided by live hours.', true),
  ('gmv_per_video', 'GMV per video', 'profile', 'currency', null, 'GMV divided by video count.', true),
  ('aov_live', 'Live AOV', 'live', 'currency', null, 'Average order value for livestream.', true),
  ('aov_video', 'Video AOV', 'profile', 'currency', null, 'Average order value for video.', true),
  ('ctor', 'Click-to-order rate', 'traffic', 'percent', null, 'Click-to-order conversion rate.', true),
  ('booking_cast_count', 'Booking creator count', 'campaign', 'count', null, 'Number of creators booked for a campaign.', false),
  ('livestream_atc', 'Livestream add-to-cart', 'live', 'count', null, 'Add-to-cart events during livestream.', false),
  ('review_content_hours', 'Review content hours', 'profile', 'hours', null, 'Content review effort in hours.', false)
on conflict (metric_key) do update set
  display_name = excluded.display_name,
  domain = excluded.domain,
  unit = excluded.unit,
  source_endpoint = excluded.source_endpoint,
  description = excluded.description,
  is_kpi = excluded.is_kpi,
  updated_at = now();

create or replace function public.mcn_enrich_creator_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mcn_creator_profiles
  set
    engagement_rate = coalesce(public.mcn_jsonb_numeric(new.payload, 'engagement_rate', 'er'), engagement_rate),
    top_category = coalesce(new.payload ->> 'top_category', new.payload ->> 'category', top_category),
    live_sessions = coalesce(public.mcn_jsonb_numeric(new.payload, 'live_sessions', 'live_count'), live_sessions),
    video_count = coalesce(public.mcn_jsonb_numeric(new.payload, 'video_count', 'videos'), video_count),
    gmv_per_live_hour = coalesce(public.mcn_jsonb_numeric(new.payload, 'gmv_per_live_hour'), gmv_per_live_hour),
    gmv_per_video = coalesce(public.mcn_jsonb_numeric(new.payload, 'gmv_per_video'), gmv_per_video),
    live_aov = coalesce(public.mcn_jsonb_numeric(new.payload, 'live_aov', 'aov_live'), live_aov),
    video_aov = coalesce(public.mcn_jsonb_numeric(new.payload, 'video_aov', 'aov_video'), video_aov),
    ctor = coalesce(public.mcn_jsonb_numeric(new.payload, 'ctor', 'click_to_order_rate'), ctor),
    product_clicks = coalesce(public.mcn_jsonb_numeric(new.payload, 'product_clicks'), product_clicks),
    product_orders = coalesce(public.mcn_jsonb_numeric(new.payload, 'product_orders'), product_orders),
    likes = coalesce(public.mcn_jsonb_numeric(new.payload, 'likes'), likes),
    comments = coalesce(public.mcn_jsonb_numeric(new.payload, 'comments'), comments),
    shares = coalesce(public.mcn_jsonb_numeric(new.payload, 'shares'), shares),
    new_followers = coalesce(public.mcn_jsonb_numeric(new.payload, 'new_followers'), new_followers),
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists mcn_z_enrich_creator_profile on public.mcn_creator_profiles;
create trigger mcn_z_enrich_creator_profile
after insert or update of payload
on public.mcn_creator_profiles
for each row execute function public.mcn_enrich_creator_profile();

-- Re-run the enrichment trigger for profile snapshots that existed before
-- the CRM-specific columns were added.
update public.mcn_creator_profiles
set payload = public.mcn_creator_profiles.payload
where payload is not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mcn_creator_discovery',
    'mcn_benefit_policies',
    'mcn_creator_benefits',
    'mcn_deal_history',
    'mcn_report_snapshots',
    'mcn_brand_commitments',
    'mcn_resource_plans',
    'mcn_resource_allocations'
  ] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.mcn_touch_updated_at()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke execute on function public.mcn_enrich_creator_profile() from public, anon, authenticated;
grant all on sequence
  public.mcn_deal_history_id_seq,
  public.mcn_report_snapshots_id_seq
to service_role;
