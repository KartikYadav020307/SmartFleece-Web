"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export type FlagView = {
  id: string;
  flagType: string;
  severity: string;
  notes: string | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | string | null;
  createdAt: Date | string;
  lotCode?: string;
  lotId?: string;
};

export default function FlagList({ flags, showLot = false }: { flags: FlagView[]; showLot?: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (flags.length === 0) {
    return <p className="text-sm text-muted">No quality flags — clean as a fresh fleece.</p>;
  }

  return (
    <div>
      {error ? <p className="text-xs text-clay mb-2">{error}</p> : null}
      <ul className="divide-y divide-line">
        {flags.map((flag) => (
          <li key={flag.id} className="py-2.5 flex flex-wrap items-center gap-2">
            <Badge variant={flag.severity === "HIGH" ? "clay" : flag.severity === "MEDIUM" ? "amber" : "slate"}>
              {flag.flagType}
            </Badge>
            {showLot && flag.lotCode ? (
              <a href={`/lots/${flag.lotId}`} className="text-sm font-semibold text-forest hover:underline">
                {flag.lotCode}
              </a>
            ) : null}
            <span className="text-sm text-muted flex-1 min-w-40 truncate">{flag.notes ?? "No details"}</span>
            <span className="text-xs text-muted whitespace-nowrap">{fmtDateTime(flag.createdAt)}</span>
            {flag.status === "OPEN" ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busyId === flag.id}
                onClick={async () => {
                  setBusyId(flag.id);
                  setError(null);
                  try {
                    const res = await fetch(`/api/quality-flags/${flag.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "RESOLVED" }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setError(data.error ?? "Could not resolve flag");
                      return;
                    }
                    router.refresh();
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                Resolve
              </button>
            ) : (
              <span className="text-xs text-forest-dark">
                ✓ resolved{flag.resolvedBy ? ` by ${flag.resolvedBy}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
