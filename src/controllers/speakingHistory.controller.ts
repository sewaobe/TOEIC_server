import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { ChatSession } from "../models/chat_session.model";
import { ChatMessage } from "../models/chat_message.model";

// Get list of speaking_conversation sessions for current user
export const getSpeakingSessionsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            ChatSession.find({ user_id: userId, is_archived: false, type: "speaking_conversation" })
                .sort({ updated_at: -1 })
                .skip(skip)
                .limit(limit),
            ChatSession.countDocuments({ user_id: userId, is_archived: false, type: "speaking_conversation" }),
        ]);

        const hasMore = skip + items.length < total;

        return res.status(200).json(
            ApiResponse.success({ items, page, total, hasMore }, "Lấy danh sách phiên luyện nói thành công")
        );
    } catch (err) {
        next(err);
    }
};

// Get all messages in a specific speaking session
export const getSpeakingSessionMessagesController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json(ApiResponse.fail("Thiếu tham số `sessionId`."));
        }

        const messages = await ChatMessage.find({ session_id: sessionId }).sort({ created_at: 1 });

        return res.status(200).json(
            ApiResponse.success(messages, "Lấy danh sách tin nhắn luyện nói thành công")
        );
    } catch (err) {
        next(err);
    }
};
