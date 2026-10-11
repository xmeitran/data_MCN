-- Materialize the existing TikTok metric points into the MCN warehouse.
-- The trigger in 20261011_mcn_platform.sql keeps future writes in sync;
-- this backfill makes the dashboard fast for data collected before that
-- trigger was installed.
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
where mp.metric_value is not null
on conflict (connection_id, endpoint_key, record_key, metric_path) do update set
  creator_id = excluded.creator_id,
  metric_key = excluded.metric_key,
  metric_value = excluded.metric_value,
  dimensions = excluded.dimensions,
  metric_date = excluded.metric_date,
  raw_payload = coalesce(excluded.raw_payload, public.mcn_metric_points.raw_payload),
  synced_at = excluded.synced_at;

create index if not exists mcn_metric_points_report_idx
  on public.mcn_metric_points (metric_date desc, endpoint_key, metric_key, metric_path);

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
  and metric_path !~* '(^|[.[])(id|url|uri|avatar|image|images|main_images|thumbnail|cover|logo|width|height|x|y|index|offset|limit|page_size)([.]|]|$)'
group by creator_id, metric_date, endpoint_key, metric_key, metric_path;

revoke all on public.mcn_metric_daily_report from anon, authenticated;
grant select on public.mcn_metric_daily_report to service_role;
