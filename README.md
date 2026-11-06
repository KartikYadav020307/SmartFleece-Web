# SmartFleece 🐑

QR-based production, lot-traceability and customer-visibility platform for
small-scale fiber mills. Phase 1 MVP — implemented from
`SmartFleece_Build_Plan.md`.

> Every gram of fiber has a story. SmartFleece makes sure that story is never
> lost.

## What this MVP does

- **Customers** — full CRUD with farm info, saved processing preferences and
  internal notes; profiles persist across seasons.
- **Order intake** — one order, many individually QR-tagged bags; intake
  assessment (grease weight, grade A–D, VM rating, staple, microns, color),
  shearing date, farm info, target product, yarn/dye specs, rush flag.
- **QR codes** — every lot gets an opaque `LOT-XXXXXX` code (no customer data
  in the QR), rendered on the lot page with PNG download and a
  print-friendly thermal-label page.
- **Production pipeline** — 16 configurable stages by default (owner can
  reorder / rename / add / deactivate / set expected-loss %); stage events
  record worker, machine, input/output weights, notes; weight deltas are
  calculated and abnormal loss (>15 pts above expected) auto-raises a quality
  flag. Events are append-only; mistakes are corrected with an auditable
  **Undo** (reverts, never deletes).
- **Scan workflow** — camera scanning (html5-qrcode) plus manual code lookup,
  designed for ≤3 taps. Offline: stage scans queue in localStorage with a
  UUID idempotency key and sync when back online; duplicates are collapsed
  server-side, rejected events are surfaced, never silently dropped.
- **Lineage DAG** — split a lot into children (full or partial allocation),
  blend lots (even across orders) into a batch; forward and backward
  traceability trees; cycle prevention is enforced and unit-tested.
- **Dashboard** — live counts, order-status distribution, stalled-lot and
  quality-flag attention list, production Kanban by stage, recent events —
  all from real persisted data.
- **Quality** — flag issues from any stage form (VM, felting, color, odor,
  mold, pest, weight…), resolve with attribution.
- **Invoicing (Module 5)** — configurable pricing (currency, tax label/rate,
  rush multiplier, minimum fee, per-fiber-type ₹/kg rates); invoices are
  auto-generated when an order completes, billing **actual processed weight**
  with per-lot line items, rush surcharge and minimum-order top-up; manual
  extra charges (e.g. dyeing); payment recording (Cash/Bank/UPI/Other) with
  Unpaid → Partial → Paid status; print-optimized invoice page (browser
  print-to-PDF); revenue analytics on the Reports page. Money is stored as
  integer minor units (paise/cents).
- **Machine registry & utilization** — machines with capacity/status managed
  in Settings; workers pick from the registry on stage events (legacy
  free-text events still display); Production shows kg processed per machine
  (last 7 days), status badges and the busiest-stage bottleneck hint.
- **Rule-based ETA (Module 3)** — median wall-clock hours-per-kg per stage
  from the mill's own stage-event history, plus a queue penalty per waiting
  lot; shown with a ± confidence range on the order page and customer
  tracking page, recalculated on every scan; delay logging (reason + days)
  pushes the ETA and notifies the customer.
- **Batch planning suggestions (spec 7.3)** — groups queued pre-Carding lots
  by fiber type + color and suggests shared wash/card runs.
- **Fiber history across seasons (spec 6.2)** — per-year aggregation of
  intake, current weight, yield and products on the customer profile.
- **Customer tracking** — public per-order page behind an unguessable token
  (`/track/<token>`); shows stages, timestamps, weights, the ETA with
  confidence and the invoice balance — never worker names, internal notes or
  costs.
- **Finished-product "fiber story" QR (Module 6.3)** — secondary consumer QR
  code on finished package/skein tags (`/label/<id>/story`) opening a public
  provenance certificate (`/story/<token>`); displays farm origin, animal breed,
  shearing date, stage journey timeline, clean yield %, and artisan blend breakdown
  with complete privacy allowlisting. Upgraded with v2 AES-256-GCM AEAD encryption.
- **Structured Finished-Goods QC Checklist (Module 6.4)** — dedicated append-only
  inspection records before lot completion and story tag printing; records verified
  net scale weight, skein count, total yardage, ply, twist (S/Z/Balanced), visual
  grade (PASS/MINOR_FLAW/REJECT), notes, and outcomes (PASS/REWORK/HOLD/FAIL).
  Decouples terminal-stage completion, ensures QC freshness against stage undos,
  and gates story label printing and order completion.
- **Notifications** — extensible interface; when `RESEND_API_KEY` and
  `MAIL_FROM` are set, emails are sent via the Resend API and logged as
  SENT/FAILED. Otherwise every notification is recorded in the
  NotificationLog in dev mode (visible in Settings and on the order page).
  Nothing pretends to have been sent.

## Quick start

```bash
npm install
npm run db:push     # create/refresh the SQLite schema
npm run db:seed     # load clearly-marked sample data (destructive to dev.db)
npm run dev         # http://localhost:3000
```

Sample logins (seeded, marked `sample` — change before real use):

| Role   | Email                       | Password   |
|--------|-----------------------------|------------|
| Owner  | owner@smartfleece.local     | demo1234   |
| Worker | worker@smartfleece.local    | demo1234   |

## Scripts

| Command              | Purpose                                            |
|----------------------|----------------------------------------------------|
| `npm run dev`        | Development server                                 |
| `npm run build`      | Production build (`next build`)                    |
| `npm start`          | Serve the production build                         |
| `npm test`           | Unit tests (vitest)                                |
| `node scripts/e2e.mjs` | End-to-end verification against a running server |
| `npm run db:push`    | Apply schema to the database                       |
| `npm run db:seed`    | Wipe + load sample data (dev only)                 |
| `npm run db:reset`   | Force-reset schema + seed (dev only)               |
| `npm run typecheck`  | `tsc --noEmit`                                     |

## Configuration

`.env`:

```
DATABASE_URL="file:./dev.db"   # SQLite for zero-config local dev

# Optional — real email via Resend (https://resend.com, free tier):
# RESEND_API_KEY="re_xxxxxxxxxxxx"
# MAIL_FROM="SmartFleece <onboarding@resend.dev>"
```

### Switching to Supabase / Postgres

1. In `prisma/schema.prisma` change the datasource provider to `"postgresql"`.
2. Set `DATABASE_URL` to your Postgres/Supabase connection string.
3. `npx prisma db push` (and optionally seed).

Status/type fields are app-validated strings precisely because they stay
portable between SQLite and Postgres this way. For a hosted Supabase setup,
add Row Level Security policies scoped to a `mill_id` before multi-tenant use.

## Architecture

- **Next.js 15 App Router + TypeScript + Tailwind CSS v4** — single app,
  server components read via Prisma directly; mutations go through REST route
  handlers under `app/api/**` (auth-guarded, Zod-validated).
- **Prisma + SQLite** — `prisma/schema.prisma` models: User, Session,
  Customer, Order, FiberLot, Stage, StageEvent, LineageEdge, QualityFlag,
  NotificationLog, PricingConfig, Invoice, Payment, Machine. Weights stored
  in grams; currency in integer minor units.
- **Auth** — DB-backed sessions (httpOnly cookie), roles OWNER / WORKER
  (ACCOUNTANT reserved). Stage configuration and record deletion are
  owner-only. Customers reach their data only via unguessable tracking
  tokens.
- **Core logic** — `lib/production.ts` (stage progression, weight deltas,
  undo, order status and ETA recalculation), `lib/lineage.ts` + `lib/graph.ts` (DAG
  operations, cycle prevention), `lib/offline.ts` (scan queue and classification),
  `lib/notify.ts` (notification interface).

## Verification actually performed

- `npm test` (`vitest run`) — **73/73 unit tests** (weight-loss math & symmetric
  deviation auto-flag band, lineage cycle detection/backward tracing, Zod schemas
  including machine options, invoice line math with half-up rounding,
  rush/minimum-fee/extras, tax, payment status transitions, money formatting,
  ETA medians/spread/queue penalties/fallbacks, batch-suggestion grouping,
  machine utilization aggregation, offline queue sync classification/lifecycle,
  and cryptographic provenance token generation/verification/privacy allowlisting).
- `node scripts/e2e.mjs` — **107/107 end-to-end checks, run against the
  production build** (`next build` + `next start` on port 3001 with an isolated
  audit database copy): auth lockdown, customer CRUD, multi-lot intake, QR
  lookup, stage events (weights, machine registry link, idempotency, stale-stage
  409, undo), auto quality flag, split (partial keeps remainder), blend
  (weight = sum of parents), completing every lot → order auto-flips to
  READY_FOR_PICKUP with ORDER_READY notification, auto-invoice with verified math,
  payment lifecycle (partial → paid, overpayment 400, regenerate/extras
  blocked after payment, worker 403s), invoices/reports pages, machine CRUD
  + utilization + worker 403, ETA populated from history + delay logging
  shifting it + DELAY notification, batch suggestions, customer fiber history
  across seasons, tracking page with amount due and ± ETA, status-change ETA
  decrease on lot cancellation, completion with remaining lots to READY_FOR_PICKUP,
  all-cancelled orders transitioning to CANCELLED, story label rendering, opaque
  token extraction, unauthenticated public story verification, data minimization/privacy
  checks, artisan blend provenance, and staff UI integration.
- `npm run typecheck` — clean TypeScript compilation (`tsc --noEmit`).
- `npm run build` — clean production build (50 routes, 19/19 static pages).
- **Database isolation hard gate** — `prisma/dev.db` SHA-256 byte-identical
  before and after all test runs; isolated `audit.db` verified via SQLite
  integrity check and resolved path proof, then cleaned up with zero residue.
- Dev-mode caveat: this folder is OneDrive-synced and the dev server
  compiles routes on demand; if a page transiently 500s in dev, it's the
  sync race — the production build is unaffected.

## Known limitations

- **Notifications** send via Resend only when `RESEND_API_KEY` + `MAIL_FROM`
  are configured; otherwise they are recorded in dev mode (by design).
- **Photos** are not implemented (schema field reserved; no storage bucket
  configured).
- **Offline queue** is implemented with localStorage + server idempotency and
  verified at the API level (duplicate sync collapses correctly), but was not
  exercised in a real airplane-mode browser session.
- **Machine registry**: implemented — machines are managed in Settings, picked
  from a dropdown on stage events, and feed the utilization view. Stage events
  recorded before the registry keep their legacy free-text machine label, and
  utilization counts registry-linked events only.
- **Cross-order blends**: the batch carries the first parent's order number;
  full lineage remains queryable from every parent lot.
- **Invoices** print via the browser's print-to-PDF (no server-side PDF
  binary yet); payments are recorded manually — online payment collection
  (Stripe) is a future phase.
- **Reports** currently cover financial analytics only; production/quality
  reports arrive with more accumulated history.
- Sample seed data is marked `isSample` and shown with a badge in the UI.

## Next priorities (Phase 3 continued)

1. End-product "fiber story" QR (provenance page per finished lot).
2. Worker task assignment + productivity views.
3. Server-side PDF invoice binary (e.g. pdfkit) if print-to-PDF proves
   limiting.
4. Photo upload at intake (needs a storage bucket).
