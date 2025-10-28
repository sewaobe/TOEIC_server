/**
 * @openapi
 * components:
 *   schemas:
 *     FlashcardLog:
 *       type: object
 *       properties:
 *         vocab_id:
 *           type: string
 *           example: "66bf123a8a9c1d7b42e20444"
 *         vocab_word:
 *           type: string
 *           example: "restaurant"
 *         eval_type:
 *           type: string
 *           enum: [easy, medium, hard, skip]
 *         response_time:
 *           type: number
 *           example: 2.8
 *         attempted_at:
 *           type: string
 *           example: "2025-10-25T12:35:10Z"
 *
 *     FlashCardProgress:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "66bf49edaae5e7b17b42e888"
 *         session_id:
 *           type: string
 *           example: "session_abc123"
 *         user_id:
 *           type: string
 *           example: "66a1bb45ce9d5b4e7b99a111"
 *         topic_vocabulary_id:
 *           type: string
 *           example: "66a2cc44aa9b2e7b42a0101"
 *         order_queue:
 *           type: array
 *           items:
 *             type: string
 *           example: ["668cfe93a9a6b2e7b42a0101", "668cfe93a9a6b2e7b42a0102"]
 *         current_index:
 *           type: number
 *           example: 5
 *         logs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FlashcardLog'
 *         last_activity:
 *           type: string
 *           example: "2025-10-25T12:35:10Z"
 *         status:
 *           type: string
 *           enum: [active, archived]
 *           example: active
 *         archive_reason:
 *           type: string
 *           enum: [completed, abandoned, expired]
 *         createdAt:
 *           type: string
 *         updatedAt:
 *           type: string
 */
