// src/controllers/flashcard_learningpath.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { TopicVocabulary } from "../models/topic_vocabulary.model";
import { FlashCardAttempt } from "../models/flashcard_attempt.model";
import { FlashCardPlan } from "../models/flashcard_plan.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { SubmissionType } from "../models/enums/SubmissionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";
import { upsertPlanAfterAttempts } from "../services/plan_submission.service";

/**
 * L?y chi ti?t flashcard plan cho learning path
 * @param id - flashcard_plan_id (t? DayStudy)
 */
export const getFlashCardPlanController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: rawId } = req.params;

    // Here `rawId` is the TopicVocabulary metadata id
    const topicVocabId = rawId;
    const topicVocab = await TopicVocabulary.findById(topicVocabId).lean();
    if (!topicVocab) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm th?y flashcard topic"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(topicVocab, "L?y flashcard thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Submit flashcard (h?c xong flashcard)
 * @param id - flashcard_plan_id (t? DayStudy)
 */
export const submitFlashCardController = async (
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
    const { learned_words, time_spent, day_study_id, results } = req.body;
    const submitType = SubmissionType.LEARNING_PATH;
    const topicVocabId = new Types.ObjectId(rawId);
    const accuracy =
      typeof req.body.accuracy === "number" ? Number(req.body.accuracy) : 100;

    // Validate day_study_id (b?t bu?c d? xác d?nh ngày h?c)
    if (!day_study_id) {
      return res.status(400).json(ApiResponse.fail("day_study_id là b?t bu?c"));
    }

    // Parse results array nếu có
    const resultsArray = Array.isArray(results)
      ? results.map((r: any) => ({
        vocabulary_id: new Types.ObjectId(r.vocabulary_id),
        answer_event_id: r.answer_event_id || new Types.ObjectId().toString(),
        action: r.action,
        response_time: Number(r.response_time || 0),
        attempted_at: r.attempted_at ? new Date(r.attempted_at) : new Date(),
      }))
      : [];

    // 1. T?o FlashCardAttempt (luu metadata id)
    const now = new Date();
    const attempt = await FlashCardAttempt.create({
      user_id: userId,
      topic_vocabulary_id: topicVocabId,
      submit_type: submitType,
      accuracy,
      results: resultsArray,
      learned_words: learned_words || [],
      time_spent: time_spent || 0,
      started_at: now,
      finished_at: now,
      day_study_id: day_study_id ? new Types.ObjectId(day_study_id) : undefined,
    });

    // 2. C?p nh?t/kh?i t?o FlashCardPlan cho lo?i n?p này
    const plan = await upsertPlanAfterAttempts({
      planModel: FlashCardPlan,
      attemptModel: FlashCardAttempt,
      matchFields: {
        user_id: userId,
        topic_vocabulary_id: topicVocabId,
      },
      accuracyField: "accuracy",
      submitType,
    });

    // 3. C?p nh?t streak (luu t?i user_progress)
    await updateUserStreak(userId);

    // 4. Auto unlock
    const unlockResult = await autoUnlockAfterComplete(
      userId,
      topicVocabId.toString(),
      SessionType.FLASH_CARD,
      accuracy,
      day_study_id
    );

    // 5. Return
    return res.status(201).json(
      ApiResponse.success(
        {
          attempt_id: attempt._id,
          learned_count: learned_words?.length || 0,
          duration: time_spent || 0,
          plan_summary: {
            total_attempts: plan?.total_attempts ?? 1,
            accuracy_overall: plan?.accuracy_overall ?? accuracy,
          },
          ...unlockResult.unlock_result,
        },
        unlockResult.unlocked
          ? unlockResult.message
          : "Hoàn thành flashcard thành công"
      )
    );
  } catch (error) {
    next(error);
  }
};
