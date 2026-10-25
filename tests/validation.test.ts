import { describe, expect, it } from "vitest";
import {
  customerSchema,
  lotInputSchema,
  orderSchema,
  splitSchema,
  stageEventSchema,
} from "../lib/validation";

describe("customerSchema", () => {
  it("requires a name and accepts optional fields", () => {
    const ok = customerSchema.safeParse({ name: "Ravi", email: "" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBeUndefined();
  });

  it("rejects invalid email", () => {
    expect(customerSchema.safeParse({ name: "Ravi", email: "not-an-email" }).success).toBe(false);
  });
});

describe("lotInputSchema", () => {
  it("coerces string weights from forms and validates positivity", () => {
    const ok = lotInputSchema.safeParse({ fiberType: "Merino Wool", greaseWeightG: "4200" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.greaseWeightG).toBe(4200);
    expect(lotInputSchema.safeParse({ fiberType: "Merino Wool", greaseWeightG: "-5" }).success).toBe(false);
    expect(lotInputSchema.safeParse({ fiberType: "Merino Wool", greaseWeightG: "abc" }).success).toBe(false);
  });

  it("rejects unknown enum values but allows blanks", () => {
    expect(lotInputSchema.safeParse({ fiberType: "X", greaseWeightG: 1, conditionGrade: "E" }).success).toBe(false);
    const blank = lotInputSchema.safeParse({ fiberType: "X", greaseWeightG: 1, conditionGrade: "" });
    expect(blank.success).toBe(true);
  });
});

describe("orderSchema", () => {
  const base = { customerId: "c1", lots: [{ fiberType: "Merino Wool", greaseWeightG: 1000 }] };

  it("requires at least one lot", () => {
    expect(orderSchema.safeParse({ customerId: "c1", lots: [] }).success).toBe(false);
    expect(orderSchema.safeParse(base).success).toBe(true);
  });
});

describe("stageEventSchema", () => {
  it("defaults to COMPLETED and keeps optional weights numeric-or-undefined", () => {
    const ok = stageEventSchema.safeParse({ stageId: "s1", inputWeightG: "3500", outputWeightG: "" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.eventType).toBe("COMPLETED");
      expect(ok.data.inputWeightG).toBe(3500);
      expect(ok.data.outputWeightG).toBeUndefined();
    }
  });

  it("rejects unknown event types", () => {
    expect(stageEventSchema.safeParse({ stageId: "s1", eventType: "TELEPORTED" }).success).toBe(false);
  });
});

describe("splitSchema", () => {
  it("requires at least two children with positive weights", () => {
    expect(splitSchema.safeParse({ children: [{ weightG: 100 }] }).success).toBe(false);
    expect(
      splitSchema.safeParse({ children: [{ weightG: "300" }, { weightG: 200 }] }).success
    ).toBe(true);
    expect(splitSchema.safeParse({ children: [{ weightG: 0 }, { weightG: 200 }] }).success).toBe(false);
  });
});
