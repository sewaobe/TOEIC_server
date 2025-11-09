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
 *     summary: Start Azure AI processing (TTS + STT)
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
 *               audio_path:
 *                 type: string
 *               level:
 *                 type: string
 *                 enum: [A1, A2, B1, B2, C1, C2]
 *     responses:
 *       200:
 *         description: Task started
 */
router.post("/process", startAzureProcessController);

/**
 * @swagger
 * /api/azure-ai/status/{taskId}:
 *   get:
 *     summary: Get Azure AI task status
 *     tags: [Azure AI]
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task status
 */
router.get("/status/:taskId", getAzureStatusController);

/**
 * @swagger
 * /api/azure-ai/cancel/{taskId}:
 *   post:
 *     summary: Cancel Azure AI task
 *     tags: [Azure AI]
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task cancelled
 */
router.post("/cancel/:taskId", cancelAzureTaskController);

export default router;
