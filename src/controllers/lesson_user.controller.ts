// src/controllers/lesson_user.controller.ts
import { Request, Response, NextFunction } from "express";
import { getLessonDetail } from "../services/lesson.service";
import { ApiResponse } from "../utils/ApiResponse";

/**
 * Lấy chi tiết lesson cho user
 */
export const getLessonForUserController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const lesson = await getLessonDetail(id);

    return res
      .status(200)
      .json(ApiResponse.success(lesson, "Lấy bài học thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Complete lesson (chỉ track thời gian, không tạo attempt)
 */
export const completeLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: lessonId } = req.params;
    const { started_at, finished_at } = req.body;

    const duration = Math.floor(
      (new Date(finished_at).getTime() - new Date(started_at).getTime()) / 1000
    );

    // Lesson không tạo attempt, chỉ track thời gian
    // Không cập nhật streak vì lesson không có điểm

    return res.status(200).json(
      ApiResponse.success(
        {
          completed: true,
          lesson_id: lessonId,
          duration,
        },
        "Hoàn thành bài học"
      )
    );
  } catch (error) {
    next(error);
  }
};
