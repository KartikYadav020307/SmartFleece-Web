import { describe, expect, it } from "vitest";
import {
  billableWeightG,
  computeInvoiceTotals,
  paymentStatus,
  parseRates,
  rateFor,
  type InvoiceLot,
} from "../lib/invoice";
import { formatMoney, roundMinor } from "../lib/money";

const base = {
  rush: false,
  rates: { default: 20000, "Merino Wool": 24000 }, // minor units per kg
  rushMultiplier: 1.25,
  minimumOrderFeeMinor: 0,
  extras: [],
  taxRatePct: 5,
  taxLabel: "GST",
};

const lot = (over: Partial<InvoiceLot>): InvoiceLot => ({
  lotCode: "LOT-TEST01",
  fiberType: "Merino Wool",
  status: "COMPLETED",
  currentWeightG: 1000,
  ...over,
});

describe("billableWeightG", () => {
  it("sums active lot weights and excludes consumed/cancelled", () => {
    const lots = [
      lot({ currentWeightG: 2000 }),
      lot({ currentWeightG: 1500, status: "CONSUMED" }),
      lot({ currentWeightG: 500, status: "CANCELLED" }),
      lot({ currentWeightG: 1000 }),
    ];
    expect(billableWeightG(lots)).toBe(3000);
  });
});

describe("rateFor", () => {
  it("prefers the fiber-specific rate and falls back to default", () => {
    expect(rateFor(base.rates, "Merino Wool")).toBe(24000);
    expect(rateFor(base.rates, "Huacaya Alpaca")).toBe(20000);
    expect(rateFor({}, "Anything")).toBe(0);
  });
});

describe("computeInvoiceTotals", () => {
  it("computes processing lines with half-up rounding", () => {
    // 2210 g × 24000 minor/kg = 53040 exactly
    const t = computeInvoiceTotals({ ...base, lots: [lot({ currentWeightG: 2210 })] });
    expect(t.lineItems).toHaveLength(1);
    expect(t.lineItems[0].amountMinor).toBe(53040);
    expect(t.subtotalMinor).toBe(53040);
    expect(t.taxMinor).toBe(2652); // 53040 × 5% = 2652 exactly
    expect(t.totalMinor).toBe(55692);
    expect(t.billableWeightG).toBe(2210);
  });

  it("rounds half-up on fractional paise (not banker's rounding)", () => {
    // Merino rate 24000: 111.13 g → 111.13/1000 × 24000 = 2667.12 → 2667
    const t = computeInvoiceTotals({ ...base, lots: [lot({ currentWeightG: 111.13 } as Partial<InvoiceLot>)] });
    expect(t.lineItems[0].amountMinor).toBe(2667);
    // Exact .5 boundary at the default rate 20000: 2.525 g → 50.5 → half-up 51
    // (banker's rounding would give 50)
    const t2 = computeInvoiceTotals({
      ...base,
      lots: [lot({ currentWeightG: 2.525, fiberType: "Huacaya Alpaca" } as Partial<InvoiceLot>)],
    });
    expect(t2.lineItems[0].amountMinor).toBe(51);
  });

  it("applies the rush surcharge on processing subtotal only", () => {
    const t = computeInvoiceTotals({ ...base, rush: true, lots: [lot({ currentWeightG: 1000 })] });
    // processing 24000, rush 25% → 6000
    expect(t.lineItems.map((l) => l.kind)).toEqual(["processing", "rush"]);
    expect(t.subtotalMinor).toBe(30000);
  });

  it("adds a minimum-order top-up line when subtotal falls short", () => {
    const t = computeInvoiceTotals({
      ...base,
      minimumOrderFeeMinor: 30000,
      lots: [lot({ currentWeightG: 500 })], // 12000 processing
    });
    const minimum = t.lineItems.find((l) => l.kind === "minimum");
    expect(minimum?.amountMinor).toBe(18000);
    expect(t.subtotalMinor).toBe(30000);
  });

  it("includes manual extra charges after minimum-fee handling", () => {
    const t = computeInvoiceTotals({
      ...base,
      extras: [{ description: "Dyeing — 2 kg", amountMinor: 15000 }],
      lots: [lot({ currentWeightG: 1000 })],
    });
    expect(t.subtotalMinor).toBe(24000 + 15000);
    expect(t.taxMinor).toBe(roundMinor(39000 * 0.05));
    expect(t.lineItems.at(-1)?.manual).toBe(true);
  });

  it("computes totals consistently and rounds tax half-up on a .5 boundary", () => {
    const t = computeInvoiceTotals({ ...base, lots: [lot({ currentWeightG: 1000 })] });
    expect(t.totalMinor).toBe(t.subtotalMinor + t.taxMinor);
    expect(roundMinor(50.5)).toBe(51);
    expect(roundMinor(50.49)).toBe(50);
  });
});

describe("paymentStatus", () => {
  it("transitions unpaid → partial → paid", () => {
    expect(paymentStatus(10000, 0)).toBe("UNPAID");
    expect(paymentStatus(10000, 4000)).toBe("PARTIAL");
    expect(paymentStatus(10000, 10000)).toBe("PAID");
    expect(paymentStatus(10000, 12000)).toBe("PAID"); // defensive: never negative balance label
  });
});

describe("parseRates", () => {
  it("parses stored JSON and degrades gracefully", () => {
    expect(parseRates('{"default":25000}')).toEqual({ default: 25000 });
    expect(parseRates("not json")).toEqual({ default: 0 });
    expect(parseRates("null")).toEqual({ default: 0 });
  });
});

describe("formatMoney", () => {
  it("formats minor units with the configured currency", () => {
    expect(formatMoney(55692, { currencyCode: "INR", currencySymbol: "₹" })).toContain("556.92");
    expect(formatMoney(55692, { currencyCode: "INR", currencySymbol: "₹" })).toMatch(/₹/);
  });

  it("falls back to the symbol for unknown currency codes", () => {
    const out = formatMoney(1234, { currencyCode: "XXX", currencySymbol: "¤" });
    expect(out).toBe("¤12.34");
  });
});
