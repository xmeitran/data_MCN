import type { EndpointDef } from "./endpoints.ts";
import { deriveAffiliateOrderMetrics, parseTikTokNumber, type DerivedMetricPoint } from "./metric-utils.ts";

const ORDER_ENDPOINTS = new Set(["affiliate_orders", "partner_cap_orders", "partner_tap_orders"]);
const CATALOG_ENDPOINTS = new Set(["showcase_products", "partner_campaign_products", "partner_campaigns", "partner_category_assets", "sample_applications"]);

/**
 * Selects records using the response shape documented for the endpoint.
 * We intentionally do not guess an arbitrary array from the JSON: that can
 * turn SKU/image arrays into top-level business records.
 */
export function recordsForEndpoint(ep: EndpointDef, response: unknown): unknown[] {
  if (ep.listField === null) return response === undefined || response === null ? [] : [response];
  if (!response || typeof response !== "object" || Array.isArray(response)) return [];
  const value = (response as Record<string, unknown>)[ep.listField];
  return Array.isArray(value) ? value : [];
}

/**
 * The domain metric warehouse is deliberately narrower than api_data.
 * Every endpoint gets an explicit policy so catalog/product numbers do not
 * become creator KPIs by accident.
 */
export function businessMetricsForEndpoint(endpointKey: string, payload: unknown): DerivedMetricPoint[] {
  if (ORDER_ENDPOINTS.has(endpointKey)) {
    return deriveAffiliateOrderMetrics(payload);
  }
  if (CATALOG_ENDPOINTS.has(endpointKey)) return [];
  return extractPerformanceMetrics(payload);
}

const TECHNICAL_KEYS = /(?:^|_)(?:id|url|uri|avatar|image|images|thumbnail|cover|logo|width|height|x|y|index|offset|limit|page|token|code|timestamp|unix)(?:_|$)/i;
const BUSINESS_KEYS = /(?:gmv|nmv|revenue|income|order|quantity|sold|commission|rate|view|viewer|follower|like|comment|share|click|ctr|ctor|cvr|conversion|duration|hour|gpm|aov|price|amount|refund|return|sample|acceptance|cost)/i;

function extractPerformanceMetrics(value: unknown, path = "data", dimensions: Record<string, string> = {}): DerivedMetricPoint[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    const leaf = path.split(".").pop()?.replace(/\[\d+\]/g, "") ?? path;
    return BUSINESS_KEYS.test(leaf) && !TECHNICAL_KEYS.test(leaf)
      ? [{ metric_key: path, metric_value: value, dimensions }]
      : [];
  }
  if (typeof value === "string") {
    const leaf = path.split(".").pop()?.replace(/\[\d+\]/g, "") ?? path;
    const parsed = parseTikTokNumber(value);
    return parsed !== null && BUSINESS_KEYS.test(leaf) && !TECHNICAL_KEYS.test(leaf)
      ? [{ metric_key: path, metric_value: parsed, dimensions }]
      : [];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => extractPerformanceMetrics(item, `${path}[${index}]`, dimensions));
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const lower = key.toLowerCase();
    if (TECHNICAL_KEYS.test(lower) || lower === "id" || lower.endsWith("_id") || lower.endsWith("_at") || lower.endsWith("_time")) return [];
    const nextPath = path === "data" ? key : `${path}.${key}`;
    if (typeof child === "string" && ["name", "title", "type", "status"].includes(lower)) return [];
    return extractPerformanceMetrics(child, nextPath, dimensions);
  });
}

