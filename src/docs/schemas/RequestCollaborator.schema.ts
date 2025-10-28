/**
 * @openapi
 * components:
 *   schemas:
 *     RequestCollaborator:
 *       type: object
 *       required:
 *         - fullName
 *         - email
 *         - experience
 *         - motivation
 *         - availability
 *         - cv_url
 *       properties:
 *         _id:
 *           type: string
 *           example: 671f9de7b1a4f88c54fcb512
 *         user_id:
 *           type: string
 *           example: 671f9d3a8e0d26bb4235ea42
 *         fullName:
 *           type: string
 *           example: "Nguyễn Minh Học"
 *         email:
 *           type: string
 *           format: email
 *           example: "hoc.nguyen@example.com"
 *         experience:
 *           type: string
 *           example: "1-2 năm"
 *         expertise:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Listening", "Reading"]
 *         motivation:
 *           type: string
 *           example: "Tôi yêu thích giảng dạy và muốn đóng góp cho cộng đồng học TOEIC."
 *         availability:
 *           type: string
 *           enum: [part-time, full-time, flexible]
 *           example: part-time
 *         cv_url:
 *           type: string
 *           format: uri
 *           example: "https://res.cloudinary.com/demo/cv_nguyenminhhoc.pdf"
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *           example: pending
 *         rejection_reason:
 *           type: string
 *           example: "Chưa đủ kinh nghiệm yêu cầu."
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-28T10:15:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-28T10:15:00.000Z"
 */