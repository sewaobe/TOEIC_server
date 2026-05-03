import { Router } from "express";
import {
    getMemoryStatusSummaryController,
    getReviewScheduleController,
    getSuggestedVocabularyController,
    getTodayReviewSummaryController,
} from "../controllers/user_vocabulary_progress_v2.controller";

const router = Router();

router.get("/today-review", getTodayReviewSummaryController);
router.get("/review-schedule", getReviewScheduleController);
router.get("/memory-status", getMemoryStatusSummaryController);
router.get("/suggestions", getSuggestedVocabularyController);

export default router;
