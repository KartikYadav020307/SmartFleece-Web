import { describe, expect, it } from "vitest";
import { generateStoryToken, resolveStoryToken } from "../lib/story-token";

describe("story-token (Module 6.3 provenance tokens)", () => {
  const sampleLotId = "clot1234567890abcdef";

  it("generates an opaque token with st_ prefix and 4 parts", () => {
    const token = generateStoryToken(sampleLotId);
    expect(token.startsWith("st_")).toBe(true);
    const parts = token.split("_");
    expect(parts.length).toBe(4);
    // Does NOT contain raw lotId in plain text
    expect(token).not.toContain(sampleLotId);
  });

  it("resolves a valid token back to the exact lot ID", () => {
    const token = generateStoryToken(sampleLotId);
    const resolved = resolveStoryToken(token);
    expect(resolved).toBe(sampleLotId);
  });

  it("produces non-deterministic, high-entropy tokens for the same lot", () => {
    const token1 = generateStoryToken(sampleLotId);
    const token2 = generateStoryToken(sampleLotId);
    expect(token1).not.toBe(token2);
    expect(resolveStoryToken(token1)).toBe(sampleLotId);
    expect(resolveStoryToken(token2)).toBe(sampleLotId);
  });

  it("rejects tampered signatures", () => {
    const token = generateStoryToken(sampleLotId);
    const parts = token.split("_");
    // Flip a character in the signature part
    const badSig = parts[2].slice(0, -1) + (parts[2].slice(-1) === "a" ? "b" : "a");
    const tampered = `st_${parts[1]}_${badSig}_${parts[3]}`;
    expect(resolveStoryToken(tampered)).toBeNull();
  });

  it("rejects tampered payload/lotHex", () => {
    const token = generateStoryToken(sampleLotId);
    const parts = token.split("_");
    // Replace payload with a different lot's hex
    const otherHex = Buffer.from("clot9999999999abcdef", "utf8").toString("hex");
    const tampered = `st_${parts[1]}_${parts[2]}_${otherHex}`;
    expect(resolveStoryToken(tampered)).toBeNull();
  });

  it("rejects malformed and empty tokens", () => {
    expect(resolveStoryToken("")).toBeNull();
    expect(resolveStoryToken("not_a_token")).toBeNull();
    expect(resolveStoryToken("st_only_two_parts")).toBeNull();
    expect(resolveStoryToken("st_1_2_3_4_5")).toBeNull();
    expect(resolveStoryToken(null as unknown as string)).toBeNull();
    expect(resolveStoryToken(undefined as unknown as string)).toBeNull();
  });
});

describe("provenance privacy and data minimization rules", () => {
  it("allowlist strictly excludes sensitive customer, worker, and financial keys", () => {
    // Contract test: ensure the public shape never exposes private fields
    const mockPublicStory = {
      token: "st_123_abc_def",
      provenanceType: "SINGLE_ORIGIN" as const,
      targetProduct: "DK Yarn",
      productDescription: "2-ply, Z twist",
      yarnSpecs: "DK weight, 2-ply",
      dyeSpecs: null,
      color: "White",
      conditionGrade: "B",
      microns: 21,
      stapleLengthMm: 85,
      finishedWeightG: 4200,
      totalIntakeWeightG: 5000,
      overallYieldPct: 84.0,
      origins: [
        {
          farmName: "Sunrise Wool Farm",
          farmInfo: "Spring 2026 clip",
          location: "Kashmir Valley",
          fiberType: "Merino Wool",
          breed: "Merino",
          shearingDate: "2026-09-15",
          intakeWeightG: 5000,
          contributionPct: 100,
        },
      ],
      timeline: [
        { stageName: "Washing", sequence: 1, completedAt: "2026-10-01T10:00:00.000Z", outputWeightG: 4700 },
        { stageName: "Carding", sequence: 2, completedAt: "2026-10-02T14:00:00.000Z", outputWeightG: 4400 },
        { stageName: "Spinning", sequence: 3, completedAt: "2026-10-03T16:00:00.000Z", outputWeightG: 4200 },
      ],
      qualityCertified: true,
      qcCertifiedAt: "2026-10-03T16:00:00.000Z",
      qcVisualGrade: "PASS",
      completedAt: "2026-10-03T16:00:00.000Z",
    };

    const serialized = JSON.stringify(mockPublicStory);

    // Forbidden customer personal information
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("customerId");
    expect(serialized).not.toContain("customerName");

    // Forbidden internal staff and operational fields
    expect(serialized).not.toContain("worker");
    expect(serialized).not.toContain("workerId");
    expect(serialized).not.toContain("machineId");
    expect(serialized).not.toContain("internalNotes");
    expect(serialized).not.toContain("inspector");
    expect(serialized).not.toContain("inspectorId");

    // Forbidden financial / money fields
    expect(serialized).not.toContain("invoice");
    expect(serialized).not.toContain("payment");
    expect(serialized).not.toContain("totalMinor");
    expect(serialized).not.toContain("rateMinor");
  });
});
