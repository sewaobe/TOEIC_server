// src/controllers/dictation_user.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { DictationAttempt } from "../models/dictation_attempt.model";
import { Dictation } from "../models/dictation.model";
import { DictationPlan } from "../models/dictation_plan.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";

/**
 * Submit dictation
 * @param id - dictation_plan_id (từ DayStudy)
 */
export const submitDictationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: dictationPlanId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { index, answers, started_at, finished_at } = req.body;

    // 1. Query DictationPlan để lấy dictation_id
    const dictationPlan = await DictationPlan.findById(dictationPlanId);
    if (!dictationPlan) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy dictation plan"));
    }

    // 2. Lấy dictation thực tế
    const dictationId = dictationPlan.dictation_id.toString();
    const dictation = await Dictation.findById(dictationId);
    if (!dictation) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy dictation"));
    }

    // 3. Chấm điểm (giả sử dictation có correctAnswers)
    // TODO: Implement logic so sánh answers với correctAnswers
    const accuracy = 85; // Placeholder
    const mistakes: string[] = [];

    // 4. Tạo DictationAttempt
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

    // 5. Cập nhật streak
    await updateUserStreak(userId);

    // 6. Auto unlock (dùng dictationPlanId thay vì dictationId)
    const unlockResult = await autoUnlockAfterComplete(
      userId,
      dictationPlanId,
      SessionType.DICTATION,
      accuracy
    );

    // 6. Return
    return res.status(201).json(
      ApiResponse.success(
        {
          attempt_id: attempt._id,
          accuracy,
          passed: accuracy >= 80,
          duration,
          mistakes,
          ...unlockResult.unlock_result,
        },
        unlockResult.unlocked
          ? unlockResult.message
          : "Submit dictation thành công"
      )
    );
  } catch (error) {
    next(error);
  }
};
