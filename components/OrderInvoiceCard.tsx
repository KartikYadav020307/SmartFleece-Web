"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { formatMoney, type CurrencyConfig } from "@/lib/money";

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  totalMinor: number;
  paidMinor: number;
  status: string;
};

const STATUS_VARIANT: Record<string, "slate" | "amber" | "green"> = {
  UNPAID: "slate",
  PARTIAL: "amber",
  PAID: "green",
};

/** Invoice panel on the order page: summary + link, or a generate button. */
export default function OrderInvoiceCard({
  orderId,
  orderStatus,
  invoice,
  currency,
  canManage,
}: {
  orderId: string;
  orderStatus: string;
  invoice: InvoiceSummary | null;
  currency: CurrencyConfig;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (invoice) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={STATUS_VARIANT[invoice.status] ?? "slate"}>{invoice.status.toLowerCase()}</Badge>
        <Link href={`/invoices/${invoice.id}`} className="text-sm font-semibold text-forest hover:underline">
          {invoice.invoiceNumber}
        </Link>
        <span className="text-sm text-muted">
          {formatMoney(invoice.totalMinor, currency)} total · {formatMoney(invoice.paidMinor, currency)} paid ·{" "}
          <strong className="text-ink">{formatMoney(Math.max(0, invoice.totalMinor - invoice.paidMinor), currency)} due</strong>
        </span>
      </div>
    );
  }

  if (!canManage || orderStatus === "CANCELLED") {
    return <p className="text-sm text-muted">No invoice yet — generated automatically when the order is ready for pickup.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">No invoice yet — generated automatically when the order is ready for pickup.</p>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/invoices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId }),
            });
            const data = await res.json();
            if (!res.ok) {
              setError(data.error ?? "Could not generate invoice");
              return;
            }
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Generating…" : "Generate invoice now"}
      </button>
      {error ? <p className="text-xs text-clay">{error}</p> : null}
    </div>
  );
}
