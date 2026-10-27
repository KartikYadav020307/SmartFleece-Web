import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPricingConfig } from "@/lib/invoice";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatMoney, roundMinor } from "@/lib/money";
import type { LineItem } from "@/lib/invoice";

export const dynamic = "force-dynamic";

/**
 * Basic revenue analytics (Module 8 starter), all computed from real Invoice
 * and Payment records. "Paid revenue" attributes each invoice's collected
 * amount across its processing lines proportionally.
 */
export default async function ReportsPage() {
  await requireUser();

  const [config, invoices] = await Promise.all([
    getPricingConfig(),
    prisma.invoice.findMany({
      include: {
        payments: { select: { amountMinor: true, paidAt: true } },
        order: { select: { orderNumber: true } },
      },
    }),
  ]);
  const currency = { currencyCode: config.currencyCode, currencySymbol: config.currencySymbol };

  const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.totalMinor, 0);
  const totalPaid = invoices.reduce((acc, inv) => acc + inv.paidMinor, 0);
  const outstanding = totalInvoiced - totalPaid;

  // Paid revenue by month (from actual payments).
  const byMonth = new Map<string, number>();
  for (const inv of invoices) {
    for (const p of inv.payments) {
      const key = new Date(p.paidAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
      byMonth.set(key, (byMonth.get(key) ?? 0) + p.amountMinor);
    }
  }
  const monthly = [...byMonth.entries()].sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
  );
  const maxMonthly = Math.max(1, ...monthly.map((m) => m[1]));

  // Paid revenue by fiber type, scaled by collected ratio per invoice.
  const byFiber = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.paidMinor <= 0) continue;
    const ratio = Math.min(1, inv.paidMinor / inv.totalMinor);
    const lines: LineItem[] = JSON.parse(inv.lineItemsJson);
    for (const line of lines) {
      if (line.kind === "processing" && line.fiberType) {
        byFiber.set(line.fiberType, (byFiber.get(line.fiberType) ?? 0) + roundMinor(line.amountMinor * ratio));
      }
    }
  }
  const fiberRows = [...byFiber.entries()].sort((a, b) => b[1] - a[1]);
  const maxFiber = Math.max(1, ...fiberRows.map((f) => f[1]));

  const statusCounts = {
    UNPAID: invoices.filter((i) => i.status === "UNPAID").length,
    PARTIAL: invoices.filter((i) => i.status === "PARTIAL").length,
    PAID: invoices.filter((i) => i.status === "PAID").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Financial overview from real invoice and payment records. Production reports arrive with more history."
      />

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon="📈"
            title="No invoice data yet"
            description="Invoices appear here as orders complete. Financial reports build on the invoicing module."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total invoiced" value={formatMoney(totalInvoiced, currency)} hint={`${invoices.length} invoices`} />
            <StatCard label="Collected" value={formatMoney(totalPaid, currency)} hint={`${statusCounts.PAID} fully paid`} />
            <StatCard label="Outstanding" value={formatMoney(outstanding, currency)} hint={`${statusCounts.UNPAID} unpaid · ${statusCounts.PARTIAL} partial`} />
            <StatCard
              label="Collection rate"
              value={`${totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0}%`}
              hint="collected ÷ invoiced"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Collected revenue by month">
              {monthly.length === 0 ? (
                <p className="text-sm text-muted">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {monthly.map(([month, amount]) => (
                    <div key={month} className="flex items-center gap-2">
                      <span className="text-xs text-muted w-24">{month}</span>
                      <div className="flex-1 h-3 bg-cream rounded-full overflow-hidden">
                        <div className="h-full bg-forest rounded-full" style={{ width: `${(amount / maxMonthly) * 100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-ink w-24 text-right">{formatMoney(amount, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Collected revenue by fiber type" description="Processing charges, scaled by amount collected">
              {fiberRows.length === 0 ? (
                <p className="text-sm text-muted">No paid processing charges yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {fiberRows.map(([fiber, amount]) => (
                    <div key={fiber} className="flex items-center gap-2">
                      <span className="text-xs text-muted w-32 truncate">{fiber}</span>
                      <div className="flex-1 h-3 bg-cream rounded-full overflow-hidden">
                        <div className="h-full bg-terra rounded-full" style={{ width: `${(amount / maxFiber) * 100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-ink w-24 text-right">{formatMoney(amount, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
