import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalMetricKey, isBusinessMetricPath, isCreatorPerformanceEndpoint } from "@/lib/metrics";
import { ENDPOINTS, PARTNER_ENDPOINTS } from "@/lib/tiktok/endpoints";
import tiktokApiCatalog from "@/data/tiktok-api-catalog.json";

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

export type ProductRecord = { id: number; product_id: string; creator_id: string | null; snapshot_date: string; payload: Record<string, unknown> };
export type LiveSessionRecord = { id: number; live_room_id: string; snapshot_date: string; payload: Record<string, unknown> };
export type ApiDoc = {
  endpoint_key: string;
  method: string;
  path: string;
  response_count: number;
  first_seen: string | null;
  last_seen: string | null;
  dates: string[];
  fields: string[];
  values: Array<{ field: string; samples: string[] }>;
  sample_output: unknown;
  doc_title_en: string | null;
  doc_url: string | null;
  description_en: string | null;
  documented_fields: Array<{ field: string; type: string; sample: string }>;
  documented_output: unknown;
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
  products: ProductRecord[];
  liveSessions: LiveSessionRecord[];
  apiDocs: ApiDoc[];
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

function scalarText(value: unknown) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value.length > 100 ? `${value.slice(0, 97)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

type ApiCatalogEntry = (typeof tiktokApiCatalog.apis)[number];

const endpointDefinitions = new Map([...ENDPOINTS, ...PARTNER_ENDPOINTS].map((endpoint) => [endpoint.key, endpoint]));
const catalogByPath = new Map(tiktokApiCatalog.apis.filter((entry) => entry.api_path).map((entry) => [`${entry.method}:${entry.api_path}`, entry]));

function catalogEntryFor(endpointKey: string, method: string, runtimePath: string): ApiCatalogEntry | undefined {
  const definitionPath = endpointDefinitions.get(endpointKey)?.path;
  const exact = [definitionPath, runtimePath]
    .filter(Boolean)
    .map((path) => catalogByPath.get(`${method}:${path}`))
    .find(Boolean);
  if (exact) return exact;
  if (runtimePath.includes("/live_rooms/")) {
    const normalized = runtimePath.replace(/\/live_rooms\/[^/]+\//, "/live_rooms/{live_room_id}/");
    return catalogByPath.get(`${method}:${normalized}`);
  }
  return undefined;
}

function summarizeApiDocs(rows: Array<{ endpoint_key: string; method: string; path: string; snapshot_date: string; fetched_at: string; response_data: unknown }>): ApiDoc[] {
  const grouped = new Map<string, ApiDoc & { valueMap: Map<string, Set<string>> }>();
  const visit = (value: unknown, path: string, fieldSet: Set<string>, valueMap: Map<string, Set<string>>, depth = 0) => {
    if (depth > 5 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length) visit(value[0], `${path}[0]`, fieldSet, valueMap, depth + 1);
      return;
    }
    if (typeof value !== "object") {
      fieldSet.add(path);
      const samples = valueMap.get(path) ?? new Set<string>();
      samples.add(scalarText(value));
      valueMap.set(path, samples);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (["avatar", "url", "uri", "image", "images", "main_images", "thumbnail", "cover", "logo"].some((part) => key.toLowerCase().includes(part))) continue;
      visit(child, path ? `${path}.${key}` : key, fieldSet, valueMap, depth + 1);
    }
  };

  for (const row of rows) {
    const response = row.response_data && typeof row.response_data === "object" ? row.response_data : {};
    const catalogEntry = catalogEntryFor(row.endpoint_key, row.method, row.path);
    const current = grouped.get(row.endpoint_key) ?? {
      endpoint_key: row.endpoint_key,
      method: row.method,
      path: row.path,
      response_count: 0,
      first_seen: row.fetched_at,
      last_seen: row.fetched_at,
      dates: [],
      fields: [],
      values: [],
      sample_output: response,
      doc_title_en: catalogEntry?.title ?? null,
      doc_url: catalogEntry?.url ?? null,
      description_en: catalogEntry?.description_en ?? null,
      documented_fields: catalogEntry?.response_fields ?? [],
      documented_output: catalogEntry?.response_sample ?? null,
      valueMap: new Map<string, Set<string>>(),
    };
    current.response_count += 1;
    current.first_seen = !current.first_seen || row.fetched_at < current.first_seen ? row.fetched_at : current.first_seen;
    current.last_seen = !current.last_seen || row.fetched_at > current.last_seen ? row.fetched_at : current.last_seen;
    if (!current.dates.includes(row.snapshot_date)) current.dates.push(row.snapshot_date);
    const fieldSet = new Set(current.fields);
    visit(response, "data", fieldSet, current.valueMap);
    current.fields = [...fieldSet].sort();
    grouped.set(row.endpoint_key, current);
  }

  return [...grouped.values()].map(({ valueMap, ...doc }) => ({
    ...doc,
    dates: doc.dates.sort().reverse(),
    fields: doc.fields.slice(0, 40),
    values: [...valueMap.entries()].slice(0, 30).map(([field, samples]) => ({ field, samples: [...samples].slice(0, 3) })),
  }));
}

function normalizeMetricRows(rows: MetricDailyRow[]) {
  const grouped = new Map<string, MetricDailyRow>();
  for (const row of rows) {
    if (!isCreatorPerformanceEndpoint(row.endpoint_key)) continue;
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
      products: [],
      liveSessions: [],
      apiDocs: [],
      connections: [],
      syncRuns: [],
      warnings,
    };
  }

  const [creators, profiles, metricDaily, connections, syncRuns, products, liveSessions, apiRows] = await Promise.all([
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
    safeRows<ProductRecord>(
      supabase.from("mcn_products").select("id, product_id, creator_id, snapshot_date, payload").order("snapshot_date", { ascending: false }).limit(1000),
      "Products",
      warnings,
    ),
    safeRows<LiveSessionRecord>(
      supabase.from("mcn_live_sessions").select("id, live_room_id, snapshot_date, payload").order("snapshot_date", { ascending: false }).limit(500),
      "LIVE sessions",
      warnings,
    ),
    safeRows<{ endpoint_key: string; method: string; path: string; snapshot_date: string; fetched_at: string; response_data: unknown }>(
      supabase.from("api_data").select("endpoint_key, method, path, snapshot_date, fetched_at, response_data").order("fetched_at", { ascending: false }).limit(5000),
      "API documentation",
      warnings,
    ),
  ]);

  return {
    creators,
    profiles,
    brands: [],
    campaigns: [],
    deals: [],
    bookings: [],
    tasks: [],
    issues: [],
    metricDaily: normalizeMetricRows(metricDaily),
    metricDefinitions: [],
    connections,
    syncRuns,
    products,
    liveSessions,
    apiDocs: summarizeApiDocs(apiRows),
    warnings,
  };
}
