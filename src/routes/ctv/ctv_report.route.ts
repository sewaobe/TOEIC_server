import Router from 'express';
import { getCommentByCreatedTestOrLessonController } from '../../controllers/comment.controller';

const router = Router();

/**
 * @openapi
 * /ctv/reports/comments:
 *   get:
 *     tags:
 *       - CTV Reports
 *     summary: Lấy danh sách bình luận của các bài test hoặc bài học mà CTV đã tạo
 *     description: API này trả về tất cả các bình luận nằm trong các **bài test** hoặc **bài học** được tạo bởi cộng tác viên hiện tại (xác thực qua access token).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         required: false
 *         description: Số trang hiện tại (phân trang)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         required: false
 *         description: Số lượng bình luận tối đa trên mỗi trang
 *     responses:
 *       200:
 *         description: Lấy bình luận của bài test/bài học đã tạo thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "671f4c812bcb49f2d8d1a123"
 *                       content:
 *                         type: string
 *                         example: "Đề này rất hay, phần nghe có vẻ khó hơn các test khác."
 *                       create_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-11-02T08:35:14.129Z"
 *                       user_id:
 *                         type: string
 *                         example: "66fbcd81c0a7d917a22e8c45"
 *                       test_info:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "66f9ab23a92a8e70c17be5b0"
 *                           title:
 *                             type: string
 *                             example: "New Economy TOEIC Test 6"
 *                       lesson_info:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "66fcf12c8e4baf216dcf33b1"
 *                           title:
 *                             type: string
 *                             example: "Unit 5 – Grammar Practice"
 *                 message:
 *                   type: string
 *                   example: "Lấy bình luận của bài test/bài học đã tạo thành công"
 *       401:
 *         description: Thiếu hoặc sai access token.
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
 *                   example: "Unauthorized"
 *       500:
 *         description: Lỗi máy chủ.
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
 *                   example: "Internal server error"
 */
router.get('/comments', getCommentByCreatedTestOrLessonController);

export default router;