import { prisma } from "./db";
import { AppError } from "./errors";
import { recalcOrderStatus } from "./production";
import type { QCInspectionInput } from "./validation";
import type { FiberLot, QCInspection, StageEvent } from "@prisma/client";

export type LotWithQCAndEvents = FiberLot & {
  stageEvents: StageEvent[];
  qcInspections: QCInspection[];
};

/**
 * Check whether a QC approval is fresh.
 *
 * A QC inspection is FRESH if:
 * 1. Its outcome is "PASS".
 * 2. It was recorded against the lot's current latest non-reverted stage event.
 * 3. No subsequent stage events or undos have occurred since the inspection was recorded.
 */
export function isQCFresh(
  lot: { createdAt: Date; stageEvents?: { id: string; revertedAt: Date | null; createdAt: Date }[] },
  qc: (QCInspection & { stageEvent?: { id: string } | null }) | null
): boolean {
  if (!qc || qc.outcome !== "PASS") return false;

  const activeEvents = (lot.stageEvents ?? []).filter((e) => !e.revertedAt);
  const latestEvent = activeEvents[activeEvents.length - 1];

  // If there are active stage events, QC must be tied to the latest active event
  // and must have been recorded on or after that event.
  if (latestEvent) {
    if (qc.stageEventId !== latestEvent.id) return false;
    if (new Date(qc.createdAt).getTime() < new Date(latestEvent.createdAt).getTime()) return false;
    return true;
  }

  // If no stage events exist yet, QC must have no stageEventId
  return qc.stageEventId === null;
}

/**
 * Fetch the latest QC status and full audit history for a lot.
 */
export async function getLotQC(lotId: string) {
  const lot = await prisma.fiberLot.findUnique({
    where: { id: lotId },
    include: {
      stageEvents: {
        where: { revertedAt: null },
        orderBy: { createdAt: "asc" },
      },
      qcInspections: {
        orderBy: { createdAt: "desc" },
        include: {
          inspector: { select: { id: true, name: true, role: true } },
          stageEvent: { select: { id: true, stage: { select: { name: true } } } },
        },
      },
    },
  });

  if (!lot) return null;

  const latest = lot.qcInspections[0] ?? null;
  const fresh = isQCFresh(lot, latest);

  return {
    lot,
    latest,
    isFresh: fresh,
    history: lot.qcInspections,
  };
}

/**
 * Record a structured finished-goods QC inspection for a lot.
 *
 * Implements:
 * - Append-only audit record creation.
 * - Immutable inspector name attribution (retains name even if user is deleted).
 * - Weight reconciliation: updates lot.currentWeightG and tracks previousWeightG + weightDeltaG.
 * - Explicit outcome handling (PASS, REWORK, HOLD, FAIL).
 * - Terminal stage completion triggering when passing QC is recorded.
 */
export async function recordQCInspection(
  lotId: string,
  inspector: { id: string; name: string },
  input: QCInspectionInput
) {
  const result = await prisma.$transaction(async (tx) => {
    const lot = await tx.fiberLot.findUnique({
      where: { id: lotId },
      include: {
        order: { include: { customer: true } },
        stageEvents: {
          where: { revertedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!lot) throw new AppError(404, "Lot not found");
    if (lot.status === "CONSUMED") {
      throw new AppError(409, "Consumed lots cannot be inspected — follow active child lots");
    }
    if (lot.status === "CANCELLED") {
      throw new AppError(409, "Cancelled lots cannot be inspected");
    }

    const activeEvents = lot.stageEvents;
    const latestEvent = activeEvents[activeEvents.length - 1] ?? null;

    // Weight reconciliation
    const previousWeightG = lot.currentWeightG;
    const measuredWeightG = input.measuredWeightG ?? null;
    const weightDeltaG = measuredWeightG !== null ? measuredWeightG - previousWeightG : null;
    const newWeightG = measuredWeightG ?? previousWeightG;

    // Create append-only QC inspection record
    const qc = await tx.qCInspection.create({
      data: {
        lotId: lot.id,
        stageEventId: latestEvent?.id ?? null,
        inspectorId: inspector.id,
        inspectorName: inspector.name,
        outcome: input.outcome,
        measuredWeightG,
        previousWeightG,
        weightDeltaG,
        skeinCount: input.skeinCount ?? null,
        totalYardageM: input.totalYardageM ?? null,
        actualPly: input.actualPly ?? null,
        actualTwist: input.actualTwist ?? null,
        visualGrade: input.visualGrade ?? null,
        notes: input.notes ?? null,
      },
    });

    // Check pipeline stages to determine if lot is at the terminal stage
    const activeStages = await tx.stage.findMany({
      where: { isActive: true },
      orderBy: { sequence: "asc" },
    });
    const terminalStage = activeStages[activeStages.length - 1] ?? null;
    const isAtTerminalStage =
      terminalStage !== null &&
      lot.currentStageId === terminalStage.id &&
      latestEvent !== null &&
      latestEvent.stageId === terminalStage.id;

    let newStatus = lot.status;
    let shouldRecalcOrder = false;

    if (input.outcome === "HOLD") {
      newStatus = "ON_HOLD";
      await tx.fiberLot.update({
        where: { id: lot.id },
        data: { status: "ON_HOLD", currentWeightG: newWeightG },
      });
      shouldRecalcOrder = true;
    } else if (input.outcome === "REWORK") {
      // Re-enable in production if it was on hold
      newStatus = "IN_PRODUCTION";
      await tx.fiberLot.update({
        where: { id: lot.id },
        data: { status: "IN_PRODUCTION", currentWeightG: newWeightG },
      });
      shouldRecalcOrder = true;
    } else if (input.outcome === "FAIL") {
      // Keep weight reconciled; status remains open for supervisor disposition
      await tx.fiberLot.update({
        where: { id: lot.id },
        data: { currentWeightG: newWeightG },
      });
    } else if (input.outcome === "PASS") {
      // PASS: If the lot has completed the terminal stage, complete it now!
      if (isAtTerminalStage) {
        newStatus = "COMPLETED";
        await tx.fiberLot.update({
          where: { id: lot.id },
          data: { status: "COMPLETED", currentWeightG: newWeightG },
        });
        shouldRecalcOrder = true;
      } else {
        // Stages remain; keep lot in production with reconciled weight
        newStatus = lot.status === "ON_HOLD" ? "IN_PRODUCTION" : lot.status;
        await tx.fiberLot.update({
          where: { id: lot.id },
          data: { status: newStatus, currentWeightG: newWeightG },
        });
        if (lot.status === "ON_HOLD") shouldRecalcOrder = true;
      }
    }

    return {
      qc,
      lot: { ...lot, status: newStatus, currentWeightG: newWeightG },
      shouldRecalcOrder,
    };
  });

  if (result.shouldRecalcOrder) {
    await recalcOrderStatus(result.lot.orderId);
  }

  return result;
}
