import { Router } from "express";
import {
  createPracticeTopicVocabularyController,
  getAllPracticeTopicVocabulariesController,
  getPracticeTopicVocabularyByIdController,
  updatePracticeTopicVocabularyController,
  deletePracticeTopicVocabularyController,
  addVocabularyWordToTopicController,
  removeVocabularyWordFromTopicController,
} from "../../controllers/practice_topic_vocabulary.controller";
import { verifyAccessToken as authenticateToken } from "../../middlewares/verifyAccessToken.middleware";

const router = Router();

// CRUD routes for practice topic vocabularies
router.post("/", authenticateToken, createPracticeTopicVocabularyController);
router.get("/", getAllPracticeTopicVocabulariesController);
router.get("/:id", getPracticeTopicVocabularyByIdController);
router.put("/:id", authenticateToken, updatePracticeTopicVocabularyController);
router.delete(
  "/:id",
  authenticateToken,
  deletePracticeTopicVocabularyController
);

// Add/remove vocabulary words to/from topic
router.post("/add-word", authenticateToken, addVocabularyWordToTopicController);
router.post(
  "/remove-word",
  authenticateToken,
  removeVocabularyWordFromTopicController
);

export default router;
