// src/routes/flashcard_user.route.ts
import { Router } from "express";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { checkUnlock } from "../middlewares/checkUnlock.middleware";
import { getFlashCardById } from "../controllers/flashCard.controller";

const router = Router();

/**
 * @swagger
 * /flashcard-plan/{id}:
 *   get:
 *     tags:
 *       - Flashcard User
 *     summary: Lấy chi tiết flashcard plan cho user
 *     description: |
 *       Lấy danh sách flashcard sau khi đã unlock.
 *       - Kiểm tra unlock qua middleware checkUnlock
 *       - Trả về danh sách flashcard (word, definition, example)
 *       - User sẽ submit qua complete-activity sau khi học xong
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của flashcard plan
 *     responses:
 *       200:
 *         description: Lấy flashcard plan thành công
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
 *                     flashcards:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           word:
 *                             type: string
 *                             example: "abandon"
 *                           definition:
 *                             type: string
 *                             example: "to leave someone or something"
 *                           example_sentence:
 *                             type: string
 *                             example: "He abandoned his car in the snow."
 *                           pronunciation:
 *                             type: string
 *                             example: "/əˈbændən/"
 *       403:
 *         description: Flashcard chưa được unlock
 *       404:
 *         description: Flashcard plan không tồn tại
 */
router.get("/:id", verifyAccessToken, checkUnlock, getFlashCardById);

export default router;
