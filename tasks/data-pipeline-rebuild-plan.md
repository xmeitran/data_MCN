# Implementation Plan: TikTok Data Pipeline Rebuild

## Overview

Rebuild the data path without deleting production data. Keep `api_data` as the raw archive, define a contract per endpoint, normalize Creator/Product/LIVE into the existing `mcn_*` tables, and expose clear API coverage and business data in the frontend.

## Architecture decisions

- Preserve current `mcn_*` table names for compatibility.
- Add `source_api_data_id` and parser diagnostics to normalized rows where the schema allows it.
- Treat `api_data` as append/upsert raw evidence, never as a KPI table.
- Use one parser/contract per endpoint; no generic arbitrary-array fallback.
- Preserve TikTok amount + currency without conversion.
- Do not delete production data; old rows remain auditable and new rows are additive.
- Frontend reads typed/read-model data and shows raw JSON only on demand.

## Task list

### Phase 1: Contract and raw archive

- [ ] Task 1: Define endpoint contract types and registry for the enabled Creator/Product/LIVE APIs.
- [ ] Task 2: Extend `api_data` with response status, error details, record count and parser diagnostics using an additive migration.

### Checkpoint: Raw foundation

- [ ] Every API request produces one auditable raw record.
- [ ] Empty, missing-scope, API-error and schema-mismatch states are distinguishable.
- [ ] Existing `tts_connections` and old rows remain untouched.

### Phase 2: Normalized vertical slices

- [ ] Task 3: Creator profile + identity parser and fixture tests.
- [ ] Task 4: Affiliate/CAP order parser with explicit money/currency and content attribution.
- [ ] Task 5: Video performance parser and Creator metric read model.
- [ ] Task 6: Product parser for showcase/campaign product responses.
- [ ] Task 7: Completed LIVE session and LIVE metric parser.

### Checkpoint: Domain correctness

- [ ] No shop/seller/product/image field creates a Creator.
- [ ] Re-running the same response is idempotent.
- [ ] Every normalized row traces to `api_data.id`.
- [ ] Fixture tests cover success, empty, error and malformed response shapes.

### Phase 3: Read models and frontend

- [ ] Task 8: Build API coverage/status read model.
- [ ] Task 9: Rebuild Creator/Product/LIVE screens from typed read models.
- [ ] Task 10: Add API detail view with Vietnamese business explanation, fields, units, source and raw response.

### Checkpoint: User verification

- [ ] Non-technical user can identify what each API does and whether it returned data.
- [ ] KPI cards show only mapped business fields.
- [ ] Technical paths and JSON are secondary/collapsible.

### Phase 4: Verification and release

- [ ] Task 11: Run unit, fixture, build and browser verification.
- [ ] Task 12: Document migration/runbook and commit the rebuild in atomic changes.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| TikTok changes a response shape | Wrong or missing data | Schema mismatch status + fixture tests + raw preservation |
| Existing bad normalized rows remain | Old UI may still look wrong | Read models filter by parser version/valid source rows; no destructive reset |
| Scope unavailable | API looks empty | Store and display missing scope separately |
| Multi-currency data | Incorrect totals | Keep amount/currency pairs; aggregate only within the same currency |

## Verification commands

```bash
npm run test:normalizers
npm run test:metric
npm run build
git diff --check
```
