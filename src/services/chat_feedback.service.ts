import { ChatFeedback } from "../models/chat_feedback.model";

export const submitChatFeedbackService = async (
    sessionId: string,
    messageId: string,
    rating: "like" | "dislike",
    comment?: string,
    userId?: string
) => {
    const feedback = await ChatFeedback.create({
        user_id: userId,
        session_id: sessionId,
        message_id: messageId,
        rating,
        comment,
    });

    return feedback;
}