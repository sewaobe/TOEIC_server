import { Router } from "express";
import { getMySubscriptions, registerSubscription, unregisterSubscription } from "../controllers/subscription.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

// POST /api/subscriptions 
router.post("/", verifyAccessToken, registerSubscription);

// GET /api/subscriptions
router.get("/", verifyAccessToken, getMySubscriptions);

// DELETE /api/subscriptions?endpoint=...
router.delete("/", unregisterSubscription);

export default router;
