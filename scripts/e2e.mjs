/**
 * SmartFleece end-to-end verification against a running dev server.
 *
 *   node scripts/e2e.mjs            (defaults to http://localhost:3000)
 *   BASE=http://host:port node scripts/e2e.mjs
 *
 * Exercises the Phase 1 acceptance workflow: login → customer → order with
 * lots → QR/lookup → stage events (incl. machine field, abnormal-loss
 * auto-flag, duplicate-scan idempotency, wrong-stage rejection, undo) →
 * split → blend → completing every remaining lot → order auto-flips to
 * READY_FOR_PICKUP with an ORDER_READY notification → public tracking →
 * authorization checks.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
// Unique per run: clientEventId is a server-side idempotency key, so reusing
// a fixed key across runs would make the server return the previous run's
// event instead of recording a new one.
const RUN = crypto.randomUUID().slice(0, 8);

let cookie = "";
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, location: res.headers.get("location") ?? "" };
}

console.log(`SmartFleece e2e → ${BASE}\n`);

// 0. Unauthenticated access is locked down.
{
  const saved = cookie;
  cookie = "";
  const dash = await api("GET", "/dashboard");
  ok("unauthenticated /dashboard redirects to login", dash.status === 307 && dash.location.includes("/login"));
  const lotsApi = await api("GET", "/api/lots");
  ok("unauthenticated API returns 401", lotsApi.status === 401);
  cookie = saved;
}

// 1. Login.
{
  const bad = await api("POST", "/api/auth/login", { email: "owner@smartfleece.local", password: "wrong" });
  ok("wrong password rejected (401)", bad.status === 401);
  const res = await api("POST", "/api/auth/login", { email: "owner@smartfleece.local", password: "demo1234" });
  ok("owner can sign in", res.status === 200 && res.data.role === "OWNER");
}

// 2. Dashboard renders with seeded data.
{
  const page = await fetch(BASE + "/dashboard", { headers: { Cookie: cookie }, redirect: "manual" });
  const html = await page.text();
  ok("dashboard renders (200)", page.status === 200);
  ok("dashboard shows kanban + stats", html.includes("Production Kanban") && html.includes("Order Status Distribution"));
}

// 3. Create customer.
let customerId;
{
  const res = await api("POST", "/api/customers", {
    name: "E2E Test Customer",
    email: "e2e@example.com",
    farmName: "E2E Farm",
    location: "Testville",
    preferences: "DK weight, 2-ply",
  });
  ok("customer created", res.status === 201 && res.data.customer?.id);
  customerId = res.data.customer.id;

  const invalid = await api("POST", "/api/customers", { name: "", email: "bad" });
  ok("customer validation rejects bad input (400)", invalid.status === 400);

  const patched = await api("PATCH", `/api/customers/${customerId}`, { name: "E2E Test Customer", phone: "+91 90000 00000" });
  ok("customer updated", patched.status === 200 && patched.data.customer.phone === "+91 90000 00000");
}

// 4. Create order with 2 lots; select lots by fiberType (API returns
//    newest-first, so array order must not be relied on).
let orderId, orderNumber, merino, alpaca;
{
  const invalid = await api("POST", "/api/orders", { customerId, lots: [{ fiberType: "Merino Wool", greaseWeightG: -1 }] });
  ok("order validation rejects bad weight (400)", invalid.status === 400);

  const res = await api("POST", "/api/orders", {
    customerId,
    shearingDate: "2026-09-20",
    farmInfo: "E2E clip",
    targetProduct: "Yarn",
    yarnSpecs: "DK weight, 2-ply, Z twist",
    rush: true,
    notes: "e2e order",
    lots: [
      { fiberType: "Merino Wool", breed: "Merino", greaseWeightG: 5000, conditionGrade: "B", vmRating: "Low", color: "White" },
      { fiberType: "Huacaya Alpaca", greaseWeightG: 3000, conditionGrade: "A", vmRating: "None", color: "Brown" },
    ],
  });
  ok("order created with 2 lots", res.status === 201 && res.data.order?.id);
  orderId = res.data.order.id;
  orderNumber = res.data.order.orderNumber;

  const detail = await api("GET", `/api/customers/${customerId}`);
  const orderLots = detail.data.customer.lots.filter((l) => l.order.orderNumber === orderNumber);
  merino = orderLots.find((l) => l.fiberType === "Merino Wool");
  alpaca = orderLots.find((l) => l.fiberType === "Huacaya Alpaca");
  ok(
    "both lots persisted with codes",
    orderLots.length === 2 && Boolean(merino?.id && alpaca?.id) && orderLots.every((l) => l.lotCode.startsWith("LOT-"))
  );
  ok("merino lot starts at 5000 g", merino.currentWeightG === 5000);
}

// 5. QR lookup (the scanner path).
let lot1, intakeStageId;
{
  const res = await api("GET", `/api/lots/lookup?code=${merino.lotCode}`);
  ok("lookup by lot code works", res.status === 200 && res.data.lot.id === merino.id);
  ok("lookup exposes current stage", Boolean(res.data.lot.currentStage?.id));
  lot1 = res.data.lot;
  intakeStageId = lot1.currentStage.id;

  const missing = await api("GET", "/api/lots/lookup?code=LOT-NOPE00");
  ok("unknown lot code → 404 with helpful error", missing.status === 404 && String(missing.data.error).includes("No lot found"));
}

// 6. Stage events: machine field, abnormal loss auto-flags, idempotency,
//    wrong stage, undo.
{
  const evt = await api("POST", `/api/lots/${lot1.id}/events`, {
    stageId: intakeStageId,
    eventType: "COMPLETED",
    machine: "E2E Washer #1",
    inputWeightG: 5000,
    outputWeightG: 3500, // 30% loss at Intake (0% expected) → auto WEIGHT flag
    clientEventId: `e2e-evt-1-${RUN}`,
  });
  ok("stage event recorded with weight delta", evt.status === 200 && evt.data.weightDeltaG === -1500);

  const withMachine = await api("GET", `/api/lots/${lot1.id}`);
  ok(
    "machine recorded on the event",
    withMachine.data.lot.stageEvents.some((e) => e.machine === "E2E Washer #1")
  );

  const dupe = await api("POST", `/api/lots/${lot1.id}/events`, {
    stageId: intakeStageId,
    eventType: "COMPLETED",
    inputWeightG: 5000,
    outputWeightG: 3500,
    clientEventId: `e2e-evt-1-${RUN}`,
  });
  ok("duplicate clientEventId ignored (idempotent)", dupe.status === 200 && dupe.data.duplicate === true);

  const flags = await api("GET", "/api/quality-flags?status=OPEN");
  const auto = flags.data.flags.find((f) => f.lot.lotCode === lot1.lotCode && f.flagType === "WEIGHT");
  ok("abnormal weight loss auto-flagged", Boolean(auto && String(auto.notes).includes("Automatic alert")));

  const wrongStage = await api("POST", `/api/lots/${lot1.id}/events`, {
    stageId: intakeStageId, // same (old) stage — lot has already moved on
    eventType: "COMPLETED",
    inputWeightG: 3500,
  });
  ok("stale stage submission rejected (409)", wrongStage.status === 409);

  const after = await api("GET", `/api/lots/lookup?code=${lot1.lotCode}`);
  ok("lot advanced to next stage", after.data.lot.currentStage.id !== intakeStageId);

  const undo = await api("POST", `/api/lots/${lot1.id}/undo`);
  ok("undo last stage event", undo.status === 200);
  const restored = await api("GET", `/api/lots/lookup?code=${lot1.lotCode}`);
  ok(
    "undo restored stage & weight",
    restored.data.lot.currentStage.id === intakeStageId && restored.data.lot.currentWeightG === 5000
  );
}

// 7. Split: partial split keeps remainder on the parent.
let splitChildId;
{
  const res = await api("POST", "/api/lineage", {
    type: "SPLIT",
    parentId: lot1.id,
    children: [
      { weightG: 2000, notes: "e2e child A" },
      { weightG: 1500, notes: "e2e child B" },
    ],
  });
  ok("split created 2 children", res.status === 201 && res.data.childIds.length === 2);
  splitChildId = res.data.childIds[0];

  const parent = await api("GET", `/api/lots/${lot1.id}`);
  ok(
    "parent kept remainder and stayed active",
    parent.data.lot.currentWeightG === 1500 && parent.data.lot.status === "IN_PRODUCTION"
  );
  ok("parent has 2 descendant edges", parent.data.lot.children.length === 2);

  const over = await api("POST", "/api/lineage", {
    type: "SPLIT",
    parentId: lot1.id,
    children: [{ weightG: 9999 }, { weightG: 9999 }],
  });
  ok("split exceeding weight rejected (400)", over.status === 400);

  const child = await api("GET", `/api/lots/${splitChildId}`);
  ok(
    "child records ancestor lineage",
    child.data.lot.parents.length === 1 && child.data.lot.parents[0].parentLot.lotCode === lot1.lotCode
  );
}

// 8. Blend the remaining parent lot with the order's second lot.
let batchId;
{
  const res = await api("POST", "/api/lineage", {
    type: "BLEND",
    lotIds: [lot1.id, alpaca.id],
    fiberType: "Blend",
    notes: "e2e batch",
  });
  ok("blend created batch", res.status === 201 && Boolean(res.data.batchId));
  batchId = res.data.batchId;

  const batch = await api("GET", `/api/lots/${batchId}`);
  ok(
    "batch weighed from parents (1500 + 3000)",
    batch.data.lot.currentWeightG === 4500 && batch.data.lot.isBatch === true,
    `got ${batch.data.lot?.currentWeightG}`
  );
  ok("batch has 2 parent edges", batch.data.lot.parents.length === 2);
  ok("parents consumed", batch.data.lot.parents.every((p) => p.parentLot.status === "CONSUMED"));

  const single = await api("POST", "/api/lineage", { type: "BLEND", lotIds: [batchId] });
  ok("blend of a single lot rejected (400)", single.status === 400);
}

// 9. Quality flag lifecycle.
{
  const created = await api("POST", "/api/quality-flags", {
    lotId: splitChildId,
    flagType: "VM",
    severity: "HIGH",
    notes: "e2e flag",
  });
  ok("quality flag created", created.status === 201);
  const resolved = await api("PATCH", `/api/quality-flags/${created.data.flag.id}`, { status: "RESOLVED" });
  ok("quality flag resolved", resolved.status === 200 && resolved.data.flag.status === "RESOLVED");
}

// 10. Public customer tracking page: valid token shows the order, invalid
//     tokens show nothing.
{
  const detail = await api("GET", `/api/orders/${orderId}`);
  const token = detail.data.order.trackingToken;
  const page = await fetch(`${BASE}/track/${token}`);
  const html = await page.text();
  ok("tracking page renders order (200)", page.status === 200 && html.includes(orderNumber));
  ok("tracking page hides internal data (no workers, no internal notes)", !html.includes("Sam Carder") && !html.includes("Internal"));
  const invalid = await fetch(`${BASE}/track/INVALID-TOKEN`);
  ok(
    "invalid tracking token shows not-found page",
    invalid.status === 200 && (await invalid.text()).includes("not found")
  );
}

// 11. Worker role: can sign in, cannot configure stages or delete customers.
{
  const savedOwner = cookie;
  const login = await api("POST", "/api/auth/login", { email: "worker@smartfleece.local", password: "demo1234" });
  ok("worker can sign in", login.status === 200 && login.data.role === "WORKER");

  const stages = await api("POST", "/api/stages", { name: "Worker Stage" });
  ok("worker blocked from stage config (403)", stages.status === 403);

  const del = await api("DELETE", `/api/customers/${customerId}`);
  ok("worker blocked from deleting customers (403)", del.status === 403);

  cookie = savedOwner;
}

// 12. Complete every remaining active lot on the order → the order must
// auto-flip to READY_FOR_PICKUP and log an ORDER_READY notification.
{
  const getOrder = () => api("GET", `/api/orders/${orderId}`);
  const activeLots = (ord) =>
    ord.data.order.lots.filter((l) => ["PENDING", "IN_PRODUCTION"].includes(l.status) && l.currentStageId);

  let ord = await getOrder();
  ok("order still IN_PRODUCTION while children/batch are active", ord.data.order.status === "IN_PRODUCTION");

  let guard = 0;
  let loopError = null;
  // Transient-500 retry: this project sits in an OneDrive-synced folder, and
  // OneDrive occasionally truncates a .next dev-cache manifest mid-write
  // during request bursts (server returns a 500 HTML page from loadManifest).
  // Production `next start` is unaffected (manifests load once at boot).
  // Retry once with a fresh idempotency key rather than masking real errors.
  const postEvent = async (lot, n) => {
    let res = await api("POST", `/api/lots/${lot.id}/events`, {
      stageId: lot.currentStageId,
      eventType: "COMPLETED",
      inputWeightG: lot.currentWeightG,
      outputWeightG: Math.max(1, Math.round(lot.currentWeightG * 0.99)),
      clientEventId: `e2e-finish-${RUN}-${lot.id}-${n}`,
    });
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await api("POST", `/api/lots/${lot.id}/events`, {
        stageId: lot.currentStageId,
        eventType: "COMPLETED",
        inputWeightG: lot.currentWeightG,
        outputWeightG: Math.max(1, Math.round(lot.currentWeightG * 0.99)),
        clientEventId: `e2e-finish-${RUN}-${lot.id}-${n}-r`,
      });
    }
    return res;
  };
  while (activeLots(ord).length > 0 && guard < 100) {
    for (const lot of activeLots(ord)) {
      const res = await postEvent(lot, guard);
      if (res.status !== 200) {
        loopError = `${lot.lotCode}: ${res.status} ${typeof res.data === "string" ? "server error" : JSON.stringify(res.data)}`;
        break;
      }
    }
    if (loopError) break;
    ord = await getOrder();
    guard++;
  }
  ok("all remaining lots completed", !loopError && activeLots(ord).length === 0, loopError ?? "");
  ok("order auto-recalculated to READY_FOR_PICKUP", ord.data.order.status === "READY_FOR_PICKUP", `got ${ord.data.order.status}`);
  ok(
    "ORDER_READY notification logged for the customer",
    ord.data.order.notifications.some((n) => n.event === "ORDER_READY")
  );

  const track = await fetch(`${BASE}/track/${ord.data.order.trackingToken}`);
  const html = await track.text();
  ok("tracking page now shows ready state", track.status === 200 && html.includes("Ready for pickup"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
