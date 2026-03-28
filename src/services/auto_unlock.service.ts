// src/services/auto_unlock.service.ts
import { Types } from "mongoose";
import { DayStudy } from "../models/day_study.model";
import { WeekStudy } from "../models/week_study.model";
import { SessionType } from "../models/enums/SessionType";
import {
  checkUnlockCondition,
  unlockNextItem,
  unlockNextSession,
  unlockNextDay,
  unlockNextWeek,
} from "./unlock.service";
import { updateUserProgress } from "./user_progress.service";

/**
 * Auto unlock sau khi complete activity
 * Dùng chung cho tất cả: lesson, quiz, dictation, flashcard, shadowing
 */
export async function autoUnlockAfterComplete(
  userId: Types.ObjectId,
  activityId: string,
  activityType: SessionType,
  score?: number,
  dayStudyId?: string
): Promise<{
  unlocked: boolean;
  message: string;
  unlock_result?: any;
  reason?: string;
}> {
  try {
    // 1. Learning path: submit = done (không check score threshold)
    // Score chỉ để tracking, không ảnh hưởng unlock

    // 2. Tìm LearningPath active của user
    const { LearningPath } = await import("../models/learning_path.model");
    const learningPath = await LearningPath.findOne({
      user_id: userId,
      isActive: true,
    });

    if (!learningPath) {
      return {
        unlocked: false,
        message: "Không tìm thấy lộ trình học đang active",
        reason: "no_active_learning_path",
      };
    }

    // 3. Tìm DayStudy - ưu tiên day_study_id từ FE nếu có
    let dayStudy: any = null;

    if (dayStudyId) {
      // FE chỉ định day_study_id cụ thể
      dayStudy = await DayStudy.findOne({
        _id: new Types.ObjectId(dayStudyId),
        week_id: { $in: learningPath.week_study_ids },
        "sessions.items.activity_id": new Types.ObjectId(activityId),
        "sessions.items.kind": activityType,
      });
    }

    if (!dayStudy) {
      // Fallback: tìm DayStudy mới nhất
      dayStudy = await DayStudy.findOne({
        week_id: { $in: learningPath.week_study_ids },
        "sessions.items.activity_id": new Types.ObjectId(activityId),
        "sessions.items.kind": activityType,
      }).sort({ created_at: -1 });
    }

    if (!dayStudy) {
      // Không tìm thấy trong learning path → free practice
      return {
        unlocked: false,
        message: "Free practice - không cần unlock",
        reason: "not_in_learning_path",
      };
    }

    const finalDayStudyId = dayStudy._id as Types.ObjectId;

    // 4. Tìm vị trí của activity
    let sessionIndex = -1;
    let itemIndex = -1;

    for (let i = 0; i < dayStudy.sessions.length; i++) {
      const session = dayStudy.sessions[i];
      for (let j = 0; j < session.items.length; j++) {
        const item = session.items[j];
        if (
          item.activity_id?.toString() === activityId &&
          item.kind === activityType
        ) {
          sessionIndex = i;
          itemIndex = j;
          break;
        }
      }
      if (sessionIndex !== -1) break;
    }

    if (sessionIndex === -1 || itemIndex === -1) {
      return {
        unlocked: false,
        message: "Không tìm thấy activity trong lộ trình",
        reason: "activity_not_found",
      };
    }

    // 5. Unlock cascade
    const unlockResult: any = {
      item_completed: true,
      session_completed: false,
      day_completed: false,
      week_completed: false,
      day_id: finalDayStudyId.toString(),
    };

    // 5a. Unlock item tiếp theo
    const itemResult = await unlockNextItem(
      finalDayStudyId,
      sessionIndex,
      itemIndex
    );

    if (!itemResult.session_completed) {
      unlockResult.next_unlocked = {
        type: "item",
        item: itemResult.unlocked_item,
      };

      // Cập nhật UserProgress ngay sau khi complete item
      await updateUserProgressSafe(userId, finalDayStudyId);

      return {
        unlocked: true,
        message: "🎉 Item tiếp theo đã được mở khóa",
        unlock_result: unlockResult,
      };
    }

    // 5b. Session completed → unlock session tiếp
    unlockResult.session_completed = true;
    const sessionResult = await unlockNextSession(
      finalDayStudyId,
      sessionIndex
    );

    if (!sessionResult.day_completed) {
      unlockResult.next_unlocked = {
        type: "session",
        session: sessionResult.unlocked_session,
      };

      // Cập nhật UserProgress sau khi complete session
      await updateUserProgressSafe(userId, finalDayStudyId);

      return {
        unlocked: true,
        message: "🎉 Buổi học tiếp theo đã được mở khóa",
        unlock_result: unlockResult,
      };
    }

    // 5c. Day completed → unlock day tiếp
    unlockResult.day_completed = true;
    const dayResult = await unlockNextDay(finalDayStudyId, userId);

    if (!dayResult.week_completed) {
      unlockResult.next_unlocked = {
        type: "day",
        day: dayResult.unlocked_day,
      };
      unlockResult.activity_logged = true;

      // Cập nhật UserProgress
      await updateUserProgressSafe(userId, finalDayStudyId);

      return {
        unlocked: true,
        message: "🎉 Chúc mừng! Bạn đã hoàn thành ngày học",
        unlock_result: unlockResult,
      };
    }

    // 5d. Week completed → unlock week tiếp
    unlockResult.week_completed = true;
    unlockResult.activity_logged = true;

    const weekStudy = await DayStudy.findById(finalDayStudyId).select(
      "week_id"
    );
    if (weekStudy?.week_id) {
      await unlockNextWeek(weekStudy.week_id, userId);
    }

    // Cập nhật UserProgress
    await updateUserProgressSafe(userId, finalDayStudyId);

    return {
      unlocked: true,
      message: "🎉🎉 Chúc mừng! Bạn đã hoàn thành tuần học!",
      unlock_result: unlockResult,
    };
  } catch (error) {
    console.error("Error in autoUnlockAfterComplete:", error);
    return {
      unlocked: false,
      message: "Lỗi khi unlock",
      reason: "error",
    };
  }
}

/**
 * Helper: Cập nhật UserProgress an toàn (không throw error)
 */
async function updateUserProgressSafe(
  userId: Types.ObjectId,
  dayStudyId: Types.ObjectId
) {
  try {
    const dayStudy = await DayStudy.findById(dayStudyId).select("week_id");
    if (!dayStudy?.week_id) {
      return;
    }

    // Tìm LearningPath chứa week_id này
    const { LearningPath } = await import("../models/learning_path.model");
    const learningPath = await LearningPath.findOne({
      user_id: userId,
      isActive: true,
      week_study_ids: dayStudy.week_id,
    });

    if (learningPath) {
      await updateUserProgress(userId, learningPath._id as Types.ObjectId);
    }
  } catch (error) {
    console.error("Error updating UserProgress:", error);
    // Không throw để không ảnh hưởng flow chính
  }
}
