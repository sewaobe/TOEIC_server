import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  getUserLearningPathService,
  createLearningPathService,
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
) => {
  try {
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
    }

    const payload = req.body;

    if (
      typeof payload.targetScore !== "number" ||
      payload.targetScore <= 0 ||
      payload.targetScore > 990
    ) {
      return res.status(400).json(ApiResponse.fail("Điểm mục tiêu không hợp lệ (0-990)!"));
    }

    const now = new Date();
    const end = new Date(payload.endDate);
    if (!payload.endDate || end <= now) {
      return res.status(400).json(ApiResponse.fail("Ngày kết thúc phải sau ngày hiện tại!"));
    }

    const result = await createLearningPathService(userId, payload);

    res.status(201).json(ApiResponse.success(result, "Tạo lộ trình học thành công"));
  } catch (err) {
    next(err);
  }
};
