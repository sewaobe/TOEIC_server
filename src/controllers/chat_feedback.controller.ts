import { NextFunction, Request, Response } from "express";
import { submitChatFeedbackService } from "../services/chat_feedback.service";
import { ApiResponse } from "../utils/ApiResponse";

export const submitChatFeedbackController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId, messageId, rating, comment } = req.body;
        const userId = req.user._id;

        if (!sessionId || !messageId || !rating) {
            return res.status(400).json(
                ApiResponse.fail("Thiếu tham số `sessionId`, `messageId` hoặc `rating`.")
            );
        }

        const feedback = await submitChatFeedbackService(
            sessionId,
            messageId,
            rating,
            comment,
            userId
        );
        return res.status(201).json(
            ApiResponse.success(feedback, "Gửi phản hồi thành công")
        );
    } catch (err) {
        next(err);
    }
}