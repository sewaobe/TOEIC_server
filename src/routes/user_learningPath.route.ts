import { Router } from "express";
import { getUserLearningPath, createLearningPath } from "../controllers/user_learningPath.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", verifyAccessToken, getUserLearningPath);
router.post("/", verifyAccessToken, createLearningPath);

export default router;
