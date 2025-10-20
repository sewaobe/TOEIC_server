/**
 * @openapi
 * components:
 *   schemas:
 *     ShadowingWord:
 *       type: object
 *       properties:
 *         word:
 *           type: string
 *           example: "meeting"
 *         start:
 *           type: number
 *           example: 1.45
 *         end:
 *           type: number
 *           example: 1.90
 *       required:
 *         - word
 *         - start
 *         - end
 *
 *     ShadowingSegment:
 *       type: object
 *       properties:
 *         text:
 *           type: string
 *           example: "Let's start the meeting now."
 *         startTime:
 *           type: number
 *           example: 0.0
 *         endTime:
 *           type: number
 *           example: 3.2
 *         words:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ShadowingWord'
 *       required:
 *         - text
 *         - startTime
 *         - endTime
 *
 *     Shadowing:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "671ac1bdf8f8d0a23b6a7b44"
 *         topic:
 *           type: array
 *           description: Danh sách ID của LessonManager liên quan
 *           items:
 *             type: string
 *             example: "671aa91df8f8d0a23b6a7b10"
 *         title:
 *           type: string
 *           example: "Office Meeting Practice"
 *         part_type:
 *           type: integer
 *           enum: [1, 2, 3, 4, 5, 6, 7]
 *           description: Phần thi TOEIC tương ứng
 *           example: 3
 *         level:
 *           type: string
 *           enum: [A1, A2, B1, B2, C1, C2]
 *           description: Trình độ người học theo CEFR
 *           example: "B1"
 *         status:
 *           type: string
 *           enum: ["draft", "pending", "approved", "rejected"]
 *           description: Trạng thái duyệt bài luyện nói
 *           example: "approved"
 *         transcript:
 *           type: string
 *           description: Toàn bộ văn bản transcript của video luyện nói
 *           example: "Let's start the meeting now. Please share your updates."
 *         audio_url:
 *           type: string
 *           format: uri
 *           description: URL file video hoặc audio của bài luyện nói
 *           example: "https://cdn.example.com/audio/office-meeting.mp3"
 *         duration:
 *           type: number
 *           description: Thời lượng video/audio tính bằng giây
 *           example: 120.5
 *         timings:
 *           type: array
 *           description: Danh sách các đoạn hội thoại kèm thời gian bắt đầu/kết thúc
 *           items:
 *             $ref: '#/components/schemas/ShadowingSegment'
 *         display_mode:
 *           type: string
 *           enum: ["sentence", "word"]
 *           description: Chế độ hiển thị (theo câu hoặc theo từ)
 *           example: "sentence"
 *         weight:
 *           type: number
 *           description: Trọng số của bài luyện nói trong hệ thống
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
 *         - part_type
 *         - level
 *         - status
 *         - transcript
 *         - timings
 *         - display_mode
 */
