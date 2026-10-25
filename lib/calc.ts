// Pure calculation helpers (no database) — unit tested in tests/calc.test.ts.

export const LOSS_DEVIATION_THRESHOLD = 15;

/** Weight loss percentage for a stage transition. Negative = weight gain. */
export function weightLossPct(inputG: number, outputG: number): number {
  if (inputG <= 0) return 0;
  return ((inputG - outputG) / inputG) * 100;
}

/**
 * Spec 2.5: alert when actual loss is more than 15 percentage points above
 * the expected loss for the stage/fiber.
 */
export function isAbnormalLoss(actualLossPct: number, expectedLossPct: number): boolean {
  return actualLossPct > expectedLossPct + LOSS_DEVIATION_THRESHOLD;
}

/** Overall clean yield % of a completed lot (finished / grease × 100). */
export function cleanYieldPct(greaseWeightG: number, finishedWeightG: number): number | null {
  if (greaseWeightG <= 0) return null;
  return (finishedWeightG / greaseWeightG) * 100;
}
