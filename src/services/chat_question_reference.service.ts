import { ChatRouteContext, ChatRouteQuestionRef } from "../types/chat.types";

export interface ResolvedQuestionReference {
  matched: boolean;
  questionId?: string;
  questionNumber?: number;
  textPreview?: string;
  reason: "numbered_question" | "current_question" | "missing_refs" | "not_found" | "no_reference";
}

function normalizeMessage(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function findQuestionNumber(message: string) {
  const normalized = normalizeMessage(message);
  const match = normalized.match(/\b(?:cau|question|q)\s*(?:so|number|#)?\s*(\d{1,3})\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function mentionsCurrentQuestion(message: string) {
  const normalized = normalizeMessage(message);
  return /\b(cau nay|cau do|this question|current question)\b/.test(normalized);
}

function findRefByNumber(refs: ChatRouteQuestionRef[] | undefined, questionNumber?: number) {
  if (!refs?.length || !questionNumber) return undefined;
  return refs.find((ref) => Number(ref.questionNumber) === Number(questionNumber));
}

function findRefById(refs: ChatRouteQuestionRef[] | undefined, questionId?: string) {
  if (!refs?.length || !questionId) return undefined;
  return refs.find((ref) => String(ref.questionId) === String(questionId));
}

export function resolveQuestionReferenceFromRouteContext(
  userText: string,
  routeContext?: ChatRouteContext
): ResolvedQuestionReference {
  const questionNumber = findQuestionNumber(userText);
  const wantsCurrent = mentionsCurrentQuestion(userText);

  if (!questionNumber && !wantsCurrent) {
    return { matched: false, reason: "no_reference" };
  }

  const refs = routeContext?.visibleQuestionRefs?.length
    ? routeContext.visibleQuestionRefs
    : routeContext?.questionRefs;
  if (!refs?.length) {
    const currentQuestionId =
      routeContext?.questionId ??
      routeContext?.currentVisibleQuestionId ??
      routeContext?.selectedQuestionId;
    if (wantsCurrent && currentQuestionId) {
      return {
        matched: true,
        questionId: currentQuestionId,
        questionNumber:
          routeContext?.currentQuestionNumber ??
          routeContext?.currentVisibleQuestionNumber ??
          routeContext?.selectedQuestionNumber,
        reason: "current_question",
      };
    }
    return { matched: false, questionNumber, reason: "missing_refs" };
  }

  if (questionNumber) {
    const ref = findRefByNumber(refs, questionNumber);
    if (!ref) return { matched: false, questionNumber, reason: "not_found" };
    return {
      matched: true,
      questionId: ref.questionId,
      questionNumber: ref.questionNumber,
      textPreview: ref.textPreview,
      reason: "numbered_question",
    };
  }

  const currentRef =
    findRefById(refs, routeContext?.questionId) ??
    findRefById(refs, routeContext?.currentVisibleQuestionId) ??
    findRefById(refs, routeContext?.selectedQuestionId) ??
    findRefByNumber(refs, routeContext?.currentQuestionNumber) ??
    findRefByNumber(refs, routeContext?.currentVisibleQuestionNumber) ??
    findRefByNumber(refs, routeContext?.selectedQuestionNumber);

  const fallbackCurrentQuestionId =
    routeContext?.questionId ??
    routeContext?.currentVisibleQuestionId ??
    routeContext?.selectedQuestionId;
  if (!currentRef && fallbackCurrentQuestionId) {
    return {
      matched: true,
      questionId: fallbackCurrentQuestionId,
      questionNumber:
        routeContext?.currentQuestionNumber ??
        routeContext?.currentVisibleQuestionNumber ??
        routeContext?.selectedQuestionNumber,
      reason: "current_question",
    };
  }

  if (!currentRef) return { matched: false, reason: "not_found" };

  return {
    matched: true,
    questionId: currentRef.questionId,
    questionNumber: currentRef.questionNumber,
    textPreview: currentRef.textPreview,
    reason: "current_question",
  };
}

export function isQuestionReferenceRequest(userText: string, routeContext?: ChatRouteContext) {
  const resolved = resolveQuestionReferenceFromRouteContext(userText, routeContext);
  return resolved.reason !== "no_reference";
}
