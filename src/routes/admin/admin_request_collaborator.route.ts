import Router from "express";
import { verifyAccessToken } from "../../middlewares/verifyAccessToken.middleware";
import { checkRole } from "../../middlewares/checkRole.middleware";
import { getAllRequestCollaboratorsController, getRequestCollaboratorByUserIdController, submitRequestCollaboratorController, updateRequestCollaboratorStatusController } from "../../controllers/request_collaborator.controller";

/**
 * @openapi
 * /admin/request-collaborators:
 *   get:
 *     summary: Lấy danh sách biểu mẫu đăng ký cộng tác viên
 *     description: Chỉ admin có quyền xem danh sách yêu cầu cộng tác viên, hỗ trợ phân trang.
 *     tags:
 *       - Request Collaborator
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 6
 *         description: Giới hạn số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Lấy danh sách yêu cầu thành công
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
 *                   example: "Fetched collaborator requests successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/RequestCollaborator'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *       401:
 *         description: Không có quyền truy cập
 */

/**
 * @openapi
 * /admin/request-collaborators/by-user:
 *   get:
 *     summary: Lấy biểu mẫu đăng ký cộng tác viên của người dùng hiện tại
 *     description: 
 *       Người dùng đã đăng nhập có thể xem lại biểu mẫu cộng tác viên mà họ đã gửi.  
 *       Trả về thông tin chi tiết của biểu mẫu tương ứng với `user_id` trong token.
 *     tags:
 *       - Request Collaborator
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy biểu mẫu thành công
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
 *                   example: "Fetched collaborator request by user successfully."
 *                 data:
 *                   $ref: '#/components/schemas/RequestCollaborator'
 *       401:
 *         description: Thiếu hoặc sai token truy cập
 *       404:
 *         description: Người dùng chưa gửi biểu mẫu đăng ký cộng tác viên
 */

/**
 * @openapi
 * /admin/request-collaborators:
 *   post:
 *     summary: Gửi biểu mẫu đăng ký cộng tác viên
 *     description: Người dùng gửi form đăng ký cộng tác viên với thông tin cá nhân và CV.
 *     tags:
 *       - Request Collaborator
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequestCollaborator'
 *           example:
 *             fullName: "Nguyễn Minh Học"
 *             email: "hoc.nguyen@example.com"
 *             experience: "1-2 năm"
 *             expertise: ["Listening", "Reading"]
 *             motivation: "Muốn trở thành cộng tác viên hỗ trợ học viên luyện TOEIC."
 *             availability: "part-time"
 *             cv_url: "https://res.cloudinary.com/demo/cv_nguyenminhhoc.pdf"
 *     responses:
 *       201:
 *         description: Gửi biểu mẫu thành công
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
 *                   example: "Collaborator request submitted successfully."
 *                 data:
 *                   $ref: '#/components/schemas/RequestCollaborator'
 */

/**
 * @openapi
 * /admin/request-collaborators/{id}/status:
 *   put:
 *     summary: Cập nhật trạng thái duyệt đơn đăng ký cộng tác viên
 *     description: Admin chấp nhận (approved) hoặc từ chối (rejected) yêu cầu cộng tác viên.
 *     tags:
 *       - Request Collaborator
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của biểu mẫu cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *                 example: approved
 *               rejection_reason:
 *                 type: string
 *                 example: "Chưa đủ kinh nghiệm yêu cầu."
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
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
 *                   example: "Updated collaborator request status successfully."
 *                 data:
 *                   $ref: '#/components/schemas/RequestCollaborator'
 *       404:
 *         description: Không tìm thấy biểu mẫu
 */

const router = Router();

router.get("/", verifyAccessToken, checkRole("admin"), getAllRequestCollaboratorsController);

router.get("/by-user", verifyAccessToken, getRequestCollaboratorByUserIdController);

router.post("/", submitRequestCollaboratorController);

router.put("/:id/status", verifyAccessToken, checkRole("admin"), updateRequestCollaboratorStatusController);

export default router;