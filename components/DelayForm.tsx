"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { DELAY_REASONS } from "@/lib/validation";

const REASON_LABELS: Record<string, string> = {
  MACHINE_BREAKDOWN: "Machine breakdown",
  FIBER_CONDITION: "Fiber condition",
  STAFF_ABSENCE: "Staff absence",
  RUSH_REORDER: "Rush reorder",
  WEATHER: "Weather",
  OTHER: "Other",
};

/** Spec 3.4: log a delay — pushes the ETA and notifies the customer. */
export default function DelayForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState<string>("MACHINE_BREAKDOWN");
  const [extraDays, setExtraDays] = useState("1");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          const res = await fetch(`/api/orders/${orderId}/delay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, extraDays, notes: notes || undefined }),
          });
          const data = await res.json();
          if (!res.ok) {
            setMessage({ kind: "err", text: data.error ?? "Could not log delay" });
            return;
          }
          setMessage({ kind: "ok", text: `Delay logged — ETA moved out ${extraDays} day${Number(extraDays) > 1 ? "s" : ""} and the customer was notified.` });
          setNotes("");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <Field label="Reason">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {DELAY_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Extra days">
          <input className="input" type="number" min={1} max={60} value={extraDays} onChange={(e) => setExtraDays(e.target.value)} />
        </Field>
        <button type="submit" className="btn-secondary" disabled={busy}>
          {busy ? "Logging…" : "Log delay & notify"}
        </button>
      </div>
      <Field label="Note for the customer">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — appears in the notification" />
      </Field>
      {message ? (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            message.kind === "ok" ? "bg-forest-soft text-forest-dark" : "bg-clay-soft text-clay"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
