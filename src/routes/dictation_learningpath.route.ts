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
 *     summary: Get dictation in learning path
 *     description: |
 *       Fetch dictation content (metadata id from DayStudy item).
 *       - Unlock checked by middleware
 *       - Returns full dictation document (audio, transcript, timings, metadata)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dictation metadata id (`dictation._id`)
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional DayStudy id for unlock context
 *     responses:
 *       200:
 *         description: Get dictation successfully
 *       403:
 *         description: Not unlocked
 *       404:
 *         description: Dictation not found
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
 *     summary: Submit dictation (learning path)
 *     description: |
 *       Submit dictation result from learning path.
 *       - Submit = Done (không check điểm threshold)
 *       - Auto unlock bài tiếp theo
 *       - Tạo attempt với submit_type = LEARNING_PATH
 *       - Upsert plan theo submit_type
 *       - Update streak & user_progress
 *       - Store DictationAttempt with `submit_type=learning_path`
 *       - Upsert DictationPlan (latest_attempt, total_attempts, accuracy_overall)
 *       - Update streak (stored in user_progress)
 *       - Auto unlock next item/session/day/week
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dictation metadata id (`dictation._id`)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *               - day_study_id
 *             properties:
 *               data:
 *                 type: array
 *                 description: Array of attempts computed on client
 *                 items:
 *                   type: object
 *                   required:
 *                     - accuracy
 *                     - duration
 *                     - answers
 *                   properties:
 *                     index:
 *                       type: number
 *                     accuracy:
 *                       type: number
 *                       description: accuracy percent
 *                     duration:
 *                       type: number
 *                       description: duration in seconds
 *                     answers:
 *                       type: array
 *                       items:
 *                         type: object
 *                     mistakes:
 *                       type: array
 *                       items:
 *                         type: string
 *                     started_at:
 *                       type: string
 *                       format: date-time
 *                     finished_at:
 *                       type: string
 *                       format: date-time
 *               day_study_id:
 *                 type: string
 *                 description: DayStudy id (required)
 *     responses:
 *       200:
 *         description: Submit success + unlock
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
 *                     attempts:
 *                       type: array
 *                     accuracy:
 *                       type: number
 *                     passed:
 *                       type: boolean
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
 *         description: Dictation not found
 */
router.post("/:id/submit", verifyAccessToken, submitDictationController);

export default router;
