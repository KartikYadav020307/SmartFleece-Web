import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPricingConfig } from "@/lib/invoice";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "slate" | "amber" | "green"> = {
  UNPAID: "slate",
  PARTIAL: "amber",
  PAID: "green",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const { status } = await searchParams;
  const filter = status === "UNPAID" || status === "PARTIAL" || status === "PAID" ? status : undefined;

  const [config, invoices] = await Promise.all([
    getPricingConfig(),
    prisma.invoice.findMany({
      where: filter ? { status: filter } : {},
      orderBy: { createdAt: "desc" },
      include: {
        order: { select: { orderNumber: true, customer: { select: { name: true } } } },
      },
    }),
  ]);

  const allOutstanding = invoices.reduce((acc, inv) => acc + Math.max(0, inv.totalMinor - inv.paidMinor), 0);
  const currency = { currencyCode: config.currencyCode, currencySymbol: config.currencySymbol };
  const monthStart = new Date();
  monthStart.setDate(1);
  const paidThisMonth = invoices.reduce(
    (acc, inv) => acc + (inv.status === "PAID" && inv.updatedAt >= monthStart ? inv.totalMinor : 0),
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Generated automatically when orders complete, from actual processed weight."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Invoices" value={invoices.length} hint={filter ? `filtered: ${filter.toLowerCase()}` : "all statuses"} />
        <StatCard label="Outstanding" value={formatMoney(allOutstanding, currency)} hint="total across shown invoices" />
        <StatCard label="Paid this month" value={formatMoney(paidThisMonth, currency)} hint="fully paid invoices" />
        <StatCard label="Tax" value={`${config.taxLabel} ${config.taxRatePct}%`} hint={`${config.currencyCode} · rush ×${config.rushMultiplier}`} />
      </div>

      <Card padded={false}>
        <div className="p-3 border-b border-line flex gap-1">
          {[
            { key: undefined, label: "all" },
            { key: "UNPAID", label: "unpaid" },
            { key: "PARTIAL", label: "partial" },
            { key: "PAID", label: "paid" },
          ].map((f) => (
            <Link
              key={f.label}
              href={f.key ? `/invoices?status=${f.key}` : "/invoices"}
              className={`btn btn-sm ${filter === f.key ? "bg-forest text-white" : "btn-secondary"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon="💰"
            title="No invoices yet"
            description="Invoices are generated automatically when an order finishes processing, or manually from the order page."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Invoice</th>
                  <th className="th">Order</th>
                  <th className="th">Customer</th>
                  <th className="th">Issued</th>
                  <th className="th">Total</th>
                  <th className="th">Paid</th>
                  <th className="th">Due</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-cream/60">
                    <td className="td">
                      <Link href={`/invoices/${inv.id}`} className="font-semibold text-forest hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="td text-muted">{inv.order.orderNumber}</td>
                    <td className="td text-muted">{inv.order.customer.name}</td>
                    <td className="td text-muted whitespace-nowrap">{fmtDate(inv.createdAt)}</td>
                    <td className="td whitespace-nowrap">{formatMoney(inv.totalMinor, currency)}</td>
                    <td className="td text-muted whitespace-nowrap">{formatMoney(inv.paidMinor, currency)}</td>
                    <td className="td whitespace-nowrap font-medium">
                      {formatMoney(Math.max(0, inv.totalMinor - inv.paidMinor), currency)}
                    </td>
                    <td className="td">
                      <Badge variant={STATUS_VARIANT[inv.status] ?? "slate"}>{inv.status.toLowerCase()}</Badge>
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
