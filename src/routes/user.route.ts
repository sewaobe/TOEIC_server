// src/routes/user.route.ts
import { Router } from "express";
import { getCurrentUser } from "../controllers/user.controller";
import { verifyAccessToken  } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

// Lấy user hiện tại (dùng token -> decode -> lấy userId)
router.get("/me", verifyAccessToken , getCurrentUser);

export default router;
