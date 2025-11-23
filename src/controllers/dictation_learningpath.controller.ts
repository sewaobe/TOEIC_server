// src/controllers/dictation_learningpath.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { DictationAttempt } from "../models/dictation_attempt.model";
import { DictationPlan } from "../models/dictation_plan.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { SubmissionType } from "../models/enums/SubmissionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";
import { getDictationByIdService } from "../services/dictation.service";
import { upsertPlanAfterAttempts } from "../services/plan_submission.service";

/**
 * GET dictation content cho user
 * @param id - dictation_plan_id (t? DayStudy)
 */
export const getDictationForLearningPathController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: rawId } = req.params;

    // rawId is a Dictation metadata id
    const dictationId = rawId;
    const dictation = await getDictationByIdService(dictationId);
    if (!dictation) {
      return res.status(404).json(ApiResponse.fail("Không tìm th?y dictation"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(dictation, "L?y nghe chép chính t? thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Submit dictation
 * @param id - dictation_plan_id (t? DayStudy)
 */
export const submitDictationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: rawId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { data, day_study_id } = req.body;
    const submitType = SubmissionType.LEARNING_PATH;
    const dictationId = new Types.ObjectId(rawId);

    if (!day_study_id) {
      return res.status(400).json(ApiResponse.fail("day_study_id là b?t bu?c"));
    }

    const attemptsPayload = (Array.isArray(data) ? data : [data]).map(
      (item: any) => ({
        ...item,
        user_id: userId,
        dictation_id: dictationId,
        submit_type: submitType,
        accuracy: typeof item?.accuracy === "number" ? Number(item.accuracy) : 0,
        day_study_id: day_study_id ? new Types.ObjectId(day_study_id) : undefined,
      })
    );

    const created = await DictationAttempt.insertMany(attemptsPayload);

    if (!created || created.length === 0) {
      throw new Error("Failed to create dictation attempts");
    }

    const plan = await upsertPlanAfterAttempts({
      planModel: DictationPlan,
      attemptModel: DictationAttempt,
      matchFields: {
        user_id: userId,
        dictation_id: dictationId,
      },
      accuracyField: "accuracy",
      submitType,
    });

    await updateUserStreak(userId);

    const latestAccuracy = created[created.length - 1]?.accuracy || 0;

    const unlockResult = await autoUnlockAfterComplete(
      userId,
      dictationId.toString(),
      SessionType.DICTATION,
      latestAccuracy,
      day_study_id
    );

    return res.status(200).json(
      ApiResponse.success(
        {
          attempts: created,
          accuracy: latestAccuracy,
          passed: true,
          plan_summary: {
            total_attempts: plan?.total_attempts ?? created.length,
            accuracy_overall: plan?.accuracy_overall ?? latestAccuracy,
          },
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

