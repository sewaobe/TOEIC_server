// src/routes/day_study.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import {
  getDayStudyByIdController,
  completeActivityController,
} from "../controllers/day_study.controller";
import {
  createFeedbackController,
  getFeedbackForDayController,
  deleteFeedbackController,
} from "../controllers/lesson_feedback.controller";

const router = Router();

/**
 * @swagger
 * /day-study/{id}:
 *   get:
 *     tags:
 *       - Day Study
 *     summary: Lấy chi tiết ngày học
 *     description: |
 *       Lấy thông tin chi tiết về ngày học.
 *       - Danh sách sessions và items
 *       - Trạng thái unlock của từng item
 *       - Progress của ngày
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của day study
 *     responses:
 *       200:
 *         description: Lấy day study thành công
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
 *                     day_no:
 *                       type: number
 *                     status:
 *                       type: string
 *                       enum: [LOCK, IN_PROGRESS, COMPLETED]
 *                     sessions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           session_no:
 *                             type: number
 *                           status:
 *                             type: string
 *                           items:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 activity_id:
 *                                   type: string
 *                                 type:
 *                                   type: string
 *                                 status:
 *                                   type: string
 *       404:
 *         description: Day study không tồn tại
 */
router.get("/:id", verifyAccessToken, getDayStudyByIdController);

/**
 * @swagger
 * /day-study/{dayId}/complete-activity:
 *   post:
 *     tags:
 *       - Day Study
 *     summary: Complete activity và tự động unlock tiếp theo
 *     description: |
 *       API CORE cho unlock system.
 *       - Kiểm tra điểm số (>= 80% cho quiz/dictation/flashcard, >= 70% cho test/shadowing, luôn pass cho lesson)
 *       - Nếu pass: unlock cascade (item → session → day → week)
 *       - Nếu fail: cho phép retry
 *       - Tự động cập nhật streak khi complete
 *       - Log UserActivity khi complete day/week
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dayId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của day study
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - activity_id
 *               - activity_type
 *               - attempt_id
 *             properties:
 *               activity_id:
 *                 type: string
 *                 description: ID của activity (quiz_id, lesson_id, dictation_plan_id, flashcard_plan_id, test_id)
 *                 example: "6741234567890abcdef12345"
 *               activity_type:
 *                 type: string
 *                 enum: [LESSON, QUIZ, DICTATION, FLASH_CARD, SHADOWING, MINI_TEST]
 *                 description: Loại activity
 *                 example: "QUIZ"
 *               attempt_id:
 *                 type: string
 *                 description: ID của attempt record (QuizAttempt, DictationAttempt, etc.)
 *                 example: "6741234567890abcdef67890"
 *     responses:
 *       200:
 *         description: Complete thành công và unlock tiếp theo
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
 *                   example: "Activity completed! Next item unlocked."
 *                 data:
 *                   type: object
 *                   properties:
 *                     item_completed:
 *                       type: boolean
 *                       example: true
 *                     session_completed:
 *                       type: boolean
 *                       example: false
 *                     day_completed:
 *                       type: boolean
 *                       example: false
 *                     week_completed:
 *                       type: boolean
 *                       example: false
 *                     next_unlocked:
 *                       type: object
 *                       properties:
 *                         type:
 *                           type: string
 *                           example: "ITEM"
 *                         activity_id:
 *                           type: string
 *                         activity_type:
 *                           type: string
 *       400:
 *         description: |
 *           - Điểm không đủ để unlock (< 80%)
 *           - Activity đã complete rồi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Score too low. You need >= 80% to unlock."
 *                 data:
 *                   type: object
 *                   properties:
 *                     can_retry:
 *                       type: boolean
 *                       example: true
 *                     current_score:
 *                       type: number
 *                       example: 65
 *                     required_score:
 *                       type: number
 *                       example: 80
 *       404:
 *         description: Day study hoặc activity không tồn tại
 */
router.post(
  "/:dayId/complete-activity",
  verifyAccessToken,
  completeActivityController
);

/**
 * @swagger
 * /day-study/{dayId}/feedback:
 *   post:
 *     tags:
 *       - Day Study
 *     summary: Gửi feedback cho buổi học
 *     description: |
 *       Cho phép user gửi đánh giá về buổi học.
 *       - Rating từ 1-5 sao
 *       - Lý do đánh giá (tùy chọn)
 *       - Comment chi tiết (tùy chọn)
 *       - Nếu đã có feedback cho ngày này sẽ tự động cập nhật
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dayId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của day study
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Điểm đánh giá từ 1-5
 *                 example: 4
 *               reasons:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách lý do đánh giá
 *                 example: ["Nội dung thực tế", "Giải thích chi tiết"]
 *               comment:
 *                 type: string
 *                 maxLength: 500
 *                 description: Nhận xét chi tiết
 *                 example: "Bài học rất hữu ích, giải thích dễ hiểu"
 *     responses:
 *       201:
 *         description: Gửi feedback thành công
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
 *                   example: "Gửi đánh giá thành công!"
 *                 data:
 *                   type: object
 *                   properties:
 *                     day_study_id:
 *                       type: string
 *                     rating:
 *                       type: number
 *                     reasons:
 *                       type: array
 *                       items:
 *                         type: string
 *                     comment:
 *                       type: string
 *                     is_positive:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy ngày học hoặc lộ trình
 */
router.post("/:dayId/feedback", verifyAccessToken, createFeedbackController);

/**
 * @swagger
 * /day-study/{dayId}/feedback:
 *   get:
 *     tags:
 *       - Day Study
 *     summary: Lấy feedback của user cho ngày học
 *     description: Lấy feedback mà user đã gửi cho ngày học cụ thể
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dayId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của day study
 *     responses:
 *       200:
 *         description: Lấy feedback thành công
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
 *                   nullable: true
 *                   properties:
 *                     day_study_id:
 *                       type: string
 *                     rating:
 *                       type: number
 *                     reasons:
 *                       type: array
 *                       items:
 *                         type: string
 *                     comment:
 *                       type: string
 *                     is_positive:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 */
router.get("/:dayId/feedback", verifyAccessToken, getFeedbackForDayController);

/**
 * @swagger
 * /day-study/{dayId}/feedback:
 *   delete:
 *     tags:
 *       - Day Study
 *     summary: Xóa feedback của user cho ngày học
 *     description: Xóa feedback mà user đã gửi cho ngày học cụ thể
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dayId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của day study
 *     responses:
 *       200:
 *         description: Xóa feedback thành công
 *       404:
 *         description: Không tìm thấy feedback
 */
router.delete("/:dayId/feedback", verifyAccessToken, deleteFeedbackController);

export default router;
