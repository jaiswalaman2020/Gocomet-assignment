import { prisma } from "../lib/prisma.js";

const TRIGGERS = {
  BID_RECEIVED: "BID_RECEIVED",
  ANY_RANK_CHANGE: "ANY_RANK_CHANGE",
  L1_RANK_CHANGE: "L1_RANK_CHANGE",
};

export function toMoney(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error("Charges must be valid non-negative numbers.");
  }
  return numberValue.toFixed(2);
}

function parseDate(value, fieldName) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} must be a valid date.`);
    error.statusCode = 400;
    throw error;
  }

  return date;
}

export function getAuctionStatus(rfq, now = new Date()) {
  if (now >= rfq.forcedBidCloseAt) return "FORCE_CLOSED";
  if (now >= rfq.currentBidCloseAt) return "CLOSED";
  if (now < rfq.bidStartAt) return "SCHEDULED";
  return "ACTIVE";
}

export async function listAuctions() {
  const rfqs = await prisma.rfq.findMany({
    include: {
      bids: {
        orderBy: [{ totalAmount: "asc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return rfqs.map((rfq) => ({
    ...rfq,
    status: getAuctionStatus(rfq),
    currentLowestBid: rfq.bids[0]?.totalAmount ?? null,
  }));
}

export async function getAuctionDetails(id) {
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: {
      bids: { orderBy: [{ totalAmount: "asc" }, { createdAt: "asc" }] },
      activityLogs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!rfq) return null;

  return {
    ...rfq,
    status: getAuctionStatus(rfq),
    bids: rfq.bids.map((bid, index) => ({
      ...bid,
      rank: `L${index + 1}`,
    })),
  };
}

export async function createAuction(data) {
  const bidStartAt = parseDate(data.bidStartAt, "Bid start time");
  const initialBidCloseAt = parseDate(data.initialBidCloseAt, "Bid close time");
  const forcedBidCloseAt = parseDate(
    data.forcedBidCloseAt,
    "Forced bid close time",
  );
  const pickupServiceAt = parseDate(
    data.pickupServiceAt,
    "Pickup / service date",
  );

  if (forcedBidCloseAt <= initialBidCloseAt) {
    const error = new Error(
      "Forced bid close time must be greater than bid close time.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (initialBidCloseAt <= bidStartAt) {
    const error = new Error(
      "Bid close time must be greater than bid start time.",
    );
    error.statusCode = 400;
    throw error;
  }

  return prisma.rfq.create({
    data: {
      name: data.name,
      referenceId: data.referenceId,
      bidStartAt,
      initialBidCloseAt,
      currentBidCloseAt: initialBidCloseAt,
      forcedBidCloseAt,
      pickupServiceAt,
      triggerWindowMinutes: data.triggerWindowMinutes,
      extensionDurationMinutes: data.extensionDurationMinutes,
      extensionTrigger: data.extensionTrigger,
      activityLogs: {
        create: {
          type: "AUCTION_CREATED",
          message: "British auction RFQ created.",
          metadata: {
            triggerWindowMinutes: data.triggerWindowMinutes,
            extensionDurationMinutes: data.extensionDurationMinutes,
            extensionTrigger: data.extensionTrigger,
          },
        },
      },
    },
  });
}

export function getCarrierRanks(bids) {
  const bestByCarrier = new Map();

  for (const bid of bids) {
    const current = bestByCarrier.get(bid.carrierName);
    if (!current || Number(bid.totalAmount) < Number(current.totalAmount)) {
      bestByCarrier.set(bid.carrierName, bid);
    }
  }

  return [...bestByCarrier.values()]
    .sort(
      (a, b) =>
        Number(a.totalAmount) - Number(b.totalAmount) ||
        a.createdAt - b.createdAt,
    )
    .map((bid) => bid.carrierName);
}

export function shouldExtendAuction({
  rfq,
  previousRanks,
  nextRanks,
  submittedAt,
}) {
  const windowStart = new Date(
    rfq.currentBidCloseAt.getTime() - rfq.triggerWindowMinutes * 60_000,
  );
  const inTriggerWindow =
    submittedAt >= windowStart && submittedAt <= rfq.currentBidCloseAt;

  if (!inTriggerWindow) {
    return { shouldExtend: false, reason: null };
  }

  if (rfq.extensionTrigger === TRIGGERS.BID_RECEIVED) {
    return { shouldExtend: true, reason: "Bid received in trigger window." };
  }

  if (rfq.extensionTrigger === TRIGGERS.ANY_RANK_CHANGE) {
    const rankChanged = previousRanks.join("|") !== nextRanks.join("|");
    return {
      shouldExtend: rankChanged,
      reason: rankChanged
        ? "Supplier ranking changed in trigger window."
        : null,
    };
  }

  const previousL1 = previousRanks[0] ?? null;
  const nextL1 = nextRanks[0] ?? null;
  const l1Changed = previousL1 !== nextL1;
  return {
    shouldExtend: l1Changed,
    reason: l1Changed ? "Lowest bidder changed in trigger window." : null,
  };
}

export async function submitBid(rfqId, data) {
  const submittedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id: rfqId },
      include: { bids: true },
    });

    if (!rfq) {
      const error = new Error("RFQ not found.");
      error.statusCode = 404;
      throw error;
    }

    const status = getAuctionStatus(rfq, submittedAt);
    if (status !== "ACTIVE") {
      const error = new Error(
        `Auction is ${status.toLowerCase().replace("_", " ")}.`,
      );
      error.statusCode = 400;
      throw error;
    }

    const freightCharges = toMoney(data.freightCharges);
    const originCharges = toMoney(data.originCharges);
    const destinationCharges = toMoney(data.destinationCharges);
    const totalAmount = (
      Number(freightCharges) +
      Number(originCharges) +
      Number(destinationCharges)
    ).toFixed(2);

    const previousRanks = getCarrierRanks(rfq.bids);
    const bid = await tx.bid.create({
      data: {
        rfqId,
        carrierName: data.carrierName,
        freightCharges,
        originCharges,
        destinationCharges,
        totalAmount,
        transitTimeDays: data.transitTimeDays,
        quoteValidityAt: parseDate(data.quoteValidityAt, "Quote validity"),
      },
    });

    await tx.activityLog.create({
      data: {
        rfqId,
        type: "BID_SUBMITTED",
        message: `${data.carrierName} submitted a bid of ${totalAmount}.`,
        metadata: { bidId: bid.id, totalAmount },
      },
    });

    const nextRanks = getCarrierRanks([...rfq.bids, bid]);
    const extensionDecision = shouldExtendAuction({
      rfq,
      previousRanks,
      nextRanks,
      submittedAt,
    });
    let updatedRfq = rfq;
    let extension = null;

    if (extensionDecision.shouldExtend) {
      const requestedClose = new Date(
        rfq.currentBidCloseAt.getTime() + rfq.extensionDurationMinutes * 60_000,
      );
      const newClose =
        requestedClose > rfq.forcedBidCloseAt
          ? rfq.forcedBidCloseAt
          : requestedClose;

      if (newClose > rfq.currentBidCloseAt) {
        updatedRfq = await tx.rfq.update({
          where: { id: rfqId },
          data: { currentBidCloseAt: newClose },
        });

        extension = {
          previousClose: rfq.currentBidCloseAt,
          newClose,
          reason: extensionDecision.reason,
        };

        await tx.activityLog.create({
          data: {
            rfqId,
            type: "TIME_EXTENDED",
            message: `Auction extended until ${newClose.toISOString()}.`,
            metadata: {
              reason: extensionDecision.reason,
              previousClose: rfq.currentBidCloseAt,
              newClose,
            },
          },
        });
      } else {
        await tx.activityLog.create({
          data: {
            rfqId,
            type: "TIME_EXTENSION_SKIPPED",
            message: "Auction extension blocked by forced close cap.",
            metadata: {
              reason: "Forced bid close cap reached.",
              previousClose: rfq.currentBidCloseAt,
              attemptedClose: requestedClose,
              forcedClose: rfq.forcedBidCloseAt,
            },
          },
        });
      }
    }

    return { bid, rfq: updatedRfq, extension };
  });
}
