import { Types } from "mongoose";
import { DictationAttempt, DictationPlan } from "../models";

/**
 * Cập nhật DictationPlan dựa vào toàn bộ DictationAttempt
 */
export const updateDictationPlanService = async (dictationId: string, userId: string) => {
    const dictationObjectId = new Types.ObjectId(dictationId);
    const userObjectId = new Types.ObjectId(userId);

    // Lấy toàn bộ attempts của user với dictation đó
    const attempts = await DictationAttempt.find({
        user_id: userObjectId,
        dictation_id: dictationObjectId,
    })
        .sort({ createdAt: -1 }) // để lấy latest
        .lean();

    if (!attempts.length) {
        console.log("❌ Không có attempt nào để cập nhật plan.");
        return null;
    }

    // Tính toán
    const totalAttempts = attempts.length;
    const latestAttempt = attempts[0]; // do sort theo createdAt DESC
    const avgAccuracy =
        attempts.reduce((sum, a) => sum + (a.accuracy || 0), 0) / totalAttempts;

    // Cập nhật hoặc tạo mới DictationPlan
    const plan = await DictationPlan.findOneAndUpdate(
        { dictation_id: dictationObjectId, user_id: userObjectId },
        {
            $set: {
                latest_attempt: latestAttempt._id,
                total_attempts: totalAttempts,
                accuracy_overall: Math.round(avgAccuracy),
                updated_at: new Date(),
            },
            $setOnInsert: {
                start_date: new Date(),
            },
        },
        { new: true, upsert: true }
    );

    return plan;
};
