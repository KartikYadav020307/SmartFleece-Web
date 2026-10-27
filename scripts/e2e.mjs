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
  const doFetch = () =>
    fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
  let res = await doFetch();
  if (res.status >= 500) {
    // Transient dev-manifest 500 (OneDrive sync race) — retry once.
    await new Promise((r) => setTimeout(r, 1500));
    res = await doFetch();
  }
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

// Page fetch with retries: this OneDrive-synced folder can transiently
// truncate .next dev manifests under request bursts (500 from loadManifest),
// especially on a route's first compile. Production is unaffected.
async function fetchPage(path, headers) {
  let res = await fetch(path, { headers, redirect: "manual" });
  for (let attempt = 0; res.status >= 500 && attempt < 3; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await fetch(path, { headers, redirect: "manual" });
  }
  return res;
}

// React SSR inserts <!-- --> markers between adjacent text expressions, so
// rendered strings like "2× Merino Wool" are split in raw HTML. Strip them
// before substring assertions.
const textOf = (html) => html.replaceAll(/<!--.*?-->/g, "");

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
  const page = await fetchPage(BASE + "/dashboard", { Cookie: cookie });
  const html = await page.text();
  ok("dashboard renders (200)", page.status === 200, `status=${page.status} len=${html.length} cookie=${cookie ? "set" : "EMPTY"}`);
  ok("dashboard shows kanban + stats", html.includes("Production Kanban") && html.includes("Order Status Distribution"), `len=${html.length}`);

  // Pre-warm the remaining staff pages while the server is idle, so their
  // first dev-mode compilation doesn't collide with later request bursts.
  for (const warm of ["/invoices", "/reports", "/quality", "/production", "/settings", "/lots", "/orders", "/customers"]) {
    await fetchPage(BASE + warm, { Cookie: cookie });
  }
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
// Pricing is configured first so the auto-generated invoice uses known rates.
{
  const pricing = await api("PUT", "/api/settings/pricing", {
    currencyCode: "INR",
    currencySymbol: "₹",
    taxLabel: "GST",
    taxRatePct: 5,
    rushMultiplier: 1.2,
    minimumOrderFeeMajor: 0,
    defaultRateMajorPerKg: 250,
    baseRatesMajorPerKg: { "Merino Wool": 300 },
  });
  ok("owner can configure pricing", pricing.status === 200);

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

  const track = await fetchPage(`${BASE}/track/${ord.data.order.trackingToken}`);
  const html = await track.text();
  ok("tracking page now shows ready state", track.status === 200 && html.includes("Ready for pickup"));
}

// 13. Invoicing: auto-generated on completion, correct math from configured
// rates, payment lifecycle, and role/overpayment guards.
{
  const roundMinor = (x) => Math.floor(x + 0.5);
  const RATE = { "Merino Wool": 30000, default: 25000 };
  const TAX_PCT = 5;
  const RUSH = 1.2;

  const ord = await api("GET", `/api/orders/${orderId}`);
  const active = ord.data.order.lots.filter((l) => !["CONSUMED", "CANCELLED"].includes(l.status));
  const expectedBillable = active.reduce((acc, l) => acc + l.currentWeightG, 0);
  const expectedProcessing = active.reduce(
    (acc, l) => acc + roundMinor((l.currentWeightG / 1000) * (RATE[l.fiberType] ?? RATE.default)),
    0
  );
  const expectedRush = roundMinor(expectedProcessing * (RUSH - 1));
  const expectedSubtotal = expectedProcessing + expectedRush;
  const expectedTax = roundMinor(expectedSubtotal * (TAX_PCT / 100));
  const expectedTotal = expectedSubtotal + expectedTax;

  const list = await api("GET", "/api/invoices");
  const inv = list.data.invoices.find((i) => i.order.orderNumber === orderNumber);
  ok("invoice auto-generated on order completion", Boolean(inv));
  ok("invoice status UNPAID", inv?.status === "UNPAID");
  ok(
    "billable weight = current weights of non-consumed lots",
    inv?.billableWeightG === expectedBillable,
    `got ${inv?.billableWeightG}, expected ${expectedBillable}`
  );
  const lines = JSON.parse(inv.lineItemsJson);
  ok(
    "one processing line per billable lot at the configured rate",
    lines.filter((l) => l.kind === "processing").length === active.length &&
      lines.every((l) => l.kind !== "processing" || l.rateMinorPerKg === (RATE[l.fiberType] ?? RATE.default))
  );
  ok("rush surcharge line present (order is rush)", lines.some((l) => l.kind === "rush"));
  ok(
    "subtotal/tax/total match independent calculation",
    inv.subtotalMinor === expectedSubtotal && inv.taxMinor === expectedTax && inv.totalMinor === expectedTotal,
    `got ${inv.subtotalMinor}/${inv.taxMinor}/${inv.totalMinor}, expected ${expectedSubtotal}/${expectedTax}/${expectedTotal}`
  );
  ok("tax labeled GST at 5%", inv.taxLabel === "GST" && inv.taxRatePct === 5);

  // Payment lifecycle (owner).
  const firstPayment = Math.floor(inv.totalMinor * 0.4);
  const pay1 = await api("POST", `/api/invoices/${inv.id}/payments`, {
    amountMajor: firstPayment / 100,
    method: "UPI",
    reference: "e2e-upi-1",
  });
  ok("partial payment recorded → PARTIAL", pay1.status === 201 && pay1.data.invoice.status === "PARTIAL");

  const overpay = await api("POST", `/api/invoices/${inv.id}/payments`, {
    amountMajor: (inv.totalMinor - firstPayment) / 100 + 1000,
  });
  ok("overpayment rejected (400)", overpay.status === 400);

  const pay2 = await api("POST", `/api/invoices/${inv.id}/payments`, {
    amountMajor: (inv.totalMinor - firstPayment) / 100,
    method: "Cash",
  });
  ok("final payment recorded → PAID", pay2.status === 201 && pay2.data.invoice.status === "PAID");

  const regen = await api("POST", `/api/invoices/${inv.id}/regenerate`);
  ok("regenerate blocked after payment (409)", regen.status === 409);
  const extra = await api("POST", `/api/invoices/${inv.id}/extras`, {
    description: "late dyeing",
    amountMajor: 100,
  });
  ok("extra charge blocked after payment (409)", extra.status === 409);

  const detail = await api("GET", `/api/invoices/${inv.id}`);
  ok(
    "invoice detail shows both payments with attribution",
    detail.status === 200 &&
      detail.data.invoice.payments.length === 2 &&
      detail.data.invoice.payments.every((p) => p.recordedBy === "Asha Kapoor")
  );

  // Guards for worker role and invoices/reports/tracking pages.
  const savedOwner = cookie;
  await api("POST", "/api/auth/login", { email: "worker@smartfleece.local", password: "demo1234" });
  const workerPay = await api("POST", `/api/invoices/${inv.id}/payments`, { amountMajor: 1 });
  ok("worker blocked from recording payments (403)", workerPay.status === 403);
  const workerPricing = await api("PUT", "/api/settings/pricing", {
    currencyCode: "INR",
    currencySymbol: "₹",
    taxLabel: "GST",
    taxRatePct: 5,
    rushMultiplier: 1,
    minimumOrderFeeMajor: 0,
    defaultRateMajorPerKg: 1,
    baseRatesMajorPerKg: {},
  });
  ok("worker blocked from changing pricing (403)", workerPricing.status === 403);
  cookie = savedOwner;

  const invoicesPage = await fetchPage(`${BASE}/invoices`, { Cookie: cookie });
  const invoicesHtml = await invoicesPage.text();
  ok(
    "invoices page renders with the invoice",
    invoicesPage.status === 200 && invoicesHtml.includes(inv.invoiceNumber),
    `status=${invoicesPage.status} len=${invoicesHtml.length} hasNum=${invoicesHtml.includes(inv.invoiceNumber)}`
  );

  const reportsPage = await fetchPage(`${BASE}/reports`, { Cookie: cookie });
  const reportsHtml = await reportsPage.text();
  ok(
    "reports page renders collected revenue",
    reportsPage.status === 200 && reportsHtml.includes("Collected revenue"),
    `status=${reportsPage.status} len=${reportsHtml.length}`
  );

  const trackingPage = await fetchPage(`${BASE}/track/${ord.data.order.trackingToken}`);
  const trackingHtml = await trackingPage.text();
  ok(
    "tracking page shows the invoice amount due with configured currency",
    trackingPage.status === 200 && trackingHtml.includes("₹") && trackingHtml.includes("payable at pickup")
  );
}

// 14. Phase 3 intelligence: machine registry, machineId on stage events,
// rule-based ETA, delay logging, batch suggestions, customer fiber history.
{
  const create1 = await api("POST", "/api/machines", { name: "E2E Carder", type: "Carder", capacityKg: 9 });
  ok("machine created by owner", create1.status === 201);
  const machineId = create1.data.machine.id;

  const savedOwner = cookie;
  await api("POST", "/api/auth/login", { email: "worker@smartfleece.local", password: "demo1234" });
  const workerMachine = await api("POST", "/api/machines", { name: "Nope", type: "Carder" });
  ok("worker blocked from creating machines (403)", workerMachine.status === 403);
  const workerList = await api("GET", "/api/machines");
  ok("worker can list machines", workerList.status === 200);
  cookie = savedOwner;

  // Fresh order with two similar queued lots → ETA + suggestions material.
  const order2res = await api("POST", "/api/orders", {
    customerId,
    targetProduct: "Yarn",
    lots: [
      { fiberType: "Merino Wool", breed: "Merino", greaseWeightG: 2000, color: "White" },
      { fiberType: "Merino Wool", breed: "Merino", greaseWeightG: 2000, color: "White" },
    ],
  });
  ok("second order created", order2res.status === 201);
  const order2 = order2res.data.order;

  const cust = await api("GET", `/api/customers/${customerId}`);
  const newLots = cust.data.customer.lots.filter((l) => l.order.orderNumber === order2.orderNumber);
  const lotA = newLots.find((l) => l.currentWeightG === 2000);

  // Record a stage event through the registry machine.
  const lookupA = await api("GET", `/api/lots/lookup?code=${lotA.lotCode}`);
  const evt = await api("POST", `/api/lots/${lotA.id}/events`, {
    stageId: lookupA.data.lot.currentStage.id,
    eventType: "COMPLETED",
    machineId,
    inputWeightG: 2000,
    outputWeightG: 1900,
    clientEventId: `e2e-mach-${RUN}`,
  });
  ok("stage event recorded with registry machine", evt.status === 200);

  const lotDetail = await api("GET", `/api/lots/${lotA.id}`);
  ok(
    "event links to the machine registry entry",
    lotDetail.data.lot.stageEvents.some((e) => e.machineId === machineId)
  );

  // Rule-based ETA on the order after an event.
  let ord2 = await api("GET", `/api/orders/${order2.id}`);
  ok(
    "ETA populated from stage history",
    Boolean(ord2.data.order.estimatedCompletion) && (ord2.data.order.etaBasedOnSamples ?? 0) > 0,
    `eta=${ord2.data.order.estimatedCompletion} samples=${ord2.data.order.etaBasedOnSamples}`
  );

  // Delay logging shifts the ETA and notifies the customer.
  const oldEta = new Date(ord2.data.order.estimatedCompletion).getTime();
  const delay = await api("POST", `/api/orders/${order2.id}/delay`, {
    reason: "MACHINE_BREAKDOWN",
    extraDays: 2,
    notes: "e2e delay",
  });
  ok("delay logged", delay.status === 200);
  ord2 = await api("GET", `/api/orders/${order2.id}`);
  const newEta = new Date(ord2.data.order.estimatedCompletion).getTime();
  ok("delay pushed the ETA out", newEta >= oldEta + 2 * 86_400_000 - 60_000, `${oldEta} → ${newEta}`);
  ok(
    "DELAY notification recorded for the customer",
    ord2.data.order.notifications.some((n) => n.event === "DELAY")
  );

  // Production page: utilization + batch suggestion + bottleneck hint.
  const prodPage = await fetchPage(`${BASE}/production`, { Cookie: cookie });
  const prodText = textOf(await prodPage.text());
  ok("production page renders utilization", prodPage.status === 200 && prodText.includes("Machine Utilization") && prodText.includes("E2E Carder"));
  ok("utilization counts the machine-processed kg", prodText.includes("1.9 kg"), `has1.9=${prodText.includes("1.9")}`);
  ok(
    "batch suggestion groups the two queued Merino lots",
    prodText.includes("Batch Planning Suggestions") && /\d+× Merino Wool/.test(prodText),
    `hasCard=${prodText.includes("Batch Planning Suggestions")} hasGroup=${/\d+× Merino Wool/.test(prodText)}`
  );

  // Machine guards: history blocks delete; status edit works.
  const delUsed = await api("DELETE", `/api/machines/${machineId}`);
  ok("deleting a machine with history rejected (409)", delUsed.status === 409);
  const patchMach = await api("PATCH", `/api/machines/${machineId}`, { status: "MAINTENANCE" });
  ok("machine status updated", patchMach.status === 200 && patchMach.data.machine.status === "MAINTENANCE");

  // Tracking page shows the ETA with ± confidence.
  const track2 = await fetchPage(`${BASE}/track/${ord2.data.order.trackingToken}`);
  const track2Html = await track2.text();
  ok(
    "tracking page shows ETA with ± confidence",
    track2.status === 200 && track2Html.includes("Estimated completion") && track2Html.includes("±")
  );

  // Customer fiber history across seasons (seed supplies the 2025 clip).
  const custPage = await fetchPage(`${BASE}/customers/${customerId}`, { Cookie: cookie });
  const custText = textOf(await custPage.text());
  ok(
    "customer page renders fiber history",
    custPage.status === 200 && custText.includes("Fiber History Across Seasons") && /\d{4}/.test(custText),
    `status=${custPage.status} hasTitle=${custText.includes("Fiber History Across Seasons")} hasYear=${/\d{4}/.test(custText)}`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

