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

/**
 * Kiểm tra điều kiện unlock dựa vào loại bài và điểm
 */
export function checkUnlockCondition(
  activityType: SessionType,
  score?: number
): boolean {
  // Lesson không cần điểm, luôn unlock
  if (activityType === SessionType.LESSON) {
    return true;
  }

  // Nếu không có score → không unlock
  if (score === undefined || score === null) {
    return false;
  }

  switch (activityType) {
    case SessionType.FLASH_CARD:
    case SessionType.DICTATION:
    case SessionType.QUIZ:
      return score >= 80; // Cần >= 80%

    case SessionType.SHADOWING:
      return score >= 70; // Phát âm dễ hơn

    case SessionType.MINI_TEST:
      return score >= 70; // Test khó hơn, 70% là đủ

    default:
      return false;
  }
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
  sessionNo: number,
  itemIndex: number
) {
  const dayStudy = await DayStudy.findById(dayStudyId);
  if (!dayStudy) throw new Error("DayStudy not found");

  const session = dayStudy.sessions[sessionNo];
  if (!session) throw new Error("Session not found");

  // 1. Đánh dấu item hiện tại = COMPLETED
  session.items[itemIndex].status = WeekStudyStatus.COMPLETED;

  // 2. Check còn item nào không
  if (itemIndex + 1 < session.items.length) {
    // Còn → mở item tiếp
    session.items[itemIndex + 1].status = WeekStudyStatus.IN_PROGRESS;
    await dayStudy.save();

    return {
      unlocked_item: session.items[itemIndex + 1],
      session_completed: false,
    };
  }

  // 3. Hết items → đánh dấu session completed
  session.status = WeekStudyStatus.COMPLETED;
  await dayStudy.save();

  return { session_completed: true };
}

/**
 * Unlock session tiếp theo trong ngày
 */
export async function unlockNextSession(
  dayStudyId: Types.ObjectId,
  sessionNo: number
) {
  const dayStudy = await DayStudy.findById(dayStudyId);
  if (!dayStudy) throw new Error("DayStudy not found");

  // Check còn session tiếp không
  if (sessionNo + 1 < dayStudy.sessions.length) {
    const nextSession = dayStudy.sessions[sessionNo + 1];
    nextSession.status = WeekStudyStatus.IN_PROGRESS;

    // Unlock item đầu tiên của session mới
    if (nextSession.items.length > 0) {
      nextSession.items[0].status = WeekStudyStatus.IN_PROGRESS;
    }

    await dayStudy.save();

    return {
      unlocked_session: nextSession,
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

  // 4. Tìm ngày tiếp theo trong tuần
  const nextDay = await DayStudy.findOne({
    week_id: currentDay.week_id,
    dayOfWeek: { $gt: currentDay.dayOfWeek },
  }).sort({ dayOfWeek: 1 });

  if (!nextDay) {
    // Hết ngày → tuần hoàn thành
    return { week_completed: true };
  }

  // 5. Unlock ngày tiếp + session đầu + item đầu
  nextDay.status = WeekStudyStatus.IN_PROGRESS;

  if (nextDay.sessions.length > 0) {
    nextDay.sessions[0].status = WeekStudyStatus.IN_PROGRESS;

    if (nextDay.sessions[0].items.length > 0) {
      nextDay.sessions[0].items[0].status = WeekStudyStatus.IN_PROGRESS;
    }
  }

  await nextDay.save();

  return {
    unlocked_day: nextDay,
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

  // 3. Tìm tuần tiếp theo (logic này phụ thuộc cấu trúc LearningPath)
  // TODO: Implement logic tìm và unlock tuần tiếp theo

  return {
    week_completed: true,
    message: "🎉 Chúc mừng! Bạn đã hoàn thành tuần học!",
  };
}
