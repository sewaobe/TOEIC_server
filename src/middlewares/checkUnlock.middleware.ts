// src/middlewares/checkUnlock.middleware.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { DayStudy } from "../models/day_study.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { SessionType } from "../models/enums/SessionType";
import { ApiResponse } from "../utils/ApiResponse";

/**
 * Middleware kiểm tra activity đã unlock chưa
 * Dùng cho các route GET content: lessons, quiz, flashcard, dictation
 */
export async function checkUnlock(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const activityId = new Types.ObjectId(req.params.id);
    const activityType = req.query.type as SessionType;

    if (!activityType) {
      return res.status(400).json(
        ApiResponse.success(null, "Thiếu query parameter 'type'", {
          error: "Missing type",
        })
      );
    }

    // Tìm item trong DayStudy
    const item = await findItemInDayStudy(userId, activityId, activityType);

    if (!item) {
      // Nếu không tìm thấy trong lộ trình → có thể là bài luyện tập tự do
      // Cho phép truy cập
      return next();
    }

    // Check status
    if (item.status === WeekStudyStatus.LOCK) {
      return res.status(403).json(
        ApiResponse.success(
          {
            locked: true,
            message: "Bài học chưa mở khóa. Vui lòng hoàn thành bài trước đó.",
          },
          "Bài học chưa mở khóa"
        )
      );
    }

    // Status = IN_PROGRESS hoặc COMPLETED → OK
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Helper: Tìm item trong DayStudy
 */
async function findItemInDayStudy(
  userId: Types.ObjectId,
  activityId: Types.ObjectId,
  activityType: SessionType
) {
  // Tìm DayStudy có chứa activity_id này
  const dayStudy = await DayStudy.findOne({
    "sessions.items.activity_id": activityId,
  });

  if (!dayStudy) return null;

  // Tìm item cụ thể
  for (const session of dayStudy.sessions) {
    for (const item of session.items) {
      if (
        item.activity_id?.toString() === activityId.toString() &&
        item.kind === activityType
      ) {
        return item;
      }
    }
  }

  return null;
}
