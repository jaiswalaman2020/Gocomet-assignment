import assert from "node:assert/strict";
import test from "node:test";
import { getAuctionStatus, getCarrierRanks, shouldExtendAuction } from "../src/services/auctionService.js";

function rfq(overrides = {}) {
  return {
    bidStartAt: new Date("2026-05-04T10:00:00.000Z"),
    currentBidCloseAt: new Date("2026-05-04T11:00:00.000Z"),
    forcedBidCloseAt: new Date("2026-05-04T11:30:00.000Z"),
    triggerWindowMinutes: 10,
    extensionDurationMinutes: 5,
    extensionTrigger: "BID_RECEIVED",
    ...overrides
  };
}

test("auction status is derived from current and forced close times", () => {
  assert.equal(getAuctionStatus(rfq(), new Date("2026-05-04T09:59:00.000Z")), "SCHEDULED");
  assert.equal(getAuctionStatus(rfq(), new Date("2026-05-04T10:30:00.000Z")), "ACTIVE");
  assert.equal(getAuctionStatus(rfq(), new Date("2026-05-04T11:05:00.000Z")), "CLOSED");
  assert.equal(getAuctionStatus(rfq(), new Date("2026-05-04T11:31:00.000Z")), "FORCE_CLOSED");
});

test("carrier ranks use each carrier's best bid", () => {
  const bids = [
    { carrierName: "Carrier A", totalAmount: "120.00", createdAt: new Date("2026-05-04T10:10:00.000Z") },
    { carrierName: "Carrier B", totalAmount: "110.00", createdAt: new Date("2026-05-04T10:11:00.000Z") },
    { carrierName: "Carrier A", totalAmount: "105.00", createdAt: new Date("2026-05-04T10:12:00.000Z") }
  ];

  assert.deepEqual(getCarrierRanks(bids), ["Carrier A", "Carrier B"]);
});

test("bid received trigger extends only inside the trigger window", () => {
  const auction = rfq({ extensionTrigger: "BID_RECEIVED" });

  assert.equal(
    shouldExtendAuction({
      rfq: auction,
      previousRanks: ["Carrier A"],
      nextRanks: ["Carrier A"],
      submittedAt: new Date("2026-05-04T10:49:00.000Z")
    }).shouldExtend,
    false
  );

  assert.equal(
    shouldExtendAuction({
      rfq: auction,
      previousRanks: ["Carrier A"],
      nextRanks: ["Carrier A"],
      submittedAt: new Date("2026-05-04T10:55:00.000Z")
    }).shouldExtend,
    true
  );
});

test("rank-change triggers extend only for configured rank movement", () => {
  assert.equal(
    shouldExtendAuction({
      rfq: rfq({ extensionTrigger: "ANY_RANK_CHANGE" }),
      previousRanks: ["Carrier A", "Carrier B"],
      nextRanks: ["Carrier B", "Carrier A"],
      submittedAt: new Date("2026-05-04T10:55:00.000Z")
    }).reason,
    "Supplier ranking changed in trigger window."
  );

  assert.equal(
    shouldExtendAuction({
      rfq: rfq({ extensionTrigger: "L1_RANK_CHANGE" }),
      previousRanks: ["Carrier A", "Carrier B"],
      nextRanks: ["Carrier A", "Carrier C", "Carrier B"],
      submittedAt: new Date("2026-05-04T10:55:00.000Z")
    }).shouldExtend,
    false
  );

  assert.equal(
    shouldExtendAuction({
      rfq: rfq({ extensionTrigger: "L1_RANK_CHANGE" }),
      previousRanks: ["Carrier A", "Carrier B"],
      nextRanks: ["Carrier C", "Carrier A", "Carrier B"],
      submittedAt: new Date("2026-05-04T10:55:00.000Z")
    }).reason,
    "Lowest bidder changed in trigger window."
  );
});
