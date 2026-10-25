/**
 * SmartFleece development seed.
 *
 * Creates demo users, the default stage pipeline, and clearly-marked sample
 * customers/orders/lots with realistic production history — including a
 * cross-order blend, a split, quality flags and notification records.
 *
 * DESTRUCTIVE: wipes existing rows first. Dev database only.
 *
 * Run: npm run db:seed  (or npm run db:reset to recreate the schema too)
 */
import { PrismaClient, Stage } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_STAGES } from "../lib/constants";
import { newLotCode, newTrackingToken } from "../lib/ids";

const prisma = new PrismaClient();
const HOUR = 3_600_000;
const DAY = 86_400_000;

async function main() {
  console.log("Seeding…");

  // Wipe in FK-safe order.
  await prisma.notificationLog.deleteMany();
  await prisma.qualityFlag.deleteMany();
  await prisma.lineageEdge.deleteMany();
  await prisma.stageEvent.deleteMany();
  await prisma.fiberLot.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const [owner, worker] = await Promise.all([
    prisma.user.create({
      data: { email: "owner@smartfleece.local", passwordHash, name: "Asha Kapoor", role: "OWNER", isSample: true },
    }),
    prisma.user.create({
      data: { email: "worker@smartfleece.local", passwordHash, name: "Sam Carder", role: "WORKER", isSample: true },
    }),
  ]);

  const stages: Stage[] = [];
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const def = DEFAULT_STAGES[i];
    stages.push(
      await prisma.stage.create({
        data: { name: def.name, sequence: i, optional: def.optional ?? false, expectedLossPct: def.expectedLossPct ?? 0 },
      })
    );
  }

  const customers = {
    ravi: await prisma.customer.create({
      data: {
        name: "Ravi Sharma",
        email: "ravi@example.com",
        phone: "+91 98100 11111",
        farmName: "Himalayan Merino Farm",
        location: "Palampur, HP",
        preferences: "2-ply fingering weight, no wash additive, 100 g skeins.",
        notes: "Long-time customer. Tends to send vegetable-matter-heavy fleeces — check skirts carefully.",
        isSample: true,
      },
    }),
    priya: await prisma.customer.create({
      data: {
        name: "Priya Patel",
        email: "priya@example.com",
        farmName: "Alpaca Meadows",
        location: "Coonoor, TN",
        preferences: "Soft handling — alpaca has no grease, gentle wash only.",
        isSample: true,
      },
    }),
    arjun: await prisma.customer.create({
      data: {
        name: "Arjun Mehta",
        email: "arjun@example.com",
        farmName: "Deccan Wool Co.",
        location: "Hyderabad, TS",
        isSample: true,
      },
    }),
    meera: await prisma.customer.create({
      data: {
        name: "Meera Iyer",
        email: "meera@example.com",
        farmName: "Angora Haven",
        location: "Ooty, TN",
        isSample: true,
      },
    }),
  };

  /** Create a lot and run it through `upto` stage index with given output weights. */
  async function makeLot(opts: {
    orderId: string;
    customerId: string;
    fiberType: string;
    breed?: string;
    color?: string;
    greaseWeightG: number;
    vmRating?: string;
    conditionGrade?: string;
    upto: number; // last completed stage index
    weights: number[]; // output weight per completed stage
    start: Date; // first event timestamp
    stepHours?: number;
  }) {
    const lot = await prisma.fiberLot.create({
      data: {
        lotCode: newLotCode(),
        orderId: opts.orderId,
        customerId: opts.customerId,
        fiberType: opts.fiberType,
        breed: opts.breed,
        color: opts.color,
        greaseWeightG: opts.greaseWeightG,
        currentWeightG: opts.greaseWeightG,
        currentStageId: stages[0].id,
        status: "PENDING",
        vmRating: opts.vmRating,
        conditionGrade: opts.conditionGrade,
        isSample: true,
      },
    });
    let prev = opts.greaseWeightG;
    let t = opts.start.getTime();
    const step = (opts.stepHours ?? 8) * HOUR;
    for (let i = 0; i <= opts.upto; i++) {
      const out = opts.weights[i];
      await prisma.stageEvent.create({
        data: {
          lotId: lot.id,
          stageId: stages[i].id,
          workerId: worker.id,
          eventType: "COMPLETED",
          inputWeightG: prev,
          outputWeightG: out,
          createdAt: new Date(t),
        },
      });
      prev = out;
      t += step;
    }
    const completed = opts.upto === stages.length - 1;
    await prisma.fiberLot.update({
      where: { id: lot.id },
      data: {
        currentStageId: stages[Math.min(opts.upto + 1, stages.length - 1)].id,
        currentWeightG: prev,
        status: completed ? "COMPLETED" : "IN_PRODUCTION",
      },
    });
    return { lot, finalWeight: prev };
  }

  async function makeOrder(opts: {
    orderNumber: string;
    customerId: string;
    daysAgo: number;
    status: string;
    targetProduct?: string;
    rush?: boolean;
    yarnSpecs?: string;
    shearingDate?: Date;
    farmInfo?: string;
    notes?: string;
  }) {
    return prisma.order.create({
      data: {
        orderNumber: opts.orderNumber,
        customerId: opts.customerId,
        orderDate: new Date(Date.now() - opts.daysAgo * DAY),
        status: opts.status,
        targetProduct: opts.targetProduct,
        rush: opts.rush ?? false,
        yarnSpecs: opts.yarnSpecs,
        shearingDate: opts.shearingDate,
        farmInfo: opts.farmInfo,
        notes: opts.notes,
        trackingToken: newTrackingToken(),
        isSample: true,
      },
    });
  }

  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * DAY);

  // ── ORD-1021: Ravi — fully completed last month ──────────────────────────
  const o1021 = await makeOrder({
    orderNumber: "ORD-1021",
    customerId: customers.ravi.id,
    daysAgo: 32,
    status: "COMPLETED",
    targetProduct: "Yarn",
    yarnSpecs: "Fingering weight, 2-ply, Z twist",
    shearingDate: daysAgo(40),
    farmInfo: "2024 spring clip, 12 ewes",
  });
  const { lot: l1021, finalWeight: w1021 } = await makeLot({
    orderId: o1021.id,
    customerId: customers.ravi.id,
    fiberType: "Merino Wool",
    breed: "Merino",
    color: "White",
    greaseWeightG: 4200,
    vmRating: "Low",
    conditionGrade: "B",
    upto: 15,
    weights: [4200, 4100, 3900, 2450, 2420, 2390, 2340, 2300, 2290, 2270, 2250, 2250, 2240, 2230, 2220, 2210],
    start: daysAgo(32),
    stepHours: 14,
  });
  await prisma.order.update({
    where: { id: o1021.id },
    data: { estimatedCompletion: daysAgo(24), updatedAt: daysAgo(24) },
  });
  await prisma.qualityFlag.create({
    data: {
      lotId: l1021.id,
      flagType: "WEIGHT",
      severity: "LOW",
      notes: "Automatic alert: 37.2% weight change at Washing vs 35% expected. Reviewed — normal for this clip.",
      status: "RESOLVED",
      resolvedBy: "Asha Kapoor",
      resolvedAt: daysAgo(28),
      createdAt: daysAgo(30),
    },
  });
  await prisma.notificationLog.createMany({
    data: [
      {
        orderId: o1021.id,
        event: "ORDER_RECEIVED",
        recipient: customers.ravi.email,
        subject: "Order ORD-1021 received",
        body: "Hello Ravi Sharma — we've received your fiber and tagged each bag with a QR code.",
        createdAt: daysAgo(32),
      },
      {
        orderId: o1021.id,
        event: "ORDER_READY",
        recipient: customers.ravi.email,
        subject: "Order ORD-1021 is ready!",
        body: "Your order has finished processing and is ready for pickup.",
        createdAt: daysAgo(24),
      },
    ],
  });

  // ── ORD-1024: Ravi — rush order in production ────────────────────────────
  const o1024 = await makeOrder({
    orderNumber: "ORD-1024",
    customerId: customers.ravi.id,
    daysAgo: 12,
    status: "IN_PRODUCTION",
    targetProduct: "Yarn",
    rush: true,
    yarnSpecs: "DK weight, 3-ply",
    shearingDate: daysAgo(18),
    notes: "Customer wants the two bags processed identically.",
  });
  const lotA = await makeLot({
    orderId: o1024.id,
    customerId: customers.ravi.id,
    fiberType: "Merino Wool",
    breed: "Merino",
    color: "White",
    greaseWeightG: 6200,
    vmRating: "Low",
    conditionGrade: "A",
    upto: 6, // through Picking → currently at Carding (idx 7)
    weights: [6200, 6050, 5800, 3700, 3660, 3610, 3540],
    start: daysAgo(12),
    stepHours: 16,
  });
  await makeLot({
    orderId: o1024.id,
    customerId: customers.ravi.id,
    fiberType: "Merino Wool",
    breed: "Merino",
    color: "Cream",
    greaseWeightG: 4000,
    vmRating: "Medium",
    conditionGrade: "B",
    upto: 3, // through Washing → at Rinse
    weights: [4000, 3900, 3700, 2350],
    start: daysAgo(11),
    stepHours: 18,
  });
  await prisma.notificationLog.create({
    data: {
      orderId: o1024.id,
      lotId: lotA.lot.id,
      event: "STAGE_COMPLETE",
      recipient: customers.ravi.email,
      subject: "Order ORD-1024: Washing complete",
      body: "Hello Ravi Sharma — your fiber has completed Washing at the mill.",
      createdAt: daysAgo(8),
    },
  });

  // ── ORD-1025: Priya — stalled alpaca lot with an open flag ───────────────
  const o1025 = await makeOrder({
    orderNumber: "ORD-1025",
    customerId: customers.priya.id,
    daysAgo: 10,
    status: "IN_PRODUCTION",
    targetProduct: "Roving",
    notes: "Alpaca — gentle wash cycle only.",
  });
  const priyaLot = await makeLot({
    orderId: o1025.id,
    customerId: customers.priya.id,
    fiberType: "Huacaya Alpaca",
    breed: "Huacaya",
    color: "Brown",
    greaseWeightG: 3000,
    vmRating: "Heavy",
    conditionGrade: "C",
    upto: 2, // through Skirt → at Washing; last event 5 days ago (stalled)
    weights: [3000, 2950, 2750],
    start: daysAgo(10),
    stepHours: 10,
  });
  await prisma.qualityFlag.create({
    data: {
      lotId: priyaLot.lot.id,
      flagType: "VM",
      severity: "MEDIUM",
      notes: "Heavy vegetable matter through the whole fleece — needs an extra picking pass after washing.",
      createdAt: daysAgo(6),
    },
  });

  // ── ORD-1026 / ORD-1027: cross-customer blend, then split ────────────────
  const o1026 = await makeOrder({
    orderNumber: "ORD-1026",
    customerId: customers.arjun.id,
    daysAgo: 9,
    status: "IN_PRODUCTION",
    targetProduct: "Yarn",
    notes: "Agreed with Meera to co-process a wool/angora blend batch.",
  });
  const o1027 = await makeOrder({
    orderNumber: "ORD-1027",
    customerId: customers.meera.id,
    daysAgo: 9,
    status: "IN_PRODUCTION",
    targetProduct: "Yarn",
    notes: "Tracked via the blend batch in ORD-1026.",
  });
  const arjunLot = await makeLot({
    orderId: o1026.id,
    customerId: customers.arjun.id,
    fiberType: "Other Wool",
    breed: "Deccani",
    color: "Grey",
    greaseWeightG: 2000,
    vmRating: "Low",
    conditionGrade: "B",
    upto: 4, // through Rinse → at Drying
    weights: [2000, 1950, 1850, 1250, 1230],
    start: daysAgo(9),
    stepHours: 10,
  });
  const meeraLot = await makeLot({
    orderId: o1027.id,
    customerId: customers.meera.id,
    fiberType: "Angora",
    breed: "Angora",
    color: "White",
    greaseWeightG: 1500,
    vmRating: "None",
    conditionGrade: "A",
    upto: 4,
    weights: [1500, 1470, 1400, 1310, 1300],
    start: daysAgo(9),
    stepHours: 10,
  });

  // Blend the two washed lots into a batch that continues at Drying (idx 5).
  const batch = await prisma.fiberLot.create({
    data: {
      lotCode: newLotCode(),
      orderId: o1026.id,
      customerId: customers.arjun.id,
      fiberType: "Blend",
      greaseWeightG: arjunLot.lot.greaseWeightG + meeraLot.lot.greaseWeightG,
      currentWeightG: arjunLot.finalWeight + meeraLot.finalWeight,
      currentStageId: stages[5].id,
      status: "PENDING",
      isBatch: true,
      isSample: true,
      notes: "Wool/angora co-op batch — Arjun (Deccani) + Meera (Angora).",
    },
  });
  await prisma.lineageEdge.createMany({
    data: [
      { parentLotId: arjunLot.lot.id, childLotId: batch.id, contributionG: arjunLot.finalWeight, contributionPct: (arjunLot.finalWeight / (arjunLot.finalWeight + meeraLot.finalWeight)) * 100, lineageType: "BLEND" },
      { parentLotId: meeraLot.lot.id, childLotId: batch.id, contributionG: meeraLot.finalWeight, contributionPct: (meeraLot.finalWeight / (arjunLot.finalWeight + meeraLot.finalWeight)) * 100, lineageType: "BLEND" },
    ],
  });
  await prisma.fiberLot.updateMany({
    where: { id: { in: [arjunLot.lot.id, meeraLot.lot.id] } },
    data: { status: "CONSUMED" },
  });

  // Batch completes Drying + Picking (idx 5, 6) → at Carding (idx 7).
  const batchStart = daysAgo(5);
  const batchWeights = [2480, 2450]; // outputs of Drying, Picking
  let prev = arjunLot.finalWeight + meeraLot.finalWeight;
  let t = batchStart.getTime();
  for (let i = 0; i <= 1; i++) {
    await prisma.stageEvent.create({
      data: { lotId: batch.id, stageId: stages[5 + i].id, workerId: worker.id, eventType: "COMPLETED", inputWeightG: prev, outputWeightG: batchWeights[i], createdAt: new Date(t) },
    });
    prev = batchWeights[i];
    t += 12 * HOUR;
  }
  await prisma.fiberLot.update({
    where: { id: batch.id },
    data: { currentStageId: stages[7].id, currentWeightG: prev, status: "IN_PRODUCTION" },
  });

  // Split the batch: yarn child (continues) + felt child (on hold), full allocation.
  const children = [
    { weight: 1700, notes: "Yarn portion", status: "IN_PRODUCTION", extraEvent: true },
    { weight: 750, notes: "Felt portion", status: "ON_HOLD", extraEvent: false },
  ];
  for (const child of children) {
    const created = await prisma.fiberLot.create({
      data: {
        lotCode: newLotCode(),
        orderId: o1026.id,
        customerId: customers.arjun.id,
        fiberType: "Blend",
        greaseWeightG: Math.round((child.weight / 2450) * 3500),
        currentWeightG: child.weight,
        currentStageId: stages[7].id,
        status: child.status,
        isSample: true,
        notes: child.notes,
      },
    });
    await prisma.lineageEdge.create({
      data: { parentLotId: batch.id, childLotId: created.id, contributionG: child.weight, contributionPct: (child.weight / 2450) * 100, lineageType: "SPLIT" },
    });
    if (child.extraEvent) {
      // Yarn child already carded → at Combing.
      await prisma.stageEvent.create({
        data: { lotId: created.id, stageId: stages[7].id, workerId: worker.id, eventType: "COMPLETED", inputWeightG: child.weight, outputWeightG: 1680, createdAt: daysAgo(1) },
      });
      await prisma.fiberLot.update({
        where: { id: created.id },
        data: { currentStageId: stages[8].id, currentWeightG: 1680 },
      });
    }
  }
  await prisma.fiberLot.update({ where: { id: batch.id }, data: { status: "CONSUMED" } });

  await prisma.notificationLog.create({
    data: {
      orderId: o1025.id,
      event: "DELAY",
      recipient: customers.priya.email,
      subject: "Order ORD-1025 — small delay",
      body: "Hello Priya Patel — heavy vegetable matter needs an extra picking pass. We'll confirm a new completion date shortly.",
      createdAt: daysAgo(5),
    },
  });

  const counts = {
    users: await prisma.user.count(),
    stages: await prisma.stage.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    lots: await prisma.fiberLot.count(),
    stageEvents: await prisma.stageEvent.count(),
    lineageEdges: await prisma.lineageEdge.count(),
    flags: await prisma.qualityFlag.count(),
    notifications: await prisma.notificationLog.count(),
  };
  console.log("Seed complete:", counts);
  console.log(`Final yield of ORD-1021 lot ${l1021.lotCode}: ${(w1021 / 4200 * 100).toFixed(0)}%`);
  console.log("Login: owner@smartfleece.local / demo1234 (worker@smartfleece.local / demo1234)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
