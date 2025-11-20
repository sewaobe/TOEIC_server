import { Router } from "express";
import {
  createVocabularyWordController,
  getAllVocabularyWordsController,
  getVocabularyWordByIdController,
  updateVocabularyWordController,
  deleteVocabularyWordController,
} from "../controllers/vocabulary_word.controller";
import { verifyAccessToken as authenticateToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

// CRUD routes for vocabulary words
router.post("/", authenticateToken, createVocabularyWordController);
router.get("/", getAllVocabularyWordsController);
router.get("/:id", getVocabularyWordByIdController);
router.put("/:id", authenticateToken, updateVocabularyWordController);
router.delete("/:id", authenticateToken, deleteVocabularyWordController);

export default router;
