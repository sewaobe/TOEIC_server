import Router from "express";
import {
  getNotesByUserIdController,
  createNoteController,
  updateNoteController,
  deleteNoteController,
} from "../controllers/user_note.controller";

/**
 * @openapi
 * tags:
 *   name: User Notes
 *   description: Quản lý ghi chú của người dùng
 */

/**
 * @openapi
 * /user-notes:
 *   get:
 *     summary: Lấy danh sách tất cả ghi chú của người dùng hiện tại
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách ghi chú thành công
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
 *                   example: "Lấy ghi chú thành công"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserNote'
 *       401:
 *         description: Không được phép - token không hợp lệ
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
 *                   example: "Token không hợp lệ"
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
 *                   example: "Đã xảy ra lỗi máy chủ"
 */

/**
 * @openapi
 * /user-notes:
 *   post:
 *     summary: Tạo ghi chú mới
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateNoteRequest'
 *     responses:
 *       201:
 *         description: Tạo ghi chú thành công
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
 *                   example: "Tạo ghi chú thành công"
 *                 data:
 *                   $ref: '#/components/schemas/UserNote'
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
 *                   example: "Title và content là bắt buộc"
 *       401:
 *         description: Không được phép - token không hợp lệ
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
 *                   example: "Token không hợp lệ"
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
 *                   example: "Đã xảy ra lỗi máy chủ"
 */

/**
 * @openapi
 * /user-notes/{note_id}:
 *   put:
 *     summary: Cập nhật ghi chú
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: note_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của ghi chú cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateNoteRequest'
 *     responses:
 *       200:
 *         description: Cập nhật ghi chú thành công
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
 *                   example: "Cập nhật ghi chú thành công"
 *                 data:
 *                   $ref: '#/components/schemas/UserNote'
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
 *                   example: "Title và content là bắt buộc"
 *       401:
 *         description: Không được phép - token không hợp lệ
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
 *                   example: "Token không hợp lệ"
 *       404:
 *         description: Không tìm thấy ghi chú
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
 *                   example: "Không tìm thấy ghi chú"
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
 *                   example: "Đã xảy ra lỗi máy chủ"
 */

/**
 * @openapi
 * /user-notes/{note_id}:
 *   delete:
 *     summary: Xóa ghi chú
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: note_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của ghi chú cần xóa
 *     responses:
 *       200:
 *         description: Xóa ghi chú thành công
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
 *                   example: "Xóa ghi chú thành công"
 *                 data:
 *                   $ref: '#/components/schemas/UserNote'
 *       401:
 *         description: Không được phép - token không hợp lệ
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
 *                   example: "Token không hợp lệ"
 *       404:
 *         description: Không tìm thấy ghi chú
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
 *                   example: "Không tìm thấy ghi chú"
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
 *                   example: "Đã xảy ra lỗi máy chủ"
 */

const router = Router();

router.get("/", getNotesByUserIdController);
router.post("/", createNoteController);
router.put("/:note_id", updateNoteController);
router.delete("/:note_id", deleteNoteController);

export default router;
