// src/controllers/lesson_user.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { getLessonDetail } from "../services/lesson.service";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";

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
 * Complete lesson - TỰ ĐỘNG UNLOCK
 */
export const completeLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const { id: lessonId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { time_spent, day_study_id } = req.body;

    // Validate day_study_id (bắt buộc để xác định ngày học)
    if (!day_study_id) {
      return res.status(400).json(ApiResponse.fail("day_study_id là bắt buộc"));
    }

    // Auto unlock
    const unlockResult = await autoUnlockAfterComplete(
      userId,
      lessonId,
      SessionType.LESSON,
      100, // Lesson luôn pass
      day_study_id
    );

    return res.status(200).json(
      ApiResponse.success(
        {
          completed: true,
          lesson_id: lessonId,
          duration: time_spent,
          ...unlockResult.unlock_result,
        },
        unlockResult.message
      )
    );
  } catch (error) {
    next(error);
  }
};
