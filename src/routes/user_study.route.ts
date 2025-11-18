// src/routes/user_study.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import {
  getStreakController,
  getStudyHistoryController,
  getUserStatsController,
} from "../controllers/user_study.controller";

const router = Router();

/**
 * @swagger
 * /user/streak:
 *   get:
 *     tags:
 *       - User Study
 *     summary: Lấy thông tin streak của user
 *     description: |
 *       Lấy thông tin streak hiện tại.
 *       - Số ngày học liên tiếp (current_streak)
 *       - Kỷ lục streak (longest_streak)
 *       - Ngày học gần nhất (last_study_date)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy streak thành công
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
 *                     current_streak:
 *                       type: number
 *                       example: 7
 *                       description: Số ngày học liên tiếp hiện tại
 *                     longest_streak:
 *                       type: number
 *                       example: 15
 *                       description: Kỷ lục streak cao nhất
 *                     last_study_date:
 *                       type: string
 *                       format: date
 *                       example: "2025-11-18"
 *                       description: Ngày học gần nhất
 */
router.get("/streak", verifyAccessToken, getStreakController);

/**
 * @swagger
 * /user/study-history:
 *   get:
 *     tags:
 *       - User Study
 *     summary: Lấy lịch sử học tập của user
 *     description: |
 *       Lấy timeline các activity đã hoàn thành.
 *       - Merge từ tất cả Attempt models
 *       - Sắp xếp theo thời gian
 *       - Phân trang
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Số record mỗi trang
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [LESSON, QUIZ, DICTATION, FLASH_CARD, SHADOWING, MINI_TEST]
 *         description: Lọc theo loại activity
 *     responses:
 *       200:
 *         description: Lấy lịch sử thành công
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
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: "QUIZ"
 *                           title:
 *                             type: string
 *                             example: "Grammar Quiz 1"
 *                           score:
 *                             type: number
 *                             example: 85
 *                           time_spent:
 *                             type: number
 *                             example: 600
 *                           completed_at:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         current_page:
 *                           type: number
 *                         total_pages:
 *                           type: number
 *                         total_items:
 *                           type: number
 */
router.get("/study-history", verifyAccessToken, getStudyHistoryController);

/**
 * @swagger
 * /user/stats:
 *   get:
 *     tags:
 *       - User Study
 *     summary: Lấy thống kê tổng quan của user
 *     description: |
 *       Thống kê tổng thể về quá trình học.
 *       - Tổng thời gian học
 *       - Điểm trung bình
 *       - Số bài đã hoàn thành (phân theo loại)
 *       - Xu hướng tiến bộ
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy thống kê thành công
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
 *                     total_time_spent:
 *                       type: number
 *                       example: 18000
 *                       description: Tổng thời gian học (giây)
 *                     average_score:
 *                       type: number
 *                       example: 82.5
 *                       description: Điểm trung bình
 *                     completed_activities:
 *                       type: object
 *                       properties:
 *                         LESSON:
 *                           type: number
 *                           example: 15
 *                         QUIZ:
 *                           type: number
 *                           example: 12
 *                         DICTATION:
 *                           type: number
 *                           example: 8
 *                         FLASH_CARD:
 *                           type: number
 *                           example: 10
 *                         SHADOWING:
 *                           type: number
 *                           example: 5
 *                         MINI_TEST:
 *                           type: number
 *                           example: 3
 *                     streak_info:
 *                       type: object
 *                       properties:
 *                         current_streak:
 *                           type: number
 *                         longest_streak:
 *                           type: number
 */
router.get("/stats", verifyAccessToken, getUserStatsController);

export default router;
