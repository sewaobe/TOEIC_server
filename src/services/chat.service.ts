import { generateAnswer, generateFromPromptWithMeta } from "../core/llm";
import { ChatMessage } from "../models/chat_message.model";
import { ChatSession, ChatType } from "../models/chat_session.model";
import { getContextById, retrieveContext } from "../retriever/retriever";
import { retrieveIdentity } from "../retriever/retriever_identity";
import { retrieveProgress } from "../retriever/retriever_progress";
import { IChatMessageMeta } from "../types/chat.types";
import { validateReply } from "./chat_response_validator.service";
import { getPartLessonsService, recommendSkillPracticeService } from "./recommend_skill.service";

type LegacyChatIntent =
    | "personal_identity"
    | "progress_assessment"
    | "specific_part_request"
    | "next_steps"
    | "question_help"
    | "general";

type PartRequest = {
    count: number;
    part: number;
    type?: string;
};

function getInitialBotMessage(type: ChatType): string {
    switch (type) {
        case "question":
            return "Hi there! What TOEIC question would you like to discuss today?";
        case "reading":
            return "Let's dive into some reading strategies or passages. What would you like help with?";
        case "shadowing":
            return "Ready to practice speaking and shadowing? You can send me a sentence or phrase to start.";
        case "dictation":
            return "Let's work on your dictation! I can help you with listening and writing practice.";
        case "lesson":
            return "Let's review grammar points or take a mini test. Which topic do you want to start with?";
        case "speaking_conversation":
            return "Let's practice speaking together. You can start by introducing yourself or describing your day.";
        default:
            return "Hello! How can I help you with your TOEIC preparation today?";
    }
}

function detectLegacyChatIntent(text: string, questionId?: string): LegacyChatIntent {
    const t = text.toLowerCase();

    if (t.includes("tôi là ai") || t.includes("who am i") || t.includes("tôi là")) {
        return "personal_identity";
    }
    if (t.includes("năng lực") || t.includes("năng lực như") || t.includes("tôi đang có")) {
        return "progress_assessment";
    }

    const hasPartMention = /(?:part|phần)\s*(\d+)/i.test(t);
    const hasCount = /(\d+)\s*(?:bài|lesson|quiz)/i.test(t);
    const hasRequestKeyword =
        /(cho|gợi ý|đề xuất|recommend|give|show|lấy|xem|muốn|cần|hãy|tìm|kiếm|list|danh sách)/i.test(t);
    const hasLessonKeyword =
        /(bài|lesson|quiz|dictation|shadowing|vocab|từ vựng|học|luyện|practice)/i.test(t);

    if (hasPartMention && (hasCount || hasRequestKeyword) && hasLessonKeyword) {
        return "specific_part_request";
    }

    if (
        t.includes("tôi cần") ||
        t.includes("cần làm gì") ||
        t.includes("phải làm gì") ||
        t.includes("gợi ý") ||
        t.includes("lộ trình") ||
        t.includes("tiếp theo")
    ) {
        return "next_steps";
    }

    if (questionId) return "question_help";
    if (t.includes("đáp án") || t.includes("tại sao") || t.includes("giải thích") || t.endsWith("?")) {
        return "question_help";
    }

    return "general";
}

function parsePartRequest(text: string): PartRequest | null {
    const t = text.toLowerCase();
    const partMatch = t.match(/(?:part|phần)\s*(\d+)/i);
    if (!partMatch) return null;

    const part = parseInt(partMatch[1]);
    if (part < 1 || part > 7) return null;

    let count = 5;
    const countPatterns = [
        /(\d+)\s*(?:bài|lesson|quiz|dictation|shadowing)/i,
        /(?:cho|gợi ý|lấy|xem|tìm|hãy)\s*(?:tôi|mình|em)?\s*(\d+)/i,
    ];

    for (const pattern of countPatterns) {
        const match = t.match(pattern);
        if (!match) continue;
        const num = parseInt(match[1]);
        if (num >= 1 && num <= 20) {
            count = num;
            break;
        }
    }

    const typePatterns: [RegExp, string][] = [
        [/\b(lesson|bài học)\b/i, "lesson"],
        [/\b(quiz)\b/i, "quiz"],
        [/\b(dictation)\b/i, "dictation"],
        [/\b(shadowing)\b/i, "shadowing"],
        [/\b(vocab|từ vựng|vocabulary)\b/i, "vocab"],
    ];
    const matchedType = typePatterns.find(([pattern]) => pattern.test(t));

    return { count, part, type: matchedType?.[1] };
}

function getTypeLabel(type?: string) {
    if (!type) return "bài";
    return (
        {
            lesson: "bài học",
            quiz: "quiz",
            dictation: "dictation",
            shadowing: "shadowing",
            vocab: "từ vựng",
        }[type] || "bài"
    );
}

function getTypeEmoji(type?: string) {
    return (
        {
            lesson: "📚",
            quiz: "✅",
            dictation: "✍️",
            shadowing: "🗣️",
            vocab: "📖",
        }[type ?? ""] || "🎯"
    );
}

function getAbilityBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
}

async function persistBotReply(sessionId: string, text: string, meta: IChatMessageMeta) {
    const botMessage = await ChatMessage.create({
        session_id: sessionId,
        sender: "bot",
        text,
        meta,
    });

    await ChatSession.findByIdAndUpdate(sessionId, {
        $set: {
            last_message_preview: text.slice(0, 100),
            updated_at: new Date(),
        },
        $inc: { total_messages: 2 },
    });

    return botMessage;
}

async function loadSessionHistoryContext(sessionId: string) {
    try {
        const prevMessages = await ChatMessage.find({ session_id: sessionId }).sort({ created_at: 1 }).limit(40);
        if (!prevMessages?.length) return { context: "", retrieverUnavailable: false };

        const formatted = prevMessages
            .map((m) => `${m.sender === "user" ? "User" : "Bot"}: ${m.text}`)
            .join("\n");
        return { context: `(source:session_history)\n${formatted}`, retrieverUnavailable: false };
    } catch (err) {
        console.warn("Could not retrieve session messages for context", sessionId, err);
        return { context: "", retrieverUnavailable: false };
    }
}

function buildGeminiGeneralFallbackPrompt(params: {
    userText: string;
    sessionHistory: string;
    aggregatedContext?: string;
}) {
    const contextBlock = params.aggregatedContext?.trim()
        ? params.aggregatedContext.trim()
        : "(khong co du lieu DB/RAG dang tin cay cho cau hoi nay)";

    return `
ROLE:
Bạn là trợ lý học TOEIC trong một ứng dụng luyện thi. Hãy trả lời trực tiếp cho người học bằng tiếng Việt tự nhiên.

CHAT_HISTORY:
${params.sessionHistory || "(khong co lich su chat truoc do)"}

AVAILABLE_CONTEXT:
${contextBlock}

USER_MESSAGE:
${params.userText}

RULES:
- Ưu tiên hỗ trợ TOEIC, học tập, cách dùng app và định hướng luyện tập.
- Nếu câu hỏi ngoài TOEIC/app, vẫn trả lời ngắn gọn và hữu ích.
- Không bịa dữ liệu cá nhân như điểm số, bài làm, tiến độ, roadmap, flashcard nếu AVAILABLE_CONTEXT không có.
- Nếu người dùng hỏi dữ liệu cá nhân nhưng không có context, hãy nói bạn chưa có đủ dữ liệu để xác nhận và gợi ý mở đúng trang/bài test.
- Không nói về intent, router, Chroma, RAG, prompt hay luật nội bộ.
- Trả lời gọn, rõ, có thể dùng bullet nếu cần.
`.trim();
}

async function generateGeminiGeneralFallback(params: {
    sessionId: string;
    userText: string;
    intent: LegacyChatIntent | "safe_fallback" | "unknown";
    sessionHistoryContext?: string;
    aggregatedContext?: string;
}) {
    const sessionHistory =
        params.sessionHistoryContext || (await loadSessionHistoryContext(params.sessionId)).context;
    const prompt = buildGeminiGeneralFallbackPrompt({
        userText: params.userText,
        sessionHistory,
        aggregatedContext: params.aggregatedContext,
    });
    const result = await generateFromPromptWithMeta(prompt);
    const fallback = "Mình chưa xử lý được câu hỏi này lúc này. Bạn thử hỏi lại ngắn gọn hơn hoặc mở đúng trang có dữ liệu liên quan nhé.";
    const text = validateReply(result.text, fallback);

    const botMessage = await persistBotReply(params.sessionId, text, {
        model: result.model,
        intent: params.intent,
        usedAI: true,
        contextType: "gemini_general_fallback",
        fallbackUsed: true,
    } as IChatMessageMeta);

    return { botMessage };
}

async function loadQuestionContext(questionId?: string) {
    if (!questionId) return { context: "", retrieverUnavailable: false };

    try {
        const ctxById = await getContextById(questionId);
        return {
            context: ctxById?.context ? `(source:question_${questionId})\n${ctxById.context}` : "",
            retrieverUnavailable: false,
        };
    } catch (err) {
        console.warn("Could not retrieve question context from Chroma", questionId, err);
        return { context: "", retrieverUnavailable: true };
    }
}

async function loadUserPersonalContext(
    userId: string | undefined,
    userText: string,
    intent: LegacyChatIntent | "safe_fallback" | "unknown"
) {
    const contextTexts: string[] = [];
    let retrieverUnavailable = false;
    const shouldLoad =
        !!userId &&
        ["personal_identity", "progress_assessment", "general", "next_steps"].includes(intent);

    if (!shouldLoad) return { contexts: contextTexts, retrieverUnavailable };

    try {
        const idRes = await retrieveIdentity(userId!, userText, 1);
        if (idRes.documents?.length) contextTexts.push(`(source:user_profile)\n${idRes.documents.join("\n")}`);
    } catch (err) {
        retrieverUnavailable = true;
        console.warn("Could not retrieve identity for user", userId, err);
    }

    try {
        const pRes = await retrieveProgress(userId!, userText, 1);
        if (pRes.documents?.length) contextTexts.push(`(source:user_progress)\n${pRes.documents.join("\n")}`);
    } catch (err) {
        retrieverUnavailable = true;
        console.warn("Could not retrieve progress for user", userId, err);
    }

    return { contexts: contextTexts, retrieverUnavailable };
}

async function loadGeneralRetrieverContext(userText: string) {
    try {
        const contextResult = await retrieveContext(userText);
        return {
            context: contextResult?.context ? `(source:general)\n${contextResult.context}` : "",
            retrieverUnavailable: false,
        };
    } catch (err) {
        console.warn("Could not retrieve general context from Chroma", err);
        return { context: "", retrieverUnavailable: true };
    }
}

function buildRecommendationLine(item: any, index: number) {
    const levelBadge = item.levelInfo ? `[${item.levelInfo}]` : "";
    const time = item.estimated_time ? `⏱️ ${item.estimated_time} phút` : "";
    const link = item.action?.route || "#";
    const description = item.description
        ? `   ${item.description.slice(0, 120)}${item.description.length > 120 ? "..." : ""}\n`
        : "";

    return [
        `${index}. ${getTypeEmoji(item.type)} **${item.title}** ${levelBadge}`,
        description.trimEnd(),
        `   ${time} • ${item.reason}`,
        `   👉 [Bắt đầu](${link})`,
    ]
        .filter(Boolean)
        .join("\n");
}

async function tryHandleSpecificPartRequest(sessionId: string, userText: string, authenticatedUserId?: string) {
    if (!authenticatedUserId) return null;

    try {
        const partRequest = parsePartRequest(userText);
        if (!partRequest) return null;

        const { count, part, type } = partRequest;
        const recs = await getPartLessonsService(authenticatedUserId, part, count, type);
        if (!recs?.length) return null;

        const typeLabel = getTypeLabel(type);
        const botText = [
            `📚 **${recs.length} ${typeLabel} cho Part ${part}:**`,
            "",
            recs.map((r, idx) => buildRecommendationLine(r, idx + 1)).join("\n\n"),
        ].join("\n");

        const botMessage = await persistBotReply(sessionId, botText, {
            model: "local-recommender",
            intent: "specific_part_request",
            recommendations: recs,
        } as any);

        return { botMessage };
    } catch (err) {
        console.warn("Failed to get part lessons:", err);
        return null;
    }
}

async function tryHandleNextSteps(sessionId: string, authenticatedUserId?: string) {
    if (!authenticatedUserId) return null;

    try {
        const recs = await recommendSkillPracticeService(authenticatedUserId, { topK: 10 });
        if (!recs?.length) return null;

        const byPart = new Map<number, typeof recs>();
        for (const r of recs) {
            const part = r.part || 0;
            if (!byPart.has(part)) byPart.set(part, []);
            byPart.get(part)!.push(r);
        }

        const sortedParts = Array.from(byPart.entries()).sort((a, b) => {
            const aAbility = a[1][0]?.abilityPercent ?? 50;
            const bAbility = b[1][0]?.abilityPercent ?? 50;
            return aAbility - bAbility;
        });

        let itemIndex = 1;
        const sections = sortedParts.map(([part, items]) => {
            const ability = items[0]?.abilityPercent ?? 50;
            const itemLines = items.map((item) => buildRecommendationLine(item, itemIndex++)).join("\n\n");
            return [
                `📌 **Part ${part}** — Năng lực: ${getAbilityBar(ability)} ${ability}%`,
                "━━━━━━━━━━━━━━━━━━━━━━━━",
                itemLines,
            ].join("\n");
        });

        const botText = [
            `🎯 **Gợi ý ${recs.length} bài học để cải thiện điểm yếu của bạn:**`,
            ...sections,
        ].join("\n\n");

        const botMessage = await persistBotReply(sessionId, botText, {
            model: "local-recommender",
            intent: "next_steps",
            recommendations: recs,
        } as any);

        return { botMessage };
    } catch (err) {
        console.warn("Failed to recommend practice items:", err);
        return null;
    }
}

export const createChatSessionService = async (userId: string, title: string, type: ChatType, config?: any) => {
    const created = await ChatSession.create({
        user_id: userId,
        title,
        type,
        config,
    });

    await ChatMessage.create({
        session_id: created._id,
        sender: "bot",
        text: getInitialBotMessage(type),
    });

    return created.toObject();
};

export const getChatSessionByUserIdService = async (userId: string, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const activeSessionFilter = {
        user_id: userId,
        type: { $ne: "speaking_conversation" },
        $or: [
            { is_archived: false },
            { is_archived: { $exists: false } },
        ],
    };
    const sessions = await ChatSession
        .find(activeSessionFilter)
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit);

    const total = await ChatSession.countDocuments(activeSessionFilter);

    return {
        items: sessions,
        page,
        total,
        hasMore: skip + sessions.length < total,
    };
};

export const getAllChatMessageInSessionService = async (sessionId: string, userId?: string) => {
    if (userId) {
        const session = await ChatSession.findOne({
            _id: sessionId,
            user_id: userId,
            $or: [
                { is_archived: false },
                { is_archived: { $exists: false } },
            ],
        });
        if (!session) return null;
    }

    return ChatMessage.find({ session_id: sessionId }).sort({ created_at: 1 });
};

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
};

export const processUserMessageService = async (
    sessionId: string,
    userText: string,
    questionId?: string,
    authenticatedUserId?: string,
    intentOverride?: LegacyChatIntent | "safe_fallback" | "unknown"
) => {
    const contextTexts: string[] = [];
    let retrieverUnavailable = false;
    let hasTrustedKnowledgeContext = false;

    const sessionHistory = await loadSessionHistoryContext(sessionId);
    if (sessionHistory.context) contextTexts.push(sessionHistory.context);

    const questionContext = await loadQuestionContext(questionId);
    if (questionContext.context) {
        contextTexts.push(questionContext.context);
        hasTrustedKnowledgeContext = true;
    }
    retrieverUnavailable ||= questionContext.retrieverUnavailable;

    const intent = intentOverride ?? detectLegacyChatIntent(userText, questionId);

    if (intent === "specific_part_request") {
        const handled = await tryHandleSpecificPartRequest(sessionId, userText, authenticatedUserId);
        if (handled) return handled;
    }

    const personalContext = await loadUserPersonalContext(authenticatedUserId, userText, intent);
    if (personalContext.contexts.length) {
        contextTexts.push(...personalContext.contexts);
        hasTrustedKnowledgeContext = true;
    }
    retrieverUnavailable ||= personalContext.retrieverUnavailable;

    if (intent === "next_steps") {
        const handled = await tryHandleNextSteps(sessionId, authenticatedUserId);
        if (handled) return handled;
    }

    if (!hasTrustedKnowledgeContext) {
        const generalContext = await loadGeneralRetrieverContext(userText);
        if (generalContext.context) {
            contextTexts.push(generalContext.context);
            hasTrustedKnowledgeContext = true;
        }
        retrieverUnavailable ||= generalContext.retrieverUnavailable;
    }

    const aggregatedContext = contextTexts.join("\n\n").trim();

    if (!hasTrustedKnowledgeContext) {
        try {
            return await generateGeminiGeneralFallback({
                sessionId,
                userText,
                intent,
                sessionHistoryContext: sessionHistory.context,
                aggregatedContext: aggregatedContext || undefined,
            });
        } catch (err) {
            console.warn("Gemini general fallback failed:", err);
        }
    }

    if (!aggregatedContext) {

        const botText = retrieverUnavailable
            ? "Mình chưa xử lý được câu hỏi chung này lúc này. Bạn có thể hỏi về câu sai, kết quả bài test hoặc tiến độ học trước."
            : "Mình chưa có thông tin cho câu này.";

        const botMessage = await persistBotReply(sessionId, botText, {
            model: retrieverUnavailable ? "legacy-safe-fallback" : "legacy-no-context",
            intent,
            usedAI: false,
            errorType: retrieverUnavailable ? "LEGACY_RETRIEVER_UNAVAILABLE" : undefined,
            fallbackUsed: retrieverUnavailable,
        } as IChatMessageMeta);

        return { botMessage };
    }

    const botAnswer = await generateAnswer(userText, aggregatedContext);
    const botMessage = await persistBotReply(sessionId, botAnswer, {
        model: "legacy-llm-chain",
        intent,
    } as IChatMessageMeta);

    return { botMessage };
};

export const deleteChatSessionService = async (sessionId: string, userId: string) => {
    return ChatSession.findOneAndUpdate(
        { _id: sessionId, user_id: userId },
        { is_archived: true },
        { new: true }
    );
};

export const logChatActionClickService = async (
    userId: string,
    messageId: string,
    actionType: string,
    payload: Record<string, any> = {}
) => {
    const message = await ChatMessage.findById(messageId);
    if (!message) return null;

    const session = await ChatSession.findOne({
        _id: message.session_id,
        user_id: userId,
        $or: [
            { is_archived: false },
            { is_archived: { $exists: false } },
        ],
    });

    if (!session) return null;

    return ChatMessage.findByIdAndUpdate(
        messageId,
        {
            $push: {
                "meta.actionClicks": {
                    actionType,
                    payload,
                    clickedAt: new Date(),
                    userId,
                },
            },
        },
        { new: true }
    );
};
