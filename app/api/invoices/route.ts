import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { generateInvoiceForOrder } from "@/lib/invoice";
import { AppError } from "@/lib/errors";

export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const invoices = await prisma.invoice.findMany({
    where: status === "UNPAID" || status === "PARTIAL" || status === "PAID" ? { status } : {},
    orderBy: { createdAt: "desc" },
    include: {
      order: { select: { id: true, orderNumber: true, customer: { select: { id: true, name: true } } } },
      payments: { select: { amountMinor: true } },
    },
  });
  return NextResponse.json({ invoices });
}

/** Generate the invoice for an order (owner only). Idempotent. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can manage invoices");

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  try {
    const { invoice, created } = await generateInvoiceForOrder(body.orderId);
    return NextResponse.json({ invoice, created }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[invoices POST]", err);
    return NextResponse.json({ error: "Could not generate invoice" }, { status: 500 });
  }
}
