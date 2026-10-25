import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { lotCreateSchema, firstIssue } from "@/lib/validation";
import { getStages } from "@/lib/production";
import { newLotCode } from "@/lib/ids";

export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status")?.trim();

  const lots = await prisma.fiberLot.findMany({
    where: {
      AND: [
        status ? { status } : {},
        q
          ? {
              OR: [
                { lotCode: { contains: q.toUpperCase() } },
                { customer: { name: { contains: q } } },
                { fiberType: { contains: q } },
              ],
            }
          : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true } },
      order: { select: { orderNumber: true } },
      currentStage: { select: { name: true } },
    },
  });
  return NextResponse.json({ lots });
}

/** Add an individually tracked lot to an existing order. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const outer = body as { orderId?: string; lot?: unknown };
  if (!outer.orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }
  const parsed = lotCreateSchema.safeParse(outer.lot);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: outer.orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const stages = await getStages();
  const firstStage = stages[0];
  if (!firstStage) {
    return NextResponse.json({ error: "No stages configured" }, { status: 409 });
  }

  const lot = await prisma.fiberLot.create({
    data: {
      lotCode: newLotCode(),
      orderId: order.id,
      customerId: order.customerId,
      fiberType: parsed.data.fiberType,
      breed: parsed.data.breed ?? null,
      greaseWeightG: parsed.data.greaseWeightG,
      currentWeightG: parsed.data.greaseWeightG,
      currentStageId: firstStage.id,
      status: "PENDING",
      conditionGrade: parsed.data.conditionGrade ?? null,
      vmRating: parsed.data.vmRating ?? null,
      stapleLengthMm: parsed.data.stapleLengthMm ?? null,
      microns: parsed.data.microns ?? null,
      color: parsed.data.color ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  return NextResponse.json({ lot }, { status: 201 });
}
