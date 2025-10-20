import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import * as lessonService from "../services/lesson.service";
import { ApiResponse } from "../utils/ApiResponse";

export const createLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // ✅ Ép kiểu đúng để tránh TS2345
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const lesson = await lessonService.createLesson(req.body, userId);
    return res
      .status(201)
      .json(ApiResponse.success(lesson, "Tạo bài học mới thành công!"));
  } catch (error) {
    next(error);
  }
};

export const getLessonsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 🧍‍♂️ Lấy user ID từ middleware verifyAccessToken
    const userId = new mongoose.Types.ObjectId(req.user._id);

    // 📦 Lấy query từ FE
    const { page, limit, search, part_type, status } = req.query;

    // 🚀 Gọi service với phân trang + lọc
    const lessons = await lessonService.getLessons({
      userId,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      search: String(search || ""),
      part_type: part_type ? Number(part_type) : undefined,
      status: String(status || ""),
    });

    // ✅ Trả về kết quả
    return res
      .status(200)
      .json(ApiResponse.success(lessons, "Lấy danh sách bài học thành công!"));
  } catch (error) {
    next(error);
  }
};

export const getLessonDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const lesson = await lessonService.getLessonDetail(req.params.id);
    return res
      .status(200)
      .json(ApiResponse.success(lesson, "Lấy chi tiết bài học thành công!"));
  } catch (error) {
    next(error);
  }
};
// 🟨 CẬP NHẬT THÔNG TIN CƠ BẢN
export const updateLessonBasicController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const data = req.body; // { title, summary, status, part_type, ... }
    console.log(typeof data.part_type);

    const updatedLesson = await lessonService.updateLessonBasic(id, data);

    return res
      .status(200)
      .json(ApiResponse.success(updatedLesson, "Cập nhật bài học thành công!"));
  } catch (error) {
    next(error);
  }
};

export const updateLessonWithSectionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const lessonId = req.params.id;
    const data = req.body; // FE gửi nguyên object lesson

    const updatedLesson = await lessonService.updateLessonWithSections(
      lessonId,
      data
    );

    return res
      .status(200)
      .json(ApiResponse.success(updatedLesson, "Cập nhật bài học thành công!"));
  } catch (error) {
    next(error);
  }
};

export const deleteLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await lessonService.deleteLesson(req.params.id);
    return res
      .status(200)
      .json(ApiResponse.success(null, "Đã xóa bài học thành công!"));
  } catch (error) {
    next(error);
  }
};
