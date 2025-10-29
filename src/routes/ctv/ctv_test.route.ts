import { Router } from "express";
import {
  getAllTests,
  getTest,
  createTestController,
  updateTest, // ✅ thêm controller
  deleteTest,
  updateTestStatusController,
} from "../../controllers/test.controller";
import { verifyAccessToken } from "../../middlewares/verifyAccessToken.middleware";

const router = Router();

router.get("/tests/get-all", verifyAccessToken, getAllTests);
router.post("/tests/create", verifyAccessToken, createTestController);
router.get("/tests/:testId", verifyAccessToken, getTest);

// Sửa đề thi
router.put("/tests/:testId/status", verifyAccessToken, updateTestStatusController);
router.put("/tests/:testId", verifyAccessToken, updateTest);

// Xóa đề thi
router.delete("/tests/:testId", verifyAccessToken, deleteTest);

export default router;
