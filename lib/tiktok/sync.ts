import { callApi, refreshToken, TikTokApiError } from "./client";
import { ENDPOINTS, EndpointDef, SyncWindow } from "./endpoints";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_PAGES = 200; // chặn vòng lặp vô hạn nếu API trả token lặp
const REFRESH_BEFORE_MS = 24 * 3600 * 1000;

type Connection = {
  id: string;
  open_id: string;
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

async function syncEndpoint(
  supabase: ReturnType<typeof createAdminClient>,
  connectionId: string,
  accessToken: string,
  ep: EndpointDef,
  window: SyncWindow,
  id?: string,
): Promise<number> {
  let pageToken: string | undefined;
  let total = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const req = ep.buildRequest({ pageToken, window, id });
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
        payload: item,
        snapshot_date: window.date,
        synced_at: now,
      };
    });

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("tts_raw_records")
        .upsert(rows.slice(i, i + 500), { onConflict: "connection_id,endpoint_key,record_key" });
      if (error) throw error;
    }
    total += rows.length;

    pageToken = data?.next_page_token || undefined;
    if (!ep.paginated || !pageToken) break;
  }
  return total;
}

export async function runSync(opts: { window?: SyncWindow } = {}) {
  const supabase = createAdminClient();
  const window = opts.window ?? yesterdayWindowVN();

  const { data: run } = await supabase.from("tts_sync_runs").insert({}).select("id").single();
  const stats: Record<string, number> = {};
  const errors: { open_id: string; endpoint?: string; error: string }[] = [];

  const { data: conns, error } = await supabase
    .from("tts_connections")
    .select("id, open_id, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at")
    .eq("status", "active");
  if (error) throw error;

  const endpoints = ENDPOINTS.filter((e) => e.enabled);

  for (const c of (conns ?? []) as Connection[]) {
    let token: string;
    try {
      token = await ensureFreshToken(supabase, c);
    } catch (e: any) {
      // Refresh hỏng -> creator cần authorize lại
      await supabase
        .from("tts_connections")
        .update({ status: "reauth_required", last_error: String(e.message ?? e) })
        .eq("id", c.id);
      errors.push({ open_id: c.open_id, error: `refresh: ${e.message ?? e}` });
      continue;
    }

    let connError: string | null = null;
    let rooms: string[] | null = null;
    for (const ep of endpoints) {
      try {
        let ids: (string | undefined)[] = [undefined];
        if (ep.forEach === "live_room") {
          rooms ??= await liveRoomIds(supabase, c.id, window);
          ids = rooms;
        }
        for (const id of ids) {
          try {
            const n = await syncEndpoint(supabase, c.id, token, ep, window, id);
            stats[ep.key] = (stats[ep.key] ?? 0) + n;
          } catch (e: any) {
            const msg = e instanceof TikTokApiError ? e.message : String(e.message ?? e);
            errors.push({ open_id: c.open_id, endpoint: id ? `${ep.key}:${id}` : ep.key, error: msg });
            connError = msg;
          }
        }
      } catch (e: any) {
        const msg = String(e.message ?? e);
        errors.push({ open_id: c.open_id, endpoint: ep.key, error: msg });
        connError = msg;
      }
    }

    await supabase
      .from("tts_connections")
      .update({ last_synced_at: new Date().toISOString(), last_error: connError })
      .eq("id", c.id);
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
