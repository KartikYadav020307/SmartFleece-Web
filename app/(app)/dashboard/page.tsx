import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, LotStatusBadge, OrderStatusBadge, PageHeader, StatCard, Badge } from "@/components/ui";
import { fmtWeight, fmtDateTime, timeAtStage } from "@/lib/format";
import { STALL_DAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();

  const [orders, lots, openFlags, recentEvents, stages] = await Promise.all([
    prisma.order.findMany({ include: { customer: { select: { name: true } } } }),
    prisma.fiberLot.findMany({
      where: { status: { in: ["PENDING", "IN_PRODUCTION", "ON_HOLD"] } },
      include: {
        customer: { select: { name: true } },
        order: { select: { orderNumber: true } },
        currentStage: true,
        stageEvents: { where: { revertedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { qualityFlags: { where: { status: "OPEN" } } } },
      },
    }),
    prisma.qualityFlag.findMany({
      where: { status: "OPEN" },
      include: { lot: { select: { id: true, lotCode: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.stageEvent.findMany({
      where: { revertedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        lot: { include: { order: { select: { orderNumber: true } } } },
        stage: { select: { name: true } },
        worker: { select: { name: true } },
      },
    }),
    prisma.stage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } }),
  ]);

  const activeOrders = orders.filter((o) => o.status === "RECEIVED" || o.status === "IN_PRODUCTION");
  const completedOrders = orders.filter((o) => o.status === "COMPLETED" || o.status === "READY_FOR_PICKUP");
  const monthStart = new Date();
  monthStart.setDate(1);
  const completedThisMonth = completedOrders.filter((o) => o.updatedAt >= monthStart).length;

  const stalled = lots.filter((lot) => {
    const last = lot.stageEvents[0]?.createdAt ?? lot.createdAt;
    return (Date.now() - new Date(last).getTime()) / 86_400_000 >= STALL_DAYS;
  });

  const statusDist = ["RECEIVED", "IN_PRODUCTION", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"].map(
    (status) => ({ status, count: orders.filter((o) => o.status === status).length })
  );
  const maxDist = Math.max(1, ...statusDist.map((s) => s.count));

  const lotsByStage = new Map<string, typeof lots>();
  for (const stage of stages) lotsByStage.set(stage.id, []);
  const unassigned: typeof lots = [];
  for (const lot of lots) {
    if (lot.currentStageId && lotsByStage.has(lot.currentStageId)) {
      lotsByStage.get(lot.currentStageId)!.push(lot);
    } else {
      unassigned.push(lot);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Live view of production, straight from the mill floor."
        actions={
          <>
            <Link href="/scan" className="btn-secondary">
              📷 Scan
            </Link>
            <Link href="/orders/new" className="btn-primary">
              + New Order
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Orders" value={activeOrders.length} hint="received or in production" />
        <StatCard label="Lots in Production" value={lots.length} hint="pending, active or on hold" />
        <StatCard label="Completed Orders" value={completedOrders.length} hint={`${completedThisMonth} finished this month`} />
        <StatCard
          label="Needs Attention"
          value={openFlags.length + stalled.length}
          hint={`${openFlags.length} quality flags · ${stalled.length} stalled lots`}
        />
      </div>

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders yet"
            description="Create your first customer and order — every bag of fiber gets a QR code and a full production history."
            action={
              <Link href="/orders/new" className="btn-primary">
                Create the first order
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Order Status Distribution" className="lg:col-span-1">
              <div className="space-y-2.5">
                {statusDist.map((s) => (
                  <div key={s.status} className="flex items-center gap-2">
                    <span className="text-xs text-muted w-36 capitalize">
                      {s.status.replaceAll("_", " ").toLowerCase()}
                    </span>
                    <div className="flex-1 h-2.5 bg-cream rounded-full overflow-hidden">
                      <div
                        className="h-full bg-forest rounded-full"
                        style={{ width: `${(s.count / maxDist) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-ink w-6 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Lots Needing Attention" className="lg:col-span-2">
              {openFlags.length === 0 && stalled.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Nothing needs attention right now 🎉</p>
              ) : (
                <ul className="divide-y divide-line">
                  {openFlags.slice(0, 5).map((flag) => (
                    <li key={flag.id} className="flex items-center gap-3 py-2">
                      <Badge variant="clay">flag</Badge>
                      <Link href={`/lots/${flag.lot.id}`} className="text-sm font-medium text-forest hover:underline">
                        {flag.lot.lotCode}
                      </Link>
                      <span className="text-sm text-muted truncate flex-1">
                        {flag.flagType} · {flag.notes ?? "no details"}
                      </span>
                    </li>
                  ))}
                  {stalled.slice(0, 5).map((lot) => (
                    <li key={lot.id} className="flex items-center gap-3 py-2">
                      <Badge variant="amber">stalled</Badge>
                      <Link href={`/lots/${lot.id}`} className="text-sm font-medium text-forest hover:underline">
                        {lot.lotCode}
                      </Link>
                      <span className="text-sm text-muted truncate flex-1">
                        {timeAtStage(lot.stageEvents[0]?.createdAt ?? lot.createdAt)} at{" "}
                        {lot.currentStage?.name ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card
            title="Production Kanban"
            description="Lots by current stage"
            padded={false}
            actions={
              <Link href="/production" className="text-xs text-forest hover:underline font-medium">
                Table view →
              </Link>
            }
          >
            <div className="flex gap-3 overflow-x-auto p-4">
              {stages.map((stage) => {
                const stageLots = lotsByStage.get(stage.id) ?? [];
                return (
                  <div key={stage.id} className="w-60 shrink-0">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-xs font-semibold text-ink truncate">
                        {stage.name}
                        {stage.optional ? <span className="text-muted font-normal"> (opt)</span> : null}
                      </p>
                      <span className="text-[11px] text-muted">{stageLots.length}</span>
                    </div>
                    <div className="space-y-2 min-h-16 rounded-lg bg-cream/60 border border-line/60 p-2">
                      {stageLots.length === 0 ? (
                        <p className="text-[11px] text-muted text-center pt-2">—</p>
                      ) : (
                        stageLots.map((lot) => (
                          <Link
                            key={lot.id}
                            href={`/lots/${lot.id}`}
                            className="block bg-white border border-line rounded-lg p-2.5 hover:border-forest hover:shadow-sm transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-ink">{lot.lotCode}</span>
                              {lot._count.qualityFlags > 0 ? <span title="Open quality flag">🚩</span> : null}
                            </div>
                            <p className="text-[11px] text-muted truncate mt-0.5">
                              {lot.customer.name} · {lot.order.orderNumber}
                            </p>
                            <p className="text-[11px] text-muted mt-0.5">
                              {fmtWeight(lot.currentWeightG)} · {timeAtStage(lot.stageEvents[0]?.createdAt ?? lot.createdAt)} here
                            </p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Recent Stage Events" padded={false}>
            {recentEvents.length === 0 ? (
              <EmptyState icon="🏭" title="No stage events yet" description="Events appear here as workers scan and process lots." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">When</th>
                      <th className="th">Lot</th>
                      <th className="th">Stage</th>
                      <th className="th">Worker</th>
                      <th className="th">Weights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((event) => {
                      const delta =
                        event.outputWeightG !== null && event.inputWeightG !== null
                          ? event.outputWeightG - event.inputWeightG
                          : null;
                      return (
                        <tr key={event.id} className="hover:bg-cream/60">
                          <td className="td whitespace-nowrap text-muted">{fmtDateTime(event.createdAt)}</td>
                          <td className="td">
                            <Link href={`/lots/${event.lot.id}`} className="font-semibold text-forest hover:underline">
                              {event.lot.lotCode}
                            </Link>
                          </td>
                          <td className="td">
                            {event.stage.name}
                            {event.eventType === "SKIPPED" ? (
                              <span className="text-muted text-xs"> (skipped)</span>
                            ) : null}
                          </td>
                          <td className="td text-muted">{event.worker?.name ?? "—"}</td>
                          <td className="td text-muted whitespace-nowrap">
                            {event.inputWeightG !== null ? fmtWeight(event.inputWeightG) : "—"} →{" "}
                            {event.outputWeightG !== null ? fmtWeight(event.outputWeightG) : "—"}
                            {delta !== null ? (
                              <span className={delta < -1 ? " text-clay" : " text-muted"}>
                                {" "}
                                ({delta > 0 ? "+" : ""}
                                {fmtWeight(delta)})
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
