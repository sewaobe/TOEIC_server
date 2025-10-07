import { Router } from "express";
import { getNotifications, markAsRead } from "../controllers/notification.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", verifyAccessToken, getNotifications);
router.put("/:id/read", verifyAccessToken, markAsRead);

export default router;
