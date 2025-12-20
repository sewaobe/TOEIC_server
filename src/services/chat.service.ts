import { generateAnswer } from "../core/llm";
import { ChatMessage, IChatMessageMeta } from "../models/chat_message.model";
import { ChatSession, ChatType } from "../models/chat_session.model";
import { getContextById, retrieveContext } from "../retriever/retriever";
import { retrieveIdentity } from "../retriever/retriever_identity";
import { retrieveProgress } from "../retriever/retriever_progress";

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
        .find({ user_id: userId, is_archived: false, type: { $ne: "speaking_conversation" } })
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

export const processUserMessageService = async (
    sessionId: string,
    userText: string,
    questionId?: string,
    authenticatedUserId?: string
) => {
    // Helper: simple intent classification - rule based, easy to extend
    function detectIntent(text: string) {
        const t = text.toLowerCase();
        if (t.includes("tôi là ai") || t.includes("who am i") || t.includes("tôi là")) return "personal_identity";
        if (t.includes("năng lực") || t.includes("năng lực như") || t.includes("tôi đang có")) return "progress_assessment";
        // fallback: if contains keywords like 'why', 'đáp án', or a question id provided -> question_help
        if (questionId) return "question_help";
        if (t.includes("đáp án") || t.includes("tại sao") || t.includes("giải thích") || t.endsWith("?")) return "question_help";
        return "general";
    }

    // Retrieval + aggregation
    let contextTexts: string[] = [];

    // If questionId is provided, prefer question retrieval
    if (questionId) {
        const ctxById = await getContextById(questionId);
        if (ctxById && ctxById.context) contextTexts.push(`(source:question_${questionId})\n` + ctxById.context);
    }

    const intent = detectIntent(userText);

    // For personal / progress intents, include user-specific vectors if available
    if ((intent === "personal_identity" || intent === "progress_assessment" || intent === "general") && authenticatedUserId) {
        try {
            const idRes = await retrieveIdentity(authenticatedUserId, userText, 1);
            if (idRes.documents && idRes.documents.length) contextTexts.push(`(source:user_profile)\n` + idRes.documents.join("\n"));
        } catch (err) {
            console.warn("Could not retrieve identity for user", authenticatedUserId, err);
        }

        try {
            const pRes = await retrieveProgress(authenticatedUserId, userText, 1);
            if (pRes.documents && pRes.documents.length) contextTexts.push(`(source:user_progress)\n` + pRes.documents.join("\n"));
        } catch (err) {
            console.warn("Could not retrieve progress for user", authenticatedUserId, err);
        }
    }

    // If still no specific context, use general retriever (questions / content)
    if (contextTexts.length === 0) {
        const contextResult = await retrieveContext(userText);
        if (contextResult && contextResult.context) contextTexts.push(`(source:general)\n` + contextResult.context);
    }

    const aggregatedContext = contextTexts.join("\n\n").trim();

    if (!aggregatedContext) {
        // Lưu tin nhắn bot trả lời không có thông tin
        const botMessage = await ChatMessage.create({
            session_id: sessionId,
            sender: "bot",
            text: "Mình chưa có thông tin cho câu này",
        });
        return { botMessage };
    }

    // Call LLM with aggregated context
    const botAnswer = await generateAnswer(userText, aggregatedContext);

    // Persist bot message
    const botMessage = await ChatMessage.create({
        session_id: sessionId,
        sender: "bot",
        text: botAnswer,
        meta: {
            model: "gemini-2.5-flash-lite",
            intent,
        } as IChatMessageMeta,
    });

    // Update session preview
    await ChatSession.findByIdAndUpdate(sessionId, {
        $set: {
            last_message_preview: botAnswer.slice(0, 100),
            updated_at: new Date(),
        },
        $inc: { total_messages: 2 },
    });

    return { botMessage };
};

export const deleteChatSessionService = async (sessionId: string, userId: string) => {
    const session = await ChatSession.findOneAndUpdate(
        { _id: sessionId, user_id: userId },
        { is_archived: true },
        { new: true }
    );
    return session;
}