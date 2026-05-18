/**
 * @openapi
 * tags:
 *   name: Flashcard Progress
 *   description: Quan ly tien trinh hoc flashcard cua nguoi dung
 */

/**
 * @openapi
 * /flashcard-progress/start:
 *   post:
 *     summary: Tao session hoc flashcard moi
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
 *         description: Tao session thanh cong
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlashCardProgress'
 */

/**
 * @openapi
 * /flashcard-progress/{sessionId}/answer:
 *   post:
 *     summary: Submit one semantic flashcard answer
 *     tags: [Flashcard Progress]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: Idempotency-Key
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
 *               - vocabulary_id
 *               - action
 *               - response_time
 *               - attempted_at
 *             properties:
 *               vocabulary_id: { type: string }
 *               action: { type: string, enum: ["remember", "vague", "unknown", "forgot"] }
 *               response_time: { type: number }
 *               attempted_at: { type: string, example: "2026-05-18T12:35:10Z" }
 *     responses:
 *       200:
 *         description: Answer processed successfully
 */

/**
 * @openapi
 * /flashcard-progress/active-by-user:
 *   get:
 *     summary: Lay tat ca session hoc dang active cua nguoi dung
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
 *         description: Danh sach session dang active
 */

/**
 * @openapi
 * /flashcard-progress/{session_id}:
 *   get:
 *     summary: Lay tien trinh cua 1 session cu the
 *     tags: [Flashcard Progress]
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID cua session flashcard
 *     responses:
 *       200:
 *         description: Lay thong tin tien trinh thanh cong
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlashCardProgress'
 */

/**
 * @openapi
 * /flashcard-progress/finalize:
 *   post:
 *     summary: Hoan tat mot session hoc flashcard
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
 *               - started_at
 *               - finished_at
 *             properties:
 *               session_id: { type: string }
 *               accuracy: { type: number, example: 0.85 }
 *               avg_time: { type: number, example: 3.2 }
 *               total: { type: number, example: 20 }
 *               started_at: { type: string, example: "2025-10-25T12:30:00Z" }
 *               finished_at: { type: string, example: "2025-10-25T12:45:00Z" }
 *     responses:
 *       200:
 *         description: Hoan tat session thanh cong
 */

/**
 * @openapi
 * /flashcard-progress/remove/{session_id}:
 *   delete:
 *     summary: Xoa session hoc flashcard
 *     tags: [Flashcard Progress]
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID cua session flashcard can xoa
 *     responses:
 *       200:
 *         description: Xoa session thanh cong
 *       404:
 *         description: Khong tim thay session
 */

import Router from "express";
import {
  answerFlashcardSessionController,
  createSessionFlashcardController,
  finalizeFlashcardSessionController,
  getAllActiveSessionsController,
  getFlashcardProgressController,
  removeFlashcardSessionController,
} from "../controllers/flashcard_progress.controller";
import { requireIdempotencyKey } from "../middlewares/requireIdempotencyKey.middleware";

const router = Router();

router.post("/start", requireIdempotencyKey, createSessionFlashcardController);
router.post("/:sessionId/answer", requireIdempotencyKey, answerFlashcardSessionController);
router.get("/active-by-user", getAllActiveSessionsController);
router.get("/:session_id", getFlashcardProgressController);
router.post("/finalize", finalizeFlashcardSessionController);
router.delete("/remove/:session_id", removeFlashcardSessionController);

export default router;
