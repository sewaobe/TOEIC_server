import { Router } from "express";
import {
  getCurrentLearningPathCycleV2Controller,
  getLearningPathV2GenerationContextController,
  getLearningPathV2OverviewController,
  getLearningPathV2SkillMapController,
  getLearningPathV2StrategyOptionPreviewController,
  getLearningPathV2StrategyController,
  initialGenerateLearningPathV2Controller,
  mockLearningPathV2CurrentWeekController,
  selectLearningPathV2StrategyOptionController,
  submitLearningPathV2AssessmentController,
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
router.post(
  "/:learningPathId/assessments/submit",
  verifyAccessToken,
  submitLearningPathV2AssessmentController
);
router.post(
  "/:learningPathId/mock-learning",
  verifyAccessToken,
  mockLearningPathV2CurrentWeekController
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

router.get(
  "/:learningPathId/strategy-options/:optionId/preview",
  verifyAccessToken,
  getLearningPathV2StrategyOptionPreviewController
);

router.post(
  "/:learningPathId/strategy-options/:optionId/select",
  verifyAccessToken,
  selectLearningPathV2StrategyOptionController
);

export default router;
