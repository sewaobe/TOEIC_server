import { Router } from "express";
import * as adminTestController from "../../controllers/admin/admin.test.controller";
import { verifyAccessToken } from "../../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", verifyAccessToken, adminTestController.listTestsController);
router.get(
  "/:id",
  verifyAccessToken,
  adminTestController.getTestDetailController
);
router.post(
  "/:id/approve",
  verifyAccessToken,
  adminTestController.approveTestController
);
router.post(
  "/:id/reject",
  verifyAccessToken,
  adminTestController.rejectTestController
);
router.post(
  "/:id/delete",
  verifyAccessToken,
  adminTestController.softDeleteTestController
);

export default router;
