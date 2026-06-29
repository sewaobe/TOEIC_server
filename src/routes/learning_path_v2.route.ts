import { Router } from "express";
import {
  getCurrentLearningPathCycleV2Controller,
  getLearningPathV2GenerationContextController,
  getLearningPathV2CurrentCycleExplanationController,
  getLearningPathV2NodeDetailController,
  getLearningPathV2OverviewController,
  getLearningPathV2SkillMapController,
  initialGenerateLearningPathV2Controller,
  mockLearningPathV2CurrentWeekController,
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
router.get(
  "/:learningPathId/current-cycle/explanation",
  verifyAccessToken,
  getLearningPathV2CurrentCycleExplanationController
);
router.get("/:learningPathId/overview", verifyAccessToken, getLearningPathV2OverviewController);
router.get(
  "/:learningPathId/nodes/:lessonManagerId/detail",
  verifyAccessToken,
  getLearningPathV2NodeDetailController
);
router.get(
  "/:learningPathId/skill-map",
  verifyAccessToken,
  getLearningPathV2SkillMapController
);

export default router;
