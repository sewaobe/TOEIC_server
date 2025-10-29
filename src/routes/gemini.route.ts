import Router from "express";
import { generateToeicPlanController } from "../controllers/gemini.controller";

const router = Router();

/**
 * @openapi
 * /gemini/generate-toeic-plan:
 *   post:
 *     summary: Tạo kế hoạch học TOEIC cá nhân hóa
 *     description: Sinh lộ trình học TOEIC chi tiết dựa trên điểm hiện tại, mục tiêu và phong cách học của người dùng. Yêu cầu Bearer Token hợp lệ.
 *     tags:
 *       - Gemini
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ToeicPlanRequest'
 *           example:
 *             current_score: 400
 *             current_accuracy:
 *               part1: 72
 *               part2: 65
 *               part3: 58
 *               part4: 55
 *               part5: 68
 *               part6: 60
 *               part7: 56
 *             target_score: 600
 *             start_date: "2025-01-01"
 *             deadline: "2025-04-30"
 *             weekly_study_hours: 21
 *             study_days_per_week: 6
 *             learning_methods:
 *               video: "Ngữ pháp, lý thuyết, chiến lược"
 *               flashcard: "Từ vựng, collocation"
 *               dictation: "Nghe - chép chính tả"
 *     responses:
 *       200:
 *         description: Tạo kế hoạch TOEIC thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseToeicPlan'
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Thiếu hoặc sai token
 *       500:
 *         description: Lỗi hệ thống hoặc model không trả dữ liệu hợp lệ
 */
router.post("/generate-toeic-plan", generateToeicPlanController);

export default router;