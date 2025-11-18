// src/routes/dictation_user.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { checkUnlock } from "../middlewares/checkUnlock.middleware";
import { getDictationByIdController } from "../controllers/dictation.controller";
import { submitDictationController } from "../controllers/dictation_user.controller";

const router = Router();

/**
 * @swagger
 * /dictation-plan/{id}:
 *   get:
 *     tags:
 *       - Dictation User
 *     summary: Lấy chi tiết dictation plan cho user
 *     description: |
 *       Lấy nội dung dictation plan sau khi đã unlock.
 *       - Kiểm tra unlock qua middleware checkUnlock
 *       - Trả về audio URL và sentences cần nghe chép
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dictation plan
 *     responses:
 *       200:
 *         description: Lấy dictation plan thành công
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
 *                     audio_url:
 *                       type: string
 *                     sentences:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           order:
 *                             type: number
 *                           correct_text:
 *                             type: string
 *       403:
 *         description: Dictation chưa được unlock
 *       404:
 *         description: Dictation không tồn tại
 */
router.get("/:id", verifyAccessToken, checkUnlock, getDictationByIdController);

/**
 * @swagger
 * /dictation-plan/{id}/submit:
 *   post:
 *     tags:
 *       - Dictation User
 *     summary: Submit bài dictation
 *     description: |
 *       Submit câu trả lời dictation.
 *       - So sánh user_text với correct_text
 *       - Tính điểm accuracy (% từ đúng)
 *       - Cập nhật streak nếu score >= 80%
 *       - Lưu DictationAttempt
 *       - Không tự unlock (phải gọi complete-activity riêng)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dictation plan
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
 *                     sentence_id:
 *                       type: string
 *                     user_text:
 *                       type: string
 *                 example:
 *                   - sentence_id: "s1"
 *                     user_text: "The quick brown fox jumps over the lazy dog"
 *                   - sentence_id: "s2"
 *                     user_text: "She sells sea shells by the sea shore"
 *               time_spent:
 *                 type: number
 *                 description: Thời gian làm bài (giây)
 *                 example: 480
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
 *                   example: "Dictation submitted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     attempt_id:
 *                       type: string
 *                       example: "6741234567890abcdef40001"
 *                       description: ID của DictationAttempt (dùng để gọi complete-activity)
 *                     accuracy:
 *                       type: number
 *                       example: 92.5
 *                     total_sentences:
 *                       type: number
 *                       example: 10
 *                     passed:
 *                       type: boolean
 *                       example: true
 *       404:
 *         description: Dictation không tồn tại
 */
router.post("/:id/submit", verifyAccessToken, submitDictationController);

export default router;
