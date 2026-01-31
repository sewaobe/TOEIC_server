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
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const userId = new Types.ObjectId(req.user._id);
    const activityId = new Types.ObjectId(req.params.id);

    // FE có thể gửi day_study_id để xác định chính xác DayStudy cần check
    const dayStudyIdFromQuery = req.query.day_study_id as string | undefined;

    // Tự động detect activity type từ route path
    // Dùng originalUrl hoặc baseUrl để lấy full path
    let activityType: SessionType;
    const fullPath = (req.originalUrl || req.baseUrl || req.path).toLowerCase();

    console.log("🔍 Debug checkUnlock - fullPath:", fullPath);
    if (dayStudyIdFromQuery) {
      console.log("🔍 Using day_study_id from query:", dayStudyIdFromQuery);
    }

    if (fullPath.includes("lesson")) {
      activityType = SessionType.LESSON;
    } else if (fullPath.includes("quiz")) {
      activityType = SessionType.QUIZ;
    } else if (fullPath.includes("dictation")) {
      activityType = SessionType.DICTATION;
    } else if (
      fullPath.includes("flashcard") ||
      fullPath.includes("flash-card")
    ) {
      activityType = SessionType.FLASH_CARD;
    } else if (fullPath.includes("shadowing")) {
      activityType = SessionType.SHADOWING;
    } else if (fullPath.includes("test") || fullPath.includes("mini-test")) {
      activityType = SessionType.MINI_TEST;
    } else {
      // Fallback: check query parameter
      const typeFromQuery = req.query.type as SessionType;
      if (!typeFromQuery) {
        console.error("❌ Cannot detect activity type:", {
          originalUrl: req.originalUrl,
          baseUrl: req.baseUrl,
          path: req.path,
        });
        return res.status(400).json(
          ApiResponse.success(null, "Không xác định được loại activity", {
            error: "Cannot detect activity type from path",
            debug: {
              originalUrl: req.originalUrl,
              baseUrl: req.baseUrl,
              path: req.path,
            },
          })
        );
      }
      activityType = typeFromQuery;
    }

    console.log("✅ Detected activity type:", activityType);

    // Tìm item trong DayStudy
    const item = await findItemInDayStudy(
      userId,
      activityId,
      activityType,
      dayStudyIdFromQuery
    );

    if (!item) {
      // Nếu không tìm thấy trong lộ trình → có thể là bài luyện tập tự do
      // Cho phép truy cập
      console.log(
        "ℹ️ Item not found in learning path - allowing free practice"
      );
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
    console.log("✅ Activity unlocked - status:", item.status);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Helper: Tìm item trong DayStudy
 * @param dayStudyId - Optional: ID cụ thể của DayStudy (từ FE)
 */
async function findItemInDayStudy(
  userId: Types.ObjectId,
  activityId: Types.ObjectId,
  activityType: SessionType,
  dayStudyId?: string
) {
  // Import LearningPath để filter theo user
  const { LearningPath } = await import("../models/learning_path.model");

  // 1. Tìm LearningPath active của user
  const learningPath = await LearningPath.findOne({
    user_id: userId,
    isActive: true,
  });

  if (!learningPath) {
    console.log("ℹ️ No active learning path for user");
    return null;
  }

  let dayStudy: any = null;

  // 2a. Nếu FE gửi day_study_id cụ thể → tìm chính xác DayStudy đó
  if (dayStudyId) {
    dayStudy = await DayStudy.findOne({
      _id: new Types.ObjectId(dayStudyId),
      week_id: { $in: learningPath.week_study_ids },
      "sessions.items.activity_id": activityId,
    });

    if (dayStudy) {
      console.log("✅ Found DayStudy by explicit ID:", {
        _id: dayStudy._id,
        dayOfWeek: dayStudy.dayOfWeek,
        status: dayStudy.status,
      });
    } else {
      console.log("⚠️ DayStudy with specified ID not found:", dayStudyId);
    }
  }

  // 2b. Nếu không có day_study_id hoặc không tìm thấy → tìm theo priority
  if (!dayStudy) {
    // Tìm tất cả DayStudy chứa activity này
    const allDayStudies = await DayStudy.find({
      week_id: { $in: learningPath.week_study_ids },
      "sessions.items.activity_id": activityId,
    }).sort({ created_at: -1 });

    if (allDayStudies.length === 0) {
      console.log("❌ No DayStudy found for activityId:", activityId);
      return null;
    }

    // Ưu tiên DayStudy có status != 'lock' (in_progress hoặc completed)
    dayStudy =
      allDayStudies.find((ds) => ds.status !== WeekStudyStatus.LOCK) ||
      allDayStudies[0];

    console.log("📋 Found DayStudy (prioritized non-lock):", {
      _id: dayStudy._id,
      dayOfWeek: dayStudy.dayOfWeek,
      status: dayStudy.status,
      total_found: allDayStudies.length,
    });
  }

  // 3. Tìm item cụ thể
  for (const session of dayStudy.sessions) {
    for (const item of session.items) {
      if (
        item.activity_id?.toString() === activityId.toString() &&
        item.kind === activityType
      ) {
        console.log("🎯 Found matching item:", {
          activity_id: item.activity_id,
          kind: item.kind,
          status: item.status,
          session_no: session.session_no,
        });
        return item;
      }
    }
  }

  console.log("❌ Item not found in DayStudy sessions");
  return null;
}
