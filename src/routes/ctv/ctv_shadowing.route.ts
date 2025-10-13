import { Router } from 'express';
import { createShadowingController, deleteShadowingController, getAllShadowingController, updateShadowingController } from '../../controllers/shadowing.controller';


const router = Router();

/**
 * @openapi
 * /ctv/shadowing:
 *   get:
 *     summary: Lấy danh sách bài nghe (shadowing) có phân trang
 *     description: API trả về danh sách shadowing, hỗ trợ phân trang bằng query `page` và `limit`
 *     tags:
 *       - shadowing
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
 *         description: Số lượng shadowing mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách shadowing được trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: 
 *                      $ref: '#/components/schemas/shadowing'
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
router.get("/", getAllShadowingController);

/**
 * @openapi
 * /ctv/shadowing:
 *   post:
 *     summary: Tạo mới bài nghe chép chính tả (shadowing)
 *     description: |
 *       API dùng để thêm mới một bài nghe chép chính tả.  
 *       Các trường `part_type` và `level` hỗ trợ lựa chọn qua dropdown.  
 *       Dưới đây là ví dụ dữ liệu mẫu.
 *     tags:
 *       - shadowing
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *               - level
 *               - transcript
 *               - timings
 *               - answer_key
 *               - display_mode
 *             properties:
 *               topic:
 *                 type: string
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
 *                 example: "Good morning. I'd like a cup of cappuccino, please."
 *               audio_url:
 *                 type: string
 *                 example: https://cdn.example.com/audio/cappuccino.mp3
 *               duration:
 *                 type: number
 *                 example: 28.5
 *               timings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - text
 *                     - startTime
 *                     - endTime
 *                   properties:
 *                     text:
 *                       type: string
 *                       example: "Good morning."
 *                     startTime:
 *                       type: number
 *                       example: 0.0
 *                     endTime:
 *                       type: number
 *                       example: 2.5
 *                     words:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           word:
 *                             type: string
 *                             example: Good
 *                           start:
 *                             type: number
 *                             example: 0.0
 *                           end:
 *                             type: number
 *                             example: 0.4
 *               answer_key:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                       example: cappuccino
 *                     hint:
 *                       type: string
 *                       example: coffee drink with milk foam
 *               display_mode:
 *                 type: string
 *                 enum: [sentence, word]
 *                 example: sentence
 *           example:
 *             topic: "Daily Conversation - Ordering Coffee"
 *             part_type: 2
 *             level: "A1"
 *             transcript: "Good morning. I'd like a cup of cappuccino, please."
 *             audio_url: "https://cdn.example.com/audio/cappuccino.mp3"
 *             duration: 28.5
 *             timings:
 *               - text: "Good morning."
 *                 startTime: 0
 *                 endTime: 2.5
 *                 words:
 *                   - word: "Good"
 *                     start: 0
 *                     end: 0.4
 *                   - word: "morning"
 *                     start: 0.4
 *                     end: 1.2
 *               - text: "I'd like a cup of cappuccino, please."
 *                 startTime: 2.6
 *                 endTime: 6.5
 *             answer_key:
 *               - text: "cappuccino"
 *                 hint: "coffee drink with milk foam"
 *             display_mode: "sentence"
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
 *                     topic: "Daily Conversation - Ordering Coffee"
 *                     part_type: 2
 *                     level: "A1"
 *                     transcript: "Good morning. I'd like a cup of cappuccino, please."
 *                     audio_url: "https://cdn.example.com/audio/cappuccino.mp3"
 *                     duration: 28.5
 *                     display_mode: "sentence"
 *                     created_at: "2025-10-12T08:15:30.000Z"
 *                     updated_at: "2025-10-12T08:20:45.000Z"
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc thiếu thông tin bắt buộc
 */
router.post("/", createShadowingController);

/**
 * @openapi
 * /ctv/shadowing/{id}:
 *   put:
 *     summary: Cập nhật bài nghe chép chính tả
 *     description: Sửa thông tin một bài nghe theo ID. Các trường không gửi sẽ giữ nguyên.
 *     tags:
 *       - shadowing
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
 *             $ref: '#/components/schemas/shadowingCreateRequest'
 *           example:
 *             topic: "Daily Conversation - Ordering Coffee"
 *             part_type: 2
 *             level: "A1"
 *             transcript: "Good morning. I'd like a cup of cappuccino, please."
 *             audio_url: "https://cdn.example.com/audio/cappuccino.mp3"
 *             duration: 28.5
 *             timings:
 *               - text: "Good morning."
 *                 startTime: 0
 *                 endTime: 2.5
 *                 words:
 *                   - word: "Good"
 *                     start: 0
 *                     end: 0.4
 *                   - word: "morning"
 *                     start: 0.4
 *                     end: 1.2
 *               - text: "I'd like a cup of cappuccino, please."
 *                 startTime: 2.6
 *                 endTime: 6.5
 *                 words: []
 *             answer_key:
 *               - text: "cappuccino"
 *                 hint: "coffee drink with milk foam"
 *             display_mode: "sentence"
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
 *                 topic: "Daily Conversation - Ordering Coffee"
 *                 part_type: 2
 *                 level: "A1"
 *                 transcript: "Good morning. I'd like a cup of cappuccino, please."
 *                 audio_url: "https://cdn.example.com/audio/cappuccino.mp3"
 *                 duration: 28.5
 *                 timings:
 *                   - text: "Good morning."
 *                     startTime: 0
 *                     endTime: 2.5
 *                     words:
 *                       - word: "Good"
 *                         start: 0
 *                         end: 0.4
 *                       - word: "morning"
 *                         start: 0.4
 *                         end: 1.2
 *                   - text: "I'd like a cup of cappuccino, please."
 *                     startTime: 2.6
 *                     endTime: 6.5
 *                     words: []
 *                 answer_key:
 *                   - text: "cappuccino"
 *                     hint: "coffee drink with milk foam"
 *                 display_mode: "sentence"
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
router.put("/:id", updateShadowingController);

/**
 * @openapi
 * /ctv/shadowing/{id}:
 *   delete:
 *     summary: Xóa bài nghe chép chính tả theo ID
 *     description: Xóa bài nghe khỏi hệ thống dựa trên ID. Chỉ admin hoặc cộng tác viên có quyền mới được thao tác.
 *     tags:
 *       - shadowing
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
router.delete("/:id", deleteShadowingController);


export default router;