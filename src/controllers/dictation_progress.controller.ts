import { NextFunction, Request, Response } from "express";
import {
  cancelDictationProgressService,
  completeDictationProgressService,
  getActiveDictationProgressService,
  startDictationProgressService,
  updateDictationProgressService,
} from "../services/dictation_progress.service";
import { getDictationAIFeedbackService } from "../services/dictation_ai_feedback.service";
import { ApiResponse } from "../utils/ApiResponse";

const getUserId = (req: Request, res: Response) => {
  if (!req.user?._id) {
    res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    return null;
  }

  return req.user._id;
};

export const getActiveDictationProgressController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const progress = await getActiveDictationProgressService(
      userId,
      req.params.dictationId,
    );

    res
      .status(200)
      .json(ApiResponse.success(progress, progress ? "Tìm thấy tiến trình." : "Không có tiến trình."));
  } catch (err) {
    next(err);
  }
};

export const startDictationProgressController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const progress = await startDictationProgressService(
      userId,
      req.params.dictationId,
      req.body?.difficulty,
    );

    res
      .status(201)
      .json(ApiResponse.success(progress, "Bắt đầu tiến trình dictation thành công."));
  } catch (err) {
    next(err);
  }
};

export const updateDictationProgressController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const progress = await updateDictationProgressService(
      req.params.progressId,
      userId,
      req.body,
    );

    res
      .status(200)
      .json(ApiResponse.success(progress, "Cập nhật tiến trình dictation thành công."));
  } catch (err) {
    next(err);
  }
};

export const completeDictationProgressController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    if (!Array.isArray(req.body?.attempts)) {
      return res.status(400).json(ApiResponse.fail("attempts phải là một mảng"));
    }

    const result = await completeDictationProgressService(
      req.params.progressId,
      userId,
      req.body,
    );

    res
      .status(200)
      .json(ApiResponse.success(result, "Hoàn thành dictation thành công."));
  } catch (err) {
    next(err);
  }
};

export const cancelDictationProgressController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const progress = await cancelDictationProgressService(
      req.params.progressId,
      userId,
    );

    res
      .status(200)
      .json(ApiResponse.success(progress, "Hủy tiến trình dictation thành công."));
  } catch (err) {
    next(err);
  }
};

export const getDictationAIFeedbackController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const startedAt = Date.now();
  const requestId = `dictation-ai-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    console.info("[DictationAI] request start", {
      requestId,
      progressId: req.params.progressId,
      userId,
    });

    const result = await getDictationAIFeedbackService(
      req.params.progressId,
      userId,
    );

    console.info("[DictationAI] request success", {
      requestId,
      elapsedMs: Date.now() - startedAt,
      source: result.source,
      recommendations: result.recommendations.length,
      warnings: result.warnings ?? [],
    });

    res
      .status(200)
      .json(ApiResponse.success(result, "Phan tich dictation thanh cong."));
  } catch (err) {
    console.error("[DictationAI] request failed", {
      requestId,
      elapsedMs: Date.now() - startedAt,
      progressId: req.params.progressId,
      error: err instanceof Error ? err.message : err,
    });
    next(err);
  }
};
