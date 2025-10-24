import { NextFunction, Request, Response } from "express";
import {
  getAllTopicsService,
  createTopicService,
  updateTopicService,
  deleteTopicService,
  getTopicExploreService
} from "../services/topic_vocabulary.service";
import { ApiResponse } from "../utils/ApiResponse";
import { Role } from "../models/enums/Role";

export const getAllTopicOfCollaborator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 6;
    const userId = req.user._id;
    const roleName: Role = req.user.roleName as Role;

    const result = await getAllTopicsService(page, limit, userId, roleName);

    res.status(200).json(
      ApiResponse.success(result, "Lấy danh sách chủ đề từ vựng thành công")
    );
  } catch (err) {
    next(err);
  }
};

export const getTopicExploresController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 6;

    const topics = await getTopicExploreService(page, limit);
    res.status(200).json(
      ApiResponse.success(topics, "Lấy danh sách chủ đề khám phá thành công")
    );
  } catch (err) {
    next(err);
  }
};

export const createTopicOfCollaborator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;
    const roleName = req.user.roleName as Role;
    const topic = await createTopicService(req.body, userId, roleName);
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
    const roleName = req.user.roleName as Role;

    const updated = await updateTopicService(id, req.body, userId, roleName);

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
    const userId = req.user._id;
    const deleted = await deleteTopicService(id, userId);

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
