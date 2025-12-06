import { generateAnswer } from "../core/llm";
import { ChatMessage, IChatMessageMeta } from "../models/chat_message.model";
import { ChatSession, ChatType } from "../models/chat_session.model";
import { getContextById, retrieveContext } from "../retriever/retriever";

function getInitialBotMessage(type: ChatType): string {
    switch (type) {
        case "question":
            return "👋 Hi there! What TOEIC question would you like to discuss today?";
        case "reading":
            return "📖 Let's dive into some reading strategies or passages. What would you like help with?";
        case "shadowing":
            return "🗣️ Ready to practice speaking and shadowing? You can send me a sentence or phrase to start.";
        case "dictation":
            return "✍️ Let's work on your dictation! I can help you with listening and writing practice.";
        case "lesson":
            return "🧠 Let's review grammar points or take a mini test. Which topic do you want to start with?";
        case "speaking_conversation":
            return "🗣️ Let's practice speaking together. You can start by introducing yourself or describing your day.";
        default:
            return "Hello! How can I help you with your TOEIC preparation today?";
    }
}
export const createChatSessionService = async (userId: string, title: string, type: ChatType, config?: any) => {
    const created = await ChatSession.create({
        user_id: userId,
        title,
        type,
        config,
    });

    const introText = getInitialBotMessage(type);
    await ChatMessage.create({
        session_id: created._id,
        sender: "bot",
        text: introText,
    });

    return created.toObject();
}

export const getChatSessionByUserIdService = async (userId: string, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const sessions = await ChatSession
        .find({ user_id: userId, is_archived: false })
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit);

    const total = await ChatSession.countDocuments({ user_id: userId, is_archived: false });
    const hasMore = skip + sessions.length < total;

    return {
        items: sessions,
        page,
        total,
        hasMore,
    };
}

export const getAllChatMessageInSessionService = async (sessionId: string) => {
    const messages = await ChatMessage.find({ session_id: sessionId }).sort({ created_at: 1 });
    return messages;
}

export const createChatMessageService = async (
    sessionId: string,
    sender: "user" | "bot",
    text: string,
    meta?: IChatMessageMeta
) => {
    const message = await ChatMessage.create({
        session_id: sessionId,
        sender,
        text,
        meta,
    });

    await ChatSession.findByIdAndUpdate(sessionId, {
        $set: {
            last_message_preview: text.slice(0, 100),
            updated_at: new Date(),
        },
        $inc: { total_messages: 1 },
    });

    return message;
}

export const processUserMessageService = async (sessionId: string, userText: string, questionId?: string) => {
    // Lấy context từ 
    let contextResult = null;
    if (questionId) {
        contextResult = await getContextById(questionId);
    } else {
        contextResult = await retrieveContext(userText);
    }

    if (!contextResult || !contextResult.context?.trim()) {
        // Lưu tin nhắn bot trả lời không có thông tin
        const botMessage = await ChatMessage.create({
            session_id: sessionId,
            sender: "bot",
            text: "Mình chưa có thông tin cho câu này",
        });
        return { botMessage };
    }

    // Gọi LLM để lấy câu trả lời
    const botAnswer = await generateAnswer(userText, contextResult.context);

    // Lưu tin nhắn bot
    const botMessage = await ChatMessage.create({
        session_id: sessionId,
        sender: "bot",
        text: botAnswer,
        meta: {
            model: "gemini-2.5-flash-lite",
        },
    });

    // Cập nhật lại thông tin phiên chat
    await ChatSession.findByIdAndUpdate(sessionId, {
        $set: {
            last_message_preview: botAnswer.slice(0, 100),
            updated_at: new Date(),
        },
        $inc: { total_messages: 2 },
    });

    return { botMessage };
}

export const deleteChatSessionService = async (sessionId: string, userId: string) => {
    const session = await ChatSession.findOneAndUpdate(
        { _id: sessionId, user_id: userId },
        { is_archived: true },
        { new: true }
    );
    return session;
}