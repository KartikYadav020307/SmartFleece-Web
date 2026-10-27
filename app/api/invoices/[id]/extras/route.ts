import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { extraChargeSchema, firstIssue } from "@/lib/validation";
import { paymentStatus } from "@/lib/invoice";
import { roundMinor } from "@/lib/money";
import type { LineItem } from "@/lib/invoice";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Add a manual charge (e.g. dyeing) to an invoice. Only allowed while no
 * payments have been recorded, so totals never shift under money already
 * taken.
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can add charges");
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = extraChargeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.paidMinor > 0) {
    return NextResponse.json(
      { error: "Payments have been recorded on this invoice — charges can no longer be added" },
      { status: 409 }
    );
  }

  const amountMinor = Math.round(parsed.data.amountMajor * 100);
  const lines: LineItem[] = JSON.parse(invoice.lineItemsJson);
  lines.push({
    description: parsed.data.description,
    kind: "extra",
    amountMinor,
    manual: true,
  });
  const subtotalMinor = lines.reduce((acc, l) => acc + l.amountMinor, 0);
  const taxMinor = roundMinor(subtotalMinor * (invoice.taxRatePct / 100));
  const totalMinor = subtotalMinor + taxMinor;

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      lineItemsJson: JSON.stringify(lines),
      subtotalMinor,
      taxMinor,
      totalMinor,
      status: paymentStatus(totalMinor, invoice.paidMinor),
    },
  });
  return NextResponse.json({ invoice: updated }, { status: 201 });
}
