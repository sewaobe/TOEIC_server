import { Request, Response, NextFunction } from "express";
import {
  createQuizService,
  updateQuizService,
  deleteQuizService,
  getAllQuizService,
  getQuizByIdService,
} from "../services/quiz.service";
import { ApiResponse } from "../utils/ApiResponse";

/**
 * 🟢 Tạo quiz mới
 */
export const createQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quiz = await createQuizService(req.body);
    return res.status(201).json(ApiResponse.success(quiz, "Tạo quiz thành công!"));
  } catch (error) {
    next(error);
  }
};

/**
 * 🟡 Cập nhật quiz theo ID
 */
export const updateQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updatedQuiz = await updateQuizService(id, req.body);
    if (!updatedQuiz) {
      return res.status(404).json(ApiResponse.fail("Quiz không tồn tại!"));
    }
    return res.status(200).json(ApiResponse.success(updatedQuiz, "Cập nhật quiz thành công!"));
  } catch (error) {
    next(error);
  }
};

/**
 * 🔴 Xóa quiz
 */
export const deleteQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deleted = await deleteQuizService(id);
    if (!deleted) {
      return res.status(404).json(ApiResponse.fail("Quiz không tồn tại!"));
    }
    return res.status(200).json(ApiResponse.success({}, "Xóa quiz thành công!"));
  } catch (error) {
    next(error);
  }
};

/**
 * 📋 Lấy danh sách quiz (phân trang + lọc + tìm kiếm)
 */
export const getAllQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      page = "1",
      limit = "10",
      query = "",
      topic,
      level,
      status,
      part_type,
    } = req.query;

    const result = await getAllQuizService(
      Number(page),
      Number(limit),
      String(query),
      topic ? String(topic) : undefined,
      level ? String(level) : undefined,
      status ? String(status) : undefined,
      part_type ? Number(part_type) : undefined
    );

    return res.status(200).json(ApiResponse.success(result, "Lấy danh sách quiz thành công!"));
  } catch (error) {
    next(error);
  }
};

/**
 * 🔍 Lấy chi tiết quiz theo ID
 */
export const getQuizByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const quiz = await getQuizByIdService(id);
    if (!quiz) {
      return res.status(404).json(ApiResponse.fail("Quiz không tồn tại!"));
    }
    return res.status(200).json(ApiResponse.success(quiz, "Lấy chi tiết quiz thành công!"));
  } catch (error) {
    next(error);
  }
};
