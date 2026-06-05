import { Router } from "express";
import {
  getCurrentLearningPathCycleV2Controller,
  getLearningPathV2OverviewController,
  initialGenerateLearningPathV2Controller,
} from "../controllers/learning_path_v2.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.post(
  "/:learningPathId/initial-generation",
  verifyAccessToken,
  initialGenerateLearningPathV2Controller
);
router.get(
  "/:learningPathId/current-cycle",
  verifyAccessToken,
  getCurrentLearningPathCycleV2Controller
);
router.get("/:learningPathId/overview", verifyAccessToken, getLearningPathV2OverviewController);

export default router;
