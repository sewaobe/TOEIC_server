import { Router } from "express";
import {
  getAllDictationController,
  createDictationController,
  updateDictationController,
  deleteDictationController,
  getDictationByIdController,
} from "../../controllers/dictation.controller";

const router = Router();

/**
 * @openapi
 * /ctv/dictation:
 *   get:
 *     summary: Lấy danh sách bài nghe (Dictation) có phân trang
 *     description: API trả về danh sách dictation, hỗ trợ phân trang bằng query `page` và `limit`
 *     tags:
 *       - Dictation
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 0
 *         description: Trang hiện tại (bắt đầu từ 0)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Số lượng dictation mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách dictation được trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                      $ref: '#/components/schemas/Dictation'
 *                 total:
 *                   type: integer
 *                   example: 125
 *                 page:
 *                   type: integer
 *                   example: 0
 *                 pageCount:
 *                   type: integer
 *                   example: 13
 */
router.get("/", getAllDictationController);

/**
 * @openapi
 * /ctv/dictation/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết của một bài nghe chép chính tả
 *     description: API trả về thông tin chi tiết của một Dictation dựa trên ID được cung cấp trong URL.
 *     tags:
 *       - Dictation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 671ab10df8f8d0a23b6a7b14
 *         description: ID của bài nghe chép chính tả cần lấy thông tin
 *     responses:
 *       200:
 *         description: Lấy thông tin Dictation thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Dictation'
 *                 message:
 *                   type: string
 *                   example: "Lấy thông tin nghe chép chính tả thành công"
 *       404:
 *         description: Không tìm thấy Dictation với ID tương ứng
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
 *                   example: "Không tìm thấy bài nghe chép chính tả"
 *       400:
 *         description: ID không hợp lệ
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
 *                   example: "ID không hợp lệ"
 */
router.get("/:id", getDictationByIdController);

/**
 * @openapi
 * /ctv/dictation:
 *   post:
 *     summary: Tạo mới bài nghe chép chính tả (Dictation)
 *     description: |
 *       API dùng để thêm mới một bài nghe chép chính tả.  
 *       Các trường `part_type` và `level` hỗ trợ lựa chọn qua dropdown.  
 *       Dưới đây là ví dụ dữ liệu mẫu.
 *     tags:
 *       - Dictation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *               - title
 *               - level
 *               - transcript
 *               - display_mode
 *             properties:
 *               topic:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Mảng các ID chủ đề (LessonManager ObjectId)
 *                 example: ["671ab10df8f8d0a23b6a7b14"]
 *               title:
 *                 type: string
 *                 description: Tiêu đề bài nghe chép chính tả
 *                 example: Daily Conversation - Ordering Coffee
 *               part_type:
 *                 type: integer
 *                 description: |
 *                   Loại phần thi (theo định dạng TOEIC):
 *                   - 1: PART_1 (Photo)
 *                   - 2: PART_2 (Question-Response)
 *                   - 3: PART_3 (Conversation)
 *                   - 4: PART_4 (Talk)
 *                   - 5: PART_5 (Incomplete Sentences)
 *                   - 6: PART_6 (Text Completion)
 *                   - 7: PART_7 (Reading Comprehension)
 *                 enum: [1, 2, 3, 4, 5, 6, 7]
 *                 example: 2
 *               level:
 *                 type: string
 *                 description: Trình độ người học (CEFR)
 *                 enum: [A1, A2, B1, B2, C1, C2]
 *                 example: A1
 *               transcript:
 *                 type: string
 *                 description: Văn bản nội dung bài nghe
 *                 example: "Good morning. I'd like a cup of cappuccino, please."
 *               duration:
 *                 type: number
 *                 description: Thời lượng bài nghe (milliseconds)
 *                 example: 28500
 *               display_mode:
 *                 type: string
 *                 description: Chế độ hiển thị (theo câu hoặc theo từ)
 *                 enum: [sentence, word]
 *                 example: sentence
 *               status:
 *                 type: string
 *                 description: Trạng thái bài nghe
 *                 enum: [DRAFT, PENDING, APPROVED, OPEN, CLOSED, REJECTED]
 *                 example: DRAFT
 *               weight:
 *                 type: number
 *                 description: Trọng số bài nghe
 *                 example: 0
 *           example:
 *             topic: ["671ab10df8f8d0a23b6a7b14"]
 *             title: "Daily Conversation - Ordering Coffee"
 *             part_type: 2
 *             level: "A1"
 *             transcript: "Good morning. I'd like a cup of cappuccino, please."
 *             duration: 28500
 *             display_mode: "sentence"
 *             status: "DRAFT"
 *             weight: 0
 *     responses:
 *       200:
 *         description: Tạo mới bài nghe chép chính tả thành công
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
 *                   example: Thêm nghe chép chính tả thành công
 *                 data:
 *                   type: object
 *                   example:
 *                     _id: "670abf10a9b9a2cbd8a55a22"
 *                     topic: ["671ab10df8f8d0a23b6a7b14"]
 *                     title: "Daily Conversation - Ordering Coffee"
                     part_type: 2
                     level: "A1"
                     transcript: "Good morning. I'd like a cup of cappuccino, please."
                     duration: 28500
                     display_mode: "sentence"
                     status: "DRAFT"
                     weight: 0
                     created_at: "2025-10-12T08:15:30.000Z"
 *                     updated_at: "2025-10-12T08:20:45.000Z"
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc thiếu thông tin bắt buộc
 */
router.post("/", createDictationController);

/**
 * @openapi
 * /ctv/dictation/{id}:
 *   put:
 *     summary: Cập nhật bài nghe chép chính tả
 *     description: Sửa thông tin một bài nghe theo ID. Các trường không gửi sẽ giữ nguyên.
 *     tags:
 *       - Dictation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của bài nghe cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Mảng các ID chủ đề
 *               title:
 *                 type: string
 *                 description: Tiêu đề bài nghe
 *               part_type:
 *                 type: integer
 *                 enum: [1, 2, 3, 4, 5, 6, 7]
 *               level:
 *                 type: string
 *                 enum: [A1, A2, B1, B2, C1, C2]
 *               transcript:
 *                 type: string
 *                 description: Văn bản nội dung
 *               duration:
 *                 type: number
 *                 description: Thời lượng bài nghe (milliseconds)
 *               display_mode:
 *                 type: string
 *                 enum: [sentence, word]
 *               status:
 *                 type: string
 *                 enum: [DRAFT, PENDING, APPROVED, OPEN, CLOSED, REJECTED]
 *               weight:
 *                 type: number
 *           example:
 *             topic: ["671ab10df8f8d0a23b6a7b14"]
 *             title: "Daily Conversation - Ordering Coffee"
 *             part_type: 2
 *             level: "A1"
 *             transcript: "Good morning. I'd like a cup of cappuccino, please."
 *             duration: 28500
 *             display_mode: "sentence"
 *             status: "DRAFT"
 *             weight: 0
 *     responses:
 *       200:
 *         description: Cập nhật thành công
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
 *                   example: Sửa nghe chép chính tả thành công
 *                 data:
 *                   $ref: '#/components/schemas/Dictation'
 *             example:
 *               success: true
 *               message: "Sửa nghe chép chính tả thành công"
 *               data:
 *                 _id: "68ec5ac7d0c569ca949a86a7"
 *                 topic: ["671ab10df8f8d0a23b6a7b14"]
 *                 title: "Daily Conversation - Ordering Coffee"
 *                 part_type: 2
 *                 level: "A1"
 *                 transcript: "Good morning. I'd like a cup of cappuccino, please."
 *                 duration: 28500
 *                 display_mode: "sentence"
 *                 status: "DRAFT"
 *                 weight: 0
 *                 created_at: "2025-10-13T01:49:59.169Z"
 *                 updated_at: "2025-10-13T09:20:11.512Z"
 *       404:
 *         description: Không tìm thấy bài nghe
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
 *                   example: Không tìm thấy bài nghe cần cập nhật
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
 *                   example: Dữ liệu không hợp lệ hoặc sai định dạng
 */
router.put("/:id", updateDictationController);

/**
 * @openapi
 * /ctv/dictation/{id}:
 *   delete:
 *     summary: Xóa bài nghe chép chính tả theo ID
 *     description: Xóa bài nghe khỏi hệ thống dựa trên ID. Chỉ admin hoặc cộng tác viên có quyền mới được thao tác.
 *     tags:
 *       - Dictation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của bài nghe cần xóa
 *     responses:
 *       200:
 *         description: Xóa bài nghe thành công
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
 *                   example: Xóa bài nghe chép chính tả thành công
 *       404:
 *         description: Không tìm thấy bài nghe cần xóa
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
 *                   example: Không tìm thấy bài nghe cần xóa
 *       400:
 *         description: ID không hợp lệ hoặc thiếu trong request
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
 *                   example: ID không hợp lệ hoặc thiếu trong request
 */
router.delete("/:id", deleteDictationController);

export default router;
