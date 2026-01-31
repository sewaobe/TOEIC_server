import { NextFunction, Request, Response } from "express";
import { generateIRTWeeklyPlanService } from "../services/irt.service";
import { ApiResponse } from "../utils/ApiResponse";

export const generateIrtWeeklyPlanController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const userId = req.user._id;
    const { testId, answers, duration, day_study_id } = req.body;

    const result = await generateIRTWeeklyPlanService(
      userId,
      testId,
      answers,
      duration,
      day_study_id
    );

    res
      .status(200)
      .json(
        ApiResponse.success(result, "IRT weekly plan generated successfully")
      );
  } catch (error) {
    next(error);
  }
};
