# Implementation Plan: MCN Network Management System

## Overview

Build the first operational release of the MCN system described in `DX — MCN.docx`: a single workspace for Creator/KOC CRM, performance reporting, campaign/deal tracking, operations/SLA and order/resource planning. TikTok raw data remains the source of truth; the `mcn_*` schema provides normalized operational views and manual workflow fields.

## Architecture decisions

- Keep the existing Next.js App Router and server-side Supabase admin client.
- Keep dashboard access-key protection; never expose `SUPABASE_SECRET_KEY`, TikTok access tokens or refresh tokens to the browser.
- Use the existing `tts_*` tables and the additive `mcn_*` migration as the data foundation.
- Ship a useful first release with server-rendered pages and URL-based filters before adding a full team-auth/RBAC layer.
- Treat contact, owner, deal terms, benefit policy, booking and workload fields as internal/manual data unless a TikTok API response supplies them.

## Task list

### Phase 1: Foundation and shell

- [ ] Task 1: Add plan and acceptance checklist.
- [ ] Task 2: Replace the raw metric page with an accessible MCN workspace shell and navigation.
- [ ] Task 3: Add server-side data contracts and aggregate queries for creators, metrics, campaigns, tasks and issues.

### Phase 2: Core vertical slices

- [ ] Task 4: Creator CRM directory and Creator profile/performance view.
- [ ] Task 5: Campaign/deal tracker with booking and matching tables.
- [ ] Task 6: Report MCN and operational workload/SLA views.

### Checkpoint: Core release

- [ ] Dashboard builds without TypeScript errors.
- [ ] Empty/error states are visible when the new Supabase tables are empty or unavailable.
- [ ] Filters are shareable through URL parameters and do not expose secrets.
- [ ] Desktop and mobile layouts remain usable.

### Phase 3: Verification and shipping

- [ ] Task 7: Run build, static checks and manual browser verification.
- [ ] Task 8: Commit and push the implementation; document Supabase/app deployment steps.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Some internal fields are not available from TikTok API | CRM/report gaps | Keep explicit manual fields and show `Chưa cập nhật` states. |
| New migration may not yet be applied in every environment | Page query failures | Query new tables defensively and render a migration notice. |
| Dashboard key is not team authentication | Unauthorized internal access | Keep access key for now; mark RBAC as the next security phase. |
| Metric names differ across API payloads | Incomplete KPI normalization | Preserve all generic metric paths and map canonical aliases with safe fallbacks. |

## Open questions deferred by the source document

- Exact formulas for NMV, contribution, growth, ROI and SoR are not defined.
- Priority 1/2/3 and the final team owner matrix are blank in the document.
- Contact/CRM ownership source and team authentication provider are not specified.
