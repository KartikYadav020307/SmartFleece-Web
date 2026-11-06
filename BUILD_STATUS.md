# SmartFleece — Build Status

Phase 1 MVP + Phase 2a (Invoicing) + Phase 3 intelligence layer + Phase 2A
reliability remediation + Module 6.3 (Fiber Story QR) + Module 6.4 (Structured Finished-Goods QC Checklist) complete. Last updated: 2026-11-06.

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
| 11 | Finished-goods Fiber Story QR & Provenance (Module 6.3) | ✅ done | e2e step 15; tests/provenance.test.ts |
| 12 | Structured Finished-Goods QC Checklist (Module 6.4) | ✅ done | e2e step 16; tests/qc.test.ts |

## Module 6.4 — Structured Finished-Goods QC Checklist, added 2026-11-06

- **QCInspection model**: Dedicated append-only inspection records linked to `FiberLot` (`onDelete: Restrict`) and `User` (`onDelete: SetNull`), preserving immutable `inspectorName` snapshots.
- **Structured measurements**: Tracks measured net weight (grams), skein count, total yardage (meters), actual ply, twist direction (S/Z/Balanced), visual inspection grade (PASS/MINOR_FLAW/REJECT), and inspector notes.
- **Explicit outcomes**: PASS, REWORK, HOLD, FAIL. Sanity limits: PASS requires positive scale weight; visual grade REJECT blocks PASS; REWORK/HOLD/FAIL require explanation notes.
- **Decoupled terminal lifecycle**: Completing the terminal stage keeps the lot in `IN_PRODUCTION` awaiting inspection; a passing QC inspection marks the lot `COMPLETED`, reconciles final net weight, and triggers order completion (`READY_FOR_PICKUP`).
- **QC Freshness (`isQCFresh`)**: Approvals are bound to the latest active stage event; any subsequent stage advancement, undo, or modification invalidates stale approvals.
- **Server-side completion & story label gates**: Direct API `PATCH /api/lots/[id]` with `status: "COMPLETED"` and `/label/[id]/story` printing are strictly blocked without a verified fresh PASS inspection.
- **Story Token Security Remediation**: Upgraded tokens to v2 AES-256-GCM AEAD (`st_<iv24Hex>_<tag32Hex>_<cipherHex>`) with RFC 5869 HKDF key derivation and rotation fallback (`STORY_SECRET_PREVIOUS`), while maintaining 100% backwards compatibility for legacy v1 tokens.
- **Craft Quality Seal**: Public seal on `/story/[token]` is strictly backed by absence of open flags AND a fresh passing QC inspection.

## Verification metrics (as of Module 6.4 delivery)

- **Unit (`npm test` / `vitest run`): 86/86 passed** (across 8 test files, +13 QC tests).
- **Type check (`npm run typecheck`): clean** (`tsc --noEmit`).
- **Production build (`npm run build`): clean — 51 routes, 19 static pages** (+1 new route: `/api/lots/[id]/qc`).
- **E2E (`node scripts/e2e.mjs`): 133/133 passed against the production build**
  (`next build` + `next start` on port 3001 with isolated `audit.db` copy) —
  full traceability, invoicing, machine registry, ETA intelligence, Module 6.3 provenance, and Module 6.4 finished-goods QC workflow.
- **Database hard gate**: `prisma/dev.db` SHA-256 before and after was
  `e0ab34ec5a095293010b61b2ca81cf822171a2974d8a66dc2dd0de98c3e55440`
  (**byte-identical, hard gate passed**).

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

## Phase 2A — Reliability remediation (2026-10-29), from the Phase 1 audit

- **Offline queue 409 handling fixed** (`lib/offline.ts`): pure
  `classifyResponse`; rejections (400/403/404/409) are kept with status +
  server reason for worker review instead of being dropped as "synced";
  401/5xx/network stay queued for retry. Scanner shows review/resolve/dismiss
  flows; re-scans use an explicit `resolvesClientEventId` link and a capped
  resolved-event record. 21 new unit tests.
- **Weight anomaly band symmetric** (`lib/calc.ts`): flags abnormally low
  loss and implausible gain (±15-point band per spec 2.5); zero-output events
  are now evaluated (previously silently skipped).
- **ETA recalculated on lot hold/release/cancel** (`app/api/lots/[id]/route.ts`).
- **README accuracy**: machine-registry limitation corrected; route count
  corrected to the build's actual table (48 routes).
- Known documented interaction: a manual delay extension is legitimately
  overwritten by the next rule-based ETA recalculation on that order (see
  product_evolution/CHANGELOG.md).

## Verification & Delivery Milestone (2026-11-06)

- **Optional machine field completed**: `components/StageEventForm.tsx` cleanly
  distinguishes registry machines (`machineId` cuid foreign key) from free-text
  machine names (`machine` column) when no machines are registered, eliminating
  foreign-key failures in SQLite. Tested in `tests/validation.test.ts`.
- **Order completion status transitions verified**: `lib/production.ts`
  `recalcOrderStatus` guarantees that when every active lot completes, the
  order transitions to `READY_FOR_PICKUP` and logs an `ORDER_READY` notification
  once without duplicates. When all lots in an order are cancelled, the order
  transitions to `CANCELLED` (not `READY_FOR_PICKUP`) and emits no ready
  notifications.
- **Deterministic E2E lot selection**: verified by `fiberType` selection and
  explicit weight matching rather than brittle array indexing.
- **`GET /api/orders/[id]` verified**: authenticated order detail endpoint
  supplies customer info, lots, and notification history.

## Module 6.3 — Finished-Product Fiber Story QR (2026-11-06)

- **Cryptographic Provenance Token (`lib/story-token.ts`)**: Generates opaque,
  high-entropy public tokens (`st_<nonce>_<sig>_<hex>`) using HMAC-SHA256. Does
  not expose internal cuid database IDs, sequential IDs, or lot codes. Tamper-proof,
  deterministic resolution without requiring SQLite schema migration. 7 unit tests
  in `tests/provenance.test.ts`.
- **Provenance DAG Engine (`lib/provenance.ts`)**: Traverses backward lineage
  DAG across splits and multi-farm blends up to 8 levels deep. Gathers root farm
  origins, shearing dates, breeds, stage processing history, clean yield percentage,
  and quality certification. Enforces strict public allowlist to exclude worker
  names, customer contacts, internal notes, and pricing.
- **Public Fiber Story Page (`app/story/[token]/page.tsx`)**: Responsive,
  craft-styled provenance certificate showing product specs, single-farm or
  artisan blend contributions, mill processing journey, and craft certification.
- **Finished-Product Story Label (`app/label/[id]/story/page.tsx`)**:
  Thermal/print-friendly finished package/skein tag encoding the secondary
  smartphone-scannable QR pointing to the public story URL.
- **Staff Lot Detail Integration (`app/(app)/lots/[id]/page.tsx`)**:
  Exposes the Fiber Story card, public preview link, and story tag print button.

## Test results (actual runs)

- **Unit (`npm test` / `vitest run`): 73/73 passed** (across 7 test files, +7 provenance tests).
- **Type check (`npm run typecheck`): clean** (`tsc --noEmit`).
- **Production build (`npm run build`): clean — 50 routes, 19 static pages** (+2 new routes: `/label/[id]/story`, `/story/[token]`).
- **E2E (`node scripts/e2e.mjs`): 107/107 passed against the production build**
  (`next build` + `next start` on port 3001 with isolated `audit.db` copy) —
  full traceability workflow, invoicing with verified math and payment lifecycle,
  machine registry + utilization + worker 403s, ETA from history + delay
  logging, batch suggestions, fiber history across seasons, tracking page with
  amount due and ± ETA, status-change ETA decrease on cancellation, full lot
  completion to `READY_FOR_PICKUP` with `ORDER_READY` notification, all-cancelled
  order transitions to `CANCELLED`, story label rendering, opaque token extraction,
  unauthenticated public story verification, data minimization/privacy checks,
  artisan blend provenance, and staff UI integration.
- **Database hard gate**: `prisma/dev.db` SHA-256 before and after was
  `e0ab34ec5a095293010b61b2ca81cf822171a2974d8a66dc2dd0de98c3e55440`
  (**byte-identical, hard gate passed**; no sidecars created or left behind).

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
