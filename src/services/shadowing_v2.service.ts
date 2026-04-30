import { Types } from "mongoose";
import { Shadowing } from "../models/shadowing.model";
import { TestStatus } from "../models/enums/TestStatus";

export type ShadowingV2Category = "ALL" | "TOEIC" | "TED";
export type ShadowingV2Level = "ALL" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type ShadowingV2Sort = "newest" | "durationAsc" | "durationDesc" | "progressDesc";

export type ShadowingV2ListQuery = {
  category: ShadowingV2Category;
  level: ShadowingV2Level;
  sortType?: ShadowingV2Sort;
  limit: number;
  page: number;
};

const CATEGORY_TAGS: Record<Exclude<ShadowingV2Category, "ALL">, string[]> = {
  TOEIC: ["Toeic", "TOEIC", "toeic"],
  TED: ["TED", "Ted", "ted"],
};

const resolveCategory = (
  tags: string[] | undefined
): Exclude<ShadowingV2Category, "ALL"> => {
  const normalized = (tags || []).map((tag) => tag.toLowerCase());

  if (normalized.includes("toeic")) {
    return "TOEIC";
  }

  return "TED";
};

const isNewLesson = (createdAt?: Date) => {
  if (!createdAt) {
    return false;
  }

  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(createdAt).getTime() <= fourteenDaysMs;
};

const getNewThreshold = () => {
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - fourteenDaysMs);
};

const buildListQuery = async (
  filters: Record<string, any>,
  skip: number,
  limit: number,
  sort: Record<string, 1 | -1> = { created_at: -1 }
) => {
  const [total, shadowings] = await Promise.all([
    Shadowing.countDocuments(filters),
    Shadowing.find(filters)
      .select("title level tags thumbnailUrl audio_url duration created_at")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return { total, shadowings };
};

export const getShadowingV2ListService = async (query: ShadowingV2ListQuery) => {
  const page = query.page > 0 ? query.page : 1;
  const limit = query.limit > 0 ? query.limit : 10;
  const skip = (page - 1) * limit;

  const baseFilters: Record<string, any> = {
    status: TestStatus.APPROVED,
  };

  if (query.level !== "ALL") {
    baseFilters.level = query.level;
  }

  if (query.category !== "ALL") {
    const filters = {
      ...baseFilters,
      tags: { $in: CATEGORY_TAGS[query.category] },
    };

    const { total, shadowings } = await buildListQuery(filters, skip, limit);

    const items = shadowings.map((shadowing) => ({
      id: shadowing._id?.toString(),
      title: shadowing.title,
      level: shadowing.level,
      category: resolveCategory(shadowing.tags),
      thumbnailUrl: shadowing.thumbnailUrl || "",
      audioUrl: shadowing.audio_url || "",
      duration: shadowing.duration || 0,
      createdAt: shadowing.created_at?.toISOString?.() || "",
      isNew: isNewLesson(shadowing.created_at),
    }));

    return {
      items,
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
    };
  }

  const newThreshold = getNewThreshold();

  const [toeicResult, tedResult, newResult] = await Promise.all([
    buildListQuery(
      {
        ...baseFilters,
        tags: { $in: CATEGORY_TAGS.TOEIC },
      },
      skip,
      limit,
      { created_at: 1 }
    ),
    buildListQuery(
      {
        ...baseFilters,
        tags: { $in: CATEGORY_TAGS.TED },
      },
      skip,
      limit,
      { created_at: 1 }
    ),
    buildListQuery(
      {
        ...baseFilters,
        created_at: { $gte: newThreshold },
      },
      skip,
      limit
    ),
  ]);

  const items = [...toeicResult.shadowings, ...tedResult.shadowings, ...newResult.shadowings].map(
    (shadowing) => ({
      id: shadowing._id?.toString(),
      title: shadowing.title,
      level: shadowing.level,
      category: resolveCategory(shadowing.tags),
      thumbnailUrl: shadowing.thumbnailUrl || "",
      audioUrl: shadowing.audio_url || "",
      duration: shadowing.duration || 0,
      createdAt: shadowing.created_at?.toISOString?.() || "",
      isNew: isNewLesson(shadowing.created_at),
    })
  );

  const total = toeicResult.total + tedResult.total + newResult.total;

  return {
    items,
    total,
    page,
    limit,
    pageCount: Math.ceil(total / (limit * 3)),
  };
};

export const getShadowingV2DetailService = async (shadowingId: string) => {
  const objectId = new Types.ObjectId(shadowingId);
  const shadowing = await Shadowing.findOne({
    _id: objectId,
    status: TestStatus.APPROVED,
  }).lean();

  return shadowing;
};
