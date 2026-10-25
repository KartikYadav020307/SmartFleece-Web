import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";

/** Look up a lot by QR payload / lot code (used by the scanner page). */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const raw = url.searchParams.get("code")?.trim().toUpperCase();
  if (!raw) return NextResponse.json({ error: "Missing lot code" }, { status: 400 });

  const lot = await prisma.fiberLot.findUnique({
    where: { lotCode: raw },
    include: {
      customer: { select: { name: true, farmName: true } },
      order: { select: { id: true, orderNumber: true, status: true, rush: true } },
      currentStage: true,
      stageEvents: {
        where: { revertedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { qualityFlags: { where: { status: "OPEN" } } } },
    },
  });
  if (!lot) {
    return NextResponse.json(
      { error: `No lot found for code "${raw}". Check the label and try again, or use manual lookup.` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    lot: {
      id: lot.id,
      lotCode: lot.lotCode,
      status: lot.status,
      fiberType: lot.fiberType,
      breed: lot.breed,
      color: lot.color,
      greaseWeightG: lot.greaseWeightG,
      currentWeightG: lot.currentWeightG,
      isBatch: lot.isBatch,
      openFlags: lot._count.qualityFlags,
      customerName: lot.customer.name,
      farmName: lot.customer.farmName,
      orderNumber: lot.order.orderNumber,
      orderStatus: lot.order.status,
      rush: lot.order.rush,
      currentStage: lot.currentStage ? { id: lot.currentStage.id, name: lot.currentStage.name, expectedLossPct: lot.currentStage.expectedLossPct } : null,
      lastEventAt: lot.stageEvents[0]?.createdAt ?? null,
    },
  });
}
