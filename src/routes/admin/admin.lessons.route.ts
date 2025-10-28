import { Router } from "express";
import * as adminLessonController from "../../controllers/admin/admin.lesson.controller";
import { verifyAccessToken } from "../../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/", verifyAccessToken, adminLessonController.listLessonsController);
router.get(
  "/:id",
  verifyAccessToken,
  adminLessonController.getLessonDetailController
);
router.post(
  "/:id/approve",
  verifyAccessToken,
  adminLessonController.approveLessonController
);
router.post(
  "/:id/reject",
  verifyAccessToken,
  adminLessonController.rejectLessonController
);
router.post(
  "/:id/delete",
  verifyAccessToken,
  adminLessonController.softDeleteLessonController
);

export default router;
