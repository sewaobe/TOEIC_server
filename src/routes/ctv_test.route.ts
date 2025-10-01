import { Router } from "express";
import {
  getAllTests,
  getTest,
  createTest,
} from "../controllers/test.controller";

const router = Router();

// Lấy danh sách đề thi
router.get("/tests/get-all", getAllTests);

// ✅ Thêm mới 1 đề thi
router.post("/tests/create", createTest);

// Lấy 1 đề thi chi tiết
router.get("/tests/:testId", getTest);

export default router;
