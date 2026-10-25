"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/controls";

export type StageRow = {
  id: string;
  name: string;
  sequence: number;
  optional: boolean;
  expectedLossPct: number;
  isActive: boolean;
};

/** Owner-only pipeline editor: reorder, edit, add, deactivate or delete stages. */
export default function StageEditor({ stages }: { stages: StageRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(stages);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newStage, setNewStage] = useState({ name: "", expectedLossPct: "0" });

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Update failed");
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    const ok = await call("/api/stages/reorder", "PUT", { ids: next.map((r) => r.id) });
    if (ok) router.refresh();
    else setRows(rows);
  }

  async function patchStage(id: string, patch: Record<string, unknown>) {
    const ok = await call(`/api/stages/${id}`, "PATCH", patch);
    if (ok) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } as StageRow : r)));
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-clay bg-clay-soft rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {rows.map((stage, i) => (
          <li key={stage.id} className={`flex flex-wrap items-center gap-2 border border-line rounded-lg px-3 py-2 bg-white ${!stage.isActive ? "opacity-60" : ""}`}>
            <div className="flex flex-col gap-0.5">
              <button type="button" className="btn-ghost btn-sm px-1.5 py-0" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
              <button type="button" className="btn-ghost btn-sm px-1.5 py-0" disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
            </div>
            <span className="text-xs text-muted w-6 text-center">{i + 1}</span>
            <input
              className="input flex-1 min-w-40 py-1.5"
              defaultValue={stage.name}
              onBlur={(e) => e.target.value.trim() !== stage.name && patchStage(stage.id, { name: e.target.value.trim() })}
            />
            <label className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap">
              expected loss %
              <input
                className="input w-16 py-1.5"
                type="number"
                min={0}
                max={100}
                defaultValue={stage.expectedLossPct}
                onBlur={(e) => Number(e.target.value) !== stage.expectedLossPct && patchStage(stage.id, { expectedLossPct: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#3e6b4e]"
                checked={stage.optional}
                onChange={(e) => patchStage(stage.id, { optional: e.target.checked })}
              />
              optional
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#3e6b4e]"
                checked={stage.isActive}
                onChange={(e) => patchStage(stage.id, { isActive: e.target.checked })}
              />
              active
            </label>
            <ConfirmButton
              className="btn-ghost btn-sm"
              confirmLabel="Delete?"
              onConfirm={async () => {
                const ok = await call(`/api/stages/${stage.id}`, "DELETE");
                if (ok) {
                  setRows((rs) => rs.filter((r) => r.id !== stage.id));
                  router.refresh();
                }
              }}
            >
              ✕
            </ConfirmButton>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-wrap gap-2 items-end border-t border-line pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newStage.name.trim()) return;
          const ok = await call("/api/stages", "POST", {
            name: newStage.name.trim(),
            expectedLossPct: Number(newStage.expectedLossPct) || 0,
          });
          if (ok) {
            setNewStage({ name: "", expectedLossPct: "0" });
            router.refresh();
          }
        }}
      >
        <div className="flex-1 min-w-48">
          <label className="label">Add a new stage</label>
          <input
            className="input"
            value={newStage.name}
            onChange={(e) => setNewStage((s) => ({ ...s, name: e.target.value }))}
            placeholder='e.g. "Dyeing"'
          />
        </div>
        <div>
          <label className="label">Expected loss %</label>
          <input
            className="input w-24"
            type="number"
            min={0}
            max={100}
            value={newStage.expectedLossPct}
            onChange={(e) => setNewStage((s) => ({ ...s, expectedLossPct: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !newStage.name.trim()}>
          Add stage
        </button>
      </form>
      <p className="text-xs text-muted">
        Stages with production history cannot be deleted — deactivate them instead. Lot progress
        uses the active stages in this exact order.
      </p>
    </div>
  );
}
