import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { lotUpdateSchema, firstIssue } from "@/lib/validation";
import { recalcOrderStatus } from "@/lib/production";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const lot = await prisma.fiberLot.findUnique({
    where: { id },
    include: {
      customer: true,
      order: true,
      currentStage: true,
      stageEvents: { orderBy: { createdAt: "asc" }, include: { stage: true, worker: true } },
      qualityFlags: { orderBy: { createdAt: "desc" } },
      parents: { include: { parentLot: true } },
      children: { include: { childLot: true } },
    },
  });
  if (!lot) return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  return NextResponse.json({ lot });
}

/** Update lot status/notes (e.g. put on hold, cancel, release). */
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
  const parsed = lotUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const lot = await prisma.fiberLot.findUnique({ where: { id } });
  if (!lot) return NextResponse.json({ error: "Lot not found" }, { status: 404 });

  const updated = await prisma.fiberLot.update({ where: { id }, data: parsed.data });
  if (parsed.data.status) await recalcOrderStatus(lot.orderId);
  return NextResponse.json({ lot: updated });
}
