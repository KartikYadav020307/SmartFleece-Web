# SmartFleece — Build Status

Phase 1 MVP + Phase 2a (Invoicing) + Phase 3 intelligence layer complete.
Last updated: 2026-10-27.

## Priority checklist (from the build prompt)

| # | Priority | Status | Verified by |
|---|----------|--------|-------------|
| 1 | Application foundation (layout, nav, design system, responsive, states) | ✅ done | e2e page renders; production build |
| 2 | Customer management (CRUD, search, profile, history, safe archive) | ✅ done | e2e step 3 |
| 3 | Order intake & fiber profiling (multi-lot, all intake fields, sample data) | ✅ done | e2e step 4; seed marked `isSample` |
| 4 | QR generation (view/download/print, opaque code, lookup by scan) | ✅ done | e2e steps 4–5; label page |
| 5 | Production-stage tracking (configurable pipeline, weights, machine registry, undo) | ✅ done | e2e step 6 + step 14 |
| 6 | QR scanning & worker UX (camera + manual, offline queue, dedupe) | ✅ done | e2e idempotency; offline browser session not exercised |
| 7 | Lot splitting, blending & lineage (DAG, cycle prevention) | ✅ done | e2e steps 7–8; unit tests |
| 8 | Mill manager dashboard (real counts, Kanban with due-soon clocks, attention list) | ✅ done | e2e step 2 |
| 9 | Customer-facing tracking (token page, safe data, invoice balance, ETA ±) | ✅ done | e2e steps 10/12/13/14 |
| 10 | Notifications (interface, dev-mode log, Resend sending when configured) | ✅ done | e2e steps 12/13/14 |

## Phase 2a — Financial layer (Module 5), added 2026-10-27

- **PricingConfig** (singleton, owner-editable in Settings): currency code +
  symbol, tax label + rate, rush multiplier, minimum order fee, per-fiber-type
  rates per kg. Defaults: INR/₹/GST.
- **Invoice** auto-generation on order completion from actual processed
  weight (billable = non-consumed lot weights). Line items: per-lot
  processing, rush surcharge, minimum-fee top-up, manual extras. Half-up
  rounding to integer minor units everywhere.
- **Payments** (Cash/Bank/UPI/Other) with Unpaid → Partial → Paid, overpayment
  rejection (400), regenerate/extras blocked once money is taken (409).
  Owner-only money operations.
- **UI**: invoices list + outstanding totals, print-optimized invoice detail,
  invoice card on order page (with mid-production generation), pricing editor,
  amount-due on tracking page, financial analytics on Reports.
- **Resend email**: real sending when `RESEND_API_KEY` + `MAIL_FROM` are set;
  dev-mode logging otherwise.

## Phase 3 — Intelligence layer (rule-based), added 2026-10-27

- **Machine registry** (completes original Phase 2): Machine model
  (name/type/capacity/status), owner-managed in Settings, worker machine
  picker on stage events (machineId FK; legacy free-text preserved),
  utilization on Production (kg per machine last 7 days + busiest-stage
  bottleneck hint). Deletes blocked with history (409).
- **Rule-based ETA** (`lib/eta.ts` pure + wiring in `lib/production.ts`):
  median wall-clock hours/kg per stage from consecutive stage-event pairs,
  queue penalty per waiting lot, mill-wide fallback for stages without
  history, ± confidence from spread. Recalculated on order creation, every
  stage event, undo, split and blend; stored on Order
  (estimatedCompletion/etaConfidenceDays/etaBasedOnSamples); displayed on
  order page, tracking page, Kanban due-soon clocks.
- **Delay logging** (spec 3.4): staff form on the order page (reason + days +
  customer note) → pushes ETA, logs DELAY notification.
- **Batch planning suggestions** (spec 7.3): pre-Carding lots grouped by
  fiber type + color on Production; blending stays a deliberate per-lot
  action.
- **Fiber history across seasons** (spec 6.2): per-year intake/weight/yield/
  products aggregation on the customer profile; seed adds Ravi's completed
  2025 clip so it's visible immediately.

## Test results (actual runs)

- **Unit (`npx vitest run`): 44/44 passed.**
- **E2E (`node scripts/e2e.mjs`): 83/83 passed against the production build**
  (`next build` + `next start`) — full traceability workflow, invoicing with
  verified math and payment lifecycle, machine registry + utilization +
  worker 403s, ETA from history + delay logging, batch suggestions, fiber
  history, tracking page with amount due and ± ETA.
- **Type check (`npm run typecheck`): clean.**
- **Production build (`npm run build`): clean.**

## Database state

`prisma/dev.db` (SQLite) reset and reseeded on delivery: 2 users, 16 stages,
4 machines, 4 customers, 6 orders (incl. Ravi's completed 2025 clip for
multi-season history), 10 lots, 59 stage events (machines assigned to
wash/rinse/carding/spinning events), 4 lineage edges, 2 quality flags,
4 notifications, 1 pricing config, 1 sample PAID invoice with 2 payments.

## Bugs caught & fixed this phase

- **Latent Phase 1 bug (caught by the new e2e check):** the customer detail
  page passed an inline `onConfirm` function from a server component to a
  client component — impossible across the RSC boundary — so the page 500'd
  on every production render. Extracted `CustomerDeleteButton` as a client
  component. No previous test had loaded that page directly.
- e2e page assertions updated to strip React SSR `<!-- -->` text-splitting
  markers before substring checks (raw HTML never contains contiguous
  "2× Merino Wool"-style strings).

## Highest-priority next task

End-product "fiber story" QR (spec 6.3): a second QR on finished packages
opening a public provenance page (farm, breed, shearing date, stage timeline,
yield) — the plan's differentiator for craft-market mills, and all the data
it needs is already persisted.
