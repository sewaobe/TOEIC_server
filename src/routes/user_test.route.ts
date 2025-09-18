import { Router } from "express";

import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";
import { getTestHistoryDetail } from "../controllers/user-test.controller";

const router = Router();

router.get("/:historyId", verifyAccessToken, getTestHistoryDetail)

export default router;
