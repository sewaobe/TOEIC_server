import { Router } from "express";
import {
  getShadowingV2DetailController,
  getShadowingV2ListController,
} from "../controllers/shadowing_v2.controller";

const router = Router();

router.get("/", getShadowingV2ListController);
router.get("/:id", getShadowingV2DetailController);

export default router;
