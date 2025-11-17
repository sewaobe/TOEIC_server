/**
 * @openapi
 * components:
 *   schemas:
 *     UserNote:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "671ab10df8f8d0a23b6a7b14"
 *         user_id:
 *           type: string
 *           example: "671ab10df8f8d0a23b6a7b15"
 *         title:
 *           type: string
 *           example: "Part 3 - Vocabulary"
 *         content:
 *           type: string
 *           example: "This is my study note for Part 3"
 *         related_url:
 *           type: string
 *           nullable: true
 *           example: "https://example.com/study/part3"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T11:45:00Z"
 *       required:
 *         - user_id
 *         - title
 *         - content
 *
 *     CreateNoteRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: "Part 3 - Vocabulary"
 *         content:
 *           type: string
 *           example: "This is my study note for Part 3"
 *         related_url:
 *           type: string
 *           nullable: true
 *           example: "https://example.com/study/part3"
 *       required:
 *         - title
 *         - content
 *
 *     UpdateNoteRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: "Updated title"
 *         content:
 *           type: string
 *           example: "Updated study note content"
 *         related_url:
 *           type: string
 *           nullable: true
 *           example: "https://example.com/study/part3"
 *       required:
 *         - title
 *         - content
 */
