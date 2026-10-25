# SmartFleece — Build Status

Phase 1 MVP. Last updated: 2026-10-25.

## Priority checklist (from the build prompt)

| # | Priority | Status | Verified by |
|---|----------|--------|-------------|
| 1 | Application foundation (layout, nav, design system, responsive, states) | ✅ done | manual + e2e render checks; production build |
| 2 | Customer management (CRUD, search, profile, orders/lots history, safe archive) | ✅ done | e2e steps 3 (create/validate/update); UI pages |
| 3 | Order intake & fiber profiling (multi-lot, all intake fields, validation, sample data) | ✅ done | e2e step 4; seed data marked `isSample` |
| 4 | QR generation (view/download/print, opaque code, lookup by scan) | ✅ done | e2e steps 4–5; label page |
| 5 | Production-stage tracking (configurable pipeline ≥5 stages, weights, history preserved, undo) | ✅ done | e2e steps 6 (incl. machine, 409 stale, undo); 16 default stages |
| 6 | QR scanning & worker UX (camera + manual fallback, offline queue, dedupe) | ✅ done | e2e idempotency + lookup; offline queue unit-level (real offline browser session not exercised) |
| 7 | Lot splitting, blending & lineage (DAG, forward/backward views, cycle prevention) | ✅ done | e2e steps 7–8; unit tests for cycle detection |
| 8 | Mill manager dashboard (real counts, Kanban, attention list, recent events) | ✅ done | e2e step 2; all queries hit the database |
| 9 | Customer-facing tracking (token page, safe data only) | ✅ done | e2e step 10 (valid/invalid token, hides internal data) |
| 10 | Basic notifications (interface + dev-mode log, never fake-sent) | ✅ done | e2e step 12 (ORDER_READY logged on completion) |

Deferred per plan: invoices/payments, ML ETAs, multi-tenant SaaS, RFID,
photo storage, SMTP sending, machine registry, sustainability/reports.

## Test results (actual runs)

- **Unit (`npx vitest run`): 22/22 passed** — weight-loss %, abnormal-loss
  threshold, clean yield, DAG path/cycle detection, ancestor traversal,
  customer/order/lot/stage-event/split Zod schemas (incl. empty-string →
  undefined coercion fix).
- **E2E (`node scripts/e2e.mjs`): 47/47 passed** against the dev server —
  full acceptance workflow from login through order completion, plus
  authorization (401/403/409/400 paths) and the public tracking page.
- **Type check (`npm run typecheck`): clean.**
- **Production build (`npm run build`): clean** — 33 routes.

## Database state

`prisma/dev.db` (SQLite) reset and reseeded with sample data on delivery:
2 users, 16 stages, 4 customers, 5 orders, 9 lots, 43 stage events,
4 lineage edges (cross-order blend + split), 2 quality flags, 4 notifications.
All sample rows carry `isSample = true` and render with a "sample" badge.

## Issues hit & resolutions

- Tailwind v4 cannot `@apply` custom component classes → button classes made
  self-contained.
- Zod `z.coerce.number()` turned `""` into `0` → replaced with `preprocess`
  (caught by unit test).
- e2e initially asserted wrong numbers twice: lot order assumption
  (API returns newest-first) and order status (split children were still
  active, so IN_PRODUCTION was correct). Fixed the tests, not the app.
- Reused fixed `clientEventId` across e2e runs collided with the idempotency
  guard → keys now unique per run.
- Windows: killed dev server held the Prisma engine DLL (EPERM on generate) →
  process cleanup, then regenerate.
- OneDrive transiently truncates `.next` dev manifests under compile bursts
  (500 from `loadManifest`, self-heals) → e2e retries once; documented in
  README. Production `next start` unaffected.

## Highest-priority next task

Invoice generation (Module 5): per-stage processed weights are already
persisted, so billing on actual processed weight is a straightforward next
feature. Alternatively, wiring a real email provider into `lib/notify.ts` is a
half-day task that makes the existing notification flow production-real.
