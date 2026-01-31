import { FilterQuery, Types, UpdateQuery } from "mongoose";
import { IReport, Report, GroupUser } from "../models";
import { ReportType } from "../models/enums/ReportType";
import { ReportStatus } from "../models/enums/ReportStatus";
import { pushNotificationToAdmin } from "../utils/pushNotificationToAdmin";
import { pushNotification } from "../utils/pushNotification";

export interface ReportFilters {
  type?: ReportType;
  status?: ReportStatus;
  search?: string;
  from?: Date;
  to?: Date;
}

export interface ReportListParams {
  page: number;
  limit: number;
}

export interface ReportUserInfo {
  id: string;
  fullname: string;
  email: string;
  avatar?: string;
}

export interface ReportDto {
  id: string;
  type: ReportType;
  title: string;
  description: string;
  imageUrl?: string;
  status: ReportStatus;
  adminNote?: string;
  handledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: ReportUserInfo | null;
  handler: ReportUserInfo | null;
  assignedTo: ReportUserInfo | null; // CTV được gán xử lý
}

export interface ReportListResponse {
  items: ReportDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const toObjectId = (id: string, field: string) => {
  if (!Types.ObjectId.isValid(id)) {
    const error = new Error(`ID ${field} không hợp lệ`);
    (error as any).status = 400;
    throw error;
  }
  return new Types.ObjectId(id);
};

const safeToString = (value: any) => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }
  if (typeof value.toString === "function") {
    return value.toString();
  }
  if (value._id) {
    return safeToString(value._id);
  }
  return "";
};

const normalizeUser = (user: any): ReportUserInfo | null => {
  if (!user) {
    return null;
  }

  return {
    id: safeToString(user._id),
    fullname: user.profile?.fullname || user.fullname || user.username || "",
    email: user.email || "",
    avatar: user.profile?.avatar,
  };
};

const mapReport = (
  report: IReport & { user_id?: any; handled_by?: any; assigned_to?: any }
): ReportDto => ({
  id: safeToString(report._id),
  type: report.type,
  title: report.title,
  description: report.description,
  imageUrl: report.image_url || undefined,
  status: report.status,
  adminNote: report.admin_note || undefined,
  handledAt: report.handled_at ? report.handled_at.toISOString() : null,
  createdAt: report.created_at?.toISOString?.() || new Date().toISOString(),
  updatedAt: report.updated_at?.toISOString?.() || new Date().toISOString(),
  reporter: normalizeUser(report.user_id),
  handler: normalizeUser(report.handled_by),
  assignedTo: normalizeUser(report.assigned_to),
});

const buildDateRangeQuery = (filters: ReportFilters) => {
  if (!filters.from && !filters.to) {
    return undefined;
  }
  const range: Record<string, Date> = {};
  if (filters.from) {
    range.$gte = filters.from;
  }
  if (filters.to) {
    range.$lte = filters.to;
  }
  return range;
};

const buildCommonQuery = (filters: ReportFilters): FilterQuery<IReport> => {
  const query: FilterQuery<IReport> = {};
  if (filters.type) {
    query.type = filters.type;
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.search) {
    query.$or = [
      { title: { $regex: filters.search, $options: "i" } },
      { description: { $regex: filters.search, $options: "i" } },
    ];
  }
  const dateRange = buildDateRangeQuery(filters);
  if (dateRange) {
    (query as any).created_at = dateRange;
  }
  return query;
};

// Các loại report cần gửi cho CTV (mentor) của học viên
const LESSON_REPORT_TYPES = [ReportType.LESSON, ReportType.FLASHCARD];

// Tìm mentor (CTV) của user
const findMentorOfUser = async (
  userId: string
): Promise<Types.ObjectId | null> => {
  const group = await GroupUser.findOne({
    students: toObjectId(userId, "user"),
  }).lean();

  return group?.mentor_id || null;
};

export const createReport = async (params: {
  userId: string;
  type: ReportType;
  title: string;
  description: string;
  imageUrl?: string;
}): Promise<ReportDto> => {
  const { userId, type, title, description, imageUrl } = params;

  // Xác định người được gán xử lý báo lỗi
  let assignedTo: Types.ObjectId | null = null;

  // Báo lỗi liên quan bài học → gán cho CTV (mentor của học viên)
  if (LESSON_REPORT_TYPES.includes(type)) {
    assignedTo = await findMentorOfUser(userId);
  }
  // Báo lỗi hệ thống, chatbot, other → để null (Admin xử lý)

  const report = await Report.create({
    user_id: toObjectId(userId, "user"),
    type,
    title,
    description,
    image_url: imageUrl,
    status: ReportStatus.PENDING,
    assigned_to: assignedTo,
  });

  await report.populate([
    { path: "user_id", select: "profile fullname email username" },
    { path: "assigned_to", select: "profile fullname email username" },
  ]);

  const mapped = mapReport(report as any);
  if (mapped.reporter === null) {
    throw new Error("Reporter should not be null after population");
  }

  // Gửi thông báo đến người được gán (CTV hoặc Admin)
  if (assignedTo) {
    // Gửi cho CTV
    pushNotification({
      senderId: userId,
      recipientId: assignedTo.toString(),
      message: `Có báo lỗi mới từ học viên ${mapped.reporter.fullname}`,
      type: type,
      description: mapped.title.concat(
        " - ",
        mapped.description.slice(0, 50),
        "..."
      ),
      url: `/ctv/reports`,
    });
  } else {
    // Gửi cho Admin
    pushNotificationToAdmin(userId, {
      message: `Có báo lỗi mới từ ${mapped.reporter.fullname}`,
      type: type,
      description: mapped.title.concat(
        " - ",
        mapped.description.slice(0, 50),
        "..."
      ),
      url: `/admin/reports`,
    });
  }

  return mapped;
};

export const getReportsByUser = async (
  userId: string,
  filters: ReportFilters,
  { page, limit }: ReportListParams
): Promise<ReportListResponse> => {
  const query: FilterQuery<IReport> = {
    ...buildCommonQuery(filters),
    user_id: toObjectId(userId, "user"),
  };

  const safePage = Math.max(page, 1);
  const safeLimit = Math.max(limit, 1);
  const skip = (safePage - 1) * safeLimit;

  const [total, reports] = await Promise.all([
    Report.countDocuments(query),
    Report.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate([
        { path: "user_id", select: "profile fullname email username" },
        { path: "handled_by", select: "profile fullname email username" },
        { path: "assigned_to", select: "profile fullname email username" },
      ]),
  ]);

  return {
    items: reports.map((report) => mapReport(report as any)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1),
    },
  };
};

export const getReportByIdForUser = async (
  reportId: string,
  userId: string
): Promise<ReportDto | null> => {
  const report = await Report.findOne({
    _id: toObjectId(reportId, "report"),
    user_id: toObjectId(userId, "user"),
  }).populate([
    { path: "user_id", select: "profile fullname email username" },
    { path: "handled_by", select: "profile fullname email username" },
    { path: "assigned_to", select: "profile fullname email username" },
  ]);

  if (!report) {
    return null;
  }

  return mapReport(report as any);
};

export const getReportsForAdmin = async (
  filters: ReportFilters,
  { page, limit }: ReportListParams
): Promise<ReportListResponse> => {
  const query = buildCommonQuery(filters);

  const safePage = Math.max(page, 1);
  const safeLimit = Math.max(limit, 1);
  const skip = (safePage - 1) * safeLimit;

  const [total, reports] = await Promise.all([
    Report.countDocuments(query),
    Report.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate([
        { path: "user_id", select: "profile fullname email username" },
        { path: "handled_by", select: "profile fullname email username" },
        { path: "assigned_to", select: "profile fullname email username" },
      ]),
  ]);

  return {
    items: reports.map((report) => mapReport(report as any)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1),
    },
  };
};

export const getReportById = async (
  reportId: string
): Promise<ReportDto | null> => {
  const report = await Report.findById(toObjectId(reportId, "report")).populate(
    [
      { path: "user_id", select: "profile fullname email username" },
      { path: "handled_by", select: "profile fullname email username" },
      { path: "assigned_to", select: "profile fullname email username" },
    ]
  );

  if (!report) {
    return null;
  }

  return mapReport(report as any);
};

export const updateReport = async (
  reportId: string,
  payload: {
    status?: ReportStatus;
    adminNote?: string;
    handledBy?: string | null;
  },
  adminId: string
): Promise<ReportDto | null> => {
  const update: UpdateQuery<IReport> = {};

  if (payload.status) {
    update.status = payload.status;
    update.handled_at =
      payload.status === ReportStatus.RESOLVED ? new Date() : null;
  }

  if (payload.adminNote !== undefined) {
    update.admin_note = payload.adminNote;
  }

  if (payload.handledBy) {
    update.handled_by = toObjectId(payload.handledBy, "handledBy");
  } else if (payload.handledBy === null) {
    update.handled_by = null;
  } else {
    update.handled_by = toObjectId(adminId, "admin");
  }

  const updated = await Report.findByIdAndUpdate(
    toObjectId(reportId, "report"),
    update,
    { new: true }
  ).populate([
    { path: "user_id", select: "profile fullname email username" },
    { path: "handled_by", select: "profile fullname email username" },
    { path: "assigned_to", select: "profile fullname email username" },
  ]);

  if (!updated) {
    return null;
  }

  const mapped = mapReport(updated as any);
  if (mapped.reporter === null) {
    throw new Error("Reporter should not be null after population");
  }

  pushNotification({
    senderId: adminId,
    recipientId: mapped.reporter.id,
    message: `Báo lỗi của bạn đã được cập nhật trạng thái: ${mapped.status}`,
    type: mapped.type,
    description: mapped.title.concat(
      " - ",
      mapped.description.slice(0, 50),
      "..."
    ),
    url: `/reports/${mapped.id}`,
  });

  return mapped;
};

// ==================== CTV FUNCTIONS ====================

/**
 * Lấy danh sách báo lỗi được gán cho CTV
 */
export const getReportsForCTV = async (
  ctvId: string,
  filters: ReportFilters,
  { page, limit }: ReportListParams
): Promise<ReportListResponse> => {
  const query: FilterQuery<IReport> = {
    ...buildCommonQuery(filters),
    assigned_to: toObjectId(ctvId, "ctv"), // Chỉ lấy reports được gán cho CTV này
  };

  const safePage = Math.max(page, 1);
  const safeLimit = Math.max(limit, 1);
  const skip = (safePage - 1) * safeLimit;

  const [total, reports] = await Promise.all([
    Report.countDocuments(query),
    Report.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate([
        { path: "user_id", select: "profile fullname email username" },
        { path: "handled_by", select: "profile fullname email username" },
        { path: "assigned_to", select: "profile fullname email username" },
      ]),
  ]);

  return {
    items: reports.map((report) => mapReport(report as any)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1),
    },
  };
};

/**
 * Lấy chi tiết báo lỗi cho CTV (chỉ lấy nếu được gán cho CTV này)
 */
export const getReportByIdForCTV = async (
  reportId: string,
  ctvId: string
): Promise<ReportDto | null> => {
  const report = await Report.findOne({
    _id: toObjectId(reportId, "report"),
    assigned_to: toObjectId(ctvId, "ctv"),
  }).populate([
    { path: "user_id", select: "profile fullname email username" },
    { path: "handled_by", select: "profile fullname email username" },
    { path: "assigned_to", select: "profile fullname email username" },
  ]);

  if (!report) {
    return null;
  }

  return mapReport(report as any);
};

/**
 * CTV cập nhật báo lỗi (chỉ được update report được gán cho mình)
 */
export const updateReportByCTV = async (
  reportId: string,
  payload: {
    status?: ReportStatus;
    adminNote?: string;
  },
  ctvId: string
): Promise<ReportDto | null> => {
  // Kiểm tra report có được gán cho CTV này không
  const existingReport = await Report.findOne({
    _id: toObjectId(reportId, "report"),
    assigned_to: toObjectId(ctvId, "ctv"),
  });

  if (!existingReport) {
    return null; // Không tìm thấy hoặc không có quyền
  }

  const update: UpdateQuery<IReport> = {};

  if (payload.status) {
    update.status = payload.status;
    update.handled_at =
      payload.status === ReportStatus.RESOLVED ? new Date() : null;
  }

  if (payload.adminNote !== undefined) {
    update.admin_note = payload.adminNote;
  }

  // CTV tự xử lý nên set handled_by là CTV
  update.handled_by = toObjectId(ctvId, "ctv");

  const updated = await Report.findByIdAndUpdate(
    toObjectId(reportId, "report"),
    update,
    { new: true }
  ).populate([
    { path: "user_id", select: "profile fullname email username" },
    { path: "handled_by", select: "profile fullname email username" },
    { path: "assigned_to", select: "profile fullname email username" },
  ]);

  if (!updated) {
    return null;
  }

  const mapped = mapReport(updated as any);
  if (mapped.reporter === null) {
    throw new Error("Reporter should not be null after population");
  }

  // Gửi thông báo cho học viên
  pushNotification({
    senderId: ctvId,
    recipientId: mapped.reporter.id,
    message: `Báo lỗi của bạn đã được mentor cập nhật trạng thái: ${mapped.status}`,
    type: mapped.type,
    description: mapped.title.concat(
      " - ",
      mapped.description.slice(0, 50),
      "..."
    ),
    url: `/reports/${mapped.id}`,
  });

  return mapped;
};
