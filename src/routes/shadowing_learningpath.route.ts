// src/routes/shadowing_learningpath.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { checkUnlock } from "../middlewares/checkUnlock.middleware";
import {
  getShadowingPlanController,
  submitShadowingController,
} from "../controllers/shadowing_learningpath.controller";

const router = Router();

/**
 * @swagger
 * /shadowing-learningpath/{id}:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy shadowing trong lộ trình học
 *     description: |
 *       Lấy nội dung shadowing để luyện phát âm trong learning path.
 *       - **Lưu ý:** param `id` là shadowing_plan_id (lấy từ DayStudy)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của shadowing plan
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: ID của DayStudy cụ thể (optional, giúp xác định chính xác ngày học cần check unlock)
 *     responses:
 *       200:
 *         description: Lấy shadowing thành công
 *       403:
 *         description: Shadowing chưa unlock
 *       404:
 *         description: Không tìm thấy shadowing plan
 */
router.get("/:id", verifyAccessToken, checkUnlock, getShadowingPlanController);

/**
 * @swagger
 * /shadowing-learningpath/{id}/submit:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Hoàn thành shadowing trong lộ trình
 *     description: |
 *       Submit kết quả shadowing trong lộ trình học (giống chế độ tự luyện + auto unlock).
 *       - Client gửi dữ liệu đã tính toán accuracy và recorded_audio
 *       - Server lưu ShadowingAttempt
 *       - Cập nhật streak
 *       - Tự động unlock bài tiếp theo nếu đạt yêu cầu (accuracy >= 70%)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của shadowing plan
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
 *                     - recorded_audio
 *                   properties:
 *                     accuracy:
 *                       type: number
 *                       example: 85
 *                       description: "% chính xác (client đã tính)"
 *                     duration:
 *                       type: number
 *                       example: 120
 *                       description: "Thời gian làm bài (giây)"
 *                     recorded_audio:
 *                       type: string
 *                       example: "https://storage.example.com/audio.mp3"
 *                       description: "URL audio đã ghi âm (required)"
 *                     started_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-11-19T08:00:00.000Z"
 *                     finished_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-11-19T08:02:00.000Z"
 *                 example:
 *                   - accuracy: 85
 *                     duration: 120
 *                     recorded_audio: "https://storage.example.com/audio.mp3"
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
 *                       description: Mảng ShadowingAttempt đã lưu
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
 *         description: Shadowing plan không tồn tại
 */
router.post("/:id/submit", verifyAccessToken, submitShadowingController);

export default router;
