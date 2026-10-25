import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, EmptyState, LotStatusBadge, PageHeader } from "@/components/ui";
import { fmtWeight, timeAtStage } from "@/lib/format";
import { STALL_DAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** The production floor view: every lot currently moving through the mill. */
export default async function ProductionPage() {
  await requireUser();

  const lots = await prisma.fiberLot.findMany({
    where: { status: { in: ["PENDING", "IN_PRODUCTION", "ON_HOLD"] } },
    orderBy: [{ currentStage: { sequence: "asc" } }, { updatedAt: "desc" }],
    include: {
      customer: { select: { name: true } },
      order: { select: { orderNumber: true, rush: true } },
      currentStage: true,
      stageEvents: { where: { revertedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { qualityFlags: { where: { status: "OPEN" } } } },
    },
  });

  const byStage = new Map<string, typeof lots>();
  for (const lot of lots) {
    const key = lot.currentStage?.name ?? "No stage";
    byStage.set(key, [...(byStage.get(key) ?? []), lot]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Floor"
        description={`${lots.length} lots on the floor right now.`}
        actions={
          <Link href="/scan" className="btn-primary">
            📷 Scan & record stage
          </Link>
        }
      />

      {lots.length === 0 ? (
        <Card>
          <EmptyState
            icon="🏭"
            title="The floor is clear"
            description="No lots are in production. Lots appear here as soon as an order is received."
            action={
              <Link href="/orders/new" className="btn-primary">
                Receive an order
              </Link>
            }
          />
        </Card>
      ) : (
        [...byStage.entries()].map(([stageName, stageLots]) => (
          <Card key={stageName} title={`${stageName} — ${stageLots.length} lot${stageLots.length > 1 ? "s" : ""}`} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Lot</th>
                    <th className="th">Order</th>
                    <th className="th">Customer</th>
                    <th className="th">Fiber</th>
                    <th className="th">Current weight</th>
                    <th className="th">Time here</th>
                    <th className="th">Status</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {stageLots.map((lot) => {
                    const last = lot.stageEvents[0]?.createdAt ?? lot.createdAt;
                    const stalled = (Date.now() - new Date(last).getTime()) / 86_400_000 >= STALL_DAYS;
                    return (
                      <tr key={lot.id} className={`hover:bg-cream/60 ${stalled ? "bg-amber-soft/40" : ""}`}>
                        <td className="td">
                          <Link href={`/lots/${lot.id}`} className="font-semibold text-forest hover:underline">
                            {lot.lotCode}
                          </Link>
                          {lot._count.qualityFlags > 0 ? <span className="ml-1.5">🚩</span> : null}
                        </td>
                        <td className="td text-muted">
                          {lot.order.orderNumber}
                          {lot.order.rush ? <span className="ml-1 text-xs font-bold text-clay">RUSH</span> : null}
                        </td>
                        <td className="td text-muted">{lot.customer.name}</td>
                        <td className="td text-muted">{lot.fiberType}</td>
                        <td className="td text-muted">{fmtWeight(lot.currentWeightG)}</td>
                        <td className="td">
                          {stalled ? <Badge variant="amber">stalled · {timeAtStage(last)}</Badge> : <span className="text-muted">{timeAtStage(last)}</span>}
                        </td>
                        <td className="td">
                          <LotStatusBadge status={lot.status} />
                        </td>
                        <td className="td">
                          <Link href={`/scan?code=${lot.lotCode}`} className="btn-secondary btn-sm">
                            Record stage
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
