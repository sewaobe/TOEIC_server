import Router from "express";
import {
  getAllPracticeDefinitionTopicsController,
  getPracticeDefinitionTopicByIdController,
  getVocabularyWordsByTopicController,
  getRandomVocabularyWordsController,
  evaluateDefinitionController,
} from "../controllers/practice_definition.controller";

/**
 * @openapi
 * /practice-definition/topics:
 *   get:
 *     summary: Lấy danh sách topics cho Definition practice
 *     description: Lấy danh sách PracticeTopicVocabulary với phân trang và filter
 *     tags:
 *       - Practice Definition
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [A1, A2, B1, B2, C1, C2]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: created_by
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @openapi
 * /practice-definition/topics/{topicId}:
 *   get:
 *     summary: Lấy chi tiết 1 topic
 *     tags:
 *       - Practice Definition
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Topic không tồn tại
 */

/**
 * @openapi
 * /practice-definition/topics/{topicId}/words:
 *   get:
 *     summary: Lấy danh sách vocabulary words của topic
 *     tags:
 *       - Practice Definition
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @openapi
 * /practice-definition/topics/{topicId}/words/random:
 *   get:
 *     summary: Lấy random words để luyện tập
 *     tags:
 *       - Practice Definition
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Thành công
 */

const router = Router();

router.get("/topics", getAllPracticeDefinitionTopicsController);
router.get("/topics/:topicId", getPracticeDefinitionTopicByIdController);
router.get("/topics/:topicId/words", getVocabularyWordsByTopicController);
router.get("/topics/:topicId/words/random", getRandomVocabularyWordsController);
router.post("/evaluate-definition", evaluateDefinitionController);

export default router;
