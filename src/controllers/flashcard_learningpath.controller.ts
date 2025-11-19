// src/controllers/flashcard_learningpath.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { FlashCardPlan } from "../models/flashcard_plan.model";
import { TopicVocabulary } from "../models/topic_vocabulary.model";
import { FlashCardAttempt } from "../models/flashcard_attempt.model";
import { ApiResponse } from "../utils/ApiResponse";
import { SessionType } from "../models/enums/SessionType";
import { updateUserStreak } from "../services/streak.service";
import { autoUnlockAfterComplete } from "../services/auto_unlock.service";

/**
 * Lấy chi tiết flashcard plan cho learning path
 * @param id - flashcard_plan_id (từ DayStudy)
 */
export const getFlashCardPlanController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: flashCardPlanId } = req.params;

    // 1. Query FlashCardPlan để lấy flashcard_id
    const flashCardPlan = await FlashCardPlan.findById(flashCardPlanId);
    if (!flashCardPlan) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy flashcard plan"));
    }

    // 2. Lấy topic vocabulary thực tế
    const topicVocab = await TopicVocabulary.findById(
      flashCardPlan.topic_vocabulary_id
    ).lean();

    if (!topicVocab) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy flashcard topic"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(topicVocab, "Lấy flashcard thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * Submit flashcard (học xong flashcard)
 * @param id - flashcard_plan_id (từ DayStudy)
 */
export const submitFlashCardController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: flashCardPlanId } = req.params;
    const userId = new Types.ObjectId(req.user._id);
    const { learned_words, time_spent, day_study_id } = req.body;

    // 1. Query FlashCardPlan để lấy flashcard_id
    const flashCardPlan = await FlashCardPlan.findById(flashCardPlanId);
    if (!flashCardPlan) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy flashcard plan"));
    }

    const topicVocabId = flashCardPlan.topic_vocabulary_id.toString();

    // 2. Tạo FlashCardAttempt
    const now = new Date();
    const attempt = await FlashCardAttempt.create({
      user_id: userId,
      topic_vocabulary_id: topicVocabId,
      learned_words: learned_words || [],
      time_spent: time_spent || 0,
      completed_at: now,
    });

    // 3. Cập nhật streak
    await updateUserStreak(userId);

    // 4. Auto unlock (dùng flashCardPlanId)
    const unlockResult = await autoUnlockAfterComplete(
      userId,
      flashCardPlanId,
      SessionType.FLASH_CARD,
      100, // Flashcard luôn pass
      day_study_id
    );

    // 5. Return
    return res.status(201).json(
      ApiResponse.success(
        {
          attempt_id: attempt._id,
          learned_count: learned_words?.length || 0,
          duration: time_spent || 0,
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
