import { NextFunction, Request, Response } from "express";
import {
    startOrResumeSessionService,
    updateSessionProgressService,
    completeSessionService,
    getSessionByTopicService,
    getUserSessionsService,
    getSessionAttemptsService,
    saveAttemptService,
    cancelSessionService
} from "../services/practice_session.service";
import { ApiResponse } from "../utils/ApiResponse";
import { PracticeType, SessionStatus } from "../models/practice_session.model";

/**
 * Start hoặc resume session
 */
export const startOrResumeSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;
        const { practice_type, topic_id, total_items } = req.body;

        if (!practice_type || !topic_id || total_items === undefined) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu thông tin bắt buộc: practice_type, topic_id, total_items")
            );
        }

        const result = await startOrResumeSessionService(userId, practice_type, topic_id, total_items);

        // Nếu resume, load luôn attempts đã làm
        let existingAttempts: any[] = [];
        if (result.isResume) {
            existingAttempts = await getSessionAttemptsService(result.session._id as string, userId);
        }

        res.status(result.isResume ? 200 : 201).json(
            ApiResponse.success(
                {
                    session: result.session,
                    isResume: result.isResume,
                    existingAttempts
                },
                result.isResume
                    ? "Resume phiên luyện tập thành công."
                    : "Tạo phiên luyện tập mới thành công."
            )
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Update progress
 */
export const updateSessionProgressController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;
        const { current_index, completed_items, correct_count, total_accuracy } = req.body;

        const session = await updateSessionProgressService(sessionId, {
            current_index,
            completed_items,
            correct_count,
            total_accuracy
        });

        res.status(200).json(
            ApiResponse.success(session, "Cập nhật tiến độ thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Complete session
 */
export const completeSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;
        const { attempts } = req.body;

        if (!Array.isArray(attempts)) {
            return res.status(400).json(
                ApiResponse.fail("attempts phải là một mảng")
            );
        }

        const result = await completeSessionService(sessionId, attempts);

        res.status(200).json(
            ApiResponse.success(result, "Hoàn thành phiên luyện tập thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Get session by topic
 */
export const getSessionByTopicController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;
        const { topicId } = req.params;
        const { practice_type } = req.query;

        if (!practice_type) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu query param: practice_type")
            );
        }

        const session = await getSessionByTopicService(
            userId,
            practice_type as PracticeType,
            topicId
        );

        res.status(200).json(
            ApiResponse.success(session, session ? "Tìm thấy session." : "Không có session.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Get all sessions của user
 */
export const getUserSessionsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;
        const { practice_type, status, page, limit } = req.query;

        const result = await getUserSessionsService(
            userId,
            practice_type as PracticeType,
            status as SessionStatus,
            page ? parseInt(page as string) : 1,
            limit ? parseInt(limit as string) : 100
        );

        res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách sessions thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Get attempts của 1 session
 */
export const getSessionAttemptsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;
        const { sessionId } = req.params;

        const attempts = await getSessionAttemptsService(sessionId, userId);

        res.status(200).json(
            ApiResponse.success(attempts, "Lấy danh sách attempts thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Save attempt ngay khi submit
 */
export const saveAttemptController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;
        const { sessionId } = req.params;
        const attempt = req.body;

        const savedAttempt = await saveAttemptService(sessionId, userId, attempt);

        res.status(201).json(
            ApiResponse.success(savedAttempt, "Lưu attempt thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Cancel session
 */
export const cancelSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;

        const session = await cancelSessionService(sessionId);

        res.status(200).json(
            ApiResponse.success(session, "Hủy phiên luyện tập thành công.")
        );
    } catch (err) {
        next(err);
    }
};
