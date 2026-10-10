# MCN Platform — Capability Map

## Objective

Xây dựng một hệ thống vận hành MCN có một nguồn dữ liệu tập trung, giúp team quản lý Creator, đo hiệu suất, quản lý campaign/deal và theo dõi execution thay cho Google Sheet/Excel và Zalo rời rạc.

## Capability map

| Module id | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `data-foundation` | Đồng bộ TikTok Partner API, lưu raw response, chuẩn hóa metric, snapshot theo ngày, provenance và trạng thái sync | — |
| `creator-identity` | Hồ sơ Creator/KOC, MCN status, onboarding, tags, contact, nguồn dữ liệu và directory tìm kiếm | `data-foundation` |
| `performance-reporting` | Report GMV/NMV, orders, live/video views, live hours, CTR, CVR, AOV, contribution, growth và SoR theo Creator/campaign/thời gian | `data-foundation`, `creator-identity` |
| `campaign-deal` | Campaign, deal Affiliate/Livestream/Video, booking, commission, voucher, target và matching Brand ↔ Creator | `creator-identity` |
| `operations-sla` | Task execution, owner, status, due date, SLA, nghiệm thu, issue và lịch sử xử lý | `creator-identity`, `campaign-deal` |
| `access-security` | Bảo vệ dữ liệu MCN, phân quyền team, audit access và tách dashboard access khỏi cron secret | `data-foundation` |

## Build order

`data-foundation` → `creator-identity` → `performance-reporting` → `campaign-deal` → `operations-sla` → `access-security`

## First release target

Release đầu tiên nên hoàn thành ba lát có giá trị trực tiếp:

1. `creator-identity`: Creator directory và creator profile từ dữ liệu authorize/API hiện có.
2. `performance-reporting`: Report theo Creator và khoảng thời gian, có KPI cards, bảng metric và export-ready data.
3. `campaign-deal`: Khung campaign/deal để team nhập và theo dõi thủ công trong lúc API campaign chưa đủ dữ liệu nghiệp vụ.

## Scope explicitly not assumed yet

- Chưa coi dữ liệu TikTok API là đủ cho contact, owner, booking hoặc ghi chú nội bộ; các trường này cần nguồn nhập tay/import.
- Chưa tự suy ra định nghĩa GMV/NMV, contribution, growth và SoR khi tài liệu chưa nêu công thức.
- Chưa tự chọn mức ưu tiên High/Medium/Low vì file DX để trống các checkbox ưu tiên.
- Chưa mở dashboard công khai; dữ liệu Creator/Partner vẫn phải có access control.

## Approval gate

Trước khi viết schema và UI cho từng module, cần xác nhận capability map và build order này. Sau khi được duyệt, mỗi module sẽ có spec, task list và checkpoint riêng.
