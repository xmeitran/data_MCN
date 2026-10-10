import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/tiktok/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Gọi hằng ngày bằng cron (Render Cron Job / Vercel Cron / GitHub Actions):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain-crm>/api/cron/tiktok-sync
 * Lấy lại một ngày cụ thể (backfill): thêm ?date=2026-10-01
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date");
  let window;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: "date phải dạng YYYY-MM-DD" }, { status: 400 });
    }
    const startUnix = Math.floor(Date.parse(`${date}T00:00:00+07:00`) / 1000);
    window = { startUnix, endUnix: startUnix + 86400, date };
  }

  try {
    const result = await runSync({ window });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[tiktok-sync]", e);
    return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 });
  }
}
