import { callApi, refreshToken, TikTokApiError } from "./client";
import { ENDPOINTS, PARTNER_ENDPOINTS, EndpointDef, SyncWindow } from "./endpoints";
import { createAdminClient } from "@/lib/supabase/admin";

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

/** Lấy danh sách live_room_id từ các đơn affiliate (content_type = LIVE) trong ngày */
async function liveRoomIds(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  window: SyncWindow,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("tts_raw_records")
    .select("payload")
    .eq("connection_id", connectionId)
    .eq("endpoint_key", "affiliate_orders")
    .eq("snapshot_date", window.date);
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const o: any = row.payload;
    for (const s of [o, ...(Array.isArray(o?.skus) ? o.skus : [])]) {
      if (String(s?.content_type ?? "").toUpperCase() === "LIVE" && s?.content_id) {
        ids.add(String(s.content_id));
      }
    }
  }
  return [...ids];
}

/** Đọc lại payload đã đồng bộ của 1 endpoint (dùng làm đầu vào cho endpoint phụ thuộc) */
async function storedPayloads(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  endpointKey: string,
): Promise<any[]> {
  const { data, error } = await supabase
    .from("tts_raw_records")
    .select("payload")
    .eq("connection_id", connectionId)
    .eq("endpoint_key", endpointKey);
  if (error) throw error;
  return (data ?? []).map((r) => r.payload);
}

/** Token partner (MCN/TAP) = user_type 3, hoặc có scope bắt đầu bằng "partner." */
export function isPartner(c: Pick<Connection, "user_type" | "granted_scopes">) {
  return c.user_type === 3 || (c.granted_scopes ?? []).some((s) => s.startsWith("partner."));
}

type Ctx = { id?: string; cipher?: string };

function checkpointKey(ctx: Ctx) {
  if (ctx.id && ctx.cipher) return `${ctx.id}:${ctx.cipher}`;
  if (ctx.id) return ctx.id;
  if (ctx.cipher) return `cipher:${ctx.cipher}`;
  return "root";
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
    return [{ metric_key: path, metric_value: value, dimensions }];
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
) {
  const points = rows.flatMap((row) =>
    extractMetricPoints(row.payload).map((point) => ({
      connection_id: connectionId,
      endpoint_key: ep.key,
      record_key: row.record_key,
      metric_key: point.metric_key,
      metric_value: point.metric_value,
      dimensions: point.dimensions,
      snapshot_date: row.snapshot_date,
      synced_at: new Date().toISOString(),
    })),
  );
  if (!points.length) return;
  for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
    const { error } = await supabase.from("tts_metric_points").upsert(points.slice(i, i + UPSERT_BATCH_SIZE), {
      onConflict: "connection_id,endpoint_key,record_key,metric_key",
    });
    // Cho phép deploy code trước migration; raw records vẫn phải sync bình thường.
    if (error && error.code !== "42P01") throw error;
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

    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
      const { error } = await supabase
        .from("tts_raw_records")
        .upsert(rows.slice(i, i + UPSERT_BATCH_SIZE), { onConflict: "connection_id,endpoint_key,record_key" });
      if (error) throw error;
    }
    await persistMetricPoints(supabase, connectionId, ep, rows);
    total += rows.length;

    pageToken = data?.next_page_token || undefined;
    if (!ep.paginated || !pageToken) break;
  }
  return total;
}

export async function runSync(opts: { window?: SyncWindow } = {}) {
  const supabase = createAdminClient();
  const window = opts.window ?? yesterdayWindowVN();
  const deadline = Date.now() + SYNC_BUDGET_MS;

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

    const endpoints = (isPartner(c) ? PARTNER_ENDPOINTS : ENDPOINTS).filter((e) => e.enabled);
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
