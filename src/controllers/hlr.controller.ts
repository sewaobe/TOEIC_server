import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  getReviewQueue,
  getProgressLibrary,
  submitReviewSession,
  getUserHLRStats,
  ReviewSessionItem,
} from "../services/hlr.service";

/**
 * HLR Controller - API Endpoints cho Spaced Repetition
 *
 * Module này HOÀN TOÀN ĐỘC LẬP với hệ thống IRT hiện có.
 * Các routes mới, không đè lên routes cũ.
 */

// ============================================
// GET /api/hlr/review-queue
// Lấy danh sách từ vựng cần ôn tập
// ============================================

export const getReviewQueueController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Lấy userId từ authenticated user
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Unauthorized: User ID not found"));
    }

    // Parse query params
    const limit = parseInt(req.query.limit as string) || 20;
    const includeDetails = req.query.includeDetails !== "false";

    // Validate limit
    if (limit < 1 || limit > 100) {
      return res
        .status(400)
        .json(ApiResponse.fail("Limit must be between 1 and 100"));
    }

    const reviewQueue = await getReviewQueue(userId, {
      limit,
      includeVocabularyDetails: includeDetails,
    });

    return res.status(200).json(
      ApiResponse.success(
        {
          count: reviewQueue.length,
          items: reviewQueue,
        },
        "Lấy danh sách từ cần ôn tập thành công",
      ),
    );
  } catch (error) {
    next(error);
  }
};

// ============================================
// POST /api/hlr/submit-session
// Submit kết quả một session ôn tập
// ============================================

export const submitSessionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Lấy userId từ authenticated user
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Unauthorized: User ID not found"));
    }

    // Validate request body
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json(ApiResponse.fail("Request body must contain 'items' array"));
    }

    if (items.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.fail("Items array must not be empty"));
    }

    if (items.length > 100) {
      return res
        .status(400)
        .json(ApiResponse.fail("Maximum 100 items per session"));
    }

    // Validate each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.vocabulary_id || typeof item.is_correct !== "boolean") {
        return res
          .status(400)
          .json(
            ApiResponse.fail(
              `Invalid item at index ${i}: must have 'vocabulary_id' (string) and 'is_correct' (boolean)`,
            ),
          );
      }
    }

    // Process session
    const result = await submitReviewSession(
      userId,
      items as ReviewSessionItem[],
    );

    return res
      .status(200)
      .json(
        ApiResponse.success(
          result,
          `Đã xử lý ${result.processed} từ vựng thành công`,
        ),
      );
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET /api/hlr/stats
// Lấy thống kê HLR của user
// ============================================

export const getStatsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Lấy userId từ authenticated user
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Unauthorized: User ID not found"));
    }

    const stats = await getUserHLRStats(userId);

    return res
      .status(200)
      .json(ApiResponse.success(stats, "Lấy thống kê HLR thành công"));
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET /api/hlr/progress-library
// Lấy toàn bộ từ đã học + trạng thái ghi nhớ
// ============================================

export const getProgressLibraryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Unauthorized: User ID not found"));
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const includeDetails = req.query.includeDetails !== "false";
    const search = (req.query.search as string) || "";
    const sortBy =
      (req.query.sortBy as "next_review" | "last_practiced" | "half_life") ||
      "next_review";
    const sortOrder = (req.query.sortOrder as "asc" | "desc") || "asc";

    if (page < 1) {
      return res.status(400).json(ApiResponse.fail("Page must be >= 1"));
    }

    if (limit < 1 || limit > 200) {
      return res
        .status(400)
        .json(ApiResponse.fail("Limit must be between 1 and 200"));
    }

    if (!["next_review", "last_practiced", "half_life"].includes(sortBy)) {
      return res
        .status(400)
        .json(
          ApiResponse.fail(
            "sortBy must be next_review, last_practiced or half_life",
          ),
        );
    }

    if (!["asc", "desc"].includes(sortOrder)) {
      return res
        .status(400)
        .json(ApiResponse.fail("sortOrder must be asc or desc"));
    }

    const data = await getProgressLibrary(userId, {
      page,
      limit,
      includeVocabularyDetails: includeDetails,
      search,
      sortBy,
      sortOrder,
    });

    return res
      .status(200)
      .json(ApiResponse.success(data, "Lấy thư viện ghi nhớ thành công"));
  } catch (error) {
    next(error);
  }
};
