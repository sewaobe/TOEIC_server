// src/controllers/shadowing_learningpath.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { ShadowingPlan } from "../models/shadowing_plan.model";
import { Shadowing } from "../models/shadowing.model";
import { ShadowingAttempt } from "../models/shadowing_attempt.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";

/**
 * Lấy chi tiết shadowing plan cho learning path
 * @param id - shadowing_plan_id (từ DayStudy)
 */
export const getShadowingPlanController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: shadowingPlanId } = req.params;

    // 1. Query ShadowingPlan để lấy shadowing_id
    const shadowingPlan = await ShadowingPlan.findById(shadowingPlanId);
    if (!shadowingPlan) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy shadowing plan"));
    }

    // 2. Lấy shadowing thực tế
    const shadowing = await Shadowing.findById(
      shadowingPlan.shadowing_id
    ).lean();

    if (!shadowing) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy shadowing"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(shadowing, "Lấy shadowing thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Submit shadowing (hoàn thành bài shadowing)
 * @param id - shadowing_plan_id (từ DayStudy)
 */
export const submitShadowingController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: shadowingPlanId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { data, day_study_id } = req.body;

    // 1. Query ShadowingPlan để lấy shadowing_id
    const shadowingPlan = await ShadowingPlan.findById(shadowingPlanId);
    if (!shadowingPlan) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy shadowing plan"));
    }

    const shadowingId = shadowingPlan.shadowing_id.toString();

    // 2. Lưu attempts (client đã tính toán accuracy) — giống dictation/free-practice
    const attempts = Array.isArray(data) ? data : [data];
    const created = await ShadowingAttempt.insertMany(
      attempts.map((item: any) => ({
        ...item,
        user_id: userId,
        shadowing_id: shadowingId,
        // Map accuracy → similarity_score (ShadowingAttempt dùng similarity_score)
        similarity_score: item.accuracy || item.similarity_score || 0,
      }))
    );

    if (!created || created.length === 0) {
      throw new Error("Failed to create shadowing attempts");
    }

    // 3. Cập nhật streak
    await updateUserStreak(userId);

    // 4. Auto unlock (dùng shadowingPlanId)
    const firstAttempt = created[0];
    const accuracy = firstAttempt.similarity_score || 0;

    const unlockResult = await autoUnlockAfterComplete(
      userId,
      shadowingPlanId,
      SessionType.SHADOWING,
      accuracy,
      day_study_id
    );

    // 5. Return
    return res.status(200).json(
      ApiResponse.success(
        {
          attempts: created,
          accuracy,
          passed: accuracy >= 70,
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
