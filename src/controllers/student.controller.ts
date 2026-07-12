import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import * as studentService from "../services/student.service";
import { UserProgress } from "../models/user_progress.model";
import { ApiResponse } from "../utils/ApiResponse";
import { JwtUserPayload } from "../middlewares/verifyAccessToken.middleware";

// ==========================
// 🧩 Lấy danh sách học viên
// ==========================
export const getStudentsController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 📦 Lấy query params từ URL
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const search = req.query.search ? String(req.query.search) : "";
    const status = req.query.status ? String(req.query.status) : "";
    const targetScore = req.query.targetScore
      ? parseInt(req.query.targetScore as string, 10)
      : 0;

    // 🧑‍🏫 Lấy user hiện tại (CTV)
    const currentUser = req.user;
    if (!currentUser) {
      res.status(401).json(ApiResponse.fail("Không có thông tin người dùng!"));
      return;
    }

    // ⚙️ Gọi service xử lý
    const { items, total, pageCount } = await studentService.getStudentsService(
      page,
      limit,
      search,
      status,
      targetScore,
      currentUser._id // pass CTV id để filter
    );

    // ✅ Trả về kết quả
    res
      .status(200)
      .json(
        ApiResponse.success(
          { items, total, pageCount },
          "Lấy danh sách học viên thành công!"
        )
      );
  } catch (error) {
    next(error);
  }
};

// =======================================
// 🧠 Lấy chi tiết một học viên theo ID
// =======================================
export const getStudentDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // ⚙️ Kiểm tra ID hợp lệ
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json(ApiResponse.fail("ID học viên không hợp lệ!"));
      return;
    }

    const currentUser = req.user as JwtUserPayload | undefined;
    const data = await studentService.getStudentDetailService(
      id,
      currentUser?._id ? String(currentUser._id) : undefined
    );

    if (!data) {
      res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy thông tin học viên!"));
      return;
    }

    res
      .status(200)
      .json(ApiResponse.success(data, "Lấy chi tiết học viên thành công!"));
  } catch (error) {
    next(error);
  }
};

// ===================================
// 📊 Lấy báo cáo nhóm học viên
// ===================================
export const getGroupReportsController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const items = await studentService.getGroupReportsService();

    if (!items || items.length === 0) {
      res
        .status(200)
        .json(ApiResponse.success([], "Chưa có dữ liệu báo cáo nhóm!"));
      return;
    }

    res
      .status(200)
      .json(ApiResponse.success(items, "Lấy báo cáo nhóm thành công!"));
  } catch (error) {
    next(error);
  }
};

// ==========================
// 🛠️ Đặt trạng thái tiến độ của học viên (ví dụ: inactive)
// ==========================
export const markStudentInactiveController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json(ApiResponse.fail("ID học viên không hợp lệ!"));
      return;
    }

    const progress = await UserProgress.findOneAndUpdate(
      { user_id: id },
      { status: "inactive", updated_at: new Date() },
      { new: true }
    );

    if (!progress) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy tiến độ học viên!"));
      return;
    }

    res.status(200).json(ApiResponse.success(progress, "Đã chuyển trạng thái sang inactive"));
  } catch (error) {
    next(error);
  }
};
