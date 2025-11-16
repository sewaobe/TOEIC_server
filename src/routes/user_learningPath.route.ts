import { Router } from "express";
import {
  getUserLearningPath,
  createLearningPath,
  getLearningProgress,
  getWeekDetail,
  getDayDetail,
  getWeekStats,
  getCumulativeStats,
} from "../controllers/user_learningPath.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

/**
 * @openapi
 * /learning-path:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy lộ trình học hiện tại của user
 *     description: |
 *       Trả về thông tin chi tiết lộ trình học đang active của người dùng hiện tại,
 *       bao gồm danh sách tuần học (weeks) và ngày học (days) đã được populate.
 *     responses:
 *       200:
 *         description: Lấy lộ trình học thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "673abc123def456789012345"
 *                     title:
 *                       type: string
 *                       example: "Lộ trình TOEIC (AI)"
 *                     description:
 *                       type: string
 *                       example: "Lộ trình học TOEIC được tạo tự động bởi AI"
 *                     level:
 *                       type: string
 *                       example: "B1"
 *                     target_score:
 *                       type: number
 *                       example: 650
 *                     current_week:
 *                       type: number
 *                       example: 1
 *                     week_study_ids:
 *                       type: array
 *                       items:
 *                         type: object
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *                   example: "Lấy lộ trình học của người dùng thành công"
 *       401:
 *         description: Không tìm thấy token hoặc token không hợp lệ.
 *       404:
 *         description: Không tìm thấy lộ trình học nào.
 */
router.get("/", verifyAccessToken, getUserLearningPath);

/**
 * @openapi
 * /learning-path:
 *   post:
 *     tags:
 *       - Learning Path
 *     summary: Tạo lộ trình học mới từ draft payload
 *     description: |
 *       Tạo lộ trình học mới cho người dùng dựa trên các tham số đầu vào.
 *       Hệ thống sẽ gọi AI (Gemini) để sinh kế hoạch học, sau đó tạo LearningPath,
 *       WeekStudy, và DayStudy tương ứng trong database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - methods
 *               - targetScore
 *               - endDate
 *               - weeklyTotals
 *               - weeklyPlan
 *             properties:
 *               methods:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["flashcard", "quiz", "shadowing", "dictation"]
 *                 description: Các phương pháp học được chọn
 *               targetScore:
 *                 type: number
 *                 example: 650
 *                 description: Điểm TOEIC mục tiêu
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-12-31T00:00:00.000Z"
 *                 description: Ngày dự kiến hoàn thành
 *               weeklyTotals:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [90, 90, 90, 90]
 *                 description: Tổng số phút học mỗi tuần
 *               weeklyPlan:
 *                 type: object
 *                 additionalProperties:
 *                   type: number
 *                 example:
 *                   flashcard: 20
 *                   quiz: 30
 *                   shadowing: 20
 *                   dictation: 20
 *                 description: Phân bổ thời gian cho từng phương pháp (phút)
 *     responses:
 *       201:
 *         description: Tạo lộ trình học thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Thông tin lộ trình học vừa tạo
 *                 message:
 *                   type: string
 *                   example: "Tạo lộ trình học thành công"
 *       401:
 *         description: Không tìm thấy token hoặc token không hợp lệ.
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ.
 */
router.post("/", verifyAccessToken, createLearningPath);

/**
 * @openapi
 * /learning-path/progress:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy tiến độ học tập tổng quan
 *     description: |
 *       Trả về thông tin tổng quan về tiến độ học tập của user, bao gồm:
 *       - Overview: số bài đã hoàn thành, tỷ lệ hoàn thành, thời gian học, streak, điểm hiện tại/mục tiêu
 *       - Danh sách tuần học với progress, accuracy, status từng tuần
 *       - Tuần hiện tại đang học
 *     responses:
 *       200:
 *         description: Lấy tiến độ học tập thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                       properties:
 *                         completed_lessons:
 *                           type: number
 *                           example: 5
 *                         total_lessons:
 *                           type: number
 *                           example: 50
 *                         completion_rate:
 *                           type: number
 *                           example: 10
 *                         total_study_time:
 *                           type: number
 *                           example: 300
 *                         streak_days:
 *                           type: number
 *                           example: 3
 *                         current_score:
 *                           type: number
 *                           example: 450
 *                         target_score:
 *                           type: number
 *                           example: 650
 *                     weeks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           week_no:
 *                             type: number
 *                           status:
 *                             type: string
 *                             enum: [lock, in_progress, completed, deleted]
 *                           progress:
 *                             type: number
 *                             description: Phần trăm hoàn thành (0-100)
 *                           accuracy:
 *                             type: number
 *                             description: Độ chính xác trung bình (0-100)
 *                           started_at:
 *                             type: string
 *                             format: date-time
 *                           ended_at:
 *                             type: string
 *                             format: date-time
 *                           is_current:
 *                             type: boolean
 *                           days:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 _id:
 *                                   type: string
 *                                 dayOfWeek:
 *                                   type: number
 *                                 status:
 *                                   type: string
 *                     current_week:
 *                       type: number
 *                       example: 1
 *                 message:
 *                   type: string
 *                   example: "Lấy tiến độ học tập thành công"
 *       401:
 *         description: Không tìm thấy token hoặc token không hợp lệ.
 *       404:
 *         description: Không tìm thấy lộ trình học.
 */
router.get("/progress", verifyAccessToken, getLearningProgress);

/**
 * @openapi
 * /learning-path/week/{weekId}:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy chi tiết 1 tuần học
 *     description: |
 *       Trả về thông tin chi tiết của 1 tuần học, bao gồm:
 *       - Thông tin tuần: week_no, description, status, accuracy
 *       - Danh sách 7 ngày trong tuần với sessions và completion status của từng item
 *     parameters:
 *       - in: path
 *         name: weekId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tuần học (ObjectId)
 *         example: "673abc123def456789012345"
 *     responses:
 *       200:
 *         description: Lấy chi tiết tuần học thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     week_no:
 *                       type: number
 *                       example: 1
 *                     description:
 *                       type: string
 *                       example: "Tuần 1"
 *                     status:
 *                       type: string
 *                       enum: [lock, in_progress, completed, deleted]
 *                       example: "in_progress"
 *                     accuracy:
 *                       type: number
 *                       example: 78.5
 *                     days:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           dayOfWeek:
 *                             type: number
 *                             example: 1
 *                             description: "0=Chủ nhật, 1=Thứ 2, ..., 6=Thứ 7"
 *                           status:
 *                             type: string
 *                           accuracy:
 *                             type: number
 *                           progress:
 *                             type: number
 *                           sessions:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 session_no:
 *                                   type: number
 *                                 status:
 *                                   type: string
 *                                 part_type:
 *                                   type: number
 *                                   nullable: true
 *                                 items:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       kind:
 *                                         type: string
 *                                       activity_id:
 *                                         type: string
 *                                       status:
 *                                         type: string
 *                                       completed:
 *                                         type: boolean
 *                 message:
 *                   type: string
 *                   example: "Lấy chi tiết tuần học thành công"
 *       400:
 *         description: Thiếu weekId trong params.
 *       401:
 *         description: Không tìm thấy token hoặc token không hợp lệ.
 *       404:
 *         description: Không tìm thấy tuần học.
 */
router.get("/week/:weekId", verifyAccessToken, getWeekDetail);

/**
 * @openapi
 * /learning-path/day/{dayId}:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy chi tiết 1 ngày học
 *     description: |
 *       Trả về thông tin chi tiết của 1 ngày học, bao gồm:
 *       - Danh sách sessions được plan trong ngày (từ DayStudy)
 *       - Từng session gồm: session_no, status, part_type, và items (activities)
 *       - Mỗi item sẽ có completion status (đã hoàn thành chưa)
 *       - Metrics: thời gian học thực tế/kế hoạch, hiệu suất học tập
 *     parameters:
 *       - in: path
 *         name: dayId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của ngày học (ObjectId)
 *         example: "673abc123def456789012345"
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: (Không dùng trong logic hiện tại - để tương thích)
 *         example: "2025-11-16"
 *     responses:
 *       200:
 *         description: Lấy chi tiết ngày học thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     day_of_week:
 *                       type: number
 *                       example: 1
 *                       description: "0=Chủ nhật, 1=Thứ 2, ..., 6=Thứ 7"
 *                     status:
 *                       type: string
 *                       enum: [lock, in_progress, completed, deleted]
 *                       example: "in_progress"
 *                     accuracy:
 *                       type: number
 *                       example: 80
 *                     sessions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           session_no:
 *                             type: number
 *                             example: 1
 *                           status:
 *                             type: string
 *                             enum: [lock, in_progress, completed, deleted]
 *                             example: "completed"
 *                           part_type:
 *                             type: number
 *                             nullable: true
 *                             example: 1
 *                             description: "Part TOEIC (1-7) hoặc null nếu không thuộc part cụ thể"
 *                           items:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 kind:
 *                                   type: string
 *                                   enum: [flashcard, dictation, quiz, shadowing, lesson, mini_test]
 *                                   example: "flashcard"
 *                                 activity_id:
 *                                   type: string
 *                                   nullable: true
 *                                   example: "673xyz456abc789012345678"
 *                                 status:
 *                                   type: string
 *                                   enum: [lock, in_progress, completed, deleted]
 *                                   example: "completed"
 *                                 completed:
 *                                   type: boolean
 *                                   example: true
 *                                   description: "Đã hoàn thành activity này chưa (check từ attempts)"
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         dayMinutesActual:
 *                           type: number
 *                           example: 60
 *                           description: "Thời gian học thực tế (phút)"
 *                         dayMinutesPlanned:
 *                           type: number
 *                           example: 90
 *                           description: "Thời gian học kế hoạch (phút)"
 *                         dailyEfficiency:
 *                           type: number
 *                           example: 67
 *                           description: "Hiệu suất học tập (%)"
 *                 message:
 *                   type: string
 *                   example: "Lấy chi tiết ngày học thành công"
 *       400:
 *         description: Thiếu dayId trong params.
 *       401:
 *         description: Không tìm thấy token hoặc token không hợp lệ.
 *       404:
 *         description: Không tìm thấy ngày học.
 */
router.get("/day/:dayId", verifyAccessToken, getDayDetail);

/**
 * @openapi
 * /learning-path/week/{weekId}/stats:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy thống kê tuần học
 *     description: |
 *       Trả về thống kê thời gian học trong 1 tuần, bao gồm:
 *       - Tổng thời gian học thực tế/kế hoạch của tuần
 *       - Mảng thời gian học thực tế/kế hoạch cho từng ngày trong tuần (7 ngày)
 *     parameters:
 *       - in: path
 *         name: weekId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tuần học (ObjectId)
 *         example: "673abc123def456789012345"
 *     responses:
 *       200:
 *         description: Lấy thống kê tuần thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     week_no:
 *                       type: number
 *                       example: 1
 *                     weekActual:
 *                       type: number
 *                       description: Tổng phút học thực tế trong tuần
 *                       example: 450
 *                     weekPlanned:
 *                       type: number
 *                       description: Tổng phút kế hoạch trong tuần
 *                       example: 630
 *                     weeklyActualPerDay:
 *                       type: array
 *                       items:
 *                         type: number
 *                       description: Phút học thực tế từng ngày (7 ngày)
 *                       example: [90, 60, 90, 90, 60, 30, 30]
 *                     weeklyPlannedPerDay:
 *                       type: array
 *                       items:
 *                         type: number
 *                       description: Phút kế hoạch từng ngày (7 ngày)
 *                       example: [90, 90, 90, 90, 90, 60, 60]
 *                 message:
 *                   type: string
 *                   example: "Lấy thống kê tuần thành công"
 *       400:
 *         description: Thiếu weekId trong params.
 *       401:
 *         description: Không tìm thấy token hoặc token không hợp lệ.
 *       404:
 *         description: Không tìm thấy tuần học.
 */
router.get("/week/:weekId/stats", verifyAccessToken, getWeekStats);

/**
 * @openapi
 * /learning-path/cumulative-stats:
 *   get:
 *     tags:
 *       - Learning Path
 *     summary: Lấy dữ liệu tích lũy (cumulative stats)
 *     description: |
 *       Trả về dữ liệu tích lũy theo tuần để vẽ biểu đồ progress, bao gồm:
 *       - Mảng giờ học kế hoạch tích lũy (cumulativePlanned)
 *       - Mảng giờ học thực tế tích lũy (cumulativeActual)
 *
 *       Mỗi phần tử trong mảng tương ứng với 1 tuần học.
 *     responses:
 *       200:
 *         description: Lấy dữ liệu tích lũy thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     cumulativePlanned:
 *                       type: array
 *                       items:
 *                         type: number
 *                       description: Giờ kế hoạch tích lũy theo tuần
 *                       example: [6.5, 13, 19.5, 26]
 *                     cumulativeActual:
 *                       type: array
 *                       items:
 *                         type: number
 *                       description: Giờ thực tế tích lũy theo tuần
 *                       example: [6, 12, 15, 15]
 *                 message:
 *                   type: string
 *                   example: "Lấy dữ liệu tích lũy thành công"
 *       401:
 *         description: Không tìm thấy token hoặc token không hợp lệ.
 *       404:
 *         description: Không tìm thấy lộ trình học.
 */
router.get("/cumulative-stats", verifyAccessToken, getCumulativeStats);

export default router;
