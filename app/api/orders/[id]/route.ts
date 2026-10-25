import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { orderUpdateSchema, firstIssue } from "@/lib/validation";
import { recalcOrderStatus } from "@/lib/production";

type Ctx = { params: Promise<{ id: string }> };

/** Order detail (incl. lots and notification log) — used by staff UI and e2e checks. */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, farmName: true } },
      lots: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          lotCode: true,
          status: true,
          fiberType: true,
          isBatch: true,
          currentStageId: true,
          currentWeightG: true,
          greaseWeightG: true,
        },
      },
      notifications: { orderBy: { createdAt: "desc" }, select: { event: true, subject: true, status: true, createdAt: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order });
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
  const parsed = orderUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const updated = await prisma.order.update({ where: { id }, data: parsed.data });

  // A manual status change to RECEIVED/IN_PRODUCTION lets recalculation run
  // again; moving to COMPLETED/CANCELLED is a deliberate final choice.
  if (parsed.data.status === "RECEIVED" || parsed.data.status === "IN_PRODUCTION") {
    await recalcOrderStatus(id);
  }

  return NextResponse.json({ order: updated });
}
