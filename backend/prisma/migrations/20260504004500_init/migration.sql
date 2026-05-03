-- CreateEnum
CREATE TYPE "AuctionExtensionTrigger" AS ENUM ('BID_RECEIVED', 'ANY_RANK_CHANGE', 'L1_RANK_CHANGE');

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "bidStartAt" TIMESTAMP(3) NOT NULL,
    "initialBidCloseAt" TIMESTAMP(3) NOT NULL,
    "currentBidCloseAt" TIMESTAMP(3) NOT NULL,
    "forcedBidCloseAt" TIMESTAMP(3) NOT NULL,
    "pickupServiceAt" TIMESTAMP(3) NOT NULL,
    "triggerWindowMinutes" INTEGER NOT NULL,
    "extensionDurationMinutes" INTEGER NOT NULL,
    "extensionTrigger" "AuctionExtensionTrigger" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "freightCharges" DECIMAL(12,2) NOT NULL,
    "originCharges" DECIMAL(12,2) NOT NULL,
    "destinationCharges" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "transitTimeDays" INTEGER NOT NULL,
    "quoteValidityAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_referenceId_key" ON "Rfq"("referenceId");

-- CreateIndex
CREATE INDEX "Rfq_currentBidCloseAt_idx" ON "Rfq"("currentBidCloseAt");

-- CreateIndex
CREATE INDEX "Rfq_forcedBidCloseAt_idx" ON "Rfq"("forcedBidCloseAt");

-- CreateIndex
CREATE INDEX "Bid_rfqId_totalAmount_idx" ON "Bid"("rfqId", "totalAmount");

-- CreateIndex
CREATE INDEX "Bid_carrierName_idx" ON "Bid"("carrierName");

-- CreateIndex
CREATE INDEX "ActivityLog_rfqId_createdAt_idx" ON "ActivityLog"("rfqId", "createdAt");

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
