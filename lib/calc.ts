// Pure calculation helpers (no database) — unit tested in tests/calc.test.ts.

export const LOSS_DEVIATION_THRESHOLD = 15;

/** Weight loss percentage for a stage transition. Negative = weight gain. */
export function weightLossPct(inputG: number, outputG: number): number {
  if (inputG <= 0) return 0;
  return ((inputG - outputG) / inputG) * 100;
}

/**
 * Spec 2.5: alert when actual weight loss deviates from the stage's expected
 * loss by more than 15 percentage points in EITHER direction — above expected
 * (excessive shrinkage) or below expected (abnormally low loss: possible
 * scale error or mis-scan). Weight gain registers as a negative loss and
 * trips the low side wherever the stage expects meaningful loss (e.g. any
 * gain during Washing). On stages with 0% expected loss, sub-threshold
 * moisture-regain noise stays unflagged to avoid alarm fatigue. The 15-point
 * unit is the tolerance the specification already establishes for the high
 * side; no separate constant is introduced.
 */
export function isAbnormalLoss(actualLossPct: number, expectedLossPct: number): boolean {
  return Math.abs(actualLossPct - expectedLossPct) > LOSS_DEVIATION_THRESHOLD;
}

/** Overall clean yield % of a completed lot (finished / grease × 100). */
export function cleanYieldPct(greaseWeightG: number, finishedWeightG: number): number | null {
  if (greaseWeightG <= 0) return null;
  return (finishedWeightG / greaseWeightG) * 100;
}
