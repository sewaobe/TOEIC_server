// src/controllers/dictation_learningpath.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { DictationAttempt } from "../models/dictation_attempt.model";
import { Dictation } from "../models/dictation.model";
import { DictationPlan } from "../models/dictation_plan.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";
import { getDictationByIdService } from "../services/dictation.service";

/**
 * GET dictation content cho user
 * @param id - dictation_plan_id (từ DayStudy)
 */
export const getDictationForLearningPathController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: dictationPlanId } = req.params;

    // 1. Query DictationPlan để lấy dictation_id thật
    const dictationPlan = await DictationPlan.findById(dictationPlanId);
    if (!dictationPlan) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy dictation plan"));
    }

    // 2. Lấy dictation thực tế — trả về nguyên bản giống chế độ tự luyện
    const dictationId = dictationPlan.dictation_id.toString();
    const dictation = await getDictationByIdService(dictationId);
    if (!dictation) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy dictation"));
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(dictation, "Lấy nghe chép chính tả thành công")
      );
  } catch (error) {
    next(error);
  }
};

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
    const { data, day_study_id } = req.body;

    // 1. Query DictationPlan để lấy dictation_id
    const dictationPlan = await DictationPlan.findById(dictationPlanId);
    if (!dictationPlan) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy dictation plan"));
    }

    // 2. Lấy dictation_id
    const dictationId = dictationPlan.dictation_id.toString();

    // 3. Lưu attempts (client đã tính toán accuracy) — giống free-practice
    const attempts = Array.isArray(data) ? data : [data];
    const created = await DictationAttempt.insertMany(
      attempts.map((item: any) => ({
        ...item,
        user_id: userId,
        dictation_id: dictationId,
      }))
    );

    if (!created || created.length === 0) {
      throw new Error("Failed to create dictation attempts");
    }

    // 4. Cập nhật streak
    await updateUserStreak(userId);

    // 5. Auto unlock (phần mới cho learning path)
    const firstAttempt = created[0];
    const accuracy = firstAttempt.accuracy || 0;

    const unlockResult = await autoUnlockAfterComplete(
      userId,
      dictationPlanId,
      SessionType.DICTATION,
      accuracy,
      day_study_id
    );

    // 6. Return
    return res.status(200).json(
      ApiResponse.success(
        {
          attempts: created,
          accuracy,
          passed: accuracy >= 80,
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
