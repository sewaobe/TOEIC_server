import { Router } from "express";
import { getNotifications, markAsRead, sendNotification } from "../controllers/notification.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", verifyAccessToken, getNotifications);
router.put("/:id/read", verifyAccessToken, markAsRead);
router.post("/send", verifyAccessToken, sendNotification);

export default router;
