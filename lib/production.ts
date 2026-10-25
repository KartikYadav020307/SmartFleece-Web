import { prisma } from "./db";
import { AppError } from "./errors";
import { isAbnormalLoss, weightLossPct } from "./calc";
import { notifyCustomer } from "./notify";
import type { Stage, StageEvent } from "@prisma/client";

export type ActiveStage = Stage;

export async function getStages(): Promise<ActiveStage[]> {
  return prisma.stage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } });
}

export async function getAllStages(): Promise<Stage[]> {
  return prisma.stage.findMany({ orderBy: { sequence: "asc" } });
}

export type CompleteStageInput = {
  lotId: string;
  stageId: string;
  workerId?: string | null;
  eventType: "COMPLETED" | "SKIPPED";
  machine?: string;
  inputWeightG?: number;
  outputWeightG?: number;
  notes?: string;
  flagType?: string;
  flagSeverity?: string;
  flagNotes?: string;
  clientEventId?: string;
};

export type CompleteStageResult = {
  event: StageEvent;
  duplicate: boolean;
  lotStatus: string;
  nextStageName: string | null;
  completed: boolean;
  weightDeltaG: number | null;
};

/**
 * Record a stage completion for a lot and advance it through the pipeline.
 * Idempotent via clientEventId (offline sync queue), history-preserving
 * (events are append-only; corrections use undoLastEvent).
 */
export async function completeStageEvent(input: CompleteStageInput): Promise<CompleteStageResult> {
  if (input.clientEventId) {
    const existing = await prisma.stageEvent.findUnique({
      where: { clientEventId: input.clientEventId },
    });
    if (existing) {
      const lot = await prisma.fiberLot.findUnique({ where: { id: existing.lotId } });
      return {
        event: existing,
        duplicate: true,
        lotStatus: lot?.status ?? "IN_PRODUCTION",
        nextStageName: null,
        completed: false,
        weightDeltaG: null,
      };
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const lot = await tx.fiberLot.findUnique({
      where: { id: input.lotId },
      include: { order: { include: { customer: true } } },
    });
    if (!lot) throw new AppError(404, "Lot not found");
    if (lot.status === "CONSUMED") throw new AppError(409, "This lot was consumed by a blend/split and can no longer move through production");
    if (lot.status === "CANCELLED") throw new AppError(409, "This lot is cancelled");
    if (lot.status === "COMPLETED") throw new AppError(409, "This lot already completed all stages");
    if (lot.status === "ON_HOLD") throw new AppError(409, "This lot is on hold — release it first from the lot page");

    const stages = await tx.stage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } });
    const idx = stages.findIndex((s) => s.id === lot.currentStageId);
    if (idx === -1) {
      throw new AppError(409, "This lot has no valid current stage. Ask the manager to check Settings → Stages.");
    }
    const stage = stages[idx];
    if (stage.id !== input.stageId) {
      throw new AppError(409, `This lot is currently at "${stage.name}", not the submitted stage. Refresh and try again.`);
    }

    const prevWeight = lot.currentWeightG;
    const inputW = input.eventType === "SKIPPED" ? undefined : input.inputWeightG ?? prevWeight;
    const outputW = input.eventType === "SKIPPED" ? undefined : input.outputWeightG;
    const newWeight = outputW ?? inputW ?? prevWeight;

    const event = await tx.stageEvent.create({
      data: {
        lotId: lot.id,
        stageId: stage.id,
        workerId: input.workerId ?? null,
        eventType: input.eventType,
        machine: input.machine ?? null,
        inputWeightG: inputW ?? null,
        outputWeightG: outputW ?? null,
        notes: input.notes ?? null,
        clientEventId: input.clientEventId ?? null,
      },
    });

    if (input.flagType) {
      await tx.qualityFlag.create({
        data: {
          lotId: lot.id,
          stageEventId: event.id,
          flagType: input.flagType,
          severity: input.flagSeverity ?? "MEDIUM",
          notes: input.flagNotes ?? null,
        },
      });
    }

    // Spec 2.5: auto-flag abnormal weight loss (>15 points above expected).
    if (inputW && outputW) {
      const lossPct = weightLossPct(inputW, outputW);
      if (isAbnormalLoss(lossPct, stage.expectedLossPct)) {
        await tx.qualityFlag.create({
          data: {
            lotId: lot.id,
            stageEventId: event.id,
            flagType: "WEIGHT",
            severity: "LOW",
            notes: `Automatic alert: ${lossPct.toFixed(1)}% weight change at ${stage.name} vs ${stage.expectedLossPct}% expected.`,
          },
        });
      }
    }

    const nextStage = stages[idx + 1] ?? null;
    const completed = !nextStage;

    await tx.fiberLot.update({
      where: { id: lot.id },
      data: {
        currentWeightG: newWeight,
        currentStageId: nextStage ? nextStage.id : stage.id,
        status: completed ? "COMPLETED" : "IN_PRODUCTION",
      },
    });

    if (lot.order.status === "RECEIVED") {
      await tx.order.update({ where: { id: lot.orderId }, data: { status: "IN_PRODUCTION" } });
    }

    return {
      event,
      lot,
      stage,
      nextStage,
      completed,
      weightDeltaG: outputW !== undefined && inputW !== undefined ? outputW - inputW : null,
    };
  });

  // Notifications happen outside the transaction so a notification failure
  // can never roll back a valid production update.
  const customerName = result.lot.order.customer.name;
  if (input.eventType === "COMPLETED") {
    await notifyCustomer({
      orderId: result.lot.orderId,
      lotId: result.lot.id,
      event: "STAGE_COMPLETE",
      subject: `Order ${result.lot.order.orderNumber}: ${result.stage.name} complete`,
      body: `Hello ${customerName} — your fiber (${result.lot.lotCode}) has completed "${result.stage.name}" at the mill.`,
    });
  }
  if (result.completed) {
    await recalcOrderStatus(result.lot.orderId);
  }

  return {
    event: result.event,
    duplicate: false,
    lotStatus: result.completed ? "COMPLETED" : "IN_PRODUCTION",
    nextStageName: result.nextStage?.name ?? null,
    completed: result.completed,
    weightDeltaG: result.weightDeltaG,
  };
}

/** Revert the most recent stage event (auditable — the event is marked reverted, never deleted). */
export async function undoLastEvent(lotId: string): Promise<void> {
  const lot = await prisma.fiberLot.findUnique({
    where: { id: lotId },
    include: { stageEvents: { orderBy: { createdAt: "asc" } } },
  });
  if (!lot) throw new AppError(404, "Lot not found");
  if (lot.status === "CONSUMED") throw new AppError(409, "Lot was consumed by a blend/split — undo is not supported");
  if (lot.status === "CANCELLED") throw new AppError(409, "Lot is cancelled");

  const active = lot.stageEvents.filter((e) => !e.revertedAt);
  const last = active[active.length - 1];
  if (!last) throw new AppError(409, "No stage events to undo");

  const prev = active[active.length - 2];
  const restoredWeight = last.inputWeightG ?? prev?.outputWeightG ?? lot.greaseWeightG;

  await prisma.$transaction([
    prisma.stageEvent.update({ where: { id: last.id }, data: { revertedAt: new Date() } }),
    prisma.fiberLot.update({
      where: { id: lot.id },
      data: { currentStageId: last.stageId, currentWeightG: restoredWeight, status: "IN_PRODUCTION" },
    }),
  ]);

  await recalcOrderStatus(lot.orderId);
}

/**
 * Recalculate an order's status from its lots. When every lot is finished
 * (COMPLETED / CONSUMED / CANCELLED), the order becomes READY_FOR_PICKUP and
 * the customer is notified once.
 */
export async function recalcOrderStatus(orderId: string): Promise<string> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lots: true, customer: true } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status === "CANCELLED" || order.status === "COMPLETED") return order.status;

  const done = (s: string) => s === "COMPLETED" || s === "CONSUMED" || s === "CANCELLED";
  let next = order.status;
  if (order.lots.length > 0 && order.lots.every((l) => done(l.status))) {
    next = "READY_FOR_PICKUP";
  } else if (order.lots.some((l) => l.status === "IN_PRODUCTION" || l.status === "PENDING" || l.status === "ON_HOLD")) {
    next = "IN_PRODUCTION";
  }

  if (next !== order.status) {
    await prisma.order.update({ where: { id: orderId }, data: { status: next } });
    if (next === "READY_FOR_PICKUP") {
      await notifyCustomer({
        orderId,
        event: "ORDER_READY",
        subject: `Order ${order.orderNumber} is ready!`,
        body: `Hello ${order.customer.name} — your order ${order.orderNumber} has finished processing and is ready for pickup or shipping.`,
      });
    }
  }
  return next;
}
