import { Router } from "express";
import { getLessonHistory } from "../controllers/history.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/:type/:lessonId", verifyAccessToken, getLessonHistory);

export default router;
