# SmartFleece MVP — Finish Verification & Delivery

## Diagnosis (done, read-only)
Both e2e failures are **test-expectation bugs, not app bugs**:
1. `GET /api/customers/[id]` returns lots newest-first, so `lotCodes[0]` in the e2e was the Alpaca lot, not the Merino — every subsequent number shifted (batch = 1500+5000 = 6500 g, which the blend engine computed correctly).
2. Order stayed `IN_PRODUCTION` correctly: split children + batch were still active. `recalcOrderStatus` behaves per spec.

## Remaining steps

1. **Fix `scripts/e2e.mjs`**
   - Select lots deterministically by `fiberType` (Merino vs Alpaca) instead of array index; keep the 4500 g expectation (correct once selection is right).
   - Extend the ending: loop stage events to drive every remaining active lot on the e2e order (batch + 2 split children) to COMPLETED, then assert the order auto-flips to `READY_FOR_PICKUP` and an `ORDER_READY` notification was logged — a genuine end-to-end test of order recalculation.

2. **Add `GET` to `app/api/orders/[id]/route.ts`** (order + lots + notifications) — used by the e2e final assertions and useful in its own right.

3. **Close a small spec gap**: add optional free-text `machine` field to StageEvent (prisma schema + zod + stage-event form + history table), then `npx prisma db push`.

4. **Re-run verification**: `npx vitest run` (22 unit tests) and `node scripts/e2e.mjs` against the running dev server → all green; fix anything that surfaces.

5. **Production build**: `npm run build`, fix any type/build errors.

6. **Reset to clean seeded state**: `npm run db:reset` so the delivered database contains only clearly-marked sample data (e2e leaves test records behind).

7. **Write `README.md`** — setup, scripts, env vars, architecture summary, how to switch to Supabase/Postgres (one-line provider change + DATABASE_URL), verification evidence, known limitations (notifications are dev-mode logged not emailed, photo storage not wired, offline queue verified by design/idempotency rather than a real offline browser session, machine field is free text).

8. **Write `BUILD_STATUS.md`** — per-priority checklist (Priorities 1–10) marking verified vs. deferred.

9. **Final report** per the build prompt §13 (implemented, files, run instructions, env, tests actually run + results, known limitations, single highest-priority next task) and save a project memory file.

## Verification gate
- vitest: all tests pass
- e2e: all checks pass (including new order-completion flow)
- `next build`: clean
- Delivered DB: fresh seed only