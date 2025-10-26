import Router from "express";
import { getQuestionByIdController } from "../controllers/question.controller";

/**
 * @openapi
 * tags:
 *   name: Questions
 *   description: Quản lý và truy vấn câu hỏi trong bài thi
 */

/**
 * @openapi
 * /questions/{question_id}:
 *   get:
 *     summary: Lấy thông tin chi tiết của câu hỏi theo ID (kèm group)
 *     tags: [Questions]
 *     security:
 *       - bearerAuth: []   # Vì bạn có verifyAccessToken
 *     parameters:
 *       - in: path
 *         name: question_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của câu hỏi cần lấy chi tiết
 *       - in: query
 *         name: test_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của bài test chứa câu hỏi
 *     responses:
 *       200:
 *         description: Lấy thông tin câu hỏi và group thành công
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
 *                   example: "Lấy thông tin câu hỏi thành công."
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "671af63f9b0f2c1234567890"
 *                     part:
 *                       type: number
 *                       example: 3
 *                     audioUrl:
 *                       type: object
 *                       properties:
 *                         url:
 *                           type: string
 *                           example: "https://cdn.saha/audio/part3_01.mp3"
 *                     imagesUrl:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           url:
 *                             type: string
 *                             example: "https://cdn.saha/images/q1.png"
 *                     transcriptEnglish:
 *                       type: string
 *                       example: "What does the woman say?"
 *                     transcriptTranslation:
 *                       type: string
 *                       example: "Người phụ nữ nói gì?"
 *                     questions:
 *                       type: array
 *                       description: Danh sách câu hỏi thuộc group này
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "66cfb7b8a9f2c12345678901"
 *                           name:
 *                             type: string
 *                             example: "Question 5"
 *                           textQuestion:
 *                             type: string
 *                             example: "What is the man asking about?"
 *                           choices:
 *                             type: object
 *                             example:
 *                               A: "The report"
 *                               B: "The meeting"
 *                               C: "The budget"
 *                           correctAnswer:
 *                             type: string
 *                             example: "B"
 *                           explanation:
 *                             type: string
 *                             example: "The woman mentions the meeting."
 *                           tags:
 *                             type: array
 *                             items:
 *                               type: string
 *                             example: ["[Part 3]"]
 *       400:
 *         description: Thiếu tham số question_id hoặc test_id
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Thiếu tham số question_id hoặc test_id."
 *       404:
 *         description: Không tìm thấy câu hỏi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Không tìm thấy câu hỏi."
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Đã xảy ra lỗi máy chủ."
 */

const router = Router();

router.get("/:question_id", getQuestionByIdController);

export default router;