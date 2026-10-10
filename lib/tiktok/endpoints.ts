/**
 * Danh sách API đồng bộ — tra từ TikTok Shop API Reference (10/2026).
 * Chỉ gồm API ĐỌC dữ liệu, dùng token CREATOR (user_type = 1) và nằm trong
 * scope app "Upbase affiliate" đã được cấp.
 *
 * Thêm API mới = thêm 1 phần tử, không cần sửa code sync.
 */
export type SyncWindow = { startUnix: number; endUnix: number; date: string };

export type EndpointDef = {
  key: string;
  scope: string;
  enabled: boolean;
  method: "GET" | "POST";
  path: string;
  /** Field chứa mảng bản ghi trong `data`. null = cả `data` là 1 bản ghi */
  listField: string | null;
  /** Hàm lấy khóa duy nhất của 1 bản ghi */
  idOf?: (item: any) => string | undefined;
  /** true = lưu theo ngày (giữ lịch sử); false = ghi đè bản mới nhất */
  snapshot: boolean;
  paginated: boolean;
  /**
   * Endpoint phụ thuộc: chạy 1 lần cho mỗi ID lấy từ dữ liệu đã đồng bộ
   * trước đó (vd: mỗi phiên LIVE lấy từ đơn affiliate).
   */
  forEach?: "live_room";
  buildRequest: (ctx: { pageToken?: string; window: SyncWindow; id?: string }) => {
    path?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  };
};

const PAGE = 50;

export const ENDPOINTS: EndpointDef[] = [
  // ---------- Hồ sơ ----------
  {
    key: "creator_profile",
    scope: "creator.affiliate.info",
    enabled: true,
    method: "GET",
    path: "/affiliate_creator/202508/profiles",
    listField: null,
    snapshot: true,
    paginated: false,
    buildRequest: () => ({}),
  },

  // ---------- Đơn hàng & hoa hồng ----------
  {
    // Toàn bộ đơn affiliate của creator, kèm hoa hồng ước tính/thực nhận,
    // content_type (LIVE/VIDEO/...) và content_id
    key: "affiliate_orders",
    scope: "creator.affiliate_collaboration.read",
    enabled: true,
    method: "POST",
    path: "/affiliate_creator/202410/orders/search",
    listField: "orders",
    idOf: (o) => o?.id,
    snapshot: false,
    paginated: true,
    buildRequest: ({ pageToken, window }) => ({
      query: { page_size: PAGE, page_token: pageToken },
      body: { create_time_ge: window.startUnix, create_time_lt: window.endUnix },
    }),
  },
  {
    // Chỉ đơn đi qua link do app tạo (order_id + product_id)
    key: "affiliate_trace_orders",
    scope: "creator.affiliate.share_link.read",
    enabled: true,
    method: "POST",
    path: "/affiliate_creator/202505/orders/trace/search",
    listField: "orders",
    idOf: (o) => o?.order_id ?? o?.id,
    snapshot: false,
    paginated: true,
    buildRequest: ({ pageToken, window }) => ({
      query: { page_size: PAGE, page_token: pageToken },
      body: { time_ge: window.startUnix, time_lt: window.endUnix, time_type: "PAY_TIME" },
    }),
  },

  // ---------- Showcase ----------
  {
    key: "showcase_products",
    scope: "creator.showcase.read",
    enabled: true,
    method: "GET",
    path: "/affiliate_creator/202405/showcases/products",
    listField: "products",
    idOf: (p) => p?.id ?? p?.product_id,
    snapshot: false,
    paginated: true,
    buildRequest: ({ pageToken }) => ({
      query: { page_size: PAGE, page_token: pageToken, origin: "SHOWCASE" },
    }),
  },

  // ---------- Hợp tác & mẫu thử ----------
  {
    key: "sample_applications",
    scope: "creator.affiliate_collaboration.read",
    enabled: true,
    method: "POST",
    path: "/affiliate_creator/202412/sample_applications/search",
    listField: "sample_applications",
    idOf: (a) => a?.id ?? a?.application_id,
    snapshot: false,
    paginated: true,
    buildRequest: ({ pageToken }) => ({
      query: { page_size: PAGE, page_token: pageToken },
      body: {},
    }),
  },
  {
    key: "sample_fulfillments",
    scope: "creator.affiliate_collaboration.read",
    enabled: true,
    method: "POST",
    path: "/affiliate_creator/202409/sample_applications/fulfillments/search",
    listField: "fulfillments",
    idOf: (f) => f?.id ?? f?.sample_application_id,
    snapshot: false,
    paginated: false,
    buildRequest: () => ({
      body: {
        fulfillment_statuses: ["PENDING", "ONGOING", "SUCCEED", "FAILED", "OVERDUE", "SUSPEND"],
      },
    }),
  },

  // ---------- LIVE (mỗi phiên lấy từ đơn affiliate có content_type = LIVE) ----------
  ...(
    [
      ["live_core_stats", "core_stats", null],
      ["live_gmv_trend", "gmv_trend_performances", null],
      ["live_view_trend", "view_trend_performances", null],
      ["live_interactive_trend", "interactive_trend_performances", null],
      ["live_traffic", "traffic_performances", null],
      ["live_product_stats", "product_stats", null],
      ["live_user_portraits", "user_portraits", null],
    ] as const
  ).map(
    ([key, suffix]): EndpointDef => ({
      key,
      scope: "creator.data.live.read.public",
      enabled: true,
      method: "GET",
      path: `/analytics/202502/live_rooms/{live_room_id}/${suffix}`,
      listField: null, // lưu nguyên `data` của từng phiên
      snapshot: false,
      paginated: false,
      forEach: "live_room",
      buildRequest: ({ id }) => ({
        path: `/analytics/202502/live_rooms/${encodeURIComponent(id ?? "")}/${suffix}`,
      }),
    }),
  ),
];

/*
 * API có trong scope nhưng KHÔNG đồng bộ tự động:
 * - Tạo link / thêm-bớt-ghim showcase / đăng video (là thao tác ghi, không phải lấy data)
 * - creator-search-open-collaboration-product, target_collaborations/search (cần từ khóa / shop_id)
 * - /analytics/... "shop_*", "bestselling" (cần token SELLER + scope data.shop_analytics / data.bestselling)
 * - /analytics/202403/videos/performances (chỉ creator Mỹ + cần scope creator.video.write)
 * - Get Live Room Info / Live Account Info: không có tài liệu công khai, cần mở trong
 *   Partner Center (đăng nhập) rồi bổ sung.
 */
