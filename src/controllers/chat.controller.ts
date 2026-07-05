import { NextFunction, Request, Response } from "express";
import {
    deleteChatSessionService,
    getAllChatMessageInSessionService,
    getChatSessionByUserIdService,
    logChatActionClickService,
    createChatSessionService,
} from "./../services/chat.service";
import { ChatMessage } from "../models/chat_message.model";
import { ChatSession } from "../models/chat_session.model";
import {
    buildQuickQuestionContextSnapshot,
    processDbFirstMessageService,
    routeChatMessage,
} from "../services/chat_db_first.service";
import {
    ChatClientContext,
    ChatConversationState,
    ChatRouteContext,
} from "../types/chat.types";
import { ApiResponse } from "../utils/ApiResponse";

async function loadConversationState(
    sessionId: string
): Promise<ChatConversationState | undefined> {
    const previousBotMessage = await ChatMessage.findOne({
        session_id: sessionId,
        sender: "bot",
    })
        .sort({ created_at: -1 })
        .lean();
    const meta = previousBotMessage?.meta as any;
    const scope = meta?.routing?.scope;
    if (!scope || scope === "unknown") return undefined;
    return {
        scope,
        intent: meta?.intent,
        attemptId: meta?.routeContext?.attemptId,
        questionId: meta?.routeContext?.questionId,
    };
}

async function createSafeRoutingFallbackMessage(params: {
    sessionId: string;
    routeContext?: ChatRouteContext;
    clientContext?: ChatClientContext;
    routing: Awaited<ReturnType<typeof routeChatMessage>>;
}) {
    const text =
        "MÃ¬nh chÆ°a xÃ¡c Ä‘á»‹nh Ä‘Æ°á»£c yÃªu cáº§u Ä‘á»§ rÃµ Ä‘á»ƒ xá»­ lÃ½ an toÃ n. Báº¡n cÃ³ thá»ƒ há»i cá»¥ thá»ƒ vá» cÃ¢u sai, bÃ i test, tiáº¿n Ä‘á»™ hoáº·c kiáº¿n thá»©c TOEIC.";
    const finalText =
        params.routing.decision.kind === "safe_fallback" &&
        params.routing.decision.reason === "outside_toeic_scope"
            ? "Mình chỉ hỗ trợ các câu hỏi liên quan TOEIC, tiếng Anh học TOEIC và việc học trong hệ thống này."
            : text;
    const botMessage = await ChatMessage.create({
        session_id: params.sessionId,
        sender: "bot",
        text: finalText,
        meta: {
            model: "router-safe-fallback",
            intent: "safe_fallback",
            usedAI: false,
            contextType: "routing_fallback",
            fallbackUsed: true,
            routeContext: params.routeContext,
            clientContext: params.clientContext,
            resolverOutcome: "safe_fallback",
            routing: {
                ...params.routing.diagnostics,
                decision: params.routing.decision.kind,
                scope: params.routing.scope,
                intent: params.routing.intent,
                slots: params.routing.slots,
                resolverPolicy: params.routing.resolverPolicy,
                reasonCodes: params.routing.reasonCodes,
            },
        } as any,
    });

    await ChatSession.findByIdAndUpdate(params.sessionId, {
        $set: {
            last_message_preview: finalText.slice(0, 100),
            updated_at: new Date(),
        },
        $inc: { total_messages: 2 },
    });

    return botMessage;
}

export const createChatSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
        }

        const userId = req.user._id;
        const { title, type } = req.body;

        if (!title || !type) {
            return res.status(400).json(ApiResponse.fail("Thiếu tham số `title` hoặc `type`."));
        }

        const newSession = await createChatSessionService(userId, title, type);
        return res.status(201).json(ApiResponse.success(newSession, "Tạo phiên chat mới thành công"));
    } catch (err) {
        next(err);
    }
};

export const getChatSessionByUserIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
        }

        const userId = req.user._id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const result = await getChatSessionByUserIdService(userId, page, limit);
        return res.status(200).json(ApiResponse.success(result, "Lấy danh sách phiên chat thành công"));
    } catch (err) {
        next(err);
    }
};

export const getAllChatMessageInSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
        }

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json(ApiResponse.fail("Thiếu tham số `sessionId`."));
        }

        const messages = await getAllChatMessageInSessionService(sessionId, req.user._id);
        if (!messages) {
            return res.status(404).json(ApiResponse.fail("Phiên chat không tồn tại hoặc không thuộc về bạn."));
        }

        return res.status(200).json(ApiResponse.success(messages, "Lấy danh sách tin nhắn trong phiên chat thành công"));
    } catch (err) {
        next(err);
    }
};

export const processUserMessageController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            sessionId,
            userText,
            routeContext,
            clientContext,
            mode,
        } = req.body;
        const userId = (req as any).user?._id?.toString();

        if (!sessionId || !userText) {
            return res.status(400).json(ApiResponse.fail("Thiếu tham số `sessionId` hoặc `userText`."));
        }

        if (!userId) {
            return res.status(401).json(ApiResponse.fail("NgÆ°á»i dÃ¹ng chÆ°a Ä‘Äƒng nháº­p!"));
        }

        const session = await ChatSession.findOne({
            _id: sessionId,
            user_id: userId,
            $or: [
                { is_archived: false },
                { is_archived: { $exists: false } },
            ],
        });
        if (!session) {
            return res.status(404).json(ApiResponse.fail("PhiÃªn chat khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng thuá»™c vá» báº¡n."));
        }

        const conversationState = await loadConversationState(sessionId);
        const quickQuestionContext = await buildQuickQuestionContextSnapshot({
            userId,
            routeContext,
            clientContext,
        });

        await ChatMessage.create({
            session_id: sessionId,
            sender: "user",
            text: userText,
            created_at: new Date(),
            meta: {
                routeContext,
                clientContext,
                quickQuestionContext,
            } as any,
        });

        const routing = await routeChatMessage({
            userText,
            routeContext,
            clientContext,
            conversationState,
        });
        const legacyModeIgnored = mode === "legacy";
        console.info("chat.route.decision", {
            userText,
            pipeline: "db_first",
            transport: "http",
            legacyModeIgnored,
            scope: routing.scope,
            intent: routing.intent,
            source: routing.source,
            topCandidates: routing.diagnostics.candidates,
            routeContext,
            chromaQueried: routing.diagnostics.chromaQueried ?? false,
            chromaAvailable: routing.diagnostics.chromaAvailable ?? false,
            resolverPolicy: routing.resolverPolicy,
            reasonCodes: routing.reasonCodes,
        });

        const { botMessage } =
            routing.decision.kind !== "safe_fallback"
                ? await processDbFirstMessageService({
                    sessionId,
                    userId,
                    userText,
                    routeContext,
                    clientContext,
                    conversationState,
                    routing,
                })
                : {
                    botMessage: await createSafeRoutingFallbackMessage({
                        sessionId,
                        routeContext,
                        clientContext,
                        routing,
                    }),
                };

        return res.status(200).json(ApiResponse.success(botMessage, "Xử lý tin nhắn người dùng thành công"));
    } catch (err) {
        next(err);
    }
};

export const deleteChatSessionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
        }

        const userId = req.user._id;
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json(ApiResponse.fail("Thiếu tham số `sessionId`."));
        }

        const deletedSession = await deleteChatSessionService(sessionId, userId);
        if (!deletedSession) {
            return res.status(404).json(ApiResponse.fail("Phiên chat không tồn tại hoặc đã được xóa."));
        }

        return res.status(200).json(ApiResponse.success(deletedSession, "Xóa phiên chat thành công"));
    } catch (err) {
        next(err);
    }
};

export const logChatActionClickController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res.status(401).json(ApiResponse.fail("Người dùng chưa đăng nhập!"));
        }

        const { messageId, actionType, payload } = req.body;
        if (!messageId || !actionType) {
            return res.status(400).json(ApiResponse.fail("Thiếu tham số `messageId` hoặc `actionType`."));
        }

        const updatedMessage = await logChatActionClickService(
            req.user._id,
            messageId,
            actionType,
            payload ?? {}
        );

        if (!updatedMessage) {
            return res.status(404).json(ApiResponse.fail("Không tìm thấy tin nhắn hoặc phiên chat không thuộc về bạn."));
        }

        return res.status(200).json(ApiResponse.success(updatedMessage, "Ghi nhận action click thành công"));
    } catch (err) {
        next(err);
    }
};
