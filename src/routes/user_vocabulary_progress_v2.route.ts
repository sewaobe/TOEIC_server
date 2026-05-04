import { Router } from "express";
import {
    getMemoryStatusSummaryController,
    getReviewScheduleController,
    getSuggestionFilterOptionsController,
    getSuggestionDetailController,
    getSuggestedVocabularyController,
    getTodayReviewSummaryController,
} from "../controllers/user_vocabulary_progress_v2.controller";

const router = Router();

router.get("/today-review", getTodayReviewSummaryController);
router.get("/review-schedule", getReviewScheduleController);
router.get("/memory-status", getMemoryStatusSummaryController);
router.get("/suggestions", getSuggestedVocabularyController);
router.get("/suggestions/filter-options", getSuggestionFilterOptionsController);
router.get("/suggestions/:vocabulary_id", getSuggestionDetailController);

export default router;
