# SmartFleece — Evolution Changelog

Append-only log of post-audit changes. The Phase 1 audit reports
(AUDIT.md, BASELINE.md, GAP_REGISTER.md) are preserved unmodified alongside
this file.

---

## Phase 2A — Reliability Remediation (2026-10-29)

Fixes the three confirmed functional issues and the stale README statements
from the Phase 1 audit (GAP_REGISTER.md). No schema changes; no new
dependencies.

### 1. Offline queue conflict handling (audit CB-1 / Q4)

`lib/offline.ts` rewritten around a pure, unit-tested
`classifyResponse(status)`:

- **2xx → synced**: removed from the queue, counted as synced. Idempotent
  replay is unchanged — the same body with the same `clientEventId` is resent
  and the server dedupes (`lib/production.ts:62-72`).
- **400/403/404/409 → rejected**: the event is **kept in the queue** with
  `rejectedAt`, `rejectedStatus`, and the server-provided `rejectionReason`.
  It is never counted as synced and never auto-resubmitted — later flushes
  skip it (no tight-loop retries). Previously a 409 was dropped and counted
  as synced, silently losing legitimate conflicts.
- **401/5xx/network → retry**: stays queued unchanged with the original
  clientEventId; syncs automatically on the next flush or reconnect.

`FlushResult` now distinguishes `synced` / `rejected` / `retryable`.

**Scanner UI** (`components/ScannerPanel.tsx`): rejected events appear in a
"needs review" card separate from "awaiting sync". Review expands the lot,
attempted stage, HTTP status, server reason, saved time and submitted
weights/notes (parsed from the stored payload) — opening review changes
nothing. **Re-scan at current stage** is offered only after a fresh
`/api/lots/lookup` confirms the lot is eligible (PENDING/IN_PRODUCTION with a
current stage); ON_HOLD/CONSUMED/CANCELLED/COMPLETED lots show their fresh
status with review/dismiss only. Confirming a re-scan marks the original
`resolutionPending` and opens `/scan?code=` for a fresh submission; **Dismiss**
is an explicit confirmed action.

**Replacement linkage**: the replacement carries
`resolvesClientEventId` — an explicit link to the original rejected event.
Only a linked replacement retires the original, moving it to a capped
resolved-event record (`sf_scan_resolved`, last 20) with outcome
`replacement_queued_offline`, promoted in place to `replacement_synced` when
the replacement later syncs. A merely same-lot event without the link never
resolves anything. If the replacement is abandoned or itself rejected, the
original stays available for review and the replacement's rejection is
retained independently. `StageEventForm` threads the link on both the online
and offline paths.

### 2. Abnormal weight-loss detection (audit RG-2 / Q3)

`lib/calc.ts` — `isAbnormalLoss` is now a **symmetric ±15-point deviation
band**: `Math.abs(actualLossPct − expectedLossPct) > 15`. The 15-point unit is
the tolerance the specification already establishes for the high side; the
low side (spec 2.5's "abnormally low loss — possible scale error or
mis-scan") uses the same unit, so no new arbitrary constant is introduced.
Weight gain registers as a negative loss and is flagged wherever the stage
expects meaningful loss (e.g. any gain during Washing at 35% expected). On
0%-expected stages, sub-15-point moisture-regain noise stays unflagged to
avoid alarm fatigue. The call-site guard in `lib/production.ts` now evaluates
whenever input weight is positive and output weight is **defined — including
an output of zero** (a total-loss anomaly that the old `inputW && outputW`
guard silently skipped). Flag attribution and transaction behavior unchanged.

### 3. ETA recalculation on lot-status changes (audit CB-2)

`app/api/lots/[id]/route.ts` now calls `recalcOrderEta` (in the same
try/catch-log pattern used everywhere) after `recalcOrderStatus`, whenever a
status was in the payload. Hold, release and cancellation keep the
customer-facing ETA fresh instead of leaving it stale until the next scan.

**Documented interaction (pre-existing, not changed)**: the delay endpoint
(`/api/orders/[id]/delay`) sets `estimatedCompletion` to now + extra days,
but any later rule-based recalculation on that order (stage event, undo,
split/blend, status change) recomputes the ETA from history and legitimately
overwrites a manual extension. The delay's customer notification and the
NotificationLog entry persist; only the date is recomputed. A future phase
could add a delay-hold window if mills find this surprising.

### 4. Documentation corrections (audit CB-3)

- README: stale "Machine registry is Phase 2 — free-text" limitation replaced
  with the accurate registry description; "all 33 routes" corrected to the
  build's actual route table count (48).
- BUILD_STATUS.md: Phase 2A section added with actual verification results.

### Verification (isolated, per protocol)

| Check | Result |
|---|---|
| `npx vitest run` | **65/65** (was 44; +21 offline/calc tests) |
| `npx tsc --noEmit` | Clean |
| `npm run build` (DATABASE_URL=audit.db) | Clean; route table = 48 routes |
| e2e vs production server on port 3001 | **89/89** (was 83; +6 order-3 status-change checks) |
| `prisma/dev.db` SHA-256 before | `e0ab34ec5a095293010b61b2ca81cf822171a2974d8a66dc2dd0de98c3e55440` |
| `prisma/dev.db` SHA-256 after | **identical — hard gate passed** (no WAL/SHM sidecars existed) |
| Audit server / audit.db cleanup | Verified-PID stop, files removed, no residue |
| Dev server | Stopped for build, restored after the hard gate |

### Remaining limitations (unchanged)

Refunds/payment corrections, invoice due dates, real offline PWA caching,
photo storage, per-stage cost tracking, rate limiting and security headers —
all recorded in GAP_REGISTER.md and intentionally out of Phase 2A scope.

---

## Final Verification & Delivery Milestone (2026-11-06)

Continuation and completion of the "SmartFleece MVP — Finish Verification & Delivery" task.

### 1. Optional machine field completion
- In `components/StageEventForm.tsx`, differentiated submissions based on `machines.length > 0`: registered machines send `machineId` (referencing the `Machine` registry model), whereas free-text equipment entries (when no machines are registered) send `machine` to avoid SQLite foreign-key constraint failures.
- Unit test coverage added in `tests/validation.test.ts` verifying that `stageEventSchema` accepts both `machineId` and `machine`.

### 2. Order completion status transitions
- In `lib/production.ts` (`recalcOrderStatus`), enhanced logic to distinguish an order whose lots are all cancelled (`next = "CANCELLED"`) from an order with completed lots (`next = "READY_FOR_PICKUP"`). Orders with cancelled lots do not emit false `ORDER_READY` notifications.
- Validated that duplicate `ORDER_READY` notifications are not emitted once an order is already `READY_FOR_PICKUP`.

### 3. Extended E2E verification
- In `scripts/e2e.mjs`:
  - Verified lot selection determinism using `fiberType` rather than array indexing.
  - Verified `GET /api/orders/[id]` functionality and access.
  - Added coverage for completing the remaining active lot in Order 3 to `READY_FOR_PICKUP` with `ORDER_READY` notification.
  - Added Order 4 test confirming that an order with all lots cancelled transitions to `CANCELLED` and emits no `ORDER_READY` notification.
  - Total E2E checks expanded from 89 to 96 checks.

### Verification (isolated, per protocol)

| Check | Result |
|---|---|
| `npm test` (`vitest run`) | **66/66 passed** (across 6 test files) |
| `npm run typecheck` | Clean |
| `npm run build` (DATABASE_URL=audit.db) | Clean; route table = 48 routes, 19/19 static pages |
| e2e vs production server on port 3001 | **96/96 passed, 0 failed** |
| `prisma/dev.db` SHA-256 before | `e0ab34ec5a095293010b61b2ca81cf822171a2974d8a66dc2dd0de98c3e55440` |
| `prisma/dev.db` SHA-256 after | **identical — hard gate passed** (no sidecars existed before or after) |
| Audit server / audit.db cleanup | Verified PID 42392 stopped, audit files removed, no residue |

---

## Module 6.3 — Finished-Product Fiber Story QR (2026-11-06)

Implemented the consumer-facing provenance certificate and finished package QR.

### 1. Opaque Cryptographic Provenance Token (`lib/story-token.ts`)
- Implemented `generateStoryToken` and `resolveStoryToken` using HMAC-SHA256 with nonces.
- Structure: `st_<nonce>_<sig>_<hex>`.
- Guarantees high entropy, unguessability, and tamper-proofing while avoiding any database schema changes or migrations, preserving `dev.db` checksum integrity completely.

### 2. Lineage Provenance Engine (`lib/provenance.ts`)
- Recursively traverses backward lineage DAG across splits and multi-farm blends up to 8 levels deep.
- Extracts root farm origins (`customer.farmName`, `order.farmInfo`, `customer.location`), breeds (`breed`, `fiberType`), shearing dates (`order.shearingDate`), and intake weights.
- Calculates proportional blend percentages for multi-farm blends.
- Aggregates chronological stage journey across parent and child stages.
- Computes overall clean yield % via `cleanYieldPct`.
- Enforces strict privacy allowlist: customer personal names, emails, phones, worker names, internal notes, machine IDs, and pricing/financial records are strictly excluded.

### 3. Public Provenance Certificate UI (`app/story/[token]/page.tsx`)
- Mobile-first, craft-styled public provenance certificate at `/story/[token]`.
- Displays single-origin vs artisan blend badges, product specs (target product, yarn specs, ply, twist, color, microns, staple length), farm origins, processing stage timeline, clean yield, and craft verification badge.
- Renders friendly not-found certificate on invalid or tampered tokens.

### 4. Finished-Product Label (`app/label/[id]/story/page.tsx`)
- Thermal/print-friendly finished package/skein tag encoding the secondary smartphone-scannable QR pointing to the public story URL.
- Includes product specs, farm origins, net weight, and print styling.

### 5. Staff UI Integration (`app/(app)/lots/[id]/page.tsx`)
- Added "The Fiber Story (Module 6.3)" card and header action buttons to preview public story and print finished-product story labels.

### 6. Extended Test Verification
- Added `tests/provenance.test.ts` (7 new tests covering token generation, resolution, tampering rejection, and privacy allowlist contract).
- Extended `scripts/e2e.mjs` with Section 15 (story label, opaque token extraction, public story render, privacy field exclusion, invalid token 404, artisan blend provenance, and staff UI integration).
- E2E checks expanded from 96 to 107 checks.

### Verification (isolated, per protocol)

| Check | Result |
|---|---|
| `npm test` (`vitest run`) | **73/73 passed** (across 7 test files, +7 new tests) |
| `npm run typecheck` | Clean (`tsc --noEmit`) |
| `npm run build` (DATABASE_URL=audit.db) | Clean; route table = 50 routes (+2 new routes), 19 static pages |
| e2e vs production server on port 3001 | **107/107 passed, 0 failed** |
| `prisma/dev.db` SHA-256 before | `e0ab34ec5a095293010b61b2ca81cf822171a2974d8a66dc2dd0de98c3e55440` |
| `prisma/dev.db` SHA-256 after | **identical — hard gate passed** (no sidecars existed before or after) |
| Audit server / audit.db cleanup | Verified PID 10404 stopped, audit files removed, no residue |

---

## Module 6.4 — Structured Finished-Goods QC Checklist (2026-11-06)

Implements the structured finished-goods QC checklist for final physical inspection of finished fiber lots before lot completion and retail Fiber Story label printing.

### 1. QCInspection Model & Schema (`prisma/schema.prisma`)
- Added `QCInspection` model with `onDelete: Restrict` on `FiberLot` and `onDelete: SetNull` on `User` and `StageEvent`.
- Captures immutable `inspectorName` snapshot at inspection time.
- Records structured physical measurements: `measuredWeightG` (net scale weight), `previousWeightG`, `weightDeltaG`, `skeinCount`, `totalYardageM`, `actualPly`, `actualTwist`, `visualGrade`, and `notes`.
- Explicit outcomes: `PASS`, `REWORK`, `HOLD`, `FAIL`.

### 2. Decoupled Terminal-Stage Lifecycle (`lib/production.ts`, `lib/qc.ts`)
- Completing the terminal stage advances processing but leaves the lot in `IN_PRODUCTION` awaiting inspection (preventing premature lot completion).
- Submitting a fresh `PASS` QC inspection finalizes the lot: marks `COMPLETED`, reconciles `currentWeightG = measuredWeightG`, and triggers `recalcOrderStatus(lot.orderId)` (auto-flipping order to `READY_FOR_PICKUP` and generating invoice).

### 3. Server-Side Gates & Freshness Invalidation
- `isQCFresh(lot, qc)`: Approvals are bound to the latest active stage event; any subsequent stage event or undo invalidates stale approvals.
- Direct API `PATCH /api/lots/[id]` with `status: "COMPLETED"` is rejected (HTTP 400) unless all stages are completed and fresh PASS QC exists.
- Story label route `/label/[id]/story` is blocked with a friendly gate screen unless fresh PASS QC exists.

### 4. Story Token Security Upgrade (`lib/story-token.ts`)
- Upgraded tokens to v2 AES-256-GCM authenticated encryption (`st_<iv24Hex>_<tag32Hex>_<cipherHex>`).
- Key derivation using RFC 5869 HKDF (`hkdfSync`) from `STORY_SECRET`.
- Production entropy checks and warning on weak keys.
- Supported `STORY_SECRET_PREVIOUS` for seamless key rotation.
- Fully preserved backwards compatibility for legacy Module 6.3 v1 HMAC tokens.

### 5. Craft Quality Seal Hardening (`lib/provenance.ts`, `app/story/[token]/page.tsx`)
- Public seal on `/story/[token]` strictly requires absence of open defect flags AND a fresh passing finished-goods QC inspection.
- Exposes vetted `qcCertifiedAt` and `qcVisualGrade` while strictly concealing internal inspector identities and mill notes.

### 6. Inspector UI (`components/QCInspectionForm.tsx`, `app/(app)/lots/[id]/page.tsx`)
- Embedded QC Inspection Checklist card on lot detail page.
- Pre-populates target product context (e.g. yarn specs).
- Shows live QC status badge (Awaiting QC, QC Passed, Rework Required, Quality Hold, QC Stale).
- Audit history table displaying all past inspection attempts, outcomes, deltas, and inspector attributions.

### 7. Extended Test Coverage (`tests/qc.test.ts`, `scripts/e2e.mjs`)
- Added `tests/qc.test.ts` (13 tests covering Zod validations, range checks, freshness logic, AEAD encryption/decryption, legacy v1 token resolution, and tamper rejection).
- Extended `scripts/e2e.mjs` with Section 16 (story label block before QC, premature PATCH block, validation rejections, REWORK retention, HOLD & release, terminal stage await, PASS trigger to COMPLETED, weight reconciliation, order flip to READY_FOR_PICKUP, story label unlock, and public quality seal verification).
- Total tests: 86 unit tests (all passed), 133 E2E assertions (all passed).

### Verification (isolated, per protocol)

| Check | Result |
|---|---|
| `npm test` (`vitest run`) | **86/86 passed** (across 8 test files, +13 new tests) |
| `npm run typecheck` | Clean (`tsc --noEmit`) |
| `npm run build` (DATABASE_URL=audit.db) | Clean; route table = 51 routes (+1 new route), 19 static pages |
| e2e vs production server on port 3001 | **133/133 passed, 0 failed** |
| `prisma/dev.db` SHA-256 before | `e0ab34ec5a095293010b61b2ca81cf822171a2974d8a66dc2dd0de98c3e55440` |
| `prisma/dev.db` SHA-256 after | **identical — hard gate passed** |
| Audit server / port 3001 cleanup | Verified PID stopped, port 3001 closed, port 3000 untouched |


