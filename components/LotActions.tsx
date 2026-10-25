"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/controls";
import { Badge, LotStatusBadge } from "@/components/ui";
import { LOT_STATUSES, FIBER_TYPES } from "@/lib/constants";
import { fmtWeight } from "@/lib/format";
import type { LineageNode } from "@/lib/lineage";

/** Put a lot on hold / release / cancel. */
export function LotStatusControls({ lotId, status }: { lotId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: string) {
    setBusy(true);
    try {
      await fetch(`/api/lots/${lotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <LotStatusBadge status={status} />
      {status === "ON_HOLD" ? (
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => setStatus("IN_PRODUCTION")}>
          Release hold
        </button>
      ) : status === "PENDING" || status === "IN_PRODUCTION" ? (
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => setStatus("ON_HOLD")}>
          Put on hold
        </button>
      ) : null}
      {status !== "CANCELLED" && status !== "COMPLETED" && status !== "CONSUMED" ? (
        <ConfirmButton
          className="btn-ghost btn-sm"
          confirmLabel="Really cancel?"
          onConfirm={() => setStatus("CANCELLED")}
        >
          Cancel lot
        </ConfirmButton>
      ) : null}
    </div>
  );
}

/** Undo the most recent stage event (auditable correction). */
export function UndoStageButton({ lotId, disabled }: { lotId: string; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (disabled) return null;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <ConfirmButton
        className="btn-ghost btn-sm"
        confirmLabel="Really undo last stage?"
        onConfirm={async () => {
          setError(null);
          const res = await fetch(`/api/lots/${lotId}/undo`, { method: "POST" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? "Undo failed");
            return;
          }
          router.refresh();
        }}
      >
        ↩ Undo last stage
      </ConfirmButton>
      {error ? <span className="text-xs text-clay">{error}</span> : null}
    </span>
  );
}

/** Split the current lot into 2+ children (partial split keeps remainder on parent). */
export function SplitForm({ lotId, currentWeightG }: { lotId: string; currentWeightG: number }) {
  const router = useRouter();
  const [rows, setRows] = useState([
    { weightG: "", notes: "" },
    { weightG: "", notes: "" },
  ]);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const total = rows.reduce((acc, r) => acc + (Number(r.weightG) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input"
              type="number"
              min={1}
              placeholder="weight (g)"
              value={row.weightG}
              onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, weightG: e.target.value } : r)))}
            />
            <input
              className="input"
              placeholder="note (optional)"
              value={row.notes}
              onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, notes: e.target.value } : r)))}
            />
            {rows.length > 2 ? (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                ✕
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => rows.length < 6 && setRows((rs) => [...rs, { weightG: "", notes: "" }])}
        >
          + child lot
        </button>
        <span className={`text-xs ${total > currentWeightG ? "text-clay font-semibold" : "text-muted"}`}>
          {fmtWeight(total)} of {fmtWeight(currentWeightG)} allocated
          {total < currentWeightG ? ` — ${fmtWeight(currentWeightG - total)} stays on this lot` : ""}
        </span>
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
      <button
        type="button"
        className="btn-primary"
        disabled={busy || total === 0 || total > currentWeightG || rows.some((r) => !r.weightG)}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            const res = await fetch("/api/lineage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "SPLIT",
                parentId: lotId,
                children: rows.map((r) => ({ weightG: r.weightG, notes: r.notes || undefined })),
              }),
            });
            const data = await res.json();
            if (!res.ok) {
              setMessage({ kind: "err", text: data.error ?? "Split failed" });
              return;
            }
            router.push(`/lots/${data.childIds[0]}`);
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Splitting…" : "Split lot"}
      </button>
    </div>
  );
}

/** Blend this lot with 1+ other active lots into a new batch. */
export function BlendForm({
  lotId,
  currentWeightG,
  candidates,
}: {
  lotId: string;
  currentWeightG: number;
  candidates: { id: string; lotCode: string; fiberType: string; customerName: string; currentWeightG: number; stageName: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [fiberType, setFiberType] = useState("Blend");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted bg-cream rounded-lg p-3">
        No other active lots available to blend with this one.
      </p>
    );
  }

  const totalBlend = currentWeightG + selected.reduce((acc, id) => acc + (candidates.find((c) => c.id === id)?.currentWeightG ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="max-h-56 overflow-y-auto border border-line rounded-lg divide-y divide-line">
        {candidates.map((c) => (
          <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-cream/60 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#3e6b4e]"
              checked={selected.includes(c.id)}
              onChange={(e) =>
                setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id)))
              }
            />
            <span className="font-semibold text-ink text-sm">{c.lotCode}</span>
            <span className="text-xs text-muted flex-1 truncate">
              {c.customerName} · {c.fiberType} · at {c.stageName}
            </span>
            <span className="text-xs text-muted whitespace-nowrap">{fmtWeight(c.currentWeightG)}</span>
          </label>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Batch fiber type</label>
          <select className="input" value={fiberType} onChange={(e) => setFiberType(e.target.value)}>
            {FIBER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. shared wash run W-14" />
        </div>
      </div>
      <p className="text-xs text-muted">
        Batch will weigh {fmtWeight(totalBlend)} and continue at the furthest stage any parent reached.
        Blended lots are marked consumed; the batch keeps full lineage to every parent.
      </p>
      {message ? (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            message.kind === "ok" ? "bg-forest-soft text-forest-dark" : "bg-clay-soft text-clay"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <button
        type="button"
        className="btn-primary"
        disabled={busy || selected.length === 0}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            const res = await fetch("/api/lineage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "BLEND",
                lotIds: [lotId, ...selected],
                fiberType,
                notes: notes || undefined,
              }),
            });
            const data = await res.json();
            if (!res.ok) {
              setMessage({ kind: "err", text: data.error ?? "Blend failed" });
              return;
            }
            router.push(`/lots/${data.batchId}`);
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Blending…" : `Blend ${selected.length + 1} lots`}
      </button>
    </div>
  );
}

/** Recursive lineage tree display (shared for ancestors/descendants). */
export function LineageTreeView({
  nodes,
  depth = 0,
  edgeLabel,
}: {
  nodes: LineageNode[];
  depth?: number;
  edgeLabel?: string;
}) {
  if (nodes.length === 0) {
    return <p className="text-sm text-muted">None recorded.</p>;
  }
  return (
    <ul className={depth === 0 ? "space-y-1.5" : "space-y-1.5 mt-1.5 border-l border-line pl-4"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`/lots/${node.id}`} className="text-sm font-semibold text-forest hover:underline">
              {node.lotCode}
            </a>
            {node.isBatch ? <Badge variant="terra">batch</Badge> : null}
            <Badge variant="outline">{node.status.replaceAll("_", " ").toLowerCase()}</Badge>
            <span className="text-xs text-muted truncate">
              {node.customerName} · {node.fiberType} · {fmtWeight(node.currentWeightG)}
              {node.contributionG ? ` · contributed ${fmtWeight(node.contributionG)}` : ""}
            </span>
          </div>
          {node.children.length > 0 ? (
            <LineageTreeView nodes={node.children} depth={depth + 1} edgeLabel={edgeLabel} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
