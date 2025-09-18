// src/routes/day_study.route.ts
import { Router } from "express";
import { getDayStudyByIdController } from "../controllers/day_study.controller";

const router = Router();

// GET /day-study/:id
router.get("/:id", getDayStudyByIdController);

export default router;
