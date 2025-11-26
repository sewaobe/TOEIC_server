import Router from "express";
import {
  analyzeDictationController,
  analyzeShadowingController,
  dictionaryController,
  generateToeicPlanController,
  generateWeeklyPlanController,
  translateController,
} from "../controllers/gemini.controller";

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
 * /gemini/generate-weekly-plan:
 *   post:
 *     summary: Tạo lộ trình học TOEIC 1 tuần dựa trên RAG
 *     description: |
 *       Sinh lộ trình học TOEIC **1 tuần (7 ngày)** dựa trên nội dung bài học có sẵn trong database của mentor.
 *       - Sử dụng RAG (Retrieval-Augmented Generation) để lấy lesson/quiz/vocabulary/dictation/shadowing/test từ DB.
 *       - Cuối tuần có mini test.
 *       - Chỉ mở bài đầu tiên của ngày đầu tiên, còn lại lock.
 *       - Yêu cầu Bearer Token hợp lệ và user đã được gán mentor.
 *     tags:
 *       - Gemini
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_score
 *               - target_score
 *               - current_accuracy
 *               - start_date
 *               - deadline
 *               - weekly_study_hours
 *               - study_days_per_week
 *             properties:
 *               current_score:
 *                 type: number
 *                 example: 450
 *               target_score:
 *                 type: number
 *                 example: 650
 *               current_accuracy:
 *                 type: object
 *                 properties:
 *                   part1: { type: number, example: 70 }
 *                   part2: { type: number, example: 60 }
 *                   part3: { type: number, example: 50 }
 *                   part4: { type: number, example: 45 }
 *                   part5: { type: number, example: 55 }
 *                   part6: { type: number, example: 50 }
 *                   part7: { type: number, example: 48 }
 *               start_date:
 *                 type: string
 *                 example: "2025-11-27"
 *               deadline:
 *                 type: string
 *                 example: "2025-12-03"
 *               weekly_study_hours:
 *                 type: number
 *                 example: 24.5
 *               study_days_per_week:
 *                 type: number
 *                 example: 7
 *     responses:
 *       200:
 *         description: Tạo lộ trình học 1 tuần thành công
 *       400:
 *         description: User chưa được gán mentor hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi hệ thống
 */
router.post("/generate-weekly-plan", generateWeeklyPlanController);

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

/**
 * @openapi
 * /gemini/translate:
 *   post:
 *     summary: Dịch văn bản giữa hai ngôn ngữ bằng Gemini AI
 *     description: |
 *       API dịch đoạn văn hoặc câu giữa hai ngôn ngữ bằng **Gemini 2.5 Flash**.
 *       Kết quả trả về bao gồm bản dịch chính xác, tự nhiên và phần ghi chú (translationNotes) giúp người dùng hiểu rõ các sắc thái hoặc cụm từ cần chú ý.
 *     tags:
 *       - Gemini
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - sourceLang
 *               - targetLang
 *             properties:
 *               text:
 *                 type: string
 *                 description: "Đoạn văn hoặc cụm từ cần dịch"
 *               sourceLang:
 *                 type: string
 *                 description: "Mã ngôn ngữ gốc (ví dụ: en, vi, ja, fr)"
 *               targetLang:
 *                 type: string
 *                 description: "Mã ngôn ngữ đích (ví dụ: vi, en, ko, de)"
 *             example:
 *               text: "Consistency is the key to mastering any skill."
 *               sourceLang: "en"
 *               targetLang: "vi"
 *     responses:
 *       200:
 *         description: Dịch thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sourceLang:
 *                   type: string
 *                   example: "en"
 *                 targetLang:
 *                   type: string
 *                   example: "vi"
 *                 originalText:
 *                   type: string
 *                   example: "Consistency is the key to mastering any skill."
 *                 translatedText:
 *                   type: string
 *                   example: "Sự kiên định là chìa khóa để thành thạo bất kỳ kỹ năng nào."
 *                 translationNotes:
 *                   type: string
 *                   example: |
 *                     "Consistency" mang ý nghĩa duy trì đều đặn và kiên trì, không chỉ là sự lặp lại máy móc.
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       500:
 *         description: Lỗi hệ thống hoặc model không phản hồi hợp lệ
 */
router.post("/translate", translateController);

/**
 * @openapi
 * /gemini/dictation-analysis:
 *   post:
 *     summary: Phân tích bài luyện Dictation bằng Gemini AI
 *     description: |
 *       Gửi danh sách kết quả luyện nghe – chép chính tả (DictationAttemptLogs) để Gemini phân tích điểm mạnh, điểm yếu, lỗi phổ biến và gợi ý cải thiện.
 *       - Model sử dụng: **Gemini 2.5 Flash / Flash-Lite**
 *       - Phản hồi ở dạng JSON có cấu trúc rõ ràng.
 *     tags:
 *       - Gemini
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - logs
 *               - dictation
 *             properties:
 *               dictation:
 *                 type: object
 *                 description: Thông tin bài luyện Dictation
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "671f1c9343a28cce7c4a5a2b"
 *                   title:
 *                     type: string
 *                     example: "People walking in the park"
 *                   level:
 *                     type: string
 *                     example: "Intermediate"
 *               logs:
 *                 type: array
 *                 description: Danh sách kết quả từng câu học viên đã làm
 *                 items:
 *                   type: object
 *                   properties:
 *                     index:
 *                       type: integer
 *                       example: 2
 *                     accuracy:
 *                       type: number
 *                       example: 85
 *                     answers:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *                       example: { "3": "some", "5": "bags" }
 *                     mistakes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["bags."]
 *                     duration:
 *                       type: number
 *                       example: 8
 *                     started_at:
 *                       type: string
 *                       example: "2025-11-02T05:41:26.073Z"
 *                     finished_at:
 *                       type: string
 *                       example: "2025-11-02T05:41:31.757Z"
 *     responses:
 *       200:
 *         description: Phân tích thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: string
 *                   example: "Bạn đã có sự tập trung cao và nhận diện âm khá chính xác ở hầu hết câu."
 *                 strengths:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "Nhận diện âm tốt ở câu ngắn"
 *                     - "Khả năng bắt trọng âm chính xác"
 *                     - "Thời gian phản ứng nhanh"
 *                 weaknesses:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "Dễ sai ở từ có âm /s/ và /ed/"
 *                     - "Thiếu tập trung ở câu dài"
 *                     - "Chưa chú ý ngữ điệu cuối câu"
 *                 improvement_tips:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "Nghe lại đoạn sai, lặp lại từ khó"
 *                     - "Luyện shadowing mỗi ngày 10 phút"
 *                     - "Tập trung vào âm cuối /t/, /d/"
 *                 recommended_focus:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "Cấu trúc thì hiện tại hoàn thành"
 *                     - "Phân biệt âm /s/ và /z/"
 *                     - "Từ nối (however, although, while)"
 *       400:
 *         description: Thiếu hoặc sai dữ liệu đầu vào
 *       500:
 *         description: Lỗi hệ thống hoặc model không phản hồi hợp lệ
 */
router.post("/dictation-analysis", analyzeDictationController);

/**
 * @openapi
 * /gemini/shadowing-analysis:
 *   post:
 *     summary: Phân tích và chấm điểm bài luyện Shadowing từng câu bằng Gemini AI
 *     description: |
 *       API chấm **mỗi đoạn (timing)** của bài Shadowing ngay sau khi người học nói xong.
 *       - Nhận vào 2 URL Cloudinary (bản **user nói** và bản **native gốc**)
 *       - Gọi Flask WhisperX để nhận transcript cho cả hai audio
 *       - Gửi transcript và thời lượng vào Gemini để chấm điểm chi tiết theo các tiêu chí:
 *         **similarity, pronunciation, accuracy, fluency, intonation, feedback**
 *
 *       > ⚡ Phân tích ngay sau mỗi đoạn, giúp phản hồi tức thời cho người học.
 *     tags:
 *       - Gemini
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_audio_url
 *               - native_audio_url
 *               - shadowing
 *             properties:
 *               user_audio_url:
 *                 type: string
 *                 description: URL Cloudinary của bản ghi người học nói
 *                 example: "https://res.cloudinary.com/demo/video/upload/user_segment_1.mp3"
 *               native_audio_url:
 *                 type: string
 *                 description: URL Cloudinary của audio gốc (native speaker)
 *                 example: "https://res.cloudinary.com/demo/video/upload/native_segment_1.mp3"
 *               level:
 *                 type: string
 *                 description: CEFR level của bài học (A1–C2)
 *                 example: "A2"
 *               segmentIndex:
 *                 type: integer
 *                 description: Thứ tự đoạn trong bài Shadowing
 *                 example: 0
 *               shadowing:
 *                 type: object
 *                 description: Thông tin bài Shadowing hiện tại
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: "672b34f8e19293a1c2b45a8f"
 *                   title:
 *                     type: string
 *                     example: "Lesson 12 – Job Interview"
 *                   level:
 *                     type: string
 *                     example: "A2"
 *     responses:
 *       200:
 *         description: Phân tích thành công từng đoạn Shadowing
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
 *                   example: "✅ Segment 0 analyzed!"
 *                 data:
 *                   type: object
 *                   properties:
 *                     model:
 *                       type: string
 *                       example: "gemini-2.5-flash"
 *                     json:
 *                       type: object
 *                       properties:
 *                         transcript_native:
 *                           type: string
 *                           example: "I will call you tomorrow morning."
 *                         transcript_user:
 *                           type: string
 *                           example: "I will call you to morrow morning"
 *                         similarity_score:
 *                           type: number
 *                           example: 0.91
 *                         accuracy_score:
 *                           type: number
 *                           example: 0.87
 *                         fluency_score:
 *                           type: number
 *                           example: 0.84
 *                         intonation_score:
 *                           type: number
 *                           example: 0.89
 *                         pronunciation_feedback:
 *                           type: object
 *                           properties:
 *                             mispronounced:
 *                               type: array
 *                               items:
 *                                 type: string
 *                               example: ["tomorrow"]
 *                             missing_words:
 *                               type: array
 *                               items:
 *                                 type: string
 *                               example: []
 *                             extra_words:
 *                               type: array
 *                               items:
 *                                 type: string
 *                               example: ["to"]
 *                             word_scores:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   word:
 *                                     type: string
 *                                   score:
 *                                     type: number
 *                               example:
 *                                 - { "word": "I", "score": 1 }
 *                                 - { "word": "will", "score": 1 }
 *                                 - { "word": "call", "score": 1 }
 *                                 - { "word": "you", "score": 1 }
 *                                 - { "word": "tomorrow", "score": 0.7 }
 *                                 - { "word": "morning", "score": 1 }
 *                         comments:
 *                           type: string
 *                           example: "Phát âm tốt, chỉ sai nhẹ ở từ 'tomorrow'."
 *                         suggestions:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example:
 *                             - "Luyện nối âm giữa 'call' và 'you'."
 *                             - "Chú ý nhịp nói đều hơn ở cuối câu."
 *       400:
 *         description: Thiếu dữ liệu hoặc URL audio không hợp lệ
 *       500:
 *         description: Lỗi hệ thống hoặc Gemini không phản hồi hợp lệ
 */
router.post("/shadowing-analysis", analyzeShadowingController);

export default router;
