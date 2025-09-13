import { Router } from "express";
import { getUserLearningPath } from "../controllers/user_learningPath.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", verifyAccessToken, getUserLearningPath);

export default router;
