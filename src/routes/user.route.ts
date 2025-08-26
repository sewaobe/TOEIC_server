// src/routes/user.route.ts
import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { verifyAccessToken  } from "../middlewares/verifyAccessToken.middleware";

const router = Router();

// Lấy user hiện tại (dùng token -> decode -> lấy userId)
router.get("/me", verifyAccessToken , userController.getCurrentUser);
router.put("/me", verifyAccessToken, userController.updateProfileController);
router.get("/:username", userController.getUserByUsernameController);

export default router;
