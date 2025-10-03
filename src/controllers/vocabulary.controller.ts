import { NextFunction, Request, Response } from "express";
import { createVocabularyService, deleteVocabularyService, getTopicInfoService, getVocabulariesByTopicService, updateVocabularyService } from "../services/vocabulary.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getVocabulariesByTopic = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { topicId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await getVocabulariesByTopicService(topicId, page, limit);

    return res
      .status(200)
      .json(ApiResponse.success(result, "Lấy từ vựng theo chủ đề thành công"));
  } catch (err) {
    next(err);
  }
};

export const createVocabulary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { topicId } = req.body; // FE gửi kèm topicId (nếu có)
    const vocab = await createVocabularyService(req.body, topicId);
    return res.status(201).json(ApiResponse.success(vocab, "Thêm từ vựng thành công"));
  } catch (err) {
    next(err);
  }
};

export const updateVocabulary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const vocab = await updateVocabularyService(id, req.body);
    return res.status(200).json(ApiResponse.success(vocab, "Cập nhật từ vựng thành công"));
  } catch (err) {
    next(err);
  }
};

export const deleteVocabulary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { topicId } = req.query; // FE gửi kèm topicId nếu muốn bỏ vocab khỏi topic
    await deleteVocabularyService(id, topicId as string);
    return res.status(200).json(ApiResponse.success(null, "Xóa từ vựng thành công"));
  } catch (err) {
    next(err);
  }
};

export const getTopicInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { topicId } = req.params;
    const result = await getTopicInfoService(topicId);

    return res
      .status(200)
      .json(ApiResponse.success(result, "Lấy thông tin chủ đề thành công"));
  } catch (err) {
    next(err);
  }
};