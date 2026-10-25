import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getStages } from "@/lib/production";
import {
  Badge,
  Card,
  EmptyState,
  LotStatusBadge,
  MetaRow,
  PageHeader,
  SampleBadge,
} from "@/components/ui";
import { CopyLink } from "@/components/controls";
import { OrderStatusSelect } from "@/components/OrderControls";
import { fmtDate, fmtDateTime, fmtWeight } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const [order, stages] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        lots: {
          orderBy: { createdAt: "asc" },
          include: {
            currentStage: true,
            stageEvents: { where: { revertedAt: null } },
            _count: { select: { qualityFlags: { where: { status: "OPEN" } } } },
          },
        },
        notifications: { orderBy: { createdAt: "desc" } },
      },
    }),
    getStages(),
  ]);
  if (!order) notFound();

  const stageIndex = new Map(stages.map((s, i) => [s.id, i]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <Link href={`/customers/${order.customerId}`} className="text-forest font-semibold hover:underline">
              {order.customer.name}
            </Link>
            {order.customer.farmName ? <span className="text-muted">· {order.customer.farmName}</span> : null}
            {order.rush ? <span className="badge bg-clay-soft text-clay">rush</span> : null}
            {order.isSample ? <SampleBadge /> : null}
          </span>
        }
        actions={
          <>
            <CopyLink path={`/track/${order.trackingToken}`} label="Copy tracking link" />
            <Link href={`/orders/${order.id}/add-lot`} className="btn-secondary">
              + Add Lot
            </Link>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Order Details" className="lg:col-span-2">
          <MetaRow
            items={[
              { label: "Received", value: fmtDate(order.orderDate) },
              { label: "Shearing date", value: fmtDate(order.shearingDate) },
              { label: "Farm / supplier", value: order.farmInfo ?? "—" },
              { label: "Finished product", value: order.targetProduct ?? "—" },
              { label: "Yarn specs", value: order.yarnSpecs ?? "—" },
              { label: "Dyeing", value: order.dyeSpecs ?? "—" },
              { label: "Est. completion", value: order.estimatedCompletion ? fmtDate(order.estimatedCompletion) : "not set" },
              { label: "Tracking", value: <span className="font-mono text-xs">/track/{order.trackingToken.slice(0, 10)}…</span> },
            ]}
          />
          {order.notes ? (
            <div className="mt-4">
              <p className="label">Notes</p>
              <p className="text-sm text-ink bg-cream rounded-lg p-3 whitespace-pre-wrap">{order.notes}</p>
            </div>
          ) : null}
        </Card>

        <Card title="Status">
          <div className="space-y-3">
            <OrderStatusSelect orderId={order.id} status={order.status} />
            <p className="text-xs text-muted">
              Status recalculates automatically as lots move through production. Manual changes are
              for pickup completion or cancellation.
            </p>
          </div>
        </Card>
      </div>

      <Card title={`Fiber Lots (${order.lots.length})`} padded={false}>
        {order.lots.length === 0 ? (
          <EmptyState
            icon="🧶"
            title="No lots on this order"
            description="Add individually tracked bags with their own QR labels."
            action={
              <Link href={`/orders/${order.id}/add-lot`} className="btn-primary">
                + Add Lot
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {order.lots.map((lot) => {
              const progress = Math.round(((stageIndex.get(lot.currentStageId ?? "") ?? 0) / Math.max(1, stages.length - 1)) * 100);
              return (
                <li key={lot.id} className="p-4 hover:bg-cream/50">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/lots/${lot.id}`} className="font-bold text-forest hover:underline">
                      {lot.lotCode}
                    </Link>
                    <LotStatusBadge status={lot.status} />
                    {lot.isBatch ? <Badge variant="terra">blend batch</Badge> : null}
                    {lot._count.qualityFlags > 0 ? (
                      <Badge variant="clay">🚩 {lot._count.qualityFlags} open flag{lot._count.qualityFlags > 1 ? "s" : ""}</Badge>
                    ) : null}
                    <span className="text-sm text-muted flex-1 truncate">
                      {lot.fiberType}
                      {lot.breed ? ` · ${lot.breed}` : ""}
                    </span>
                    <span className="text-sm text-muted whitespace-nowrap">
                      {fmtWeight(lot.greaseWeightG)} → <strong className="text-ink">{fmtWeight(lot.currentWeightG)}</strong>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-cream rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${lot.status === "COMPLETED" ? "bg-forest-dark" : "bg-forest"}`}
                        style={{ width: `${lot.status === "COMPLETED" ? 100 : lot.status === "PENDING" ? 2 : Math.max(4, progress)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted whitespace-nowrap">
                      {lot.currentStage?.name ?? "—"}
                      {lot.status === "COMPLETED" ? " · done" : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`Customer Notifications (${order.notifications.length})`} description="Dev mode: recorded here, not emailed">
        {order.notifications.length === 0 ? (
          <p className="text-sm text-muted">No notifications yet for this order.</p>
        ) : (
          <ul className="divide-y divide-line">
            {order.notifications.map((n) => (
              <li key={n.id} className="py-2.5 flex items-start gap-3">
                <Badge variant={n.status === "LOGGED" ? "slate" : n.status === "SENT" ? "green" : "clay"}>
                  {n.status.toLowerCase()}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">{n.subject}</p>
                  <p className="text-xs text-muted">
                    {fmtDateTime(n.createdAt)} · to {n.recipient ?? "no email on file"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
