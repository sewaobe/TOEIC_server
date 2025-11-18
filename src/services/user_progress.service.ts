// src/services/user_progress.service.ts
import { Types } from "mongoose";
import { UserProgress } from "../models/user_progress.model";
import { User } from "../models/user.model";
import { LearningPath } from "../models/learning_path.model";
import { DayStudy } from "../models/day_study.model";
import { WeekStudy } from "../models/week_study.model";
import { QuizAttempt } from "../models/quiz_attempt.model";
import { DictationAttempt } from "../models/dictation_attempt.model";
import { FlashCardAttempt } from "../models/flashcard_attempt.model";
import { UserTest } from "../models/user_test.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";

/**
 * Cập nhật UserProgress sau khi complete activity trong learning path
 * Gọi hàm này trong completeActivityController
 */
export async function updateUserProgress(
  userId: Types.ObjectId,
  learningPathId?: Types.ObjectId
) {
  try {
    // 1. Tìm hoặc tạo UserProgress
    let userProgress = await UserProgress.findOne({
      user_id: userId,
      learningPath_id: learningPathId,
    });

    if (!userProgress) {
      // Tạo mới nếu chưa có
      const learningPath = await LearningPath.findById(learningPathId);
      if (!learningPath) {
        throw new Error("LearningPath not found");
      }

      userProgress = await UserProgress.create({
        user_id: userId,
        learningPath_id: learningPathId,
        completed_lessons: 0,
        total_lessons: 0,
        completion_rate: 0,
        total_study_time: 0,
        streak_days: 0,
        current_score: 0,
        target_score: learningPath.target_score || 0,
      });
    }

    // 2. Tính số bài đã hoàn thành
    const completedActivities = await countCompletedActivities(
      userId,
      learningPathId
    );

    // 3. Tính tổng số bài trong lộ trình
    const totalActivities = await countTotalActivities(learningPathId);

    // 4. Tính completion rate
    const completionRate =
      totalActivities > 0
        ? Math.round((completedActivities / totalActivities) * 100)
        : 0;

    // 5. Tính tổng thời gian học (từ attempts)
    const totalStudyTime = await calculateTotalStudyTime(userId);

    // 6. Lấy streak từ User model
    const user = await User.findById(userId).select("streak_days");
    const streakDays = user?.streak_days || 0;

    // 7. Tính điểm hiện tại (average score từ các attempts gần đây)
    const currentScore = await calculateCurrentScore(userId);

    // 8. Cập nhật UserProgress
    userProgress.completed_lessons = completedActivities;
    userProgress.total_lessons = totalActivities;
    userProgress.completion_rate = completionRate;
    userProgress.total_study_time = Math.round(totalStudyTime / 60); // Convert to minutes
    userProgress.streak_days = streakDays;
    userProgress.current_score = currentScore;
    userProgress.updated_at = new Date();

    await userProgress.save();

    return userProgress;
  } catch (error) {
    console.error("Error updating user progress:", error);
    throw error;
  }
}

/**
 * Đếm số activity đã hoàn thành trong learning path
 */
async function countCompletedActivities(
  userId: Types.ObjectId,
  learningPathId?: Types.ObjectId
): Promise<number> {
  if (!learningPathId) return 0;

  // Lấy tất cả weeks trong learning path
  const learningPath = await LearningPath.findById(learningPathId).populate(
    "week_study_ids"
  );

  if (!learningPath) return 0;

  let totalCompleted = 0;

  // Duyệt qua từng week
  for (const week of learningPath.week_study_ids as any[]) {
    // Lấy tất cả days trong week
    const weekStudy = await WeekStudy.findById(week._id).populate("days");
    if (!weekStudy) continue;

    // Duyệt qua từng day
    for (const dayId of weekStudy.days) {
      const dayStudy = await DayStudy.findById(dayId);
      if (!dayStudy) continue;

      // Đếm items completed trong day
      for (const session of dayStudy.sessions) {
        for (const item of session.items) {
          if (item.status === WeekStudyStatus.COMPLETED) {
            totalCompleted++;
          }
        }
      }
    }
  }

  return totalCompleted;
}

/**
 * Đếm tổng số activity trong learning path
 */
async function countTotalActivities(
  learningPathId?: Types.ObjectId
): Promise<number> {
  if (!learningPathId) return 0;

  const learningPath = await LearningPath.findById(learningPathId).populate(
    "week_study_ids"
  );

  if (!learningPath) return 0;

  let totalActivities = 0;

  for (const week of learningPath.week_study_ids as any[]) {
    const weekStudy = await WeekStudy.findById(week._id).populate("days");
    if (!weekStudy) continue;

    for (const dayId of weekStudy.days) {
      const dayStudy = await DayStudy.findById(dayId);
      if (!dayStudy) continue;

      for (const session of dayStudy.sessions) {
        totalActivities += session.items.length;
      }
    }
  }

  return totalActivities;
}

/**
 * Tính tổng thời gian học (seconds) từ tất cả attempts
 */
async function calculateTotalStudyTime(
  userId: Types.ObjectId
): Promise<number> {
  const [quizzes, dictations, flashcards, tests] = await Promise.all([
    QuizAttempt.find({ user_id: userId }).select("started_at finished_at"),
    DictationAttempt.find({ user_id: userId }).select("duration"),
    FlashCardAttempt.find({ user_id: userId }).select("started_at finished_at"),
    UserTest.find({ user_id: userId }).select("duration"),
  ]);

  let totalSeconds = 0;

  // Quiz
  quizzes.forEach((q: any) => {
    if (q.finished_at && q.started_at) {
      totalSeconds += Math.floor(
        (q.finished_at.getTime() - q.started_at.getTime()) / 1000
      );
    }
  });

  // Dictation
  dictations.forEach((d: any) => {
    totalSeconds += d.duration || 0;
  });

  // Flashcard
  flashcards.forEach((f: any) => {
    if (f.finished_at && f.started_at) {
      totalSeconds += Math.floor(
        (f.finished_at.getTime() - f.started_at.getTime()) / 1000
      );
    }
  });

  // Test (giả sử mỗi test ~ 120 phút)
  tests.forEach(() => {
    totalSeconds += 120 * 60;
  });

  return totalSeconds;
}

/**
 * Tính điểm hiện tại (average từ 10 attempts gần nhất)
 */
async function calculateCurrentScore(userId: Types.ObjectId): Promise<number> {
  const recentLimit = 10;

  const [quizzes, dictations, tests] = await Promise.all([
    QuizAttempt.find({ user_id: userId })
      .select("score")
      .sort({ finished_at: -1 })
      .limit(recentLimit),

    DictationAttempt.find({ user_id: userId })
      .select("accuracy")
      .sort({ finished_at: -1 })
      .limit(recentLimit),

    UserTest.find({ user_id: userId })
      .select("score")
      .sort({ date_taken: -1 })
      .limit(recentLimit),
  ]);

  const scores: number[] = [];

  quizzes.forEach((q: any) => scores.push(q.score || 0));
  dictations.forEach((d: any) => scores.push(d.accuracy || 0));
  tests.forEach((t: any) => scores.push(t.score || 0));

  if (scores.length === 0) return 0;

  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return Math.round(avgScore);
}

/**
 * Lấy UserProgress của user
 */
export async function getUserProgress(
  userId: Types.ObjectId,
  learningPathId?: Types.ObjectId
) {
  const userProgress = await UserProgress.findOne({
    user_id: userId,
    learningPath_id: learningPathId,
  });

  if (!userProgress) {
    // Nếu chưa có, tạo mới
    return await updateUserProgress(userId, learningPathId);
  }

  return userProgress;
}
