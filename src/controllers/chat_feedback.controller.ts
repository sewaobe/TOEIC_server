import { NextFunction, Request, Response } from 'express';
import { submitChatFeedbackService } from '../services/chat_feedback.service';
import { ApiResponse } from '../utils/ApiResponse';

export const submitChatFeedbackController = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { sessionId, messageId, rating, comment } = req.body;
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;

        if (!sessionId || !messageId || !rating) {
            return res
                .status(400)
                .json(
                    ApiResponse.fail(
                        'Thiếu tham số `sessionId`, `messageId` hoặc `rating`.',
                    ),
                );
        }

        const feedback = await submitChatFeedbackService(
            sessionId,
            messageId,
            rating,
            comment,
            userId,
        );
        return res
            .status(201)
            .json(ApiResponse.success(feedback, 'Gửi phản hồi thành công'));
    } catch (err) {
        next(err);
    }
};
