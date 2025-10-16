import express from "express";
import {
  getStudentsController,
  getStudentDetailController,
  getGroupReportsController,
} from "../../controllers/student.controller";

const router = express.Router();

// Danh sách học viên
router.get("/", getStudentsController);

// Chi tiết 1 học viên
router.get("/:id", getStudentDetailController);

// Báo cáo nhóm học viên
router.get("/reports/all", getGroupReportsController);

export default router;
