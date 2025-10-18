import Router from 'express';
import { verifyAccessToken } from '../../middlewares/verifyAccessToken.middleware';
import { getAllTopicTitlesController } from '../../controllers/lesson_manager.controller';

const router = Router();

/**
 * @openapi
 * /ctv/lesson-manager/titles:
 *   get:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Get all topic titles
 *     description: Retrieve a list of all topic titles available in the lesson manager.
 *     responses:
 *       200:
 *         description: A list of topic titles.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "64a7b2f4c25e4b3f9c8e4d2a"
 *                       title:
 *                         type: string
 *                         example: "Basic Grammar"
 *                 message:
 *                   type: string
 *                   example: "Fetched topic titles successfully."
 */
router.get("/titles", verifyAccessToken, getAllTopicTitlesController);

export default router;