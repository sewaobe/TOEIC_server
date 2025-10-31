import Router from "express";
import {
    handleAskQuestionController,
    handleIngestQuestionController,
} from "../controllers/rag.controller";

const router = Router();

/**
 * @openapi
 * /rag/ask:
 *   post:
 *     summary: Gửi câu hỏi TOEIC cho chatbot (Gemini RAG)
 *     description: |
 *       API nhận câu hỏi của sinh viên, tìm dữ liệu liên quan trong hệ thống TOEIC 
 *       thông qua RAG và trả về câu trả lời sinh bởi mô hình Gemini Flash Lite.
 *       
 *       Có hai chế độ hoạt động:
 *       - **semantic**: Khi sinh viên hỏi tự do (`query`), hệ thống tìm context bằng embedding.
 *       - **by_id**: Khi sinh viên click "Hỏi AI" trong câu hỏi cụ thể (`questionId`), hệ thống lấy context chính xác.
 *     tags:
 *       - RAG
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Câu hỏi mà sinh viên muốn hỏi chatbot TOEIC
 *                 example: "Vì sao đáp án câu When does the promotion end là D?"
 *               questionId:
 *                 type: string
 *                 nullable: true
 *                 description: ID của câu hỏi TOEIC (nếu sinh viên click 'Hỏi AI' từ giao diện câu hỏi)
 *                 example: "68d64e3859d280ca13208deb"
 *     responses:
 *       200:
 *         description: Trả lời câu hỏi thành công
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
 *                   example: "Trả lời câu hỏi thành công ✅"
 *                 data:
 *                   type: object
 *                   properties:
 *                     answer:
 *                       type: string
 *                       description: Câu trả lời do Gemini sinh ra
 *                       example: "Câu này đúng là D vì 'at the end of the month' nghĩa là vào cuối tháng."
 *                     mode:
 *                       type: string
 *                       enum: [semantic, by_id]
 *                       example: "by_id"
 *                     sources:
 *                       type: array
 *                       description: Metadata của các đoạn context được dùng để trả lời
 *                       items:
 *                         type: object
 *                         properties:
 *                           questionId:
 *                             type: string
 *                             example: "68d64e3859d280ca13208deb"
 *                           tags:
 *                             type: string
 *                             example: "promotion, date"
 *       400:
 *         description: Thiếu tham số `query`
 *       500:
 *         description: Lỗi máy chủ
 */
router.post("/ask", handleAskQuestionController);

/**
 * @openapi
 * /rag/ingest:
 *   post:
 *     summary: Nạp lại dữ liệu Question vào Chroma
 *     description: |
 *       API này đọc toàn bộ dữ liệu từ MongoDB collection Question,
 *       sau đó chạy `chunker` để chia nhỏ và lưu vector vào ChromaDB.
 *     tags:
 *       - RAG
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Nạp dữ liệu thành công
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
 *                   example: "Nạp dữ liệu Question vào Chroma thành công"
 *       500:
 *         description: Lỗi hệ thống nội bộ
 */
router.post("/ingest", handleIngestQuestionController);

export default router;
