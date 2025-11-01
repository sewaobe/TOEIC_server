import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../../utils/ApiResponse";
import * as reportService from "../../services/report.service";
import { ReportType } from "../../models/enums/ReportType";
import { ReportStatus } from "../../models/enums/ReportStatus";

const isReportType = (value: any): value is ReportType =>
  Object.values(ReportType).includes(value as ReportType);

const isReportStatus = (value: any): value is ReportStatus =>
  Object.values(ReportStatus).includes(value as ReportStatus);

export const getReports = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 20, 1);

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

    const result = await reportService.getReportsForAdmin(filters, {
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

export const getReportDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const report = await reportService.getReportById(req.params.reportId);

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

export const updateReport = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = req.user?._id;
    if (!adminId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Bạn cần đăng nhập để cập nhật báo lỗi"));
    }

    const { status, adminNote, handledBy } = req.body;

    if (status && !isReportStatus(status)) {
      return res
        .status(400)
        .json(ApiResponse.fail("Trạng thái báo lỗi không hợp lệ"));
    }

    if (adminNote !== undefined && typeof adminNote !== "string") {
      return res
        .status(400)
        .json(ApiResponse.fail("Ghi chú xử lý không hợp lệ"));
    }

    const updated = await reportService.updateReport(
      req.params.reportId,
      {
        status,
        adminNote: adminNote?.trim?.(),
        handledBy: handledBy ?? undefined,
      },
      adminId
    );

    if (!updated) {
      return res.status(404).json(ApiResponse.fail("Không tìm thấy báo lỗi"));
    }

    res
      .status(200)
      .json(ApiResponse.success(updated, "Cập nhật báo lỗi thành công"));
  } catch (error) {
    next(error);
  }
};
