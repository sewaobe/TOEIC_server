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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    if (!Types.ObjectId.isValid(studentId)) {
      res.status(400).json(ApiResponse.fail("ID há»c viÃªn khÃ´ng há»£p lá»‡."));
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
      res.status(400).json(ApiResponse.fail("Signal khÃ´ng cÃ²n há»£p lá»‡ hoáº·c Ä‘Ã£ thay Ä‘á»•i."));
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
      .json(ApiResponse.success(result, "ÄÃ£ táº¡o trao Ä‘á»•i há»c táº­p cho há»c viÃªn."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const result = await listCtvStudentCareConversations({
      studentId,
      collaboratorId,
      status: req.query.status as CareConversationStatus | undefined,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 10),
    });
    res.json(ApiResponse.success(result, "Láº¥y danh sÃ¡ch trao Ä‘á»•i há»c táº­p thÃ nh cÃ´ng."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const conversation = await getCtvCareConversationDetail(req.params.id, collaboratorId);
    res.json(ApiResponse.success(conversation, "Láº¥y chi tiáº¿t trao Ä‘á»•i há»c táº­p thÃ nh cÃ´ng."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const conversation = await addCtvSolution({
      conversationId: req.params.id,
      collaboratorId,
      solutionCodes: Array.isArray(req.body?.solutionCodes) ? req.body.solutionCodes : [],
      note: req.body?.note,
      followUpDueAt: req.body?.followUpDueAt,
    });
    res.json(ApiResponse.success(conversation, "ÄÃ£ ghi nháº­n hÆ°á»›ng há»— trá»£."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const conversation = await updateFollowUp({
      conversationId: req.params.id,
      collaboratorId,
      dueAt: req.body?.dueAt,
    });
    res.json(ApiResponse.success(conversation, "ÄÃ£ cáº­p nháº­t lá»‹ch theo dÃµi."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const conversation = await resolveCareConversation({ conversationId: req.params.id, collaboratorId });
    res.json(ApiResponse.success(conversation, "ÄÃ£ Ä‘Ã³ng trao Ä‘á»•i há»c táº­p."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const conversations = await listStudentPendingCareConversations(studentId);
    res.json(ApiResponse.success(conversations, "Láº¥y trao Ä‘á»•i Ä‘ang chá» thÃ nh cÃ´ng."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const conversation = await getStudentCareConversationDetail(req.params.id, studentId);
    res.json(ApiResponse.success(conversation, "Láº¥y trao Ä‘á»•i há»c táº­p thÃ nh cÃ´ng."));
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
      res.status(401).json(ApiResponse.fail("ChÆ°a Ä‘Äƒng nháº­p."));
      return;
    }
    const conversation = await respondToCareConversation({
      conversationId: req.params.id,
      studentId,
      primaryAnswerCode: req.body?.primaryAnswerCode,
      secondaryAnswerCode: req.body?.secondaryAnswerCode,
      note: req.body?.note,
    });
    res.json(ApiResponse.success(conversation, "ÄÃ£ gá»­i pháº£n há»“i cho CTV."));
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

