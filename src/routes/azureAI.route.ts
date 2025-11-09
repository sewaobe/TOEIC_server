import { Router } from "express";
import {
  startAzureProcessController,
  getAzureStatusController,
  cancelAzureTaskController,
} from "../controllers/azureAI.controller";

const router = Router();

/**
 * @swagger
 * /api/azure-ai/process:
 *   post:
 *     summary: Khởi tạo xử lý AI (TTS + STT với Azure Speech)
 *     tags: [Azure AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transcript:
 *                 type: string
 *                 description: Văn bản cần chuyển thành audio (TTS)
 *               audio_path:
 *                 type: string
 *                 description: URL audio cần transcribe (STT)
 *               level:
 *                 type: string
 *                 enum: [A1, A2, B1, B2, C1, C2]
 *                 default: A1
 *                 description: Độ khó TOEIC (ảnh hưởng giọng đọc TTS)
 *             example:
 *               transcript: "Welcome to our company. Please take a seat."
 *               level: "B1"
 *     responses:
 *       200:
 *         description: Khởi tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task_id:
 *                   type: string
 *                   description: ID để theo dõi tiến trình
 *                 status:
 *                   type: string
 *                   example: started
 *       400:
 *         description: Thiếu dữ liệu đầu vào
 */
router.post("/process", startAzureProcessController);

/**
 * @swagger
 * /api/azure-ai/status/{taskId}:
 *   get:
 *     summary: Lấy trạng thái và kết quả xử lý AI
 *     tags: [Azure AI]
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID nhận được từ /process
 *     responses:
 *       200:
 *         description: Trạng thái task
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [pending, running, done, failed, cancelled]
 *                 result:
 *                   type: object
 *                   properties:
 *                     transcript:
 *                       type: string
 *                       description: Văn bản đã transcribe
 *                     highlightTimings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           text:
 *                             type: string
 *                           startTime:
 *                             type: number
 *                             description: Thời gian bắt đầu (milliseconds)
 *                           endTime:
 *                             type: number
 *                             description: Thời gian kết thúc (milliseconds)
 *                     audio_path:
 *                       type: string
 *                       description: URL audio public (Cloudinary)
 *                     source:
 *                       type: string
 *                       example: azure-tts-stt
 *       404:
 *         description: Task không tồn tại
 */
router.get("/status/:taskId", getAzureStatusController);

/**
 * @swagger
 * /api/azure-ai/cancel/{taskId}:
 *   post:
 *     summary: Hủy task AI đang chạy
 *     tags: [Azure AI]
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID cần hủy
 *     responses:
 *       200:
 *         description: Task đã bị hủy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: cancelled
 *       404:
 *         description: Task không tồn tại
 */
router.post("/cancel/:taskId", cancelAzureTaskController);

export default router;
