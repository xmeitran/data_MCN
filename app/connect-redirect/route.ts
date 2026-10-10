import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/tiktok/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Domain công khai (Render chạy nội bộ ở localhost:10000 nên không dùng req.nextUrl.origin) */
function publicOrigin(req: NextRequest) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

/**
 * Redirect URL đăng ký trong Partner Center trỏ về đây:
 *   https://<domain>/connect-redirect
 * Creator / seller / partner bấm authorize -> TikTok gọi về ?code=...
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ ok: false, error: "Thiếu code" }, { status: 400 });
  }

  try {
    const t: any = await getToken(code);
    const scopes: string[] | null = t.granted_scopes ?? null;
    const userType =
      typeof t.user_type === "number"
        ? t.user_type
        : (scopes ?? []).some((s) => s.startsWith("partner."))
          ? 3
          : null;

    const supabase = createAdminClient();
    const { error } = await supabase.from("tts_connections").upsert(
      {
        open_id: t.open_id,
        user_type: userType,
        display_name: t.seller_name || t.user_name || t.partner_name || null,
        access_token: t.access_token,
        access_token_expires_at: new Date(t.access_token_expire_in * 1000).toISOString(),
        refresh_token: t.refresh_token,
        refresh_token_expires_at: new Date(t.refresh_token_expire_in * 1000).toISOString(),
        granted_scopes: scopes,
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "open_id" },
    );
    if (error) throw error;

    const done = new URL("/connect-success", publicOrigin(req));
    done.searchParams.set("name", t.seller_name || t.user_name || "");
    return NextResponse.redirect(done);
  } catch (e: any) {
    console.error("[connect-redirect]", e);
    return NextResponse.json(
      { ok: false, error: "Kết nối thất bại, vui lòng thử lại link ủy quyền.", detail: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
