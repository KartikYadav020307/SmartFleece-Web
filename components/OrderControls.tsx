"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_STATUSES } from "@/lib/constants";

/** Update order status / rush flag inline. */
export function OrderStatusSelect({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <select
        className="input w-44 py-1.5"
        value={value}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.value;
          setValue(next);
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/orders/${orderId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: next }),
            });
            if (!res.ok) {
              const data = await res.json();
              setError(data.error ?? "Update failed");
              setValue(status);
            } else {
              router.refresh();
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      {busy ? <span className="text-xs text-muted">saving…</span> : null}
      {error ? <span className="text-xs text-clay">{error}</span> : null}
    </div>
  );
}
