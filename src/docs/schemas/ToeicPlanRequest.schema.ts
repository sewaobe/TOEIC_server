/**
 * @openapi
 * components:
 *   schemas:
 *     ToeicPlanRequest:
 *       type: object
 *       required:
 *         - current_score
 *         - target_score
 *         - deadline
 *       properties:
 *         current_score:
 *           type: integer
 *           example: 400
 *         target_score:
 *           type: integer
 *           example: 600
 *         start_date:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         deadline:
 *           type: string
 *           format: date
 *           example: "2025-04-30"
 *         weekly_study_hours:
 *           type: integer
 *           example: 21
 *         study_days_per_week:
 *           type: integer
 *           example: 6
 *         learning_methods:
 *           type: object
 *           description: Phong cách học ưa thích cho từng kỹ năng
 *           properties:
 *             video:
 *               type: string
 *               example: "Ngữ pháp, lý thuyết, chiến lược"
 *             flashcard:
 *               type: string
 *               example: "Từ vựng, collocation"
 *             dictation:
 *               type: string
 *               example: "Nghe - chép chính tả"
 *             shadowing:
 *               type: string
 *               example: "Bắt chước phát âm, ngữ điệu người bản xứ"
 *             quiz:
 *               type: string
 *               example: "Trắc nghiệm ngắn ôn từ và cấu trúc"
 *             mini_test:
 *               type: string
 *               example: "Làm đề TOEIC ngắn, đánh giá phản xạ"
 *
 *     ApiResponseToeicPlan:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Tạo kế hoạch TOEIC thành công!"
 *         data:
 *           type: object
 *           description: JSON kế hoạch hoặc text thô nếu model trả không hợp lệ
 */
