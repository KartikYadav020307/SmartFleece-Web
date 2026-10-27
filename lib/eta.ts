// Rule-based ETA engine (Module 3). Pure math, unit-tested in
// tests/eta.test.ts — the server-side data assembly lives in lib/insights.ts.
//
// Model: for every lot, consecutive completed stage events give a wall-clock
// sample per stage — hours elapsed divided by that event's output kg. The
// median across samples is robust to one-off delays. A stage's estimate for a
// lot is (median hours/kg × lot kg) plus a queue penalty of one median stage
// duration per other lot already waiting at that stage. Stages without any
// history fall back to the mill-wide median, and the ± confidence comes from
// the historical spread of the stages involved.

export type StageSample = {
  stageId: string;
  hoursPerKg: number; // elapsed hours / output kg of the earlier event
  elapsedHours: number;
};

export type StageStats = {
  stageId: string;
  samples: number;
  medianHoursPerKg: number;
  medianStageHours: number;
  spreadHoursPerKg: number; // max − min of samples (0 when < 2 samples)
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildStageStats(samples: StageSample[]): Map<string, StageStats> {
  const byStage = new Map<string, StageSample[]>();
  for (const s of samples) {
    const list = byStage.get(s.stageId) ?? [];
    list.push(s);
    byStage.set(s.stageId, list);
  }
  const stats = new Map<string, StageStats>();
  for (const [stageId, list] of byStage) {
    const hPerKg = list.map((s) => s.hoursPerKg);
    const hTotal = list.map((s) => s.elapsedHours);
    stats.set(stageId, {
      stageId,
      samples: list.length,
      medianHoursPerKg: median(hPerKg) ?? 0,
      medianStageHours: median(hTotal) ?? 0,
      spreadHoursPerKg: hPerKg.length >= 2 ? Math.max(...hPerKg) - Math.min(...hPerKg) : 0,
    });
  }
  return stats;
}

export type RemainingStage = { stageId: string; lotsWaiting: number };

export type EtaResult = {
  hours: number;
  confidenceDays: number;
  basedOnSamples: number;
  fallbackStages: number;
};

/**
 * Estimated remaining hours for one lot through the given stages.
 * Falls back to the mill-wide median hours/kg (and median stage hours for
 * queue penalties) for stages with no history.
 */
export function estimateLotHours(
  remainingStages: RemainingStage[],
  lotWeightKg: number,
  stats: Map<string, StageStats>,
  fallback: { hoursPerKg: number; stageHours: number }
): EtaResult {
  let hours = 0;
  let spreadHours = 0;
  let basedOnSamples = 0;
  let fallbackStages = 0;

  for (const stage of remainingStages) {
    const s = stats.get(stage.stageId);
    const perKg = s && s.samples > 0 ? s.medianHoursPerKg : fallback.hoursPerKg;
    const stageHours = s && s.samples > 0 ? s.medianStageHours : fallback.stageHours;
    if (!s || s.samples === 0) fallbackStages++;
    else basedOnSamples += s.samples;

    hours += perKg * lotWeightKg + stage.lotsWaiting * stageHours;
    if (s) spreadHours += (s.spreadHoursPerKg * lotWeightKg) / 2;
  }

  // ± days: half the observed spread; when history is thin, ±25% of the
  // estimate. Never less than half a day.
  const confidenceHours = spreadHours > 0 ? spreadHours : hours * 0.25;
  const confidenceDays = Math.max(0.5, confidenceHours / 24);
  return { hours, confidenceDays, basedOnSamples, fallbackStages };
}

/** Sum of median stage hours across all stages — the fallback when a stage has no history. */
export function millFallback(stats: Map<string, StageStats>): { hoursPerKg: number; stageHours: number } {
  const perKg = [...stats.values()].map((s) => s.medianHoursPerKg).filter((v) => v > 0);
  const stageHours = [...stats.values()].map((s) => s.medianStageHours).filter((v) => v > 0);
  return {
    hoursPerKg: median(perKg) ?? 24, // 24 h/kg if the mill has no history at all
    stageHours: median(stageHours) ?? 8,
  };
}
