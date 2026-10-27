import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { generateInvoiceForOrder } from "@/lib/invoice";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Recompute an invoice from current lot weights and pricing (owner only).
 * Blocked once any payment exists. Manual extra charges are preserved.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can manage invoices");
  const { id } = await ctx.params;

  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  try {
    const { invoice } = await generateInvoiceForOrder(existing.orderId, { regenerate: true });
    return NextResponse.json({ invoice });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[invoice regenerate]", err);
    return NextResponse.json({ error: "Could not regenerate invoice" }, { status: 500 });
  }
}
