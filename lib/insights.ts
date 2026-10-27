// Pure insight helpers (no database) — unit tested in tests/eta.test.ts.
// Server-side data assembly lives in lib/production.ts and the pages.

export type BatchCandidateLot = {
  id: string;
  lotCode: string;
  fiberType: string;
  color: string | null;
  currentWeightG: number;
  stageSequence: number;
};

export type BatchSuggestion = {
  key: string;
  fiberType: string;
  color: string | null;
  lots: BatchCandidateLot[];
  totalWeightG: number;
};

/**
 * Spec 7.3: group queued lots that could share a processing run. Only lots
 * still early in the pipeline (before Carding, sequence < 7) are candidates;
 * groups of 2+ become suggestions. Blending itself stays a deliberate user
 * action through the lot page.
 */
export const BATCH_CUTOFF_SEQUENCE = 7; // Carding

export function groupBatchCandidates(lots: BatchCandidateLot[]): BatchSuggestion[] {
  const groups = new Map<string, BatchCandidateLot[]>();
  for (const lot of lots) {
    if (lot.stageSequence >= BATCH_CUTOFF_SEQUENCE) continue;
    const key = `${lot.fiberType}|${lot.color ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(lot);
    groups.set(key, list);
  }
  return [...groups.values()]
    .filter((list) => list.length >= 2)
    .map((list) => ({
      key: list[0].fiberType + (list[0].color ? ` · ${list[0].color}` : ""),
      fiberType: list[0].fiberType,
      color: list[0].color,
      lots: [...list].sort((a, b) => b.currentWeightG - a.currentWeightG),
      totalWeightG: list.reduce((acc, l) => acc + l.currentWeightG, 0),
    }))
    .sort((a, b) => b.totalWeightG - a.totalWeightG);
}

export type MachineRow = { id: string; name: string; type: string; status: string; isActive: boolean };
export type MachineUsageEvent = { machineId: string | null; outputWeightG: number | null; createdAt: Date | string };

export type MachineUtilization = {
  machine: MachineRow;
  kgLast7Days: number;
  eventsLast7Days: number;
};

/** Spec 7.2: kg processed per machine over the last 7 days, from stage events. */
export function machineUtilization(
  machines: MachineRow[],
  events: MachineUsageEvent[],
  now: Date = new Date()
): MachineUtilization[] {
  const cutoff = now.getTime() - 7 * 86_400_000;
  return machines.map((machine) => {
    const mine = events.filter(
      (e) =>
        e.machineId === machine.id &&
        e.outputWeightG != null &&
        new Date(e.createdAt).getTime() >= cutoff
    );
    const kg = mine.reduce((acc, e) => acc + (e.outputWeightG ?? 0), 0) / 1000;
    return { machine, kgLast7Days: Math.round(kg * 100) / 100, eventsLast7Days: mine.length };
  });
}
