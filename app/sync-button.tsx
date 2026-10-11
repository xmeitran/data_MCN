"use client";

import { useState } from "react";

export function SyncButton({ accessKey, from, to }: { accessKey: string; from?: string; to?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setBusy(true);
    setMessage("Đang đồng bộ theo từng ngày…");
    try {
      let nextDate: string | null = from || null;
      const endDate = to || undefined;
      let guard = 0;
      do {
        const query = new URLSearchParams({ mode: "full" });
        if (nextDate) query.set("from", nextDate);
        if (endDate) query.set("to", endDate);
        const response = await fetch(`/api/cron/tiktok-sync?${query}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessKey}` },
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Sync failed");
        nextDate = result.nextDate;
        guard += 1;
        if (nextDate) setMessage(`Đã xử lý ${result.processedDays} ngày, tiếp tục từ ${nextDate}…`);
      } while (nextDate && guard < 100);
      if (nextDate) throw new Error("Sync chưa hoàn tất, hãy bấm lại để tiếp tục từ checkpoint");
      setMessage("Đồng bộ hoàn tất. Đang tải lại dữ liệu…");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="sync-control">
      <button className="btn primary" type="button" onClick={sync} disabled={busy}>
        {busy ? "Đang đồng bộ…" : "Đồng bộ dữ liệu"}
      </button>
      {message && <small role="status">{message}</small>}
    </span>
  );
}
