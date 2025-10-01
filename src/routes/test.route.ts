import { Router } from "express";

import { getRecentUserTests, getUserTestHistory } from "../controllers/user-test.controller";

import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { getLatestTests, getTest, getTestDetail, getTestsWithScoreAndSearch, submitTest} from "../controllers/test.controller";

const router = Router();

// router.get("/all-tests", getAllTests);
router.get("/latest", getLatestTests);
router.get("/recent", verifyAccessToken, getRecentUserTests);
router.get("/", verifyAccessToken, getTestsWithScoreAndSearch);

router.get("/:testId", getTest);
router.get("/:testId/history", verifyAccessToken, getUserTestHistory);
router.get("/:testId/detail", verifyAccessToken, getTestDetail);
router.post("/:testId/submit", verifyAccessToken, submitTest);



export default router;
