"use client";

import { useState } from "react";

export function SyncButton({ accessKey }: { accessKey: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setBusy(true);
    setMessage("Đang đồng bộ theo từng ngày…");
    try {
      let from: string | null = null;
      let guard = 0;
      do {
        const query = new URLSearchParams({ mode: "full" });
        if (from) query.set("from", from);
        const response = await fetch(`/api/cron/tiktok-sync?${query}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessKey}` },
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Sync failed");
        from = result.nextDate;
        guard += 1;
        if (from) setMessage(`Đã xử lý ${result.processedDays} ngày, tiếp tục từ ${from}…`);
      } while (from && guard < 100);
      if (from) throw new Error("Sync chưa hoàn tất, hãy bấm lại để tiếp tục từ checkpoint");
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
