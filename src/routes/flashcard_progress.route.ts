import Router from "express";
import { createSessionFlashcardController, finalizeFlashcardSessionController, getAllActiveSessionsController, getFlashcardProgressController, updateSessionFlashcardController } from "../controllers/flashcard_progress.controller";

const router = Router();

router.post("/start", createSessionFlashcardController);

router.patch('/update', updateSessionFlashcardController);

router.get('/active-by-user', getAllActiveSessionsController);

router.get('/:session_id', getFlashcardProgressController);

router.post('/finalize', finalizeFlashcardSessionController);

export default router;