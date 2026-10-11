export type DerivedMetricPoint = {
  metric_key: string;
  metric_value: number;
  dimensions: Record<string, string>;
};

/** Converts TikTok monetary strings such as "112.000₫" into numeric VND. */
export function parseTikTokNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const text = value.trim().replace(/[^\d,.-]/g, "");
  if (!text || text === "-" || text === "." || text === ",") return null;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    const normalized = text.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
  if (separator) {
    const decimals = text.length - (separator === "." ? lastDot : lastComma) - 1;
    if (decimals === 3) {
      const parsed = Number(text.replace(separator, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number(text.replace(separator, "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function nestedNumber(value: any): number | null {
  if (value && typeof value === "object" && "amount" in value) return parseTikTokNumber(value.amount);
  return parseTikTokNumber(value);
}

/** Adds order-level KPIs that are not explicit scalar fields in TikTok's order response. */
export function deriveAffiliateOrderMetrics(order: any): DerivedMetricPoint[] {
  const skus = Array.isArray(order?.skus) ? order.skus : [];
  const metrics: DerivedMetricPoint[] = [{ metric_key: "derived.orders", metric_value: 1, dimensions: {} }];
  const totals = { gmv: 0, sold: 0, commission: 0 };
  const liveTotals = { gmv: 0, orders: 0 };
  const videoTotals = { gmv: 0, orders: 0 };

  for (const sku of skus) {
    const quantity = nestedNumber(sku?.quantity) ?? 0;
    const price = nestedNumber(sku?.price) ?? nestedNumber(sku?.product_price) ?? 0;
    const gmv = price * quantity;
    const commission = nestedNumber(sku?.actual_commission) ?? nestedNumber(sku?.estimated_commission) ?? 0;
    const contentType = String(sku?.content_type ?? "").toUpperCase();

    totals.gmv += gmv;
    totals.sold += quantity;
    totals.commission += commission;
    if (contentType === "LIVE") {
      liveTotals.gmv += gmv;
      liveTotals.orders += 1;
    }
    if (contentType === "VIDEO") {
      videoTotals.gmv += gmv;
      videoTotals.orders += 1;
    }
  }

  if (totals.gmv) metrics.push({ metric_key: "derived.attributed_gmv", metric_value: totals.gmv, dimensions: {} });
  if (totals.sold) metrics.push({ metric_key: "derived.products_sold", metric_value: totals.sold, dimensions: {} });
  if (totals.commission) metrics.push({ metric_key: "derived.commission", metric_value: totals.commission, dimensions: {} });
  if (liveTotals.gmv) metrics.push({ metric_key: "derived.live_gmv", metric_value: liveTotals.gmv, dimensions: {} });
  if (liveTotals.orders) metrics.push({ metric_key: "derived.live_orders", metric_value: liveTotals.orders, dimensions: {} });
  if (videoTotals.gmv) metrics.push({ metric_key: "derived.video_gmv", metric_value: videoTotals.gmv, dimensions: {} });
  if (videoTotals.orders) metrics.push({ metric_key: "derived.video_orders", metric_value: videoTotals.orders, dimensions: {} });

  return metrics;
}
