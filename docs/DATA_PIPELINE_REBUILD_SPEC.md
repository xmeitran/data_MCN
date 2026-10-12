# Spec: TikTok Creator / Product / LIVE Data Pipeline Rebuild

## Objective

Rebuild the TikTok data pipeline from the smallest reliable foundation so a non-technical MCN user can understand what data was received, what it means, and where it is used.

The system will focus on three business domains:

1. **Creator** — creator profile, identity, video performance and affiliate orders.
2. **Product** — product identity, name, shop, price, category and product-level performance when TikTok returns it.
3. **LIVE** — completed live session, live room identity, duration, viewers, GMV, orders, clicks and traffic.

`api_data` remains the immutable raw archive. Every normalized table must be traceable back to one `api_data.id` and must never invent a metric when the response does not contain it.

## Capability map

| Module | Responsibility | Depends on |
|---|---|---|
| raw-api-archive | Store one auditable TikTok response, request metadata, status and error | `tts_connections` |
| endpoint-contracts | Define the exact response shape, list path, record key and parser for each enabled API | raw-api-archive |
| creator-domain | Normalize creator identity, profile, orders and video performance | raw-api-archive, endpoint-contracts |
| product-domain | Normalize product records and product metrics without treating shop metadata as creator KPI | raw-api-archive, endpoint-contracts |
| live-domain | Normalize completed LIVE sessions and their metrics | raw-api-archive, endpoint-contracts |
| business-read-model | Provide simple KPI/read models for the frontend | creator-domain, product-domain, live-domain |
| data-explorer-ui | Explain API status, business meaning, values and source trace | raw-api-archive, business-read-model |

Build order: `raw-api-archive` → `endpoint-contracts` → `creator-domain`, `product-domain`, `live-domain` → `business-read-model` → `data-explorer-ui`.

## Non-goals for this rebuild

- Do not scrape or display every TikTok API as if it returned account data.
- Do not flatten every number in arbitrary JSON into a KPI.
- Do not infer creator identity from `shop`, `seller`, `product`, `sku`, image or price objects.
- Do not delete production data as part of implementation. Deletion/rebuild is a separate, explicitly approved operation.
- Do not expose TikTok tokens or Supabase secret keys to the browser.

## Data model

### 1. `api_data` — raw response archive

One row per API request/page/context/date. Required fields:

- `connection_id`
- `endpoint_key`, `method`, `path`
- request query/body
- raw response envelope or response `data`
- HTTP/API code and message
- `snapshot_date`, `fetched_at`
- `status`: `success`, `empty`, `error`
- `error_code`, `error_message`
- `record_count`

The unique key must prevent accidental duplicate pages while allowing different contexts, dates and pagination pages.

### 2. Endpoint contract registry

For each enabled endpoint, define in code and expose in the UI:

- English title and Vietnamese title
- business domain
- required scope and token type
- documented request path/method
- exact response list path, or `single`
- stable record key extractor
- parser/normalizer name
- supported business outputs
- known limitations and empty-data reasons

### 3. Domain tables

Every normalized row must include `source_api_data_id`.

To avoid breaking the current application, keep the existing `mcn_*` table names and improve their contracts rather than renaming them in production:

- Creator: `mcn_creators`, `mcn_creator_profiles`, `mcn_creator_metrics`
- Product: `mcn_products` and product-scoped rows in `mcn_creator_metrics` only when explicitly defined by an endpoint contract
- LIVE: `mcn_live_sessions`, `mcn_live_metrics`

The frontend labels these tables with business names; database table names remain stable for compatibility.

JSON payload can remain on the domain row for traceability, but KPI columns must be explicit and typed.

### 4. Read models

The frontend reads read models, not raw JSON:

- Creator overview by date
- Product overview by date
- Completed LIVE overview by date
- API coverage/status report
- Metric dictionary with source API and data type

## JSON processing rules

1. Parse the TikTok envelope once and preserve `code`, `message`, `request_id` and `data`.
2. Use the endpoint contract's exact list path. If it is missing, record `empty` or `schema_mismatch`; never choose the first arbitrary array.
3. Use endpoint-specific record keys. If no stable key exists, store the response as a single raw record and do not create a fake business record.
4. Normalize numbers with an explicit currency/percentage/unit rule. Money keeps TikTok's returned amount and currency; the system does not silently convert currencies.
5. Only map documented business fields to KPI columns.
6. Keep unknown fields in raw JSON and show them as “chưa được map”, not as KPI.
7. Reject shop/product objects from creator identity resolution unless the field is explicitly in a creator context.
8. Deduplicate at the domain level with a documented conflict key; raw API responses are not silently deleted.
9. Store parser diagnostics: `records_seen`, `records_written`, `fields_mapped`, `fields_unmapped`, `duplicates_skipped`, `warnings`.

## Frontend behavior

The primary UI must be understandable without technical knowledge.

For each API, show:

- “API này dùng để làm gì?”
- domain: Creator / Product / LIVE
- status: Lấy được data / Không có data / Lỗi / Thiếu quyền / Sai cấu trúc response
- number of records received and date range
- business fields available, with Vietnamese labels and units
- which KPI/report uses each field
- source trace button to the raw `api_data` response

Technical details are secondary and collapsed:

- method/path
- scope
- raw field path
- response JSON
- TikTok documentation link

## Commands

```bash
npm run dev
npm run build
npm run test:metric
npm run test:normalizers
npm run scrape:api-docs
```

Database migrations will be applied through Supabase SQL Editor or the project's migration workflow after review. Production reset is not part of the code build.

## Testing strategy

- Unit tests for envelope parsing, list-path extraction, record keys, numeric conversion and each endpoint parser.
- Fixture tests using representative Creator, Product, Orders and LIVE responses.
- Invariant tests:
  - no `shop`, `seller`, `product`, image or SKU field becomes creator identity;
  - malformed/missing list path never creates records from an unrelated array;
  - every normalized row has `source_api_data_id`;
  - raw response remains unchanged;
  - duplicate domain keys are idempotent.
- Build/type check after each vertical slice.
- Browser verification for the API coverage page and Creator/Product/LIVE pages with empty, success and error fixtures.

## Boundaries

- **Always:** preserve raw JSON, record parser diagnostics, use typed domain fields, test every parser, keep secrets server-side.
- **Ask first:** production deletion, changing existing Supabase tables, enabling a new TikTok scope/API, changing the meaning of an existing KPI.
- **Never:** silently flatten unknown numbers into KPIs, silently select arbitrary arrays, commit secrets, or claim an API returned data without an observed successful response.

## Success criteria

- A user can see exactly which APIs returned data and which did not.
- Creator, Product and LIVE data are separated and do not cross-contaminate.
- Every displayed KPI has a Vietnamese label, unit, source API and traceable raw response.
- The same response can be synced twice without creating duplicate domain rows.
- An API schema change is visible as a parser warning, not silently misclassified data.
- The frontend can display available data without requiring the user to inspect Supabase.

## Open questions

1. Should the rebuild preserve the existing `mcn_*` table names, or may we introduce the clearer domain table names above and migrate the UI in one cutover?
2. **Resolved:** the UI must show `empty`, `missing_scope`, TikTok API error and `schema_mismatch` separately.
3. **Resolved:** preserve the amount and currency returned by TikTok; no automatic conversion.
4. **Resolved:** no production reset. The rebuild must be additive and safe to run alongside existing data.
