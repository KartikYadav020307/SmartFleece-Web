"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { ConfirmButton } from "@/components/controls";
import { formatMoney, type CurrencyConfig } from "@/lib/money";

/** Owner actions on an invoice: record payment, add charge, regenerate. */
export default function InvoiceActions({
  invoiceId,
  totalMinor,
  paidMinor,
  currency,
  canManage,
}: {
  invoiceId: string;
  totalMinor: number;
  paidMinor: number;
  currency: CurrencyConfig;
  canManage: boolean;
}) {
  const router = useRouter();
  const outstandingMinor = Math.max(0, totalMinor - paidMinor);
  const locked = paidMinor > 0;
  const [payAmount, setPayAmount] = useState((outstandingMinor / 100).toString());
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [extraDesc, setExtraDesc] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!canManage) return null;

  async function post(url: string, body: unknown, tag: string) {
    setBusy(tag);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Operation failed");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="text-sm text-clay bg-clay-soft rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {outstandingMinor > 0 ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await post(
              `/api/invoices/${invoiceId}/payments`,
              { amountMajor: payAmount, method, reference: reference || undefined },
              "pay"
            );
            if (ok) {
              setReference("");
              setPayAmount((Math.max(0, outstandingMinor - Math.round(Number(payAmount) * 100)) / 100).toString());
            }
          }}
        >
          <p className="label">Record a payment</p>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <Field label={`Amount (${currency.currencySymbol})`}>
              <input className="input" type="number" min={0.01} step="0.01" max={outstandingMinor / 100} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            </Field>
            <Field label="Method">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {["Cash", "Bank", "UPI", "Other"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference">
              <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" />
            </Field>
            <button type="submit" className="btn-primary" disabled={busy === "pay" || !payAmount}>
              {busy === "pay" ? "Recording…" : `Record ${formatMoney(Math.round(Number(payAmount || 0) * 100), currency)}`}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-forest-dark font-medium">✓ Fully paid — no outstanding balance.</p>
      )}

      {!locked ? (
        <details className="border border-line rounded-lg p-3 bg-cream/50">
          <summary className="text-sm font-medium text-ink cursor-pointer">➕ Add an extra charge (e.g. dyeing)</summary>
          <div className="grid sm:grid-cols-3 gap-3 items-end mt-3">
            <Field label="Description">
              <input className="input" value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} placeholder="e.g. Dyeing — 2 kg" maxLength={120} />
            </Field>
            <Field label={`Amount (${currency.currencySymbol})`}>
              <input className="input" type="number" min={0.01} step="0.01" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} />
            </Field>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy === "extra" || !extraDesc || !extraAmount}
              onClick={async () => {
                const ok = await post(
                  `/api/invoices/${invoiceId}/extras`,
                  { description: extraDesc, amountMajor: extraAmount },
                  "extra"
                );
                if (ok) {
                  setExtraDesc("");
                  setExtraAmount("");
                }
              }}
            >
              {busy === "extra" ? "Adding…" : "Add charge"}
            </button>
          </div>
          <p className="text-xs text-muted mt-2">
            Adds a manual line and recalculates tax. Available only until the first payment is recorded.
          </p>
        </details>
      ) : null}

      {!locked ? (
        <div>
          <ConfirmButton
            className="btn-secondary btn-sm"
            confirmLabel="Recompute from current weights?"
            onConfirm={async () => {
              await post(`/api/invoices/${invoiceId}/regenerate`, {}, "regen");
            }}
          >
            ↻ Regenerate from current data
          </ConfirmButton>
          <p className="text-xs text-muted mt-1.5">
            Recomputes processing lines from current lot weights and pricing. Manual extra charges are kept.
          </p>
        </div>
      ) : null}
    </div>
  );
}
