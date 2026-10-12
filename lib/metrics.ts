const TECHNICAL_SEGMENTS = /(?:^|[.[])(?:id|url|uri|avatar|image|images|main_images|thumbnail|cover|logo|width|height|x|y|index|offset|limit|page_size)(?:$|[.\]])/i;
const BUSINESS_LEAF = /(?:gmv|nmv|revenue|income|order|quantity|sold|commission|rate|view|viewer|follower|like|comment|share|click|ctr|ctor|cvr|conversion|duration|hour|gpm|aov|price|amount|refund|return|sample|acceptance|cost)/i;

/**
 * Endpoints that describe creator performance. Product/showcase payloads are
 * intentionally excluded: they may contain seller/shop and product numbers,
 * but those are inventory metadata rather than creator KPIs.
 */
export const CREATOR_PERFORMANCE_ENDPOINTS = new Set([
  "creator_profile",
  "affiliate_orders",
  "video_performances",
  "live_core_stats",
  "live_gmv_trend",
  "live_view_trend",
  "live_interactive_trend",
  "live_traffic",
  "live_product_stats",
  "live_user_portraits",
  "sample_applications",
]);

export function isCreatorPerformanceEndpoint(endpointKey: string) {
  return CREATOR_PERFORMANCE_ENDPOINTS.has(endpointKey);
}

const ALIASES: Array<[RegExp, string]> = [
  [/live.*gmv|gmv.*live/, "live_gmv"],
  [/video.*gmv|gmv.*video/, "video_gmv"],
  [/attributed.*gmv|affiliate.*gmv/, "attributed_gmv"],
  [/direct.*gmv/, "direct_gmv"],
  [/live.*order|order.*live/, "live_orders"],
  [/video.*order|order.*video/, "video_orders"],
  [/attributed.*order|affiliate.*order/, "attributed_orders"],
  [/direct.*order/, "direct_orders"],
  [/follower|fans/, "followers"],
  [/average.*view|avg.*view/, "avg_views"],
  [/view|viewer/, "views"],
  [/quantity|items?.*sold|products?.*sold/, "products_sold"],
  [/commission.*rate|rate.*commission/, "commission_rate"],
  [/commission/, "commission"],
  [/click/, "product_clicks"],
  [/engagement.*rate/, "engagement_rate"],
  [/conversion.*rate|cvr/, "cvr"],
  [/ctor/, "ctor"],
  [/ctr/, "ctr"],
  [/comment/, "comments"],
  [/like/, "likes"],
  [/share/, "shares"],
  [/duration|hour/, "live_duration"],
  [/gpm/, "gpm"],
  [/aov|average.*order.*value/, "aov"],
  [/refund/, "refunded_quantity"],
  [/return/, "returned_quantity"],
  [/price.*amount|amount.*price/, "product_price"],
];

export function isBusinessMetricPath(path: string) {
  if (TECHNICAL_SEGMENTS.test(path)) return false;
  return BUSINESS_LEAF.test(path.split(".").pop()?.replace(/\[\d+\]/g, "") ?? path);
}

export function canonicalMetricKey(path: string) {
  const normalized = path.toLowerCase().replace(/\[\d+\]/g, "").replaceAll(".", "_");
  return ALIASES.find(([pattern]) => pattern.test(normalized))?.[1] ||
    (path.split(".").pop()?.replace(/\[\d+\]/g, "") || path).toLowerCase();
}

export function metricLabel(key: string) {
  const labels: Record<string, string> = {
    attributed_gmv: "Attributed GMV",
    direct_gmv: "Direct GMV",
    live_gmv: "LIVE GMV",
    video_gmv: "Video GMV",
    attributed_orders: "Attributed orders",
    direct_orders: "Direct orders",
    live_orders: "LIVE orders",
    video_orders: "Video orders",
    followers: "Followers",
    avg_views: "Average views",
    views: "Views",
    products_sold: "Products sold",
    commission_rate: "Commission rate",
    commission: "Commission",
    product_clicks: "Product clicks",
    engagement_rate: "Engagement rate",
    cvr: "Conversion rate",
    ctr: "CTR",
    ctor: "CTOR",
    comments: "Comments",
    likes: "Likes",
    shares: "Shares",
    live_duration: "Live duration",
    gpm: "GPM",
    aov: "AOV",
    refunded_quantity: "Refunded quantity",
    returned_quantity: "Returned quantity",
    product_price: "Product price",
  };
  return labels[key] || key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function metricDomain(key: string) {
  if (key.includes("gmv") || key.includes("order") || key.includes("commission") || key.includes("aov")) return "sales";
  if (key.includes("live") || ["viewers", "gpm", "likes", "comments", "shares"].includes(key)) return "live";
  if (key.includes("view") || key.includes("click") || ["ctr", "ctor", "cvr", "engagement_rate"].includes(key)) return "traffic";
  if (key.includes("price") || key.includes("sold") || key.includes("quantity")) return "product";
  return "other";
}
