// src/services/study_history.service.ts
import { Types } from "mongoose";
import {
  FlashCardAttempt,
  DictationAttempt,
  QuizAttempt,
  ShadowingAttempt,
  UserTest,
} from "../models";

interface StudyHistoryFilters {
  type?: string;
  from?: Date;
  to?: Date;
}

/**
 * Lấy lịch sử học tập từ tất cả Attempt models
 */
export async function getUserStudyHistory(
  userId: Types.ObjectId,
  page = 1,
  limit = 20,
  filters?: StudyHistoryFilters
) {
  const skip = (page - 1) * limit;
  const activities: any[] = [];

  // Query từ các Attempt models
  const [flashcards, dictations, quizzes, shadowing, tests] = await Promise.all(
    [
      FlashCardAttempt.find({ user_id: userId })
        .populate("topic_vocabulary_id", "title")
        .sort({ finished_at: -1 })
        .limit(limit * 5), // Lấy nhiều hơn để merge sau

      DictationAttempt.find({ user_id: userId })
        .populate("dictation_id", "title")
        .sort({ finished_at: -1 })
        .limit(limit * 5),

      QuizAttempt.find({ user_id: userId })
        .populate("quiz_id", "title")
        .sort({ finished_at: -1 })
        .limit(limit * 5),

      ShadowingAttempt.find({ user_id: userId })
        .populate("shadowing_id", "title")
        .sort({ finished_at: -1 })
        .limit(limit * 5),

      UserTest.find({ user_id: userId })
        .populate("test_id", "title")
        .sort({ date_taken: -1 })
        .limit(limit * 5),
    ]
  );

  // Transform sang unified format
  flashcards.forEach((a: any) => {
    activities.push({
      type: "FLASHCARD",
      id: a._id,
      activity_id: a.topic_vocabulary_id?._id,
      activity_name: a.topic_vocabulary_id?.title || "Flashcard",
      score: a.accuracy,
      started_at: a.started_at,
      finished_at: a.finished_at,
      duration: a.finished_at
        ? Math.floor((a.finished_at.getTime() - a.started_at.getTime()) / 1000)
        : 0,
    });
  });

  dictations.forEach((a: any) => {
    activities.push({
      type: "DICTATION",
      id: a._id,
      activity_id: a.dictation_id?._id,
      activity_name: a.dictation_id?.title || "Dictation",
      score: a.accuracy,
      started_at: a.started_at,
      finished_at: a.finished_at,
      duration: a.duration || 0,
    });
  });

  quizzes.forEach((a: any) => {
    activities.push({
      type: "QUIZ",
      id: a._id,
      activity_id: a.quiz_id?._id,
      activity_name: a.quiz_id?.title || "Quiz",
      score: a.score,
      started_at: a.started_at,
      finished_at: a.finished_at,
      duration: a.finished_at
        ? Math.floor((a.finished_at.getTime() - a.started_at.getTime()) / 1000)
        : 0,
    });
  });

  shadowing.forEach((a: any) => {
    activities.push({
      type: "SHADOWING",
      id: a._id,
      activity_id: a.shadowing_id?._id,
      activity_name: a.shadowing_id?.title || "Shadowing",
      score: a.similarity_score,
      started_at: a.started_at,
      finished_at: a.finished_at,
      duration: a.duration || 0,
    });
  });

  tests.forEach((a: any) => {
    activities.push({
      type: "TEST",
      id: a._id,
      activity_id: a.test_id?._id,
      activity_name: a.test_id?.title || "Test",
      score: a.score,
      started_at: a.date_taken,
      finished_at: a.date_taken,
      duration: 0,
    });
  });

  // Sort by finished_at desc
  activities.sort(
    (a, b) =>
      new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime()
  );

  // Pagination
  const total = activities.length;
  const paginatedItems = activities.slice(skip, skip + limit);

  return {
    items: paginatedItems,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Thống kê tổng quan từ Attempts
 */
export async function getUserStats(userId: Types.ObjectId) {
  const [
    totalFlashcards,
    totalDictations,
    totalQuizzes,
    totalShadowing,
    totalTests,
  ] = await Promise.all([
    FlashCardAttempt.countDocuments({ user_id: userId }),
    DictationAttempt.countDocuments({ user_id: userId }),
    QuizAttempt.countDocuments({ user_id: userId }),
    ShadowingAttempt.countDocuments({ user_id: userId }),
    UserTest.countDocuments({ user_id: userId }),
  ]);

  // Tính total study time
  const totalDuration = await calculateTotalDuration(userId);

  // Tính avg score
  const avgScore = await calculateAverageScore(userId);

  return {
    total_study_time: totalDuration, // seconds
    lessons_completed: totalFlashcards + totalDictations + totalQuizzes,
    tests_completed: totalTests,
    avg_score: avgScore,
    breakdown: {
      flashcards: totalFlashcards,
      dictations: totalDictations,
      quizzes: totalQuizzes,
      shadowing: totalShadowing,
      tests: totalTests,
    },
  };
}

/**
 * Tính tổng thời gian học (seconds)
 */
async function calculateTotalDuration(userId: Types.ObjectId): Promise<number> {
  const [flashcards, dictations, quizzes, shadowing] = await Promise.all([
    FlashCardAttempt.find({ user_id: userId }).select("started_at finished_at"),
    DictationAttempt.find({ user_id: userId }).select("duration"),
    QuizAttempt.find({ user_id: userId }).select("started_at finished_at"),
    ShadowingAttempt.find({ user_id: userId }).select("duration"),
  ]);

  let total = 0;

  flashcards.forEach((a: any) => {
    if (a.finished_at && a.started_at) {
      total += Math.floor(
        (a.finished_at.getTime() - a.started_at.getTime()) / 1000
      );
    }
  });

  dictations.forEach((a: any) => {
    total += a.duration || 0;
  });

  quizzes.forEach((a: any) => {
    if (a.finished_at && a.started_at) {
      total += Math.floor(
        (a.finished_at.getTime() - a.started_at.getTime()) / 1000
      );
    }
  });

  shadowing.forEach((a: any) => {
    total += a.duration || 0;
  });

  return total;
}

/**
 * Tính điểm trung bình
 */
async function calculateAverageScore(userId: Types.ObjectId): Promise<number> {
  const [flashcards, dictations, quizzes, tests] = await Promise.all([
    FlashCardAttempt.find({ user_id: userId }).select("accuracy"),
    DictationAttempt.find({ user_id: userId }).select("accuracy"),
    QuizAttempt.find({ user_id: userId }).select("score"),
    UserTest.find({ user_id: userId }).select("score"),
  ]);

  let totalScore = 0;
  let count = 0;

  flashcards.forEach((a: any) => {
    totalScore += a.accuracy || 0;
    count++;
  });

  dictations.forEach((a: any) => {
    totalScore += a.accuracy || 0;
    count++;
  });

  quizzes.forEach((a: any) => {
    totalScore += a.score || 0;
    count++;
  });

  tests.forEach((a: any) => {
    totalScore += a.score || 0;
    count++;
  });

  return count > 0 ? Math.round(totalScore / count) : 0;
}
