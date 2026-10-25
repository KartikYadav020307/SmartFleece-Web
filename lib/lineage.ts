import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import { pathExists, type Edge } from "./graph";

const SPLITTABLE = ["PENDING", "IN_PRODUCTION", "ON_HOLD"];

export type LineageNode = {
  id: string;
  lotCode: string;
  status: string;
  fiberType: string;
  isBatch: boolean;
  currentWeightG: number;
  customerName?: string;
  orderNumber?: string;
  contributionG?: number | null;
  children: LineageNode[];
};

/**
 * Defensive cycle guard (spec Priority 7): creating edge parent→child is only
 * valid if the child cannot already reach the parent through the lineage DAG.
 */
export async function assertNoCycle(parentId: string, childId: string): Promise<void> {
  if (parentId === childId) {
    throw new AppError(400, "A lot cannot be its own ancestor");
  }
  const edges: Edge[] = await prisma.lineageEdge.findMany({
    select: { parentLotId: true, childLotId: true },
  });
  if (pathExists(edges, childId, parentId)) {
    throw new AppError(400, "This lineage change would create a cycle in the lot graph");
  }
}

/**
 * Split a lot into 2–6 children. Children continue the pipeline at the
 * parent's current stage. If the child weights sum to less than the parent's
 * current weight, the parent keeps the remainder and stays active; if they
 * sum exactly, the parent is fully consumed.
 */
export async function splitLot(input: {
  parentId: string;
  children: { weightG: number; notes?: string }[];
  notes?: string;
}): Promise<string[]> {
  const parent = await prisma.fiberLot.findUnique({ where: { id: input.parentId } });
  if (!parent) throw new AppError(404, "Lot not found");
  if (!SPLITTABLE.includes(parent.status)) {
    throw new AppError(409, `Cannot split a lot in status ${parent.status}`);
  }
  const sum = input.children.reduce((acc, c) => acc + c.weightG, 0);
  if (sum > parent.currentWeightG) {
    throw new AppError(
      400,
      `Split weights total ${sum} g but the lot currently weighs ${parent.currentWeightG} g`
    );
  }
  if (input.children.some((c) => c.weightG <= 0)) {
    throw new AppError(400, "Every child lot needs a positive weight");
  }

  const childIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const child of input.children) {
      const share = parent.currentWeightG > 0 ? child.weightG / parent.currentWeightG : 0;
      const created = await createLotWithCodeTx(tx, {
        orderId: parent.orderId,
        customerId: parent.customerId,
        fiberType: parent.fiberType,
        breed: parent.breed,
        greaseWeightG: Math.round(parent.greaseWeightG * share),
        currentWeightG: child.weightG,
        currentStageId: parent.currentStageId,
        status: "PENDING",
        conditionGrade: parent.conditionGrade,
        vmRating: parent.vmRating,
        stapleLengthMm: parent.stapleLengthMm,
        microns: parent.microns,
        color: parent.color,
        notes: child.notes ?? null,
      });
      childIds.push(created.id);
      await assertNoCycleTx(parent.id, created.id);
      await tx.lineageEdge.create({
        data: {
          parentLotId: parent.id,
          childLotId: created.id,
          contributionG: child.weightG,
          contributionPct: share * 100,
          lineageType: "SPLIT",
          notes: input.notes ?? null,
        },
      });
    }
    const consumed = sum >= parent.currentWeightG;
    await tx.fiberLot.update({
      where: { id: parent.id },
      data: consumed
        ? { status: "CONSUMED" }
        : { currentWeightG: parent.currentWeightG - sum },
    });
  });
  return childIds;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function createLotWithCodeTx(tx: Tx, data: Omit<Prisma.FiberLotUncheckedCreateInput, "lotCode">) {
  const { newLotCode } = await import("./ids");
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await tx.fiberLot.create({ data: { ...data, lotCode: newLotCode() } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Unique constraint")) throw err;
    }
  }
  throw new AppError(500, "Could not allocate a unique lot code, please retry");
}

async function assertNoCycleTx(parentId: string, childId: string): Promise<void> {
  if (parentId === childId) throw new AppError(400, "A lot cannot be its own ancestor");
  const edges: Edge[] = await prisma.lineageEdge.findMany({
    select: { parentLotId: true, childLotId: true },
  });
  if (pathExists(edges, childId, parentId)) {
    throw new AppError(400, "This lineage change would create a cycle in the lot graph");
  }
}

/**
 * Blend 2+ lots into a new batch lot. The batch continues the pipeline at the
 * furthest stage any parent reached. Parents are fully consumed. The batch is
 * attached to the first parent's order/customer (documented limitation —
 * cross-order blends carry the first order's number for tracking purposes,
 * while full lineage remains queryable from every parent).
 */
export async function blendLots(input: {
  lotIds: string[];
  fiberType?: string;
  notes?: string;
}): Promise<string> {
  const lots = await prisma.fiberLot.findMany({ where: { id: { in: input.lotIds } } });
  if (lots.length !== input.lotIds.length) throw new AppError(404, "One or more lots were not found");
  if (new Set(input.lotIds).size !== input.lotIds.length) {
    throw new AppError(400, "Cannot blend a lot with itself");
  }
  for (const lot of lots) {
    if (!SPLITTABLE.includes(lot.status)) {
      throw new AppError(409, `Lot ${lot.lotCode} is in status ${lot.status} and cannot be blended`);
    }
  }

  const stages = await prisma.stage.findMany({ where: { isActive: true }, orderBy: { sequence: "asc" } });
  let furthestIdx = -1;
  for (const lot of lots) {
    const idx = stages.findIndex((s) => s.id === lot.currentStageId);
    if (idx > furthestIdx) furthestIdx = idx;
  }
  const currentStageId = furthestIdx >= 0 ? stages[furthestIdx].id : null;

  const primary = lots[0];
  const batchId = await prisma.$transaction(async (tx) => {
    const batch = await createLotWithCodeTx(tx, {
      orderId: primary.orderId,
      customerId: primary.customerId,
      fiberType: input.fiberType && input.fiberType.trim() ? input.fiberType.trim() : "Blend",
      breed: null,
      greaseWeightG: lots.reduce((acc, l) => acc + l.greaseWeightG, 0),
      currentWeightG: lots.reduce((acc, l) => acc + l.currentWeightG, 0),
      currentStageId,
      status: "PENDING",
      isBatch: true,
      color: null,
      notes: input.notes ?? null,
    });
    for (const lot of lots) {
      await assertNoCycleTx(lot.id, batch.id);
      await tx.lineageEdge.create({
        data: {
          parentLotId: lot.id,
          childLotId: batch.id,
          contributionG: lot.currentWeightG,
          contributionPct: lot.currentWeightG > 0 ? 100 : 0,
          lineageType: "BLEND",
          notes: input.notes ?? null,
        },
      });
      await tx.fiberLot.update({ where: { id: lot.id }, data: { status: "CONSUMED" } });
    }
    return batch.id;
  });
  return batchId;
}

/** Descendants tree (forward traceability: what came from this lot). */
export async function getDescendantTree(lotId: string, depth = 0, seen = new Set<string>()): Promise<LineageNode[]> {
  if (depth > 8 || seen.has(lotId)) return [];
  seen.add(lotId);
  const edges = await prisma.lineageEdge.findMany({
    where: { parentLotId: lotId },
    include: { childLot: { include: { customer: true, order: true } } },
    orderBy: { createdAt: "asc" },
  });
  const nodes: LineageNode[] = [];
  for (const edge of edges) {
    nodes.push({
      id: edge.childLot.id,
      lotCode: edge.childLot.lotCode,
      status: edge.childLot.status,
      fiberType: edge.childLot.fiberType,
      isBatch: edge.childLot.isBatch,
      currentWeightG: edge.childLot.currentWeightG,
      customerName: edge.childLot.customer?.name,
      orderNumber: edge.childLot.order?.orderNumber,
      contributionG: edge.contributionG,
      children: await getDescendantTree(edge.childLot.id, depth + 1, seen),
    });
  }
  return nodes;
}

/** Ancestors tree (backward traceability: what went into this lot). */
export async function getAncestorTree(lotId: string, depth = 0, seen = new Set<string>()): Promise<LineageNode[]> {
  if (depth > 8 || seen.has(lotId)) return [];
  seen.add(lotId);
  const edges = await prisma.lineageEdge.findMany({
    where: { childLotId: lotId },
    include: { parentLot: { include: { customer: true, order: true } } },
    orderBy: { createdAt: "asc" },
  });
  const nodes: LineageNode[] = [];
  for (const edge of edges) {
    nodes.push({
      id: edge.parentLot.id,
      lotCode: edge.parentLot.lotCode,
      status: edge.parentLot.status,
      fiberType: edge.parentLot.fiberType,
      isBatch: edge.parentLot.isBatch,
      currentWeightG: edge.parentLot.currentWeightG,
      customerName: edge.parentLot.customer?.name,
      orderNumber: edge.parentLot.order?.orderNumber,
      contributionG: edge.contributionG,
      children: await getAncestorTree(edge.parentLot.id, depth + 1, seen),
    });
  }
  return nodes;
}
