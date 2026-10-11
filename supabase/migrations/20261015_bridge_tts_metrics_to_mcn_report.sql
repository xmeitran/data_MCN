-- The TikTok sync writes normalized points to tts_metric_points while the
-- dashboard reads the MCN reporting view. Keep both sources visible without
-- copying millions of rows between tables. Keep the existing view's numeric
-- aggregate types so this migration can be applied without dropping it.
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
group by creator_id, metric_date, endpoint_key, metric_key, metric_path

union all

select
  null::uuid as creator_id,
  snapshot_date as metric_date,
  endpoint_key,
  metric_key,
  metric_key as metric_path,
  count(*) as observations,
  sum(metric_value)::numeric as total_value,
  avg(metric_value)::numeric as average_value,
  min(metric_value)::numeric as minimum_value,
  max(metric_value)::numeric as maximum_value
from public.tts_metric_points
where metric_value is not null
group by snapshot_date, endpoint_key, metric_key;

revoke all on public.mcn_metric_daily_report from anon, authenticated;
grant select on public.mcn_metric_daily_report to service_role;
