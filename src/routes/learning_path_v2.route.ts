import { Router } from "express";
import {
  getCurrentLearningPathCycleV2Controller,
  getLearningPathV2GenerationContextController,
  getLearningPathV2OverviewController,
  getLearningPathV2SkillMapController,
  initialGenerateLearningPathV2Controller,
  upsertLearningPathV2SetupController,
} from "../controllers/learning_path_v2.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.put("/setup", verifyAccessToken, upsertLearningPathV2SetupController);
router.get(
  "/generation-context",
  verifyAccessToken,
  getLearningPathV2GenerationContextController
);
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
router.get(
  "/:learningPathId/skill-map",
  verifyAccessToken,
  getLearningPathV2SkillMapController
);

export default router;
