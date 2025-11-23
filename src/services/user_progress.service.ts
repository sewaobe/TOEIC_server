// src/services/user_progress.service.ts
import { Types } from "mongoose";
import { UserProgress } from "../models/user_progress.model";
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
 */
export async function updateUserProgress(
  userId: Types.ObjectId,
  learningPathId?: Types.ObjectId
) {
  try {
    let userProgress = await UserProgress.findOne({
      user_id: userId,
      learningPath_id: learningPathId,
    });

    if (!userProgress) {
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
        longest_streak: 0,
        last_study_date: null,
        current_score: 0,
        target_score: learningPath.target_score || 0,
      });
    }

    const streakDays = userProgress.streak_days || 0;
    const longestStreak = userProgress.longest_streak || 0;
    const lastStudyDate = userProgress.last_study_date;

    const completedActivities = await countCompletedActivities(
      userId,
      learningPathId
    );

    const totalActivities = await countTotalActivities(learningPathId);

    const completionRate =
      totalActivities > 0
        ? Math.round((completedActivities / totalActivities) * 100)
        : 0;

    const totalStudyTime = await calculateTotalStudyTime(userId);

    const currentScore = await calculateCurrentScore(userId);

    userProgress.completed_lessons = completedActivities;
    userProgress.total_lessons = totalActivities;
    userProgress.completion_rate = completionRate;
    userProgress.total_study_time = Math.round(totalStudyTime / 60);
    userProgress.streak_days = streakDays;
    userProgress.longest_streak = longestStreak;
    userProgress.last_study_date = lastStudyDate;
    userProgress.current_score = currentScore;
    userProgress.updated_at = new Date();

    await userProgress.save();

    return userProgress;
  } catch (error) {
    console.error("Error updating user progress:", error);
    throw error;
  }
}

async function countCompletedActivities(
  userId: Types.ObjectId,
  learningPathId?: Types.ObjectId
): Promise<number> {
  if (!learningPathId) return 0;

  const learningPath = await LearningPath.findById(learningPathId).populate(
    "week_study_ids"
  );

  if (!learningPath) return 0;

  let totalCompleted = 0;

  for (const week of learningPath.week_study_ids as any[]) {
    const weekStudy = await WeekStudy.findById(week._id).populate("days");
    if (!weekStudy) continue;

    for (const dayId of weekStudy.days) {
      const dayStudy = await DayStudy.findById(dayId);
      if (!dayStudy) continue;

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

  quizzes.forEach((q: any) => {
    if (q.finished_at && q.started_at) {
      totalSeconds += Math.floor(
        (q.finished_at.getTime() - q.started_at.getTime()) / 1000
      );
    }
  });

  dictations.forEach((d: any) => {
    totalSeconds += d.duration || 0;
  });

  flashcards.forEach((f: any) => {
    if (f.finished_at && f.started_at) {
      totalSeconds += Math.floor(
        (f.finished_at.getTime() - f.started_at.getTime()) / 1000
      );
    }
  });

  tests.forEach(() => {
    totalSeconds += 120 * 60;
  });

  return totalSeconds;
}

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

export async function getUserProgress(
  userId: Types.ObjectId,
  learningPathId?: Types.ObjectId
) {
  const userProgress = await UserProgress.findOne({
    user_id: userId,
    learningPath_id: learningPathId,
  });

  if (!userProgress) {
    return await updateUserProgress(userId, learningPathId);
  }

  return userProgress;
}
