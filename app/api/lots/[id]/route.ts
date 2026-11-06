import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { lotUpdateSchema, firstIssue } from "@/lib/validation";
import { recalcOrderStatus, recalcOrderEta } from "@/lib/production";
import { isQCFresh } from "@/lib/qc";

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
      qcInspections: { orderBy: { createdAt: "desc" } },
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

  if (parsed.data.status === "COMPLETED") {
    const activeStages = await prisma.stage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } });
    const terminalStage = activeStages[activeStages.length - 1];
    const lotWithDetails = await prisma.fiberLot.findUnique({
      where: { id },
      include: {
        stageEvents: { where: { revertedAt: null }, orderBy: { createdAt: "asc" } },
        qcInspections: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    const latestEvent = lotWithDetails?.stageEvents[lotWithDetails.stageEvents.length - 1];
    const isAtTerminal =
      terminalStage !== undefined &&
      lotWithDetails?.currentStageId === terminalStage.id &&
      latestEvent?.stageId === terminalStage.id;
    const latestQC = lotWithDetails?.qcInspections[0] ?? null;
    const isFresh = lotWithDetails ? isQCFresh(lotWithDetails, latestQC) : false;

    if (!isAtTerminal || !isFresh) {
      return NextResponse.json(
        { error: "Cannot mark lot as COMPLETED: lot must complete all production stages and pass finished-goods QC." },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.fiberLot.update({ where: { id }, data: parsed.data });
  if (parsed.data.status) {
    // A status change (hold / release / cancel) alters the set of active lots,
    // which the rule-based ETA is derived from — keep the customer-facing
    // estimate fresh. A recalc failure must not undo the status change.
    await recalcOrderStatus(lot.orderId);
    try {
      await recalcOrderEta(lot.orderId);
    } catch (err) {
      console.error(`[eta] recalc failed for order ${lot.orderId}`, err);
    }
  }
  return NextResponse.json({ lot: updated });
}
