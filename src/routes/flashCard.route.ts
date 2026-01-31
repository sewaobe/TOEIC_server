import { Router } from "express";
import {
  getFlashCardById,
  getHistoryFlashCardByTopic,
  submitFlashCard,
  submitFlashCardGame,
} from "../controllers/flashCard.controller";

const router = Router();

// GET /flash-card/
router.get("/history/:topicId", getHistoryFlashCardByTopic);
router.get("/:id", getFlashCardById);
router.post("/submit", submitFlashCard);
router.post("/submit-game", submitFlashCardGame);

export default router;
