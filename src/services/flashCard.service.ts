import mongoose from "mongoose";
import { FlashCardAttempt,  IFlashCardAttempt, TopicVocabulary } from "../models";
import { SubmissionType } from "../models/enums/SubmissionType";

export const getFlashCardByIdService = async (id: string): Promise<any> => {
  // id ở đây là id của TopicVocabulary
  const result = await TopicVocabulary.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    {
      $lookup: {
        from: "vocabularies",
        localField: "vocabularies_id",
        foreignField: "_id",
        as: "vocabularies",
      },
    },
    {
      $addFields: {
        vocabularies: { $slice: ["$vocabularies", 20] },
      },
    },
    {
      $project: {
        _id: 0,
        "topic._id": "$_id", // nếu FE đang dùng cấu trúc topic._id
        "topic.vocabularies._id": "$vocabularies._id",
        "topic.vocabularies.word": "$vocabularies.word",
        "topic.vocabularies.definition": "$vocabularies.definition",
        "topic.vocabularies.phonetic": "$vocabularies.phonetic",
        "topic.vocabularies.weight": "$vocabularies.weight",
      },
    },
  ]);

  return result;
};

export const submitFlashCardService = async (
  flashCardAttempt: IFlashCardAttempt
): Promise<IFlashCardAttempt | null> => {
  try {
    // Đảm bảo submit_type = PRACTICE cho practice mode
    const newAttempt = await FlashCardAttempt.create({
      ...flashCardAttempt,
      submit_type: flashCardAttempt.submit_type || SubmissionType.PRACTICE,
    });
    return newAttempt;
  } catch (err) {
    console.error("Submit FlashCard error:", err);
    return null;
  }
};

export const getHistoryFlashCardByTopicService = async (
  topicId: string,
  userId: string
) => {
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
          $dateToString: {
            format: "%Y-%m-%dT%H:%M:%S.%LZ",
            date: "$started_at",
          },
        },
        finished_at: {
          $dateToString: {
            format: "%Y-%m-%dT%H:%M:%S.%LZ",
            date: "$finished_at",
          },
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
