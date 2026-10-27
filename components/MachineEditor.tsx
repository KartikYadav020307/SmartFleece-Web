"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/controls";
import { Badge } from "@/components/ui";

export type MachineRow = {
  id: string;
  name: string;
  type: string;
  capacityKg: number;
  status: string;
  notes: string | null;
  isActive: boolean;
};

const STATUS_VARIANT: Record<string, "green" | "amber" | "slate"> = {
  AVAILABLE: "green",
  IN_USE: "amber",
  MAINTENANCE: "slate",
};

/** Owner-only machine registry editor. */
export default function MachineEditor({ machines, isOwner }: { machines: MachineRow[]; isOwner: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newMachine, setNewMachine] = useState({ name: "", type: "Washer", capacityKg: "10", notes: "" });

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

  if (!isOwner) {
    return (
      <ul className="divide-y divide-line">
        {machines.map((m) => (
          <li key={m.id} className="py-2 flex items-center gap-3 text-sm">
            <span className="font-medium text-ink">{m.name}</span>
            <span className="text-muted">{m.type}</span>
            <Badge variant={STATUS_VARIANT[m.status] ?? "slate"}>{m.status.replaceAll("_", " ").toLowerCase()}</Badge>
          </li>
        ))}
        {machines.length === 0 ? <li className="py-2 text-sm text-muted">No machines registered.</li> : null}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-clay bg-clay-soft rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {machines.map((m) => (
          <li key={m.id} className={`flex flex-wrap items-center gap-2 border border-line rounded-lg px-3 py-2 bg-white ${!m.isActive ? "opacity-60" : ""}`}>
            <input
              className="input flex-1 min-w-36 py-1.5"
              defaultValue={m.name}
              onBlur={(e) => e.target.value.trim() !== m.name && call(`/api/machines/${m.id}`, "PATCH", { name: e.target.value.trim() })}
            />
            <input
              className="input w-32 py-1.5"
              defaultValue={m.type}
              onBlur={(e) => e.target.value.trim() !== m.type && call(`/api/machines/${m.id}`, "PATCH", { type: e.target.value.trim() })}
            />
            <label className="flex items-center gap-1.5 text-xs text-muted whitespace-nowrap">
              capacity kg
              <input
                className="input w-16 py-1.5"
                type="number"
                min={0}
                defaultValue={m.capacityKg}
                onBlur={(e) => Number(e.target.value) !== m.capacityKg && call(`/api/machines/${m.id}`, "PATCH", { capacityKg: Number(e.target.value) })}
              />
            </label>
            <select
              className="input w-36 py-1.5"
              value={m.status}
              onChange={(e) => call(`/api/machines/${m.id}`, "PATCH", { status: e.target.value })}
            >
              {["AVAILABLE", "IN_USE", "MAINTENANCE"].map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#3e6b4e]"
                checked={m.isActive}
                onChange={(e) => call(`/api/machines/${m.id}`, "PATCH", { isActive: e.target.checked })}
              />
              active
            </label>
            <ConfirmButton
              className="btn-ghost btn-sm"
              confirmLabel="Delete?"
              onConfirm={async () => {
                const ok = await call(`/api/machines/${m.id}`, "DELETE");
                if (ok) router.refresh();
              }}
            >
              ✕
            </ConfirmButton>
          </li>
        ))}
        {machines.length === 0 ? <li className="text-sm text-muted py-2">No machines yet — add your washer, carder, spinning frames…</li> : null}
      </ul>

      <form
        className="flex flex-wrap gap-2 items-end border-t border-line pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newMachine.name.trim()) return;
          const ok = await call("/api/machines", "POST", {
            ...newMachine,
            capacityKg: Number(newMachine.capacityKg) || 0,
          });
          if (ok) {
            setNewMachine({ name: "", type: newMachine.type, capacityKg: newMachine.capacityKg, notes: "" });
            router.refresh();
          }
        }}
      >
        <div className="flex-1 min-w-36">
          <label className="label">Add machine</label>
          <input className="input" value={newMachine.name} onChange={(e) => setNewMachine((m) => ({ ...m, name: e.target.value }))} placeholder="e.g. Washer #2" />
        </div>
        <div>
          <label className="label">Type</label>
          <input className="input w-32" value={newMachine.type} onChange={(e) => setNewMachine((m) => ({ ...m, type: e.target.value }))} />
        </div>
        <div>
          <label className="label">Capacity kg</label>
          <input className="input w-20" type="number" min={0} value={newMachine.capacityKg} onChange={(e) => setNewMachine((m) => ({ ...m, capacityKg: e.target.value }))} />
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !newMachine.name.trim()}>
          Add machine
        </button>
      </form>
      <p className="text-xs text-muted">
        Machines with production history can be deactivated instead of deleted. Workers pick a machine
        from this registry when recording stage events.
      </p>
    </div>
  );
}
