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

describe("isAbnormalLoss (spec 2.5: >15 points above expected)", () => {
  it("flags loss far above expectation", () => {
    // Washing expects 35%; a 55% loss is 20 points over.
    expect(isAbnormalLoss(55, 35)).toBe(true);
  });

  it("accepts loss within expectation band", () => {
    expect(isAbnormalLoss(45, 35)).toBe(false); // exactly 10 points over
    expect(isAbnormalLoss(50, 35)).toBe(false); // exactly 15 points over — boundary
  });

  it("does not flag modest losses on low-expectation stages", () => {
    expect(isAbnormalLoss(5, 3)).toBe(false);
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
