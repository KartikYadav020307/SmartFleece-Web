import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, EmptyState, LotStatusBadge, PageHeader } from "@/components/ui";
import { fmtWeight, timeAtStage } from "@/lib/format";
import { STALL_DAYS } from "@/lib/constants";
import { groupBatchCandidates, machineUtilization } from "@/lib/insights";

export const dynamic = "force-dynamic";

/** The production floor view: every lot currently moving through the mill. */
export default async function ProductionPage() {
  await requireUser();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [lots, machines, machineEvents] = await Promise.all([
    prisma.fiberLot.findMany({
      where: { status: { in: ["PENDING", "IN_PRODUCTION", "ON_HOLD"] } },
      orderBy: [{ currentStage: { sequence: "asc" } }, { updatedAt: "desc" }],
      include: {
        customer: { select: { name: true } },
        order: { select: { orderNumber: true, rush: true } },
        currentStage: { select: { name: true, sequence: true } },
        stageEvents: { where: { revertedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { qualityFlags: { where: { status: "OPEN" } } } },
      },
    }),
    prisma.machine.findMany({ orderBy: { name: "asc" } }),
    prisma.stageEvent.findMany({
      where: { machineId: { not: null }, outputWeightG: { not: null }, revertedAt: null, createdAt: { gte: sevenDaysAgo } },
      select: { machineId: true, outputWeightG: true, createdAt: true },
    }),
  ]);

  const byStage = new Map<string, typeof lots>();
  for (const lot of lots) {
    const key = lot.currentStage?.name ?? "No stage";
    byStage.set(key, [...(byStage.get(key) ?? []), lot]);
  }

  // Spec 7.2: machine utilization + the busiest-stage bottleneck hint.
  const utilization = machineUtilization(
    machines.map((m) => ({ id: m.id, name: m.name, type: m.type, status: m.status, isActive: m.isActive })),
    machineEvents
  );
  const bottleneck = [...byStage.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  // Spec 7.3: lots queued before Carding that could share a processing run.
  const suggestions = groupBatchCandidates(
    lots.map((lot) => ({
      id: lot.id,
      lotCode: lot.lotCode,
      fiberType: lot.fiberType,
      color: lot.color,
      currentWeightG: lot.currentWeightG,
      stageSequence: lot.currentStage?.sequence ?? 0,
    }))
  ).slice(0, 3);

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

      <div className="grid lg:grid-cols-2 gap-4">
        <Card
          title="Machine Utilization"
          description="kg processed through registered machines, last 7 days"
        >
          {utilization.length === 0 ? (
            <p className="text-sm text-muted">
              No machines registered yet — add them in Settings to track utilization and pick them on stage events.
            </p>
          ) : (
            <div className="space-y-2">
              {utilization.map(({ machine, kgLast7Days, eventsLast7Days }) => (
                <div key={machine.id} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-ink w-36 truncate">{machine.name}</span>
                  <Badge variant={machine.status === "AVAILABLE" ? "green" : machine.status === "IN_USE" ? "amber" : "slate"}>
                    {machine.status.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                  <div className="flex-1 h-2.5 bg-cream rounded-full overflow-hidden">
                    <div
                      className="h-full bg-forest rounded-full"
                      style={{
                        width: `${Math.min(100, (kgLast7Days / Math.max(1, ...utilization.map((u) => u.kgLast7Days))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted whitespace-nowrap w-28 text-right">
                    {kgLast7Days} kg · {eventsLast7Days} runs
                  </span>
                </div>
              ))}
              {bottleneck && bottleneck[1].length > 0 ? (
                <p className="text-xs text-muted pt-2 border-t border-line">
                  ⏱ Bottleneck hint: <strong className="text-ink">{bottleneck[0]}</strong> is holding the most lots
                  ({bottleneck[1].length}) right now.
                </p>
              ) : null}
            </div>
          )}
        </Card>

        <Card
          title="Batch Planning Suggestions"
          description="Queued lots that could share a processing run (before Carding)"
        >
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted">
              No batching opportunities right now. Suggestions appear when 2+ similar lots are queued early in the pipeline.
            </p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map((s) => (
                <li key={s.key} className="border border-line rounded-lg p-3 bg-cream/50">
                  <p className="text-sm font-semibold text-ink">
                    {s.lots.length}× {s.fiberType}
                    {s.color ? ` (${s.color.toLowerCase()})` : ""} — {fmtWeight(s.totalWeightG)} total
                  </p>
                  <p className="text-xs text-muted mt-0.5 mb-2">
                    Consider batching these in one wash/card run to save water, dye and setup time.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.lots.map((lot) => (
                      <Link
                        key={lot.id}
                        href={`/lots/${lot.id}`}
                        className="text-xs font-medium text-forest bg-white border border-line rounded-full px-2.5 py-1 hover:border-forest"
                      >
                        {lot.lotCode} · {fmtWeight(lot.currentWeightG)}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

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
