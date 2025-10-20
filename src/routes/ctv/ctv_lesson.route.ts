import express from "express";
import {
  createLessonController,
  getLessonsController,
  getLessonDetailController,
  updateLessonWithSectionsController,
  deleteLessonController,
  updateLessonBasicController, // ✅ thêm
} from "../../controllers/lesson.controller";

const router = express.Router();

router.get("/", getLessonsController);
router.post("/", createLessonController);
router.get("/:id", getLessonDetailController);
router.put("/:id/sections", updateLessonWithSectionsController); // 🟩 cập nhật sections
router.put("/:id/basic", updateLessonBasicController); // 🟨 cập nhật thông tin cơ bản
router.delete("/:id", deleteLessonController);

export default router;
