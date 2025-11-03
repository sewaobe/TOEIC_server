import { Router } from "express";
import { 
  getUserLearningPath, 
  createLearningPath,
  getLearningProgress,
  getWeekDetail,
  getDayDetail,
  getWeekStats,
  getCumulativeStats
} from "../controllers/user_learningPath.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", verifyAccessToken, getUserLearningPath);
router.post("/", verifyAccessToken, createLearningPath);
router.get("/progress", verifyAccessToken, getLearningProgress);
router.get("/week/:weekId", verifyAccessToken, getWeekDetail);
router.get("/day/:dayId", verifyAccessToken, getDayDetail);
router.get("/week/:weekId/stats", verifyAccessToken, getWeekStats);
router.get("/cumulative-stats", verifyAccessToken, getCumulativeStats);

export default router;
