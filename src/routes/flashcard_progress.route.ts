/**
 * @openapi
 * tags:
 *   name: Flashcard Progress
 *   description: Quản lý tiến trình học flashcard của người dùng
 */

/**
 * @openapi
 * /flashcard-progress/start:
 *   post:
 *     summary: Tạo session học flashcard mới
 *     tags: [Flashcard Progress]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic_vocabulary_id
 *               - order_queue
 *             properties:
 *               topic_vocabulary_id:
 *                 type: string
 *                 example: "66be49edaae5e7b17b42e104"
 *               order_queue:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["668cfe93a9a6b2e7b42a0101", "668cfe93a9a6b2e7b42a0102"]
 *     responses:
 *       201:
 *         description: Tạo session thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlashCardProgress'
 */

/**
 * @openapi
 * /flashcard-progress/update:
 *   patch:
 *     summary: Cập nhật tiến trình học của session hiện tại
 *     tags: [Flashcard Progress]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *               - order_queue
 *               - current_index
 *             properties:
 *               session_id:
 *                 type: string
 *               order_queue:
 *                 type: array
 *                 items:
 *                   type: string
 *               current_index:
 *                 type: number
 *               logs_delta:
 *                 type: array
 *                 description: Danh sách log mới thêm trong lần cập nhật
 *                 items:
 *                   type: object
 *                   properties:
 *                     vocab_id: { type: string }
 *                     vocab_word: { type: string }
 *                     eval_type: { type: string, enum: ["easy", "medium", "hard", "skip"] }
 *                     response_time: { type: number }
 *                     attempted_at: { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật tiến trình học thành công
 */

/**
 * @openapi
 * /flashcard-progress/active-by-user:
 *   get:
 *     summary: Lấy tất cả session học đang active của người dùng
 *     tags: [Flashcard Progress]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         example: 9
 *     responses:
 *       200:
 *         description: Danh sách session đang active
 */

/**
 * @openapi
 * /flashcard-progress/{session_id}:
 *   get:
 *     summary: Lấy tiến trình của 1 session cụ thể
 *     tags: [Flashcard Progress]
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của session flashcard
 *     responses:
 *       200:
 *         description: Lấy thông tin tiến trình thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlashCardProgress'
 */

/**
 * @openapi
 * /flashcard-progress/finalize:
 *   post:
 *     summary: Hoàn tất một session học flashcard
 *     tags: [Flashcard Progress]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *               - accuracy
 *               - avg_time
 *               - total
 *               - logs
 *               - started_at
 *               - finished_at
 *             properties:
 *               session_id: { type: string }
 *               accuracy: { type: number, example: 0.85 }
 *               avg_time: { type: number, example: 3.2 }
 *               total: { type: number, example: 20 }
 *               logs:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/FlashcardLog'
 *               started_at: { type: string, example: "2025-10-25T12:30:00Z" }
 *               finished_at: { type: string, example: "2025-10-25T12:45:00Z" }
 *     responses:
 *       200:
 *         description: Hoàn tất session thành công
 */

/**
 * @openapi
 * /flashcard-progress/remove/{session_id}:
 *   delete:
 *     summary: Xóa session học flashcard
 *     tags: [Flashcard Progress]
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của session flashcard cần xóa
 *     responses:
 *       200:
 *         description: Xóa session thành công
 *       404:
 *         description: Không tìm thấy session
 */

import Router from "express";
import {
  createSessionFlashcardController,
  finalizeFlashcardSessionController,
  getAllActiveSessionsController,
  getFlashcardProgressController,
  removeFlashcardSessionController,
  updateSessionFlashcardController,
} from "../controllers/flashcard_progress.controller";
import { requireIdempotencyKey } from "../middlewares/requireIdempotencyKey.middleware";

const router = Router();

router.post("/start", requireIdempotencyKey, createSessionFlashcardController);
router.patch("/update", updateSessionFlashcardController);
router.get("/active-by-user", getAllActiveSessionsController);
router.get("/:session_id", getFlashcardProgressController);
router.post("/finalize", finalizeFlashcardSessionController);
router.delete("/remove/:session_id", removeFlashcardSessionController);
export default router;
