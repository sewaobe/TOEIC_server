import Router from 'express';
import { verifyAccessToken } from '../../middlewares/verifyAccessToken.middleware';
import { createLessonManagerController, deleteLessonManagerController, getAllLessonManagerController, getAllTopicTitlesController, getLessonManagerByIdController, updateLessonManagerController, updateStatusLessonManagerController } from '../../controllers/lesson_manager.controller';

const router = Router();

/**
 * @openapi
 * /ctv/lesson-manager/titles:
 *   get:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Get all topic titles
 *     description: Retrieve a list of all topic titles available in the lesson manager.
 *     responses:
 *       200:
 *         description: A list of topic titles.
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
 *                       id:
 *                         type: string
 *                         example: "64a7b2f4c25e4b3f9c8e4d2a"
 *                       title:
 *                         type: string
 *                         example: "Basic Grammar"
 *                 message:
 *                   type: string
 *                   example: "Fetched topic titles successfully."
 */
router.get("/titles", verifyAccessToken, getAllTopicTitlesController);

/**
 * @openapi
 * /ctv/lesson-manager:
 *   get:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Get all lesson managers with pagination
 *     description: Retrieve a paginated list of lesson managers created by the authenticated CTV user.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination (default is 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page (default is 10)
 *     responses:
 *       200:
 *         description: A paginated list of lesson managers.
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
 *                     $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Fetched lesson managers successfully."
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                   example:
 *                     page: 1
 *                     limit: 10
 *                     total: 25
 *                     totalPages: 3
 *                     hasNext: true
 *                     hasPrev: false
 */
router.get("/", verifyAccessToken, getAllLessonManagerController);

/**
 * @openapi
 * /ctv/lesson-manager/{id}:
 *   get:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Get a lesson manager by ID
 *     description: Retrieve detailed information about a specific lesson manager created by the authenticated CTV user.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the lesson manager to retrieve
 *     responses:
 *       200:
 *         description: Successfully retrieved the lesson manager.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Fetched lesson manager successfully."
 *       400:
 *         description: Invalid ID format.
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
 *                   example: "Invalid lesson manager ID format."
 *       404:
 *         description: Lesson manager not found.
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
 *                   example: "Lesson manager not found."
 *       500:
 *         description: Internal server error.
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
 *                   example: "Internal server error."
 */
router.get("/:id", verifyAccessToken, getLessonManagerByIdController);

/**
 * @openapi
 * /ctv/lesson-manager:
 *   post:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Create a new lesson manager
 *     description: Create a new lesson manager with the provided details.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LessonManager'
 *     responses:
 *       201:
 *         description: Lesson manager created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Created lesson manager successfully."
 */
router.post("/", verifyAccessToken, createLessonManagerController);

/**
 * @openapi
 * /ctv/lesson-manager/{id}/status:
 *   put:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Cập nhật trạng thái của Lesson Manager
 *     description: |
 *       Cập nhật trạng thái bài học trong Lesson Manager theo ID.
 *       Chỉ người tạo hoặc quản trị viên mới có quyền thay đổi trạng thái.
 *       Các giá trị hợp lệ của status bao gồm:
 *         - **draft**: Bản nháp (chưa gửi duyệt)
 *         - **pending**: Đang chờ admin duyệt
 *         - **approved**: Đã được admin duyệt
 *         - **open**: Đang mở cho học viên
 *         - **closed**: Đã đóng, không thể truy cập
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của Lesson Manager cần cập nhật trạng thái
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 description: Trạng thái mới của bài học
 *                 enum:
 *                   - draft
 *                   - pending
 *                   - approved
 *                   - open
 *                   - closed
 *                 example: pending
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
 *                 data:
 *                   $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Cập nhật trạng thái Lesson Manager thành công."
 *       400:
 *         description: Giá trị trạng thái không hợp lệ hoặc request sai định dạng.
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
 *                   example: "Trạng thái không hợp lệ. Vui lòng chọn một trong: draft, pending, approved, open, closed."
 *       403:
 *         description: Người dùng không có quyền cập nhật trạng thái này.
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
 *                   example: "Forbidden: chỉ người tạo hoặc admin mới được cập nhật trạng thái."
 *       404:
 *         description: Không tìm thấy Lesson Manager tương ứng với ID.
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
 *                   example: "Không tìm thấy Lesson Manager."
 *       500:
 *         description: Lỗi máy chủ nội bộ.
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
 *                   example: "Lỗi máy chủ nội bộ."
 */
router.put("/:id/status", verifyAccessToken, updateStatusLessonManagerController);

/**
 * @openapi
 * /ctv/lesson-manager/{id}:
 *   put:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Update an existing lesson manager
 *     description: Update the details of an existing lesson manager by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the lesson manager to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LessonManager'
 *     responses:
 *       200:
 *         description: Lesson manager updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Updated lesson manager successfully."
 */
router.put("/:id", verifyAccessToken, updateLessonManagerController);


/**
 * @openapi
 * /ctv/lesson-manager/{id}:
 *   delete:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Delete an existing lesson manager
 *     description: Delete an existing lesson manager by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the lesson manager to delete.
 *     responses:
 *       200:
 *         description: Lesson manager deleted successfully.
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
 *                   example: {}
 *                 message:
 *                   type: string
 *                   example: "Deleted lesson manager successfully."
 */
router.delete("/:id", verifyAccessToken, deleteLessonManagerController);

export default router;
