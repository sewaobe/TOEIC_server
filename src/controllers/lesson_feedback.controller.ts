import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  createLessonFeedback,
  getFeedbacks,
  getUserFeedbackForDay,
  getFeedbackStats,
  getFeedbackStatsByUserId,
  getFeedbacksByUserId,
  getPopularFeedbackReasons,
  deleteFeedback,
} from "../services/lesson_feedback.service";

/**
 * Tạo feedback cho buổi học
 * POST /api/day-study/:dayId/feedback
 */
export const createFeedbackController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    const { dayId } = req.params;
    const { rating, reasons, comment } = req.body;

    // Validate required fields
    if (!rating || typeof rating !== "number") {
      return res
        .status(400)
        .json(ApiResponse.fail("Rating là bắt buộc và phải là số từ 1-5"));
    }

    if (rating < 1 || rating > 5) {
      return res
        .status(400)
        .json(ApiResponse.fail("Rating phải từ 1 đến 5"));
    }

    const feedback = await createLessonFeedback({
      userId: req.user._id,
      dayStudyId: dayId,
      rating,
      reasons: reasons || [],
      comment,
    });

    return res
      .status(201)
      .json(ApiResponse.success(feedback, "Gửi đánh giá thành công!"));
  } catch (error: any) {
    if (
      error.message === "Không tìm thấy ngày học" ||
      error.message === "Không tìm thấy lộ trình học" ||
      error.message === "Không tìm thấy lộ trình học của user"
    ) {
      return res.status(404).json(ApiResponse.fail(error.message));
    }
    next(error);
  }
};

/**
 * Lấy feedback của user cho một day study
 * GET /api/day-study/:dayId/feedback
 */
export const getFeedbackForDayController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    const { dayId } = req.params;
    const feedback = await getUserFeedbackForDay(
      req.user._id.toString(),
      dayId
    );

    return res
      .status(200)
      .json(
        ApiResponse.success(
          feedback,
          feedback ? "Lấy feedback thành công" : "Chưa có feedback"
        )
      );
  } catch (error: any) {
    next(error);
  }
};

/**
 * Lấy danh sách feedback của learning path (cho admin/collaborator)
 * GET /api/feedback/:learningPathId
 */
export const getFeedbacksController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { learningPathId } = req.params;
    const { rating, isPositive, page, limit } = req.query;

    if (!learningPathId) {
      return res
        .status(400)
        .json(ApiResponse.fail("Learning path ID là bắt buộc"));
    }

    const result = await getFeedbacks({
      learningPathId,
      rating: rating ? parseInt(rating as string) : undefined,
      isPositive:
        isPositive === "true" ? true : isPositive === "false" ? false : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 10,
    });

    return res
      .status(200)
      .json(ApiResponse.success(result, "Lấy danh sách feedback thành công"));
  } catch (error: any) {
    next(error);
  }
};

/**
 * Lấy thống kê feedback theo learning path
 * GET /api/feedback/stats/:learningPathId
 */
export const getFeedbackStatsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { learningPathId } = req.params;

    if (!learningPathId) {
      return res
        .status(400)
        .json(ApiResponse.fail("Learning path ID là bắt buộc"));
    }

    const stats = await getFeedbackStats(learningPathId);

    return res
      .status(200)
      .json(ApiResponse.success(stats, "Lấy thống kê feedback thành công"));
  } catch (error: any) {
    next(error);
  }
};

/**
 * Lấy các lý do feedback phổ biến
 * GET /api/feedback/reasons/:learningPathId
 */
export const getPopularReasonsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { learningPathId } = req.params;
    const { isPositive } = req.query;

    if (!learningPathId) {
      return res
        .status(400)
        .json(ApiResponse.fail("Learning path ID là bắt buộc"));
    }

    const reasons = await getPopularFeedbackReasons(
      learningPathId,
      isPositive === "true" ? true : isPositive === "false" ? false : undefined
    );

    return res
      .status(200)
      .json(ApiResponse.success(reasons, "Lấy lý do phổ biến thành công"));
  } catch (error: any) {
    next(error);
  }
};

/**
 * Xóa feedback
 * DELETE /api/day-study/:dayId/feedback
 */
export const deleteFeedbackController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    const { dayId } = req.params;

    const deleted = await deleteFeedback(dayId, req.user._id.toString());

    if (!deleted) {
      return res
        .status(404)
        .json(
          ApiResponse.fail("Không tìm thấy feedback hoặc không có quyền xóa")
        );
    }

    return res
      .status(200)
      .json(ApiResponse.success(null, "Xóa feedback thành công"));
  } catch (error: any) {
    next(error);
  }
};

/**
 * Lấy tất cả feedback của một user (cho collaborator/admin xem)
 * GET /api/feedback/user/:userId
 */
export const getFeedbacksByUserIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res
        .status(400)
        .json(ApiResponse.fail("User ID là bắt buộc"));
    }

    const feedbacks = await getFeedbacksByUserId(userId);

    return res
      .status(200)
      .json(ApiResponse.success(feedbacks, "Lấy danh sách feedback thành công"));
  } catch (error: any) {
    next(error);
  }
};

/**
 * Lấy thống kê feedback của một user
 * GET /api/feedback/user/:userId/stats
 */
export const getFeedbackStatsByUserIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res
        .status(400)
        .json(ApiResponse.fail("User ID là bắt buộc"));
    }

    const stats = await getFeedbackStatsByUserId(userId);

    return res
      .status(200)
      .json(ApiResponse.success(stats, "Lấy thống kê feedback thành công"));
  } catch (error: any) {
    next(error);
  }
};
