import Router from 'express';
import { verifyAccessToken } from '../../middlewares/verifyAccessToken.middleware';
import { createLessonManagerController, deleteLessonManagerController, getAllLessonManagerController, getAllTopicTitlesController, getLessonManagerByIdController, updateLessonManagerController } from '../../controllers/lesson_manager.controller';

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

/**
 * @openapi
 * /ctv/lesson-manager:
 *   get:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Get all lesson managers with pagination
 *     description: Retrieve a paginated list of lesson managers created by the authenticated CTV user.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination (default is 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page (default is 10)
 *     responses:
 *       200:
 *         description: A paginated list of lesson managers.
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
 *                     $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Fetched lesson managers successfully."
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                   example:
 *                     page: 1
 *                     limit: 10
 *                     total: 25
 *                     totalPages: 3
 *                     hasNext: true
 *                     hasPrev: false
 */
router.get("/", verifyAccessToken, getAllLessonManagerController);

/**
 * @openapi
 * /ctv/lesson-manager/{id}:
 *   get:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Get a lesson manager by ID
 *     description: Retrieve detailed information about a specific lesson manager created by the authenticated CTV user.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the lesson manager to retrieve
 *     responses:
 *       200:
 *         description: Successfully retrieved the lesson manager.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Fetched lesson manager successfully."
 *       400:
 *         description: Invalid ID format.
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
 *                   example: "Invalid lesson manager ID format."
 *       404:
 *         description: Lesson manager not found.
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
 *                   example: "Lesson manager not found."
 *       500:
 *         description: Internal server error.
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
 *                   example: "Internal server error."
 */
router.get("/:id", verifyAccessToken, getLessonManagerByIdController);

/**
 * @openapi
 * /ctv/lesson-manager:
 *   post:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Create a new lesson manager
 *     description: Create a new lesson manager with the provided details.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LessonManager'
 *     responses:
 *       201:
 *         description: Lesson manager created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Created lesson manager successfully."
 */
router.post("/", verifyAccessToken, createLessonManagerController);


/**
 * @openapi
 * /ctv/lesson-manager/{id}:
 *   put:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Update an existing lesson manager
 *     description: Update the details of an existing lesson manager by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the lesson manager to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LessonManager'
 *     responses:
 *       200:
 *         description: Lesson manager updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/LessonManager'
 *                 message:
 *                   type: string
 *                   example: "Updated lesson manager successfully."
 */
router.put("/:id", verifyAccessToken, updateLessonManagerController);


/**
 * @openapi
 * /ctv/lesson-manager/{id}:
 *   delete:
 *     tags:
 *       - CTV Lesson Manager
 *     summary: Delete an existing lesson manager
 *     description: Delete an existing lesson manager by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the lesson manager to delete.
 *     responses:
 *       200:
 *         description: Lesson manager deleted successfully.
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
 *                   example: {}
 *                 message:
 *                   type: string
 *                   example: "Deleted lesson manager successfully."
 */
router.delete("/:id", verifyAccessToken, deleteLessonManagerController);

export default router;
