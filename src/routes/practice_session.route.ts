import Router from 'express';
import {
    startOrResumeSessionController,
    updateSessionProgressController,
    completeSessionController,
    getSessionByTopicController,
    getUserSessionsController,
    getSessionAttemptsController,
    saveAttemptController,
    cancelSessionController
} from '../controllers/practice_session.controller';

/**
 * @openapi
 * /practice-sessions/start:
 *   post:
 *     summary: Bắt đầu hoặc resume phiên luyện tập
 *     description: |
 *       Tạo session mới hoặc resume session đang in_progress.
 *       - Nếu đã có session in_progress cho topic này → Resume
 *       - Nếu không → Cancel các session in_progress khác → Tạo mới
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - practice_type
 *               - topic_id
 *               - total_items
 *             properties:
 *               practice_type:
 *                 type: string
 *                 enum: [definition_based, fill_blank, listening, reading, grammar]
 *                 example: definition_based
 *               topic_id:
 *                 type: string
 *                 example: "673a8f91c83a030cccfb1302"
 *               total_items:
 *                 type: integer
 *                 example: 20
 *     responses:
 *       200:
 *         description: Resume session thành công
 *       201:
 *         description: Tạo session mới thành công
 *       400:
 *         description: Thiếu thông tin bắt buộc
 *       401:
 *         description: Chưa đăng nhập
 */

/**
 * @openapi
 * /practice-sessions/{sessionId}/progress:
 *   patch:
 *     summary: Cập nhật tiến độ session
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               current_index:
 *                 type: integer
 *               completed_items:
 *                 type: integer
 *               correct_count:
 *                 type: integer
 *               total_accuracy:
 *                 type: number
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */

/**
 * @openapi
 * /practice-sessions/{sessionId}/complete:
 *   post:
 *     summary: Hoàn thành session và submit attempts
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - attempts
 *             properties:
 *               attempts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     vocabulary_id:
 *                       type: string
 *                     answer:
 *                       type: string
 *                     is_correct:
 *                       type: boolean
 *                     accuracy_score:
 *                       type: number
 *     responses:
 *       200:
 *         description: Hoàn thành thành công
 */

/**
 * @openapi
 * /practice-sessions/by-topic/{topicId}:
 *   get:
 *     summary: Lấy session in_progress theo topic
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: practice_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [definition_based, fill_blank, listening, reading, grammar]
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @openapi
 * /practice-sessions:
 *   get:
 *     summary: Lấy danh sách sessions của user
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: practice_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [in_progress, completed, cancelled]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @openapi
 * /practice-sessions/{sessionId}/attempts:
 *   get:
 *     summary: Lấy tất cả attempts của 1 session
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @openapi
 * /practice-sessions/{sessionId}/attempts:
 *   post:
 *     summary: Lưu attempt ngay khi submit (không đợi complete)
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vocabulary_id:
 *                 type: string
 *               answer:
 *                 type: string
 *               is_correct:
 *                 type: boolean
 *               accuracy_score:
 *                 type: number
 *     responses:
 *       201:
 *         description: Lưu attempt thành công
 */

/**
 * @openapi
 * /practice-sessions/{sessionId}/cancel:
 *   post:
 *     summary: Hủy session và xóa hết attempts
 *     tags:
 *       - Practice Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Hủy thành công
 */

const router = Router();

router.post("/start", startOrResumeSessionController);
router.patch("/:sessionId/progress", updateSessionProgressController);
router.post("/:sessionId/complete", completeSessionController);
router.get("/by-topic/:topicId", getSessionByTopicController);
router.get("/", getUserSessionsController);
router.get("/:sessionId/attempts", getSessionAttemptsController);
router.post("/:sessionId/attempts", saveAttemptController); // Lưu attempt ngay
router.post("/:sessionId/cancel", cancelSessionController);

export default router;
