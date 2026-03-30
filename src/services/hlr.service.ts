import { Types } from "mongoose";
import { UserVocabularyProgress, IUserVocabularyProgress } from "../models";
import { Vocabulary } from "../models";

/**
 * HLR Service - Half-Life Regression Algorithm
 *
 * Thuật toán Spaced Repetition của Duolingo để tối ưu hóa việc ôn tập từ vựng.
 * Module này HOÀN TOÀN ĐỘC LẬP với hệ thống IRT hiện có.
 *
 * Công thức: log2(h) = W_bias + W_right * sqrt(1 + right) + W_wrong * sqrt(1 + wrong) + wordWeight
 *
 * References:
 * - Duolingo HLR Paper: https://github.com/duolingo/halflife-regression
 */

// ============================================
// HLR CONSTANTS (Theo spec được cung cấp)
// ============================================

const HLR_CONSTANTS = {
  W_BIAS: 7.3409, // Bias weight
  W_RIGHT: 0.0068, // Weight cho số lần đúng
  W_WRONG: -0.1862, // Weight cho số lần sai (âm vì sai = quên nhanh hơn)
  DEFAULT_HALF_LIFE: 162.1, // Half-life mặc định (giờ) ~ 6.75 ngày
  MIN_HALF_LIFE: 1, // Tối thiểu 1 giờ
  MAX_HALF_LIFE: 8760, // Tối đa 365 ngày (8760 giờ)
} as const;

// ============================================
// TYPES
// ============================================

export interface HLRCalculationResult {
  halfLife: number; // Half-life mới (giờ)
  nextReview: Date; // Thời điểm ôn tập tiếp theo
}

export interface ReviewSessionItem {
  vocabulary_id: string;
  is_correct: boolean;
}

export interface ReviewQueueOptions {
  limit?: number;
  includeVocabularyDetails?: boolean;
}

export type MemoryStatus = "critical" | "review_soon" | "stable";

export interface ProgressLibraryOptions {
  page?: number;
  limit?: number;
  includeVocabularyDetails?: boolean;
  search?: string;
  sortBy?: "next_review" | "last_practiced" | "half_life";
  sortOrder?: "asc" | "desc";
}

export interface ProgressLibraryItem extends IUserVocabularyProgress {
  recall_probability: number;
  forgot_at: Date;
  memory_status: MemoryStatus;
}

const REVIEW_QUEUE_SCAN_MULTIPLIER = 5;
const REVIEW_QUEUE_MIN_SCAN = 200;

function getMemoryStatus(recallProbability: number): MemoryStatus {
  if (recallProbability < 0.4) return "critical";
  if (recallProbability < 0.7) return "review_soon";
  return "stable";
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================
// CORE HLR CALCULATION
// ============================================

/**
 * Tính toán Half-Life dựa trên thuật toán HLR của Duolingo
 *
 * @param wordWeight - Độ khó của từ vựng (từ Vocabulary.weight, range -0.5 to 0.5)
 * @param rightCount - Số lần trả lời đúng
 * @param wrongCount - Số lần trả lời sai
 * @returns HLRCalculationResult với halfLife (giờ) và nextReview (Date)
 *
 * Công thức:
 * log2(h) = W_bias + W_right * sqrt(1 + right) + W_wrong * sqrt(1 + wrong) + wordWeight
 * h = 2^log2(h)
 * nextReview = now + h (hours)
 */
export function calculateHLR(
  wordWeight: number,
  rightCount: number,
  wrongCount: number,
): HLRCalculationResult {
  const { W_BIAS, W_RIGHT, W_WRONG, MIN_HALF_LIFE, MAX_HALF_LIFE } =
    HLR_CONSTANTS;

  // Bước 1: Tính log2(h) theo công thức HLR
  // sqrt(1 + count) để smooth contribution của mỗi lần practice
  const rightContribution = W_RIGHT * Math.sqrt(1 + rightCount);
  const wrongContribution = W_WRONG * Math.sqrt(1 + wrongCount);

  const log2h = W_BIAS + rightContribution + wrongContribution + wordWeight;

  // Bước 2: Tính h = 2^log2(h) (đơn vị: giờ)
  let halfLife = Math.pow(2, log2h);

  // Bước 3: Clamp giá trị trong khoảng hợp lệ
  halfLife = Math.max(MIN_HALF_LIFE, Math.min(MAX_HALF_LIFE, halfLife));

  // Bước 4: Tính thời điểm ôn tập tiếp theo
  // nextReview = now + halfLife (convert giờ -> milliseconds)
  const now = new Date();
  const nextReviewMs = now.getTime() + halfLife * 60 * 60 * 1000;
  const nextReview = new Date(nextReviewMs);

  return {
    halfLife: Math.round(halfLife * 100) / 100, // Làm tròn 2 chữ số thập phân
    nextReview,
  };
}

/**
 * Tính xác suất user còn nhớ từ (Recall Probability)
 * Công thức Duolingo: p = 2^(-t/h)
 *
 * @param halfLifeHours - Half-life hiện tại (giờ)
 * @param lastPracticedAt - Thời điểm practice gần nhất
 * @returns Xác suất nhớ (0-1), ví dụ 0.75 = 75%
 *
 * Ví dụ:
 * - halfLife = 162h, lastPracticed = 3 ngày trước (72h)
 * - p = 2^(-72/162) = 0.734 = 73.4% chance còn nhớ
 */
export function calculateRecallProbability(
  halfLifeHours: number,
  lastPracticedAt: Date,
): number {
  const now = new Date();
  const deltaMs = now.getTime() - lastPracticedAt.getTime();
  const deltaHours = deltaMs / (1000 * 60 * 60);

  // Nếu chưa từng practice hoặc delta âm, return 1 (mới học)
  if (deltaHours <= 0) return 1;

  // p = 2^(-t/h) theo công thức Duolingo
  const p = Math.pow(2, -deltaHours / halfLifeHours);

  // Clamp giá trị trong khoảng [0, 1]
  return Math.max(0, Math.min(1, p));
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Lấy danh sách từ vựng cần ôn tập của user
 * (next_review <= now)
 * Trả về kèm recall_probability và sort theo p thấp nhất (dễ quên nhất)
 */
export async function getReviewQueue(
  userId: string,
  options: ReviewQueueOptions = {},
): Promise<IUserVocabularyProgress[]> {
  const { limit = 20, includeVocabularyDetails = true } = options;

  // Validate userId
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }

  const now = new Date();

  // Quet rong hon de uu tien recall_probability tot hon,
  // nhung van gioi han de khong gay tai lon len DB.
  const scanLimit = Math.max(
    limit * REVIEW_QUEUE_SCAN_MULTIPLIER,
    REVIEW_QUEUE_MIN_SCAN,
  );

  let query = UserVocabularyProgress.find({
    user_id: new Types.ObjectId(userId),
    next_review: { $lte: now }, // Chỉ lấy từ đã đến hạn ôn
  })
    .sort({ next_review: 1 }) // Ưu tiên từ quá hạn lâu nhất
    .limit(scanLimit);

  // Populate thông tin từ vựng nếu cần
  if (includeVocabularyDetails) {
    query = query.populate({
      path: "vocabulary_id",
      select: "word phonetic type weight definition examples audio image",
    });
  }

  const results = await query.lean().exec();

  // Tính recall_probability cho mỗi item và sort theo p thấp nhất
  const itemsWithRecall = results.map((item: any) => ({
    ...item,
    recall_probability: calculateRecallProbability(
      item.half_life,
      new Date(item.last_practiced),
    ),
  }));

  // Sort theo recall_probability ASC (từ dễ quên nhất lên đầu)
  itemsWithRecall.sort(
    (a: any, b: any) => a.recall_probability - b.recall_probability,
  );

  return itemsWithRecall.slice(0, limit) as IUserVocabularyProgress[];
}

/**
 * Lấy toàn bộ thư viện tiến độ HLR của user (có phân trang)
 * Dùng cho màn hình xem lại từ đã học và trạng thái ghi nhớ.
 */
export async function getProgressLibrary(
  userId: string,
  options: ProgressLibraryOptions = {},
): Promise<{
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  items: ProgressLibraryItem[];
}> {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }

  const {
    page = 1,
    limit = 50,
    includeVocabularyDetails = true,
    search = "",
    sortBy = "next_review",
    sortOrder = "asc",
  } = options;

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(200, Math.max(1, limit));
  const skip = (safePage - 1) * safeLimit;
  const sortDirection = sortOrder === "desc" ? -1 : 1;
  const sortField =
    sortBy === "last_practiced" || sortBy === "half_life"
      ? sortBy
      : "next_review";

  const filter: any = {
    user_id: new Types.ObjectId(userId),
  };

  const keyword = search.trim();
  if (keyword) {
    const regex = new RegExp(escapeRegex(keyword), "i");
    const matchedVocabs = await Vocabulary.find({
      $or: [{ word: regex }, { type: regex }, { tags: regex }],
    })
      .select("_id")
      .lean();

    if (matchedVocabs.length === 0) {
      return {
        page: safePage,
        limit: safeLimit,
        total: 0,
        total_pages: 0,
        items: [],
      };
    }

    filter.vocabulary_id = {
      $in: matchedVocabs.map((v: any) => v._id),
    };
  }

  const total = await UserVocabularyProgress.countDocuments(filter);

  let query = UserVocabularyProgress.find(filter)
    .sort({ [sortField]: sortDirection })
    .skip(skip)
    .limit(safeLimit);

  if (includeVocabularyDetails) {
    query = query.populate({
      path: "vocabulary_id",
      select:
        "word phonetic type weight definition examples audio image tags part_type",
    });
  }

  const results = await query.lean().exec();

  const enrichedItems = results.map((item: any) => {
    const recallProbability = calculateRecallProbability(
      item.half_life,
      new Date(item.last_practiced),
    );
    const forgotAt = new Date(
      new Date(item.last_practiced).getTime() + item.half_life * 60 * 60 * 1000,
    );

    return {
      ...item,
      recall_probability: recallProbability,
      forgot_at: forgotAt,
      memory_status: getMemoryStatus(recallProbability),
    };
  });

  return {
    page: safePage,
    limit: safeLimit,
    total,
    total_pages: Math.ceil(total / safeLimit),
    items: enrichedItems as ProgressLibraryItem[],
  };
}

/**
 * Lấy hoặc tạo progress record cho một từ vựng của user
 */
export async function getOrCreateProgress(
  userId: string,
  vocabularyId: string,
): Promise<IUserVocabularyProgress> {
  // Validate IDs
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }
  if (!Types.ObjectId.isValid(vocabularyId)) {
    throw new Error("Invalid vocabulary ID format");
  }

  // Tìm record hiện có
  let progress = await UserVocabularyProgress.findOne({
    user_id: new Types.ObjectId(userId),
    vocabulary_id: new Types.ObjectId(vocabularyId),
  });

  // Nếu chưa có, tạo mới với giá trị mặc định
  if (!progress) {
    progress = await UserVocabularyProgress.create({
      user_id: new Types.ObjectId(userId),
      vocabulary_id: new Types.ObjectId(vocabularyId),
      right_count: 0,
      wrong_count: 0,
      last_practiced: new Date(),
      half_life: HLR_CONSTANTS.DEFAULT_HALF_LIFE,
      next_review: new Date(), // Cần ôn ngay
    });
  }

  return progress;
}

/**
 * Cập nhật progress sau khi user trả lời một từ
 */
export async function updateProgressAfterReview(
  userId: string,
  vocabularyId: string,
  isCorrect: boolean,
): Promise<IUserVocabularyProgress> {
  // Lấy progress hiện tại
  const progress = await getOrCreateProgress(userId, vocabularyId);

  // Lấy word weight từ Vocabulary
  const vocabulary = await Vocabulary.findById(vocabularyId)
    .select("weight")
    .lean();
  const wordWeight = vocabulary?.weight ?? 0;

  // Cập nhật right/wrong count
  if (isCorrect) {
    progress.right_count += 1;
  } else {
    progress.wrong_count += 1;
  }

  // Tính toán HLR mới
  const hlrResult = calculateHLR(
    wordWeight,
    progress.right_count,
    progress.wrong_count,
  );

  // Cập nhật progress
  progress.half_life = hlrResult.halfLife;
  progress.next_review = hlrResult.nextReview;
  progress.last_practiced = new Date();

  await progress.save();

  return progress;
}

/**
 * Cập nhật progress với right_delta và wrong_delta (cho aggregated logs)
 *
 * Khác với updateProgressAfterReview (tăng 1), function này cho phép
 * tăng nhiều lần đúng/sai cùng lúc từ một session.
 */
export async function updateProgressWithDeltas(
  userId: string,
  vocabularyId: string,
  rightDelta: number,
  wrongDelta: number,
): Promise<IUserVocabularyProgress> {
  // Lấy progress hiện tại
  const progress = await getOrCreateProgress(userId, vocabularyId);

  // Lấy word weight từ Vocabulary
  const vocabulary = await Vocabulary.findById(vocabularyId)
    .select("weight")
    .lean();
  const wordWeight = vocabulary?.weight ?? 0;

  // Cập nhật right/wrong count với deltas
  progress.right_count += rightDelta;
  progress.wrong_count += wrongDelta;

  // Tính toán HLR mới
  const hlrResult = calculateHLR(
    wordWeight,
    progress.right_count,
    progress.wrong_count,
  );

  // Cập nhật progress
  progress.half_life = hlrResult.halfLife;
  progress.next_review = hlrResult.nextReview;
  progress.last_practiced = new Date();

  await progress.save();

  return progress;
}

/**
 * Xử lý một session ôn tập (nhiều từ cùng lúc)
 */
export async function submitReviewSession(
  userId: string,
  items: ReviewSessionItem[],
): Promise<{
  processed: number;
  results: Array<{
    vocabulary_id: string;
    is_correct: boolean;
    new_half_life: number;
    next_review: Date;
  }>;
}> {
  // Validate userId
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Items array is required and must not be empty");
  }

  const results: Array<{
    vocabulary_id: string;
    is_correct: boolean;
    new_half_life: number;
    next_review: Date;
  }> = [];

  // Xử lý từng item
  for (const item of items) {
    const normalizedVocabularyId =
      typeof item.vocabulary_id === "string"
        ? item.vocabulary_id
        : (item as any)?.vocabulary_id?._id?.toString?.();

    // Validate vocabulary_id
    if (
      !normalizedVocabularyId ||
      !Types.ObjectId.isValid(normalizedVocabularyId)
    ) {
      console.warn(
        `Skipping invalid vocabulary_id: ${JSON.stringify(item.vocabulary_id)}`,
      );
      continue;
    }

    try {
      const updatedProgress = await updateProgressAfterReview(
        userId,
        normalizedVocabularyId,
        item.is_correct,
      );

      results.push({
        vocabulary_id: normalizedVocabularyId,
        is_correct: item.is_correct,
        new_half_life: updatedProgress.half_life,
        next_review: updatedProgress.next_review,
      });
    } catch (error) {
      console.error(
        `Error processing vocabulary ${normalizedVocabularyId}:`,
        error,
      );
      // Tiếp tục xử lý các item khác
    }
  }

  return {
    processed: results.length,
    results,
  };
}

/**
 * Lấy thống kê HLR của user
 */
export async function getUserHLRStats(userId: string): Promise<{
  total_words: number;
  due_now: number;
  due_today: number;
  mastered: number;
  average_half_life: number;
}> {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }

  const userIdObj = new Types.ObjectId(userId);
  const now = new Date();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Aggregate để lấy stats
  const stats = await UserVocabularyProgress.aggregate([
    { $match: { user_id: userIdObj } },
    {
      $group: {
        _id: null,
        total_words: { $sum: 1 },
        due_now: {
          $sum: { $cond: [{ $lte: ["$next_review", now] }, 1, 0] },
        },
        due_today: {
          $sum: { $cond: [{ $lte: ["$next_review", endOfDay] }, 1, 0] },
        },
        mastered: {
          // Coi như "mastered" nếu half_life > 720 giờ (30 ngày)
          $sum: { $cond: [{ $gte: ["$half_life", 720] }, 1, 0] },
        },
        total_half_life: { $sum: "$half_life" },
      },
    },
  ]);

  if (stats.length === 0) {
    return {
      total_words: 0,
      due_now: 0,
      due_today: 0,
      mastered: 0,
      average_half_life: 0,
    };
  }

  const result = stats[0];
  return {
    total_words: result.total_words,
    due_now: result.due_now,
    due_today: result.due_today,
    mastered: result.mastered,
    average_half_life:
      result.total_words > 0
        ? Math.round((result.total_half_life / result.total_words) * 100) / 100
        : 0,
  };
}

// ============================================
// EXPORT DEFAULT
// ============================================

export default {
  calculateHLR,
  getReviewQueue,
  getProgressLibrary,
  getOrCreateProgress,
  updateProgressAfterReview,
  submitReviewSession,
  getUserHLRStats,
  HLR_CONSTANTS,
};
