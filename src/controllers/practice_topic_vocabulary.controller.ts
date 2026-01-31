import { NextFunction, Request, Response } from "express";
import {
  createPracticeTopicVocabularyService,
  getAllPracticeTopicVocabulariesService,
  getPracticeTopicVocabularyByIdService,
  updatePracticeTopicVocabularyService,
  deletePracticeTopicVocabularyService,
  addVocabularyWordToTopicService,
  removeVocabularyWordFromTopicService,
} from "../services/practice_topic_vocabulary.service";
import { ApiResponse } from "../utils/ApiResponse";

// Create practice topic vocabulary
export const createPracticeTopicVocabularyController = async (
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
    const data = req.body;
    const result = await createPracticeTopicVocabularyService(data, userId);
    res
      .status(201)
      .json(ApiResponse.success(result, "Tạo chủ đề từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};

// Get all practice topic vocabularies
export const getAllPracticeTopicVocabulariesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const level = req.query.level as string;
    const createdBy = req.query.createdBy as string;

    const result = await getAllPracticeTopicVocabulariesService(page, limit, {
      search,
      level,
      createdBy,
    });

    res
      .status(200)
      .json(
        ApiResponse.success(result, "Lấy danh sách chủ đề từ vựng thành công.")
      );
  } catch (err) {
    next(err);
  }
};

// Get practice topic vocabulary by ID
export const getPracticeTopicVocabularyByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const result = await getPracticeTopicVocabularyByIdService(id);

    if (!result) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy chủ đề từ vựng."));
    }

    res
      .status(200)
      .json(
        ApiResponse.success(result, "Lấy thông tin chủ đề từ vựng thành công.")
      );
  } catch (err) {
    next(err);
  }
};

// Update practice topic vocabulary
export const updatePracticeTopicVocabularyController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const result = await updatePracticeTopicVocabularyService(id, data);

    if (!result) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy chủ đề từ vựng."));
    }

    res
      .status(200)
      .json(ApiResponse.success(result, "Cập nhật chủ đề từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};

// Delete practice topic vocabulary
export const deletePracticeTopicVocabularyController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const result = await deletePracticeTopicVocabularyService(id);

    if (!result) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy chủ đề từ vựng."));
    }

    res
      .status(200)
      .json(ApiResponse.success(null, "Xóa chủ đề từ vựng thành công."));
  } catch (err) {
    next(err);
  }
};

// Add vocabulary word to topic
export const addVocabularyWordToTopicController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { topicId, vocabularyWordId } = req.body;
    const result = await addVocabularyWordToTopicService(
      topicId,
      vocabularyWordId
    );

    if (!result) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy chủ đề từ vựng."));
    }

    res
      .status(200)
      .json(ApiResponse.success(result, "Thêm từ vựng vào chủ đề thành công."));
  } catch (err) {
    next(err);
  }
};

// Remove vocabulary word from topic
export const removeVocabularyWordFromTopicController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { topicId, vocabularyWordId } = req.body;
    const result = await removeVocabularyWordFromTopicService(
      topicId,
      vocabularyWordId
    );

    if (!result) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy chủ đề từ vựng."));
    }

    res
      .status(200)
      .json(ApiResponse.success(result, "Xóa từ vựng khỏi chủ đề thành công."));
  } catch (err) {
    next(err);
  }
};
