// src/controllers/quiz.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Quiz } from "../models/quiz.model";
import { QuizAttempt } from "../models/quiz_attempt.model";
import { ApiResponse } from "../utils/ApiResponse";
import { updateUserStreak } from "../services/streak.service";

/**
 * Lấy chi tiết quiz (không show đáp án)
 */
export const getQuizByIdForUserController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id)
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
 */
export const submitQuizController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: quizId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { answers, started_at, finished_at } = req.body;

    // 1. Lấy quiz với đáp án
    const quiz = await Quiz.findById(quizId).populate("question_ids");
    if (!quiz) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy quiz"));
    }

    // 2. Chấm điểm
    const questions = quiz.question_ids as any[];
    const results: any[] = [];
    let correctCount = 0;

    questions.forEach((q: any) => {
      const userAnswer = answers[q._id.toString()];
      const isCorrect = userAnswer === q.correctAnswer;

      if (isCorrect) correctCount++;

      results.push({
        question_id: q._id,
        chosen: userAnswer,
        correct: isCorrect,
      });
    });

    const score = Math.round((correctCount / questions.length) * 100);

    // 3. Tạo QuizAttempt
    const attempt = await QuizAttempt.create({
      user_id: userId,
      quiz_id: quizId,
      answers: results,
      score,
      started_at: new Date(started_at),
      finished_at: new Date(finished_at),
    });

    // 4. Cập nhật streak
    await updateUserStreak(userId);

    // 5. Return
    return res.status(201).json(
      ApiResponse.success(
        {
          attempt_id: attempt._id,
          score,
          correct_count: correctCount,
          total_questions: questions.length,
          passed: score >= 80,
          duration: Math.floor(
            (new Date(finished_at).getTime() - new Date(started_at).getTime()) /
              1000
          ),
        },
        "Submit quiz thành công"
      )
    );
  } catch (error) {
    next(error);
  }
};
