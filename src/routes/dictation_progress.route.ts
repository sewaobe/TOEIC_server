import Router from "express";
import {
  cancelDictationProgressController,
  completeDictationProgressController,
  getActiveDictationProgressController,
  startDictationProgressController,
  updateDictationProgressController,
} from "../controllers/dictation_progress.controller";

const router = Router();

router.get("/:dictationId/active", getActiveDictationProgressController);
router.post("/:dictationId/start", startDictationProgressController);
router.patch("/:progressId", updateDictationProgressController);
router.post("/:progressId/complete", completeDictationProgressController);
router.post("/:progressId/cancel", cancelDictationProgressController);

export default router;
