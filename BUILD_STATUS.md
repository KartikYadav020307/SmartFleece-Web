# SmartFleece — Build Status

Phase 1 MVP + Phase 2a (Invoicing) complete. Last updated: 2026-10-27.

## Priority checklist (from the build prompt)

| # | Priority | Status | Verified by |
|---|----------|--------|-------------|
| 1 | Application foundation (layout, nav, design system, responsive, states) | ✅ done | e2e page renders; production build |
| 2 | Customer management (CRUD, search, profile, history, safe archive) | ✅ done | e2e step 3 |
| 3 | Order intake & fiber profiling (multi-lot, all intake fields, sample data) | ✅ done | e2e step 4; seed marked `isSample` |
| 4 | QR generation (view/download/print, opaque code, lookup by scan) | ✅ done | e2e steps 4–5; label page |
| 5 | Production-stage tracking (configurable pipeline, weights, machine, undo) | ✅ done | e2e step 6 |
| 6 | QR scanning & worker UX (camera + manual, offline queue, dedupe) | ✅ done | e2e idempotency; offline browser session not exercised |
| 7 | Lot splitting, blending & lineage (DAG, cycle prevention) | ✅ done | e2e steps 7–8; unit tests |
| 8 | Mill manager dashboard (real counts, Kanban, attention list) | ✅ done | e2e step 2 |
| 9 | Customer-facing tracking (token page, safe data, invoice balance) | ✅ done | e2e steps 10/12/13 |
| 10 | Notifications (interface, dev-mode log, Resend sending when configured) | ✅ done | e2e steps 12/13 (ORDER_READY + INVOICE_READY logged) |

## Phase 2a — Financial layer (Module 5), added 2026-10-27

- **PricingConfig** (singleton, owner-editable in Settings): currency code +
  symbol, tax label + rate, rush multiplier, minimum order fee, per-fiber-type
  rates per kg. Fully configurable per user choice (defaults: INR/₹/GST).
- **Invoice** auto-generation on order completion from actual processed
  weight (billable = non-consumed lot weights; consumed weight flows into
  children — no double counting). Line items: per-lot processing, rush
  surcharge, minimum-fee top-up, manual extras. Half-up rounding to integer
  minor units at every line and on tax.
- **Payments** (Cash/Bank/UPI/Other) with Unpaid → Partial → Paid transitions,
  overpayment rejection (400), regenerate/extras blocked once money is taken
  (409). Owner-only for all money operations; staff can view.
- **UI**: invoices list with filters + outstanding total, print-optimized
  invoice detail (browser print-to-PDF), invoice card on order page (with
  mid-production manual generation), pricing editor in Settings, "amount
  due" on the public tracking page, financial analytics on Reports
  (collected by month / by fiber type, collection rate — real queries).
- **Resend email**: real sending via plain fetch when `RESEND_API_KEY` +
  `MAIL_FROM` are set (statuses SENT/FAILED with error capture); dev-mode
  logging otherwise. Never throws into the caller.

## Test results (actual runs)

- **Unit (`npx vitest run`): 34/34 passed** — includes new invoice suite
  (line math, rounding boundaries incl. a true .5 case, rush/min-fee/extras,
  tax, payment status, rates parsing, money formatting).
- **E2E (`node scripts/e2e.mjs`): 66/66 passed against the production
  build** (`next build` + `next start`, not just dev): the full Phase 1
  workflow plus pricing config (owner ✓, worker 403 ✓), auto-invoice on
  completion with independently recomputed math (billable weight, per-lot
  rates, rush line, GST 5%), partial → paid payments, overpayment 400,
  regenerate/extras 409 after payment, worker payment 403, invoice detail
  attribution, invoices/reports page renders, tracking page amount due in ₹.
- **Type check (`npm run typecheck`): clean.**
- **Production build (`npm run build`): clean** — 33 routes + invoice
  routes/pages.

## Database state

`prisma/dev.db` (SQLite) reset and reseeded on delivery: 2 users, 16 stages,
4 customers, 5 orders, 9 lots, 43 stage events, 4 lineage edges, 2 quality
flags, 4 notifications, 1 pricing config (INR/₹/GST sample rates), 1 sample
PAID invoice with 2 payments (INV-1001 on completed ORD-1021). Sample rows
carry `isSample = true`.

## Issues hit & resolutions (Phase 2a)

- Zod `optionalDate`/major-unit conversions validated by schema before
  reaching money math (× 100 rounding centralized in routes).
- e2e page checks returned 307 despite "cookie set" — root cause was the
  script's own `fetchPage(path, { headers: { Cookie } })` call convention
  nesting `headers` inside headers, so page fetches went out
  unauthenticated. Earlier "transient OneDrive 500" attributions during dev
  runs were the same bug manifesting on freshly compiled routes. Fixed the
  call convention; verified 66/66 against production where manifests load
  once at boot.

## Highest-priority next task

Rule-based ETA estimates (Module 3): stage-event history now accumulates
with timestamps and weights; average hours-per-kg per stage plus queue depth
gives honest completion estimates for the dashboard, order page and customer
tracking page without ML.
