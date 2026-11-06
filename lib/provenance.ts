import { prisma } from "./db";
import { cleanYieldPct } from "./calc";
import { generateStoryToken } from "./story-token";
import { isQCFresh } from "./qc";

export type ProvenanceOrigin = {
  farmName: string;
  farmInfo: string | null;
  location: string | null;
  fiberType: string;
  breed: string | null;
  shearingDate: string | null;
  intakeWeightG: number;
  contributionPct: number;
};

export type ProvenanceStage = {
  stageName: string;
  sequence: number;
  completedAt: string;
  outputWeightG: number | null;
};

export type PublicFiberStory = {
  token: string;
  provenanceType: "SINGLE_ORIGIN" | "ARTISAN_BLEND";
  targetProduct: string;
  productDescription: string | null;
  yarnSpecs: string | null;
  dyeSpecs: string | null;
  color: string | null;
  conditionGrade: string | null;
  microns: number | null;
  stapleLengthMm: number | null;
  finishedWeightG: number;
  totalIntakeWeightG: number;
  overallYieldPct: number | null;
  origins: ProvenanceOrigin[];
  timeline: ProvenanceStage[];
  qualityCertified: boolean;
  qcCertifiedAt: string | null;
  qcVisualGrade: string | null;
  completedAt: string | null;
};

type LotWithDetails = {
  id: string;
  lotCode: string;
  status: string;
  fiberType: string;
  breed: string | null;
  greaseWeightG: number;
  currentWeightG: number;
  conditionGrade: string | null;
  stapleLengthMm: number | null;
  microns: number | null;
  color: string | null;
  isBatch: boolean;
  createdAt: Date;
  customer: {
    farmName: string | null;
    location: string | null;
  };
  order: {
    orderNumber: string;
    shearingDate: Date | null;
    farmInfo: string | null;
    targetProduct: string | null;
    yarnSpecs: string | null;
    dyeSpecs: string | null;
  };
  stageEvents: {
    id: string;
    stageId: string;
    eventType: string;
    inputWeightG: number | null;
    outputWeightG: number | null;
    revertedAt: Date | null;
    createdAt: Date;
    stage: {
      name: string;
      sequence: number;
    };
  }[];
  parents: {
    parentLotId: string;
    contributionG: number | null;
    contributionPct: number | null;
    lineageType: string;
  }[];
  qualityFlags: {
    status: string;
  }[];
  qcInspections: {
    id: string;
    stageEventId: string | null;
    outcome: string;
    visualGrade: string | null;
    createdAt: Date;
  }[];
};

/**
 * Recursively find all root ancestor lots (lots with no parents) and their
 * contribution to this lot.
 */
async function findRootOrigins(
  lotId: string,
  weightShare = 1.0,
  visited = new Set<string>()
): Promise<{ lot: LotWithDetails; effectiveIntakeG: number; effectiveWeightShare: number }[]> {
  if (visited.has(lotId)) return [];
  visited.add(lotId);

  const lot = (await prisma.fiberLot.findUnique({
    where: { id: lotId },
    include: {
      customer: { select: { farmName: true, location: true } },
      order: {
        select: {
          orderNumber: true,
          shearingDate: true,
          farmInfo: true,
          targetProduct: true,
          yarnSpecs: true,
          dyeSpecs: true,
        },
      },
      stageEvents: {
        where: { revertedAt: null, eventType: "COMPLETED" },
        include: { stage: { select: { name: true, sequence: true } } },
        orderBy: { createdAt: "asc" },
      },
      parents: true,
      qualityFlags: { select: { status: true } },
      qcInspections: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          stageEventId: true,
          outcome: true,
          visualGrade: true,
          createdAt: true,
        },
      },
    },
  })) as LotWithDetails | null;

  if (!lot) return [];

  // If lot has no parents, it is a root intake lot
  if (!lot.parents || lot.parents.length === 0) {
    return [
      {
        lot,
        effectiveIntakeG: Math.round(lot.greaseWeightG * weightShare),
        effectiveWeightShare: weightShare,
      },
    ];
  }

  // If lot has parents, trace each parent recursively
  const totalParentWeight = lot.parents.reduce((acc, p) => acc + (p.contributionG ?? 0), 0);
  const results: { lot: LotWithDetails; effectiveIntakeG: number; effectiveWeightShare: number }[] = [];

  for (const edge of lot.parents) {
    const parentShare =
      totalParentWeight > 0 && edge.contributionG
        ? edge.contributionG / totalParentWeight
        : 1 / lot.parents.length;
    const subRoots = await findRootOrigins(edge.parentLotId, weightShare * parentShare, visited);
    results.push(...subRoots);
  }

  return results;
}

/**
 * Collect all completed stage events for a lot, including ancestor stage events
 * that happened before this lot was split or blended from them.
 */
async function collectTimeline(
  lotId: string,
  visited = new Set<string>()
): Promise<ProvenanceStage[]> {
  if (visited.has(lotId)) return [];
  visited.add(lotId);

  const lot = await prisma.fiberLot.findUnique({
    where: { id: lotId },
    include: {
      stageEvents: {
        where: { revertedAt: null, eventType: "COMPLETED" },
        include: { stage: { select: { name: true, sequence: true } } },
        orderBy: { createdAt: "asc" },
      },
      parents: { select: { parentLotId: true } },
    },
  });

  if (!lot) return [];

  const stages: ProvenanceStage[] = lot.stageEvents.map((evt) => ({
    stageName: evt.stage.name,
    sequence: evt.stage.sequence,
    completedAt: evt.createdAt.toISOString(),
    outputWeightG: evt.outputWeightG,
  }));

  // Also collect parent stages if any exist
  for (const parent of lot.parents) {
    const parentStages = await collectTimeline(parent.parentLotId, visited);
    for (const pStage of parentStages) {
      if (!stages.some((s) => s.stageName === pStage.stageName)) {
        stages.push(pStage);
      }
    }
  }

  // Sort by sequence, then completedAt
  stages.sort((a, b) => a.sequence - b.sequence || new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  return stages;
}

/**
 * Generate a public Fiber Story for a given lot ID.
 * Returns null if the lot does not exist or is CANCELLED.
 */
export async function getPublicFiberStory(lotId: string): Promise<PublicFiberStory | null> {
  const lot = (await prisma.fiberLot.findUnique({
    where: { id: lotId },
    include: {
      customer: { select: { farmName: true, location: true } },
      order: {
        select: {
          orderNumber: true,
          shearingDate: true,
          farmInfo: true,
          targetProduct: true,
          yarnSpecs: true,
          dyeSpecs: true,
        },
      },
      stageEvents: {
        where: { revertedAt: null, eventType: "COMPLETED" },
        include: { stage: { select: { name: true, sequence: true } } },
        orderBy: { createdAt: "asc" },
      },
      parents: true,
      qualityFlags: { select: { status: true } },
      qcInspections: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          stageEventId: true,
          outcome: true,
          visualGrade: true,
          createdAt: true,
        },
      },
    },
  })) as LotWithDetails | null;

  if (!lot || lot.status === "CANCELLED") return null;

  // Retrieve root origins
  const roots = await findRootOrigins(lotId);

  const totalIntakeWeightG = roots.reduce((acc, r) => acc + r.effectiveIntakeG, 0) || lot.greaseWeightG;
  const finishedWeightG = lot.currentWeightG;
  const overallYield = cleanYieldPct(totalIntakeWeightG, finishedWeightG);

  // Origins allowlist
  const origins: ProvenanceOrigin[] = roots.map((r) => {
    const rootLot = r.lot;
    const farmName =
      rootLot.customer.farmName?.trim() ||
      rootLot.order.farmInfo?.trim() ||
      "Regional Partner Farm";
    return {
      farmName,
      farmInfo: rootLot.order.farmInfo?.trim() ?? null,
      location: rootLot.customer.location?.trim() ?? null,
      fiberType: rootLot.fiberType,
      breed: rootLot.breed?.trim() ?? null,
      shearingDate: rootLot.order.shearingDate ? rootLot.order.shearingDate.toISOString().split("T")[0] : null,
      intakeWeightG: r.effectiveIntakeG,
      contributionPct: Math.round(r.effectiveWeightShare * 100),
    };
  });

  // Timeline
  const timeline = await collectTimeline(lotId);

  // Quality check: no open flags AND fresh passing finished-goods QC
  const hasOpenFlag = lot.qualityFlags.some((f) => f.status === "OPEN");
  const latestQC = (lot.qcInspections[0] as unknown as (import("@prisma/client").QCInspection & { stageEvent?: { id: string } | null })) ?? null;
  const isPassingQC = Boolean(latestQC && latestQC.outcome === "PASS" && isQCFresh(lot, latestQC));
  const qualityCertified = !hasOpenFlag && isPassingQC;
  const qcCertifiedAt = qualityCertified && latestQC ? new Date(latestQC.createdAt).toISOString() : null;
  const qcVisualGrade = qualityCertified && latestQC?.visualGrade ? latestQC.visualGrade : null;

  // Determine last completed date
  const lastEvent = lot.stageEvents[lot.stageEvents.length - 1];
  const completedAt = lot.status === "COMPLETED" && lastEvent ? lastEvent.createdAt.toISOString() : null;

  const provenanceType: PublicFiberStory["provenanceType"] =
    origins.length > 1 || lot.isBatch ? "ARTISAN_BLEND" : "SINGLE_ORIGIN";

  return {
    token: generateStoryToken(lot.id),
    provenanceType,
    targetProduct: lot.order.targetProduct || "Finished Fiber Product",
    productDescription: lot.order.yarnSpecs || lot.order.dyeSpecs || null,
    yarnSpecs: lot.order.yarnSpecs ?? null,
    dyeSpecs: lot.order.dyeSpecs ?? null,
    color: lot.color ?? null,
    conditionGrade: lot.conditionGrade ?? null,
    microns: lot.microns ?? null,
    stapleLengthMm: lot.stapleLengthMm ?? null,
    finishedWeightG,
    totalIntakeWeightG,
    overallYieldPct: overallYield,
    origins,
    timeline,
    qualityCertified,
    qcCertifiedAt,
    qcVisualGrade,
    completedAt,
  };
}
