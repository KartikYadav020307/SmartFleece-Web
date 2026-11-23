-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WORKER',
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "farmName" TEXT,
    "location" TEXT,
    "preferences" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shearingDate" TIMESTAMPTZ(3),
    "farmInfo" TEXT,
    "targetProduct" TEXT,
    "yarnSpecs" TEXT,
    "dyeSpecs" TEXT,
    "rush" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "estimatedCompletion" TIMESTAMPTZ(3),
    "etaConfidenceDays" INTEGER,
    "etaBasedOnSamples" INTEGER,
    "notes" TEXT,
    "trackingToken" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiberLot" (
    "id" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fiberType" TEXT NOT NULL,
    "breed" TEXT,
    "greaseWeightG" INTEGER NOT NULL,
    "currentWeightG" INTEGER NOT NULL,
    "currentStageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "conditionGrade" TEXT,
    "vmRating" TEXT,
    "stapleLengthMm" INTEGER,
    "microns" INTEGER,
    "color" TEXT,
    "photos" TEXT,
    "isBatch" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FiberLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "expectedLossPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "workerId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'COMPLETED',
    "machineId" TEXT,
    "machine" TEXT,
    "inputWeightG" INTEGER,
    "outputWeightG" INTEGER,
    "notes" TEXT,
    "clientEventId" TEXT,
    "revertedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineageEdge" (
    "id" TEXT NOT NULL,
    "parentLotId" TEXT NOT NULL,
    "childLotId" TEXT NOT NULL,
    "contributionG" INTEGER,
    "contributionPct" DOUBLE PRECISION,
    "lineageType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineageEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityFlag" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "stageEventId" TEXT,
    "flagType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "lotId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "event" TEXT NOT NULL,
    "recipient" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOGGED',
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "rushMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "minimumOrderFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "baseRatesJson" TEXT NOT NULL DEFAULT '{"default":25000}',
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "billableWeightG" INTEGER NOT NULL,
    "lineItemsJson" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "dueDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacityKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'Cash',
    "reference" TEXT,
    "recordedBy" TEXT,
    "paidAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCInspection" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "stageEventId" TEXT,
    "inspectorId" TEXT,
    "inspectorName" TEXT,
    "outcome" TEXT NOT NULL,
    "measuredWeightG" INTEGER,
    "previousWeightG" INTEGER,
    "weightDeltaG" INTEGER,
    "skeinCount" INTEGER,
    "totalYardageM" INTEGER,
    "actualPly" INTEGER,
    "actualTwist" TEXT,
    "visualGrade" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QCInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FiberLot_lotCode_key" ON "FiberLot"("lotCode");

-- CreateIndex
CREATE INDEX "FiberLot_orderId_idx" ON "FiberLot"("orderId");

-- CreateIndex
CREATE INDEX "FiberLot_customerId_idx" ON "FiberLot"("customerId");

-- CreateIndex
CREATE INDEX "FiberLot_status_idx" ON "FiberLot"("status");

-- CreateIndex
CREATE INDEX "FiberLot_currentStageId_idx" ON "FiberLot"("currentStageId");

-- CreateIndex
CREATE UNIQUE INDEX "StageEvent_clientEventId_key" ON "StageEvent"("clientEventId");

-- CreateIndex
CREATE INDEX "StageEvent_lotId_idx" ON "StageEvent"("lotId");

-- CreateIndex
CREATE INDEX "StageEvent_stageId_idx" ON "StageEvent"("stageId");

-- CreateIndex
CREATE INDEX "LineageEdge_parentLotId_idx" ON "LineageEdge"("parentLotId");

-- CreateIndex
CREATE INDEX "LineageEdge_childLotId_idx" ON "LineageEdge"("childLotId");

-- CreateIndex
CREATE INDEX "QualityFlag_lotId_idx" ON "QualityFlag"("lotId");

-- CreateIndex
CREATE INDEX "QualityFlag_status_idx" ON "QualityFlag"("status");

-- CreateIndex
CREATE INDEX "NotificationLog_orderId_idx" ON "NotificationLog"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "QCInspection_lotId_idx" ON "QCInspection"("lotId");

-- CreateIndex
CREATE INDEX "QCInspection_outcome_idx" ON "QCInspection"("outcome");

-- CreateIndex
CREATE INDEX "QCInspection_stageEventId_idx" ON "QCInspection"("stageEventId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLot" ADD CONSTRAINT "FiberLot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLot" ADD CONSTRAINT "FiberLot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLot" ADD CONSTRAINT "FiberLot_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "FiberLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_parentLotId_fkey" FOREIGN KEY ("parentLotId") REFERENCES "FiberLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_childLotId_fkey" FOREIGN KEY ("childLotId") REFERENCES "FiberLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityFlag" ADD CONSTRAINT "QualityFlag_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "FiberLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "FiberLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_stageEventId_fkey" FOREIGN KEY ("stageEventId") REFERENCES "StageEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
