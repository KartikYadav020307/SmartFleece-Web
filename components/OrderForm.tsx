"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Card } from "@/components/ui";
import LotFields, { emptyLot, type LotFormValues } from "@/components/LotFields";
import { TARGET_PRODUCTS, YARN_WEIGHTS, PLY_OPTIONS } from "@/lib/constants";

export type CustomerOption = { id: string; name: string; farmName?: string | null };

export default function OrderForm({
  customers,
  preselectedCustomerId,
}: {
  customers: CustomerOption[];
  preselectedCustomerId?: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(preselectedCustomerId ?? "");
  const [shearingDate, setShearingDate] = useState("");
  const [farmInfo, setFarmInfo] = useState("");
  const [targetProduct, setTargetProduct] = useState("");
  const [yarnWeight, setYarnWeight] = useState("");
  const [ply, setPly] = useState("");
  const [twist, setTwist] = useState("");
  const [dyeSpecs, setDyeSpecs] = useState("");
  const [rush, setRush] = useState(false);
  const [notes, setNotes] = useState("");
  const [lots, setLots] = useState<LotFormValues[]>([emptyLot()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const yarnSpecs = [yarnWeight && `${yarnWeight} weight`, ply && `${ply}-ply`, twist && `${twist} twist`]
    .filter(Boolean)
    .join(", ");

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          shearingDate,
          farmInfo,
          targetProduct,
          yarnSpecs: yarnSpecs || undefined,
          dyeSpecs,
          rush,
          notes,
          lots: lots.map((l) => ({
            fiberType: l.fiberType,
            breed: l.breed,
            greaseWeightG: l.greaseWeightG,
            conditionGrade: l.conditionGrade,
            vmRating: l.vmRating,
            stapleLengthMm: l.stapleLengthMm,
            microns: l.microns,
            color: l.color,
            notes: l.notes,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create order");
        return;
      }
      router.push(`/orders/${data.order.id}`);
      router.refresh();
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (customers.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          You need at least one customer before creating an order.{" "}
          <a href="/customers/new" className="text-forest font-semibold hover:underline">
            Add a customer first →
          </a>
        </p>
      </Card>
    );
  }

  return (
    <form
      className="space-y-5 max-w-4xl"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Card title="Order">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Customer *">
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.farmName ? ` — ${c.farmName}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Shearing date">
            <input className="input" type="date" value={shearingDate} onChange={(e) => setShearingDate(e.target.value)} />
          </Field>
          <Field label="Farm / supplier info">
            <input className="input" value={farmInfo} onChange={(e) => setFarmInfo(e.target.value)} placeholder="Where this clip came from" />
          </Field>
          <Field label="Desired finished product">
            <select className="input" value={targetProduct} onChange={(e) => setTargetProduct(e.target.value)}>
              <option value="">—</option>
              {TARGET_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Yarn weight">
            <select className="input" value={yarnWeight} onChange={(e) => setYarnWeight(e.target.value)}>
              <option value="">—</option>
              {YARN_WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ply">
            <select className="input" value={ply} onChange={(e) => setPly(e.target.value)}>
              <option value="">—</option>
              {PLY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Twist direction">
            <select className="input" value={twist} onChange={(e) => setTwist(e.target.value)}>
              <option value="">—</option>
              <option value="S">S</option>
              <option value="Z">Z</option>
            </select>
          </Field>
          <Field label="Dyeing">
            <input className="input" value={dyeSpecs} onChange={(e) => setDyeSpecs(e.target.value)} placeholder="Natural / solid / hand-painted…" />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#3e6b4e]"
                checked={rush}
                onChange={(e) => setRush(e.target.checked)}
              />
              Rush order
            </label>
          </div>
        </div>
        <div className="mt-4">
          <Field label="Order notes">
            <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="Fiber lots"
        description="Each bag or fleece is tracked individually with its own QR label."
        actions={
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setLots((ls) => [...ls, emptyLot()])}
          >
            + Add bag
          </button>
        }
      >
        <div className="space-y-4">
          {lots.map((lot, i) => (
            <div key={i} className="relative">
              <LotFields index={i} value={lot} onChange={(v) => setLots((ls) => ls.map((l, j) => (j === i ? v : l)))} />
              {lots.length > 1 ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm absolute top-2 right-2"
                  onClick={() => setLots((ls) => ls.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      {error ? (
        <p className="text-sm text-clay bg-clay-soft rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Creating order…" : "Create order & generate QR labels"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
