import { Router } from "express";
import * as adminUserController from "../../controllers/admin/admin.user.controller";
import { verifyAccessToken } from "../../middlewares/verifyAccessToken.middleware";

const router = Router();

// All admin user routes require authentication; controllers perform role checks
router.get("/", verifyAccessToken, adminUserController.listUsersController);
router.get(
  "/:id",
  verifyAccessToken,
  adminUserController.getUserDetailController
);
router.post(
  "/:id/ban",
  verifyAccessToken,
  adminUserController.banUserController
);
router.post(
  "/:id/unban",
  verifyAccessToken,
  adminUserController.unbanUserController
);

export default router;
