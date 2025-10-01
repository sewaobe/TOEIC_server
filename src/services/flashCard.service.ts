import mongoose, { Types } from "mongoose";
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
  const result = await FlashCardAttempt.aggregate([
    // Bước 1: Tìm các attempt khớp với topic và user
    {
      $match: {
        topic_id: new mongoose.Types.ObjectId(topicId),
        user_id: new mongoose.Types.ObjectId(userId),
      }
    },
    // Sắp xếp trước khi join để hiệu quả hơn
    { $sort: { started_at: -1 } },

    // Bước 2: Join với collection `flashcardattemptdetails`
    {
      $lookup: {
        from: 'flashcardattemptdetails', // Tên collection trong DB (thường là số nhiều, viết thường)
        localField: '_id',
        foreignField: 'attempt_id',
        as: 'logs', // Tên mảng chứa kết quả join
      }
    },

    // Bước 3: Định dạng lại dữ liệu để giống với cấu trúc bạn cần
    {
      $project: {
        _id: 1,
        started_at: 1,
        finished_at: 1,
        accuracy: 1,
        total: '$total_count',
        logs: 1,
        // Tính avg_time ngay trong DB
        avg_time: {
          $cond: {
            if: { $gt: [{ $size: '$logs' }, 0] },
            then: { $divide: [{ $sum: '$logs.response_time' }, { $size: '$logs' }] },
            else: 0
          }
        }
      }
    },

    // Các bước phụ để join `word` vào trong `logs`
    { $unwind: { path: '$logs', preserveNullAndEmptyArrays: true } }, // Tách mảng logs
    {
      $lookup: {
        from: 'vocabularies', // Tên collection vocabularies
        localField: 'logs.vocab_id',
        foreignField: '_id',
        as: 'logs.vocabInfo'
      }
    },
    { $unwind: { path: '$logs.vocabInfo', preserveNullAndEmptyArrays: true } },

    // Bước 4: Gom nhóm lại theo attempt ban đầu
    {
      $group: {
        _id: '$_id',
        started_at: { $first: '$started_at' },
        finished_at: { $first: '$finished_at' },
        accuracy: { $first: '$accuracy' },
        total: { $first: '$total' },
        avg_time: { $first: '$avg_time' },
        logs: {
          $push: { // Tạo lại mảng logs với đầy đủ thông tin
            vocab_id: '$logs.vocab_id',
            word: '$logs.vocabInfo.word',
            eval_type: '$logs.eval_type',
            response_time: '$logs.response_time',
            attempted_at: '$logs.attempted_at'
          }
        }
      }
    },

    // Bước 5: Định dạng output cuối cùng
    {
      $project: {
        _id: { $toString: '$_id' },
        started_at: { $dateToString: { format: "%Y-%m-%dT%H:%M:%S.%LZ", date: "$started_at" } },
        finished_at: { $dateToString: { format: "%Y-%m-%dT%H:%M:%S.%LZ", date: "$finished_at" } },
        accuracy: 1,
        total: 1,
        avg_time: { $round: [{ $divide: ['$avg_time', 1000] }, 2] }, // Chia 1000 để ra giây và làm tròn
        logs: {
          $map: {
            input: '$logs',
            as: 'log',
            in: {
              vocab_id: { $toString: '$$log.vocab_id' },
              vocab_word: '$$log.word',
              eval_type: '$$log.eval_type',
              response_time: '$$log.response_time',
              attempted_at: { $dateToString: { format: "%Y-%m-%dT%H:%M:%S.%LZ", date: "$$log.attempted_at" } }
            }
          }
        }
      }
    },
    // Sắp xếp lại lần cuối vì group có thể làm thay đổi thứ tự
    { $sort: { started_at: -1 } },
  ]);

  return result;
};