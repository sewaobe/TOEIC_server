// src/controllers/shadowing_learningpath.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Shadowing } from "../models/shadowing.model";
import { ShadowingAttempt } from "../models/shadowing_attempt.model";
import { ShadowingPlan } from "../models/shadowing_plan.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { SubmissionType } from "../models/enums/SubmissionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";
import { upsertPlanAfterAttempts } from "../services/plan_submission.service";

/**
 * L?y chi ti?t shadowing plan cho learning path
 * @param id - shadowing_plan_id (t? DayStudy)
 */
export const getShadowingPlanController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: rawId } = req.params;

    // rawId is Shadowing metadata id
    const shadowingId = rawId;
    const shadowing = await Shadowing.findById(shadowingId).lean();

    if (!shadowing) {
      return res.status(404).json(ApiResponse.fail("Không tìm th?y shadowing"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(shadowing, "L?y shadowing thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Submit shadowing (hoàn thành bài shadowing)
 * @param id - shadowing_plan_id (t? DayStudy)
 */
export const submitShadowingController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const { id: rawId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { data, day_study_id } = req.body;
    const submitType = SubmissionType.LEARNING_PATH;
    const shadowingId = new Types.ObjectId(rawId);

    if (!day_study_id) {
      return res.status(400).json(ApiResponse.fail("day_study_id là b?t bu?c"));
    }

    const attempts = Array.isArray(data) ? data : [data];
    const payloads = attempts.map((item: any) => {
      const similarityScore =
        typeof item?.accuracy === "number"
          ? Number(item.accuracy)
          : typeof item?.similarity_score === "number"
            ? Number(item.similarity_score)
            : 0;

      return {
        ...item,
        user_id: userId,
        shadowing_id: shadowingId,
        submit_type: submitType,
        similarity_score: similarityScore,
        day_study_id: day_study_id ? new Types.ObjectId(day_study_id) : undefined,
      };
    });

    const created = await ShadowingAttempt.insertMany(payloads);

    if (!created || created.length === 0) {
      throw new Error("Failed to create shadowing attempts");
    }

    const plan = await upsertPlanAfterAttempts({
      planModel: ShadowingPlan,
      attemptModel: ShadowingAttempt,
      matchFields: {
        user_id: userId,
        shadowing_id: shadowingId,
      },
      accuracyField: "similarity_score",
      submitType,
    });

    await updateUserStreak(userId);

    const accuracy = created[created.length - 1]?.similarity_score || 0;

    const unlockResult = await autoUnlockAfterComplete(
      userId,
      shadowingId.toString(),
      SessionType.SHADOWING,
      accuracy,
      day_study_id,
      String(created[created.length - 1]?._id)
    );

    return res.status(200).json(
      ApiResponse.success(
        {
          attempts: created,
          accuracy,
          passed: true,
          plan_summary: {
            total_attempts: plan?.total_attempts ?? created.length,
            accuracy_overall: plan?.accuracy_overall ?? accuracy,
          },
          ...unlockResult.unlock_result,
        },
        unlockResult.unlocked
          ? unlockResult.message
          : "Hoàn thành shadowing thành công"
      )
    );
  } catch (error) {
    next(error);
  }
};

