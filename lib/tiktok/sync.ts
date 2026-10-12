import { callApi, refreshToken, TikTokApiError } from "./client";
import { ENDPOINTS, PARTNER_ENDPOINTS, EndpointDef, SyncWindow } from "./endpoints";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusinessMetricPath, isCreatorPerformanceEndpoint } from "@/lib/metrics";
import { deriveAffiliateOrderMetrics, parseTikTokNumber } from "./metric-utils";

const MAX_PAGES = 200; // chặn vòng lặp vô hạn nếu API trả token lặp
const REFRESH_BEFORE_MS = 24 * 3600 * 1000;
const UPSERT_BATCH_SIZE = 500;
const STALE_RUN_MS = 10 * 60 * 1000;
// Render giới hạn request khoảng 300s. Chừa thời gian để ghi trạng thái run
// và trả response; lượt cron sau sẽ tiếp tục nhờ checkpoint.
const SYNC_BUDGET_MS = concurrencyFromEnv("TTS_SYNC_BUDGET_MS", 240_000);

function concurrencyFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const CONNECTION_CONCURRENCY = concurrencyFromEnv("TTS_SYNC_CONNECTION_CONCURRENCY", 4);
const CONTEXT_CONCURRENCY = concurrencyFromEnv("TTS_SYNC_CONTEXT_CONCURRENCY", 6);

export type SyncWindowOptions = { window?: SyncWindow; budgetMs?: number };

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function consume() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

type Connection = {
  id: string;
  open_id: string;
  user_type: number | null;
  granted_scopes: string[] | null;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
};

/** Khung thời gian = ngày hôm qua theo giờ Việt Nam (UTC+7) */
export function yesterdayWindowVN(now = new Date()): SyncWindow {
  const vnOffset = 7 * 3600 * 1000;
  const vnNow = new Date(now.getTime() + vnOffset);
  const startVN = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate() - 1);
  const startUnix = Math.floor((startVN - vnOffset) / 1000);
  return {
    startUnix,
    endUnix: startUnix + 86400,
    date: new Date(startVN).toISOString().slice(0, 10),
  };
}

export function dateWindowVN(date: string): SyncWindow {
  const startUnix = Math.floor(Date.parse(`${date}T00:00:00+07:00`) / 1000);
  return { startUnix, endUnix: startUnix + 86400, date };
}

async function ensureFreshToken(
  supabase: ReturnType<typeof createAdminClient>,
  c: Connection,
): Promise<string> {
  if (new Date(c.access_token_expires_at).getTime() - Date.now() > REFRESH_BEFORE_MS) {
    return c.access_token;
  }
  const t = await refreshToken(c.refresh_token);
  const { error } = await supabase
    .from("tts_connections")
    .update({
      access_token: t.access_token,
      access_token_expires_at: new Date(t.access_token_expire_in * 1000).toISOString(),
      refresh_token: t.refresh_token,
      refresh_token_expires_at: new Date(t.refresh_token_expire_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.id);
  if (error) throw error;
  return t.access_token;
}

function collectLiveRoomIds(value: unknown, ids: Set<string>, liveContext = false) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectLiveRoomIds(item, ids, liveContext);
    return;
  }
  const objectValue = value as Record<string, unknown>;
  const objectIsLive = liveContext || String(objectValue.content_type ?? objectValue.content_type_name ?? "").toUpperCase() === "LIVE";
  for (const [key, child] of Object.entries(objectValue)) {
    const lower = key.toLowerCase();
    const nextLiveContext = objectIsLive || (lower === "content_type" && String(child).toUpperCase() === "LIVE");
    if (nextLiveContext && /^(live_room_id|live_id|content_id)$/.test(lower) && child) ids.add(String(child));
    collectLiveRoomIds(child, ids, nextLiveContext);
  }
}

function collectVideoIds(value: unknown, ids: Set<string>, videoContext = false) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectVideoIds(item, ids, videoContext);
    return;
  }
  const objectValue = value as Record<string, unknown>;
  const objectIsVideo =
    videoContext || String(objectValue.content_type ?? objectValue.content_type_name ?? "").toUpperCase() === "VIDEO";
  for (const [key, child] of Object.entries(objectValue)) {
    const lower = key.toLowerCase();
    const nextVideoContext = objectIsVideo || (lower === "content_type" && String(child).toUpperCase() === "VIDEO");
    if (nextVideoContext && /^(video_id|videoid|content_id)$/.test(lower) && child) ids.add(String(child));
    collectVideoIds(child, ids, nextVideoContext);
  }
}

type CreatorIdentity = {
  openId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
};

const CREATOR_ID_KEYS = new Set([
  "creator_id", "creator_open_id", "creator_user_id", "affiliate_creator_id", "affiliate_open_id",
]);
const CREATOR_CONTEXT_KEYS = new Set(["creator", "affiliate_creator", "affiliate_creator_info", "author"]);

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Extract creator identity from CAP/order responses without treating shop/seller as a creator. */
function findCreatorIdentity(value: unknown, context = ""): CreatorIdentity | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCreatorIdentity(item, context);
      if (found) return found;
    }
    return undefined;
  }

  const object = value as Record<string, unknown>;
  const normalized = Object.fromEntries(Object.entries(object).map(([key, child]) => [key.toLowerCase(), child]));
  const explicitId = Object.entries(normalized).find(([key, child]) => CREATOR_ID_KEYS.has(key) && textValue(child));
  const contextualId = context && CREATOR_CONTEXT_KEYS.has(context)
    ? ["open_id", "user_id", "id"].map((key) => textValue(normalized[key])).find(Boolean)
    : undefined;
  const openId = textValue(explicitId?.[1]) ?? contextualId;
  if (openId) {
    return {
      openId,
      username: textValue(normalized.username) ?? textValue(normalized.handle) ?? textValue(normalized.unique_id),
      displayName: textValue(normalized.display_name) ?? textValue(normalized.nickname) ?? textValue(normalized.name),
      avatarUrl: textValue(normalized.avatar_url) ?? textValue(normalized.avatar),
    };
  }

  for (const [key, child] of Object.entries(object)) {
    const lower = key.toLowerCase();
    if (CREATOR_CONTEXT_KEYS.has(lower)) {
      const found = findCreatorIdentity(child, lower);
      if (found) return found;
    }
  }
  for (const [key, child] of Object.entries(object)) {
    const lower = key.toLowerCase();
    if (["shop", "seller", "product", "skus", "sku", "buyer", "customer"].includes(lower)) continue;
    const found = findCreatorIdentity(child, context);
    if (found) return found;
  }
  return undefined;
}

/** Lấy live_room_id từ payload đã lưu để gọi analytics live. */
async function liveRoomIds(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  window: SyncWindow,
): Promise<string[]> {
  const since = new Date(Date.parse(`${window.date}T00:00:00Z`) - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("api_data")
    .select("response_data")
    .eq("connection_id", connectionId)
    .in("endpoint_key", ["affiliate_orders", "partner_cap_orders"])
    .gte("snapshot_date", since);
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of data ?? []) collectLiveRoomIds(row.response_data, ids);
  return [...ids];
}

/** Lấy video_id thật từ order payloads để gọi Video Performances an toàn. */
async function videoIds(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  window: SyncWindow,
): Promise<string[]> {
  const since = new Date(Date.parse(`${window.date}T00:00:00Z`) - 180 * 86400 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("api_data")
    .select("response_data")
    .eq("connection_id", connectionId)
    .eq("endpoint_key", "affiliate_orders")
    .gte("snapshot_date", since);
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of data ?? []) collectVideoIds(row.response_data, ids);
  return [...ids];
}

function prioritizeEndpoints<T extends { key: string }>(endpoints: T[]) {
  const priority: Record<string, number> = {
    creator_profile: 10,
    affiliate_orders: 20,
    live_core_stats: 30,
    live_gmv_trend: 31,
    live_view_trend: 32,
    live_interactive_trend: 33,
    live_traffic: 34,
    live_product_stats: 35,
    live_user_portraits: 36,
    partner_category_assets: 10,
    partner_cap_orders: 20,
    partner_tap_orders: 21,
    partner_campaigns: 40,
    partner_campaign_products: 50,
    partner_campaign_performance: 60,
    showcase_products: 70,
    sample_applications: 80,
  };
  return endpoints
    .map((endpoint, index) => ({ endpoint, index }))
    .sort((a, b) => (priority[a.endpoint.key] ?? 100) - (priority[b.endpoint.key] ?? 100) || a.index - b.index)
    .map(({ endpoint }) => endpoint);
}

/** Đọc lại payload đã đồng bộ của 1 endpoint (dùng làm đầu vào cho endpoint phụ thuộc) */
async function storedPayloads(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  endpointKey: string,
): Promise<any[]> {
  const { data, error } = await supabase
    .from("api_data")
    .select("response_data")
    .eq("connection_id", connectionId)
    .eq("endpoint_key", endpointKey);
  if (error) throw error;
  return (data ?? []).flatMap((r: any) => {
    const response = r.response_data ?? {};
    const list = Object.values(response).find((value) => Array.isArray(value));
    return Array.isArray(list) ? list : [response];
  });
}

/** Token partner (MCN/TAP) = user_type 3, hoặc có scope bắt đầu bằng "partner." */
export function isPartner(c: Pick<Connection, "user_type" | "granted_scopes">) {
  return c.user_type === 3 || (c.granted_scopes ?? []).some((s) => s.startsWith("partner."));
}

type Ctx = { id?: string; cipher?: string };

async function ensureCreator(
  supabase: ReturnType<typeof createAdminClient>,
  connection: Pick<Connection, "id" | "open_id">,
  identity?: CreatorIdentity,
) {
  const openId = identity?.openId ?? connection.open_id;
  const { data, error } = await supabase
    .from("mcn_creators")
    .upsert(
      {
        connection_id: connection.id,
        open_id: openId,
        username: identity?.username ?? null,
        display_name: identity?.displayName ?? null,
        avatar_url: identity?.avatarUrl ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,open_id" },
    )
    .select("id")
    .single();
  if (error && error.code !== "42P01") throw error;
  return data?.id ?? null;
}

async function ensurePayloadCreator(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  identity: CreatorIdentity,
) {
  const { data, error } = await supabase
    .from("mcn_creators")
    .upsert({
      connection_id: connectionId,
      open_id: identity.openId,
      username: identity.username ?? null,
      display_name: identity.displayName ?? null,
      avatar_url: identity.avatarUrl ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id,open_id" })
    .select("id")
    .single();
  if (error && error.code !== "42P01") throw error;
  return data?.id ?? null;
}

function checkpointKey(ctx: Ctx) {
  if (ctx.id && ctx.cipher) return `${ctx.id}:${ctx.cipher}`;
  if (ctx.id) return ctx.id;
  if (ctx.cipher) return `cipher:${ctx.cipher}`;
  return "root";
}

async function persistApiData(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  ep: EndpointDef,
  ctx: Ctx,
  snapshotDate: string,
  page: number,
  pageToken: string | undefined,
  req: { path?: string; query?: Record<string, string | number | undefined>; body?: unknown },
  responseData: unknown,
) {
  const { error } = await supabase.from("api_data").upsert(
    {
      connection_id: connectionId,
      endpoint_key: ep.key,
      method: ep.method,
      path: req.path ?? ep.path,
      context_key: checkpointKey(ctx),
      page_number: page,
      page_token: pageToken ?? null,
      request_query: req.query ?? {},
      request_body: req.body ?? {},
      response_data: responseData ?? {},
      response_code: 0,
      snapshot_date: snapshotDate,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,endpoint_key,context_key,snapshot_date,page_number" },
  );
  // Code can be deployed before the migration; the existing normalized sync
  // must remain usable during that rollout.
  if (error && error.code !== "42P01") throw error;
}

async function checkpointIsComplete(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  endpointKey: string,
  context: Ctx,
  snapshotDate: string,
) {
  const { data, error } = await supabase
    .from("tts_sync_checkpoints")
    .select("status")
    .eq("connection_id", connectionId)
    .eq("endpoint_key", endpointKey)
    .eq("context_key", checkpointKey(context))
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();
  // Allow application code to deploy before the optional checkpoint migration.
  if (error?.code === "42P01") return false;
  if (error) throw error;
  return data?.status === "success";
}

async function saveCheckpoint(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  endpointKey: string,
  context: Ctx,
  snapshotDate: string,
  status: "success" | "failed",
  recordCount: number,
  lastError: string | null = null,
) {
  const { error } = await supabase.from("tts_sync_checkpoints").upsert(
    {
      connection_id: connectionId,
      endpoint_key: endpointKey,
      context_key: checkpointKey(context),
      snapshot_date: snapshotDate,
      status,
      record_count: recordCount,
      last_error: lastError?.slice(0, 2000) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,endpoint_key,context_key,snapshot_date" },
  );
  if (error && error.code !== "42P01") throw error;
}

type MetricPoint = {
  metric_key: string;
  metric_value: number;
  dimensions: Record<string, string>;
};

class SyncBudgetExceeded extends Error {
  constructor() {
    super("sync budget reached; next cron run will continue from checkpoints");
    this.name = "SyncBudgetExceeded";
  }
}

/** Tách mọi số đo trong response nhưng bỏ qua id/thời gian/mã kỹ thuật. */
function extractMetricPoints(value: unknown, path = "data", dimensions: Record<string, string> = {}): MetricPoint[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return isBusinessMetricPath(path) ? [{ metric_key: path, metric_value: value, dimensions }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => extractMetricPoints(item, `${path}[${index}]`, dimensions));
  }
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const lower = key.toLowerCase();
    if (
      lower === "id" || lower.endsWith("_id") || lower.includes("timestamp") ||
      lower.includes("unix") || lower.endsWith("_at") || lower.endsWith("_time") ||
      lower === "code" || lower === "page_size"
    ) {
      return [];
    }
    const nextPath = path === "data" ? key : `${path}.${key}`;
    if (typeof child === "string" && /amount|value|rate|count|quantity|orders?|views?|gmv|nmv|commission|followers?|likes?|comments?|shares?|clicks?|duration|hours?|sold/i.test(key)) {
      const parsed = parseTikTokNumber(child);
      return parsed !== null && isBusinessMetricPath(nextPath) ? [{ metric_key: nextPath, metric_value: parsed, dimensions }] : [];
    }
    if (typeof child === "string" && (key === "name" || key === "title" || key === "type")) {
      return extractMetricPoints({}, nextPath, { ...dimensions, [key]: child });
    }
    return extractMetricPoints(child, nextPath, dimensions);
  });
}

async function persistMetricPoints(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  ep: EndpointDef,
  rows: Array<{ record_key: string; payload: unknown; snapshot_date: string }>,
  ctx: Ctx = {},
) {
  const points = rows.flatMap((row) => [
    ...extractMetricPoints(row.payload),
    ...(ep.key === "affiliate_orders" ? deriveAffiliateOrderMetrics(row.payload) : []),
  ].map((point) => ({ ...point, row })));
  if (!points.length) return;

  const creator = await supabase.from("mcn_creators").select("id").eq("connection_id", connectionId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (creator.error && creator.error.code !== "42P01") throw creator.error;

  const creatorIdByRecord = new Map<string, string | null>();
  const payloadCreatorCache = new Map<string, string | null>();
  for (const row of rows) {
    const identity = findCreatorIdentity(row.payload);
    if (!identity) {
      creatorIdByRecord.set(row.record_key, creator.data?.id ?? null);
      continue;
    }
    let creatorId = payloadCreatorCache.get(identity.openId);
    if (creatorId === undefined) {
      const resolvedCreatorId = await ensurePayloadCreator(supabase, connectionId, identity);
      creatorId = resolvedCreatorId;
      payloadCreatorCache.set(identity.openId, resolvedCreatorId);
    }
    creatorIdByRecord.set(row.record_key, creatorId ?? null);
  }

  if (ep.forEach === "live_room" && ctx.id) {
    const liveRows = points.map((point) => ({
      connection_id: connectionId,
      live_room_id: ctx.id,
      endpoint_key: ep.key,
      record_key: point.row.record_key,
      metric_key: point.metric_key,
      metric_path: point.metric_key,
      metric_value: point.metric_value,
      dimensions: point.dimensions,
      snapshot_date: point.row.snapshot_date,
      raw_payload: point.row.payload ?? {},
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("mcn_live_metrics").upsert(liveRows, {
      onConflict: "connection_id,live_room_id,endpoint_key,record_key,metric_path",
    });
    if (error && error.code !== "42P01") throw error;
    return;
  }

  if (!isCreatorPerformanceEndpoint(ep.key)) return;
  for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
    const creatorRows = points.slice(i, i + UPSERT_BATCH_SIZE).map((point) => ({
      creator_id: creatorIdByRecord.get(point.row.record_key) ?? creator.data?.id ?? null,
      connection_id: connectionId,
      endpoint_key: ep.key,
      record_key: point.row.record_key,
      metric_key: point.metric_key,
      metric_path: point.metric_key,
      metric_value: point.metric_value,
      dimensions: point.dimensions,
      snapshot_date: point.row.snapshot_date,
      raw_payload: point.row.payload ?? {},
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("mcn_creator_metrics").upsert(creatorRows, {
      onConflict: "connection_id,endpoint_key,record_key,metric_path",
    });
    if (error && error.code !== "42P01") throw error;
  }
}

const PROFILE_NUMERIC_FIELDS = [
  "followers", "avg_views", "engagement_rate", "gmv", "nmv", "orders", "live_hours",
  "live_views", "video_views", "live_gmv", "video_gmv", "gmv_per_live_hour", "gmv_per_video",
  "live_aov", "video_aov", "ctr", "ctor", "video_count", "product_clicks", "product_orders",
] as const;

function scalarLeaves(value: unknown, output: Record<string, unknown> = {}) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) scalarLeaves(item, output);
    return output;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child && typeof child === "object") scalarLeaves(child, output);
    else output[key.toLowerCase().replace(/[^a-z0-9]/g, "")] = child;
  }
  return output;
}

function normalizeCreatorProfile(payload: unknown) {
  const leaves = scalarLeaves(payload);
  const values: Record<string, number | null> = {};
  for (const field of PROFILE_NUMERIC_FIELDS) {
    const compact = field.replaceAll("_", "");
    const exact = leaves[compact];
    const parsed = parseTikTokNumber(exact);
    values[field] = parsed;
  }
  const category = leaves.topcategory ?? leaves.category ?? leaves.categoryname;
  return { ...values, top_category: textValue(category) ?? null };
}

async function persistDomainRows(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  ep: EndpointDef,
  rows: Array<{ record_key: string; payload: unknown; snapshot_date: string }>,
  ctx: Ctx = {},
) {
  if (ep.key === "showcase_products") {
    const defaultCreator = await supabase.from("mcn_creators").select("id").eq("connection_id", connectionId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (defaultCreator.error && defaultCreator.error.code !== "42P01") throw defaultCreator.error;
    const payloadCreatorCache = new Map<string, string | null>();
    const products = [] as Record<string, unknown>[];
    for (const row of rows) {
      const identity = findCreatorIdentity(row.payload);
      let creatorId = defaultCreator.data?.id ?? null;
      if (identity) {
        creatorId = payloadCreatorCache.get(identity.openId) ?? await ensurePayloadCreator(supabase, connectionId, identity);
        payloadCreatorCache.set(identity.openId, creatorId);
      }
      products.push({
      connection_id: connectionId,
      creator_id: creatorId,
      product_id: row.record_key,
      snapshot_date: row.snapshot_date,
      payload: row.payload ?? {},
      synced_at: new Date().toISOString(),
      });
    }
    const { error } = await supabase.from("mcn_products").upsert(products, {
      onConflict: "connection_id,product_id,snapshot_date",
    });
    if (error && error.code !== "42P01") throw error;
  }

  if (ep.forEach === "live_room" && ctx.id) {
    const session = rows[0];
    const { error } = await supabase.from("mcn_live_sessions").upsert({
      connection_id: connectionId,
      live_room_id: ctx.id,
      snapshot_date: session?.snapshot_date,
      payload: session?.payload ?? {},
      synced_at: new Date().toISOString(),
    }, { onConflict: "connection_id,live_room_id,snapshot_date" });
    if (error && error.code !== "42P01") throw error;
  }

  if (ep.key === "creator_profile") {
    const creator = await supabase.from("mcn_creators").select("id").eq("connection_id", connectionId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (creator.error && creator.error.code !== "42P01") throw creator.error;
    if (creator.data?.id && rows[0]) {
      const profile = normalizeCreatorProfile(rows[0].payload);
      const { error } = await supabase.from("mcn_creator_profiles").upsert({
        creator_id: creator.data.id,
        connection_id: connectionId,
        snapshot_date: rows[0].snapshot_date,
        payload: rows[0].payload ?? {},
        ...profile,
        synced_at: new Date().toISOString(),
      }, { onConflict: "creator_id,snapshot_date" });
      if (error && error.code !== "42P01") throw error;
    }
  }
}

/** Chỉ asset Affiliate Partner mới dùng được cho campaign APIs.
 * Các category asset khác vẫn được lưu để không mất dữ liệu authorization,
 * nhưng TikTok sẽ trả 16032012 nếu dùng chúng làm category_asset_cipher.
 */
function affiliatePartnerAssets(payloads: any[]) {
  return payloads.filter(
    (a) => String(a?.category?.name ?? "").toLowerCase() === "seller and scalable creator match-up",
  );
}

async function syncEndpoint(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  accessToken: string,
  ep: EndpointDef,
  window: SyncWindow,
  ctx: Ctx = {},
  deadline = Number.POSITIVE_INFINITY,
): Promise<number> {
  const { id, cipher } = ctx;
  let pageToken: string | undefined;
  let total = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (Date.now() >= deadline) throw new SyncBudgetExceeded();
    const req = ep.buildRequest({ pageToken, window, id, cipher });
    const data: any = await callApi({
      method: ep.method,
      path: req.path ?? ep.path,
      accessToken,
      query: req.query,
      body: req.body,
    });
    await persistApiData(supabase, connectionId, ep, ctx, window.date, page, pageToken, req, data);

    // Nếu tên field danh sách khác tài liệu, tự lấy mảng đầu tiên trong `data`
    const items: any[] =
      ep.listField === null
        ? [data]
        : (data?.[ep.listField] ??
          (Object.values(data ?? {}).find((v) => Array.isArray(v)) as any[] | undefined) ??
          []);
    const now = new Date().toISOString();
    const rows = items.map((item, i) => {
      const baseId =
        ep.listField === null
          ? id ?? "self"
          : String(ep.idOf?.(item) ?? `${id ? id + ":" : ""}${page}-${i}`);
      return {
        connection_id: connectionId,
        endpoint_key: ep.key,
        record_key: ep.snapshot ? `${baseId}@${window.date}` : baseId,
        payload: cipher && item && typeof item === "object" ? { ...item, _cipher: cipher } : item,
        snapshot_date: window.date,
        synced_at: now,
      };
    });

    await persistDomainRows(supabase, connectionId, ep, rows, ctx);
    await persistMetricPoints(supabase, connectionId, ep, rows, ctx);
    total += rows.length;

    pageToken = data?.next_page_token || undefined;
    if (!ep.paginated || !pageToken) break;
  }
  return total;
}

export async function runSync(opts: SyncWindowOptions = {}) {
  const supabase = createAdminClient();
  const window = opts.window ?? yesterdayWindowVN();
  const deadline = Date.now() + (opts.budgetMs ?? SYNC_BUDGET_MS);

  const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
  await supabase
    .from("tts_sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "failed",
      errors: [{ error: "stale sync run closed before starting a new run" }],
    })
    .eq("status", "running")
    .lt("started_at", staleBefore);

  const { data: activeRun, error: activeRunError } = await supabase
    .from("tts_sync_runs")
    .select("id")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (activeRunError) throw activeRunError;
  if (activeRun) {
    return {
      window,
      connections: 0,
      stats: {},
      errors: [],
      skipped: true,
      reason: "sync_already_running",
    };
  }

  const { data: run, error: runError } = await supabase.from("tts_sync_runs").insert({}).select("id").single();
  if (runError) {
    // The partial unique index makes this atomic after the lock migration is applied.
    if (runError.code === "23505") {
      return {
        window,
        connections: 0,
        stats: {},
        errors: [],
        skipped: true,
        reason: "sync_already_running",
      };
    }
    throw runError;
  }

  const { data: conns, error } = await supabase
    .from("tts_connections")
    .select(
      "id, open_id, user_type, granted_scopes, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at",
    )
    .eq("status", "active");
  if (error) throw error;

  const syncConnection = async (c: Connection) => {
    const stats: Record<string, number> = {};
    const errors: { open_id: string; endpoint?: string; error: string }[] = [];
    let token: string;
    if (Date.now() >= deadline) {
      return {
        stats,
        errors: [{ open_id: c.open_id, error: "sync budget reached; waiting for next cron run" }],
      };
    }
    try {
      token = await ensureFreshToken(supabase, c);
    } catch (e: any) {
      // Refresh hỏng -> creator cần authorize lại
      await supabase
        .from("tts_connections")
        .update({ status: "reauth_required", last_error: String(e.message ?? e) })
        .eq("id", c.id);
      errors.push({ open_id: c.open_id, error: `refresh: ${e.message ?? e}` });
      return { stats, errors };
    }

    // Chưa rõ loại tài khoản -> thử gọi API partner; thành công thì đánh dấu là Partner
    if (c.user_type == null && !isPartner(c)) {
      try {
        await callApi({ method: "GET", path: "/authorization/202405/category_assets", accessToken: token });
        c.user_type = 3;
      } catch {
        c.user_type = 1;
      }
      await supabase.from("tts_connections").update({ user_type: c.user_type }).eq("id", c.id);
    }

    const endpoints = prioritizeEndpoints((isPartner(c) ? PARTNER_ENDPOINTS : ENDPOINTS)
      .filter((e) => e.enabled)
      .filter((e) => e.key !== "partner_cap_orders" || (c.granted_scopes ?? []).includes(e.scope))
      .filter((e) => e.key !== "video_performances" || (c.granted_scopes ?? []).includes(e.scope)));
    if (!isPartner(c)) await ensureCreator(supabase, c);
    const connErrors: string[] = [];
    for (const ep of endpoints) {
      if (Date.now() >= deadline) {
        connErrors.push("sync budget reached; waiting for next cron run");
        break;
      }
      try {
        let ctxs: Ctx[] = [{}];
        if (ep.forEach === "live_room") {
          ctxs = (await liveRoomIds(supabase, c.id, window)).map((id) => ({ id }));
        } else if (ep.forEach === "video") {
          ctxs = (await videoIds(supabase, c.id, window)).map((id) => ({ id }));
        } else if (ep.forEach === "category_asset") {
          ctxs = affiliatePartnerAssets(await storedPayloads(supabase, c.id, "partner_category_assets"))
            .map((a) => a?.cipher)
            .filter(Boolean)
            .map((cipher) => ({ cipher }));
        } else if (ep.forEach === "campaign") {
          // campaign đã lưu kèm cipher của category asset ở field _cipher
          ctxs = (await storedPayloads(supabase, c.id, "partner_campaigns"))
            .map((p) => ({ id: String(p?.id ?? p?.campaign_id ?? ""), cipher: p?._cipher }))
            .filter((x) => x.id);
        }
        const contextResults = await mapWithConcurrency(ctxs, CONTEXT_CONCURRENCY, async (ctx) => {
          if (Date.now() >= deadline) {
            return {
              count: 0,
              error: { open_id: c.open_id, endpoint: ep.key, error: "sync budget reached; waiting for next cron run" },
              message: `${ep.key}: sync budget reached; waiting for next cron run`,
            };
          }
          if (await checkpointIsComplete(supabase, c.id, ep.key, ctx, window.date)) {
            return { count: 0 };
          }
          try {
            const count = await syncEndpoint(supabase, c.id, token, ep, window, ctx, deadline);
            await saveCheckpoint(supabase, c.id, ep.key, ctx, window.date, "success", count);
            return { count };
          } catch (e: any) {
            const msg = e instanceof TikTokApiError ? e.message : String(e.message ?? e);
            const where = ctx.id ? `${ep.key}:${ctx.id}` : ep.key;
            await saveCheckpoint(supabase, c.id, ep.key, ctx, window.date, "failed", 0, msg);
            return { count: 0, error: { open_id: c.open_id, endpoint: where, error: msg }, message: `${where}: ${msg}` };
          }
        });
        for (const result of contextResults) {
          stats[ep.key] = (stats[ep.key] ?? 0) + result.count;
          if (result.error) {
            errors.push(result.error);
            connErrors.push(result.message!);
          }
        }
      } catch (e: any) {
        const msg = String(e.message ?? e);
        errors.push({ open_id: c.open_id, endpoint: ep.key, error: msg });
        connErrors.push(`${ep.key}: ${msg}`);
      }
    }

    await supabase
      .from("tts_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        // Ghi TẤT CẢ lỗi của lần chạy (không chỉ lỗi cuối)
        last_error: connErrors.length ? connErrors.join("\n").slice(0, 4000) : null,
      })
      .eq("id", c.id);

    return { stats, errors };
  };

  const connectionResults = await mapWithConcurrency(
    (conns ?? []) as Connection[],
    CONNECTION_CONCURRENCY,
    syncConnection,
  );
  const stats: Record<string, number> = {};
  const errors: { open_id: string; endpoint?: string; error: string }[] = [];
  for (const result of connectionResults) {
    for (const [key, count] of Object.entries(result.stats)) stats[key] = (stats[key] ?? 0) + count;
    errors.push(...result.errors);
  }

  const result = {
    window,
    connections: conns?.length ?? 0,
    stats,
    errors,
  };
  if (run) {
    await supabase
      .from("tts_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: errors.length ? "partial" : "success",
        stats: { window, connections: result.connections, ...stats },
        errors,
      })
      .eq("id", run.id);
  }
  return result;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+07:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function defaultFullSyncStartDate() {
  if (process.env.TTS_FULL_SYNC_START_DATE) return process.env.TTS_FULL_SYNC_START_DATE;
  const supabase = createAdminClient();
  const { data } = await supabase.from("tts_connections").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.created_at ? new Date(data.created_at).toISOString().slice(0, 10) : yesterdayWindowVN().date;
}

/** Processes a bounded date batch; checkpoints make repeated calls safe and resumable. */
export async function runSyncRange(opts: { from: string; to: string; maxDays?: number; budgetMs?: number }) {
  const started = Date.now();
  // Một ngày/request cho phép nhiều connection hoàn tất trước khi Render timeout.
  // Nút trên dashboard sẽ gọi tiếp ngày kế tiếp bằng nextDate.
  const maxDays = Math.max(1, Math.min(opts.maxDays ?? 1, 14));
  const results: unknown[] = [];
  let date = opts.from;
  let processed = 0;
  while (date <= opts.to && processed < maxDays && Date.now() - started < (opts.budgetMs ?? 230_000)) {
    const remaining = (opts.budgetMs ?? 230_000) - (Date.now() - started);
    const result = await runSync({
      window: dateWindowVN(date),
      budgetMs: Math.min(210_000, Math.max(10_000, remaining - 5_000)),
    });
    results.push(result);
    processed += 1;
    const hasBudgetError = result.errors.some((error) => String(error.error).includes("sync budget reached"));
    if (hasBudgetError) break;
    date = addDays(date, 1);
  }
  return { from: opts.from, to: opts.to, nextDate: date <= opts.to ? date : null, processedDays: processed, results };
}
