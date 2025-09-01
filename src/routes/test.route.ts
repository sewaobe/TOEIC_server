import { Router } from "express";
import * as testController from "../controllers/test.controller";

const router = Router();

router.get("/", testController.getTestsWithScoreAndSearch);
router.get("/:testId", testController.getTest);
router.post("/:testId/submit", testController.submitTest);

export default router;
