import { Types } from "mongoose";
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
    ChatErrorType,
    ChatMessagePayload,
    ChatRouteContext,
} from "../types/chat.types";
import { SocketWithUser } from "./types";

function emitChatError(socket: SocketWithUser, errorType: ChatErrorType, message: string) {
    socket.emit("chat:error", {
        type: errorType,
        errorType,
        message,
    });
}

function emitAuthRequired(socket: SocketWithUser) {
    emitChatError(socket, "AUTH_REQUIRED", "Authentication required. Please sign in again.");
}

function isValidSessionId(sessionId: unknown): sessionId is string {
    return typeof sessionId === "string" && Types.ObjectId.isValid(sessionId);
}

function resolveKnownError(err: any): { errorType: ChatErrorType; message: string } | null {
    if (err?.errorType === "AUTH_REQUIRED" || err?.status === 401 || err?.status === 403 || err?.status === 404) {
        return {
            errorType: "AUTH_REQUIRED",
            message: "Authentication required. Please sign in again.",
        };
    }

    if (err?.errorType === "MISSING_CONTEXT" || err?.errorType === "MISSING_REQUIRED_CONTEXT") {
        return {
            errorType: "MISSING_REQUIRED_CONTEXT",
            message: "Missing required chat context.",
        };
    }

    if (err?.errorType === "UNAUTHORIZED") {
        return {
            errorType: "UNAUTHORIZED",
            message: "You do not have access to this chat context.",
        };
    }

    if (err?.errorType === "NO_USER_DATA") {
        return {
            errorType: "NO_USER_DATA",
            message: "No user data is available for this request.",
        };
    }

    if (err?.errorType === "UNSUPPORTED_CAPABILITY") {
        return {
            errorType: "UNSUPPORTED_CAPABILITY",
            message: "This chatbot capability is not supported yet.",
        };
    }

    if (err?.errorType === "LOW_CONFIDENCE") {
        return {
            errorType: "LOW_CONFIDENCE",
            message: "The chatbot needs a clearer request.",
        };
    }

    if (err?.errorType === "VALIDATION_ERROR") {
        return {
            errorType: "VALIDATION_ERROR",
            message: "Invalid chat payload.",
        };
    }

    return null;
}

async function createSafeRoutingFallbackMessage(params: {
    sessionId: string;
    routeContext?: ChatRouteContext;
    clientContext?: ChatClientContext;
    routing: Awaited<ReturnType<typeof routeChatMessage>>;
}) {
    const text =
        "Mình chưa xác định được yêu cầu đủ rõ để xử lý an toàn. Bạn có thể hỏi cụ thể về câu sai, bài test, tiến độ hoặc kiến thức TOEIC.";
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

async function assertSocketSession(sessionId: string, userId: string) {
  return ChatSession.findOne({
        _id: sessionId,
        user_id: userId,
        $or: [
            { is_archived: false },
            { is_archived: { $exists: false } },
    ],
  });
}

async function loadConversationState(
    sessionId: string
): Promise<ChatConversationState | undefined> {
    try {
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
    } catch (err) {
        console.warn("Could not load chat conversation focus:", err);
        return undefined;
    }
}

async function ensureRoutingMetadata(
    botMessage: any,
    routing: Awaited<ReturnType<typeof routeChatMessage>>
) {
    if (!botMessage?._id || botMessage?.meta?.routing) return botMessage;
    const routingMeta = {
        ...routing.diagnostics,
        decision: routing.decision.kind,
        scope: routing.scope,
        intent: routing.intent,
        slots: routing.slots,
        resolverPolicy: routing.resolverPolicy,
        reasonCodes: routing.reasonCodes,
    };
    await ChatMessage.findByIdAndUpdate(botMessage._id, {
        $set: { "meta.routing": routingMeta },
    });
    botMessage.meta = {
        ...(botMessage.meta ?? {}),
        routing: routingMeta,
    };
    return botMessage;
}

function isDefaultChatTitle(title?: string) {
  const value = (title ?? "").trim();
  return (
    /^New\s+.+\s+session$/i.test(value) ||
    /^Question Discussion\s+-/i.test(value) ||
    /^Câu\s+\d+$/i.test(value) ||
    /^Giải thích câu/i.test(value)
  );
}

function formatShortDate(date = new Date()) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function compactTitle(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 46);
}

function deriveSessionTitle(params: {
  userText: string;
  botMessage: any;
  routeContext?: ChatRouteContext;
}) {
  const intent = params.botMessage?.meta?.intent;
  if (intent === "check_progress" || intent === "user_progress.summary") return `Tiến độ học tập - ${formatShortDate()}`;
  if (intent === "analyze_test_result" || intent === "test_attempt.analysis") return "Phân tích bài test";
  if (
    intent === "explain_question" ||
    intent === "identify_question" ||
    intent === "question.explain_specific" ||
    intent === "question.translate_context" ||
    intent === "vocabulary.contextual" ||
    intent === "grammar.contextual"
  ) {
    const routeContext = params.botMessage?.meta?.routeContext ?? params.routeContext;
    const questionNumber = routeContext?.currentQuestionNumber;
    return questionNumber ? `Câu ${questionNumber}` : "Giải thích câu hỏi";
  }
  const title = compactTitle(params.userText);
  return title || "Đoạn chat TOEIC";
}

async function updateDefaultSessionTitle(params: {
  session: any;
  userText: string;
  botMessage: any;
  routeContext?: ChatRouteContext;
}) {
  if (!isDefaultChatTitle(params.session?.title)) return params.session?.title;

  const title = deriveSessionTitle({
    userText: params.userText,
    botMessage: params.botMessage,
    routeContext: params.routeContext,
  });
  const quickQuestionNumber =
    params.botMessage?.meta?.routeContext?.currentQuestionNumber ??
    params.routeContext?.currentQuestionNumber;
  const quickTestTitle = params.botMessage?.meta?.clientContext?.testTitle;
  const finalTitle =
    (params.botMessage?.meta?.intent === "explain_question" ||
      params.botMessage?.meta?.intent === "question.explain_specific") &&
    quickQuestionNumber
      ? quickTestTitle
        ? `Giải thích câu ${quickQuestionNumber} - ${quickTestTitle}`
        : `Giải thích câu ${quickQuestionNumber}`
      : title;

  await ChatSession.findByIdAndUpdate(params.session._id, {
    $set: {
      title: finalTitle,
      updated_at: new Date(),
    },
  });

  return finalTitle;
}

export function registerChatHandlers(socket: SocketWithUser) {
    const userId = socket.user?.id;
    if (!userId) {
        console.warn("Socket does not have userId, skipping chat handlers");
        socket.on("chat:send", () => emitAuthRequired(socket));
        socket.on("chat:history:load", () => emitAuthRequired(socket));
        return;
    }

    console.log(`Chat handlers registered for user ${userId}`);

    socket.on("chat:send", async (data?: Partial<ChatMessagePayload>) => {
        const payload = data ?? {};
        const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
        const userText = typeof payload.userText === "string" ? payload.userText.trim() : "";

        try {
            const { routeContext, clientContext, mode } = payload;
            const legacyModeIgnored = mode === "legacy";
            if (!sessionId || !userText) {
                return emitChatError(socket, "VALIDATION_ERROR", "Missing sessionId or userText");
            }
            if (!isValidSessionId(sessionId)) {
                return emitChatError(socket, "VALIDATION_ERROR", "Invalid sessionId");
            }

            const session = await assertSocketSession(sessionId, userId);
            if (!session) {
                return emitChatError(socket, "AUTH_REQUIRED", "Chat session not found");
            }

            const conversationState = await loadConversationState(sessionId);
            const quickQuestionContext = await buildQuickQuestionContextSnapshot({
                userId,
                routeContext,
                clientContext,
            });

            const userMessage = await ChatMessage.create({
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

            socket.emit("chat:receive", {
                sender: "user",
                message: userMessage,
            });

            socket.emit("chat:botTyping", { sessionId });

            const routing = await routeChatMessage({
                userText,
                routeContext,
                clientContext,
                conversationState,
            });
            console.info("chat.route.decision", {
                userText,
                pipeline: "db_first",
                legacyModeIgnored,
                scope: routing.scope,
                intent: routing.intent,
                source: routing.source,
                topCandidates: routing.diagnostics.candidates,
                routeContext,
                chromaQueried: routing.diagnostics.chromaQueried ?? false,
                chromaAvailable: routing.diagnostics.chromaAvailable ?? false,
                fastPathHit: routing.diagnostics.fastPathHit ?? false,
                semanticIntent: routing.diagnostics.semanticIntent,
                legacyRuleIntent: routing.diagnostics.legacyRuleIntent,
                semanticDegraded: routing.diagnostics.semanticDegraded ?? false,
                rerankerDegraded: routing.diagnostics.rerankerDegraded ?? false,
                winnerScore: routing.diagnostics.winnerScore,
                top1Top2Margin: routing.diagnostics.top1Top2Margin,
                retrievalLatencyMs: routing.diagnostics.retrievalLatencyMs,
                rerankLatencyMs: routing.diagnostics.rerankLatencyMs,
                validationLatencyMs: routing.diagnostics.validationLatencyMs,
                seedVersion: routing.diagnostics.seedVersion,
                rerankerVersion: routing.diagnostics.rerankerVersion,
                resolverPolicy: routing.resolverPolicy,
                reasonCodes: routing.reasonCodes,
            });

            let botMessage;

            if (routing.decision.kind !== "safe_fallback") {
                // Streaming is temporarily disabled for DB-first chat to avoid partial socket failures.
                ({ botMessage } = await processDbFirstMessageService({
                    sessionId,
                    userId,
                    userText,
                    routeContext,
                    clientContext,
                    conversationState,
                    routing,
                }));
            } else {
                botMessage = await createSafeRoutingFallbackMessage({
                    sessionId,
                    routeContext,
                    clientContext,
                    routing,
                });
            }

            botMessage = await ensureRoutingMetadata(botMessage, routing);

            socket.emit("chat:receive", {
                sender: "bot",
                message: botMessage,
            });

            socket.emit("chat:botStopTyping", { sessionId });

            const sessionTitle = await updateDefaultSessionTitle({
                session,
                userText,
                botMessage,
                routeContext,
            });

            socket.emit("chat:sessionUpdated", {
                sessionId,
                title: sessionTitle,
                last_message_preview: botMessage.text.slice(0, 100),
                updated_at: new Date(),
            });
        } catch (err) {
            console.error("Error while processing chat message:", err);
            if (sessionId) {
                socket.emit("chat:botStopTyping", { sessionId });
            }
            const knownError = resolveKnownError(err);
            if (knownError) {
                return emitChatError(socket, knownError.errorType, knownError.message);
            }
            emitChatError(socket, "UNKNOWN", "Error while processing chat message");
        }
    });

    socket.on("chat:history:load", async (rawSessionId: string) => {
        const sessionId = typeof rawSessionId === "string" ? rawSessionId.trim() : "";
        try {
            if (!sessionId) {
                return emitChatError(socket, "VALIDATION_ERROR", "Missing sessionId");
            }
            if (!isValidSessionId(sessionId)) {
                return emitChatError(socket, "VALIDATION_ERROR", "Invalid sessionId");
            }

            const session = await assertSocketSession(sessionId, userId);
            if (!session) {
                return emitChatError(socket, "AUTH_REQUIRED", "Chat session not found");
            }

            const messages = await ChatMessage.find({ session_id: sessionId }).sort({
                created_at: 1,
            });
            socket.emit("chat:history:loaded", messages);
        } catch (err) {
            console.error("Error while loading chat history:", err);
            const knownError = resolveKnownError(err);
            if (knownError) {
                return emitChatError(socket, knownError.errorType, knownError.message);
            }
            emitChatError(socket, "UNKNOWN", "Could not load chat history");
        }
    });
}
