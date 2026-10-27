import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { orderSchema, firstIssue } from "@/lib/validation";
import { getStages, recalcOrderEta } from "@/lib/production";
import { notifyCustomer } from "@/lib/notify";
import { AppError } from "@/lib/errors";
import { newTrackingToken, newLotCode } from "@/lib/ids";

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, farmName: true } },
      _count: { select: { lots: true } },
    },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, archived: false },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 400 });
    }

    const stages = await getStages();
    const firstStage = stages[0];
    if (!firstStage) {
      return NextResponse.json(
        { error: "No production stages configured. Add stages in Settings first." },
        { status: 409 }
      );
    }

    // Human-friendly sequential order number, e.g. ORD-1024.
    let orderNumber: string;
    const count = await prisma.order.count();
    for (let n = 1024 + count; ; n++) {
      const candidate = `ORD-${n}`;
      const clash = await prisma.order.findUnique({ where: { orderNumber: candidate } });
      if (!clash) {
        orderNumber = candidate;
        break;
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          shearingDate: data.shearingDate ?? null,
          farmInfo: data.farmInfo ?? null,
          targetProduct: data.targetProduct ?? null,
          yarnSpecs: data.yarnSpecs ?? null,
          dyeSpecs: data.dyeSpecs ?? null,
          rush: data.rush,
          notes: data.notes ?? null,
          trackingToken: newTrackingToken(),
          status: "RECEIVED",
        },
      });
      for (const lot of data.lots) {
        // createLotWithCode uses the global prisma client; inside the
        // transaction we create directly with a retry-safe code.
        let createdLot = null as Awaited<ReturnType<typeof tx.fiberLot.create>> | null;
        for (let attempt = 0; attempt < 6 && !createdLot; attempt++) {
          try {
            createdLot = await tx.fiberLot.create({
              data: {
                lotCode: newLotCode(),
                orderId: created.id,
                customerId: customer.id,
                fiberType: lot.fiberType,
                breed: lot.breed ?? null,
                greaseWeightG: lot.greaseWeightG,
                currentWeightG: lot.greaseWeightG,
                currentStageId: firstStage.id,
                status: "PENDING",
                conditionGrade: lot.conditionGrade ?? null,
                vmRating: lot.vmRating ?? null,
                stapleLengthMm: lot.stapleLengthMm ?? null,
                microns: lot.microns ?? null,
                color: lot.color ?? null,
                notes: lot.notes ?? null,
              },
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes("Unique constraint")) throw err;
          }
        }
        if (!createdLot) throw new AppError(500, "Could not allocate lot codes, please retry");
      }
      return created;
    });

    // First rule-based ETA for the new order (Module 3).
    try {
      await recalcOrderEta(order.id);
    } catch (err) {
      console.error("[eta] initial recalc failed", err);
    }

    await notifyCustomer({
      orderId: order.id,
      event: "ORDER_RECEIVED",
      subject: `Order ${order.orderNumber} received`,
      body: `Hello ${customer.name} — we've received your fiber and tagged each bag with a QR code. Track progress any time via your personal tracking link.`,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[orders POST]", err);
    return NextResponse.json({ error: "Could not create order" }, { status: 500 });
  }
}
