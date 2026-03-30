import { Router } from "express";
import {
  getReviewQueueController,
  submitSessionController,
  getStatsController,
  getProgressLibraryController,
} from "../controllers/hlr.controller";

/**
 * HLR Routes - Spaced Repetition cho Vocabulary
 *
 * Module này HOÀN TOÀN ĐỘC LẬP với hệ thống IRT hiện có.
 * Các routes mới, không đè lên routes cũ.
 *
 * Routes:
 * - GET  /api/hlr/review-queue  - Lấy danh sách từ cần ôn tập
 * - POST /api/hlr/submit-session - Submit kết quả ôn tập
 * - GET  /api/hlr/stats          - Lấy thống kê HLR của user
 */

const router = Router();

// GET /api/hlr/review-queue
// Query params: ?limit=20&includeDetails=true
router.get("/review-queue", getReviewQueueController);

// POST /api/hlr/submit-session
// Body: { items: [{ vocabulary_id: string, is_correct: boolean }] }
router.post("/submit-session", submitSessionController);

// GET /api/hlr/stats
router.get("/stats", getStatsController);

// GET /api/hlr/progress-library
// Query params: ?page=1&limit=50&search=...&sortBy=next_review&sortOrder=asc
router.get("/progress-library", getProgressLibraryController);

export default router;
