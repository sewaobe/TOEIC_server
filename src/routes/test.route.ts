import { Router } from "express";

import {
  getRecentUserTests,
  getUserTestHistory,
} from "../controllers/user-test.controller";

import { verifyAccessToken, verifyAccessTokenForSubmitTest } from "../middlewares/verifyAccessToken.middleware";
import {
  getLatestTests,
  getTest,
  getTestDetail,
  getTestsWithScoreAndSearch,
  submitTest,
} from "../controllers/test.controller";

const router = Router();

// router.get("/all-tests", getAllTests);
router.get("/latest", getLatestTests);
router.get("/recent", verifyAccessToken, getRecentUserTests);

/**
 * @openapi
 * /tests:
 *   get:
 *     summary: Tìm kiếm đề thi kèm điểm của người dùng
 *     description: |
 *       API trả về danh sách đề thi của người dùng hiện tại (đọc từ access token),
 *       hỗ trợ tìm kiếm theo từ khóa và phân trang.
 *     tags:
 *       - Tests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Trang hiện tại (bắt đầu từ 1). Mặc định là 1.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 6
 *         description: Số lượng đề thi trên mỗi trang. Mặc định là 6.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm (có thể bỏ trống).
 *       - in: query
 *         name: keywords
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm (ưu tiên dùng cho FE mới).
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: Lọc theo năm/cụm năm trong tiêu đề đề thi (ví dụ 2023).
 *     responses:
 *       200:
 *         description: Tìm kiếm đề thi thành công
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
 *                   example: Tìm kiếm đề thi thành công
 *                 data:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 6
 *                     totalPages:
 *                       type: integer
 *                       example: 12
 *                     totalTests:
 *                       type: integer
 *                       example: 72
 *                     tests:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: 66ff0a2c1a2b3c4d5e6f7a81
 *                           title:
 *                             type: string
 *                             example: "Reading Practice Test 01"
 *                           userScore:
 *                             type: number
 *                             example: 78
 *                           maxScore:
 *                             type: number
 *                             example: 100
 *                           totalQuestions:
 *                             type: integer
 *                             example: 100
 *                           correctCount:
 *                             type: integer
 *                             example: 78
 *                           attemptedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-10-10T09:30:00.000Z"
 *       400:
 *         description: Từ khóa tìm kiếm không được để trống
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
 *                   example: "Từ khóa tìm kiếm không được để trống!"
 *       401:
 *         description: Không có quyền truy cập hoặc token không hợp lệ
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
 *                   example: "Bạn không có quyền thực hiện chức năng tìm kiếm đề thi!"
 *       500:
 *         description: Lỗi phía server
 */
router.get("/", verifyAccessToken, getTestsWithScoreAndSearch);

router.get("/:testId", getTest);
router.get("/:testId/history", verifyAccessToken, getUserTestHistory);
router.get("/:testId/detail", verifyAccessToken, getTestDetail);
router.post("/:testId/submit", verifyAccessTokenForSubmitTest, submitTest);

export default router;
