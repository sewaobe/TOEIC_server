import { Router } from "express";
import * as testController from "../controllers/test.controller";
import { getRecentUserTests } from "../controllers/user-test.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", testController.getTestsWithScoreAndSearch);
router.get("/latest", testController.getLatestTests);
router.get("/recent", verifyAccessToken, getRecentUserTests);
router.get("/:testId", testController.getTest);
router.post("/:testId/submit", testController.submitTest);

export default router;
