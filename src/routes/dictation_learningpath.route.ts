// src/routes/dictation_learningpath.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { checkUnlock } from "../middlewares/checkUnlock.middleware";
import {
  getDictationForLearningPathController,
  submitDictationController,
} from "../controllers/dictation_learningpath.controller";

const router = Router();

/**
 * @swagger
 * /dictation-learningpath/{id}:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy dictation trong lộ trình học
 *     description: |
 *       Lấy nội dung dictation trong lộ trình học (trả về full document giống chế độ tự luyện).
 *       - Kiểm tra unlock qua middleware checkUnlock
 *       - Trả về toàn bộ thông tin dictation (audio, transcript, timings, metadata)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dictation plan
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: ID của DayStudy cụ thể (optional, giúp xác định chính xác ngày học cần check unlock)
 *     responses:
 *       200:
 *         description: Lấy dictation thành công (full document)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Full Dictation document
 *                   properties:
 *                     _id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     audio_url:
 *                       type: string
 *                     transcript:
 *                       type: string
 *                     duration:
 *                       type: number
 *                     timings:
 *                       type: array
 *                       items:
 *                         type: object
 *                     display_mode:
 *                       type: string
 *                     part_type:
 *                       type: number
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                     level:
 *                       type: string
 *       403:
 *         description: Dictation chưa được unlock
 *       404:
 *         description: Dictation không tồn tại
 */
router.get(
  "/:id",
  verifyAccessToken,
  checkUnlock,
  getDictationForLearningPathController
);

/**
 * @swagger
 * /dictation-learningpath/{id}/submit:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Submit dictation trong lộ trình
 *     description: |
 *       Submit dictation trong lộ trình học (giống chế độ tự luyện + auto unlock).
 *       - Client gửi dữ liệu đã tính toán accuracy
 *       - Server lưu DictationAttempt
 *       - Cập nhật streak
 *       - Tự động unlock bài tiếp theo nếu đạt yêu cầu
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dictation plan
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: array
 *                 description: Mảng attempts đã được client tính toán
 *                 items:
 *                   type: object
 *                   required:
 *                     - accuracy
 *                     - duration
 *                     - answers
 *                   properties:
 *                     index:
 *                       type: number
 *                       example: 1
 *                     accuracy:
 *                       type: number
 *                       example: 85
 *                       description: "% chính xác (client đã tính)"
 *                     duration:
 *                       type: number
 *                       example: 120
 *                       description: "Thời gian làm bài (giây)"
 *                     answers:
 *                       type: array
 *                       description: "Mảng câu trả lời chi tiết"
 *                       items:
 *                         type: object
 *                     mistakes:
 *                       type: array
 *                       description: "Mảng lỗi sai (optional)"
 *                       items:
 *                         type: object
 *                     started_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-11-19T08:00:00.000Z"
 *                     finished_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-11-19T08:02:00.000Z"
 *                 example:
 *                   - index: 1
 *                     accuracy: 85
 *                     duration: 120
 *                     answers: []
 *                     mistakes: []
 *                     started_at: "2025-11-19T08:00:00.000Z"
 *                     finished_at: "2025-11-19T08:02:00.000Z"
 *               day_study_id:
 *                 type: string
 *                 description: ID của DayStudy cụ thể (optional, để đảm bảo unlock đúng ngày học)
 *                 example: "6741234567890abcdef12345"
 *     responses:
 *       200:
 *         description: Submit thành công và unlock bài tiếp theo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Unlock session tiếp theo thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     attempts:
 *                       type: array
 *                       description: Mảng DictationAttempt đã lưu
 *                       items:
 *                         type: object
 *                     accuracy:
 *                       type: number
 *                       example: 85
 *                     passed:
 *                       type: boolean
 *                       example: true
 *                     next_unlocked:
 *                       type: string
 *                       example: "item"
 *                       description: "item / session / day / week"
 *       404:
 *         description: Dictation plan không tồn tại
 */
router.post("/:id/submit", verifyAccessToken, submitDictationController);

export default router;
