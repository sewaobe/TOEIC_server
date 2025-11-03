import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  getUserLearningPathService,
  createLearningPathService,
  getLearningProgressService,
  getWeekDetailService,
  getDayDetailService,
  getWeekStatsService,
  getCumulativeStatsService,
} from "../services/user_learningPath.service";

export const getUserLearningPath = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      res
        .status(401)
        .json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
      return;
    }

    const userPlan = await getUserLearningPathService(userId);

    if (!userPlan) {
      res
        .status(200)
        .json(ApiResponse.fail("Không tìm thấy lộ trình học nào!"));
      return;
    }

    res
      .status(200)
      .json(
        ApiResponse.success(
          userPlan,
          "Lấy lộ trình học của người dùng thành công"
        )
      );
  } catch (error) {
    next(error);
  }
};
export const createLearningPath = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      res
        .status(401)
        .json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
      return;
    }

    const payload = req.body; // FE gửi methods, targetScore, endDate, weeklyTotals, weeklyPlan
    console.log("Payload", payload);
    const result = await createLearningPathService(userId, payload);

    res
      .status(201)
      .json(ApiResponse.success(result, "Tạo lộ trình học thành công"));
  } catch (error) {
    next(error);
  }
};

export const getLearningProgress = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      res
        .status(401)
        .json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
      return;
    }

    const progress = await getLearningProgressService(userId);

    res
      .status(200)
      .json(
        ApiResponse.success(progress, "Lấy tiến độ học tập thành công")
      );
  } catch (error) {
    next(error);
  }
};

export const getWeekDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      res
        .status(401)
        .json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
      return;
    }

    const { weekId } = req.params;

    if (!weekId) {
      res
        .status(400)
        .json(ApiResponse.fail("Thiếu weekId trong params"));
      return;
    }

    const weekDetail = await getWeekDetailService(weekId, userId);

    res
      .status(200)
      .json(
        ApiResponse.success(weekDetail, "Lấy chi tiết tuần học thành công")
      );
  } catch (error) {
    next(error);
  }
};

export const getDayDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      res
        .status(401)
        .json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
      return;
    }

    const { dayId } = req.params;
    const { date } = req.query;

    if (!dayId) {
      res
        .status(400)
        .json(ApiResponse.fail("Thiếu dayId trong params"));
      return;
    }

    const dayDetail = await getDayDetailService(dayId, userId, date as string);

    res
      .status(200)
      .json(
        ApiResponse.success(dayDetail, "Lấy chi tiết ngày học thành công")
      );
  } catch (error) {
    next(error);
  }
};

export const getWeekStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      res
        .status(401)
        .json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
      return;
    }

    const { weekId } = req.params;

    if (!weekId) {
      res
        .status(400)
        .json(ApiResponse.fail("Thiếu weekId trong params"));
      return;
    }

    const weekStats = await getWeekStatsService(weekId, userId);

    res
      .status(200)
      .json(
        ApiResponse.success(weekStats, "Lấy thống kê tuần thành công")
      );
  } catch (error) {
    next(error);
  }
};

export const getCumulativeStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      res
        .status(401)
        .json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
      return;
    }

    const cumulativeStats = await getCumulativeStatsService(userId);

    res
      .status(200)
      .json(
        ApiResponse.success(cumulativeStats, "Lấy dữ liệu tích lũy thành công")
      );
  } catch (error) {
    next(error);
  }
};
