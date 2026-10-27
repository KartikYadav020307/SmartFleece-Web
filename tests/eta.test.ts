import { describe, expect, it } from "vitest";
import {
  buildStageStats,
  estimateLotHours,
  median,
  millFallback,
  type StageSample,
} from "../lib/eta";
import {
  BATCH_CUTOFF_SEQUENCE,
  groupBatchCandidates,
  machineUtilization,
  type BatchCandidateLot,
} from "../lib/insights";

describe("median", () => {
  it("handles odd, even and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("buildStageStats", () => {
  const samples: StageSample[] = [
    { stageId: "wash", hoursPerKg: 2, elapsedHours: 10 },
    { stageId: "wash", hoursPerKg: 4, elapsedHours: 20 }, // outlier pulls spread, not median
    { stageId: "wash", hoursPerKg: 3, elapsedHours: 15 },
    { stageId: "card", hoursPerKg: 1, elapsedHours: 5 },
  ];

  it("computes per-stage medians and spread", () => {
    const stats = buildStageStats(samples);
    const wash = stats.get("wash")!;
    expect(wash.samples).toBe(3);
    expect(wash.medianHoursPerKg).toBe(3);
    expect(wash.medianStageHours).toBe(15);
    expect(wash.spreadHoursPerKg).toBeCloseTo(2); // 4 − 2
    expect(stats.get("card")!.spreadHoursPerKg).toBe(0); // single sample
  });
});

describe("estimateLotHours", () => {
  const stats = buildStageStats([
    { stageId: "wash", hoursPerKg: 2, elapsedHours: 10 },
    { stageId: "wash", hoursPerKg: 4, elapsedHours: 20 },
    { stageId: "card", hoursPerKg: 1, elapsedHours: 8 },
  ]);
  const fallback = { hoursPerKg: 24, stageHours: 8 };

  it("uses median hours/kg × lot kg plus queue penalty per waiting lot", () => {
    // wash: 3 h/kg × 4 kg = 12 h + 2 waiting × 15 h = 30 → 42
    // card: 1 h/kg × 4 kg = 4 h + 1 waiting × 8 h = 8 → 12
    const r = estimateLotHours(
      [
        { stageId: "wash", lotsWaiting: 2 },
        { stageId: "card", lotsWaiting: 1 },
      ],
      4,
      stats,
      fallback
    );
    expect(r.hours).toBeCloseTo(54);
    expect(r.basedOnSamples).toBe(3); // 2 wash samples + 1 card sample
    expect(r.fallbackStages).toBe(0);
  });

  it("falls back to mill medians for stages without history", () => {
    const r = estimateLotHours([{ stageId: "dye", lotsWaiting: 0 }], 2, stats, fallback);
    expect(r.hours).toBeCloseTo(48); // 24 h/kg × 2 kg
    expect(r.fallbackStages).toBe(1);
    expect(r.basedOnSamples).toBe(0);
  });

  it("derives confidence from spread, floored at half a day", () => {
    const r = estimateLotHours(
      [{ stageId: "wash", lotsWaiting: 0 }],
      4,
      stats,
      fallback
    );
    // spread 2 h/kg × 4 kg / 2 = 4 h → 4/24 ≈ 0.17 → floored to 0.5
    expect(r.confidenceDays).toBe(0.5);
  });
});

describe("millFallback", () => {
  it("returns mill-wide medians, with 24/8 defaults when empty", () => {
    const stats = buildStageStats([
      { stageId: "a", hoursPerKg: 2, elapsedHours: 10 },
      { stageId: "b", hoursPerKg: 6, elapsedHours: 12 },
    ]);
    expect(millFallback(stats)).toEqual({ hoursPerKg: 4, stageHours: 11 });
    expect(millFallback(new Map())).toEqual({ hoursPerKg: 24, stageHours: 8 });
  });
});

describe("groupBatchCandidates (spec 7.3)", () => {
  const lot = (over: Partial<BatchCandidateLot>): BatchCandidateLot => ({
    id: "x",
    lotCode: "LOT-X",
    fiberType: "Merino Wool",
    color: "White",
    currentWeightG: 1000,
    stageSequence: 0,
    ...over,
  });

  it("groups 2+ similar early-stage lots and sums weight", () => {
    const suggestions = groupBatchCandidates([
      lot({ id: "1", lotCode: "LOT-A" }),
      lot({ id: "2", lotCode: "LOT-B", currentWeightG: 3000 }),
      lot({ id: "3", lotCode: "LOT-C", fiberType: "Huacaya Alpaca" }),
      lot({ id: "4", lotCode: "LOT-D", fiberType: "Huacaya Alpaca", color: "Brown" }),
    ]);
    // Merino White ×2 and Alpaca Brown ×1 (single → filtered)
    expect(suggestions).toHaveLength(1);
    const merino = suggestions[0];
    expect(merino.fiberType).toBe("Merino Wool");
    expect(merino.lots).toHaveLength(2);
    expect(merino.totalWeightG).toBe(4000);
  });

  it("ignores lots already at or past the Carding cutoff", () => {
    const suggestions = groupBatchCandidates([
      lot({ id: "1" }),
      lot({ id: "2", stageSequence: BATCH_CUTOFF_SEQUENCE }),
    ]);
    expect(suggestions).toHaveLength(0);
  });

  it("treats different colors as different groups", () => {
    const suggestions = groupBatchCandidates([
      lot({ id: "1", color: "White" }),
      lot({ id: "2", color: "Black" }),
    ]);
    expect(suggestions).toHaveLength(0);
  });
});

describe("machineUtilization (spec 7.2)", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const machines = [
    { id: "m1", name: "Washer #1", type: "Washer", status: "IN_USE", isActive: true },
    { id: "m2", name: "Carder #1", type: "Carder", status: "AVAILABLE", isActive: true },
  ];

  it("sums last-7-day output per machine and excludes old/null events", () => {
    const rows = machineUtilization(
      machines,
      [
        { machineId: "m1", outputWeightG: 3000, createdAt: new Date(now.getTime() - 86_400_000) },
        { machineId: "m1", outputWeightG: 1500, createdAt: new Date(now.getTime() - 2 * 86_400_000) },
        { machineId: "m1", outputWeightG: 5000, createdAt: new Date(now.getTime() - 9 * 86_400_000) }, // too old
        { machineId: "m2", outputWeightG: null, createdAt: now }, // skipped event
        { machineId: null, outputWeightG: 9000, createdAt: now }, // no machine
      ],
      now
    );
    const m1 = rows.find((r) => r.machine.id === "m1")!;
    expect(m1.kgLast7Days).toBe(4.5);
    expect(m1.eventsLast7Days).toBe(2);
    const m2 = rows.find((r) => r.machine.id === "m2")!;
    expect(m2.kgLast7Days).toBe(0);
    expect(m2.eventsLast7Days).toBe(0);
  });
});
