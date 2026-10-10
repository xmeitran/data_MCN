# TikTok Shop API — danh mục liên quan creator / MCN
Tra từ TikTok Shop API Reference ngày 10/10/2026. Cột "Sync" = đã đưa vào job đồng bộ hằng ngày.
Token: **C** = creator (user_type 1), **S** = seller (cần shop_cipher).

## Affiliate creator (token C)
| Sync | Method | Path | Scope | Tham số chính |
|---|---|---|---|---|
| ✅ | GET | /affiliate_creator/202508/profiles | creator.affiliate.info | — |
| ✅ | GET | /affiliate_creator/202405/showcases/products | creator.showcase.read | page_size*, page_token, origin* (SHOWCASE/LIVE) |
| ✅ | POST | /affiliate_creator/202410/orders/search | creator.affiliate_collaboration.read | q: page_size*, page_token · b: create_time_ge, create_time_lt |
| ✅ | POST | /affiliate_creator/202505/orders/trace/search | creator.affiliate.share_link.read | q: page_size*, page_token · b: time_ge*, time_lt*, time_type |
| ✅ | POST | /affiliate_creator/202412/sample_applications/search | creator.affiliate_collaboration.read | q: page_size (≤50), page_token · b: application_statuses |
| ✅ | POST | /affiliate_creator/202409/sample_applications/fulfillments/search | creator.affiliate_collaboration.read | b: fulfillment_statuses* |
|  | POST | /affiliate_creator/202412/sample_applications/single_query | creator.affiliate_collaboration.read | b: product_id*, application_type*, application_id |
|  | GET | /affiliate_creator/202412/samples/labels | creator.affiliate_collaboration.read | product_id* |
|  | POST | /affiliate_creator/202405/open_collaborations/products/search | creator.affiliate_collaboration.read | q: page_size* · b: title_keywords, category, commission_rate_range… |
|  | POST | /affiliate_creator/202509/open_collaborations/products | creator.affiliate_collaboration.read | product_ids |
|  | POST | /affiliate_creator/202405/target_collaborations/search | creator.affiliate_collaboration.read | q: page_size* · b: shop_id* |
|  | GET | /affiliate_creator/202606/toko_product_mappers | creator.affiliate_collaboration.read | — |
|  | POST | /affiliate_creator/202505/affiliate_sharing_links/general_publishers/generate_batch | creator.affiliate.share_link.read | tạo link |
|  | POST | /affiliate_creator/202504/affiliate_sharing_links/publisher/{publisher_id}/generate_batch | creator.affiliate.share_link.read | tạo link |
|  | POST | /affiliate_creator/202607/map_toko_product | creator.affiliate.share_link.read | — |
|  | POST | /affiliate_creator/202405/showcases/products/add | creator.showcase.write | ghi |
|  | POST | /affiliate_creator/202409/showcases/products/top | creator.showcase.write | ghi |
|  | DEL | Remove Showcase Products (202409) | creator.showcase.write | ghi |
|  | GET | /affiliate_creator/202509/shop_products | creator.video.write ⚠️ app chưa có | — |
|  | * | videos / photos / precheck (202505–202607) | creator.video.write ⚠️ app chưa có | đăng video/ảnh |

## LIVE của creator (token C, scope creator.data.live.read.public) — cần live_room_id
Job lấy live_room_id từ đơn affiliate có `content_type = LIVE` (`content_id`).
| Sync | Path |
|---|---|
| ✅ | GET /analytics/202502/live_rooms/{live_room_id}/core_stats |
| ✅ | GET …/gmv_trend_performances |
| ✅ | GET …/view_trend_performances |
| ✅ | GET …/interactive_trend_performances |
| ✅ | GET …/traffic_performances |
| ✅ | GET …/product_stats |
| ✅ | GET …/user_portraits |

## Analytics phía shop (token S) — app CHƯA có scope
`data.shop_analytics.public.read`: shop performance (theo giờ/ngày), LIVE/video/product/SKU performance, SPS metrics.
`data.bestselling.public.read`: top 100 sản phẩm / creator / video / phiên LIVE bán chạy.
`/analytics/202403/videos/performances`: chỉ creator Mỹ.

## Chưa có tài liệu công khai
Get Live Room Info, Get Live Account Info (Legacy), Check Anchor Content/Prerequisites — xem trong
Partner Center (đăng nhập) → Manage scope → mở từng API → "API Doc".
