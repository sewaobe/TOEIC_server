import { Router } from "express";
import {
  getShadowingV2DetailController,
  getShadowingV2ListController,
  getShadowingV2ProgressByIdsController,
} from "../controllers/shadowing_v2.controller";
import { verifyAccessToken } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", getShadowingV2ListController);
router.post("/progress", verifyAccessToken, getShadowingV2ProgressByIdsController);
router.get("/:id", getShadowingV2DetailController);

export default router;
