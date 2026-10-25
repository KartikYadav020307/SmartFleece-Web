import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, LotStatusBadge, MetaRow, OrderStatusBadge, PageHeader, SampleBadge } from "@/components/ui";
import { ConfirmButton } from "@/components/controls";
import { fmtDate, fmtWeight } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { _count: { select: { lots: true } } } },
      lots: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { order: { select: { orderNumber: true } }, currentStage: { select: { name: true } } },
      },
    },
  });
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        description={customer.farmName ? `${customer.farmName}${customer.location ? ` · ${customer.location}` : ""}` : customer.location ?? undefined}
        actions={
          <>
            <Link href={`/orders/new?customerId=${customer.id}`} className="btn-secondary">
              + New Order
            </Link>
            <Link href={`/customers/${customer.id}/edit`} className="btn-primary">
              Edit
            </Link>
          </>
        }
      />

      <Card title="Profile">
        <MetaRow
          items={[
            { label: "Email", value: customer.email ?? "—" },
            { label: "Phone", value: customer.phone ?? "—" },
            { label: "Farm", value: customer.farmName ?? "—" },
            { label: "Location", value: customer.location ?? "—" },
            { label: "Customer since", value: fmtDate(customer.createdAt) },
            { label: "Record", value: customer.isSample ? <SampleBadge /> : "live data" },
          ]}
        />
        {customer.preferences ? (
          <div className="mt-4">
            <p className="label">Processing preferences</p>
            <p className="text-sm text-ink bg-cream rounded-lg p-3 whitespace-pre-wrap">{customer.preferences}</p>
          </div>
        ) : null}
        {customer.notes ? (
          <div className="mt-4">
            <p className="label">Internal notes (not customer-visible)</p>
            <p className="text-sm text-ink bg-amber-soft/60 rounded-lg p-3 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        ) : null}
        {user.role === "OWNER" ? (
          <div className="mt-4 pt-4 border-t border-line">
            <ConfirmButton
              className="btn-danger btn-sm"
              confirmLabel="Really delete/archive?"
              onConfirm={async () => {
                await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
                window.location.href = "/customers";
              }}
            >
              {customer.orders.length > 0 || customer.lots.length > 0
                ? "Archive customer (has history)"
                : "Delete customer"}
            </ConfirmButton>
            <p className="text-xs text-muted mt-2">
              Customers with orders or lots are archived, never deleted, so traceability stays intact.
            </p>
          </div>
        ) : null}
      </Card>

      <Card title={`Orders (${customer.orders.length})`} padded={false}>
        {customer.orders.length === 0 ? (
          <EmptyState icon="🧾" title="No orders yet" description="Create an order to receive fiber from this customer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Order</th>
                  <th className="th">Date</th>
                  <th className="th">Product</th>
                  <th className="th">Lots</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {customer.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-cream/60">
                    <td className="td">
                      <Link href={`/orders/${order.id}`} className="font-semibold text-forest hover:underline">
                        {order.orderNumber}
                      </Link>
                      {order.rush ? <span className="ml-2 text-xs font-bold text-clay">RUSH</span> : null}
                    </td>
                    <td className="td text-muted">{fmtDate(order.orderDate)}</td>
                    <td className="td text-muted">{order.targetProduct ?? "—"}</td>
                    <td className="td">{order._count.lots}</td>
                    <td className="td">
                      <OrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Fiber Lots (${customer.lots.length})`} padded={false}>
        {customer.lots.length === 0 ? (
          <EmptyState icon="🧶" title="No lots yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Lot</th>
                  <th className="th">Order</th>
                  <th className="th">Fiber</th>
                  <th className="th">Intake</th>
                  <th className="th">Current</th>
                  <th className="th">Stage</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {customer.lots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-cream/60">
                    <td className="td">
                      <Link href={`/lots/${lot.id}`} className="font-semibold text-forest hover:underline">
                        {lot.lotCode}
                      </Link>
                    </td>
                    <td className="td text-muted">{lot.order.orderNumber}</td>
                    <td className="td text-muted">{lot.fiberType}</td>
                    <td className="td text-muted">{fmtWeight(lot.greaseWeightG)}</td>
                    <td className="td text-muted">{fmtWeight(lot.currentWeightG)}</td>
                    <td className="td text-muted">{lot.currentStage?.name ?? "—"}</td>
                    <td className="td">
                      <LotStatusBadge status={lot.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
