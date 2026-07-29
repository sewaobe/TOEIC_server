// src/controllers/day_study.controller.ts
import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { getDayStudyByIdService } from "../services/day_study.service";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import {
  checkUnlockCondition,
  getScoreFromAttempt,
  unlockNextItem,
  unlockNextSession,
  unlockNextDay,
  unlockNextWeek,
} from "../services/unlock.service";
import { updateUserProgress } from "../services/user_progress.service";
import { DayStudy } from "../models/day_study.model";
import { WeekStudy } from "../models/week_study.model";
import { LearningPath } from "../models/learning_path.model";

export const getDayStudyByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const dayStudy = await getDayStudyByIdService(id);

    return res
      .status(200)
      .json(ApiResponse.success(dayStudy, "Lấy ngày học thành công"));
  } catch (error: any) {
    next(error);
  }
};

/**
 * Complete activity & unlock
 * POST /api/day-study/:dayId/complete-activity
 */
export const completeActivityController = async (
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

    const { dayId } = req.params;
    const { session_no, item_index, activity_type, attempt_id } = req.body;
    const userId = new Types.ObjectId(req.user._id);
    let completedActivityScore: number | null = null;

    // 1. Lấy DayStudy
    const dayStudy = await DayStudy.findById(dayId);
    if (!dayStudy) {
      return res
        .status(404)
        .json(ApiResponse.success(null, "Không tìm thấy ngày học"));
    }

    const session = dayStudy.sessions[session_no];
    const item = session?.items[item_index];

    if (!session || !item) {
      return res
        .status(404)
        .json(ApiResponse.success(null, "Không tìm thấy activity"));
    }

    // 2. Nếu có attempt_id và không phải Lesson → check điểm
    if (attempt_id && activity_type !== SessionType.LESSON) {
      const attemptObjectId = new Types.ObjectId(attempt_id);
      const score = await getScoreFromAttempt(attemptObjectId, activity_type);
      completedActivityScore = score;

      if (score === null) {
        return res.status(400).json(
          ApiResponse.success(null, "Không tìm thấy attempt", {
            success: false,
          })
        );
      }

      // Check unlock condition
      const canUnlock = checkUnlockCondition(activity_type, score);

      if (!canUnlock) {
        return res.status(200).json(
          ApiResponse.success(
            {
              passed: false,
              score,
              required_score: 80,
              can_retry: true,
            },
            "Cần đạt >= 80% để mở bài tiếp theo. Bạn có thể thử lại!"
          )
        );
      }
    }

    // 3. PASS → Unlock cascade

    // 3a. Unlock item tiếp
    const itemResult = await unlockNextItem(
      new Types.ObjectId(dayId),
      session_no,
      item_index,
      {
        userId,
        score: completedActivityScore,
        attemptId: attempt_id,
      }
    );

    if (!itemResult.session_completed) {
      return res.status(200).json(
        ApiResponse.success(
          {
            item_completed: true,
            next_unlocked: {
              type: "item",
              item: itemResult.unlocked_item,
            },
          },
          "Đã mở bài tiếp theo"
        )
      );
    }

    // 3b. Session completed → unlock session tiếp
    const sessionResult = await unlockNextSession(
      new Types.ObjectId(dayId),
      session_no
    );

    if (!sessionResult.day_completed) {
      return res.status(200).json(
        ApiResponse.success(
          {
            session_completed: true,
            next_unlocked: {
              type: "session",
              session: sessionResult.unlocked_session,
            },
          },
          "Đã hoàn thành buổi học, mở buổi tiếp theo"
        )
      );
    }

    // 3c. Day completed → unlock ngày tiếp
    const dayResult = await unlockNextDay(new Types.ObjectId(dayId), userId);

    if (!dayResult.week_completed) {
      // Cập nhật UserProgress sau khi hoàn thành ngày
      try {
        const dayStudy = await DayStudy.findById(dayId).populate({
          path: "week_id",
          populate: { path: "learning_path_id" },
        });
        if (dayStudy?.week_id && (dayStudy.week_id as any).learning_path_id) {
          const learningPathId = (dayStudy.week_id as any).learning_path_id._id;
          await updateUserProgress(userId, learningPathId);
        }
      } catch (progressError) {
        console.error("Lỗi khi cập nhật UserProgress:", progressError);
        // Không throw error để không ảnh hưởng flow chính
      }

      return res.status(200).json(
        ApiResponse.success(
          {
            day_completed: true,
            next_unlocked: {
              type: "day",
              day: dayResult.unlocked_day,
            },
            activity_logged: true,
          },
          "🎉 Chúc mừng! Bạn đã hoàn thành ngày học"
        )
      );
    }

    // 3d. Week completed → unlock tuần tiếp
    const weekStudy = await DayStudy.findById(dayId).select("week_id");
    if (weekStudy?.week_id) {
      await unlockNextWeek(weekStudy.week_id, userId);
    }

    // Cập nhật UserProgress sau khi hoàn thành tuần
    try {
      const dayStudy = await DayStudy.findById(dayId).populate({
        path: "week_id",
        populate: { path: "learning_path_id" },
      });
      if (dayStudy?.week_id && (dayStudy.week_id as any).learning_path_id) {
        const learningPathId = (dayStudy.week_id as any).learning_path_id._id;
        await updateUserProgress(userId, learningPathId);
      }
    } catch (progressError) {
      console.error("Lỗi khi cập nhật UserProgress:", progressError);
    }

    return res.status(200).json(
      ApiResponse.success(
        {
          week_completed: true,
          activity_logged: true,
        },
        "🎉🎉 Chúc mừng! Bạn đã hoàn thành tuần học!"
      )
    );
  } catch (error) {
    next(error);
  }
};
