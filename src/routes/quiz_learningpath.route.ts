// src/routes/quiz_learningpath.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { checkUnlock } from "../middlewares/checkUnlock.middleware";
import {
  getQuizByIdForUserController,
  submitQuizController,
} from "../controllers/quiz_learningpath.controller";

const router = Router();

/**
 * @swagger
 * /quiz-learningpath/{id}:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy quiz trong lộ trình học
 *     description: |
 *       Lấy câu hỏi quiz (không show đáp án đúng).
 *       - Kiểm tra unlock qua middleware checkUnlock
 *       - Chỉ trả về questions, không có correct_answer
 *       - **Lưu ý:** param `id` là quiz_plan_id (lấy từ DayStudy sessions.items.activity_id)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của quiz plan (không phải quiz_id)
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: ID của DayStudy cụ thể (optional, giúp xác định chính xác ngày học cần check unlock)
 *     responses:
 *       200:
 *         description: Lấy quiz thành công
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
 *                     questions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           question_text:
 *                             type: string
 *                           options:
 *                             type: array
 *                             items:
 *                               type: string
 *       403:
 *         description: Quiz chưa được unlock
 *       404:
 *         description: Quiz không tồn tại
 */
router.get(
  "/:id",
  verifyAccessToken,
  checkUnlock,
  getQuizByIdForUserController
);

/**
 * @swagger
 * /quiz-learningpath/{id}/submit:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Submit quiz trong lộ trình
 *     description: |
 *       Submit câu trả lời quiz.
 *       - Tính điểm (% đúng)
 *       - Cập nhật streak nếu score >= 80%
 *       - Lưu QuizAttempt
 *       - Tự động unlock bài tiếp theo nếu đạt điểu kiện
 *       - **Lưu ý:** param `id` là quiz_plan_id (lấy từ DayStudy sessions.items.activity_id)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của quiz plan (không phải quiz_id)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 description: Mảng câu trả lời
 *                 items:
 *                   type: object
 *                   properties:
 *                     question_id:
 *                       type: string
 *                     user_answer:
 *                       type: string
 *                 example:
 *                   - question_id: "q1"
 *                     user_answer: "A"
 *                   - question_id: "q2"
 *                     user_answer: "C"
 *               time_spent:
 *                 type: number
 *                 description: Thời gian làm bài (giây)
 *                 example: 600
 *               day_study_id:
 *                 type: string
 *                 description: ID của DayStudy cụ thể (optional, để đảm bảo unlock đúng ngày học)
 *                 example: "6741234567890abcdef12345"
 *     responses:
 *       200:
 *         description: Submit thành công
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
 *                   example: "Quiz submitted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     attempt_id:
 *                       type: string
 *                       example: "6741234567890abcdef30001"
 *                       description: ID của QuizAttempt (dùng để gọi complete-activity)
 *                     score:
 *                       type: number
 *                       example: 85
 *                     total_questions:
 *                       type: number
 *                       example: 20
 *                     correct_answers:
 *                       type: number
 *                       example: 17
 *                     passed:
 *                       type: boolean
 *                       example: true
 *       404:
 *         description: Quiz không tồn tại
 */
router.post("/:id/submit", verifyAccessToken, submitQuizController);

export default router;
