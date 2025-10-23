import { Router } from "express";
import {
  createTopicOfCollaborator,
  getAllTopicOfCollaborator,
  updateTopicOfCollaborator,
  deleteTopicOfCollaborator
} from "../../controllers/topic.controller";
import { getVocabulariesByTopic } from "../../controllers/vocabulary.controller";

const router = Router();

/**
 * @openapi
 * /ctv/topics:
 *   get:
 *     summary: Lấy danh sách chủ đề từ vựng của cộng tác viên
 *     description: Trả về danh sách các chủ đề từ vựng được tạo bởi cộng tác viên, có hỗ trợ phân trang.
 *     tags:
 *       - Topic Vocabulary
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Số trang hiện tại (mặc định là 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 6
 *         description: Số lượng chủ đề trên mỗi trang (mặc định là 6)
 *     responses:
 *       200:
 *         description: Lấy danh sách chủ đề thành công
 *         content:
 *           application/json:
 *             example:
 *               status: "success"
 *               message: "Lấy danh sách chủ đề từ vựng thành công"
 *               data:
 *                 currentPage: 1
 *                 totalPages: 3
 *                 totalItems: 15
 *                 items:
 *                   - _id: "6717a4b2e9f2a3c9bde91f11"
 *                     title: "Chủ đề: Du lịch"
 *                     description: "Tổng hợp các từ vựng phổ biến về du lịch"
 *                     tags: ["travel", "holiday", "airport"]
 *                     level: "B1"
 *                     iconName: "flight_takeoff"
 *                     bgColor: "#FFDD00"
 *                     gradient: "linear-gradient(90deg, #FFDD00, #FFA500)"
 *                     vocabularies_id: ["6717a4b2e9f2a3c9bde91f21"]
 *                     isCollaborator: true
 *                     isPublic: true
 *                     created_by: "6717a4b2e9f2a3c9bde91f01"
 *                     created_at: "2025-10-21T08:30:00.000Z"
 *                     updated_at: "2025-10-22T09:00:00.000Z"
 *       401:
 *         description: Không có quyền truy cập hoặc chưa đăng nhập
 *       500:
 *         description: Lỗi máy chủ nội bộ
 */
router.get('/', getAllTopicOfCollaborator);

/**
 * @openapi
 * /ctv/topics:
 *   post:
 *     summary: Tạo chủ đề từ vựng mới
 *     description: Cho phép cộng tác viên tạo chủ đề mới gồm tiêu đề, mô tả, thẻ và cấp độ CEFR.
 *     tags:
 *       - Topic Vocabulary
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             title: "Chủ đề: Môi trường"
 *             description: "Từ vựng liên quan đến bảo vệ môi trường"
 *             tags: ["environment", "pollution", "climate"]
 *             iconName: "eco"
 *             bgColor: "#00FF99"
 *             gradient: "linear-gradient(90deg, #00FF99, #00CC66)"
 *             level: "B2"
 *             topic: ["6717a4b2e9f2a3c9bde91f01"]
 *     responses:
 *       201:
 *         description: Tạo chủ đề mới thành công
 *         content:
 *           application/json:
 *             example:
 *               status: "success"
 *               message: "Tạo chủ đề mới thành công"
 *               data:
 *                 _id: "6717a4b2e9f2a3c9bde91f50"
 *                 title: "Chủ đề: Môi trường"
 *                 description: "Từ vựng liên quan đến bảo vệ môi trường"
 *                 tags: ["environment", "pollution", "climate"]
 *                 level: "B2"
 *                 iconName: "eco"
 *                 bgColor: "#00FF99"
 *                 gradient: "linear-gradient(90deg, #00FF99, #00CC66)"
 *                 created_by: "6717a4b2e9f2a3c9bde91f01"
 *                 created_at: "2025-10-22T08:00:00.000Z"
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ nội bộ
 */
router.post("/", createTopicOfCollaborator);

/**
 * @openapi
 * /ctv/topics/{topicId}:
 *   get:
 *     summary: Lấy danh sách từ vựng theo chủ đề
 *     description: Trả về danh sách các từ vựng thuộc chủ đề được chỉ định.
 *     tags:
 *       - Topic Vocabulary
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của chủ đề cần lấy từ vựng
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Số lượng từ vựng mỗi trang
 *     responses:
 *       200:
 *         description: Lấy danh sách từ vựng thành công
 *         content:
 *           application/json:
 *             example:
 *               status: "success"
 *               message: "Lấy danh sách từ vựng thành công"
 *               data:
 *                 topicId: "6717a4b2e9f2a3c9bde91f11"
 *                 totalWords: 120
 *                 items:
 *                   - _id: "6717a4b2e9f2a3c9bde91f99"
 *                     word: "pollution"
 *                     definition: "The presence of harmful substances in the environment"
 *                     example: "Air pollution is a serious problem in big cities."
 *       404:
 *         description: Không tìm thấy chủ đề
 *       500:
 *         description: Lỗi máy chủ nội bộ
 */
router.get("/:topicId", getVocabulariesByTopic);

/**
 * @openapi
 * /ctv/topics/{id}:
 *   put:
 *     summary: Cập nhật thông tin chủ đề từ vựng
 *     description: Cho phép cộng tác viên cập nhật tiêu đề, mô tả, thẻ, màu sắc, cấp độ, v.v.
 *     tags:
 *       - Topic Vocabulary
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của chủ đề cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             title: "Chủ đề: Môi trường xanh"
 *             description: "Từ vựng cập nhật về bảo vệ môi trường"
 *             tags: ["environment", "green", "recycle"]
 *             iconName: "eco"
 *             bgColor: "#00FF66"
 *             gradient: "linear-gradient(90deg, #00FF66, #00CC33)"
 *             level: "C1"
 *     responses:
 *       200:
 *         description: Cập nhật chủ đề thành công
 *         content:
 *           application/json:
 *             example:
 *               status: "success"
 *               message: "Cập nhật chủ đề thành công"
 *               data:
 *                 _id: "6717a4b2e9f2a3c9bde91f11"
 *                 title: "Chủ đề: Môi trường xanh"
 *                 description: "Từ vựng cập nhật về bảo vệ môi trường"
 *                 tags: ["environment", "green", "recycle"]
 *                 level: "C1"
 *                 updated_at: "2025-10-22T09:00:00.000Z"
 *       404:
 *         description: Không tìm thấy chủ đề để cập nhật
 *       500:
 *         description: Lỗi máy chủ nội bộ
 */
router.put("/:id", updateTopicOfCollaborator);

/**
 * @openapi
 * /ctv/topics/{id}:
 *   delete:
 *     summary: Xóa chủ đề từ vựng
 *     description: Xóa một chủ đề do cộng tác viên tạo ra.
 *     tags:
 *       - Topic Vocabulary
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của chủ đề cần xóa
 *     responses:
 *       200:
 *         description: Xóa chủ đề thành công
 *         content:
 *           application/json:
 *             example:
 *               status: "success"
 *               message: "Xóa chủ đề thành công"
 *       404:
 *         description: Không tìm thấy chủ đề để xóa
 *       500:
 *         description: Lỗi máy chủ nội bộ
 */
router.delete("/:id", deleteTopicOfCollaborator);

export default router;
