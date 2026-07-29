import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  completeShadowingAttemptService,
  deleteShadowingAttemptBySessionService,
  fastCompleteShadowingAttemptService,
  getShadowingAttemptBySessionService,
  saveShadowingAttemptDraftService,
} from "../services/shadowing_attempt.service";

const parsePayload = (rawPayload: unknown) => {
  if (!rawPayload) {
    throw new Error("Missing payload");
  }

  if (typeof rawPayload === "string") {
    return JSON.parse(rawPayload);
  }

  return rawPayload;
};

export const getShadowingAttemptBySessionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    const attempt = await getShadowingAttemptBySessionService(
      req.params.sessionId,
      req.user._id,
    );

    res.status(200).json(
      ApiResponse.success(attempt, attempt ? "Tìm thấy shadowing attempt." : "Không có shadowing attempt."),
    );
  } catch (err) {
    next(err);
  }
};

export const saveShadowingAttemptDraftController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    const payload = parsePayload(req.body.payload);
    const attempt = await saveShadowingAttemptDraftService(
      req.params.sessionId,
      req.user._id,
      payload,
    );

    res.status(200).json(ApiResponse.success(attempt, "Lưu draft shadowing thành công."));
  } catch (err) {
    next(err);
  }
};

export const completeShadowingAttemptController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    if (!req.file) {
      return res.status(400).json(ApiResponse.fail("Thiếu audio tổng của bài shadowing."));
    }

    const payload = parsePayload(req.body.payload);
    const attempt = await completeShadowingAttemptService(
      req.params.sessionId,
      req.user._id,
      payload,
      req.file,
    );

    res.status(200).json(ApiResponse.success(attempt, "Hoàn thành shadowing attempt thành công."));
  } catch (err) {
    next(err);
  }
};

export const fastCompleteShadowingAttemptController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    const payload = parsePayload(req.body.payload);
    const attempt = await fastCompleteShadowingAttemptService(
      req.params.sessionId,
      req.user._id,
      payload,
    );

    res.status(200).json(ApiResponse.success(attempt, "Hoàn thành nhanh shadowing attempt thành công."));
  } catch (err) {
    next(err);
  }
};

export const deleteShadowingAttemptBySessionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    await deleteShadowingAttemptBySessionService(req.params.sessionId, req.user._id);

    res.status(200).json(ApiResponse.success(null, "Xóa shadowing attempt thành công."));
  } catch (err) {
    next(err);
  }
};
