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
 *     summary: Get quiz in learning path
 *     description: |
 *       Fetch quiz questions (no answers). Metadata id comes from DayStudy item.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz metadata id (`quiz._id`)
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional DayStudy id for unlock context
 *     responses:
 *       200:
 *         description: Get quiz successfully
 *       403:
 *         description: Not unlocked
 *       404:
 *         description: Quiz not found
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
 *     summary: Submit quiz (learning path)
 *     description: |
 *       Submit quiz answers from learning path.
 *       - Submit = Done (không check điểm threshold)
 *       - Auto unlock bài tiếp theo
 *       - Tạo attempt với submit_type = LEARNING_PATH
 *       - Upsert plan theo submit_type
 *       - Update streak & user_progress
 *       - Store QuizAttempt with `submit_type=learning_path`
 *       - Upsert QuizPlan (latest_attempt, total_attempts, accuracy_overall)
 *       - Update streak (user_progress)
 *       - Auto unlock next item/session/day/week
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quiz metadata id (`quiz._id`)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *               - day_study_id
 *             properties:
 *               answers:
 *                 type: array
 *                 description: User answers
 *                 items:
 *                   type: object
 *                   properties:
 *                     question_id:
 *                       type: string
 *                     user_answer:
 *                       type: string
 *               time_spent:
 *                 type: number
 *                 description: Time spent (seconds)
 *               day_study_id:
 *                 type: string
 *                 description: DayStudy id (required)
 *     responses:
 *       201:
 *         description: Submit success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     attempt_id:
 *                       type: string
 *                     score:
 *                       type: number
 *                     correct_count:
 *                       type: number
 *                     total_questions:
 *                       type: number
 *                     passed:
 *                       type: boolean
 *                     duration:
 *                       type: number
 *                     plan_summary:
 *                       type: object
 *                       properties:
 *                         total_attempts:
 *                           type: number
 *                         accuracy_overall:
 *                           type: number
 *                     next_unlocked:
 *                       type: object
 *                       nullable: true
 *       404:
 *         description: Quiz not found
 */
router.post("/:id/submit", verifyAccessToken, submitQuizController);

export default router;
