import { prisma } from "@/lib/db";
import { getStages } from "@/lib/production";
import { getPricingConfig } from "@/lib/invoice";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtWeight } from "@/lib/format";

export const dynamic = "force-dynamic";

const ORDER_LABELS: Record<string, string> = {
  RECEIVED: "Received at the mill",
  IN_PRODUCTION: "In production",
  READY_FOR_PICKUP: "Ready for pickup! 🎉",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Public customer tracking page. Access is by unguessable per-order token
 * only — no customer data in the URL, no cross-order access. Shows only
 * customer-appropriate information (no worker names, internal notes, or
 * unresolved quality details).
 */
export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { trackingToken: token },
    include: {
      lots: {
        orderBy: { createdAt: "asc" },
        include: {
          stageEvents: { where: { revertedAt: null }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!order || order.status === "CANCELLED") {
    return (
      <Shell>
        <div className="card p-8 text-center">
          <p className="text-3xl mb-2">🐑</p>
          <h1 className="text-lg font-bold text-ink">Tracking link not found</h1>
          <p className="text-sm text-muted mt-1">
            This link is invalid or the order was cancelled. Contact the mill for your current status.
          </p>
        </div>
      </Shell>
    );
  }

  const [stages, pricingRow, invoice] = await Promise.all([
    getStages(),
    getPricingConfig(),
    prisma.invoice.findUnique({
      where: { orderId: order.id },
      select: { invoiceNumber: true, totalMinor: true, paidMinor: true, status: true },
    }),
  ]);
  const currency = { currencyCode: pricingRow.currencyCode, currencySymbol: pricingRow.currencySymbol };
  const fiberTypes = [...new Set(order.lots.map((l) => l.fiberType))];
  const intakeG = order.lots.reduce((acc, l) => acc + l.greaseWeightG, 0);
  const currentG = order.lots.reduce((acc, l) => acc + l.currentWeightG, 0);
  const allDone = order.lots.length > 0 && order.lots.every((l) => l.status === "COMPLETED" || l.status === "CONSUMED");

  return (
    <Shell>
      <div className="space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Order</p>
              <h1 className="text-2xl font-bold text-ink">{order.orderNumber}</h1>
              <p className="text-sm text-muted mt-1">
                Received {fmtDate(order.orderDate)}
                {order.targetProduct ? ` · finishing as ${order.targetProduct.toLowerCase()}` : ""}
              </p>
            </div>
            <span
              className={`badge ${
                order.status === "READY_FOR_PICKUP" || order.status === "COMPLETED"
                  ? "bg-forest-soft text-forest-dark"
                  : "bg-amber-soft text-amber"
              }`}
            >
              {ORDER_LABELS[order.status] ?? order.status}
            </span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Fiber</dt>
              <dd className="text-sm text-ink mt-0.5">{fiberTypes.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Bags tracked</dt>
              <dd className="text-sm text-ink mt-0.5">{order.lots.length}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Intake weight</dt>
              <dd className="text-sm text-ink mt-0.5">{fmtWeight(intakeG)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Current weight</dt>
              <dd className="text-sm text-ink mt-0.5">{fmtWeight(currentG)}</dd>
            </div>
          </dl>
          {order.estimatedCompletion ? (
            <p className="text-sm bg-forest-soft text-forest-dark rounded-lg px-3 py-2 mt-4">
              📅 Estimated completion: {fmtDate(order.estimatedCompletion)}
              {order.etaConfidenceDays ? ` (±${order.etaConfidenceDays} day${order.etaConfidenceDays > 1 ? "s" : ""})` : ""}
              {order.etaBasedOnSamples ? (
                <span className="block text-xs mt-0.5 opacity-80">
                  Based on this mill's actual processing history for {order.etaBasedOnSamples} stage events — updated as your fiber moves.
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {invoice ? (
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Invoice {invoice.invoiceNumber}</p>
                <p className="text-sm text-ink mt-1">
                  Total <strong>{formatMoney(invoice.totalMinor, currency)}</strong>
                  {invoice.paidMinor > 0 ? (
                    <>
                      {" "}· paid <strong>{formatMoney(invoice.paidMinor, currency)}</strong>
                    </>
                  ) : null}{" "}
                  · due <strong>{formatMoney(Math.max(0, invoice.totalMinor - invoice.paidMinor), currency)}</strong>{" "}
                  <span className="text-muted">(payable at pickup)</span>
                </p>
              </div>
              <span
                className={`badge ${
                  invoice.status === "PAID" ? "bg-forest-soft text-forest-dark" : "bg-amber-soft text-amber"
                }`}
              >
                {invoice.status === "PAID" ? "paid ✓" : invoice.status === "PARTIAL" ? "partially paid" : "due at pickup"}
              </span>
            </div>
          </div>
        ) : null}

        {order.lots.map((lot) => {
          const currentIdx = stages.findIndex((s) => s.id === lot.currentStageId);
          return (
            <div key={lot.id} className="card p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-bold text-ink">{lot.lotCode}</h2>
                <span className="text-sm text-muted">
                  {lot.status === "COMPLETED"
                    ? "✅ Finished"
                    : lot.status === "CONSUMED"
                      ? "🧺 Combined into a processing batch"
                      : lot.currentStageId && stages[currentIdx]
                        ? `Currently at: ${stages[currentIdx].name}`
                        : "Waiting"}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {lot.fiberType}
                {lot.color ? ` · ${lot.color.toLowerCase()}` : ""} · {fmtWeight(lot.greaseWeightG)} at intake →{" "}
                {fmtWeight(lot.currentWeightG)} now
              </p>
              <ol className="mt-3 space-y-1">
                {stages.map((stage, idx) => {
                  const event = lot.stageEvents.find((e) => e.stageId === stage.id);
                  const isCurrent = lot.status !== "COMPLETED" && lot.currentStageId === stage.id;
                  const state = event ? "done" : isCurrent ? "current" : "todo";
                  return (
                    <li
                      key={stage.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${
                        state === "current" ? "bg-forest-soft" : state === "done" ? "bg-cream/70" : ""
                      }`}
                    >
                      <span aria-hidden className="w-5 text-center">
                        {state === "done" ? (event!.eventType === "SKIPPED" ? "⏭" : "✅") : state === "current" ? "🔄" : "⚪"}
                      </span>
                      <span className={`flex-1 ${state === "todo" ? "text-muted" : "text-ink"}`}>
                        {stage.name}
                        {stage.optional && state === "todo" ? <span className="text-muted"> (optional)</span> : null}
                      </span>
                      {event ? (
                        <span className="text-xs text-muted whitespace-nowrap">
                          {fmtDateTime(event.createdAt)}
                          {event.outputWeightG !== null ? ` · ${fmtWeight(event.outputWeightG)}` : ""}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}

        {allDone ? (
          <p className="text-center text-sm text-forest-dark">
            ✅ Quality checked and approved — your fiber is ready. Thank you for trusting the mill!
          </p>
        ) : (
          <p className="text-center text-xs text-muted">
            This page updates automatically as your fiber moves through the mill. Bookmark it and check back any time.
          </p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <span className="text-3xl" aria-hidden>
            🐑
          </span>
          <p className="font-bold text-ink">SmartFleece</p>
          <p className="text-xs text-muted">Fiber tracking — every gram has a story</p>
        </div>
        {children}
      </div>
    </div>
  );
}
