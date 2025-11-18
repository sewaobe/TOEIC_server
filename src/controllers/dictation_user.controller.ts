// src/controllers/dictation_user.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { DictationAttempt } from "../models/dictation_attempt.model";
import { Dictation } from "../models/dictation.model";
import { ApiResponse } from "../utils/ApiResponse";
import { updateUserStreak } from "../services/streak.service";

/**
 * Submit dictation
 */
export const submitDictationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: dictationId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { index, answers, started_at, finished_at } = req.body;

    // 1. Lấy dictation
    const dictation = await Dictation.findById(dictationId);
    if (!dictation) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy dictation"));
    }

    // 2. Chấm điểm (giả sử dictation có correctAnswers)
    // TODO: Implement logic so sánh answers với correctAnswers
    const accuracy = 85; // Placeholder
    const mistakes: string[] = [];

    // 3. Tạo DictationAttempt
    const duration = Math.floor(
      (new Date(finished_at).getTime() - new Date(started_at).getTime()) / 1000
    );

    const attempt = await DictationAttempt.create({
      user_id: userId,
      dictation_id: dictationId,
      index,
      answers,
      accuracy,
      duration,
      mistakes,
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
          accuracy,
          passed: accuracy >= 80,
          duration,
          mistakes,
        },
        "Submit dictation thành công"
      )
    );
  } catch (error) {
    next(error);
  }
};
