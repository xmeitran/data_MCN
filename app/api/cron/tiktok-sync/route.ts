import { NextRequest, NextResponse } from "next/server";
import { dateWindowVN, defaultFullSyncStartDate, runSync, runSyncRange, yesterdayWindowVN } from "@/lib/tiktok/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Gọi hằng ngày bằng cron (Render Cron Job / Vercel Cron / GitHub Actions):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<domain-crm>/api/cron/tiktok-sync
 * Lấy lại một ngày cụ thể (backfill): thêm ?date=2026-10-01
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const dashboardKey = process.env.DASHBOARD_KEY;
  const authorization = req.headers.get("authorization");
  const queryKey = req.nextUrl.searchParams.get("key");
  const authorized = [secret, dashboardKey].filter(Boolean).some((value) => authorization === `Bearer ${value}` || queryKey === value);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "daily";
  if (mode === "full") {
    const from = req.nextUrl.searchParams.get("from") || await defaultFullSyncStartDate();
    const to = req.nextUrl.searchParams.get("to") || yesterdayWindowVN().date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return NextResponse.json({ ok: false, error: "from/to phải dạng YYYY-MM-DD và from không được sau to" }, { status: 400 });
    }
    try {
      const result = await runSyncRange({ from, to });
      return NextResponse.json({ ok: true, mode, ...result });
    } catch (e: any) {
      console.error("[tiktok-sync-full]", e);
      return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 });
    }
  }

  const date = req.nextUrl.searchParams.get("date");
  let window;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: "date phải dạng YYYY-MM-DD" }, { status: 400 });
    }
    window = dateWindowVN(date);
  }

  try {
    const result = await runSync({ window });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[tiktok-sync]", e);
    return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
