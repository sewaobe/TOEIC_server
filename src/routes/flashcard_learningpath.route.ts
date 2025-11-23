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
 *     summary: Get flashcard topic in learning path
 *     description: |
 *       Fetch topic vocabulary for learning path (metadata id from DayStudy item).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: TopicVocabulary metadata id (`topicVocabulary._id`)
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional DayStudy id for unlock context
 *     responses:
 *       200:
 *         description: Get flashcard topic successfully
 *       403:
 *         description: Not unlocked
 *       404:
 *         description: Flashcard topic not found
 */
router.get("/:id", verifyAccessToken, checkUnlock, getFlashCardPlanController);

/**
 * @swagger
 * /flashcards-learningpath/{id}/submit:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Submit flashcard (learning path)
 *     description: |
 *       Submit flashcard result from learning path.
 *       - Submit = Done (không check điểm threshold)
 *       - Auto unlock bài tiếp theo
 *       - Tạo attempt với submit_type = LEARNING_PATH
 *       - Upsert plan theo submit_type
 *       - Update streak & user_progress
 *       - Store FlashCardAttempt with `submit_type=learning_path`
 *       - Upsert FlashCardPlan (latest_attempt, total_attempts, accuracy_overall)
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
 *         description: TopicVocabulary metadata id (`topicVocabulary._id`)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - day_study_id
 *             properties:
 *               accuracy:
 *                 type: number
 *                 description: Accuracy percent (optional, default 100)
 *                 example: 100
 *               learned_words:
 *                 type: array
 *                 items:
 *                   type: string
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
 *                     learned_count:
 *                       type: number
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
 *         description: Flashcard plan not found
 */
router.post("/:id/submit", verifyAccessToken, submitFlashCardController);

export default router;
