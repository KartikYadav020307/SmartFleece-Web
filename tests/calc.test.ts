import { describe, expect, it } from "vitest";
import { cleanYieldPct, isAbnormalLoss, weightLossPct } from "../lib/calc";

describe("weightLossPct", () => {
  it("computes loss percentage", () => {
    expect(weightLossPct(1000, 700)).toBeCloseTo(30);
    expect(weightLossPct(4000, 2400)).toBeCloseTo(40);
  });

  it("returns negative for weight gain", () => {
    expect(weightLossPct(1000, 1050)).toBeCloseTo(-5);
  });

  it("handles zero input safely", () => {
    expect(weightLossPct(0, 100)).toBe(0);
  });
});

describe("isAbnormalLoss (spec 2.5: symmetric ±15-point deviation band)", () => {
  it("accepts normal expected loss", () => {
    expect(isAbnormalLoss(35, 35)).toBe(false);
  });

  it("flags loss far above expectation", () => {
    // Washing expects 35%; a 55% loss is 20 points over.
    expect(isAbnormalLoss(55, 35)).toBe(true);
  });

  it("flags abnormally low loss (possible scale error or mis-scan)", () => {
    // Washing expects 35%; only 10% lost is 25 points under.
    expect(isAbnormalLoss(10, 35)).toBe(true);
  });

  it("flags weight gain where meaningful loss is expected", () => {
    expect(isAbnormalLoss(-5, 35)).toBe(true);
  });

  it("treats exactly ±15 points as within tolerance (existing boundary)", () => {
    expect(isAbnormalLoss(50, 35)).toBe(false); // exactly 15 over
    expect(isAbnormalLoss(45, 35)).toBe(false); // 10 over
    expect(isAbnormalLoss(20, 35)).toBe(false); // exactly 15 under
  });

  it("tolerates sub-threshold moisture noise on zero-expected stages", () => {
    expect(isAbnormalLoss(1, 0)).toBe(false);
    expect(isAbnormalLoss(-3, 0)).toBe(false); // small regain
  });

  it("flags implausible large gain on zero-expected stages", () => {
    expect(isAbnormalLoss(-16, 0)).toBe(true);
  });

  it("zero input weight yields 0% (call-site guard skips evaluation)", () => {
    expect(weightLossPct(0, 500)).toBe(0);
  });
});

describe("cleanYieldPct", () => {
  it("computes finished yield against grease weight", () => {
    expect(cleanYieldPct(4200, 2210)).toBeCloseTo(52.62);
  });

  it("returns null for invalid grease weight", () => {
    expect(cleanYieldPct(0, 100)).toBeNull();
  });
});
