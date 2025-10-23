import mongoose from "mongoose";
import { FlashCardAttempt, FlashCardPlan, IFlashCardAttempt } from "../models"

export const getFlashCardByIdService = async (id: string): Promise<any> => {
  const result = await FlashCardPlan.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    {
      $lookup: {
        from: "topicvocabularies",
        localField: "topic_vocabulary_id",
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

export const submitFlashCardService = async (
  flashCardAttempt: IFlashCardAttempt
): Promise<IFlashCardAttempt | null> => {
  try {
    const newAttempt = await FlashCardAttempt.create(flashCardAttempt);
    return newAttempt;
  } catch (err) {
    console.error("Submit FlashCard error:", err);
    return null;
  }
};

export const getHistoryFlashCardByTopicService = async (topicId: string, userId: string) => {
  const result = await FlashCardAttempt.aggregate([
    // 1️⃣ Lọc theo topic và user
    {
      $match: {
        topic_vocabulary_id: new mongoose.Types.ObjectId(topicId),
        user_id: new mongoose.Types.ObjectId(userId),
      },
    },

    // 2️⃣ Sắp xếp để lấy lịch sử mới nhất trước
    { $sort: { started_at: -1 } },

    // 3️⃣ Tách mảng results để join từng vocabulary
    { $unwind: { path: "$results", preserveNullAndEmptyArrays: true } },

    // 4️⃣ Join sang bảng vocabularies để lấy thông tin từ vựng
    {
      $lookup: {
        from: "vocabularies",
        localField: "results.vocabulary_id",
        foreignField: "_id",
        as: "vocabInfo",
      },
    },
    { $unwind: { path: "$vocabInfo", preserveNullAndEmptyArrays: true } },

    // 5️⃣ Gom nhóm lại theo mỗi attempt
    {
      $group: {
        _id: "$_id",
        started_at: { $first: "$started_at" },
        finished_at: { $first: "$finished_at" },
        accuracy: { $first: "$accuracy" },
        topic_vocabulary_id: { $first: "$topic_vocabulary_id" },
        avg_time: {
          $avg: "$results.response_time",
        },
        logs: {
          $push: {
            vocab_id: "$results.vocabulary_id",
            vocab_word: "$vocabInfo.word",
            eval_type: "$results.eval_type",
            response_time: "$results.response_time",
          },
        },
      },
    },

    // 6️⃣ Định dạng lại dữ liệu đầu ra cho đẹp
    {
      $project: {
        _id: { $toString: "$_id" },
        started_at: {
          $dateToString: { format: "%Y-%m-%dT%H:%M:%S.%LZ", date: "$started_at" },
        },
        finished_at: {
          $dateToString: { format: "%Y-%m-%dT%H:%M:%S.%LZ", date: "$finished_at" },
        },
        accuracy: 1,
        avg_time: { $round: [{ $divide: ["$avg_time", 1000] }, 2] }, // đổi ms -> giây
        logs: {
          $map: {
            input: "$logs",
            as: "log",
            in: {
              vocab_id: { $toString: "$$log.vocab_id" },
              vocab_word: "$$log.vocab_word",
              eval_type: "$$log.eval_type",
              response_time: "$$log.response_time",
            },
          },
        },
      },
    },

    // 7️⃣ Sắp xếp lại để đảm bảo thứ tự đúng (attempt mới nhất ở trên)
    { $sort: { started_at: -1 } },
  ]);

  return result;
};