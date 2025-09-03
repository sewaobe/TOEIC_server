import { Router } from "express";
import * as testController from "../controllers/test.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/",verifyAccessToken, testController.getTestsWithScoreAndSearch);
router.get("/:testId", testController.getTest);
router.get("/:testId/detail", verifyAccessToken,testController.getTestDetail);
router.post("/:testId/submit", verifyAccessToken, testController.submitTest);

export default router;
