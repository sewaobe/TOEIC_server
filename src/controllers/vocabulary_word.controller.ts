import { NextFunction, Request, Response } from "express";
import {
  createVocabularyWordService,
  getAllVocabularyWordsService,
  getVocabularyWordByIdService,
  updateVocabularyWordService,
  deleteVocabularyWordService,
} from "../services/vocabulary_word.service";
import { ApiResponse } from "../utils/ApiResponse";

// Create vocabulary word
export const createVocabularyWordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = req.body;
    const result = await createVocabularyWordService(data);
    res
      .status(201)
      .json(ApiResponse.success(result, "Tạo từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};

// Get all vocabulary words
export const getAllVocabularyWordsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const level = req.query.level as string;

    const result = await getAllVocabularyWordsService(page, limit, {
      search,
      level,
    });
    res
      .status(200)
      .json(ApiResponse.success(result, "Lấy danh sách từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};

// Get vocabulary word by ID
export const getVocabularyWordByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const result = await getVocabularyWordByIdService(id);

    if (!result) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy từ vựng."));
    }

    res
      .status(200)
      .json(ApiResponse.success(result, "Lấy thông tin từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};

// Update vocabulary word
export const updateVocabularyWordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const result = await updateVocabularyWordService(id, data);

    if (!result) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy từ vựng."));
    }

    res
      .status(200)
      .json(ApiResponse.success(result, "Cập nhật từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};

// Delete vocabulary word
export const deleteVocabularyWordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const result = await deleteVocabularyWordService(id);

    if (!result) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy từ vựng."));
    }

    res.status(200).json(ApiResponse.success(null, "Xóa từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};
