import Router from 'express';
import { createVocabularyDefinitionAttemptController, getVocabularyDefinitionAttemptsByUserController } from '../controllers/vocabulary_definition_attempt.controller';

/**
 * @openapi
 * /vocabulary-definition-attempts:
 *   get:
 *     summary: Lấy danh sách các lần luyện tập định nghĩa từ vựng của người dùng
 *     description: |
 *       API trả về danh sách các lần luyện tập định nghĩa từ vựng (Vocabulary Definition Attempts)
 *       của người dùng hiện tại (xác định từ JWT Access Token).  
 *       Hỗ trợ phân trang qua query `page` và `limit`.
 *     tags:
 *       - Vocabulary Definition Attempts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Số trang hiện tại (bắt đầu từ 1).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Số lượng kết quả mỗi trang.
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
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
 *                   example: Lấy danh sách các lần thử định nghĩa từ vựng thành công.
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 45
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "673a90d4e63c1b72e35b12ff"
 *                           vocabulary_id:
 *                             type: string
 *                             example: "673a8f91c83a030cccfb1302"
 *                           answer:
 *                             type: string
 *                             example: "To move swiftly by foot"
 *                           is_correct:
 *                             type: boolean
 *                             example: true
 *                           accuracy_score:
 *                             type: number
 *                             example: 0.92
 *                           attempt_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-11-09T12:45:30.000Z"
 *       401:
 *         description: Không có quyền truy cập hoặc token không hợp lệ
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
 *                   example: "Token không hợp lệ hoặc đã hết hạn."
 *       500:
 *         description: Lỗi phía server
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
 *                   example: "Lỗi máy chủ nội bộ"

 *   post:
 *     summary: Tạo mới các lần luyện tập định nghĩa từ vựng
 *     description: |
 *       API cho phép người dùng lưu kết quả luyện tập định nghĩa từ vựng.  
 *       Có thể gửi 1 hoặc nhiều `attempt` cùng lúc.
 *     tags:
 *       - Vocabulary Definition Attempts
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/VocabularyDefinitionAttemptCreate'
 *               - type: array
 *                 items:
 *                   $ref: '#/components/schemas/VocabularyDefinitionAttemptCreate'
 *     responses:
 *       201:
 *         description: Tạo mới thành công
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
 *                   example: "Tạo mới các lần thử định nghĩa từ vựng thành công."
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/VocabularyDefinitionAttempt'
 *                     - type: array
 *                       items:
 *                         $ref: '#/components/schemas/VocabularyDefinitionAttempt'
 *       400:
 *         description: Dữ liệu không hợp lệ
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
 *                   example: "Thiếu thông tin bắt buộc trong body."
 *       401:
 *         description: Token không hợp lệ hoặc hết hạn
 *       500:
 *         description: Lỗi phía server
 */

const router = Router();

router.get("/", getVocabularyDefinitionAttemptsByUserController);
router.post("/", createVocabularyDefinitionAttemptController);

export default router;