"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QC_OUTCOMES, QC_VISUAL_GRADES, QC_TWIST_TYPES } from "@/lib/constants";
import { Field } from "@/components/ui";
import { fmtDateTime, fmtSignedWeight, fmtWeight } from "@/lib/format";

export type InspectionItem = {
  id: string;
  stageEventId: string | null;
  inspectorName: string | null;
  inspector?: { id: string; name: string } | null;
  outcome: string;
  measuredWeightG: number | null;
  previousWeightG: number | null;
  weightDeltaG: number | null;
  skeinCount: number | null;
  totalYardageM: number | null;
  actualPly: number | null;
  actualTwist: string | null;
  visualGrade: string | null;
  notes: string | null;
  createdAt: string | Date;
};

export default function QCInspectionForm({
  lotId,
  currentWeightG,
  status,
  targetProduct,
  yarnSpecs,
  history = [],
  isFresh = false,
}: {
  lotId: string;
  currentWeightG: number;
  status: string;
  targetProduct?: string | null;
  yarnSpecs?: string | null;
  history?: InspectionItem[];
  isFresh?: boolean;
}) {
  const router = useRouter();
  const latest = history[0] ?? null;

  const [outcome, setOutcome] = useState<string>("PASS");
  const [measuredWeight, setMeasuredWeight] = useState(String(currentWeightG));
  const [skeinCount, setSkeinCount] = useState("");
  const [totalYardage, setTotalYardage] = useState("");
  const [actualPly, setActualPly] = useState("");
  const [actualTwist, setActualTwist] = useState("");
  const [visualGrade, setVisualGrade] = useState("PASS");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canInspect = status !== "CONSUMED" && status !== "CANCELLED";
  const isYarn = targetProduct?.toLowerCase().includes("yarn") || Boolean(yarnSpecs);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    // Client-side quick checks matching server Zod schema
    if (outcome === "PASS" && (!measuredWeight || Number(measuredWeight) <= 0)) {
      setMessage({ kind: "err", text: "Measured weight is required and must be > 0 for PASS outcome." });
      setBusy(false);
      return;
    }
    if (outcome === "PASS" && visualGrade === "REJECT") {
      setMessage({ kind: "err", text: "Cannot pass inspection when visual grade is REJECT." });
      setBusy(false);
      return;
    }
    if (["REWORK", "HOLD", "FAIL"].includes(outcome) && !notes.trim()) {
      setMessage({ kind: "err", text: `Notes are required when recording ${outcome} to explain reason.` });
      setBusy(false);
      return;
    }

    try {
      const res = await fetch(`/api/lots/${lotId}/qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          measuredWeightG: measuredWeight ? Number(measuredWeight) : undefined,
          skeinCount: skeinCount ? Number(skeinCount) : undefined,
          totalYardageM: totalYardage ? Number(totalYardage) : undefined,
          actualPly: actualPly ? Number(actualPly) : undefined,
          actualTwist: actualTwist || undefined,
          visualGrade: visualGrade || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error || `Error ${res.status}: Failed to submit QC.` });
        return;
      }

      setMessage({ kind: "ok", text: `QC inspection recorded: ${outcome}. Lot is now ${data.lotStatus}.` });
      setNotes("");
      router.refresh();
    } catch {
      setMessage({ kind: "err", text: "Network error. Failed to record QC inspection." });
    } finally {
      setBusy(false);
    }
  }

  // Outcome status badge styling
  let statusBadge = (
    <span className="badge bg-amber-100 text-amber-800">
      ⏳ Awaiting Final QC
    </span>
  );
  if (latest) {
    if (latest.outcome === "PASS") {
      statusBadge = isFresh ? (
        <span className="badge bg-emerald-100 text-emerald-800 font-bold">
          ✓ QC Passed
        </span>
      ) : (
        <span className="badge bg-amber-100 text-amber-800">
          ⚠️ QC Stale (Re-inspection required)
        </span>
      );
    } else if (latest.outcome === "REWORK") {
      statusBadge = (
        <span className="badge bg-amber-100 text-amber-800 font-semibold">
          🔄 Rework Required
        </span>
      );
    } else if (latest.outcome === "HOLD") {
      statusBadge = (
        <span className="badge bg-rose-100 text-rose-800 font-semibold">
          ⏸️ Quality Hold
        </span>
      );
    } else if (latest.outcome === "FAIL") {
      statusBadge = (
        <span className="badge bg-red-100 text-red-800 font-bold">
          ✗ QC Rejected
        </span>
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Current QC Status Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-cream rounded-lg border border-line">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">QC Status</p>
          <div className="flex items-center gap-2">
            {statusBadge}
            {latest ? (
              <span className="text-xs text-muted">
                Last checked by {latest.inspectorName || latest.inspector?.name || "Staff"} on {fmtDateTime(latest.createdAt)}
              </span>
            ) : null}
          </div>
        </div>
        {latest?.measuredWeightG ? (
          <div className="text-right">
            <span className="text-xs text-muted">Verified Weight: </span>
            <strong className="text-sm text-ink">{fmtWeight(latest.measuredWeightG)}</strong>
            {latest.weightDeltaG ? (
              <span className="text-xs text-muted ml-1">
                ({fmtSignedWeight(latest.weightDeltaG)})
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {canInspect ? (
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Inspection Outcome" hint="Select explicitly">
              <select
                className="select"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                disabled={busy}
              >
                {QC_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o === "PASS"
                      ? "PASS — Approved for finished goods"
                      : o === "REWORK"
                      ? "REWORK — Corrective processing needed"
                      : o === "HOLD"
                      ? "HOLD — Quality hold pending review"
                      : "FAIL — Rejected / Scrapped"}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Verified Final Weight (g)"
              hint={outcome === "PASS" ? "Required for PASS" : "Optional"}
            >
              <input
                className="input"
                type="number"
                min={1}
                value={measuredWeight}
                onChange={(e) => setMeasuredWeight(e.target.value)}
                disabled={busy}
                placeholder="Scale net weight in grams"
              />
            </Field>
          </div>

          {/* Measurements grid */}
          <div className="p-3 bg-cream/50 rounded-lg border border-line space-y-3">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Finished Goods Measurements</span>
              {yarnSpecs ? <span>Order Spec: {yarnSpecs}</span> : null}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Field label="Ply Count" hint={isYarn ? "e.g. 2, 3" : "Yarn only"}>
                <input
                  className="input text-xs"
                  type="number"
                  min={1}
                  max={32}
                  value={actualPly}
                  onChange={(e) => setActualPly(e.target.value)}
                  disabled={busy}
                  placeholder="Ply"
                />
              </Field>

              <Field label="Twist" hint="S / Z / Balanced">
                <select
                  className="select text-xs"
                  value={actualTwist}
                  onChange={(e) => setActualTwist(e.target.value)}
                  disabled={busy}
                >
                  <option value="">—</option>
                  {QC_TWIST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Total Yardage (m)" hint="Meters">
                <input
                  className="input text-xs"
                  type="number"
                  min={1}
                  value={totalYardage}
                  onChange={(e) => setTotalYardage(e.target.value)}
                  disabled={busy}
                  placeholder="Meters"
                />
              </Field>

              <Field label="Skein Count" hint="Units/Packages">
                <input
                  className="input text-xs"
                  type="number"
                  min={1}
                  value={skeinCount}
                  onChange={(e) => setSkeinCount(e.target.value)}
                  disabled={busy}
                  placeholder="Count"
                />
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <Field label="Visual Inspection Grade" hint="Surface & uniformity">
                <select
                  className="select"
                  value={visualGrade}
                  onChange={(e) => setVisualGrade(e.target.value)}
                  disabled={busy}
                >
                  {QC_VISUAL_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g === "PASS"
                        ? "PASS (Clean & uniform)"
                        : g === "MINOR_FLAW"
                        ? "MINOR FLAW (Acceptable)"
                        : "REJECT (Unacceptable defect)"}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Inspector Notes / Disposition"
                hint={["REWORK", "HOLD", "FAIL"].includes(outcome) ? "Mandatory reason" : "Optional"}
              >
                <input
                  className="input"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                  placeholder="Enter observation or disposition"
                />
              </Field>
            </div>
          </div>

          {message ? (
            <p
              className={`text-xs p-2.5 rounded-md ${
                message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
              }`}
            >
              {message.text}
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Recording QC..." : "Record QC Inspection"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted bg-cream rounded-lg p-3">
          This lot is {status.toLowerCase()} and cannot be inspected.
        </p>
      )}

      {/* Audit History Table */}
      {history.length > 0 ? (
        <div className="pt-3 border-t border-line space-y-2">
          <p className="text-xs font-semibold text-ink">QC Inspection History ({history.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-muted text-left">
                  <th className="py-1.5 font-medium">When</th>
                  <th className="py-1.5 font-medium">Outcome</th>
                  <th className="py-1.5 font-medium">Inspector</th>
                  <th className="py-1.5 font-medium">Weight (Δ)</th>
                  <th className="py-1.5 font-medium">Specs</th>
                  <th className="py-1.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-cream/40">
                    <td className="py-1.5 text-muted whitespace-nowrap">{fmtDateTime(h.createdAt)}</td>
                    <td className="py-1.5">
                      <span
                        className={`badge ${
                          h.outcome === "PASS"
                            ? "bg-emerald-100 text-emerald-800 font-bold"
                            : h.outcome === "REWORK"
                            ? "bg-amber-100 text-amber-800"
                            : h.outcome === "HOLD"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-red-100 text-red-800 font-bold"
                        }`}
                      >
                        {h.outcome}
                      </span>
                    </td>
                    <td className="py-1.5 text-muted">{h.inspectorName || h.inspector?.name || "—"}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      {h.measuredWeightG ? (
                        <>
                          <strong>{fmtWeight(h.measuredWeightG)}</strong>
                          {h.weightDeltaG ? (
                            <span className="text-muted ml-1">({fmtSignedWeight(h.weightDeltaG)})</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 text-muted">
                      {[
                        h.actualPly ? `${h.actualPly}-ply` : null,
                        h.actualTwist ? `${h.actualTwist} twist` : null,
                        h.totalYardageM ? `${h.totalYardageM}m` : null,
                        h.skeinCount ? `${h.skeinCount} skeins` : null,
                        h.visualGrade ? `Grade: ${h.visualGrade}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="py-1.5 text-muted max-w-44 truncate">{h.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
