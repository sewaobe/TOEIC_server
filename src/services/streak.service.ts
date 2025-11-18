// src/services/streak.service.ts
import { Types } from "mongoose";
import { User } from "../models/user.model";
import { UserActivity } from "../models/user_activity.model";

/**
 * Cập nhật streak khi user submit bài có điểm
 * Gọi hàm này trong các API: submit quiz, dictation, flashcard, test
 */
export async function updateUserStreak(userId: Types.ObjectId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const today = new Date().setHours(0, 0, 0, 0);
  const lastStudy = user.last_study_date?.setHours(0, 0, 0, 0);

  // Nếu hôm nay đã tính streak rồi → bỏ qua
  if (lastStudy === today) {
    return;
  }

  const yesterday = today - 24 * 60 * 60 * 1000;

  // Nếu hôm qua có học → tăng streak
  if (lastStudy === yesterday) {
    user.streak_days++;
    user.longest_streak = Math.max(user.streak_days, user.longest_streak || 0);
  }
  // Nếu gián đoạn → reset streak
  else {
    user.streak_days = 1;
  }

  user.last_study_date = new Date();
  await user.save();

  // Log milestone nếu đạt 7, 30, 100, 365 ngày
  const milestones = [7, 30, 100, 365];
  if (milestones.includes(user.streak_days)) {
    await UserActivity.create({
      user_id: userId,
      type: "OTHER",
      title: `🔥 Đạt ${user.streak_days} ngày streak!`,
      description: `Chúc mừng bạn đã học liên tiếp ${user.streak_days} ngày!`,
      metadata: {
        milestone: user.streak_days,
        type: "STREAK_MILESTONE",
      },
    });
  }
}

/**
 * Lấy thông tin streak hiện tại của user
 */
export async function getStreakInfo(userId: Types.ObjectId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const today = new Date().setHours(0, 0, 0, 0);
  const lastStudy = user.last_study_date?.setHours(0, 0, 0, 0);
  const studiedToday = lastStudy === today;

  return {
    current_streak: user.streak_days || 0,
    longest_streak: user.longest_streak || 0,
    last_study_date: user.last_study_date,
    studied_today: studiedToday,
    next_milestone: getNextMilestone(user.streak_days || 0),
  };
}

/**
 * Lấy milestone tiếp theo
 */
function getNextMilestone(currentStreak: number): number {
  const milestones = [7, 30, 100, 365, 1000];
  return milestones.find((m) => m > currentStreak) || 1000;
}
