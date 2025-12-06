import Router from 'express';
import { createChatSessionController, deleteChatSessionController, getAllChatMessageInSessionController, getChatSessionByUserIdController, processUserMessageController } from '../controllers/chat.controller';
import { createSpeakingSessionController, processSpeakingTurnController } from '../controllers/speaking.controller';
import { getSpeakingSessionsController, getSpeakingSessionMessagesController } from '../controllers/speakingHistory.controller';

const router = Router();

router.post("/session", createChatSessionController);
router.get("/session", getChatSessionByUserIdController);
router.delete("/session/:sessionId", deleteChatSessionController);
router.get("/message/:sessionId", getAllChatMessageInSessionController);
router.post("/message", processUserMessageController);

/**
 * @openapi
 * /chat/speaking/session:
 *   post:
 *     summary: Tạo phiên luyện nói (speaking conversation)
 *     description: Tạo một ChatSession mới với type = "speaking_conversation" và lưu cấu hình luyện nói từ client.
 *     tags:
 *       - Speaking
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SpeakingCreateSessionRequest'
 *     responses:
 *       201:
 *         description: Tạo phiên luyện nói mới thành công
 *       400:
 *         description: Thiếu title hoặc config
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 *       500:
 *         description: Lỗi hệ thống
 */
router.post("/speaking/session", createSpeakingSessionController);

/**
 * @openapi
 * /chat/speaking/turn:
 *   post:
 *     summary: Xử lý một lượt luyện nói (mock Python)
 *     description: |
 *       Nhận audioBase64 (tùy chọn) và/hoặc transcript từ client, sau đó **mock** kết quả chấm điểm speaking.
 *       Kết quả và lịch sử hội thoại được lưu trong ChatMessage, sử dụng chung ChatSession.
 *       
 *       Trong tương lai, endpoint này sẽ gọi backend Python EnglishLanguageTutorChatbot để chấm điểm phát âm thực tế.
 *     tags:
 *       - Speaking
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SpeakingTurnRequest'
 *     responses:
 *       200:
 *         description: Xử lý lượt luyện nói thành công (mock)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/SpeakingTurnResponseWrapper'
 *       400:
 *         description: Thiếu sessionId
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 *       500:
 *         description: Lỗi hệ thống
 */
router.post("/speaking/turn", processSpeakingTurnController);

/**
 * @openapi
 * /chat/speaking/sessions:
 *   get:
 *     summary: Lấy danh sách phiên luyện nói của người dùng hiện tại
 *     description: Trả về các ChatSession có type = "speaking_conversation" theo user, có phân trang.
 *     tags:
 *       - Speaking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Lấy danh sách phiên luyện nói thành công
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi hệ thống
 */
router.get("/speaking/sessions", getSpeakingSessionsController);

/**
 * @openapi
 * /chat/speaking/messages/{sessionId}:
 *   get:
 *     summary: Lấy danh sách tin nhắn trong một phiên luyện nói
 *     description: Sử dụng sessionId của speaking_conversation để truy xuất toàn bộ lịch sử hội thoại.
 *     tags:
 *       - Speaking
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
 *         description: Lấy danh sách tin nhắn luyện nói thành công
 *       400:
 *         description: Thiếu sessionId
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi hệ thống
 */
router.get("/speaking/messages/:sessionId", getSpeakingSessionMessagesController);

export default router;