"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { FIBER_TYPES } from "@/lib/constants";

export type PricingView = {
  currencyCode: string;
  currencySymbol: string;
  taxLabel: string;
  taxRatePct: number;
  rushMultiplier: number;
  minimumOrderFeeMinor: number;
  rates: Record<string, number>; // minor units per kg, incl. "default"
};

/** Owner-only pricing configuration editor. Amounts entered in major units. */
export default function PricingEditor({ pricing, isOwner }: { pricing: PricingView; isOwner: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    currencyCode: pricing.currencyCode,
    currencySymbol: pricing.currencySymbol,
    taxLabel: pricing.taxLabel,
    taxRatePct: String(pricing.taxRatePct),
    rushMultiplier: String(pricing.rushMultiplier),
    minimumOrderFeeMajor: (pricing.minimumOrderFeeMinor / 100).toString(),
    defaultRateMajorPerKg: ((pricing.rates["default"] ?? 0) / 100).toString(),
  });
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    for (const t of FIBER_TYPES) {
      r[t] = pricing.rates[t] !== undefined ? (pricing.rates[t] / 100).toString() : "";
    }
    return r;
  });
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!isOwner) {
    return (
      <div className="text-sm text-muted">
        <p>
          {pricing.currencySymbol} pricing is managed by the mill owner. Current: base rate{" "}
          <strong>{(pricing.rates["default"] ?? 0) / 100}</strong>/kg, {pricing.taxLabel}{" "}
          {pricing.taxRatePct}%, rush ×{pricing.rushMultiplier}.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          const res = await fetch("/api/settings/pricing", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...form,
              baseRatesMajorPerKg: Object.fromEntries(
                Object.entries(rates).filter(([, v]) => v !== "")
              ),
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setMessage({ kind: "err", text: data.error ?? "Save failed" });
            return;
          }
          setMessage({ kind: "ok", text: "Pricing saved. New invoices use these rates." });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Currency code" hint="ISO code, e.g. INR, USD, EUR">
          <input className="input" value={form.currencyCode} onChange={set("currencyCode")} maxLength={3} required />
        </Field>
        <Field label="Currency symbol">
          <input className="input" value={form.currencySymbol} onChange={set("currencySymbol")} maxLength={4} required />
        </Field>
        <Field label="Tax label" hint="GST / VAT / Sales Tax">
          <input className="input" value={form.taxLabel} onChange={set("taxLabel")} maxLength={20} required />
        </Field>
        <Field label="Tax rate %">
          <input className="input" type="number" min={0} max={100} step="0.01" value={form.taxRatePct} onChange={set("taxRatePct")} />
        </Field>
        <Field label="Rush multiplier" hint="×1 = no surcharge">
          <input className="input" type="number" min={1} max={5} step="0.05" value={form.rushMultiplier} onChange={set("rushMultiplier")} />
        </Field>
        <Field label={`Minimum order fee (${form.currencySymbol})`}>
          <input className="input" type="number" min={0} step="0.01" value={form.minimumOrderFeeMajor} onChange={set("minimumOrderFeeMajor")} />
        </Field>
      </div>

      <div>
        <p className="label">Processing rate per kg</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Default rate (all fiber types)">
            <input className="input" type="number" min={0} step="0.01" value={form.defaultRateMajorPerKg} onChange={set("defaultRateMajorPerKg")} required />
          </Field>
          {FIBER_TYPES.map((t) => (
            <Field key={t} label={t}>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                placeholder="default"
                value={rates[t]}
                onChange={(e) => setRates((r) => ({ ...r, [t]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </div>

      {message ? (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            message.kind === "ok" ? "bg-forest-soft text-forest-dark" : "bg-clay-soft text-clay"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save pricing"}
      </button>
    </form>
  );
}
