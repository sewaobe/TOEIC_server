import { Router } from "express";
import { getFlashCardById } from "../controllers/flashCard.controller";

const router = Router();

// GET /flash-card/:id
router.get("/:id", getFlashCardById);

export default router;
