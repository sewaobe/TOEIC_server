import { Model } from "mongoose";
import { SubmissionType } from "../models/enums/SubmissionType";

interface PlanUpdateOptions {
  planModel: Model<any>;
  attemptModel: Model<any>;
  matchFields: Record<string, any>;
  accuracyField: string;
  submitType: SubmissionType;
}

/**
 * Recompute plan stats for a given activity + submit type and upsert the plan document.
 */
export async function upsertPlanAfterAttempts({
  planModel,
  attemptModel,
  matchFields,
  accuracyField,
  submitType,
}: PlanUpdateOptions) {
  const baseMatch = { ...matchFields };
  const match =
    submitType === SubmissionType.PRACTICE
      ? {
          ...baseMatch,
          $or: [
            { submit_type: submitType },
            { submit_type: { $exists: false } },
          ],
        }
      : { ...baseMatch, submit_type: submitType };

  const stats = await attemptModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total_attempts: { $sum: 1 },
        avg_accuracy: { $avg: `$${accuracyField}` },
      },
    },
  ]);

  const latestAttempt = await attemptModel
    .findOne(match)
    .sort({ createdAt: -1 })
    .select("_id");

  const totalAttempts = stats[0]?.total_attempts || 0;
  const avgAccuracy = Math.round(stats[0]?.avg_accuracy || 0);

  const payload = {
    latest_attempt: latestAttempt?._id,
    total_attempts: totalAttempts,
    accuracy_overall: avgAccuracy,
    // submit_type is intentionally only in setOnInsert to avoid
    // conflicts when using complex query predicates during upsert
    updated_at: new Date(),
  };

  const setOnInsert = {
    ...matchFields,
    submit_type: submitType,
    created_at: new Date(),
  };

  // For the upsert filter, avoid using $or/$exists on `submit_type` because
  // MongoDB can produce conflicts when constructing the upsert document.
  // Use explicit equality for submit_type so the upsert is deterministic.
  const upsertFilter = { ...baseMatch, submit_type: submitType };

  return planModel.findOneAndUpdate(
    upsertFilter,
    { $set: payload, $setOnInsert: setOnInsert },
    { new: true, upsert: true }
  );
}
