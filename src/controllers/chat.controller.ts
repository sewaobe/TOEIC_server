import { deleteChatSessionService, getAllChatMessageInSessionService, getChatSessionByUserIdService, processUserMessageService } from './../services/chat.service';
import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { createChatSessionService } from "../services/chat.service";

export const createChatSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { title, type } = req.body;

        if (!title || !type) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `title` hoặc `type`.")
            );
        }

        const newSession = await createChatSessionService(userId, title, type);
        return res.status(201).json(
            ApiResponse.success(newSession, "Tạo phiên chat mới thành công")
        );

    } catch (err) {
        next(err);
    }
}

export const getChatSessionByUserIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const result = await getChatSessionByUserIdService(userId, page, limit);
        return res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách phiên chat thành công")
        );
    } catch (err) {
        next(err);
    }
}

export const getAllChatMessageInSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `sessionId`.")
            );
        }

        const messages = await getAllChatMessageInSessionService(sessionId);
        return res.status(200).json(
            ApiResponse.success(messages, "Lấy danh sách tin nhắn trong phiên chat thành công")
        );
    } catch (err) {
        next(err);
    }
}

export const processUserMessageController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId, userText, questionId } = req.body;
        const userId = (req as any).user?._id; // attach authenticated user if available

        if (!sessionId || !userText) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `sessionId` hoặc `userText`.")
            );
        }

        const { botMessage } = await processUserMessageService(sessionId, userText, questionId, userId);

        return res.status(200).json(
            ApiResponse.success(
                botMessage,
                "Xử lý tin nhắn người dùng thành công"
            )
        );
    } catch (err) {
        next(err);
    }
}

export const deleteChatSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `sessionId`.")
            );
        }

        const deletedSession = await deleteChatSessionService(sessionId, userId);
        if (!deletedSession) {
            return res.status(404).json(
                ApiResponse.fail("Phiên chat không tồn tại hoặc đã được xóa.")
            );
        }

        return res.status(200).json(
            ApiResponse.success(deletedSession, "Xóa phiên chat thành công")
        );
    }
    catch (err) {
        next(err);
    }
}