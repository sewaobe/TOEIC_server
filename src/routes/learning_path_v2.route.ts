import { Router } from "express";
import {
  getCurrentLearningPathCycleV2Controller,
  getLearningPathV2GenerationContextController,
  getLearningPathV2OverviewController,
  getLearningPathV2SkillMapController,
  getLearningPathV2StrategyController,
  initialGenerateLearningPathV2Controller,
  selectLearningPathV2StrategyOptionController,
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

router.get(
  "/:learningPathId/strategy",
  verifyAccessToken,
  getLearningPathV2StrategyController
);

router.post(
  "/:learningPathId/strategy-options/:optionId/select",
  verifyAccessToken,
  selectLearningPathV2StrategyOptionController
);

export default router;
