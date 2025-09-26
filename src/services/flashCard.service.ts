import mongoose from "mongoose";
import { FlashCardAttempt, FlashCardPlan, IFlashCardAttempt } from "../models"
import { FlashCardAttemptDetail, IFlashCardAttemptDetail } from "../models/flashcard_attempt_detail.model";

export const getFlashCardByIdService = async (id: string): Promise<any> => {
    const result = await FlashCardPlan.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        {
            $lookup: {
                from: "topics",
                localField: "topic_id",
                foreignField: "_id",
                as: "topic",
            },
        },
        { $unwind: "$topic" },
        {
            $lookup: {
                from: "vocabularies",
                localField: "topic.vocabularies_id",
                foreignField: "_id",
                as: "topic.vocabularies",
            },
        },
        {
            $addFields: {
                "topic.vocabularies": { $slice: ["$topic.vocabularies", 20] },
            },
        },
        {
            $project: {
                "topic.vocabularies._id": 1,
                "topic.vocabularies.word": 1,
                "topic.vocabularies.definition": 1,
                "topic.vocabularies.phonetic": 1,
                "topic.vocabularies.weight": 1,
                "topic._id": 1,
                _id: 0
            },
        },
    ]);
    return result;
}

export const submitFlashCardService = async (flashCardAttempt: IFlashCardAttempt, logs: IFlashCardAttemptDetail[]): Promise<boolean> => {
    try {
        const newFlashCardAttempt = await FlashCardAttempt.create(flashCardAttempt);
        const logsWithAttemptId = logs.map(log => ({
            ...log,
            attempt_id: newFlashCardAttempt._id
        }));
        await FlashCardAttemptDetail.insertMany(logsWithAttemptId);
        return true;
    }
    catch (err) {
        console.error("Submit FlashCard error:", err);
        return false;
    }

}

export const getHistoryFlashCardByTopicService = async (topicId: string, userId: string) => {
  // Lấy tất cả attempts theo topic_id
  const attempts = await FlashCardAttempt.find({ topic_id: topicId, user_id: userId })
    .sort({ started_at: -1 })
    .lean();

  // Map từng attempt sang format FE cần
  const result = await Promise.all(
    attempts.map(async (attempt) => {
      // Lấy logs cho mỗi attempt
      const details = await FlashCardAttemptDetail.find({
        attempt_id: attempt._id,
      })
        .lean();

      // Tính avg_time
      const avg_time =
        details.length > 0
          ? Math.round(
              details.reduce((sum, d) => sum + d.response_time, 0) /
                details.length /
                1000 // → giây
            )
          : 0;

      return {
        _id: attempt._id.toString(),
        started_at: attempt.started_at.toISOString(),
        finished_at: attempt.finished_at?.toISOString() || "",
        accuracy: attempt.accuracy,
        avg_time,
        total: attempt.total_count,
        logs: details.map((d) => ({
          vocab_id: d.vocab_id.toString(),
          eval_type: d.eval_type,
          response_time: d.response_time,
          attempted_at: d.attempted_at.toISOString(),
        })),
      };
    })
  );

  return result;
};