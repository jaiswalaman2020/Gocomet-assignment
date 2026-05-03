import { Router } from "express";
import { z } from "zod";
import {
  createAuction,
  getAuctionDetails,
  listAuctions,
  submitBid
} from "../services/auctionService.js";

const router = Router();

const auctionSchema = z.object({
  name: z.string().trim().min(2),
  referenceId: z.string().trim().min(2),
  bidStartAt: z.string().datetime(),
  initialBidCloseAt: z.string().datetime(),
  forcedBidCloseAt: z.string().datetime(),
  pickupServiceAt: z.string().datetime(),
  triggerWindowMinutes: z.coerce.number().int().positive(),
  extensionDurationMinutes: z.coerce.number().int().positive(),
  extensionTrigger: z.enum(["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_RANK_CHANGE"])
});

const bidSchema = z.object({
  carrierName: z.string().trim().min(2),
  freightCharges: z.coerce.number().nonnegative(),
  originCharges: z.coerce.number().nonnegative(),
  destinationCharges: z.coerce.number().nonnegative(),
  transitTimeDays: z.coerce.number().int().positive(),
  quoteValidityAt: z.string().datetime()
});

function emitAuctionUpdate(req, rfqId) {
  req.app.get("io").to(`auction:${rfqId}`).emit("auction:updated", { rfqId });
  req.app.get("io").emit("auction:list-updated");
}

router.get("/", async (_req, res, next) => {
  try {
    res.json(await listAuctions());
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = auctionSchema.parse(req.body);
    const auction = await createAuction(payload);
    req.app.get("io").emit("auction:list-updated");
    res.status(201).json(auction);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const auction = await getAuctionDetails(req.params.id);
    if (!auction) return res.status(404).json({ message: "RFQ not found." });
    res.json(auction);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/bids", async (req, res, next) => {
  try {
    const payload = bidSchema.parse(req.body);
    const result = await submitBid(req.params.id, payload);
    emitAuctionUpdate(req, req.params.id);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
