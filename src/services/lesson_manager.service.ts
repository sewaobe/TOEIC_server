import mongoose, { Model, Types } from "mongoose";
import {
  ActivityType,
  ILessonManager,
  LessonManager,
  LessonManagerNodeRole,
  LessonManagerUnitType,
  RecommendedActivity,
} from "../models/lesson_manager.model";
import { PaginationResult } from "../dto/PaginationResult";
import { TestStatus } from "../models/enums/TestStatus";
import { PartType } from "../models/enums/PartType";
import { Lesson } from "../models/lesson.model";
import { TopicVocabulary } from "../models/topic_vocabulary.model";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { Quiz } from "../models/quiz.model";

const UNIT_TYPES: LessonManagerUnitType[] = [
  "foundation",
  "skill_drill",
  "mixed_practice",
  "exam_practice",
  "remedial",
];

const CTV_NODE_ROLES: LessonManagerNodeRole[] = ["normal", "support"];
const ACTIVITY_TYPES: ActivityType[] = [
  "lesson",
  "vocabulary",
  "dictation",
  "shadowing",
  "quiz",
];

export const TOEIC_TARGET_TAGS = [
  "Tranh tả người",
  "Tranh tả vật",
  "Câu hỏi WHAT",
  "Câu hỏi WHO",
  "Câu hỏi WHERE",
  "Câu hỏi WHEN",
  "Câu hỏi HOW",
  "Câu hỏi WHY",
  "Câu hỏi YES/NO",
  "Câu hỏi đuôi",
  "Câu hỏi lựa chọn",
  "Câu yêu cầu, đề nghị",
  "Câu trần thuật",
  "Câu hỏi về chủ đề, mục đích",
  "Câu hỏi về danh tính người nói",
  "Câu hỏi về chi tiết cuộc hội thoại",
  "Câu hỏi về hành động tương lai",
  "Câu hỏi kết hợp bảng biểu",
  "Câu hỏi về hàm ý câu nói",
  "Chủ đề: Company - General Office Work",
  "Chủ đề: Company - Personnel",
  "Chủ đề: Company - Event, Project",
  "Chủ đề: Company - Facility",
  "Chủ đề: Shopping, Service",
  "Chủ đề: Order, delivery",
  "Chủ đề: Transportation",
  "Câu hỏi về yêu cầu, gợi ý",
  "Câu hỏi về danh tính, địa điểm",
  "Câu hỏi về chi tiết",
  "Dạng bài: Telephone message - Tin nhắn thoại",
  "Dạng bài: Announcement - Thông báo",
  "Dạng bài: News report, Broadcast - Bản tin",
  "Dạng bài: Talk - Bài phát biểu, diễn văn",
  "Dạng bài: Excerpt from a meeting - Trích dẫn từ buổi họp",
  "Câu hỏi yêu cầu, gợi ý",
  "Câu hỏi từ loại",
  "Câu hỏi ngữ pháp",
  "Câu hỏi từ vựng",
  "Danh từ",
  "Đại từ",
  "Tính từ",
  "Thì",
  "Trạng từ",
  "Động từ nguyên mẫu có to",
  "Giới từ",
  "Liên từ",
  "Mệnh đề quan hệ",
  "Cấu trúc so sánh",
  "Thể",
  "Phân từ và Cấu trúc phân từ",
  "Câu hỏi điền câu vào đoạn văn",
  "Hình thức: Thư điện tử / Thư tay (Email / Letter)",
  "Hình thức: Thông báo / Văn bản hướng dẫn (Notice / Announcement)",
  "Câu hỏi tìm thông tin",
  "Câu hỏi tìm chi tiết sai",
  "Câu hỏi suy luận",
  "Câu hỏi điền câu",
  "Cấu trúc: một đoạn",
  "Cấu trúc: nhiều đoạn",
  "Dạng bài: Email / Letter – Thư điện tử / Thư tay",
  "Dạng bài: Form – Đơn từ / Biểu mẫu",
  "Dạng bài: Article / Review – Bài báo / Bài đánh giá",
  "Dạng bài: Advertisement – Quảng cáo",
  "Dạng bài: Text message chain – Chuỗi tin nhắn",
  "Câu hỏi tìm từ đồng nghĩa",
].filter((tag, index, tags) => tags.indexOf(tag) === index);

type LessonManagerFilters = {
  query?: string;
  part_type?: PartType;
  status?: TestStatus;
  unit_type?: LessonManagerUnitType;
  node_role?: LessonManagerNodeRole;
  target_tag?: string;
  score_from?: number;
  score_to?: number;
};

type ActivityOptionsQuery = {
  activity_type?: ActivityType;
  part_type?: PartType;
  query?: string;
  page?: number;
  limit?: number;
};

type NormalizedLessonManagerPayload = Pick<
  Partial<ILessonManager>,
  | "title"
  | "description"
  | "thumbnail"
  | "part_type"
  | "score_band"
  | "unit_type"
  | "node_role"
  | "target_tags"
  | "recommended_activity_order"
  | "lesson_ids"
  | "topic_vocabulary_ids"
  | "dictation_ids"
  | "shadowing_ids"
  | "quiz_ids"
  | "planned_completion_time"
  | "weight"
  | "status"
>;

const targetTagSet = new Set(TOEIC_TARGET_TAGS);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function computeLessonManagerWeight(
  scoreBand: { from: number; to: number },
  unitType: LessonManagerUnitType
): number {
  const mid = (scoreBand.from + scoreBand.to) / 2;
  const baseWeight = (mid - 200) / 790;
  const typeAdjust: Record<LessonManagerUnitType, number> = {
    foundation: -0.05,
    skill_drill: 0,
    mixed_practice: 0.03,
    exam_practice: 0.06,
    remedial: -0.08,
  };

  return Number(clamp01(baseWeight + typeAdjust[unitType]).toFixed(3));
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.ceil(parsed));
}

function assertObjectId(value: unknown, fieldName: string): Types.ObjectId {
  if (!value || !Types.ObjectId.isValid(String(value))) {
    throw new Error(`${fieldName} không hợp lệ`);
  }

  return new Types.ObjectId(String(value));
}

function validateScoreBand(scoreBand: any, strictWidth = false) {
  if (!scoreBand || typeof scoreBand !== "object") {
    throw new Error("score_band là bắt buộc");
  }

  const from = Number(scoreBand.from);
  const to = Number(scoreBand.to);

  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    throw new Error("score_band.from và score_band.to phải là số nguyên");
  }

  if (from < 200 || from > 990 || to < 200 || to > 990) {
    throw new Error("score_band phải nằm trong khoảng 200-990");
  }

  if (strictWidth ? from >= to : from > to) {
    throw new Error("score_band.from phải nhỏ hơn score_band.to");
  }

  const width = to - from;
  if (strictWidth && ![10, 20, 30, 40, 50].includes(width)) {
    throw new Error("Độ rộng score_band phải là 10, 20, 30, 40 hoặc 50");
  }

  return { from, to };
}

function normalizeTags(targetTags: unknown): string[] {
  if (!Array.isArray(targetTags)) return [];

  const tags = targetTags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);

  const invalid = tags.find((tag) => !targetTagSet.has(tag));
  if (invalid) {
    throw new Error(`target_tags không hợp lệ: ${invalid}`);
  }

  return tags;
}

function normalizeRecommendedActivities(input: unknown): RecommendedActivity[] {
  if (!Array.isArray(input)) return [];

  return input.map((item: any, index) => {
    if (!ACTIVITY_TYPES.includes(item?.activity_type)) {
      throw new Error("activity_type không hợp lệ");
    }

    return {
      activity_type: item.activity_type,
      activity_id: assertObjectId(item.activity_id, "activity_id"),
      estimated_minutes: toPositiveInt(item.estimated_minutes, 1),
      is_required: item.is_required !== false,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    };
  });
}

function deriveActivityIds(recommendedActivities: RecommendedActivity[]) {
  const ids = {
    lesson_ids: [] as Types.ObjectId[],
    topic_vocabulary_ids: [] as Types.ObjectId[],
    dictation_ids: [] as Types.ObjectId[],
    shadowing_ids: [] as Types.ObjectId[],
    quiz_ids: [] as Types.ObjectId[],
  };

  for (const activity of recommendedActivities) {
    if (activity.activity_type === "lesson") ids.lesson_ids.push(activity.activity_id);
    if (activity.activity_type === "vocabulary") ids.topic_vocabulary_ids.push(activity.activity_id);
    if (activity.activity_type === "dictation") ids.dictation_ids.push(activity.activity_id);
    if (activity.activity_type === "shadowing") ids.shadowing_ids.push(activity.activity_id);
    if (activity.activity_type === "quiz") ids.quiz_ids.push(activity.activity_id);
  }

  return ids;
}

function normalizeCtvPayload(payload: any, current?: ILessonManager): NormalizedLessonManagerPayload {
  const scoreBand = validateScoreBand(payload.score_band ?? current?.score_band);
  const unitType = payload.unit_type ?? current?.unit_type ?? "foundation";
  if (!UNIT_TYPES.includes(unitType)) {
    throw new Error("unit_type không hợp lệ");
  }

  const nodeRole = payload.node_role ?? current?.node_role ?? "normal";
  if (!CTV_NODE_ROLES.includes(nodeRole)) {
    throw new Error("CTV chỉ được chọn node_role là normal hoặc support");
  }

  const targetTags = normalizeTags(payload.target_tags ?? current?.target_tags ?? []);
  const recommendedActivities = normalizeRecommendedActivities(
    payload.recommended_activity_order ?? current?.recommended_activity_order ?? []
  );
  const derivedIds = deriveActivityIds(recommendedActivities);
  const plannedCompletionTime = recommendedActivities.reduce(
    (sum, activity) => sum + activity.estimated_minutes,
    0
  );

  return {
    title: String(payload.title ?? current?.title ?? "").trim(),
    description: String(payload.description ?? current?.description ?? ""),
    thumbnail: String(payload.thumbnail ?? current?.thumbnail ?? ""),
    part_type: Number(payload.part_type ?? current?.part_type) as PartType,
    score_band: scoreBand,
    unit_type: unitType,
    node_role: nodeRole,
    target_tags: targetTags,
    recommended_activity_order: recommendedActivities,
    ...derivedIds,
    planned_completion_time: plannedCompletionTime,
    weight: computeLessonManagerWeight(scoreBand, unitType),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const VIETNAMESE_CHAR_CLASSES: Record<string, string> = {
  a: "aàáảãạăằắẳẵặâầấẩẫậ",
  d: "dđ",
  e: "eèéẻẽẹêềếểễệ",
  i: "iìíỉĩị",
  o: "oòóỏõọôồốổỗộơờớởỡợ",
  u: "uùúủũụưừứửữự",
  y: "yỳýỷỹỵ",
};

function buildVietnameseInsensitiveRegex(value: string): RegExp {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

  const pattern = Array.from(normalized)
    .map((char) => {
      if (/\s/.test(char)) return "\\s+";
      const lower = char.toLowerCase();
      const variants = VIETNAMESE_CHAR_CLASSES[lower];
      if (!variants) return escapeRegex(char);
      const escapedVariants = escapeRegex(variants + variants.toUpperCase());
      return `[${escapedVariants}]`;
    })
    .join("");

  return new RegExp(`^(?:\\[[^\\]]+\\]\\s*)?${pattern}$`, "i");
}

function applyListFilters(filter: any, filters: LessonManagerFilters) {
  if (filters.query) {
    filter.$or = [
      { title: { $regex: filters.query, $options: "i" } },
      { description: { $regex: filters.query, $options: "i" } },
    ];
  }

  if (filters.part_type !== undefined) filter.part_type = filters.part_type;
  if (filters.status) filter.status = filters.status;
  if (filters.unit_type) filter.unit_type = filters.unit_type;
  if (filters.node_role) filter.node_role = filters.node_role;
  if (filters.target_tag) {
    filter.target_tags = buildVietnameseInsensitiveRegex(filters.target_tag);
  }

  if (filters.score_from !== undefined || filters.score_to !== undefined) {
    if (filters.score_from !== undefined) filter["score_band.from"] = { $gte: filters.score_from };
    if (filters.score_to !== undefined) filter["score_band.to"] = { $lte: filters.score_to };
  }
}

function requireEditableStatus(status: TestStatus) {
  if (![TestStatus.DRAFT, TestStatus.REJECTED].includes(status)) {
    throw new Error("Chỉ có thể chỉnh sửa Lesson Manager ở trạng thái draft hoặc rejected");
  }
}

function requireSubmitReady(lessonManager: ILessonManager) {
  const scoreBand = validateScoreBand(lessonManager.score_band, true);
  if (!lessonManager.target_tags?.length) {
    throw new Error("target_tags không được để trống khi gửi duyệt");
  }
  if (!lessonManager.recommended_activity_order?.length) {
    throw new Error("recommended_activity_order không được để trống khi gửi duyệt");
  }
  if ((lessonManager.planned_completion_time || 0) <= 0) {
    throw new Error("planned_completion_time phải lớn hơn 0 khi gửi duyệt");
  }

  return scoreBand;
}

export const searchLessonManagerService = async (
  filters: LessonManagerFilters,
  page: number = 1,
  limit: number = 20
): Promise<PaginationResult<ILessonManager>> => {
  const currentPage = Math.max(1, page);
  const pageSize = Math.max(1, limit);
  const skip = (currentPage - 1) * pageSize;
  const filter: any = { status: filters.status ?? TestStatus.APPROVED };
  applyListFilters(filter, { ...filters, status: filter.status });

  const [items, total] = await Promise.all([
    LessonManager.find(filter)
      .skip(skip)
      .limit(pageSize)
      .sort({ created_at: -1 })
      .select(
        "title description thumbnail part_type score_band unit_type node_role target_tags planned_completion_time weight rating student_count status"
      )
      .exec(),
    LessonManager.countDocuments(filter).exec(),
  ]);

  return {
    data: items,
    pagination: {
      page: currentPage,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNext: skip + items.length < total,
      hasPrev: currentPage > 1,
    },
  };
};

export const getAllTopicTitlesService = async () => {
  const topics = await LessonManager.find({}, "title").exec();
  return topics.map((topic) => ({ id: topic._id, title: topic.title }));
};

export const getAllLessonManagerService = async (
  page: number,
  limit: number,
  userId: string,
  filters: LessonManagerFilters = {}
): Promise<PaginationResult<ILessonManager>> => {
  const currentPage = Math.max(1, page);
  const pageSize = Math.max(1, limit);
  const skip = (currentPage - 1) * pageSize;
  const filter: any = { created_by: userId };
  applyListFilters(filter, filters);

  const [items, total] = await Promise.all([
    LessonManager.find(filter)
      .skip(skip)
      .limit(pageSize)
      .sort({ created_at: -1 })
      .select("-next_unit_ids -prerequisite_unit_ids -auxiliary_unit_ids")
      .exec(),
    LessonManager.countDocuments(filter).exec(),
  ]);

  return {
    data: items,
    pagination: {
      page: currentPage,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNext: skip + items.length < total,
      hasPrev: currentPage > 1,
    },
  };
};

export const getLessonManagerByIdService = async (
  lessonManagerId: string,
  userId: string
) => {
  const lessonManager = await LessonManager.findOne({
    _id: lessonManagerId,
    created_by: userId,
  })
    .select("-next_unit_ids -prerequisite_unit_ids -auxiliary_unit_ids")
    .populate({
      path: "topic_vocabulary_ids",
      select:
        "title level topic description bgColor gradient iconName vocabularies_id",
      populate: { path: "vocabularies_id", select: "word definition" },
    })
    .populate({
      path: "lesson_ids",
      select:
        "title part_type topic summary planned_completion_time sections_id",
      populate: {
        path: "sections_id",
        select: "-created_at -updated_at -__v -lesson_id",
      },
    })
    .populate({ path: "dictation_ids", select: "-created_at -updated_at -__v" })
    .populate({ path: "shadowing_ids", select: "-created_at -updated_at -__v" })
    .populate({
      path: "quiz_ids",
      select: "-created_at -updated_at -__v",
      populate: {
        path: "question_ids",
        select: "name textQuestion choices correctAnswer",
      },
    });

  return lessonManager;
};

export const createLessonManagerService = async (
  payload: Partial<ILessonManager>,
  userId: string
) => {
  const normalized = normalizeCtvPayload(payload);
  const data = new LessonManager({
    ...normalized,
    status: TestStatus.DRAFT,
    created_by: userId,
  });
  return data.save();
};

export const updateLessonManagerService = async (
  payload: Partial<ILessonManager>,
  lessonManagerId: string,
  userId: string
) => {
  const current = await LessonManager.findOne({
    _id: lessonManagerId,
    created_by: userId,
  });

  if (!current) {
    throw new Error(
      "Không tìm thấy Lesson Manager hoặc bạn không có quyền cập nhật"
    );
  }

  requireEditableStatus(current.status);
  const normalized = normalizeCtvPayload(payload, current);

  const updated = await LessonManager.findOneAndUpdate(
    { _id: lessonManagerId, created_by: userId },
    { $set: normalized },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new Error(
      "Không tìm thấy Lesson Manager hoặc bạn không có quyền cập nhật"
    );
  }

  return updated;
};

export const deleteLessonManagerService = async (
  lessonManagerId: string,
  userId: string
) => {
  const lessonManager = await LessonManager.findOneAndDelete({
    _id: lessonManagerId,
    created_by: new mongoose.Types.ObjectId(userId),
    status: { $in: [TestStatus.DRAFT, TestStatus.REJECTED] },
  });

  if (!lessonManager) {
    throw new Error(
      "Không thể xóa Lesson Manager (không tồn tại hoặc không ở trạng thái draft/rejected)"
    );
  }

  return lessonManager;
};

export const updateStatusLessonManagerService = async (
  lessonManagerId: string,
  status: TestStatus,
  userId: string
) => {
  if (status !== TestStatus.PENDING) {
    throw new Error("CTV chỉ có thể gửi Lesson Manager sang trạng thái pending");
  }

  const lessonManager = await LessonManager.findOne({
    _id: lessonManagerId,
    created_by: userId,
  });

  if (!lessonManager) {
    throw new Error(
      "Không tìm thấy Lesson Manager hoặc bạn không có quyền cập nhật"
    );
  }

  requireEditableStatus(lessonManager.status);
  requireSubmitReady(lessonManager);
  lessonManager.status = TestStatus.PENDING;
  return lessonManager.save();
};

function buildActivityFilter(query: ActivityOptionsQuery, searchableFields: string[]) {
  const filter: any = {};
  if (query.part_type !== undefined) filter.part_type = query.part_type;
  if (query.query) {
    filter.$or = searchableFields.map((field) => ({
      [field]: { $regex: query.query, $options: "i" },
    }));
  }
  return filter;
}

function activityMinutes(type: ActivityType, item: any) {
  if (type === "lesson" || type === "quiz") {
    return toPositiveInt(item.planned_completion_time, type === "lesson" ? 20 : 10);
  }
  if (type === "dictation" || type === "shadowing") {
    return toPositiveInt((item.duration || 0) / 60, type === "dictation" ? 10 : 15);
  }
  return 5;
}

async function fetchActivityOptions(
  model: Model<any>,
  type: ActivityType,
  query: ActivityOptionsQuery,
  searchableFields: string[],
  select: string
) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.max(1, query.limit || 20);
  const skip = (page - 1) * limit;
  const filter = buildActivityFilter(query, searchableFields);
  const [items, total] = await Promise.all([
    model.find(filter).select(select).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);

  return {
    data: items.map((item: any) => ({
      _id: String(item._id),
      title: item.title,
      activity_type: type,
      part_type: item.part_type,
      estimated_minutes: activityMinutes(type, item),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: skip + items.length < total,
      hasPrev: page > 1,
    },
  };
}

export const getActivityOptionsService = async (query: ActivityOptionsQuery) => {
  const type = query.activity_type || "lesson";
  if (!ACTIVITY_TYPES.includes(type)) {
    throw new Error("activity_type không hợp lệ");
  }

  if (type === "lesson") {
    return fetchActivityOptions(
      Lesson,
      type,
      query,
      ["title", "summary"],
      "title summary part_type planned_completion_time created_at"
    );
  }

  if (type === "vocabulary") {
    return fetchActivityOptions(
      TopicVocabulary,
      type,
      query,
      ["title", "description"],
      "title description part_type created_at"
    );
  }

  if (type === "dictation") {
    return fetchActivityOptions(
      Dictation,
      type,
      query,
      ["title", "transcript"],
      "title transcript part_type duration created_at"
    );
  }

  if (type === "shadowing") {
    return fetchActivityOptions(
      Shadowing,
      type,
      query,
      ["title", "transcript"],
      "title transcript part_type duration created_at"
    );
  }

  return fetchActivityOptions(
    Quiz,
    type,
    query,
    ["title"],
    "title part_type planned_completion_time created_at"
  );
};
