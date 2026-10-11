import assert from "node:assert/strict";
import { parseTikTokNumber, deriveAffiliateOrderMetrics } from "../lib/tiktok/metric-utils.ts";

assert.equal(parseTikTokNumber("112.000₫"), 112000);
assert.equal(parseTikTokNumber("3.360₫"), 3360);
assert.equal(parseTikTokNumber("12.5%"), 12.5);

const metrics = deriveAffiliateOrderMetrics({
  id: "order-1",
  skus: [
    {
      price: { amount: "112.000₫" },
      quantity: 2,
      content_type: "LIVE",
      estimated_commission: { amount: "3.360₫" },
    },
  ],
});

assert.deepEqual(
  metrics.map(({ metric_key, metric_value }) => ({ metric_key, metric_value })),
  [
    { metric_key: "derived.orders", metric_value: 1 },
    { metric_key: "derived.attributed_gmv", metric_value: 224000 },
    { metric_key: "derived.products_sold", metric_value: 2 },
    { metric_key: "derived.commission", metric_value: 3360 },
    { metric_key: "derived.live_gmv", metric_value: 224000 },
    { metric_key: "derived.live_orders", metric_value: 1 },
  ],
);

console.log("metric-utils: ok");
