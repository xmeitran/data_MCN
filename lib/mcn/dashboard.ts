import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalMetricKey, isBusinessMetricPath } from "@/lib/metrics";

export type Creator = {
  id: string;
  open_id: string;
  username: string | null;
  display_name: string | null;
  platform: string | null;
  industry: string | null;
  location: string | null;
  pic_name: string | null;
  mcn_status: string;
  onboarding_status: string;
  connection_status: string;
  share_commission_rate: number | null;
  top_category: string | null;
  updated_at: string;
};

export type CreatorProfile = {
  creator_id: string;
  snapshot_date: string;
  followers: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  top_category: string | null;
  gmv: number | null;
  nmv: number | null;
  orders: number | null;
  live_hours: number | null;
  live_views: number | null;
  video_views: number | null;
  live_gmv: number | null;
  video_gmv: number | null;
  gmv_per_live_hour: number | null;
  gmv_per_video: number | null;
  live_aov: number | null;
  video_aov: number | null;
  ctr: number | null;
  ctor: number | null;
  video_count: number | null;
  product_clicks: number | null;
  product_orders: number | null;
};

export type Brand = {
  id: string;
  name: string;
  status: string;
  contact_name: string | null;
};

export type Campaign = {
  id: string;
  brand_id: string | null;
  name: string;
  campaign_type: string;
  status: string;
  owner_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  target_gmv: number | null;
  target_orders: number | null;
};

export type Deal = {
  id: string;
  creator_id: string;
  campaign_id: string | null;
  deal_type: string;
  status: string;
  agreed_fee: number | null;
  commission_rate: number | null;
  exclusive_deal: boolean;
  due_at: string | null;
};

export type Booking = {
  id: string;
  creator_id: string;
  campaign_id: string | null;
  channel: string;
  status: string;
  scheduled_start: string | null;
  expected_gmv: number | null;
  actual_gmv: number | null;
};

export type Task = {
  id: string;
  title: string;
  task_type: string;
  status: string;
  priority: string;
  owner_name: string | null;
  due_at: string | null;
  sla_due_at: string | null;
  creator_id: string | null;
  campaign_id: string | null;
};

export type Issue = {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  owner_name: string | null;
  opened_at: string;
  creator_id: string | null;
};

export type MetricDailyRow = {
  creator_id: string | null;
  metric_date: string | null;
  endpoint_key: string;
  metric_key: string;
  metric_path: string;
  observations: number;
  total_value: number | null;
  average_value: number | null;
};

export type MetricDefinition = {
  metric_key: string;
  display_name: string;
  domain: string;
  unit: string;
  source_endpoint: string | null;
  description: string | null;
  is_kpi: boolean;
};

export type DashboardData = {
  creators: Creator[];
  profiles: CreatorProfile[];
  brands: Brand[];
  campaigns: Campaign[];
  deals: Deal[];
  bookings: Booking[];
  tasks: Task[];
  issues: Issue[];
  metricDaily: MetricDailyRow[];
  metricDefinitions: MetricDefinition[];
  connections: { id: string; status: string; user_type: number | null; last_synced_at: string | null }[];
  syncRuns: { id: number; status: string; started_at: string; finished_at: string | null }[];
  warnings: string[];
};

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

async function safeRows<T>(query: PromiseLike<QueryResult<T>>, label: string, warnings: string[]) {
  const result = await query;
  if (result.error) {
    warnings.push(`${label}: ${result.error.message}`);
    return [] as T[];
  }
  return result.data ?? [];
}

function normalizeMetricRows(rows: MetricDailyRow[]) {
  const grouped = new Map<string, MetricDailyRow>();
  for (const row of rows) {
    if (!isBusinessMetricPath(row.metric_path)) continue;
    const metricKey = canonicalMetricKey(row.metric_path);
    const key = [row.creator_id ?? "", row.metric_date ?? "", row.endpoint_key, metricKey].join("|");
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...row, metric_key: metricKey, metric_path: metricKey });
      continue;
    }
    const observations = Number(current.observations || 0) + Number(row.observations || 0);
    const total = Number(current.total_value || 0) + Number(row.total_value || 0);
    grouped.set(key, { ...current, metric_key: metricKey, metric_path: metricKey, observations, total_value: total, average_value: observations ? total / observations : null });
  }
  return [...grouped.values()];
}

export async function loadDashboardData(): Promise<DashboardData> {
  const warnings: string[] = [];

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Missing Supabase server configuration");
    return {
      creators: [],
      profiles: [],
      brands: [],
      campaigns: [],
      deals: [],
      bookings: [],
      tasks: [],
      issues: [],
      metricDaily: [],
      metricDefinitions: [],
      connections: [],
      syncRuns: [],
      warnings,
    };
  }

  const [creators, profiles, brands, campaigns, deals, bookings, tasks, issues, metricDaily, metricDefinitions, connections, syncRuns] = await Promise.all([
    safeRows<Creator>(
      supabase
        .from("mcn_creators")
        .select("id, open_id, username, display_name, platform, industry, location, pic_name, mcn_status, onboarding_status, connection_status, share_commission_rate, top_category, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500),
      "Creator CRM",
      warnings,
    ),
    safeRows<CreatorProfile>(
      supabase
        .from("mcn_creator_profiles")
        .select("creator_id, snapshot_date, followers, avg_views, engagement_rate, top_category, gmv, nmv, orders, live_hours, live_views, video_views, live_gmv, video_gmv, gmv_per_live_hour, gmv_per_video, live_aov, video_aov, ctr, ctor, video_count, product_clicks, product_orders")
        .order("snapshot_date", { ascending: false })
        .limit(1000),
      "Creator performance",
      warnings,
    ),
    safeRows<Brand>(
      supabase.from("mcn_brands").select("id, name, status, contact_name").order("name").limit(500),
      "Brands",
      warnings,
    ),
    safeRows<Campaign>(
      supabase
        .from("mcn_campaigns")
        .select("id, brand_id, name, campaign_type, status, owner_name, starts_at, ends_at, target_gmv, target_orders")
        .order("starts_at", { ascending: false })
        .limit(200),
      "Campaigns",
      warnings,
    ),
    safeRows<Deal>(
      supabase
        .from("mcn_deals")
        .select("id, creator_id, campaign_id, deal_type, status, agreed_fee, commission_rate, exclusive_deal, due_at")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(300),
      "Deals",
      warnings,
    ),
    safeRows<Booking>(
      supabase
        .from("mcn_bookings")
        .select("id, creator_id, campaign_id, channel, status, scheduled_start, expected_gmv, actual_gmv")
        .order("scheduled_start", { ascending: true, nullsFirst: false })
        .limit(300),
      "Bookings",
      warnings,
    ),
    safeRows<Task>(
      supabase
        .from("mcn_tasks")
        .select("id, title, task_type, status, priority, owner_name, due_at, sla_due_at, creator_id, campaign_id")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(300),
      "Operations tasks",
      warnings,
    ),
    safeRows<Issue>(
      supabase
        .from("mcn_issues")
        .select("id, title, category, severity, status, owner_name, opened_at, creator_id")
        .order("opened_at", { ascending: false })
        .limit(300),
      "Issues",
      warnings,
    ),
    safeRows<MetricDailyRow>(
      supabase
        .from("mcn_metric_points")
        .select("creator_id, metric_date, endpoint_key, metric_key, metric_path, metric_value")
        .order("metric_date", { ascending: false, nullsFirst: false })
        .limit(20000)
        .then(({ data, error }) => ({
          data: (data ?? []).map((row) => ({
            ...row,
            observations: 1,
            total_value: row.metric_value,
            average_value: row.metric_value,
          })),
          error,
        })),
      "Metric warehouse",
      warnings,
    ),
    safeRows<MetricDefinition>(
      supabase
        .from("mcn_metric_definitions")
        .select("metric_key, display_name, domain, unit, source_endpoint, description, is_kpi")
        .order("domain")
        .order("display_name")
        .limit(500),
      "Metric definitions",
      warnings,
    ),
    safeRows<{ id: string; status: string; user_type: number | null; last_synced_at: string | null }>(
      supabase.from("tts_connections").select("id, status, user_type, last_synced_at").limit(500),
      "TikTok connections",
      warnings,
    ),
    safeRows<{ id: number; status: string; started_at: string; finished_at: string | null }>(
      supabase.from("tts_sync_runs").select("id, status, started_at, finished_at").order("id", { ascending: false }).limit(20),
      "Sync history",
      warnings,
    ),
  ]);

  return { creators, profiles, brands, campaigns, deals, bookings, tasks, issues, metricDaily: normalizeMetricRows(metricDaily), metricDefinitions, connections, syncRuns, warnings };
}
