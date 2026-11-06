import { describe, expect, it } from "vitest";
import { qcInspectionSchema } from "../lib/validation";
import { isQCFresh } from "../lib/qc";
import { generateStoryToken, resolveStoryToken } from "../lib/story-token";
import { createHmac } from "crypto";

describe("Structured Finished-Goods QC Validation", () => {
  it("requires measuredWeightG when outcome is PASS", () => {
    const res = qcInspectionSchema.safeParse({
      outcome: "PASS",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes("measuredWeightG"))).toBe(true);
    }
  });

  it("rejects non-positive measuredWeightG", () => {
    const res = qcInspectionSchema.safeParse({
      outcome: "PASS",
      measuredWeightG: 0,
    });
    expect(res.success).toBe(false);

    const resNeg = qcInspectionSchema.safeParse({
      outcome: "PASS",
      measuredWeightG: -100,
    });
    expect(resNeg.success).toBe(false);
  });

  it("rejects outcome PASS when visualGrade is REJECT", () => {
    const res = qcInspectionSchema.safeParse({
      outcome: "PASS",
      measuredWeightG: 4500,
      visualGrade: "REJECT",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("Cannot mark outcome as PASS when visual grade is REJECT"))).toBe(true);
    }
  });

  it("accepts outcome PASS when visualGrade is MINOR_FLAW", () => {
    const res = qcInspectionSchema.safeParse({
      outcome: "PASS",
      measuredWeightG: 4500,
      visualGrade: "MINOR_FLAW",
      actualPly: 2,
      actualTwist: "Z",
      totalYardageM: 420,
      skeinCount: 4,
    });
    expect(res.success).toBe(true);
  });

  it("requires notes when outcome is REWORK, HOLD, or FAIL", () => {
    for (const outcome of ["REWORK", "HOLD", "FAIL"] as const) {
      const res = qcInspectionSchema.safeParse({ outcome });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path.includes("notes"))).toBe(true);
      }

      const resWithNotes = qcInspectionSchema.safeParse({
        outcome,
        notes: "Specific disposition reason",
      });
      expect(resWithNotes.success).toBe(true);
    }
  });

  it("validates reasonable measurement ranges", () => {
    // actualPly > 32 rejected
    const badPly = qcInspectionSchema.safeParse({
      outcome: "PASS",
      measuredWeightG: 1000,
      actualPly: 33,
    });
    expect(badPly.success).toBe(false);

    // negative yardage rejected
    const badYard = qcInspectionSchema.safeParse({
      outcome: "PASS",
      measuredWeightG: 1000,
      totalYardageM: -50,
    });
    expect(badYard.success).toBe(false);

    // negative skeins rejected
    const badSkeins = qcInspectionSchema.safeParse({
      outcome: "PASS",
      measuredWeightG: 1000,
      skeinCount: 0,
    });
    expect(badSkeins.success).toBe(false);
  });
});

describe("QC Freshness & Stale Invalidation Logic", () => {
  const baseDate = new Date("2026-10-01T10:00:00.000Z");
  const event1 = { id: "evt_1", revertedAt: null, createdAt: new Date("2026-10-01T11:00:00.000Z") };
  const event2 = { id: "evt_2", revertedAt: null, createdAt: new Date("2026-10-01T14:00:00.000Z") };

  const lot = {
    createdAt: baseDate,
    stageEvents: [event1, event2],
  };

  it("marks QC fresh when tied to the latest active stage event", () => {
    const qc = {
      id: "qc_1",
      lotId: "lot_1",
      stageEventId: "evt_2",
      inspectorId: "u_1",
      inspectorName: "Asha",
      outcome: "PASS",
      measuredWeightG: 4000,
      previousWeightG: 4100,
      weightDeltaG: -100,
      skeinCount: null,
      totalYardageM: null,
      actualPly: null,
      actualTwist: null,
      visualGrade: "PASS",
      notes: null,
      createdAt: new Date("2026-10-01T14:30:00.000Z"),
    };
    expect(isQCFresh(lot, qc)).toBe(true);
  });

  it("marks QC stale if tied to an earlier stage event (subsequent event occurred)", () => {
    const qcStale = {
      id: "qc_old",
      lotId: "lot_1",
      stageEventId: "evt_1", // Tied to evt_1, but evt_2 exists
      inspectorId: "u_1",
      inspectorName: "Asha",
      outcome: "PASS",
      measuredWeightG: 4000,
      previousWeightG: 4100,
      weightDeltaG: -100,
      skeinCount: null,
      totalYardageM: null,
      actualPly: null,
      actualTwist: null,
      visualGrade: "PASS",
      notes: null,
      createdAt: new Date("2026-10-01T12:00:00.000Z"),
    };
    expect(isQCFresh(lot, qcStale)).toBe(false);
  });

  it("marks QC stale if the tied event was reverted via undo", () => {
    const lotWithReverted = {
      createdAt: baseDate,
      stageEvents: [
        event1,
        { ...event2, revertedAt: new Date("2026-10-01T15:00:00.000Z") }, // evt_2 undone
      ],
    };
    const qc = {
      id: "qc_1",
      lotId: "lot_1",
      stageEventId: "evt_2", // Tied to the now-undone event
      inspectorId: "u_1",
      inspectorName: "Asha",
      outcome: "PASS",
      measuredWeightG: 4000,
      previousWeightG: 4100,
      weightDeltaG: -100,
      skeinCount: null,
      totalYardageM: null,
      actualPly: null,
      actualTwist: null,
      visualGrade: "PASS",
      notes: null,
      createdAt: new Date("2026-10-01T14:30:00.000Z"),
    };
    // Because evt_2 was reverted, the active latest event is evt_1, so qc for evt_2 is stale!
    expect(isQCFresh(lotWithReverted, qc)).toBe(false);
  });

  it("returns false if outcome is not PASS", () => {
    const qcRework = {
      id: "qc_rw",
      lotId: "lot_1",
      stageEventId: "evt_2",
      inspectorId: "u_1",
      inspectorName: "Asha",
      outcome: "REWORK",
      measuredWeightG: 4000,
      previousWeightG: 4100,
      weightDeltaG: -100,
      skeinCount: null,
      totalYardageM: null,
      actualPly: null,
      actualTwist: null,
      visualGrade: null,
      notes: "Need rewinding",
      createdAt: new Date("2026-10-01T14:30:00.000Z"),
    };
    expect(isQCFresh(lot, qcRework)).toBe(false);
  });
});

describe("Story Token Versioning, AEAD Encryption & Legacy Migration", () => {
  const secret = process.env.STORY_SECRET ?? process.env.SESSION_SECRET ?? "smartfleece-story-token-default-secret-32-chars-entropy-min";
  const testLotId = "cm4lot0001000000000001";

  it("generates opaque v2 token with AES-256-GCM (does not contain plaintext or hex cuid)", () => {
    const token = generateStoryToken(testLotId);
    expect(token.startsWith("st_")).toBe(true);
    expect(token).not.toContain(testLotId);
    // Ensure hex lotId is also not plainly embedded
    const lotHex = Buffer.from(testLotId, "utf8").toString("hex");
    expect(token).not.toContain(lotHex);

    const resolved = resolveStoryToken(token);
    expect(resolved).toBe(testLotId);
  });

  it("resolves legacy Module 6.3 v1 HMAC tokens seamlessly (backwards compatibility)", () => {
    const nonce = "a1b2c3d4e5f6";
    const hmac = createHmac("sha256", secret)
      .update(`${testLotId}:${nonce}`)
      .digest("hex")
      .slice(0, 16);
    const lotHex = Buffer.from(testLotId, "utf8").toString("hex");
    const legacyToken = `st_${nonce}_${hmac}_${lotHex}`;

    const resolved = resolveStoryToken(legacyToken);
    expect(resolved).toBe(testLotId);
  });

  it("rejects tampered v2 tokens", () => {
    const token = generateStoryToken(testLotId);
    const parts = token.split("_");
    // Flip a character in the auth tag or ciphertext
    const badTag = parts[2].slice(0, -1) + (parts[2].slice(-1) === "a" ? "b" : "a");
    const tampered = `st_${parts[1]}_${badTag}_${parts[3]}`;
    expect(resolveStoryToken(tampered)).toBeNull();
  });
});
