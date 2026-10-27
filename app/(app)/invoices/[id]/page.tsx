import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPricingConfig } from "@/lib/invoice";
import { Badge, Card, PageHeader } from "@/components/ui";
import InvoiceActions from "@/components/InvoiceActions";
import { PrintButton } from "@/components/controls";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtWeight } from "@/lib/format";
import type { LineItem } from "@/lib/invoice";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  processing: "Processing",
  rush: "Rush",
  minimum: "Minimum fee",
  extra: "Extra charge",
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [invoice, config] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            targetProduct: true,
            customer: { select: { id: true, name: true, farmName: true, email: true, location: true } },
          },
        },
        payments: { orderBy: { paidAt: "asc" } },
      },
    }),
    getPricingConfig(),
  ]);
  if (!invoice) notFound();

  const currency = { currencyCode: config.currencyCode, currencySymbol: config.currencySymbol };
  const lines: LineItem[] = JSON.parse(invoice.lineItemsJson);
  const balanceMinor = Math.max(0, invoice.totalMinor - invoice.paidMinor);
  const canManage = user.role === "OWNER";

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <Link href={`/orders/${invoice.order.id}`} className="text-forest font-semibold hover:underline">
              {invoice.order.orderNumber}
            </Link>
            <span className="text-muted">· {invoice.order.customer.name}</span>
            <Badge variant={invoice.status === "PAID" ? "green" : invoice.status === "PARTIAL" ? "amber" : "slate"}>
              {invoice.status.toLowerCase()}
            </Badge>
          </span>
        }
        actions={<PrintButton label="🖨 Print / Save PDF" />}
      />

      {/* Print area */}
      <div className="card p-6 print:border-0 print:shadow-none print:rounded-none">
        <div className="flex flex-wrap justify-between gap-4 pb-4 border-b border-line">
          <div>
            <p className="text-xl font-bold text-ink">🐑 Your Mill</p>
            <p className="text-xs text-muted mt-0.5">Fiber processing — powered by SmartFleece</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-ink">{invoice.invoiceNumber}</p>
            <p className="text-xs text-muted">Issued {fmtDate(invoice.createdAt)}</p>
            {invoice.dueDate ? <p className="text-xs text-muted">Due {fmtDate(invoice.dueDate)}</p> : null}
          </div>
        </div>

        <div className="py-4 border-b border-line">
          <p className="label">Billed to</p>
          <p className="text-sm font-semibold text-ink">
            {invoice.order.customer.name}
            {invoice.order.customer.farmName ? ` — ${invoice.order.customer.farmName}` : ""}
          </p>
          <p className="text-xs text-muted">
            {[invoice.order.customer.email, invoice.order.customer.location].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="text-xs text-muted mt-1">
            Order {invoice.order.orderNumber} · received {fmtDate(invoice.order.orderDate)}
            {invoice.order.targetProduct ? ` · ${invoice.order.targetProduct}` : ""}
          </p>
        </div>

        <table className="w-full mt-4">
          <thead>
            <tr>
              <th className="th">Description</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="td">
                  <span className="text-ink">{line.description}</span>
                  <span className="text-xs text-muted block">
                    {KIND_LABEL[line.kind] ?? line.kind}
                    {line.manual ? " · manual" : ""}
                  </span>
                </td>
                <td className="td text-right whitespace-nowrap">{formatMoney(line.amountMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal ({fmtWeight(invoice.billableWeightG)} processed)</span>
            <span>{formatMoney(invoice.subtotalMinor, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">
              {invoice.taxLabel} ({invoice.taxRatePct}%)
            </span>
            <span>{formatMoney(invoice.taxMinor, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-bold text-ink">
            <span>Total</span>
            <span>{formatMoney(invoice.totalMinor, currency)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Paid</span>
            <span>{formatMoney(invoice.paidMinor, currency)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span className={balanceMinor > 0 ? "text-clay" : "text-forest-dark"}>Balance due</span>
            <span className={balanceMinor > 0 ? "text-clay" : "text-forest-dark"}>
              {formatMoney(balanceMinor, currency)}
            </span>
          </div>
        </div>

        {invoice.payments.length > 0 ? (
          <div className="mt-5 pt-4 border-t border-line">
            <p className="label">Payment history</p>
            <ul className="text-sm space-y-1">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-x-3 text-muted">
                  <span className="text-ink font-medium">{formatMoney(p.amountMinor, currency)}</span>
                  <span>{p.method}</span>
                  {p.reference ? <span>· {p.reference}</span> : null}
                  <span>· {fmtDateTime(p.paidAt)}</span>
                  {p.recordedBy ? <span>· by {p.recordedBy}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-muted mt-6 pt-3 border-t border-line">
          Payable at pickup. Thank you for trusting the mill with your fiber.
        </p>
      </div>

      {/* Owner actions */}
      {canManage ? (
        <Card title="Manage invoice">
          <InvoiceActions
            invoiceId={invoice.id}
            totalMinor={invoice.totalMinor}
            paidMinor={invoice.paidMinor}
            currency={currency}
            canManage={canManage}
          />
        </Card>
      ) : null}
    </div>
  );
}
