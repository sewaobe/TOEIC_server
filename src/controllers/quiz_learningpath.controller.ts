// src/controllers/quiz.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Quiz } from "../models/quiz.model";
import { QuizPlan } from "../models/quiz_plan.model";
import { QuizAttempt } from "../models/quiz_attempt.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";

/**
 * Lấy chi tiết quiz (không show đáp án)
 * @param id - quiz_plan_id (từ DayStudy)
 */
export const getQuizByIdForUserController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: quizPlanId } = req.params;

    // 1. Query QuizPlan để lấy quiz_id
    const quizPlan = await QuizPlan.findById(quizPlanId);
    if (!quizPlan) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy quiz plan"));
    }

    // 2. Lấy quiz thực tế
    const quiz = await Quiz.findById(quizPlan.quiz_id)
      .populate({
        path: "question_ids",
        select: "-correctAnswer", // Không trả về đáp án
      })
      .lean();

    if (!quiz) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy quiz"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(quiz, "Lấy quiz thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Submit quiz
 * @param id - quiz_plan_id (từ DayStudy)
 */
export const submitQuizController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: quizPlanId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { answers, time_spent, day_study_id } = req.body;

    // 1. Query QuizPlan để lấy quiz_id
    const quizPlan = await QuizPlan.findById(quizPlanId);
    if (!quizPlan) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy quiz plan"));
    }

    // 2. Lấy quiz với đáp án
    const quizId = quizPlan.quiz_id.toString();
    const quiz = await Quiz.findById(quizId).populate("question_ids");
    if (!quiz) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy quiz"));
    }

    // 3. Convert answers array → map để chấm điểm dễ hơn
    const answersMap: { [key: string]: string } = {};
    if (Array.isArray(answers)) {
      answers.forEach((a: any) => {
        answersMap[a.question_id] = a.user_answer;
      });
    }

    // 4. Chấm điểm
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

    // 5. Tạo QuizAttempt (dùng timestamp hiện tại)
    const now = new Date();
    const attempt = await QuizAttempt.create({
      user_id: userId,
      quiz_id: quizId,
      answers: results,
      score,
      started_at: now,
      finished_at: now,
    });

    // 6. Cập nhật streak
    await updateUserStreak(userId);

    // 7. Auto unlock (dùng quizPlanId thay vì quizId)
    const unlockResult = await autoUnlockAfterComplete(
      userId,
      quizPlanId,
      SessionType.QUIZ,
      score,
      day_study_id
    );

    // 8. Return
    return res.status(201).json(
      ApiResponse.success(
        {
          attempt_id: attempt._id,
          score,
          correct_count: correctCount,
          total_questions: questions.length,
          passed: score >= 80,
          duration: time_spent || 0,
          ...unlockResult.unlock_result,
        },
        unlockResult.unlocked ? unlockResult.message : "Submit quiz thành công"
      )
    );
  } catch (error) {
    next(error);
  }
};
