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
 *     summary: Get shadowing in learning path
 *     description: |
 *       Fetch shadowing content (metadata id from DayStudy item).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Shadowing metadata id (`shadowing._id`)
 *       - in: query
 *         name: day_study_id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional DayStudy id for unlock context
 *     responses:
 *       200:
 *         description: Get shadowing successfully
 *       403:
 *         description: Not unlocked
 *       404:
 *         description: Shadowing not found
 */
router.get("/:id", verifyAccessToken, checkUnlock, getShadowingPlanController);

/**
 * @swagger
 * /shadowing-learningpath/{id}/submit:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Submit shadowing (learning path)
 *     description: |
 *       Submit shadowing result from learning path.
 *       - Submit = Done (không check điểm threshold)
 *       - Auto unlock bài tiếp theo
 *       - Tạo attempt với submit_type = LEARNING_PATH
 *       - Upsert plan theo submit_type
 *       - Update streak & user_progress
 *       - Store ShadowingAttempt with `submit_type=learning_path`
 *       - Upsert ShadowingPlan (latest_attempt, total_attempts, accuracy_overall)
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
 *         description: Shadowing metadata id (`shadowing._id`)
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
 *                 description: Array of attempts (client computed accuracy)
 *                 items:
 *                   type: object
 *                   required:
 *                     - accuracy
 *                     - recorded_audio
 *                   properties:
 *                     accuracy:
 *                       type: number
 *                     duration:
 *                       type: number
 *                     recorded_audio:
 *                       type: string
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
 *         description: Shadowing not found
 */
router.post("/:id/submit", verifyAccessToken, submitShadowingController);

export default router;
