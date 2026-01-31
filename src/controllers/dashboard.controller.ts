import { Request, Response, NextFunction } from "express";
import * as dashboardService from "../services/dashboard.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getCollaboratorDashboard = async (
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
    const data = await dashboardService.getCollaboratorDashboardData(userId);
    res
      .status(200)
      .json(ApiResponse.success(data, "Lấy dữ liệu dashboard thành công"));
  } catch (error) {
    next(error);
  }
};
