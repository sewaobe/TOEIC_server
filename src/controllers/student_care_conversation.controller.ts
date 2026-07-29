import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponse } from "../utils/ApiResponse";
import * as studentService from "../services/student.service";
import {
  addCtvSolution,
  createCareConversation,
  getCtvCareConversationDetail,
  getStudentCareConversationDetail,
  listCtvStudentCareConversations,
  listStudentPendingCareConversations,
  respondToCareConversation,
  resolveCareConversation,
  updateFollowUp,
} from "../services/student-care/student-care-conversation.service";
import { CareConversationStatus } from "../models";

function getAuthUserId(req: Request) {
  return req.user?._id ? String(req.user._id) : null;
}

function handleControllerError(error: any, res: Response, next: NextFunction) {
  if (error?.status) {
    res.status(error.status).json(ApiResponse.fail(error.message));
    return;
  }
  next(error);
}

export const createStudentCareConversationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const collaboratorId = getAuthUserId(req);
    const { id: studentId } = req.params;
    const { signalType, signalScopeKey, sentText } = req.body || {};
    if (!collaboratorId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    if (!Types.ObjectId.isValid(studentId)) {
      res.status(400).json(ApiResponse.fail("ID học viên không hợp lệ."));
      return;
    }

    const detail: any = await studentService.getStudentDetailService(
      studentId,
      collaboratorId
    );
    const signal = detail?.careProfile?.signals?.find(
      (item: any) =>
        item.signalType === signalType && item.signalScopeKey === signalScopeKey
    );
    if (!signal) {
      res.status(400).json(ApiResponse.fail("Signal không còn hợp lệ hoặc đã thay đổi."));
      return;
    }

    const result = await createCareConversation({
      studentId,
      collaboratorId,
      learningPathId: detail.learningPathId || null,
      signal,
      sentText,
    });
    res
      .status(result.reused ? 200 : 201)
      .json(ApiResponse.success(result, "Đã tạo trao đổi học tập cho học viên."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const listStudentCareConversationsForCtvController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const collaboratorId = getAuthUserId(req);
    const { id: studentId } = req.params;
    if (!collaboratorId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const result = await listCtvStudentCareConversations({
      studentId,
      collaboratorId,
      status: req.query.status as CareConversationStatus | undefined,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 10),
    });
    res.json(ApiResponse.success(result, "Lấy danh sách trao đổi học tập thành công."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const getCtvCareConversationDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const collaboratorId = getAuthUserId(req);
    if (!collaboratorId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const conversation = await getCtvCareConversationDetail(req.params.id, collaboratorId);
    res.json(ApiResponse.success(conversation, "Lấy chi tiết trao đổi học tập thành công."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const addCtvSolutionController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const collaboratorId = getAuthUserId(req);
    if (!collaboratorId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const conversation = await addCtvSolution({
      conversationId: req.params.id,
      collaboratorId,
      solutionCodes: Array.isArray(req.body?.solutionCodes) ? req.body.solutionCodes : [],
      note: req.body?.note,
      followUpDueAt: req.body?.followUpDueAt,
    });
    res.json(ApiResponse.success(conversation, "Đã ghi nhận hướng hỗ trợ."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const updateFollowUpController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const collaboratorId = getAuthUserId(req);
    if (!collaboratorId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const conversation = await updateFollowUp({
      conversationId: req.params.id,
      collaboratorId,
      dueAt: req.body?.dueAt,
    });
    res.json(ApiResponse.success(conversation, "Đã cập nhật lịch theo dõi."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const resolveCareConversationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const collaboratorId = getAuthUserId(req);
    if (!collaboratorId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const conversation = await resolveCareConversation({ conversationId: req.params.id, collaboratorId });
    res.json(ApiResponse.success(conversation, "Đã đóng trao đổi học tập."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const listStudentPendingCareConversationsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const studentId = getAuthUserId(req);
    if (!studentId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const conversations = await listStudentPendingCareConversations(studentId);
    res.json(ApiResponse.success(conversations, "Lấy trao đổi đang chờ thành công."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const getStudentCareConversationDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const studentId = getAuthUserId(req);
    if (!studentId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const conversation = await getStudentCareConversationDetail(req.params.id, studentId);
    res.json(ApiResponse.success(conversation, "Lấy trao đổi học tập thành công."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const respondStudentCareConversationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const studentId = getAuthUserId(req);
    if (!studentId) {
      res.status(401).json(ApiResponse.fail("Chưa đăng nhập."));
      return;
    }
    const conversation = await respondToCareConversation({
      conversationId: req.params.id,
      studentId,
      primaryAnswerCode: req.body?.primaryAnswerCode,
      secondaryAnswerCode: req.body?.secondaryAnswerCode,
      note: req.body?.note,
    });
    res.json(ApiResponse.success(conversation, "Đã gửi phản hồi cho CTV."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

