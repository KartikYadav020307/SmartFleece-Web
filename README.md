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
- **Customer tracking** — public per-order page behind an unguessable token
  (`/track/<token>`); shows stages, timestamps and weights only — never
  worker names, internal notes or costs.
- **Notifications** — extensible interface; in dev mode every customer
  notification is recorded in the NotificationLog (visible in Settings and on
  the order page). Nothing is emailed and nothing pretends to be.

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
  NotificationLog. Weights stored in grams.
- **Auth** — DB-backed sessions (httpOnly cookie), roles OWNER / WORKER
  (ACCOUNTANT reserved). Stage configuration and record deletion are
  owner-only. Customers reach their data only via unguessable tracking
  tokens.
- **Core logic** — `lib/production.ts` (stage progression, weight deltas,
  undo, order recalculation), `lib/lineage.ts` + `lib/graph.ts` (DAG
  operations, cycle prevention), `lib/offline.ts` (scan queue),
  `lib/notify.ts` (notification interface).

## Verification actually performed

- `npx vitest run` — **22/22 unit tests** (weight-loss math & auto-flag
  threshold, lineage cycle detection/backward tracing, Zod schemas).
- `node scripts/e2e.mjs` — **47/47 end-to-end checks** against the running
  dev server: auth lockdown, wrong-password rejection, customer
  CRUD + validation, multi-lot order intake, QR lookup (valid/invalid),
  stage events (weight delta, machine field, duplicate-scan idempotency,
  stale-stage 409, undo restoring stage & weight), auto quality flag,
  partial split (remainder kept), over-allocation rejection, blend weight =
  sum of parents, parents consumed, single-lot blend rejected, flag
  lifecycle, tracking page (valid token shows the order and hides internal
  data; invalid token shows nothing), worker role restrictions, and driving
  every remaining lot to completion flips the order to READY_FOR_PICKUP with
  an ORDER_READY notification.
- `npm run build` — clean production build (all 33 routes).

## Known limitations

- **Notifications are dev-mode** — recorded in the database, never emailed.
  Wire an SMTP provider inside `lib/notify.ts` (statuses LOGGED/SENT/FAILED
  already exist).
- **Photos** are not implemented (schema field reserved; no storage bucket
  configured).
- **Offline queue** is implemented with localStorage + server idempotency and
  verified at the API level (duplicate sync collapses correctly), but was not
  exercised in a real airplane-mode browser session.
- **Machine registry** is Phase 2 — the machine is a free-text field on stage
  events for now.
- **Cross-order blends**: the batch carries the first parent's order number;
  full lineage remains queryable from every parent lot.
- **Invoices / Reports** are explicitly marked as upcoming pages.
- **OneDrive caveat**: this project folder is OneDrive-synced, and OneDrive
  can transiently truncate `.next` dev-cache manifests during compile bursts
  (dev server returns a 500 from `loadManifest`). It self-heals; the e2e
  script retries once for this reason. For smooth development, exclude
  `.next` from sync or pause OneDrive during heavy dev use. Production
  `next start` is unaffected.
- Sample seed data is marked `isSample` and shown with a badge in the UI.

## Next priorities (Phase 2)

1. Invoice generation + payment status (Module 5) — processed weights are
   already captured per stage.
2. Email provider integration for notifications.
3. ETA estimates from stage-throughput history (stage-event data already
   accumulates).
4. Machine registry + utilization views.
