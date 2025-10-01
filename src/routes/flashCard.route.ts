import { Router } from "express";
import { getFlashCardById, getHistoryFlashCardByTopic, submitFlashCard,  } from "../controllers/flashCard.controller";

const router = Router();

// GET /flash-card/
router.get("/history/:topicId", getHistoryFlashCardByTopic)
router.get("/:id", getFlashCardById);
router.post("/submit", submitFlashCard)

export default router;
