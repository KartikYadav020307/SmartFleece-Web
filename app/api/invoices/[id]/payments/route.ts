import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { paymentSchema, firstIssue } from "@/lib/validation";
import { paymentStatus } from "@/lib/invoice";

type Ctx = { params: Promise<{ id: string }> };

/** Record a payment against an invoice (owner only). Rejects overpayment. */
export async function POST(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can record payments");
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const amountMinor = Math.round(parsed.data.amountMajor * 100);
  const outstanding = invoice.totalMinor - invoice.paidMinor;
  if (amountMinor > outstanding) {
    return NextResponse.json(
      { error: `Payment exceeds the outstanding balance (${outstanding} minor units remaining)` },
      { status: 400 }
    );
  }

  const paidMinor = invoice.paidMinor + amountMinor;
  const [payment, updated] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amountMinor,
        method: parsed.data.method,
        reference: parsed.data.reference ?? null,
        recordedBy: user.name,
        paidAt: parsed.data.paidAt ?? new Date(),
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { paidMinor, status: paymentStatus(invoice.totalMinor, paidMinor) },
    }),
  ]);
  return NextResponse.json({ payment, invoice: updated }, { status: 201 });
}
