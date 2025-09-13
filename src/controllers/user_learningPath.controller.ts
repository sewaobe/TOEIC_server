import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { getUserLearningPathService } from "../services/user_learningPath.service";

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
        ApiResponse.success(userPlan, "Lấy lộ trình học của người dùng thành công")
      );
  } catch (error) {
    next(error);
  }
};
