import Router from "express";
import { dictionaryController, generateToeicPlanController } from "../controllers/gemini.controller";

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
 *               shadowing: "Bắt chước phát âm, ngữ điệu người bản xứ"
 *               quiz: "Trắc nghiệm ngắn ôn từ và cấu trúc"
 *               mini_test: "Làm đề TOEIC ngắn, đánh giá phản xạ"
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

/**
 * @openapi
 * /gemini/dictionary:
 *   post:
 *     summary: Tra cứu từ vựng song ngữ Anh - Việt thông minh
 *     description: |
 *       Dịch và tra cứu chi tiết từ vựng Anh - Việt bằng AI.  
 *       - Nếu người dùng nhập **từ tiếng Việt**, hệ thống sẽ dịch sang tiếng Anh rồi lấy toàn bộ thông tin từ điển (định nghĩa, ví dụ, phiên âm, audio...).  
 *       - Nếu người dùng nhập **từ tiếng Anh**, hệ thống sẽ lấy trực tiếp dữ liệu từ API Dictionary và dịch nghĩa sang tiếng Việt.
 *     tags:
 *       - Gemini
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Từ hoặc cụm cần tra (có thể là tiếng Anh hoặc tiếng Việt)
 *             example:
 *               query: "quả chuối"
 *     responses:
 *       200:
 *         description: Trả về dữ liệu song ngữ từ Gemini và Dictionary API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 englishWord:
 *                   type: string
 *                   example: "banana"
 *                 phonetic:
 *                   type: string
 *                   example: "/bəˈnænə/"
 *                 phonetics:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                         example: "/bəˈnɑːnə/"
 *                       audio:
 *                         type: string
 *                         example: "https://api.dictionaryapi.dev/media/pronunciations/en/banana-uk.mp3"
 *                 translations:
 *                   type: array
 *                   description: Danh sách nghĩa được dịch sang tiếng Việt
 *                   items:
 *                     type: object
 *                     properties:
 *                       partOfSpeech:
 *                         type: string
 *                         example: "noun"
 *                       translatedDefinitions:
 *                         type: array
 *                         items:
 *                           type: string
 *                           example: "Quả chuối – loại trái cây nhiệt đới dài cong có vỏ màu vàng."
 *                       examples:
 *                         type: array
 *                         items:
 *                           type: string
 *                           example: "Khỉ rất thích ăn chuối."
 *       400:
 *         description: Thiếu hoặc sai dữ liệu đầu vào
 *       500:
 *         description: Lỗi hệ thống hoặc model không trả dữ liệu hợp lệ
 */
router.post("/dictionary", dictionaryController);


export default router;