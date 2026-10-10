# TikTok Shop → Supabase (CRM MCN)

Chép các thư mục `app/`, `lib/`, `supabase/` vào project Next.js của CRM (giữ alias `@/`).

## Cài đặt (1 lần)
1. **Đổi App secret** trong Partner Center (secret cũ đã bị lộ qua ảnh chụp).
2. Supabase → SQL Editor → chạy `supabase/migrations/20261010_tiktok_shop.sql`.
3. Thêm biến môi trường theo `.env.example` (trên Render: Environment).
   `SUPABASE_SECRET_KEY` chỉ để ở server, không có tiền tố `NEXT_PUBLIC_`.
   Đặt `PUBLIC_BASE_URL=https://data-mcn.onrender.com` để callback OAuth không quay về localhost.
4. `npm install @supabase/supabase-js` (đã có).
5. Partner Center → app *Upbase affiliate* → **Redirect URL** = `https://<domain-crm>/connect-redirect`.

## Kết nối creator
Authorization → chọn **Creator** → *Copy authorization link* → gửi creator.
Creator bấm đồng ý → token tự lưu vào bảng `tts_connections`.

## Đồng bộ hằng ngày
Render → New → **Cron Job**, lịch `0 0 * * *` (07:00 giờ VN):
```
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domain-crm>/api/cron/tiktok-sync
```
Lấy lại ngày cũ: thêm `?date=2026-10-01`.

Sync chạy song song có giới hạn: tối đa 4 connection và 6 LIVE/campaign context
đồng thời. Có thể giảm hai giá trị này bằng `TTS_SYNC_CONNECTION_CONCURRENCY` và
`TTS_SYNC_CONTEXT_CONCURRENCY` nếu Partner Center trả lỗi rate limit. Chạy migration
`supabase/migrations/20261012_sync_lock.sql` để chặn hai cron chạy cùng lúc.
Migration `supabase/migrations/20261013_sync_checkpoints.sql` lưu trạng thái từng
endpoint/context theo ngày, giúp chạy lại tiếp phần lỗi thay vì gọi lại phần đã xong.

## Bật thêm API
Mở `lib/tiktok/endpoints.ts`. Các mục `enabled: false` cần điền path thật từ
Partner Center → Development Kits → API Documents rồi đổi thành `true`.
Không cần sửa code đồng bộ.

## Dữ liệu nằm ở đâu
| Bảng | Nội dung |
|---|---|
| `tts_connections` | Creator đã kết nối, token, trạng thái (`reauth_required` = cần gửi lại link) |
| `tts_raw_records` | Toàn bộ response, lưu JSON nguyên vẹn; lọc theo `endpoint_key` |
| `tts_sync_runs` | Lịch sử mỗi lần chạy, số bản ghi, lỗi |
| view `tts_creator_profiles` | Hồ sơ creator theo ngày |

Truy vấn ví dụ: `select payload->>'nickname' from tts_creator_profiles where snapshot_date = current_date - 1;`
(tên field thật xem trong `payload` sau lần chạy đầu tiên).
