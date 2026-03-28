// src/routes/feedback.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import {
  getFeedbacksController,
  getFeedbackStatsController,
  getPopularReasonsController,
  getFeedbacksByUserIdController,
  getFeedbackStatsByUserIdController,
} from "../controllers/lesson_feedback.controller";

const router = Router();

/**
 * @swagger
 * /feedback/user/{userId}:
 *   get:
 *     tags:
 *       - Feedback
 *     summary: Lấy tất cả feedback của một user
 *     description: Cho phép collaborator/admin xem feedback của học viên
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       day_study_id:
 *                         type: string
 *                       rating:
 *                         type: number
 *                       reasons:
 *                         type: array
 *                         items:
 *                           type: string
 *                       comment:
 *                         type: string
 *                       is_positive:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                         format: date-time
 */
router.get("/user/:userId", verifyAccessToken, getFeedbacksByUserIdController);

/**
 * @swagger
 * /feedback/user/{userId}/stats:
 *   get:
 *     tags:
 *       - Feedback
 *     summary: Lấy thống kê feedback của một user
 *     description: Lấy thống kê tổng quan về feedback của học viên
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của user
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
 *                     totalFeedbacks:
 *                       type: number
 *                     averageRating:
 *                       type: number
 *                     positiveFeedbacks:
 *                       type: number
 *                     negativeFeedbacks:
 *                       type: number
 *                     ratingDistribution:
 *                       type: object
 */
router.get(
  "/user/:userId/stats",
  verifyAccessToken,
  getFeedbackStatsByUserIdController
);

/**
 * @swagger
 * /feedback/{learningPathId}:
 *   get:
 *     tags:
 *       - Feedback
 *     summary: Lấy danh sách feedback theo learning path
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: learningPathId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: rating
 *         schema:
 *           type: number
 *       - in: query
 *         name: isPositive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 */
router.get("/:learningPathId", verifyAccessToken, getFeedbacksController);

/**
 * @swagger
 * /feedback/stats/{learningPathId}:
 *   get:
 *     tags:
 *       - Feedback
 *     summary: Lấy thống kê feedback theo learning path
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: learningPathId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lấy thống kê thành công
 */
router.get(
  "/stats/:learningPathId",
  verifyAccessToken,
  getFeedbackStatsController
);

/**
 * @swagger
 * /feedback/reasons/{learningPathId}:
 *   get:
 *     tags:
 *       - Feedback
 *     summary: Lấy các lý do feedback phổ biến
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: learningPathId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: isPositive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lấy lý do phổ biến thành công
 */
router.get(
  "/reasons/:learningPathId",
  verifyAccessToken,
  getPopularReasonsController
);

export default router;
