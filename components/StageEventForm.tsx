"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FLAG_TYPES, SEVERITIES } from "@/lib/constants";
import { Field } from "@/components/ui";
import { fmtWeight } from "@/lib/format";
import { enqueue, getQueue } from "@/lib/offline";

export type StageEventTarget = {
  lotId: string;
  lotCode: string;
  currentStage: { id: string; name: string; expectedLossPct: number } | null;
  currentWeightG: number;
  status: string;
};

export type MachineOption = { id: string; name: string };

/**
 * The core worker form: confirm the current stage, record weights and notes.
 * Designed for ≤3 interactions: confirm weight → submit.
 */
export default function StageEventForm({
  target,
  machines = [],
  onDone,
}: {
  target: StageEventTarget;
  machines?: MachineOption[];
  onDone?: (msg: string) => void;
}) {
  const router = useRouter();
  const canAdvance =
    (target.status === "PENDING" || target.status === "IN_PRODUCTION") && target.currentStage;

  const [inputWeight, setInputWeight] = useState(String(target.currentWeightG));
  const [outputWeight, setOutputWeight] = useState("");
  const [machineId, setMachineId] = useState("");
  const [notes, setNotes] = useState("");
  const [flagType, setFlagType] = useState("");
  const [flagSeverity, setFlagSeverity] = useState("MEDIUM");
  const [flagNotes, setFlagNotes] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canAdvance) {
    return (
      <p className="text-sm text-muted bg-cream rounded-lg p-3">
        {target.status === "COMPLETED"
          ? "This lot completed all stages — nothing further to record."
          : target.status === "CONSUMED"
            ? "This lot was consumed by a blend/split. Follow its children instead."
            : target.status === "ON_HOLD"
              ? "This lot is on hold. Release it from the lot page to continue production."
              : "This lot cannot advance (no current stage configured)."}
      </p>
    );
  }

  async function submit(eventType: "COMPLETED" | "SKIPPED") {
    setBusy(true);
    setMessage(null);
    const clientEventId = crypto.randomUUID();
    const body = JSON.stringify({
      stageId: target.currentStage!.id,
      eventType,
      machineId: machineId || undefined,
      inputWeightG: inputWeight || undefined,
      outputWeightG: outputWeight || undefined,
      notes: notes || undefined,
      flagType: flagType || undefined,
      flagSeverity: flagType ? flagSeverity : undefined,
      flagNotes: flagType ? flagNotes || undefined : undefined,
      clientEventId,
    });
    const url = `/api/lots/${target.lotId}/events`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error ?? "Could not record stage event" });
        return;
      }
      const delta =
        data.weightDeltaG !== null && data.weightDeltaG !== undefined
          ? ` Weight change: ${data.weightDeltaG > 0 ? "+" : ""}${fmtWeight(data.weightDeltaG)}.`
          : "";
      const msg = data.duplicate
        ? "Already recorded (duplicate scan ignored)."
        : `${target.currentStage!.name} recorded.${delta}${
            data.nextStageName ? ` Next: ${data.nextStageName}.` : " Lot completed all stages! 🎉"
          }`;
      setMessage({ kind: "ok", text: msg });
      setOutputWeight("");
      setNotes("");
      setFlagType("");
      setFlagNotes("");
      onDone?.(msg);
      router.refresh();
    } catch {
      // Offline: queue locally. The server dedupes by clientEventId on sync.
      enqueue({
        url,
        body,
        clientEventId,
        lotCode: target.lotCode,
        stageName: target.currentStage!.name,
        savedAt: Date.now(),
      });
      setMessage({
        kind: "ok",
        text: `You appear to be offline — the scan was saved on this device (${getQueue().length} queued) and will sync automatically when the connection returns.`,
      });
      setOutputWeight("");
      setNotes("");
      setFlagType("");
      setFlagNotes("");
      onDone?.("Saved offline — will sync when back online.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={`Input weight (g)`} hint={`Lot currently weighs ${fmtWeight(target.currentWeightG)}`}>
          <input
            className="input"
            type="number"
            min={0}
            value={inputWeight}
            onChange={(e) => setInputWeight(e.target.value)}
          />
        </Field>
        <Field label="Output weight (g)" hint="Weigh after processing this stage">
          <input
            className="input"
            type="number"
            min={0}
            value={outputWeight}
            onChange={(e) => setOutputWeight(e.target.value)}
            placeholder="optional"
          />
        </Field>
      </div>
      <Field label="Machine" hint={machines.length === 0 ? "No machines registered yet — owner can add them in Settings" : undefined}>
        {machines.length > 0 ? (
          <select className="input" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">— not specified —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
            placeholder="Optional — e.g. Washer #2"
          />
        )}
      </Field>
      <Field label="Notes">
        <input
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional — observations…"
        />
      </Field>
      <details className="border border-line rounded-lg p-3 bg-cream/50">
        <summary className="text-sm font-medium text-ink cursor-pointer">
          🚩 Report a quality issue (optional)
        </summary>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field label="Issue type">
            <select className="input" value={flagType} onChange={(e) => setFlagType(e.target.value)}>
              <option value="">No issue</option>
              {FLAG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select
              className="input"
              value={flagSeverity}
              onChange={(e) => setFlagSeverity(e.target.value)}
              disabled={!flagType}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Issue details">
              <input className="input" value={flagNotes} onChange={(e) => setFlagNotes(e.target.value)} disabled={!flagType} />
            </Field>
          </div>
        </div>
      </details>

      {message ? (
        <p
          role="status"
          className={`text-sm rounded-lg px-3 py-2 ${
            message.kind === "ok" ? "bg-forest-soft text-forest-dark" : "bg-clay-soft text-clay"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => submit("COMPLETED")}>
          {busy ? "Recording…" : `✓ Complete "${target.currentStage!.name}"`}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => submit("SKIPPED")}>
          Skip stage
        </button>
      </div>
    </div>
  );
}
