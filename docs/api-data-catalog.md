# TikTok API data catalog

Source: [TikTok Shop Partner API Reference](https://partner.tiktokshop.com/docv2/page/get-video-performances-202403).

`api_data` stores the complete JSON `data` object returned by each successful
request. `tts_raw_records` stores item-level records and `tts_metric_points`
stores numeric business fields for aggregation. A metric is considered
available only when it appears in `tts_metric_points`; an API can be enabled
but have zero rows because the account has no data or the scope is missing.

## APIs currently wired into the sync

| Endpoint key | API path | Required scope | Data saved |
|---|---|---|---|
| `creator_profile` | `GET /affiliate_creator/202508/profiles` | `creator.affiliate.info` | creator profile, handle, region and profile attributes |
| `affiliate_orders` | `POST /affiliate_creator/202410/orders/search` | `creator.affiliate_collaboration.read` | orders, products/SKUs, quantity, prices, commission, content type/id |
| `video_performances` | `GET /analytics/202403/videos/performances` | `creator.video.write` | video e-commerce metrics when the creator is eligible and a real video ID is present |
| `showcase_products` | `GET /affiliate_creator/202405/showcases/products` | `creator.showcase.read` | showcase products, shop, price and commission fields |
| `sample_applications` | `POST /affiliate_creator/202412/sample_applications/search` | `creator.affiliate_collaboration.read` | sample/collaboration application status and product fields |
| `live_core_stats` | `GET /analytics/202502/live_rooms/{live_room_id}/core_stats` | `creator.data.live.read.public` | live room core metrics |
| `live_gmv_trend` | `GET /analytics/202502/live_rooms/{live_room_id}/gmv_trend_performances` | `creator.data.live.read.public` | live GMV/order trend |
| `live_view_trend` | `GET /analytics/202502/live_rooms/{live_room_id}/view_trend_performances` | `creator.data.live.read.public` | live views/view trend |
| `live_interactive_trend` | `GET /analytics/202502/live_rooms/{live_room_id}/interactive_trend_performances` | `creator.data.live.read.public` | likes, comments, shares and interaction trend |
| `live_traffic` | `GET /analytics/202502/live_rooms/{live_room_id}/traffic_performances` | `creator.data.live.read.public` | live traffic/source metrics |
| `live_product_stats` | `GET /analytics/202502/live_rooms/{live_room_id}/product_stats` | `creator.data.live.read.public` | products shown/sold and product-level live stats |
| `live_user_portraits` | `GET /analytics/202502/live_rooms/{live_room_id}/user_portraits` | `creator.data.live.read.public` | audience portrait metrics |
| `partner_category_assets` | `GET /authorization/202405/category_assets` | `partner.authorization.info` | authorized partner category assets/ciphers |
| `partner_cap_orders` | `POST /affiliate_partner/202405/cap/orders/search` | `partner.cap_orders.read` | CAP orders across managed creators |
| `partner_campaigns` | `GET /affiliate_partner/202405/campaigns` | `partner.tap_campaign.read` | campaigns |
| `partner_campaign_products` | `GET /affiliate_partner/202405/campaigns/{campaign_id}/products` | `partner.tap_campaign.read` | campaign products |
| `partner_campaign_performance` | `GET /affiliate_partner/202501/campaigns/{campaign_id}/products/performance` | `partner.tap_campaign.read` | creator/product campaign performance |

## Documented but not blindly enabled

`GET /analytics/202403/videos/performances` is enabled conditionally. TikTok
documents it as US-creator-only, requiring `creator.video.write`, with
comma-separated `video_ids` (maximum 100 per request) and a one-day data delay.
The sync only derives IDs from real affiliate-order payloads and skips creators
without the required scope; it never fabricates requests for ineligible
accounts. Successful responses are archived in `api_data` automatically.

## Metric families currently observed

The normalized inventory is generated from real rows, not from a hard-coded
list. Typical fields observed in the current data are order count, quantity /
items sold, product price, commission rate, commission bonus rate, creator
commission reward rate, shop ads commission rate, standard commission rate,
attributed GMV and commission-derived values. Live/video metrics appear in the
inventory only after the corresponding TikTok API returns data for a valid
room/video and scope.
