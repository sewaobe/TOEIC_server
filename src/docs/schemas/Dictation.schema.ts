/**
 * @openapi
 * components:
 *   schemas:
 *     Word:
 *       type: object
 *       properties:
 *         word:
 *           type: string
 *           example: "office"
 *         start:
 *           type: number
 *           example: 1.23
 *         end:
 *           type: number
 *           example: 1.85
 *       required:
 *         - word
 *         - start
 *         - end
 *
 *     Segment:
 *       type: object
 *       properties:
 *         text:
 *           type: string
 *           example: "Hello everyone, welcome to the meeting."
 *         startTime:
 *           type: number
 *           example: 0.0
 *         endTime:
 *           type: number
 *           example: 5.2
 *         words:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Word'
 *       required:
 *         - text
 *         - startTime
 *         - endTime
 *
 *     Dictation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "671ab10df8f8d0a23b6a7b14"
 *         topic:
 *           type: array
 *           description: Danh sách ID của LessonManager liên quan
 *           items:
 *             type: string
 *             example: "671aa91df8f8d0a23b6a7b10"
 *         title:
 *           type: string
 *           example: "Office Communication Practice"
 *         part_type:
 *           type: integer
 *           description: Phần thi (Part 1–7)
 *           enum: [1, 2, 3, 4, 5, 6, 7]
 *           example: 3
 *         level:
 *           type: string
 *           description: Trình độ theo chuẩn CEFR
 *           enum: [A1, A2, B1, B2, C1, C2]
 *           example: "A2"
 *         status:
 *           type: string
 *           description: Trạng thái kiểm duyệt
 *           enum: ["draft", "pending", "approved", "rejected"]
 *           example: "approved"
 *         transcript:
 *           type: string
 *           description: Toàn bộ nội dung văn bản nghe
 *           example: "Hello everyone, welcome to the meeting. Please take your seats."
 *         audio_url:
 *           type: string
 *           format: uri
 *           example: "https://cdn.example.com/audio/office-meeting.mp3"
 *         duration:
 *           type: number
 *           description: Thời lượng file audio (tính bằng giây)
 *           example: 125.6
 *         timings:
 *           type: array
 *           description: Danh sách các đoạn transcript và thời gian tương ứng
 *           items:
 *             $ref: '#/components/schemas/Segment'
 *         display_mode:
 *           type: string
 *           enum: ["sentence", "word"]
 *           description: Kiểu hiển thị bài nghe (theo câu hoặc theo từ)
 *           example: "sentence"
 *         weight:
 *           type: number
 *           description: Trọng số dùng cho thuật toán gợi ý bài học
 *           example: 0.5
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-20T08:30:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-20T09:00:00.000Z"
 *       required:
 *         - topic
 *         - title
 *         - level
 *         - transcript
 *         - timings
 *         - display_mode
 *         - status
 */
