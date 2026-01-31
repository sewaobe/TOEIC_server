import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  createLessonManagerService,
  deleteLessonManagerService,
  getAllLessonManagerService,
  getAllTopicTitlesService,
  getLessonManagerByIdService,
  searchLessonManagerService,
  updateLessonManagerService,
  updateStatusLessonManagerService,
} from "../services/lesson_manager.service";
import { TestStatus } from "../models/enums/TestStatus";
import { pushNotificationToAdmin } from "../utils/pushNotificationToAdmin";
import { pushNotification } from "../utils/pushNotification";
import { CERFLevel } from "../models/topic_vocabulary.model";
import { PartType } from "../models/enums/PartType";

export const searchLessonManagerController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = (req.query.query as string) || "";
    const level = req.query.level as CERFLevel | undefined;
    const partType = req.query.part_type
      ? (parseInt(req.query.part_type as string) as PartType)
      : undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await searchLessonManagerService(
      query,
      level,
      partType,
      page,
      limit
    );

    res
      .status(200)
      .json(
        ApiResponse.success(
          result.data,
          "Tìm kiếm bài học thành công",
          result.pagination
        )
      );
  } catch (err) {
    next(err);
  }
};

export const getAllTopicTitlesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const topics = await getAllTopicTitlesService();
    res
      .status(200)
      .json(ApiResponse.success(topics, "Fetched topic titles successfully"));
  } catch (err) {
    next(err);
  }
};

export const getAllLessonManagerController = async (
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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const userId = req.user._id;

    const result = await getAllLessonManagerService(page, limit, userId);

    res
      .status(200)
      .json(
        ApiResponse.success(
          result.data,
          "Fetched lesson managers successfully",
          result.pagination
        )
      );
  } catch (err) {
    next(err);
  }
};

export const getLessonManagerByIdController = async (
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

    const lessonManagerId = req.params.id;
    const userId = req.user._id;
    const lessonManager = await getLessonManagerByIdService(
      lessonManagerId,
      userId
    );
    res
      .status(200)
      .json(
        ApiResponse.success(
          lessonManager,
          "Fetched lesson manager successfully"
        )
      );
  } catch (err) {
    next(err);
  }
};

export const createLessonManagerController = async (
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
    const payload = req.body;
    const result = await createLessonManagerService(payload, userId);
    res
      .status(201)
      .json(ApiResponse.success(result, "Created lesson manager successfully"));
  } catch (err) {
    next(err);
  }
};

export const updateLessonManagerController = async (
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
    const lessonManagerId = req.params.id;
    const payload = req.body;
    const result = await updateLessonManagerService(
      payload,
      lessonManagerId,
      userId
    );

    res
      .status(200)
      .json(ApiResponse.success(result, "Updated lesson manager successfully"));
  } catch (err) {
    next(err);
  }
};

export const deleteLessonManagerController = async (
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

    const lessonManagerId = req.params.id;
    const userId = req.user._id;

    const result = await deleteLessonManagerService(lessonManagerId, userId);

    res
      .status(200)
      .json(ApiResponse.success(result, "Deleted lesson manager successfully"));
  } catch (err) {
    next(err);
  }
};

export const updateStatusLessonManagerController = async (
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

    const lessonManagerId = req.params.id;
    const { status } = req.body;
    const userId = req.user._id;
    const result = await updateStatusLessonManagerService(
      lessonManagerId,
      status
    );

    if (result.status === TestStatus.PENDING) {
      await pushNotificationToAdmin(userId, {
        message: `🆕 Bài học "${result.title}" đang chờ duyệt.`,
        description: `Người tạo: ${req.user.name}`,
        url: "http://localhost:5174/admin/lessons",
      });
    }

    res
      .status(200)
      .json(
        ApiResponse.success(
          result,
          "Updated lesson manager status successfully"
        )
      );
  } catch (err) {
    next(err);
  }
};
