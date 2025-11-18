// src/controllers/user_study.controller.ts
import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { ApiResponse } from "../utils/ApiResponse";
import { getStreakInfo } from "../services/streak.service";
import {
  getUserStudyHistory,
  getUserStats,
} from "../services/study_history.service";

/**
 * GET /api/user/streak
 */
export const getStreakController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const streakInfo = await getStreakInfo(userId);

    return res
      .status(200)
      .json(ApiResponse.success(streakInfo, "Lấy thông tin streak thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/user/study-history
 */
export const getStudyHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string;

    const history = await getUserStudyHistory(userId, page, limit, { type });

    return res
      .status(200)
      .json(ApiResponse.success(history, "Lấy lịch sử học tập thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/user/stats
 */
export const getUserStatsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const stats = await getUserStats(userId);

    return res
      .status(200)
      .json(ApiResponse.success(stats, "Lấy thống kê thành công"));
  } catch (error) {
    next(error);
  }
};
