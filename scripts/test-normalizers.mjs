import assert from "node:assert/strict";
import { ENDPOINTS } from "../lib/tiktok/endpoints.ts";
import { businessMetricsForEndpoint, recordsForEndpoint } from "../lib/tiktok/normalizers.ts";

const orders = ENDPOINTS.find((endpoint) => endpoint.key === "affiliate_orders");
const showcase = ENDPOINTS.find((endpoint) => endpoint.key === "showcase_products");
assert(orders && showcase);

assert.deepEqual(recordsForEndpoint(orders, { orders: [{ id: "o1" }], skus: [{ id: "sku" }] }), [{ id: "o1" }]);
assert.deepEqual(recordsForEndpoint(showcase, { products: [{ id: "p1" }], images: [{ height: 800 }] }), [{ id: "p1" }]);
assert.deepEqual(recordsForEndpoint(showcase, { wrong_array: [{ id: "not-a-product" }] }), []);

const productMetrics = businessMetricsForEndpoint("showcase_products", { id: "p1", price: { amount: 120000 }, main_images: [{ height: 800 }] });
assert.deepEqual(productMetrics, []);

const orderMetrics = businessMetricsForEndpoint("affiliate_orders", {
  id: "o1",
  skus: [{ quantity: 2, price: { amount: 100000 }, actual_commission: { amount: 5000 } }],
});
assert(orderMetrics.some((metric) => metric.metric_key === "derived.attributed_gmv" && metric.metric_value === 200000));
assert(orderMetrics.some((metric) => metric.metric_key === "derived.products_sold" && metric.metric_value === 2));

console.log("normalizers: ok");
