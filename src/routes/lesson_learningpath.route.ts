// src/routes/lesson_learningpath.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { checkUnlock } from "../middlewares/checkUnlock.middleware";
import {
  getLessonForUserController,
  completeLessonController,
} from "../controllers/lesson_learningpath.controller";

const router = Router();

/**
 * @swagger
 * /lessons-learningpath/{id}:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy lesson trong lộ trình học
 *     description: |
 *       Lấy nội dung lesson sau khi đã unlock.
 *       - Kiểm tra unlock qua middleware checkUnlock
 *       - Trả về nội dung lesson (video, text, exercises)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lesson
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: ID của DayStudy cụ thể (optional, giúp xác định chính xác ngày học cần check unlock)
 *     responses:
 *       200:
 *         description: Lấy lesson thành công
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
 *                   properties:
 *                     _id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     video_url:
 *                       type: string
 *                     duration:
 *                       type: number
 *       403:
 *         description: Lesson chưa được unlock
 *       404:
 *         description: Lesson không tồn tại
 */
router.get("/:id", verifyAccessToken, checkUnlock, getLessonForUserController);

/**
 * @swagger
 * /lessons-learningpath/{id}/complete:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Hoàn thành lesson trong lộ trình
 *     description: |
 *       Đánh dấu user đã xem xong lesson.
 *       - Không có điểm số (lesson không có score)
 *       - Tự động unlock luôn (không cần >= 80%)
 *       - Cập nhật streak khi học
 *       - Track thời gian xem
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lesson
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               time_spent:
 *                 type: number
 *                 description: Thời gian xem (giây)
 *                 example: 300
 *               day_study_id:
 *                 type: string
 *                 description: ID của DayStudy cụ thể (optional, để đảm bảo unlock đúng ngày học)
 *                 example: "6741234567890abcdef12345"
 *     responses:
 *       200:
 *         description: Complete lesson thành công
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
 *                   example: "Lesson completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     attempt_id:
 *                       type: string
 *                       example: "6741234567890abcdef50001"
 *                       description: ID của record (dùng để gọi complete-activity)
 *                     time_spent:
 *                       type: number
 *                     completed_at:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Lesson không tồn tại
 */
router.post("/:id/complete", verifyAccessToken, completeLessonController);

export default router;
