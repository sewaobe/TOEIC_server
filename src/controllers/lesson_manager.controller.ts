import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  createLessonManagerService,
  deleteLessonManagerService,
  getActivityOptionsService,
  getAllLessonManagerService,
  getAllTopicTitlesService,
  getLessonManagerByIdService,
  searchLessonManagerService,
  updateLessonManagerService,
  updateStatusLessonManagerService,
} from "../services/lesson_manager.service";
import { TestStatus } from "../models/enums/TestStatus";
import { pushNotificationToAdmin } from "../utils/pushNotificationToAdmin";
import { PartType } from "../models/enums/PartType";
import {
  ActivityType,
  LessonManagerNodeRole,
  LessonManagerUnitType,
} from "../models/lesson_manager.model";

const parsePartType = (value: unknown): PartType | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? (parsed as PartType) : undefined;
};

const parseNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const searchLessonManagerController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = (req.query.query as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await searchLessonManagerService({
      query,
      part_type: parsePartType(req.query.part_type),
      status: req.query.status as TestStatus | undefined,
      unit_type: req.query.unit_type as LessonManagerUnitType | undefined,
      node_role: req.query.node_role as LessonManagerNodeRole | undefined,
      target_tag: req.query.target_tag as string | undefined,
      score_from: parseNumber(req.query.score_from),
      score_to: parseNumber(req.query.score_to),
    }, page, limit);

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

    const result = await getAllLessonManagerService(page, limit, userId, {
      query: (req.query.query as string) || "",
      part_type: parsePartType(req.query.part_type),
      status: req.query.status as TestStatus | undefined,
      unit_type: req.query.unit_type as LessonManagerUnitType | undefined,
      node_role: req.query.node_role as LessonManagerNodeRole | undefined,
      target_tag: req.query.target_tag as string | undefined,
      score_from: parseNumber(req.query.score_from),
      score_to: parseNumber(req.query.score_to),
    });

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
      status,
      userId
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

export const getActivityOptionsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getActivityOptionsService({
      activity_type: req.query.activity_type as ActivityType | undefined,
      part_type: parsePartType(req.query.part_type),
      query: (req.query.query as string) || "",
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    });

    res
      .status(200)
      .json(
        ApiResponse.success(
          result.data,
          "Fetched activity options successfully",
          result.pagination
        )
      );
  } catch (err) {
    next(err);
  }
};
