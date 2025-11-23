import { Types } from "mongoose";
import { DictationAttempt, DictationPlan } from "../models";
import { SubmissionType } from "../models/enums/SubmissionType";

/**
 * Cập nhật DictationPlan dựa vào toàn bộ DictationAttempt
 */
export const updateDictationPlanService = async (
  dictationId: string,
  userId: string,
  submitType: SubmissionType = SubmissionType.PRACTICE
) => {
  const dictationObjectId = new Types.ObjectId(dictationId);
  const userObjectId = new Types.ObjectId(userId);

  const attemptFilter =
    submitType === SubmissionType.PRACTICE
      ? {
          user_id: userObjectId,
          dictation_id: dictationObjectId,
          $or: [
            { submit_type: submitType },
            { submit_type: { $exists: false } },
          ],
        }
      : {
          user_id: userObjectId,
          dictation_id: dictationObjectId,
          submit_type: submitType,
        };

  const attempts = await DictationAttempt.find(attemptFilter)
    .sort({ createdAt: -1 })
    .lean();

  if (!attempts.length) {
    console.log("No dictation attempts to update plan");
    return null;
  }

  const totalAttempts = attempts.length;
  const latestAttempt = attempts[0];
  const avgAccuracy =
    attempts.reduce((sum, a) => sum + (a.accuracy || 0), 0) / totalAttempts;

  const planFilter =
    submitType === SubmissionType.PRACTICE
      ? {
          dictation_id: dictationObjectId,
          user_id: userObjectId,
          $or: [
            { submit_type: submitType },
            { submit_type: { $exists: false } },
          ],
        }
      : {
          dictation_id: dictationObjectId,
          user_id: userObjectId,
          submit_type: submitType,
        };

  const plan = await DictationPlan.findOneAndUpdate(
    planFilter,
    {
      $set: {
        latest_attempt: latestAttempt._id,
        total_attempts: totalAttempts,
        accuracy_overall: Math.round(avgAccuracy),
        submit_type: submitType,
        updated_at: new Date(),
      },
      $setOnInsert: {
        user_id: userObjectId,
        dictation_id: dictationObjectId,
        submit_type: submitType,
        start_date: new Date(),
      },
    },
    { new: true, upsert: true }
  );

  return plan;
};
