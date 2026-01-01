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
import { TestType } from "../models/enums/TestType";

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

    const previousLastStudyDate = userProgress.last_study_date
      ? new Date(userProgress.last_study_date)
      : null;
    let streakDays = userProgress.streak_days || 0;
    let longestStreak = userProgress.longest_streak || 0;

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

    // Update streak using `now` (assumes updateUserProgress called right after activity)
    try {
      const now = new Date();

      if (!previousLastStudyDate) {
        // first recorded study
        streakDays = 1;
      } else {
        const diffDays = daysBetween(previousLastStudyDate, now);
        if (diffDays === 0) {
          // same day, keep existing streak
          streakDays = userProgress.streak_days || streakDays;
        } else if (diffDays === 1) {
          // consecutive day
          streakDays = (userProgress.streak_days || 0) + 1;
        } else {
          // gap >1 day -> reset
          streakDays = 1;
        }
      }

      if (streakDays > longestStreak) longestStreak = streakDays;
      userProgress.last_study_date = now;
    } catch (err) {
      console.error("Error computing streak:", err);
    }

    userProgress.completed_lessons = completedActivities;
    userProgress.total_lessons = totalActivities;
    userProgress.completion_rate = completionRate;
    userProgress.total_study_time = Math.round(totalStudyTime / 60);
    userProgress.streak_days = streakDays;
    userProgress.longest_streak = longestStreak;
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
  // Priority 1: most recent FULL_TEST score (if any)
  try {
    const agg = await UserTest.aggregate([
      { $match: { user_id: userId } },
      {
        $lookup: {
          from: "tests",
          localField: "test_id",
          foreignField: "_id",
          as: "test",
        },
      },
      { $unwind: { path: "$test", preserveNullAndEmptyArrays: false } },
      { $match: { "test.type": TestType.FULL_TEST } },
      { $sort: { submit_at: -1 } },
      { $limit: 1 },
      { $project: { score: 1 } },
    ]).exec();

    if (
      Array.isArray(agg) &&
      agg.length > 0 &&
      typeof agg[0].score === "number"
    ) {
      return Math.round(agg[0].score);
    }
  } catch (err) {
    // ignore and fallback to demo / aggregated score
  }

  // Priority 2: most recent demo test (identified by completedPart === 'demo_test')
  try {
    const demo = await UserTest.findOne({
      user_id: userId,
      completedPart: "demo_test",
    })
      .sort({ submit_at: -1 })
      .select("score")
      .lean();
    if (demo && typeof demo.score === "number") return Math.round(demo.score);
  } catch (err) {
    // ignore and fallback to aggregated recent activities
  }

  // Fallback: average recent activity scores (quizzes, dictations, tests)
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
      .sort({ submit_at: -1 })
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

function startOfDayUTC(d: Date) {
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function daysBetween(d1: Date, d2: Date) {
  const a = startOfDayUTC(d1).getTime();
  const b = startOfDayUTC(d2).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
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
