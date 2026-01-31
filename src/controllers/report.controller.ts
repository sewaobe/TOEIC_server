import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import * as reportService from "../services/report.service";
import { ReportType } from "../models/enums/ReportType";
import { ReportStatus } from "../models/enums/ReportStatus";

const isReportType = (value: any): value is ReportType =>
  Object.values(ReportType).includes(value as ReportType);

const isReportStatus = (value: any): value is ReportStatus =>
  Object.values(ReportStatus).includes(value as ReportStatus);

export const createReport = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Bạn cần đăng nhập để gửi báo lỗi"));
    }

    const { type, title, description, imageUrl } = req.body;

    if (!isReportType(type)) {
      return res
        .status(400)
        .json(ApiResponse.fail("Loại báo lỗi không hợp lệ"));
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return res
        .status(400)
        .json(ApiResponse.fail("Tiêu đề báo lỗi không hợp lệ"));
    }

    if (
      !description ||
      typeof description !== "string" ||
      !description.trim()
    ) {
      return res
        .status(400)
        .json(ApiResponse.fail("Mô tả báo lỗi không hợp lệ"));
    }

    const report = await reportService.createReport({
      userId,
      type,
      title: title.trim(),
      description: description.trim(),
      imageUrl:
        typeof imageUrl === "string" ? imageUrl.trim() || undefined : undefined,
    });

    res.status(201).json(ApiResponse.success(report, "Gửi báo lỗi thành công"));
  } catch (error) {
    next(error);
  }
};

export const getMyReports = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Bạn cần đăng nhập để xem báo lỗi"));
    }

    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 10, 1);

    const filters: reportService.ReportFilters = {};

    if (req.query.type && isReportType(req.query.type)) {
      filters.type = req.query.type;
    }

    if (req.query.status && isReportStatus(req.query.status)) {
      filters.status = req.query.status;
    }

    if (req.query.search && typeof req.query.search === "string") {
      filters.search = req.query.search.trim();
    }

    if (req.query.from && typeof req.query.from === "string") {
      const fromDate = new Date(req.query.from);
      if (!Number.isNaN(fromDate.getTime())) {
        filters.from = fromDate;
      }
    }

    if (req.query.to && typeof req.query.to === "string") {
      const toDate = new Date(req.query.to);
      if (!Number.isNaN(toDate.getTime())) {
        filters.to = toDate;
      }
    }

    const result = await reportService.getReportsByUser(userId, filters, {
      page,
      limit,
    });

    res
      .status(200)
      .json(ApiResponse.success(result, "Lấy danh sách báo lỗi thành công"));
  } catch (error) {
    next(error);
  }
};

export const getMyReportDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Bạn cần đăng nhập để xem báo lỗi"));
    }

    const { reportId } = req.params;
    const report = await reportService.getReportByIdForUser(reportId, userId);

    if (!report) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy báo lỗi"));
    }

    res
      .status(200)
      .json(ApiResponse.success(report, "Lấy chi tiết báo lỗi thành công"));
  } catch (error) {
    next(error);
  }
};

// ==================== CTV CONTROLLERS ====================

/**
 * CTV lấy danh sách báo lỗi được gán cho mình
 */
export const getCTVReports = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctvId = req.user?._id;
    if (!ctvId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Bạn cần đăng nhập để xem báo lỗi"));
    }

    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 10, 1);

    const filters: reportService.ReportFilters = {};

    if (req.query.type && isReportType(req.query.type)) {
      filters.type = req.query.type;
    }

    if (req.query.status && isReportStatus(req.query.status)) {
      filters.status = req.query.status;
    }

    if (req.query.search && typeof req.query.search === "string") {
      filters.search = req.query.search.trim();
    }

    if (req.query.from && typeof req.query.from === "string") {
      const fromDate = new Date(req.query.from);
      if (!Number.isNaN(fromDate.getTime())) {
        filters.from = fromDate;
      }
    }

    if (req.query.to && typeof req.query.to === "string") {
      const toDate = new Date(req.query.to);
      if (!Number.isNaN(toDate.getTime())) {
        filters.to = toDate;
      }
    }

    const result = await reportService.getReportsForCTV(ctvId, filters, {
      page,
      limit,
    });

    res
      .status(200)
      .json(ApiResponse.success(result, "Lấy danh sách báo lỗi thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * CTV lấy chi tiết báo lỗi
 */
export const getCTVReportDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctvId = req.user?._id;
    if (!ctvId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Bạn cần đăng nhập để xem báo lỗi"));
    }

    const { reportId } = req.params;
    const report = await reportService.getReportByIdForCTV(reportId, ctvId);

    if (!report) {
      return res
        .status(404)
        .json(
          ApiResponse.fail("Không tìm thấy báo lỗi hoặc bạn không có quyền xem")
        );
    }

    res
      .status(200)
      .json(ApiResponse.success(report, "Lấy chi tiết báo lỗi thành công"));
  } catch (error) {
    next(error);
  }
};

/**
 * CTV cập nhật trạng thái báo lỗi
 */
export const updateCTVReport = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ctvId = req.user?._id;
    if (!ctvId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Bạn cần đăng nhập để cập nhật báo lỗi"));
    }

    const { reportId } = req.params;
    const { status, adminNote } = req.body;

    const payload: { status?: ReportStatus; adminNote?: string } = {};

    if (status !== undefined) {
      if (!isReportStatus(status)) {
        return res
          .status(400)
          .json(ApiResponse.fail("Trạng thái không hợp lệ"));
      }
      payload.status = status;
    }

    if (adminNote !== undefined) {
      if (typeof adminNote !== "string") {
        return res.status(400).json(ApiResponse.fail("Ghi chú không hợp lệ"));
      }
      payload.adminNote = adminNote.trim();
    }

    if (Object.keys(payload).length === 0) {
      return res
        .status(400)
        .json(ApiResponse.fail("Không có thông tin cần cập nhật"));
    }

    const updated = await reportService.updateReportByCTV(
      reportId,
      payload,
      ctvId
    );

    if (!updated) {
      return res
        .status(404)
        .json(
          ApiResponse.fail(
            "Không tìm thấy báo lỗi hoặc bạn không có quyền cập nhật"
          )
        );
    }

    res
      .status(200)
      .json(ApiResponse.success(updated, "Cập nhật báo lỗi thành công"));
  } catch (error) {
    next(error);
  }
};
