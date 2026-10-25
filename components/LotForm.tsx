"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LotFields, { emptyLot, type LotFormValues } from "@/components/LotFields";

/** Add one more individually tracked lot to an existing order. */
export default function LotForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [lot, setLot] = useState<LotFormValues>(emptyLot());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const res = await fetch("/api/lots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, lot }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? "Could not add lot");
            return;
          }
          router.push(`/lots/${data.lot.id}`);
          router.refresh();
        } catch {
          setError("Network error — please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <LotFields index={0} value={lot} onChange={setLot} />
      {error ? (
        <p className="text-sm text-clay bg-clay-soft rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Adding…" : "Add lot & generate QR"}
      </button>
    </form>
  );
}
