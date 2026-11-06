# SmartFleece — Gap Register (Phase 1 Audit)

Every entry is classified: **confirmed bug** / **requirement gap** / **design trade-off** / **suspected risk** / **unverified hypothesis**. Evidence is file-level against commit `830e1a0`. ID prefix: CB (confirmed bug), RG (requirement gap), DT (design trade-off), SR (suspected risk), UH (unverified hypothesis / needs evidence).

---

## The six investigation questions (opened as questions, closed with evidence)

### Q1. CSRF: SameSite=Lax-only protection
**Classification: design trade-off (adequate today), with a low suspected-risk residue.**
- Evidence: `lib/auth.ts:31-34` — cookie is `httpOnly`, `sameSite: "lax"`, `secure` in production; no `middleware.ts` exists; no CSRF tokens anywhere.
- Analysis: Lax prevents cookies on cross-site POST/PATCH/DELETE; every state-changing endpoint is JSON-body POST/PATCH/DELETE (`app/api/**`); no state-changing GET routes exist. Origin-referer checks and tokens are absent, so a future GET-mutation or non-Lax cookie would silently remove the only guard.
- Impact: none demonstrated today; regression risk if new endpoints ignore the convention.
- Verdict: acceptable for current scale; add an Origin check or CSRF tokens when the API grows.

### Q2. Case-sensitive SQLite searches
**Classification: design trade-off of the SQLite choice (usability gap for users).**
- Evidence: `app/(app)/customers/page.tsx:22-25`, `app/(app)/lots/page.tsx:31-33`, `app/(app)/orders/page.tsx:29`, `app/api/lots/route.ts` — all `contains` without `mode: "insensitive"`, which Prisma does not support on SQLite.
- Analysis: "ravi" will not match "Ravi Sharma". Lot-code and order-number searches compensate with `toUpperCase()` on input; customer/fiber free-text searches do not.
- Impact: missed search results — a daily annoyance for staff, no data risk.
- Verdict: fix with `LOWER()` comparisons now, or get case-insensitivity for free on the planned Postgres switch.

### Q3. Weight-gain quality flags vs spec 2.5
**Classification: requirement gap.**
- Evidence: spec 2.5 requires alerts when "weight loss is abnormally low (possible scale error or mis-scan)". `lib/calc.ts:15-17` (`isAbnormalLoss`) only fires when actual loss exceeds expected by >15 points; `lib/production.ts:121-123` is the only auto-flag call site. A weight *gain* (negative loss) mathematically can never trigger it.
- Impact: mis-keyed scales (output > input) pass silently into weights, invoices, and yields.
- Verdict: small, well-specified fix in `lib/calc.ts` + one call site; add a unit test for the gain case.

### Q4. Offline-queue handling of HTTP 409
**Classification: confirmed bug.**
- Evidence: `lib/offline.ts:64-67` — `if (res.ok || res.status === 409) { removeFromQueue(...); synced++; }`. The comment assumes 409 means "duplicate", but the server returns 409 for real conflicts: lot on hold, consumed by blend, cancelled, completed, or stale stage (`lib/production.ts:86-91`).
- Analysis: duplicate *replays* genuinely return 200 with `duplicate: true` (server dedupe via `clientEventId`, `lib/production.ts:62-72`), so the 409 branch is never needed for dedupe — it only swallows real rejections and counts them as "synced". The online path surfaces these errors (`components/StageEventForm.tsx` shows `data.error`); only the offline sync path is silent.
- Impact: an offline worker sees "synced" for a scan the server refused; the event is dropped from the queue and never reviewed. Directly contradicts the build requirement to "surface conflicting updates for review".
- Verdict: split 409 out of the success branch — count as `rejected`, push to `errors`.

### Q5. Missing invoice due dates
**Classification: requirement gap.**
- Evidence: `Invoice.dueDate` defined (`prisma/schema.prisma:235`) and rendered (`app/(app)/invoices/[id]/page.tsx:79`) but `grep -rn dueDate app lib` shows **no write path** — not set at generation, not editable in the UI.
- Impact: the "Due —" line is always empty; no payment-terms concept.
- Verdict: add dueDate at generation (e.g., +N days setting) or an owner-editable field.

### Q6. Refunds / payment corrections
**Classification: requirement gap (against future expectations; the original plan required only status tracking).**
- Evidence: `app/api/invoices/[id]/payments/route.ts` only creates; grep for refund/void/delete on payments returns nothing. Overpayment is rejected (400) but a wrong payment is permanent.
- Impact: a mis-keyed payment can only be fixed by direct DB surgery; the invoice will show a payment that never happened.
- Verdict: add payment void/reversal (audit-preserving, like stage-event undo) in a future phase.

## Additional confirmed findings

### CB-3. Stale README claims (documentation rot)
**Classification: confirmed bug (documentation).**
- Evidence: `README.md:170` "Machine registry is Phase 2 — the machine is a free-text field on stage events" directly contradicts `README.md:46` (registry implemented, `app/api/machines/**`, `StageEvent.machineId`). `README.md:156` "clean production build (all 33 routes)" — actual count is 26 API route files + 22 pages (48). BUILD_STATUS.md is consistent with the code.
- Impact: the exact class of contradiction this audit was commissioned to resolve; misleads contributors and future phases.

### CB-2. ETA staleness after hold/cancel/release
**Classification: confirmed bug (minor).**
- Evidence: `app/api/lots/[id]/route.ts:50` — `if (parsed.data.status) await recalcOrderStatus(lot.orderId);` with no `recalcOrderEta` call, while every other mutation path recalculates both (`lib/production.ts:174-182, 221-224`; `app/api/orders/route.ts`; `lib/lineage.ts`).
- Impact: cancelling or holding a lot leaves the customer-facing ETA unchanged until the next stage event. Self-healing; low severity.

### CB-1 (doc). `lib/production.ts:317` formatting anomaly
**Classification: cosmetic (noted for hygiene).** `export async function recalcOrderStatus(...): Promise<string> {  const order = ...` — brace and first statement share a line (introduced by an earlier edit; typecheck and behavior unaffected).

## Requirement gaps vs the original plan (acknowledged in docs, verified real)

| ID | Gap | Evidence | Notes |
|---|---|---|---|
| RG-3 | Real offline (PWA caching) | `lib/offline.ts` is a localStorage queue; no service worker exists; README Known limitations states it | Build prompt permitted "where practical" |
| RG-4 | Intake photos | `FiberLot.photos` field reserved; no upload UI/storage | Blocked on external storage choice |
| RG-5 | Finished-goods QC checklist | QC exists only as a pipeline stage (`lib/constants.ts`); no structured checklist form | Spec 4.4 |
| RG-6 | Internal per-stage cost tracking | No labor/energy/consumable inputs; Reports shows revenue only | Spec 5.3 |
| RG-7 | ML ETA / day-of-week / seasonal effects | `lib/eta.ts` uses flat medians | Spec 3.1 — deferred by design until data accrues |
| RG-8 | Worker task assignment, supplies inventory, sustainability | No code | Spec 7.4-7.6 |
| RG-9 | Production/quality reports, exports | Reports page is financial-only | Spec 8.1-8.4 |

## Suspected risks (low, ticket-worthy)

| ID | Risk | Evidence |
|---|---|---|
| SR-1 | No login rate limiting/lockout | `app/api/auth/login/route.ts` — no attempt counting |
| SR-2 | No security headers (CSP/XFO/HSTS) | `next.config.ts` is empty; public `/track/[token]` pages are framable |
| SR-3 | QR brute force with a valid session | `lib/ids.ts` 6-char codes (~887M); lookup is auth-gated |
| SR-4 | `BATCH_CUTOFF_SEQUENCE = 7` assumes default pipeline order | `lib/insights.ts:36`; owner reordering changes its meaning |

## Unverified hypotheses (would need real devices/data)

| ID | Hypothesis | Why unverified |
|---|---|---|
| UH-1 | Offline queue works in a real airplane-mode session (queue → `online` event → flush) | Implemented and API-idempotency verified; never exercised in a real offline browser |
| UH-2 | Camera scanning works on typical mill-floor Android phones | html5-qrcode integrated with graceful fallback; no physical device test; camera requires HTTPS in production |
| UH-3 | ETA medians are useful with <6 months of mixed data | Math unit-tested; real-world usefulness depends on sample volume |
| UH-4 | OneDrive sync caused historical dev-server 500s | Earlier attribution; an e2e bug (fetchPage header nesting) was later proven to be the real cause — treat old OneDrive blame as unproven |

## Test coverage notes

- Unit tests cover pure math (calc, graph, validation, invoice, eta/insights) — 44 tests, all passing.
- Not unit-tested: server-side `recalcOrderEta` assembly (`lib/production.ts:226-315`) — only exercised via e2e; `lib/offline.ts` (browser-only); `lib/notify.ts` Resend branch (needs credentials; the dev-log branch is e2e-verified).
- e2e covers all API routes and all pages touched by staff/customer journeys; it does not test Stage/Settings *edit* flows beyond stage reorder basics (machine CRUD is covered).
