import { Types } from "mongoose";
import { Dictation, IDictation } from "../models/dictation.model";
import { DictationAttempt } from "../models/dictation_attempt.model";
import { appEvents } from "../core/appEvents";
import { TestStatus } from "../models/enums/TestStatus";

export const getAllDictationService = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;

  const total = await Dictation.countDocuments();

  const dictations = await Dictation.find()
    .skip(skip)
    .limit(limit)
    .sort({ created_at: -1, _id: -1 });

  return {
    items: dictations,
    total,
    page,
    pageCount: Math.ceil(total / limit),
  };
};

export const getDictationByIdService = async (dictationId: string) => {
  const objectId = new Types.ObjectId(dictationId);

  const dictation = await Dictation.findById(objectId).sort({ created_at: -1 });
  return dictation;
};

export const createDictationService = async (payload: IDictation) => {
  // Tạo mới dictation
  const dictation = (await new Dictation(payload).save()) as IDictation & {
    _id: Types.ObjectId;
  };

  if (!dictation) {
    throw new Error("Failed to create dictation");
  }

  await appEvents.emitAsync("dictation.created", dictation);

  return dictation;
};

export const updateDictationService = async (
  payload: Partial<IDictation>,
  dictationId: string
) => {
  const updated = await Dictation.findByIdAndUpdate(dictationId, payload, {
    new: true, // trả về document mới sau khi update
    runValidators: true, // đảm bảo validation schema được áp dụng
  });

  if (!updated) {
    throw new Error("Dictation not found or update failed");
  }

  await appEvents.emitAsync("dictation.updated", updated);

  return updated;
};

export const deleteDictationService = async (dictationId: string) => {
  const deleted = await Dictation.findByIdAndDelete(dictationId);
  return deleted;
};

export const getAllDictationPracticeService = async (
  filters?: {
    part_type?: number;
    tags?: string[];
    level?: string;
    practice_status?: "all" | "unpracticed" | "practiced";
    sort?: string;
  },
  userId?: string,
  page = 1,
  limit = 9
) => {
  // Build query với status APPROVED bắt buộc
  const query: any = { status: TestStatus.APPROVED };

  if (filters) {
    const { part_type, tags, level } = filters;

    // Filter theo part_type
    if (typeof part_type === "number" && !isNaN(part_type)) {
      query.part_type = part_type;
    }

    // Filter theo tags (match any tag trong array)
    if (Array.isArray(tags) && tags.length > 0) {
      query.tags = { $in: tags };
    }

    // Filter theo level
    if (level && typeof level === "string") {
      query.level = level;
    }
  }

  const practicedDictationIds =
    userId && filters?.practice_status && filters.practice_status !== "all"
      ? await DictationAttempt.distinct("dictation_id", {
          user_id: new Types.ObjectId(userId),
        })
      : [];

  if (filters?.practice_status === "practiced") {
    query._id = { $in: practicedDictationIds };
  }

  if (filters?.practice_status === "unpracticed") {
    query._id = { $nin: practicedDictationIds };
  }

  const sortMap: Record<string, any> = {
    newest: { created_at: -1, _id: -1 },
    oldest: { created_at: 1, _id: 1 },
    level_asc: { level: 1, created_at: -1, _id: -1 },
    level_desc: { level: -1, created_at: -1, _id: -1 },
  };
  const sort = sortMap[filters?.sort || "newest"] || sortMap.newest;
  const skip = (page - 1) * limit;
  const total = await Dictation.countDocuments(query);

  const dictations = await Dictation.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  // Nếu có userId, lấy thêm stats từ DictationAttempt
  if (userId) {
    const dictationIds = dictations.map((d: any) => d._id);

    // Aggregate để lấy stats cho từng dictation
    const stats = await DictationAttempt.aggregate([
      {
        $match: {
          user_id: new Types.ObjectId(userId),
          dictation_id: { $in: dictationIds },
        },
      },
      {
        $group: {
          _id: "$dictation_id",
          attemptCount: { $sum: 1 },
          bestAccuracy: { $max: "$accuracy" },
          avgAccuracy: { $avg: "$accuracy" },
        },
      },
    ]);

    // Map stats vào dictations
    const statsMap = new Map(stats.map((s) => [s._id.toString(), s]));

    const items = dictations.map((dict: any) => ({
      ...dict,
      userStats: statsMap.get(dict._id.toString()) || null,
    }));

    return {
      items,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  return {
    items: dictations,
    total,
    page,
    pageCount: Math.ceil(total / limit),
  };
};
