import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/tiktok/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Redirect URL đăng ký trong Partner Center trỏ về đây:
 *   https://<domain-crm>/connect-redirect
 * Creator/seller bấm authorize -> TikTok gọi về ?code=...
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ ok: false, error: "Thiếu code" }, { status: 400 });
  }

  try {
    const t = await getToken(code);
    const supabase = createAdminClient();
    const { error } = await supabase.from("tts_connections").upsert(
      {
        open_id: t.open_id,
        user_type: t.user_type ?? null,
        display_name: t.seller_name ?? null,
        access_token: t.access_token,
        access_token_expires_at: new Date(t.access_token_expire_in * 1000).toISOString(),
        refresh_token: t.refresh_token,
        refresh_token_expires_at: new Date(t.refresh_token_expire_in * 1000).toISOString(),
        granted_scopes: t.granted_scopes ?? null,
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "open_id" },
    );
    if (error) throw error;

    const done = new URL("/connect-success", req.nextUrl.origin);
    done.searchParams.set("name", t.seller_name ?? "");
    return NextResponse.redirect(done);
  } catch (e: any) {
    console.error("[connect-redirect]", e);
    return NextResponse.json(
      { ok: false, error: "Kết nối thất bại, vui lòng thử lại link ủy quyền." },
      { status: 500 },
    );
  }
}
