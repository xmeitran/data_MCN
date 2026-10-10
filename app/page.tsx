import { createAdminClient } from "@/lib/supabase/admin";
import { ENDPOINTS } from "@/lib/tiktok/endpoints";

export const dynamic = "force-dynamic";

function Env({ name }: { name: string }) {
  const ok = Boolean(process.env[name]);
  return (
    <li>
      {ok ? "✅" : "❌"} <code>{name}</code>
    </li>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  // Trang này hiện tên creator và lỗi đồng bộ -> khóa bằng ?key=DASHBOARD_KEY
  const { key } = await searchParams;
  const expected = process.env.DASHBOARD_KEY || process.env.CRON_SECRET;
  if (!expected || key !== expected) {
    return (
      <main style={{ maxWidth: 480, margin: "80px auto", padding: 16, textAlign: "center" }}>
        <h1 style={{ fontSize: 20 }}>TikTok Shop Sync</h1>
        <p>Dịch vụ đang chạy.</p>
      </main>
    );
  }

  let conns: any[] = [];
  let runs: any[] = [];
  let dbError: string | null = null;
  try {
    const supabase = createAdminClient();
    const c = await supabase
      .from("tts_connections")
      .select("open_id, display_name, user_type, status, last_synced_at, last_error, access_token_expires_at")
      .order("created_at", { ascending: false });
    if (c.error) throw c.error;
    conns = c.data ?? [];
    const r = await supabase
      .from("tts_sync_runs")
      .select("id, started_at, finished_at, status, stats, errors")
      .order("id", { ascending: false })
      .limit(10);
    if (r.error) throw r.error;
    runs = r.data ?? [];
  } catch (e: any) {
    dbError = e?.message ?? String(e);
  }

  const cell = { padding: "6px 10px", borderBottom: "1px solid #e5e5e5", textAlign: "left" as const, verticalAlign: "top" as const };

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
      <h1>TikTok Shop → Supabase</h1>

      <h2>1. Cấu hình</h2>
      <ul>
        <Env name="NEXT_PUBLIC_SUPABASE_URL" />
        <Env name="SUPABASE_SECRET_KEY" />
        <Env name="TTS_APP_KEY" />
        <Env name="TTS_APP_SECRET" />
        <Env name="CRON_SECRET" />
      </ul>
      {dbError && (
        <p style={{ color: "#b00020" }}>
          Supabase lỗi: {dbError}. Kiểm tra key và đã chạy file SQL trong <code>supabase/migrations</code> chưa.
        </p>
      )}

      <h2>2. API đang đồng bộ</h2>
      <ul>
        {ENDPOINTS.map((e) => (
          <li key={e.key}>
            {e.enabled ? "🟢" : "⚪"} <b>{e.key}</b> — <code>{e.scope}</code> {e.enabled ? "" : "(chưa điền path)"}
          </li>
        ))}
      </ul>

      <h2>3. Tài khoản đã kết nối ({conns.length})</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={cell}>Tên</th><th style={cell}>Loại</th><th style={cell}>Trạng thái</th>
              <th style={cell}>Đồng bộ gần nhất</th><th style={cell}>Lỗi</th>
            </tr>
          </thead>
          <tbody>
            {conns.map((c) => (
              <tr key={c.open_id}>
                <td style={cell}>{c.display_name ?? c.open_id}</td>
                <td style={cell}>{c.user_type === 1 ? "Creator" : c.user_type === 0 ? "Seller" : "?"}</td>
                <td style={cell}>{c.status}</td>
                <td style={cell}>{c.last_synced_at ? new Date(c.last_synced_at).toLocaleString("vi-VN") : "—"}</td>
                <td style={cell}>{c.last_error ?? ""}</td>
              </tr>
            ))}
            {conns.length === 0 && (
              <tr><td style={cell} colSpan={5}>Chưa có. Gửi link authorize (chọn Creator) cho creator.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>4. Lịch sử đồng bộ</h2>
      <p>
        Chạy thử: <code>curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://data-mcn.onrender.com/api/cron/tiktok-sync</code>
      </p>
      <pre style={{ background: "#f5f5f5", padding: 12, overflowX: "auto", fontSize: 12 }}>
        {runs.length ? JSON.stringify(runs, null, 2) : "Chưa có lần chạy nào."}
      </pre>
    </main>
  );
}
