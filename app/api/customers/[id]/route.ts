import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized, forbidden } from "@/lib/auth";
import { customerSchema, firstIssue } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { _count: { select: { lots: true } } } },
      lots: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { order: { select: { orderNumber: true } }, currentStage: { select: { name: true } } },
      },
    },
  });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  return NextResponse.json({ customer });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const customer = await prisma.customer.update({
    where: { id },
    data: { ...parsed.data, email: parsed.data.email?.toLowerCase() },
  });
  return NextResponse.json({ customer });
}

/**
 * Delete: hard-deletes only when the customer has no orders/lots, so
 * traceability can never break. Otherwise the record is archived.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "OWNER") return forbidden("Only the mill owner can delete or archive customers");
  const { id } = await ctx.params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { orders: true, lots: true } } },
  });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  if (customer._count.orders === 0 && customer._count.lots === 0) {
    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  }
  await prisma.customer.update({ where: { id }, data: { archived: true } });
  return NextResponse.json({ deleted: false, archived: true });
}
