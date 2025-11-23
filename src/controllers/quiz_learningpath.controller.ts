// src/controllers/quiz.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Quiz } from "../models/quiz.model";
import { QuizPlan } from "../models/quiz_plan.model";
import { QuizAttempt } from "../models/quiz_attempt.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { SubmissionType } from "../models/enums/SubmissionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";
import { upsertPlanAfterAttempts } from "../services/plan_submission.service";

/**
 * L?y chi ti?t quiz (không show dáp án)
 * @param id - quiz_plan_id (t? DayStudy)
 */
export const getQuizByIdForUserController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: rawId } = req.params;

    // rawId is the Quiz metadata id
    const quizId = rawId;

    // 2. L?y quiz th?c t?
    const quiz = await Quiz.findById(quizId)
      .populate({
        path: "question_ids",
        select: "-correctAnswer", // Không tr? v? dáp án
      })
      .lean();

    if (!quiz) {
      return res.status(404).json(ApiResponse.fail("Không tìm th?y quiz"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(quiz, "L?y quiz thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Submit quiz
 * @param id - quiz_plan_id (t? DayStudy)
 */
export const submitQuizController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: rawId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { answers, time_spent, day_study_id } = req.body;
    const submitType = SubmissionType.LEARNING_PATH;
    const quizId = new Types.ObjectId(rawId);

    if (!day_study_id) {
      return res.status(400).json(ApiResponse.fail("day_study_id là b?t bu?c"));
    }

    const quiz = await Quiz.findById(quizId).populate("question_ids");
    if (!quiz) {
      return res.status(404).json(ApiResponse.fail("Không tìm th?y quiz"));
    }

    const answersMap: { [key: string]: string } = {};
    if (Array.isArray(answers)) {
      answers.forEach((a: any) => {
        answersMap[a.question_id] = a.user_answer;
      });
    }

    const questions = quiz.question_ids as any[];
    const results: any[] = [];
    let correctCount = 0;

    questions.forEach((q: any) => {
      const userAnswer = answersMap[q._id.toString()];
      const isCorrect = !!(userAnswer && userAnswer === q.correctAnswer);

      if (isCorrect) correctCount++;

      results.push({
        question_id: q._id,
        chosen: userAnswer || "SKIP",
        correct: isCorrect,
      });
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const now = new Date();

    const attempt = await QuizAttempt.create({
      user_id: userId,
      quiz_id: quizId,
      submit_type: submitType,
      answers: results,
      score,
      started_at: now,
      finished_at: now,
      day_study_id: day_study_id ? new Types.ObjectId(day_study_id) : undefined,
    });

    const plan = await upsertPlanAfterAttempts({
      planModel: QuizPlan,
      attemptModel: QuizAttempt,
      matchFields: {
        user_id: userId,
        quiz_id: quizId,
      },
      accuracyField: "score",
      submitType,
    });

    await updateUserStreak(userId);

    const unlockResult = await autoUnlockAfterComplete(
      userId,
      quizId.toString(),
      SessionType.QUIZ,
      score,
      day_study_id
    );

    return res.status(201).json(
      ApiResponse.success(
        {
          attempt_id: attempt._id,
          score,
          correct_count: correctCount,
          total_questions: questions.length,
          passed: true,
          duration: time_spent || 0,
          plan_summary: {
            total_attempts: plan?.total_attempts ?? 1,
            accuracy_overall: plan?.accuracy_overall ?? score,
          },
          ...unlockResult.unlock_result,
        },
        unlockResult.unlocked ? unlockResult.message : "Submit quiz thành công"
      )
    );
  } catch (error) {
    next(error);
  }
};

