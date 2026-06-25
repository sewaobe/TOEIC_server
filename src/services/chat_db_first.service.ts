import { generateFromPromptWithMeta, streamFromPromptWithMeta } from "../core/llm";
import { ChatMessage } from "../models/chat_message.model";
import { ChatSession } from "../models/chat_session.model";
import { buildActions } from "./chat_action_builder.service";
import {
  buildDbFirstContext,
  buildQuestionContext,
  ensureObjectId,
} from "./chat_context_builder.service";
import {
  detectDbFirstIntent,
  routeChatMessage,
} from "./chat_intent_router.service";
import { buildInitialResponseState } from "./chat_policy_guard.service";
import {
  buildPrompt,
  STUDENT_ANSWER_END,
  STUDENT_ANSWER_START,
} from "./chat_prompt_builder.service";
import { resolveQuestionReferenceFromRouteContext } from "./chat_question_reference.service";
import { chooseResponseMode } from "./chat_response_planner.service";
import { validateReply } from "./chat_response_validator.service";
import { buildTemplateReply, resolveSmalltalkSubtype } from "./chat_templates.service";
import { buildChatStructuredView } from "./chat_structured_view.service";
import { generateEmotionalSupportReply } from "./chat_emotional_support.service";
import {
  formatDbInlineText,
  formatDbTextForCard,
  formatDbTextForChat,
} from "./chat_db_text_formatter.service";
import {
  ChatRouteContext,
  ChatRoutePage,
  DbFirstInput,
  DbFirstContext,
  DbFirstResult,
  IChatMessageMeta,
  IChatStructuredView,
  IQuickQuestionContext,
  IQuickQuestionView,
  IQuickQuestionVocabularyItem,
  ChatRoutingResult,
} from "../types/chat.types";

function normalizeDbFirstContextErrorType(context: DbFirstContext) {
  if (context.ok) return undefined;
  switch (context.errorType) {
    case "MISSING_CONTEXT":
      if (context.outcome === "forbidden") return "UNAUTHORIZED";
      if (context.outcome === "no_data") return "NO_USER_DATA";
      return "MISSING_REQUIRED_CONTEXT";
    case "NO_DATA":
      return "NO_USER_DATA";
    default:
      return context.errorType;
  }
}

export {
  buildDbFirstContext,
  buildQuestionIdentificationContext,
  buildProgressContext,
  buildQuestionContext,
  buildTestResultContext,
  ensureObjectId,
  partFromQuestion,
  serializeChoices,
} from "./chat_context_builder.service";

export {
  detectDbFirstIntent,
  routeChatMessage,
  shouldFallbackDbFirstToLegacy,
  shouldUseDbFirstIntent,
  toLegacyChatIntent,
} from "./chat_intent_router.service";

export { buildActions } from "./chat_action_builder.service";
export { buildInitialResponseState } from "./chat_policy_guard.service";
export { buildPrompt } from "./chat_prompt_builder.service";
export { chooseResponseMode } from "./chat_response_planner.service";
export { validateReply } from "./chat_response_validator.service";
export { buildTemplateReply } from "./chat_templates.service";

type DbFirstStreamCallbacks = {
  onStreamStart?: () => void;
  onChunk?: (chunk: string) => void;
};

const DB_FIRST_PAGES = new Set<ChatRoutePage>([
  "question_review",
  "test_result",
  "test_practice",
  "dashboard",
]);

const AI_FALLBACK_REPLY =
  "Mình đã lấy dữ liệu từ bài làm của bạn, nhưng AI đang quá tải hoặc phản hồi chậm. Bạn thử lại sau ít phút nhé.";

export function shouldUseDbFirstChat(params: {
  mode?: "legacy" | "db_first";
  routeContext?: ChatRouteContext;
}) {
  if (params.mode === "legacy") return true;
  if (params.mode === "db_first") return true;
  if (process.env.CHATBOT_DB_FIRST_ENABLED !== "true") return false;
  return !!params.routeContext?.page && DB_FIRST_PAGES.has(params.routeContext.page);
}

function createStudentAnswerStreamFilter(onChunk?: (chunk: string) => void) {
  let buffer = "";
  let started = false;
  let ended = false;
  let hasEmitted = false;
  const preStartKeepChars = 800;
  const markerKeepChars = Math.max(
    STUDENT_ANSWER_START.length,
    STUDENT_ANSWER_END.length
  ) - 1;
  const promptEchoMarkers = [
    "PERSONA:",
    "ROLE:",
    "TASK:",
    "USER_MESSAGE:",
    "TRUSTED_CONTEXT:",
    "OUTPUT_RULES:",
    "EXPLAIN_QUESTION_RULES:",
  ];

  const findRealStartIndex = () => {
    while (buffer) {
      const upperBuffer = buffer.toUpperCase();
      const startIndex = upperBuffer.indexOf(STUDENT_ANSWER_START);
      if (startIndex < 0) return -1;

      const beforeStart = upperBuffer.slice(0, startIndex);
      const isPromptEcho = promptEchoMarkers.some((marker) =>
        beforeStart.includes(marker)
      );
      if (!isPromptEcho) return startIndex;

      buffer = buffer.slice(startIndex + STUDENT_ANSWER_START.length);
    }

    return -1;
  };

  const emitSafeChunk = (chunk: string) => {
    const safeChunk = hasEmitted ? chunk : chunk.replace(/^\s+/, "");
    if (!safeChunk) return false;
    hasEmitted = true;
    onChunk?.(safeChunk);
    return true;
  };

  return (rawChunk: string) => {
    if (ended || !rawChunk) return false;
    buffer += rawChunk;

    if (!started) {
      const startIndex = findRealStartIndex();
      if (startIndex < 0) {
        buffer = buffer.slice(-preStartKeepChars);
        return false;
      }

      started = true;
      buffer = buffer.slice(startIndex + STUDENT_ANSWER_START.length);
    }

    const endIndex = buffer.toUpperCase().indexOf(STUDENT_ANSWER_END);
    if (endIndex >= 0) {
      const emitted = emitSafeChunk(buffer.slice(0, endIndex));
      buffer = "";
      ended = true;
      return emitted;
    }

    if (buffer.length <= markerKeepChars) return false;
    const emitted = emitSafeChunk(buffer.slice(0, -markerKeepChars));
    buffer = buffer.slice(-markerKeepChars);
    return emitted;
  };
}

async function assertSessionOwner(sessionId: string, userId: string) {
  const session = await ChatSession.findOne({
    _id: sessionId,
    user_id: userId,
    $or: [
      { is_archived: false },
      { is_archived: { $exists: false } },
    ],
  });
  if (!session) {
    const err = new Error("Chat session not found");
    (err as any).status = 404;
    throw err;
  }
}

async function persistBotMessage(params: {
  sessionId: string;
  reply: string;
  meta: IChatMessageMeta;
}) {
  const botMessage = await ChatMessage.create({
    session_id: params.sessionId,
    sender: "bot",
    text: params.reply,
    meta: params.meta,
  });

  await ChatSession.findByIdAndUpdate(params.sessionId, {
    $set: {
      last_message_preview: params.reply.slice(0, 100),
      updated_at: new Date(),
    },
    $inc: { total_messages: 2 },
  });

  return botMessage;
}

async function buildDbFirstProcessingState({
  sessionId,
  userId,
  userText,
  routeContext,
  clientContext,
  conversationState,
  routing: providedRouting,
}: DbFirstInput) {
  const startedAt = Date.now();
  await assertSessionOwner(sessionId, userId);

  const routing =
    providedRouting ??
    (await routeChatMessage({
      userText,
      routeContext,
      clientContext,
      conversationState,
    }));
  const intent =
    routing.decision.kind === "route" ||
    routing.decision.kind === "general_ai"
      ? routing.decision.intentId
      : routing.decision.kind === "clarify" && routing.decision.intentId
        ? routing.decision.intentId
        : "safe_fallback";
  const baseRouteContext: ChatRouteContext = routeContext ?? {
    page: "unknown",
  };
  const resolvedFollowUp = routing.diagnostics.followUp;
  const scopedRouteContext: ChatRouteContext = {
    ...baseRouteContext,
    ...(!baseRouteContext.attemptId && routing.source === "follow_up" && conversationState?.attemptId
      ? { attemptId: conversationState.attemptId }
      : {}),
    ...(!baseRouteContext.questionId && routing.source === "follow_up" && routing.scope === "single_question" && conversationState?.questionId
      ? { questionId: conversationState.questionId }
      : {}),
    ...(!baseRouteContext.attemptId && resolvedFollowUp?.resolvedAttemptId
      ? { attemptId: resolvedFollowUp.resolvedAttemptId }
      : {}),
    ...(!baseRouteContext.questionId && resolvedFollowUp?.resolvedQuestionId
      ? { questionId: resolvedFollowUp.resolvedQuestionId }
      : {}),
    ...(!baseRouteContext.currentQuestionNumber && resolvedFollowUp?.resolvedQuestionNumber
      ? { currentQuestionNumber: resolvedFollowUp.resolvedQuestionNumber }
      : {}),
  };
  const resolvedQuestion =
    intent === "identify_question" ||
    intent === "explain_question" ||
    intent === "question.explain_specific" ||
    intent === "question.translate_context" ||
    intent === "vocabulary.contextual" ||
    intent === "grammar.contextual"
      ? resolveQuestionReferenceFromRouteContext(userText, scopedRouteContext)
      : null;
  const effectiveRouteContext =
    scopedRouteContext && resolvedQuestion?.matched && resolvedQuestion.questionId
      ? {
          ...scopedRouteContext,
          questionId: resolvedQuestion.questionId,
          currentQuestionNumber:
            resolvedQuestion.questionNumber ??
            scopedRouteContext?.currentQuestionNumber,
        }
      : scopedRouteContext;
  const context =
    routing.decision.kind === "clarify"
      ? {
          ok: false as const,
          errorType: "MISSING_REQUIRED_CONTEXT" as const,
          outcome: "clarify" as const,
          fallback:
            "Mình cần thêm ngữ cảnh từ trang hiện tại để trả lời chính xác. Hãy mở đúng câu hỏi hoặc bài làm cần xem rồi thử lại.",
        }
      : await buildDbFirstContext(
          userId,
          intent,
          effectiveRouteContext,
          userText
        );
  const responseMode =
    (intent === "explain_question" || intent === "question.explain_specific") &&
    clientContext?.sourceAction === "quick_question_explain"
      ? "template"
      : chooseResponseMode(intent, context);
  const actions = buildActions(intent, context);
  const initialResponseState = buildInitialResponseState(context);

  return {
    startedAt,
    intent,
    effectiveRouteContext,
    context,
    responseMode,
    actions,
    initialResponseState,
    routing,
  };
}

function buildDbFirstMeta(params: {
  model: string;
  intent: string;
  usedAI: boolean;
  contextType?: string;
  actions: any[];
  routeContext?: ChatRouteContext;
  clientContext?: any;
  startedAt: number;
  errorType?: string;
  quickQuestionView?: IQuickQuestionView;
  quickQuestionContext?: IQuickQuestionContext;
  structuredView?: IChatStructuredView;
  routing: ChatRoutingResult;
  resolverOutcome:
    | "resolved"
    | "clarify"
    | "no_data"
    | "forbidden"
    | "unauthorized"
    | "unsupported_capability"
    | "safe_fallback";
}) {
  return {
    model: params.model,
    intent: params.intent,
    usedAI: params.usedAI,
    contextType: params.contextType,
    actions: params.actions,
    routeContext: params.routeContext,
    clientContext: params.clientContext,
    responseTimeMs: Date.now() - params.startedAt,
    errorType: params.errorType,
    fallbackUsed: !!params.errorType,
    quickQuestionView: params.quickQuestionView,
    quickQuestionContext: params.quickQuestionContext,
    structuredView: params.structuredView,
    resolverOutcome: params.resolverOutcome,
    routing: {
      ...params.routing.diagnostics,
      decision: params.routing.decision.kind,
      scope: params.routing.scope,
      intent: params.routing.intent,
      slots: params.routing.slots,
      resolverPolicy: params.routing.resolverPolicy,
      reasonCodes: params.routing.reasonCodes,
    },
  } as IChatMessageMeta;
}

function compactText(text = "", maxLength = 900) {
  return formatDbTextForChat(text, {
    maxLength,
    bulletizeSentences: true,
  });
}

function formatChoiceForView(choices: any, key?: string) {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return "Chưa chọn";
  const value = choices?.[normalizedKey];
  if (!value) return normalizedKey;
  return `${normalizedKey}. ${formatDbInlineText(value, 220)}`;
}

function normalizeChoicesForContext(choices: any) {
  if (!choices || typeof choices !== "object") return {};
  return Object.fromEntries(
    Object.entries(choices).map(([key, value]) => [
      key,
      typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value,
    ])
  );
}

function buildQuickQuestionContextFromData(params: {
  data: any;
  routeContext?: ChatRouteContext;
  clientContext?: any;
}): IQuickQuestionContext | undefined {
  const question = params.data.question;
  const attempt = params.data.currentAttempt ?? params.data.attempt;
  if (!question || !attempt) return undefined;

  const userAnswer = attempt.userAnswer ?? params.data.userAnswer ?? "";
  const isCorrect = attempt.isCorrect ?? params.data.isCorrect;
  const status: IQuickQuestionContext["status"] =
    userAnswer === "" ? "skipped" : isCorrect ? "correct" : "wrong";
  const questionNumber = Number(params.routeContext?.currentQuestionNumber);

  return {
    questionId: String(question.id),
    ...(Number.isFinite(questionNumber) && questionNumber > 0
      ? { questionNumber }
      : {}),
    attemptId: String(attempt.id),
    testId: String(attempt.testId),
    ...(params.clientContext?.testTitle
      ? { testTitle: String(params.clientContext.testTitle) }
      : {}),
    ...(question.part ? { part: String(question.part) } : {}),
    ...(question.textQuestion ? { questionText: formatDbInlineText(question.textQuestion, 260) } : {}),
    choices: normalizeChoicesForContext(question.choices),
    userAnswer,
    userAnswerText: formatChoiceForView(question.choices, userAnswer),
    correctAnswer: String(question.correctAnswer ?? ""),
    correctAnswerText: formatChoiceForView(question.choices, question.correctAnswer),
    isCorrect,
    status,
  };
}

export async function buildQuickQuestionContextSnapshot(params: {
  userId: string;
  routeContext?: ChatRouteContext;
  clientContext?: any;
}): Promise<IQuickQuestionContext | undefined> {
  if (params.clientContext?.sourceAction !== "quick_question_explain") return undefined;
  const attemptObjectId = ensureObjectId(params.routeContext?.attemptId);
  const questionObjectId = ensureObjectId(params.routeContext?.questionId);
  if (!attemptObjectId || !questionObjectId) return undefined;

  const context = await buildQuestionContext(params.userId, params.routeContext, "");
  if (!context.ok) return undefined;

  return buildQuickQuestionContextFromData({
    data: context.data,
    routeContext: params.routeContext,
    clientContext: params.clientContext,
  });
}

function parseVocabularyFromText(text = ""): IQuickQuestionVocabularyItem[] {
  const candidates = text
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const vocabulary: IQuickQuestionVocabularyItem[] = [];
  for (const candidate of candidates) {
    const match = candidate.match(/^["']?([^:"'()]{2,60})["']?\s*(?:\(([^)]{1,12})\))?\s*[:\-–—]\s*(.{2,120})$/);
    if (!match) continue;
    const word = match[1].trim();
    const pos = match[2]?.trim();
    const meaning = match[3].trim();
    if (!word || !meaning) continue;
    if (/\s{4,}|[.!?]$/.test(word)) continue;
    vocabulary.push({ word, ...(pos ? { pos } : {}), meaning });
  }

  return vocabulary.slice(0, 8);
}

function normalizeQuickLabel(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isEmptyDbText(text = "") {
  const normalized = normalizeQuickLabel(text);
  return !normalized || normalized === "khong co" || normalized === "none" || normalized === "n/a";
}

function parseVocabularyList(text = ""): IQuickQuestionVocabularyItem[] {
  const candidates = text
    .split(/[;\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const vocabulary: IQuickQuestionVocabularyItem[] = [];

  for (const candidate of candidates) {
    const match =
      candidate.match(/^["']?([^:"'()]{2,60})["']?\s*(?:\(([^)]{1,12})\))?\s*[:\-]\s*(.{2,120})$/) ??
      candidate.match(/^["']?([^:"'()]{2,60})["']?\s+\(([^)]{1,12})\)\s+(.{2,120})$/);
    if (!match) continue;

    const word = match[1].trim();
    const pos = match[2]?.trim();
    const meaning = match[3].trim();
    if (!word || !meaning) continue;
    vocabulary.push({ word, ...(pos ? { pos } : {}), meaning });
  }

  return vocabulary.slice(0, 8);
}

function parseQuickExplanationSections(rawText = "") {
  const sections = {
    explanation: "",
    vocabularyText: "",
  };
  let current: "explanation" | "vocabularyText" | null = null;

  const append = (key: "explanation" | "vocabularyText", value: string) => {
    const cleaned = value.trim();
    if (isEmptyDbText(cleaned)) return;
    sections[key] = sections[key] ? `${sections[key]}\n${cleaned}` : cleaned;
  };

  for (const rawLine of String(rawText).split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-•]\s*/, "").trim();
    if (!line) continue;

    const labeled = line.match(/^([^:]{1,45})\s*:\s*(.*)$/);
    if (labeled) {
      const label = normalizeQuickLabel(labeled[1]);
      const value = labeled[2].trim();

      if (label.includes("tu vung") || label.includes("vocabulary")) {
        current = "vocabularyText";
        append("vocabularyText", value);
        continue;
      }

      if (label.includes("giai thich") || label.includes("explanation")) {
        current = "explanation";
        append("explanation", value);
        continue;
      }

      if (label.includes("dich cau") || label.includes("dap an") || label.includes("translation")) {
        current = null;
        continue;
      }
    }

    if (current) append(current, line);
  }

  if (!sections.explanation && !sections.vocabularyText && rawText && !isEmptyDbText(rawText)) {
    sections.explanation = rawText;
  }

  return {
    explanation: sections.explanation ? formatDbTextForCard(sections.explanation, 900) : undefined,
    vocabularyText: sections.vocabularyText ? compactText(sections.vocabularyText, 700) : undefined,
  };
}

function buildQuickQuestionView(params: {
  context: DbFirstContext;
  routeContext?: ChatRouteContext;
  clientContext?: any;
}): IQuickQuestionView | undefined {
  if (!params.context.ok) return undefined;
  if (params.clientContext?.sourceAction !== "quick_question_explain") return undefined;

  const question = params.context.data.question;
  const attempt = params.context.data.currentAttempt ?? params.context.data.attempt;
  if (!question || !attempt) return undefined;

  const userAnswer = attempt.userAnswer ?? params.context.data.userAnswer ?? "";
  const isCorrect = attempt.isCorrect ?? params.context.data.isCorrect;
  const status: IQuickQuestionView["status"] =
    userAnswer === "" ? "skipped" : isCorrect ? "correct" : "wrong";
  const statusText = status === "correct" ? "Đúng" : status === "wrong" ? "Sai" : "Bỏ qua";
  const questionNumber = Number(params.routeContext?.currentQuestionNumber);
  const questionLabel =
    Number.isFinite(questionNumber) && questionNumber > 0
      ? `Câu ${questionNumber}`
      : "Câu này";
  const parsedSections = parseQuickExplanationSections(question.explanation ?? "");
  const vocabulary = parsedSections.vocabularyText
    ? parseVocabularyList(parsedSections.vocabularyText)
    : [];
  const tags = Array.isArray(question.tags)
    ? question.tags
        .map((tag: string) => String(tag).replace(/\[|\]/g, "").trim())
        .filter(Boolean)
        .filter((tag: string) => !/^part\s*\d+$/i.test(tag))
        .slice(0, 3)
    : [];

  return {
    questionLabel,
    status,
    statusText,
    userAnswer: formatChoiceForView(question.choices, userAnswer),
    correctAnswer: formatChoiceForView(question.choices, question.correctAnswer),
    ...(parsedSections.explanation ? { explanation: parsedSections.explanation } : {}),
    ...(vocabulary.length ? { vocabulary } : {}),
    ...(tags.length ? { reminder: `Luyện lại ${tags.join(", ")}.` } : {}),
  };
}

async function resolveDbFirstReply(
  input: DbFirstInput,
  callbacks?: DbFirstStreamCallbacks
) {
  const state = await buildDbFirstProcessingState(input);
  const {
    startedAt,
    intent,
    effectiveRouteContext,
    context,
    responseMode,
    actions,
    initialResponseState,
    routing,
  } = state;

  let usedAI = false;
  let aiModel = "db-first-template";
  const normalizedErrorType = normalizeDbFirstContextErrorType(context);
  let errorType: string | undefined =
    normalizedErrorType ?? initialResponseState.errorType;
  let reply = initialResponseState.reply;
  let contextType = initialResponseState.contextType;

  if (responseMode === "template") {
    const smalltalkSubtype =
      intent === "smalltalk" || intent === "smalltalk.greeting_feedback"
        ? resolveSmalltalkSubtype(input.userText)
        : "";

    if (smalltalkSubtype === "emotion_support") {
      contextType = "emotion_support";
      try {
        const aiResult = await generateEmotionalSupportReply({
          sessionId: input.sessionId,
          userText: input.userText,
          routeContext: effectiveRouteContext,
          clientContext: input.clientContext,
        });
        usedAI = true;
        aiModel = aiResult.model;
        reply = aiResult.text;
      } catch (err) {
        console.warn("Emotional smalltalk AI generation failed:", err);
        reply = buildTemplateReply(intent, context, {
          sessionId: input.sessionId,
          userText: input.userText,
          clientContext: input.clientContext,
          routeContext: effectiveRouteContext,
        });
      }
    } else {
      reply = buildTemplateReply(intent, context, {
        sessionId: input.sessionId,
        userText: input.userText,
        clientContext: input.clientContext,
        routeContext: effectiveRouteContext,
      });
    }
  }

  if (responseMode === "ai") {
    if (!context.ok) {
      reply = context.fallback;
      errorType = normalizeDbFirstContextErrorType(context);
    } else {
      usedAI = true;
      const prompt = buildPrompt(intent, input.userText, context.data);
      try {
        const aiResult = callbacks
          ? await streamAiReply(prompt, callbacks)
          : await generateFromPromptWithMeta(prompt);
        aiModel = aiResult.model;
        reply = validateReply(aiResult.text, AI_FALLBACK_REPLY);
        if (reply === AI_FALLBACK_REPLY) {
          console.warn("DB-first AI response rejected by validator:", {
            model: aiModel,
            intent,
            contextType,
          });
          usedAI = false;
          errorType = "AI_RESPONSE_INVALID";
        }
      } catch (err) {
        console.warn(callbacks ? "DB-first AI stream failed:" : "DB-first AI generation failed:", err);
        usedAI = false;
        reply = AI_FALLBACK_REPLY;
        errorType = "AI_SERVICE_ERROR";
      }
    }
  }

  const quickQuestionView = buildQuickQuestionView({
    context,
    routeContext: effectiveRouteContext,
    clientContext: input.clientContext,
  });
  const quickQuestionContext = context.ok
    ? buildQuickQuestionContextFromData({
        data: context.data,
        routeContext: effectiveRouteContext,
        clientContext: input.clientContext,
      })
    : undefined;
  const resolvedRouteContext =
    context.ok &&
    routing.scope === "attempt_analysis" &&
    context.data.attempt?.id
      ? {
          ...effectiveRouteContext,
          attemptId: String(context.data.attempt.id),
        }
      : effectiveRouteContext;
  const structuredView = buildChatStructuredView({
    intent,
    context,
    reply,
    actions,
    routeContext: resolvedRouteContext,
    errorType: normalizedErrorType ?? errorType,
    quickQuestionView,
  });

  const meta = buildDbFirstMeta({
    model: usedAI || errorType === "AI_RESPONSE_INVALID" ? aiModel : "db-first-template",
    intent,
    usedAI,
    contextType,
    actions,
    routeContext: resolvedRouteContext,
    clientContext: input.clientContext,
    errorType: normalizedErrorType ?? errorType,
    startedAt,
    quickQuestionView,
    quickQuestionContext,
    structuredView,
    routing,
    resolverOutcome: context.ok ? "resolved" : context.outcome ?? "safe_fallback",
  });

  return { reply, meta };
}

async function streamAiReply(prompt: string, callbacks: DbFirstStreamCallbacks) {
  const filterChunk = createStudentAnswerStreamFilter(callbacks.onChunk);
  callbacks.onStreamStart?.();
  return streamFromPromptWithMeta(prompt, filterChunk);
}

export async function processDbFirstMessageService(input: DbFirstInput): Promise<DbFirstResult> {
  const { reply, meta } = await resolveDbFirstReply(input);
  const botMessage = await persistBotMessage({
    sessionId: input.sessionId,
    reply,
    meta,
  });

  return { botMessage };
}

export async function processDbFirstMessageStreamService(
  input: DbFirstInput,
  callbacks: DbFirstStreamCallbacks = {}
): Promise<DbFirstResult> {
  // Temporarily unused by the socket handler while DB-first streaming is disabled.
  const { reply, meta } = await resolveDbFirstReply(input, callbacks);
  const botMessage = await persistBotMessage({
    sessionId: input.sessionId,
    reply,
    meta,
  });

  return { botMessage };
}
