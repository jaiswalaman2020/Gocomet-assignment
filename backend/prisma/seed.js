import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60_000);
}

function total(freightCharges, originCharges, destinationCharges) {
  return (freightCharges + originCharges + destinationCharges).toFixed(2);
}

function bid(carrierName, freightCharges, originCharges, destinationCharges, transitTimeDays, quoteValidityAt) {
  return {
    carrierName,
    freightCharges: freightCharges.toFixed(2),
    originCharges: originCharges.toFixed(2),
    destinationCharges: destinationCharges.toFixed(2),
    totalAmount: total(freightCharges, originCharges, destinationCharges),
    transitTimeDays,
    quoteValidityAt
  };
}

async function main() {
  await prisma.activityLog.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.rfq.deleteMany({
    where: {
      referenceId: {
        in: ["DEMO-ACTIVE-001", "DEMO-SCHEDULED-001", "DEMO-CLOSED-001"]
      }
    }
  });

  const active = await prisma.rfq.create({
    data: {
      name: "Active Demo - Mumbai to Dubai Freight",
      referenceId: "DEMO-ACTIVE-001",
      bidStartAt: minutesFromNow(-45),
      initialBidCloseAt: minutesFromNow(15),
      currentBidCloseAt: minutesFromNow(15),
      forcedBidCloseAt: minutesFromNow(45),
      pickupServiceAt: minutesFromNow(60 * 24 * 3),
      triggerWindowMinutes: 10,
      extensionDurationMinutes: 5,
      extensionTrigger: "L1_RANK_CHANGE",
      bids: {
        create: [
          bid("BlueLine Logistics", 85000, 12000, 9500, 7, minutesFromNow(60 * 24 * 10)),
          bid("OceanSwift Carriers", 82000, 11500, 9000, 8, minutesFromNow(60 * 24 * 12)),
          bid("Atlas Freight", 80000, 11800, 8700, 6, minutesFromNow(60 * 24 * 9))
        ]
      },
      activityLogs: {
        create: [
          {
            type: "AUCTION_CREATED",
            message: "Demo active British auction created.",
            metadata: { extensionTrigger: "L1_RANK_CHANGE" }
          },
          {
            type: "BID_SUBMITTED",
            message: "BlueLine Logistics submitted an opening bid."
          },
          {
            type: "BID_SUBMITTED",
            message: "Atlas Freight became the current L1 supplier."
          }
        ]
      }
    }
  });

  await prisma.activityLog.create({
    data: {
      rfqId: active.id,
      type: "TIME_EXTENDED",
      message: "Auction extended due to L1 rank change in trigger window.",
      metadata: {
        reason: "Lowest bidder changed in trigger window.",
        previousClose: minutesFromNow(10),
        newClose: minutesFromNow(15)
      }
    }
  });

  await prisma.rfq.create({
    data: {
      name: "Scheduled Demo - Chennai Export Lane",
      referenceId: "DEMO-SCHEDULED-001",
      bidStartAt: minutesFromNow(30),
      initialBidCloseAt: minutesFromNow(90),
      currentBidCloseAt: minutesFromNow(90),
      forcedBidCloseAt: minutesFromNow(120),
      pickupServiceAt: minutesFromNow(60 * 24 * 5),
      triggerWindowMinutes: 15,
      extensionDurationMinutes: 5,
      extensionTrigger: "BID_RECEIVED",
      activityLogs: {
        create: {
          type: "AUCTION_CREATED",
          message: "Demo scheduled British auction created."
        }
      }
    }
  });

  await prisma.rfq.create({
    data: {
      name: "Force Closed Demo - Nhava Sheva Import",
      referenceId: "DEMO-CLOSED-001",
      bidStartAt: minutesFromNow(-180),
      initialBidCloseAt: minutesFromNow(-60),
      currentBidCloseAt: minutesFromNow(-30),
      forcedBidCloseAt: minutesFromNow(-5),
      pickupServiceAt: minutesFromNow(60 * 24),
      triggerWindowMinutes: 10,
      extensionDurationMinutes: 10,
      extensionTrigger: "ANY_RANK_CHANGE",
      bids: {
        create: [
          bid("RapidMove", 92000, 14200, 10000, 9, minutesFromNow(60 * 24 * 4)),
          bid("HarborLink", 89000, 13800, 9800, 10, minutesFromNow(60 * 24 * 4))
        ]
      },
      activityLogs: {
        create: [
          {
            type: "AUCTION_CREATED",
            message: "Demo force-closed British auction created."
          },
          {
            type: "BID_SUBMITTED",
            message: "HarborLink submitted the final lowest bid."
          },
          {
            type: "TIME_EXTENDED",
            message: "Auction reached forced close and cannot extend further.",
            metadata: { reason: "Forced bid close cap reached." }
          }
        ]
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seeded British auction demo data.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
