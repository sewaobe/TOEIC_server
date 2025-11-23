// src/services/streak.service.ts
import { Types } from "mongoose";
import { UserProgress } from "../models/user_progress.model";
import { UserActivity } from "../models/user_activity.model";
import { LearningPath } from "../models/learning_path.model";

interface ProgressContext {
  progress: any;
  learningPathId?: Types.ObjectId;
}

async function findOrCreateUserProgress(userId: Types.ObjectId): Promise<ProgressContext> {
  const learningPath = await LearningPath.findOne({ user_id: userId, isActive: true })
    .select("_id target_score")
    .lean();

  const filter: any = { user_id: userId };
  if (learningPath?._id) {
    filter.learningPath_id = learningPath._id;
  }

  let progress = await UserProgress.findOne(filter);

  if (!progress) {
    // fallback: lấy bất kỳ progress gần nhất của user nếu chưa có bản ghi cho learning path hiện tại
    progress = await UserProgress.findOne({ user_id: userId }).sort({ updated_at: -1 });
  }

  if (!progress) {
    progress = await UserProgress.create({
      user_id: userId,
      learningPath_id: learningPath?._id,
      completed_lessons: 0,
      total_lessons: 0,
      completion_rate: 0,
      total_study_time: 0,
      streak_days: 0,
      longest_streak: 0,
      last_study_date: null,
      current_score: 0,
      target_score: learningPath?.target_score || 0,
    });
  }

  return { progress, learningPathId: learningPath?._id as Types.ObjectId | undefined };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Cập nhật streak khi user submit bài có điểm
 * Gọi hàm này trong các API: submit quiz, dictation, flashcard, test
 */
export async function updateUserStreak(userId: Types.ObjectId) {
  const { progress } = await findOrCreateUserProgress(userId);

  const today = startOfDay(new Date());
  const lastStudy = progress.last_study_date ? startOfDay(new Date(progress.last_study_date)) : null;

  if (lastStudy && lastStudy.getTime() === today.getTime()) {
    return progress;
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (lastStudy && lastStudy.getTime() === yesterday.getTime()) {
    progress.streak_days = (progress.streak_days || 0) + 1;
  } else {
    // nếu đứt quãng, ghi nhận longest trước khi reset
    if (progress.streak_days > (progress.longest_streak || 0)) {
      progress.longest_streak = progress.streak_days;
    }
    progress.streak_days = 1;
  }

  progress.longest_streak = Math.max(progress.streak_days, progress.longest_streak || 0);
  progress.last_study_date = new Date();
  progress.updated_at = new Date();
  await progress.save();

  // Log milestone nếu đạt 7, 30, 100, 365 ngày
  const milestones = [7, 30, 100, 365];
  if (milestones.includes(progress.streak_days)) {
    await UserActivity.create({
      user_id: userId,
      type: "OTHER",
      title: `Đạt ${progress.streak_days} ngày streak!`,
      description: `Chúc mừng bạn đã học liên tiếp ${progress.streak_days} ngày!`,
      metadata: {
        milestone: progress.streak_days,
        type: "STREAK_MILESTONE",
      },
    });
  }

  return progress;
}

/**
 * Lấy thông tin streak hiện tại của user
 */
export async function getStreakInfo(userId: Types.ObjectId) {
  const { progress } = await findOrCreateUserProgress(userId);

  const today = startOfDay(new Date());
  const lastStudy = progress.last_study_date ? startOfDay(new Date(progress.last_study_date)) : null;
  const studiedToday = !!(lastStudy && lastStudy.getTime() === today.getTime());

  return {
    current_streak: progress.streak_days || 0,
    longest_streak: progress.longest_streak || 0,
    last_study_date: progress.last_study_date,
    studied_today: studiedToday,
    next_milestone: getNextMilestone(progress.streak_days || 0),
  };
}

/**
 * Lấy milestone tiếp theo
 */
function getNextMilestone(currentStreak: number): number {
  const milestones = [7, 30, 100, 365, 1000];
  return milestones.find((m) => m > currentStreak) || 1000;
}
