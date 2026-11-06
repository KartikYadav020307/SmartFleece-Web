# SmartFleece — Phase 1 Audit: Architecture, Capabilities & Findings

Audit date: 2026-10-28. Baseline evidence in `BASELINE.md`; gap register in `GAP_REGISTER.md`.
All paths are relative to the repository root. All line references verified against commit `830e1a0`.

---

## 1. Architecture (as actually built)

**Single Next.js 15 App Router application** (TypeScript, Tailwind v4, React 19):

- **Pages** — server components under `app/(app)/**` (dashboard, customers, orders, lots, production, scan, quality, invoices, reports, settings) read via Prisma directly; mutations go through REST handlers in `app/api/**` (26 route files). 22 page files, 48 routes total.
- **Public surfaces** (no session): `/login`, `/track/[token]` (per-order customer tracking), `/label/[id]` (staff-printable lot label, session required).
- **Persistence** — Prisma + SQLite (`prisma/dev.db`), 13 models: User, Session, Customer, Order, FiberLot, Stage, StageEvent, LineageEdge, QualityFlag, NotificationLog, PricingConfig, Invoice, Payment. Weights in grams (integers), money in minor units (integers). Status/type fields are app-validated strings for SQLite↔Postgres portability.
- **Auth** — DB-backed session tokens (32-byte random, httpOnly cookie `sf_session`, SameSite=Lax, 30-day expiry, `secure` in production), bcrypt(10) passwords. Roles: OWNER, WORKER (ACCOUNTANT reserved). `requireUser()` for pages (`lib/auth.ts:73`), `apiUser()` + explicit role checks for APIs.
- **Core logic** — `lib/production.ts` (stage-event transaction, weight deltas, auto quality flags, auditable undo, order-status + ETA recalculation, invoice hook), `lib/lineage.ts` + `lib/graph.ts` (split/blend, BFS cycle prevention), `lib/invoice.ts` + `lib/money.ts` (pure invoice math, half-up rounding), `lib/eta.ts` + `lib/insights.ts` (pure ETA/batch/utilization math), `lib/offline.ts` (localStorage scan queue), `lib/notify.ts` (Resend-or-dev-log notifications).
- **Client components** — forms (order intake, stage events, scanner, pricing/machine/stage editors, payment/delay forms) with localStorage offline queueing.

## 2. Capability map (verified against code + e2e, not docs)

| Area | Verified behavior | Key code |
|---|---|---|
| Customers | CRUD, archive-not-delete with history, per-year fiber history | `app/api/customers/**`, `components/CustomerDeleteButton.tsx` |
| Orders/intake | Multi-lot orders, full intake fields, rush, tracking token | `app/api/orders/route.ts`, `components/OrderForm.tsx` |
| QR | Opaque 6-char lot codes, PNG download, print label page, camera + manual scan | `lib/ids.ts`, `app/label/[id]/page.tsx`, `components/ScannerPanel.tsx` |
| Stages | Owner-configurable pipeline, stage events (worker, machine, weights, notes), stale-stage 409, idempotent offline replay, auditable undo | `lib/production.ts:52-186`, `app/api/stages/**` |
| Lineage | Split (partial keeps remainder), blend (weight = Σ parents), forward/backward trees, BFS cycle guard | `lib/lineage.ts`, `lib/graph.ts` |
| Quality | Flag types/severity, auto WEIGHT flag when loss > expected+15 pts, resolve-with-attribution | `lib/production.ts:118-131`, `app/api/quality-flags/**` |
| Invoicing | Auto-generation on READY_FOR_PICKUP from non-consumed lot weights, per-fiber rates, rush/min-fee/extras, half-up rounding, payments with Unpaid→Partial→Paid | `lib/invoice.ts`, `app/api/invoices/**` |
| ETA | Median wall-clock hours/kg per stage + queue penalty, ± confidence, recalc on create/event/undo/split/blend, delay logging | `lib/eta.ts`, `lib/production.ts:226-315`, `app/api/orders/[id]/delay/route.ts` |
| Tracking | Unguessable 144-bit token; shows stages/weights/ETA/invoice only — **no customer name, worker names, internal notes, or costs** (verified in source) | `app/track/[token]/page.tsx` |
| Notifications | Resend HTTP API when `RESEND_API_KEY`+`MAIL_FROM` set (SENT/FAILED recorded); dev-log mode otherwise; never throws into callers | `lib/notify.ts` |
| Machines | Registry CRUD, machineId FK on events (legacy free-text preserved), 7-day utilization + bottleneck hint | `app/api/machines/**`, `lib/insights.ts:53-75` |
| Reports | Real queries: collected by month/fiber type, outstanding, collection rate | `app/(app)/reports/page.tsx` |

## 3. Verified working-tree baseline

44/44 unit tests, typecheck clean, production build clean, **83/83 e2e checks against the production server on an isolated database copy** (`prisma/audit.db`, integrity-checked, path-proven). Delivery DB byte-identical before/after (hard gate passed — see BASELINE.md).

## 4. Findings (classified; full detail in GAP_REGISTER.md)

### Confirmed bugs
- **Offline queue silently drops HTTP 409 conflicts** — `lib/offline.ts:64-67` treats `res.ok || res.status === 409` identically: removes the event and increments `synced`. A 409 can be a real rejection (lot on hold/consumed, stale stage — `lib/production.ts:86-91`). Impact: an offline worker's scan can vanish without surfacing, contradicting the build requirement to "surface conflicting updates for review". Online-path users see the error immediately; only the offline sync path is affected.
- **ETA not recalculated on lot status changes** — `app/api/lots/[id]/route.ts:50` calls `recalcOrderStatus` but not `recalcOrderEta`, so hold/release/cancel leaves the stored `estimatedCompletion` stale until the next stage event. Minor: self-heals on the next scan; the delay form (`/api/orders/[id]/delay`) does move it deliberately.
- **Documentation rot in README** — `README.md:170` still claims "Machine registry is Phase 2 — the machine is a free-text field" while `README.md:46` documents the registry as built; `README.md:156` claims "all 33 routes" when the tree now has 26 API routes + 22 pages (48). BUILD_STATUS.md is internally consistent (registry done). Doc-only, but it is exactly the contradiction class this audit was asked to resolve.

### Requirement gaps (spec asks, code lacks)
- **Weight gain never flagged** — spec 2.5 requires an alert on "abnormally low" loss (possible scale error/mis-scan); `lib/calc.ts:15-17` only tests loss *above* expected+15, and a gain (negative loss) can never trigger it (`lib/production.ts:121-123`).
- **Invoice `dueDate` is a dead field** — defined (`prisma/schema.prisma:235`) and displayed (`app/(app)/invoices/[id]/page.tsx:79`) but no write path exists anywhere.
- **No refunds/voids/payment edits** — `app/api/invoices/[id]/payments/route.ts` only appends; overpayment is blocked, but a mis-keyed payment cannot be corrected. The original plan required only Unpaid/Partial/Paid tracking, so this is a gap against future expectations, not against the plan.
- **Real offline is queue-only** — no service worker/PWA caching; lookup and page loads need connectivity. Docs state this honestly (README Known limitations).

### Design trade-offs (deliberate, acceptable at mill scale — listed for the record)
- **CSRF posture = SameSite=Lax only** (`lib/auth.ts:31-34`, no `middleware.ts`): Lax blocks cross-site POST cookie attachment, all mutations are JSON POST/PATCH/DELETE, no state-changing GETs — adequate baseline, no defense-in-depth (no CSRF tokens, no Origin check).
- **Case-sensitive search** — every `contains` filter (`app/(app)/customers/page.tsx:22-25`, `app/(app)/lots/page.tsx:31-33`, `app/(app)/orders/page.tsx:29`) is case-sensitive; Prisma's `mode: "insensitive"` is unsupported on SQLite. Lot-code searches compensate via `toUpperCase()`; name/fiber searches miss case variants.
- **Undo restores the worker-reported input weight** (`lib/production.ts:206-216`) — auditable (revert marker, never delete), but a mis-typed input weight becomes the restored truth.
- **`BATCH_CUTOFF_SEQUENCE = 7` hardcodes "before Carding"** (`lib/insights.ts:36`) — if the owner reorders the pipeline, the cutoff follows position 7, not the stage named Carding.
- **Cross-order blends bill the first parent's order** (`lib/lineage.ts:167`) — documented; lineage remains queryable from all parents.
- **Expired session rows are never purged** (`lib/auth.ts:56` validates but nothing deletes) — unbounded but trivial growth.
- **`historySamples()` rescans all stage events on every ETA recalc** (`lib/production.ts:236-256`) and lineage trees recurse per node (`lib/lineage.ts:201-240`) — fine for mill-scale data, would need batching at 10k+ events.
- **`recalcOrderStatus` brace formatting** — `lib/production.ts:317` has the opening brace and first statement on one line (cosmetic; introduced by an earlier edit; compiles clean).
- **`prisma.seed` key in package.json** is deprecated (Prisma 7 migration warning observed in build output).

### Suspected risks (low likelihood, worth a ticket each)
- **No login rate limiting / lockout** (`app/api/auth/login/route.ts`) — brute force is throttled only by HTTP.
- **No security headers** — `next.config.ts` is empty: no CSP, X-Frame-Options, HSTS. The public `/track/[token]` pages can be iframed (clickjacking surface is minimal but nonzero).
- **QR brute-force surface** — lot codes are 6 chars of a 31-char alphabet (~887M); `/api/lots/lookup` requires a session, so enumeration needs an authenticated session; low risk, noted for completeness.

### Not bugs — verified clean
- Track page shows no customer name and no worker/internal data (source-verified).
- All API routes call `apiUser()` except `/api/auth/login` and `/api/auth/logout` (public by design; logout merely destroys the presented cookie).
- Invoice math, ETA math, cycle prevention, and schema coercion are unit-tested (44 tests) and match independent recomputation in e2e.
- `.env` contains no secrets (local SQLite URL + commented placeholders).

## 5. Strongest features

1. **Traceability DAG** — split/blend with BFS cycle prevention, contribution weights, forward+backward trees, all e2e-verified (`lib/lineage.ts`, `lib/graph.ts`).
2. **Invoice engine** — pure, rounding-disciplined math with independently recomputed e2e verification and a real auto-generation hook on order completion.
3. **Append-only event history with auditable undo** — corrections never destroy history (`lib/production.ts:190-223`).
4. **Honest integrations** — notifications either really send (Resend) or say LOGGED; offline queue uses server-side idempotency keys; nothing fakes success.
5. **Verification culture** — 44 unit tests + 83 e2e checks that found two real bugs historically (RSC function-prop 500, idempotency-key reuse), now run against an isolated production build.
