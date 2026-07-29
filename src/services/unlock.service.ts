// src/services/unlock.service.ts
import { Types } from "mongoose";
import { DayStudy } from "../models/day_study.model";
import { WeekStudy } from "../models/week_study.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { SessionType } from "../models/enums/SessionType";
import { UserActivity } from "../models/user_activity.model";
import {
  QuizAttempt,
  DictationAttempt,
  FlashCardAttempt,
  ShadowingAttempt,
} from "../models";
import { logLearningActivityCompleted as createLearningActivityCompletedLog } from "./learning_activity_log.service";

type UnlockNextItemContext = {
  userId?: Types.ObjectId;
  score?: number | null;
  attemptId?: string | Types.ObjectId | null;
};

/**
 * Check unlock condition
 * Current rule: auto pass on submit (no score threshold).
 */
export function checkUnlockCondition(
  activityType: SessionType,
  score?: number
): boolean {
  // New rule: once the learner submits, mark as pass and allow unlock.
  return true;
}

/**
 * Lấy điểm từ attempt
 */
export async function getScoreFromAttempt(
  attemptId: Types.ObjectId,
  activityType: SessionType
): Promise<number | null> {
  try {
    let attempt: any;

    switch (activityType) {
      case SessionType.QUIZ:
        attempt = await QuizAttempt.findById(attemptId);
        return attempt?.score || 0;

      case SessionType.DICTATION:
        attempt = await DictationAttempt.findById(attemptId);
        return attempt?.accuracy || 0;

      case SessionType.FLASH_CARD:
        attempt = await FlashCardAttempt.findById(attemptId);
        return attempt?.accuracy || 0;

      case SessionType.SHADOWING:
        attempt = await ShadowingAttempt.findById(attemptId);
        return attempt?.similarity_score || 0;

      default:
        return null;
    }
  } catch (error) {
    console.error("Error getting score from attempt:", error);
    return null;
  }
}

/**
 * Unlock item tiếp theo trong session
 */
export async function unlockNextItem(
  dayStudyId: Types.ObjectId,
  sessionIndex: number,
  itemIndex: number,
  context?: UnlockNextItemContext
) {
  const dayStudy = await DayStudy.findById(dayStudyId);
  if (!dayStudy) throw new Error("DayStudy not found");

  const session = dayStudy.sessions[sessionIndex];
  if (!session) throw new Error("Session not found");

  // 1. Đánh dấu item hiện tại = COMPLETED
  session.items[itemIndex].status = WeekStudyStatus.COMPLETED;

  // 2. Check còn item nào không
  if (itemIndex + 1 < session.items.length) {
    const nextItem = session.items[itemIndex + 1];
    // Chỉ unlock nếu đang LOCK, không động vào COMPLETED hoặc IN_PROGRESS
    if (nextItem.status === WeekStudyStatus.LOCK) {
      nextItem.status = WeekStudyStatus.IN_PROGRESS;
    }

    await dayStudy.save();

    // Refetch để lấy dữ liệu chính xác từ DB
    const updatedDayStudy = await DayStudy.findById(dayStudyId);
    if (!updatedDayStudy) throw new Error("DayStudy not found after save");

    return {
      unlocked_item:
        updatedDayStudy.sessions[sessionIndex].items[itemIndex + 1],
      session_completed: false,
    };
  }

  // 3. Hết items → đánh dấu session completed
  session.status = WeekStudyStatus.COMPLETED;

  await dayStudy.save();
  await createLearningActivityCompletedLog({
    dayStudy,
    sessionIndex,
    userId: context?.userId,
    score: context?.score,
    attemptId: context?.attemptId,
  });

  return { session_completed: true };
}

/**
 * Unlock session tiếp theo trong ngày
 */
export async function unlockNextSession(
  dayStudyId: Types.ObjectId,
  sessionIndex: number
) {
  const dayStudy = await DayStudy.findById(dayStudyId);
  if (!dayStudy) throw new Error("DayStudy not found");

  // Check còn session tiếp không
  if (sessionIndex + 1 < dayStudy.sessions.length) {
    const nextSession = dayStudy.sessions[sessionIndex + 1];

    // Chỉ unlock session nếu đang LOCK
    if (nextSession.status === WeekStudyStatus.LOCK) {
      nextSession.status = WeekStudyStatus.IN_PROGRESS;

      // Unlock item đầu tiên của session mới nếu đang LOCK
      if (
        nextSession.items.length > 0 &&
        nextSession.items[0].status === WeekStudyStatus.LOCK
      ) {
        nextSession.items[0].status = WeekStudyStatus.IN_PROGRESS;
      }
    }

    await dayStudy.save();

    // Refetch để lấy dữ liệu chính xác từ DB
    const updatedDayStudy = await DayStudy.findById(dayStudyId);
    if (!updatedDayStudy) throw new Error("DayStudy not found after save");

    return {
      unlocked_session: updatedDayStudy.sessions[sessionIndex + 1],
      day_completed: false,
    };
  }

  // Hết sessions → ngày hoàn thành
  return { day_completed: true };
}

/**
 * Unlock ngày tiếp theo trong tuần
 * + LOG UserActivity: DAY_STUDY_COMPLETED
 */
export async function unlockNextDay(
  dayStudyId: Types.ObjectId,
  userId: Types.ObjectId
) {
  const currentDay = await DayStudy.findById(dayStudyId);
  if (!currentDay) throw new Error("DayStudy not found");

  // 1. Đánh dấu ngày hiện tại = COMPLETED
  currentDay.status = WeekStudyStatus.COMPLETED;
  await currentDay.save();

  // 2. Tính stats ngày học
  const totalActivities = currentDay.sessions.reduce(
    (sum, s) => sum + s.items.length,
    0
  );
  const avgAccuracy = currentDay.accuracy_overall || 0;

  // 3. LOG UserActivity: DAY_STUDY_COMPLETED
  await UserActivity.create({
    user_id: userId,
    type: "DAY_STUDY_COMPLETED",
    title: `Hoàn thành ngày học ${currentDay.dayOfWeek + 1}`,
    description: `Đã hoàn thành ${totalActivities} hoạt động với độ chính xác ${avgAccuracy.toFixed(
      1
    )}%`,
    metadata: {
      day_study_id: currentDay._id,
      dayOfWeek: currentDay.dayOfWeek,
      total_activities: totalActivities,
      avg_accuracy: avgAccuracy,
    },
  });

  // 4. Lấy WeekStudy để tìm ngày tiếp theo trong days array
  const weekStudy = await WeekStudy.findById(currentDay.week_id).populate(
    "days"
  );
  if (!weekStudy) throw new Error("WeekStudy not found");

  // 5. Tìm index của ngày hiện tại trong days array
  const currentDayIndex = (weekStudy.days as any[]).findIndex(
    (d) => d._id.toString() === dayStudyId.toString()
  );

  // 6. Check còn ngày nào sau đó không
  if (currentDayIndex === -1 || currentDayIndex + 1 >= weekStudy.days.length) {
    // Hết ngày → tuần hoàn thành
    weekStudy.status = WeekStudyStatus.COMPLETED;
    await weekStudy.save();
    return { week_completed: true };
  }

  // 7. Lấy ngày tiếp theo
  const nextDay = (weekStudy.days as any[])[currentDayIndex + 1];

  // 8. Unlock ngày tiếp + session đầu + item đầu (chỉ nếu đang LOCK)
  if (nextDay.status === WeekStudyStatus.LOCK) {
    nextDay.status = WeekStudyStatus.IN_PROGRESS;
  }

  if (nextDay.sessions.length > 0) {
    const firstSession = nextDay.sessions[0];
    if (firstSession.status === WeekStudyStatus.LOCK) {
      firstSession.status = WeekStudyStatus.IN_PROGRESS;
    }

    if (firstSession.items.length > 0) {
      const firstItem = firstSession.items[0];
      if (firstItem.status === WeekStudyStatus.LOCK) {
        firstItem.status = WeekStudyStatus.IN_PROGRESS;
      }
    }
  }

  await nextDay.save();

  // Refetch để lấy dữ liệu chính xác từ DB
  const updatedNextDay = await DayStudy.findById(nextDay._id);
  if (!updatedNextDay) throw new Error("NextDay not found after save");

  return {
    unlocked_day: updatedNextDay,
    week_completed: false,
  };
}

/**
 * Unlock tuần tiếp theo (nếu có)
 * + LOG UserActivity: WEEK_STUDY_COMPLETED
 */
export async function unlockNextWeek(
  weekStudyId: Types.ObjectId,
  userId: Types.ObjectId
) {
  const currentWeek = await WeekStudy.findById(weekStudyId);
  if (!currentWeek) throw new Error("WeekStudy not found");

  // 1. Đánh dấu tuần = COMPLETED
  currentWeek.status = WeekStudyStatus.COMPLETED;
  await currentWeek.save();

  // 2. LOG UserActivity: WEEK_STUDY_COMPLETED
  await UserActivity.create({
    user_id: userId,
    type: "WEEK_STUDY_COMPLETED",
    title: `Hoàn thành tuần ${currentWeek.no}`,
    description: `Chúc mừng bạn đã hoàn thành tuần học!`,
    metadata: {
      week_study_id: currentWeek._id,
      week_no: currentWeek.no,
    },
  });

  // 3. Tìm LearningPath để lấy danh sách tuần
  const { LearningPath } = await import("../models/learning_path.model");
  const learningPath = await LearningPath.findOne({
    user_id: userId,
    isActive: true,
  });

  if (!learningPath || !learningPath.week_study_ids) {
    console.log("⚠️ No active learning path found or no weeks");
    return {
      week_completed: true,
      message: "🎉 Chúc mừng! Bạn đã hoàn thành tuần học!",
    };
  }

  // 4. Tìm index của tuần hiện tại trong week_study_ids array
  const currentWeekIndex = learningPath.week_study_ids.findIndex(
    (w: Types.ObjectId) => w.toString() === weekStudyId.toString()
  );

  // 5. Check còn tuần nào tiếp theo không
  if (
    currentWeekIndex === -1 ||
    currentWeekIndex + 1 >= learningPath.week_study_ids.length
  ) {
    return {
      week_completed: true,
      all_weeks_completed: true,
      message: "🎉🎉 Chúc mừng! Bạn đã hoàn thành toàn bộ lộ trình học!",
    };
  }

  // 6. Unlock tuần tiếp theo
  const nextWeekId = learningPath.week_study_ids[currentWeekIndex + 1];
  const nextWeek = await WeekStudy.findById(nextWeekId).populate("days");

  if (!nextWeek) {
    return {
      week_completed: true,
      message: "🎉 Chúc mừng! Bạn đã hoàn thành tuần học!",
    };
  }

  // 7. Unlock tuần tiếp + ngày đầu + session đầu + item đầu (chỉ nếu đang LOCK)
  if (nextWeek.status === WeekStudyStatus.LOCK) {
    nextWeek.status = WeekStudyStatus.IN_PROGRESS;
  }
  await nextWeek.save();

  if (nextWeek.days.length > 0) {
    const firstDay = await DayStudy.findById(nextWeek.days[0]);
    if (firstDay) {
      if (firstDay.status === WeekStudyStatus.LOCK) {
        firstDay.status = WeekStudyStatus.IN_PROGRESS;
      }

      if (firstDay.sessions.length > 0) {
        const firstSession = firstDay.sessions[0];
        if (firstSession.status === WeekStudyStatus.LOCK) {
          firstSession.status = WeekStudyStatus.IN_PROGRESS;
        }

        if (firstSession.items.length > 0) {
          const firstItem = firstSession.items[0];
          if (firstItem.status === WeekStudyStatus.LOCK) {
            firstItem.status = WeekStudyStatus.IN_PROGRESS;
          }
        }
      }

      await firstDay.save();
    }
  }

  return {
    week_completed: true,
    next_week_unlocked: true,
    message: `🎉 Chúc mừng! Bạn đã hoàn thành tuần ${currentWeek.no} và mở khóa tuần ${nextWeek.no}!`,
  };
}
