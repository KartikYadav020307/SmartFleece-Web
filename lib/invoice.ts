// Invoice calculation (pure, unit-tested in tests/invoice.test.ts) and
// generation orchestration. Money is integer minor units throughout.

import { prisma } from "./db";
import { AppError } from "./errors";
import { notifyCustomer } from "./notify";
import { roundMinor } from "./money";

export type LineItem = {
  description: string;
  kind: "processing" | "rush" | "minimum" | "extra";
  fiberType?: string;
  weightG?: number;
  rateMinorPerKg?: number;
  amountMinor: number;
  manual?: boolean;
};

export type InvoiceLot = {
  lotCode: string;
  fiberType: string;
  status: string;
  currentWeightG: number;
};

export type PricingRates = {
  rates: Record<string, number>; // fiberType (and "default") → minor units per kg
};

export function rateFor(rates: Record<string, number>, fiberType: string): number {
  return rates[fiberType] ?? rates["default"] ?? 0;
}

/** Weight the customer pays for: consumed lots' weight lives in their children. */
export function billableWeightG(lots: InvoiceLot[]): number {
  return lots
    .filter((l) => l.status !== "CONSUMED" && l.status !== "CANCELLED")
    .reduce((acc, l) => acc + l.currentWeightG, 0);
}

export type InvoiceInput = {
  lots: InvoiceLot[];
  rush: boolean;
  rates: Record<string, number>;
  rushMultiplier: number;
  minimumOrderFeeMinor: number;
  extras?: { description: string; amountMinor: number }[];
  taxRatePct: number;
  taxLabel: string;
};

export type InvoiceTotals = {
  lineItems: LineItem[];
  billableWeightG: number;
  subtotalMinor: number;
  taxRatePct: number;
  taxLabel: string;
  taxMinor: number;
  totalMinor: number;
};

/** Compute invoice line items and totals. Half-up rounding at each line and on tax. */
export function computeInvoiceTotals(input: InvoiceInput): InvoiceTotals {
  const lineItems: LineItem[] = [];
  const billable = billableWeightG(input.lots);

  for (const lot of input.lots) {
    if (lot.status === "CONSUMED" || lot.status === "CANCELLED") continue;
    const rate = rateFor(input.rates, lot.fiberType);
    const amount = roundMinor((lot.currentWeightG / 1000) * rate);
    lineItems.push({
      description: `Processing — ${lot.lotCode} (${lot.fiberType}, ${(lot.currentWeightG / 1000).toFixed(2)} kg)`,
      kind: "processing",
      fiberType: lot.fiberType,
      weightG: lot.currentWeightG,
      rateMinorPerKg: rate,
      amountMinor: amount,
    });
  }

  const processingSubtotal = lineItems.reduce((acc, l) => acc + l.amountMinor, 0);

  if (input.rush && input.rushMultiplier > 1) {
    lineItems.push({
      description: `Rush order surcharge (×${input.rushMultiplier})`,
      kind: "rush",
      amountMinor: roundMinor(processingSubtotal * (input.rushMultiplier - 1)),
    });
  }

  let subtotal = lineItems.reduce((acc, l) => acc + l.amountMinor, 0);

  if (input.minimumOrderFeeMinor > 0 && subtotal < input.minimumOrderFeeMinor) {
    lineItems.push({
      description: "Minimum order fee top-up",
      kind: "minimum",
      amountMinor: input.minimumOrderFeeMinor - subtotal,
    });
    subtotal = input.minimumOrderFeeMinor;
  }

  for (const extra of input.extras ?? []) {
    lineItems.push({
      description: extra.description,
      kind: "extra",
      amountMinor: extra.amountMinor,
      manual: true,
    });
    subtotal += extra.amountMinor;
  }

  const tax = roundMinor(subtotal * (input.taxRatePct / 100));
  return {
    lineItems,
    billableWeightG: billable,
    subtotalMinor: subtotal,
    taxRatePct: input.taxRatePct,
    taxLabel: input.taxLabel,
    taxMinor: tax,
    totalMinor: subtotal + tax,
  };
}

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export function paymentStatus(totalMinor: number, paidMinor: number): PaymentStatus {
  if (paidMinor <= 0) return "UNPAID";
  if (paidMinor >= totalMinor) return "PAID";
  return "PARTIAL";
}

/** Mill's pricing configuration; creates the default singleton on first use. */
export async function getPricingConfig() {
  const existing = await prisma.pricingConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  if (existing) return existing;
  return prisma.pricingConfig.create({
    data: { isSample: false },
  });
}

export function parseRates(baseRatesJson: string): Record<string, number> {
  try {
    const parsed = JSON.parse(baseRatesJson);
    return typeof parsed === "object" && parsed !== null ? parsed : { default: 0 };
  } catch {
    return { default: 0 };
  }
}

async function nextInvoiceNumber(): Promise<string> {
  const count = await prisma.invoice.count();
  for (let n = 1001 + count; ; n++) {
    const candidate = `INV-${n}`;
    const clash = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
    if (!clash) return candidate;
  }
}

/**
 * Generate (or return the existing) invoice for an order using current lot
 * weights and the mill's pricing config. Manual extras on an existing invoice
 * are preserved across regeneration.
 */
export async function generateInvoiceForOrder(
  orderId: string,
  opts: { regenerate?: boolean; notify?: boolean } = {}
) {
  const existing = await prisma.invoice.findUnique({
    where: { orderId },
    include: { payments: true },
  });
  if (existing && !opts.regenerate) return { invoice: existing, created: false };
  if (existing && existing.paidMinor > 0) {
    throw new AppError(409, "This invoice already has payments recorded — it can no longer be regenerated");
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lots: { select: { lotCode: true, fiberType: true, status: true, currentWeightG: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");

  const config = await getPricingConfig();
  const extras = (existing?.lineItemsJson ? JSON.parse(existing.lineItemsJson) : [])
    .filter((l: LineItem) => l.manual)
    .map((l: LineItem) => ({ description: l.description, amountMinor: l.amountMinor }));

  const totals = computeInvoiceTotals({
    lots: order.lots,
    rush: order.rush,
    rates: parseRates(config.baseRatesJson),
    rushMultiplier: config.rushMultiplier,
    minimumOrderFeeMinor: config.minimumOrderFeeMinor,
    extras,
    taxRatePct: config.taxRatePct,
    taxLabel: config.taxLabel,
  });

  let invoice;
  if (existing) {
    invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        billableWeightG: totals.billableWeightG,
        lineItemsJson: JSON.stringify(totals.lineItems),
        subtotalMinor: totals.subtotalMinor,
        taxLabel: totals.taxLabel,
        taxRatePct: totals.taxRatePct,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        paidMinor: existing.paidMinor,
        status: paymentStatus(totals.totalMinor, existing.paidMinor),
      },
      include: { payments: true },
    });
  } else {
    invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: await nextInvoiceNumber(),
        orderId,
        billableWeightG: totals.billableWeightG,
        lineItemsJson: JSON.stringify(totals.lineItems),
        subtotalMinor: totals.subtotalMinor,
        taxLabel: totals.taxLabel,
        taxRatePct: totals.taxRatePct,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        status: "UNPAID",
        isSample: order.isSample,
      },
      include: { payments: true },
    });
    if (opts.notify !== false) {
      await notifyCustomer({
        orderId,
        event: "INVOICE_READY",
        subject: `Invoice ${invoice.invoiceNumber} ready for order ${order.orderNumber}`,
        body: `Your invoice for order ${order.orderNumber} has been generated and will be available at pickup.`,
      });
    }
  }
  return { invoice, created: !existing || opts.regenerate === true };
}
