// src/routes/flashcard_learningpath.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { checkUnlock } from "../middlewares/checkUnlock.middleware";
import {
  getFlashCardPlanController,
  submitFlashCardController,
} from "../controllers/flashcard_learningpath.controller";

const router = Router();

/**
 * @swagger
 * /flashcards-learningpath/{id}:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy flashcard trong lộ trình học
 *     description: |
 *       Lấy topic vocabulary để học flashcard trong learning path.
 *       - **Lưu ý:** param `id` là flashcard_plan_id (lấy từ DayStudy)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của flashcard plan
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: ID của DayStudy cụ thể (optional, giúp xác định chính xác ngày học cần check unlock)
 *     responses:
 *       200:
 *         description: Lấy flashcard thành công
 *       403:
 *         description: Flashcard chưa unlock
 *       404:
 *         description: Không tìm thấy flashcard plan
 */
router.get("/:id", verifyAccessToken, checkUnlock, getFlashCardPlanController);

/**
 * @swagger
 * /flashcards-learningpath/{id}/submit:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Hoàn thành flashcard trong lộ trình
 *     description: |
 *       Submit kết quả học flashcard.
 *       - Lưu FlashCardAttempt
 *       - Cập nhật streak
 *       - Tự động unlock bài tiếp theo
 *       - **Lưu ý:** param `id` là flashcard_plan_id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của flashcard plan
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               learned_words:
 *                 type: array
 *                 description: Danh sách ID từ vựng đã học
 *                 items:
 *                   type: string
 *               time_spent:
 *                 type: number
 *                 description: Thời gian học (giây)
 *                 example: 300
 *               day_study_id:
 *                 type: string
 *                 description: ID của DayStudy cụ thể (optional, để đảm bảo unlock đúng ngày học)
 *                 example: "6741234567890abcdef12345"
 *     responses:
 *       201:
 *         description: Hoàn thành flashcard thành công
 *       404:
 *         description: Không tìm thấy flashcard plan
 */
router.post("/:id/submit", verifyAccessToken, submitFlashCardController);

export default router;
