import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, OrderStatusBadge, PageHeader } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import { fmtDate } from "@/lib/format";
import { ORDER_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireUser();
  const { q, status } = await searchParams;
  const search = q?.trim() ?? "";

  const orders = await prisma.order.findMany({
    where: {
      AND: [
        status && ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])
          ? { status }
          : {},
        search
          ? {
              OR: [
                { orderNumber: { contains: search.toUpperCase() } },
                { customer: { name: { contains: search } } },
              ],
            }
          : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true, farmName: true } },
      _count: { select: { lots: true } },
    },
  });

  const buildHref = (params: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (params.status) next.set("status", params.status);
    const qs = next.toString();
    return qs ? `/orders?${qs}` : "/orders";
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Processing orders from intake to pickup."
        actions={
          <Link href="/orders/new" className="btn-primary">
            + New Order
          </Link>
        }
      />
      <Card padded={false}>
        <div className="p-3 border-b border-line flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-56">
            <SearchBox placeholder="Search order # or customer…" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Link href={buildHref({ status: undefined })} className={`btn btn-sm ${!status ? "bg-forest text-white" : "btn-secondary"}`}>
              All
            </Link>
            {ORDER_STATUSES.map((s) => (
              <Link
                key={s}
                href={buildHref({ status: s })}
                className={`btn btn-sm ${status === s ? "bg-forest text-white" : "btn-secondary"}`}
              >
                {s.replaceAll("_", " ").toLowerCase()}
              </Link>
            ))}
          </div>
        </div>
        {orders.length === 0 ? (
          <EmptyState
            icon="🧾"
            title={search || status ? "No orders match" : "No orders yet"}
            description={
              search || status
                ? "Try clearing the search or filter."
                : "Receive your first fiber — each order can hold multiple individually QR-tagged bags."
            }
            action={
              !search && !status ? (
                <Link href="/orders/new" className="btn-primary">
                  Create the first order
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Order</th>
                  <th className="th">Customer</th>
                  <th className="th">Received</th>
                  <th className="th">Product</th>
                  <th className="th">Lots</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-cream/60">
                    <td className="td">
                      <Link href={`/orders/${order.id}`} className="font-semibold text-forest hover:underline">
                        {order.orderNumber}
                      </Link>
                      {order.rush ? <span className="ml-2 text-xs font-bold text-clay">RUSH</span> : null}
                    </td>
                    <td className="td">
                      <span className="text-ink">{order.customer.name}</span>
                      {order.customer.farmName ? (
                        <span className="text-muted text-xs"> · {order.customer.farmName}</span>
                      ) : null}
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
    </div>
  );
}
