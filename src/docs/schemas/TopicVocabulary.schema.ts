/**
 * @openapi
 * components:
 *   schemas:
 *     TopicVocabulary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "6717a4b2e9f2a3c9bde91f11"
 *         topic:
 *           type: array
 *           items:
 *             type: string
 *             example: "6717a4b2e9f2a3c9bde91f10"
 *           description: Danh sách ID của LessonManager liên quan
 *         title:
 *           type: string
 *           example: "Chủ đề: Du lịch"
 *           description: Tên chủ đề từ vựng
 *         description:
 *           type: string
 *           example: "Tổng hợp các từ vựng phổ biến về du lịch"
 *           description: Mô tả ngắn gọn về chủ đề
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           example: ["travel", "holiday", "airport"]
 *           description: Danh sách thẻ mô tả chủ đề
 *         level:
 *           type: string
 *           enum: ["A1", "A2", "B1", "B2", "C1", "C2"]
 *           example: "B1"
 *           description: Mức độ khó của chủ đề theo khung CERF
 *         iconName:
 *           type: string
 *           example: "flight_takeoff"
 *           description: Tên icon hiển thị của chủ đề
 *         bgColor:
 *           type: string
 *           example: "#FFDD00"
 *           description: Mã màu nền của chủ đề
 *         gradient:
 *           type: string
 *           example: "linear-gradient(90deg, #FFDD00, #FFA500)"
 *           description: Màu gradient nền của chủ đề
 *         vocabularies_id:
 *           type: array
 *           items:
 *             type: string
 *             example: "6717a4b2e9f2a3c9bde91f20"
 *           description: Danh sách ID từ vựng thuộc chủ đề
 *         isCollaborator:
 *           type: boolean
 *           example: true
 *           description: Đánh dấu chủ đề do cộng tác viên tạo
 *         isPublic:
 *           type: boolean
 *           example: true
 *           description: Trạng thái công khai của chủ đề
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-22T09:30:00.000Z"
 *           description: Thời gian tạo
 *         created_by:
 *           type: string
 *           example: "6717a4b2e9f2a3c9bde91f01"
 *           description: ID của người tạo (User)
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-22T09:45:00.000Z"
 *           description: Thời gian cập nhật gần nhất
 */
