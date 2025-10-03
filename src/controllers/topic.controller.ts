import { NextFunction, Request, Response } from "express";
import { 
  getAllTopicsService, 
  createTopicService, 
  updateTopicService, 
  deleteTopicService 
} from "../services/topic.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getAllTopicOfCollaborator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 6;

    const result = await getAllTopicsService(page, limit);

    res.status(200).json(
      ApiResponse.success(result, "Lấy danh sách chủ đề từ vựng thành công")
    );
  } catch (err) {
    next(err);
  }
};


export const createTopicOfCollaborator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id; 
    const topic = await createTopicService(req.body, userId);
    res
      .status(201)
      .json(ApiResponse.success(topic, "Tạo chủ đề mới thành công"));
  } catch (err) {
    next(err);
  }
};

export const updateTopicOfCollaborator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const updated = await updateTopicService(id, req.body, userId);

    if (!updated) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy chủ đề để cập nhật"));
    }

    res
      .status(200)
      .json(ApiResponse.success(updated, "Cập nhật chủ đề thành công"));
  } catch (err) {
    next(err);
  }
};

export const deleteTopicOfCollaborator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deleted = await deleteTopicService(id);

    if (!deleted) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy chủ đề để xóa"));
    }

    res
      .status(200)
      .json(ApiResponse.success(null, "Xóa chủ đề thành công"));
  } catch (err) {
    next(err);
  }
};
