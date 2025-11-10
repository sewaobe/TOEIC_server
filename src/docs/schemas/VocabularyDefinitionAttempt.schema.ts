/**
 * @openapi
 * components:
 *   schemas:
 *     VocabularyDefinitionAttempt:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "673a90d4e63c1b72e35b12ff"
 *         user_id:
 *           type: string
 *           example: "673a8f57b3d87b0e19dc92ae"
 *         vocabulary_id:
 *           type: string
 *           example: "673a8f91c83a030cccfb1302"
 *         answer:
 *           type: string
 *           example: "To move swiftly by foot"
 *         is_correct:
 *           type: boolean
 *           example: true
 *         accuracy_score:
 *           type: number
 *           example: 0.92
 *         attempt_at:
 *           type: string
 *           format: date-time
 *           example: "2025-11-09T12:45:30.000Z"
 *
 *     VocabularyDefinitionAttemptCreate:
 *       type: object
 *       required:
 *         - vocabulary_id
 *         - answer
 *         - is_correct
 *         - accuracy_score
 *       properties:
 *         vocabulary_id:
 *           type: string
 *           description: ID của từ vựng được luyện tập
 *           example: "673a8f91c83a030cccfb1302"
 *         answer:
 *           type: string
 *           description: Câu trả lời của người dùng
 *           example: "To move swiftly by foot"
 *         is_correct:
 *           type: boolean
 *           description: Kết quả đúng/sai
 *           example: true
 *         accuracy_score:
 *           type: number
 *           description: Mức độ chính xác (0 - 1)
 *           example: 0.85
 */
