import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  getShadowingV2DetailService,
  getShadowingV2ListService,
  ShadowingV2Category,
  ShadowingV2Level,
  ShadowingV2Sort,
} from "../services/shadowing_v2.service";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export const getShadowingV2ListController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Number(req.query.page) || DEFAULT_PAGE;
    const limit = Number(req.query.limit) || DEFAULT_LIMIT;

    const category = (req.query.category as ShadowingV2Category) || "ALL";
    const level = (req.query.level as ShadowingV2Level) || "ALL";
    const sortType = req.query.sortType as ShadowingV2Sort | undefined;

    const result = await getShadowingV2ListService({
      category,
      level,
      sortType,
      page,
      limit,
    });

    return res.status(200).json(
      ApiResponse.success(result.items, "Lấy danh sách shadowing thành công", {
        total: result.total,
        page: result.page,
        pageCount: result.pageCount,
        limit: result.limit,
      })
    );
  } catch (error) {
    next(error);
  }
};

export const getShadowingV2DetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const shadowingId = req.params.id;
    const shadowing = await getShadowingV2DetailService(shadowingId);

    if (!shadowing) {
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy bài shadowing"));
    }

    return res
      .status(200)
      .json(ApiResponse.success(shadowing, "Lấy shadowing thành công"));
  } catch (error) {
    next(error);
  }
};
