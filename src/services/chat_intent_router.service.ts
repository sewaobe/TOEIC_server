import {
  ChatAnalysisMetric,
  ChatClientContext,
  ChatConversationState,
  FollowUpContext,
  ChatIntent,
  ChatResolverPolicy,
  ChatRouteContext,
  ChatRouteSlots,
  ChatScope,
  ChatRouteSource,
  ChatRoutingResult,
  IntentCandidate,
  RoutingDiagnostics,
  ScopeDecision,
} from "../types/chat.types";
import {
  CHAT_INTENT_CATALOG_VERSION,
  getIntentCatalogEntry,
} from "./chat_intent_examples.data";
import { rankIntentCandidates } from "./chat_semantic_intent.service";
import { rerankIntentCandidates, CHAT_INTENT_RERANKER_VERSION } from "./chat_intent_reranker.service";
import { resolveQuestionReferenceFromRouteContext } from "./chat_question_reference.service";

const DEFAULT_MIN_CONFIDENCE = Number(
  process.env.CHAT_INTENT_MIN_CONFIDENCE ?? 0.58
);
const DEFAULT_MIN_MARGIN = Number(process.env.CHAT_INTENT_MIN_MARGIN ?? 0.08);
const DEFAULT_STRONG_MARGIN = Number(
  process.env.CHAT_INTENT_STRONG_MARGIN ?? 0.65
);
const DEFAULT_MAX_DISTANCE = Number(
  process.env.CHAT_INTENT_MAX_DISTANCE ?? 1.25
);
const CHAT_INTENT_SEED_VERSION = String(CHAT_INTENT_CATALOG_VERSION);

const DB_FIRST_INTENTS = new Set<ChatIntent>([
  "smalltalk",
  "smalltalk.greeting_feedback",
  "identify_question",
  "explain_question",
  "question.explain_specific",
  "question.translate_context",
  "vocabulary.contextual",
  "grammar.contextual",
  "analyze_test_result",
  "test_attempt.analysis",
  "check_progress",
  "user_progress.summary",
  "roadmap.guidance",
  "roadmap.summary",
  "roadmap.next_step",
  "roadmap.explain_recommendation",
  "roadmap.adjust",
  "flashcard.personal",
  "app.navigation_support",
  "toeic_knowledge.general",
  "general_toeic_question",
]);

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeToeicKnowledge(text: string) {
  return /\b(toeic|part\s*[1-7]|grammar|ngu phap|vocabulary|tu vung|reading|listening|doc hieu|meo|chien luoc|hoc|de thi|bai thi|luyen thi|passage|audio|dap an|collocation)\b/.test(
    normalizeText(text)
  );
}

function isAppHelpQuestion(text: string) {
  const value = normalizeText(text);
  return (
    /\b(chatbot|bot|tro ly|ai trong app|ai cua app|app nay|he thong nay|web nay)\b/.test(value) &&
    /\b(lam duoc gi|hoat dong the nao|la gi|co the lam gi|hoi gi|khong tra loi|bi loi|loi gi|huong dan|cach dung)\b/.test(value)
  );
}

function isExplicitGeneralKnowledge(text: string) {
  const value = normalizeText(text);
  return (
    looksLikeToeicKnowledge(value) &&
    (
      /\b(la gi|khac nhau|phan biet|meo|chien luoc|cach hoc|cach lam|lam sao|co may phan|gom may phan|bao nhieu phan|cau truc|format|dinh dang)\b/.test(
        value
      ) ||
      /^what is\b/.test(value)
    )
  );
}

function isToeicGeneralQuestion(text: string) {
  const value = normalizeText(text);
  if (hasUserSpecificSignal(value)) return false;
  const toeicDomain =
    /\b(toeic|part\s*[1-7]|phan\s*[1-7]|reading|listening|grammar|ngu phap|vocabulary|tu vung|doc hieu|nghe|de thi|bai thi|test format|incomplete sentence|text completion|collocation|thi hien tai|qua khu|tuong lai|danh tu|dong tu|tinh tu|trang tu|gioi tu|menh de|although|despite|because|since|for)\b/.test(
      value
    );
  const learningAction =
    /\b(la gi|khac nhau|phan biet|meo|chien luoc|cach hoc|cach lam|lam sao|co may phan|gom may phan|bao nhieu phan|cau truc|format|dinh dang|nen hoc|hoc gi|chu y gi|tang diem|tranh bay|dung the nao|nghia la gi)\b/.test(
      value
    ) ||
    /\bla\b.{0,40}\bgi\b/.test(
      value
    );
  const toeicFormatQuestion =
    /\b(chia|tach|gom|co)\b.*\b(may|bao nhieu)\b.*\b(part|phan)\b/.test(value) ||
    /\b(cau truc|format|dinh dang)\b.*\b(de|bai thi|reading|listening)\b/.test(value) ||
    /\b(reading|listening)\b.*\b(gom|co|chia)\b.*\b(gi|may|nhung gi|phan|part)\b/.test(value);
  return (toeicDomain && learningAction) || toeicFormatQuestion;
}

function isClearlyOutOfToeicScope(text: string) {
  const value = normalizeText(text);
  if (!value) return false;
  if (
    isAppHelpQuestion(value) ||
    hasQuestionBindingSignal(value) ||
    looksLikeToeicKnowledge(value) ||
    isToeicGeneralQuestion(value)
  ) {
    return false;
  }
  if (/^ai\s+la\s+gi$/.test(value) || /^ai\s+la\s+gi\s+vay$/.test(value)) {
    return true;
  }
  return /\b(thoi tiet|weather|bong da|football|crypto|bitcoin|chung khoan|stock|nau an|mon an|du lich|khach san o dau|lap trinh|code|javascript|python|java|chinh tri|tin tuc|phim|game|y te|benh|thuoc|phap luat)\b/.test(
    value
  );
}

function hasQuestionBindingSignal(value: string) {
  return /\b(cau nay|cau do|cau\s*\d+|question\s*\d+|dap an nay|doan nay|tu nay|cum nay|bai doc|passage|audio|trong cau nay|trong bai doc)\b/.test(
    value
  );
}

function hasUserSpecificSignal(value: string) {
  return (
    hasQuestionBindingSignal(value) ||
    /\b(de gan nhat|bai gan nhat|bai vua lam|lan thi gan nhat|test gan nhat|toi sai|toi dung|diem cua toi|tien do|yeu o dau|phan tich ket qua|ket qua cua toi|cua toi|bai lam cua toi)\b/.test(
      value
    )
  );
}

function isSmalltalk(text: string) {
  const value = normalizeText(text);
  const tokens = value.split(" ").filter(Boolean);
  if (tokens.length > 8) return false;
  return /^(hi|hello|hey|alo|xin chao|chao|chao ban|cam on|cam on ban|thanks|thank you|ok|okay|oke|duoc roi)$/.test(
    value
  ) || /\b(chan|nan|met|duoi|stress|ap luc|buon ngu|het dong luc|dong vien)\b/.test(value);
}

function explicitNavigationIntent(text: string): ChatIntent | null {
  const value = normalizeText(text);
  if (!/\b(mo|di den|chuyen toi|cho toi vao|xem trang|vao phan)\b/.test(value)) {
    return null;
  }
  if (/\b(flashcard|flash card|on tu)\b/.test(value)) return "flashcard.personal";
  if (/\b(roadmap|lo trinh|ke hoach hoc)\b/.test(value)) return "roadmap.guidance";
  if (/\b(review|cau sai|luyen tap|lam de|dashboard)\b/.test(value)) {
    return "app.navigation_support";
  }
  return null;
}

function explicitRoadmapIntent(text: string): ChatIntent | null {
  const value = normalizeText(text);
  const mentionsRoadmap =
    /\b(roadmap|lo trinh|ke hoach hoc)\b/.test(value);

  if (
    /\b(tai sao|vi sao)\b/.test(value) &&
    /\b(he thong|roadmap|lo trinh|ke hoach)\b/.test(value) &&
    /\b(chon|de xuat|goi y|xep)\b/.test(value)
  ) {
    return "roadmap.explain_recommendation";
  }

  if (
    /\b(hom nay.*nen hoc gi|nen hoc gi tiep|buoc tiep theo|hoc gi tiep theo|tiep theo hoc gi)\b/.test(
      value
    )
  ) {
    return "roadmap.next_step";
  }

  if (
    mentionsRoadmap &&
    /\b(doi|chinh|dieu chinh|giam|tang|cap nhat)\b/.test(value)
  ) {
    return "roadmap.adjust";
  }

  if (
    mentionsRoadmap &&
    /\b(the nao|ra sao|toi dau|den dau|tien do|hien tai|hoan thanh)\b/.test(
      value
    )
  ) {
    return "roadmap.summary";
  }

  return null;
}

function explicitQuestionIntent(
  text: string
): ChatIntent | null {
  const value = normalizeText(text);
  const hasQuestionReference =
    /\b(cai nay|cau nay|cau do|cau hoi|dap an nay|doan nay|tu nay|cum nay|passage nay|bai doc nay|trong bai doc|bai doc|cau\s*\d+|question\s*\d+)\b/.test(
      value
    );
  if (!hasQuestionReference) return null;

  if (/\b(dich|translate|nghia tieng viet|ban dich)\b/.test(value)) {
    return "question.translate_context";
  }
  if (/\b(ngu phap|grammar|loai tu|v ing|to v|menh de)\b/.test(value)) {
    return "grammar.contextual";
  }
  if (/\b(tu vung|vocabulary|cum tu|tu nay|nghia la gi|viet tat)\b/.test(value)) {
    return "vocabulary.contextual";
  }
  if (
    /\b(giai thich|tra loi|vi sao|tai sao|dung|sai|dap an|noi gi|cau\s*\d+|cau nay)\b/.test(value)
  ) {
    return "question.explain_specific";
  }
  return null;
}

function explicitPersonalIntent(text: string): ChatIntent | null {
  const value = normalizeText(text);
  if (
    /\b(de gan nhat|de moi nhat|bai nay|bai gan nhat|bai vua lam|bai moi nhat|bai lam cua toi|test gan nhat|lan thi gan nhat|attempt|ket qua bai|vua nop|vua lam)\b/.test(value) &&
    /\b(phan tich|ket qua|sai|loi|yeu|diem|review|the nao|o dau|phan nao|part nao)\b/.test(value)
  ) {
    return "test_attempt.analysis";
  }
  if (
    /\b(toi sai|toi dung|diem cua toi|ket qua cua toi|bai cua toi|de cua toi|bai lam cua toi)\b/.test(value) &&
    /\b(phan tich|ket qua|sai|yeu|diem|review|the nao)\b/.test(value)
  ) {
    return "test_attempt.analysis";
  }
  if (
    /\b(tien do|streak|target|muc tieu|diem gan nhat|diem hien tai|toi yeu phan nao|ky nang nao.*yeu|tong thoi gian hoc)\b/.test(
      value
    )
  ) {
    return "user_progress.summary";
  }
  return null;
}

function extractParts(value: string): Array<1 | 2 | 3 | 4 | 5 | 6 | 7> {
  const parts = new Set<number>();
  for (const match of value.matchAll(/\b(?:part|phan)\s*([1-7])\b/g)) {
    parts.add(Number(match[1]));
  }
  return Array.from(parts).sort() as Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
}

function detectMetric(value: string): ChatAnalysisMetric | undefined {
  if (/\b(dung nhieu|manh|tot nhat|lam tot|strength)\b/.test(value)) {
    return "strength";
  }
  if (/\b(sai nhieu|yeu|mat diem|kem|weak)\b/.test(value)) {
    return "weakness";
  }
  if (/\b(dang cau|dang loi|mau loi|loi lap lai|error pattern)\b/.test(value)) {
    return "error_pattern";
  }
  if (/\b(diem|ty le|bao nhieu cau|score|breakdown)\b/.test(value)) {
    return "score_breakdown";
  }
  return undefined;
}

function isFollowUpText(value: string) {
  return /^(con|the con|va|vay|cung|tiep theo)\b/.test(value);
}

function questionReferenceEvidence(value: string) {
  const questionNumberMatch = value.match(
    /\b(?:cau|question|q)\s*(?:so|number|#)?\s*(\d{1,3})\b/
  );
  const questionNumber = questionNumberMatch
    ? Number(questionNumberMatch[1])
    : undefined;
  const explicitQuestionRef =
    !!questionNumber ||
    /\b(cai nay|cau nay|cau do|dap an nay|doan nay|tu nay|cum nay|passage nay|bai doc nay|trong bai doc|bai doc|this question)\b/.test(
      value
    );
  return { questionNumber, explicitQuestionRef };
}

export function detectScope(
  text: string,
  conversationState?: ChatConversationState
): ScopeDecision {
  const value = normalizeText(text);
  const parts = extractParts(value);
  const metric = detectMetric(value);
  const followUp = isFollowUpText(value);
  const questionEvidence = questionReferenceEvidence(value);
  const roadmapIntent = explicitRoadmapIntent(text);
  const slots: ChatRouteSlots = {
    ...(parts.length ? { parts } : {}),
    ...(parts.length > 1 ||
    /\b(so sanh|compare|voi nhau|khac nhau trong bai)\b/.test(value)
      ? { comparison: true }
      : {}),
    ...(metric ? { metric } : {}),
    ...(questionEvidence.questionNumber
      ? { questionNumber: questionEvidence.questionNumber }
      : {}),
    ...(questionEvidence.explicitQuestionRef
      ? { explicitQuestionRef: true }
      : {}),
    ...(followUp ? { followUp: true } : {}),
    ...(roadmapIntent
      ? {
          roadmapRequest:
            roadmapIntent === "roadmap.summary"
              ? ("status" as const)
              : roadmapIntent === "roadmap.next_step"
                ? ("next_step" as const)
                : roadmapIntent === "roadmap.explain_recommendation"
                  ? ("explain_recommendation" as const)
                  : ("adjust" as const),
        }
      : {}),
  };

  if (roadmapIntent) {
    return {
      scope: "overall_progress",
      confidence: 0.98,
      slots,
      reasonCodes: ["explicit_roadmap_scope"],
    };
  }

  const questionIntent = explicitQuestionIntent(text);
  const questionAction =
    /\b(giai thich|tra loi|vi sao|tai sao|dung|sai|dich|translate|ngu phap|grammar|tu vung|vocabulary|nghia|viet tat|chon|dap an|noi gi)\b/.test(
      value
    );
  if (
    questionIntent ||
    (questionEvidence.explicitQuestionRef && questionAction)
  ) {
    return {
      scope: "single_question",
      confidence: 0.96,
      slots,
      reasonCodes: ["explicit_question_scope"],
    };
  }

  const attemptIntent = explicitPersonalIntent(text);
  const hasAttemptReference =
    /\b(de gan nhat|de moi nhat|bai nay|bai gan nhat|bai vua lam|bai moi nhat|bai lam cua toi|test gan nhat|lan thi gan nhat|attempt|ket qua cua toi|bai cua toi|de cua toi|vua nop|vua lam|toi sai|toi dung|diem cua toi)\b/.test(
      value
    );
  const hasAttemptAnalysisAction =
    /\b(phan tich|dung nhieu|sai|loi|yeu|manh|diem|ket qua|review|so sanh|dang cau|part nao|the nao|o dau)\b/.test(
      value
    );

  if (
    attemptIntent === "test_attempt.analysis" ||
    (hasAttemptReference && hasAttemptAnalysisAction) ||
    (parts.length > 0 &&
      /\b(de gan nhat|bai gan nhat|test gan nhat|vua lam|vua nop|ket qua cua toi|toi sai|toi dung|diem cua toi)\b/.test(value) &&
      hasAttemptAnalysisAction)
  ) {
    const attemptScope = /\b(gan nhat|moi nhat)\b/.test(value)
      ? "latest"
      : /\b(vua lam|vua nop|bai nay|hien tai)\b/.test(value)
        ? "current"
        : "selected";
    return {
      scope: "attempt_analysis",
      confidence: 0.98,
      slots: { ...slots, attemptScope },
      reasonCodes: ["explicit_attempt_scope"],
    };
  }

  if (explicitPersonalIntent(text) === "user_progress.summary") {
    return {
      scope: "overall_progress",
      confidence: 0.96,
      slots,
      reasonCodes: ["explicit_progress_scope"],
    };
  }

  if (isExplicitGeneralKnowledge(text) || isToeicGeneralQuestion(text)) {
    return {
      scope: "general_knowledge",
      confidence: 0.95,
      slots,
      reasonCodes: ["explicit_general_knowledge"],
    };
  }

  if (
    followUp &&
    conversationState?.scope &&
    conversationState.scope !== "unknown"
  ) {
    return {
      scope: conversationState.scope,
      confidence: 0.78,
      slots,
      reasonCodes: ["conversation_follow_up"],
    };
  }

  return {
    scope: "unknown",
    confidence: 0.25,
    slots,
    reasonCodes: ["scope_not_explicit"],
  };
}

function hasRequiredContext(
  intentId: ChatIntent,
  routeContext?: ChatRouteContext
) {
  const policy = getIntentCatalogEntry(intentId)?.contextPolicy;
  if (!policy) return true;
  const values = routeContext as Record<string, unknown> | undefined;
  const hasValue = (key: string) =>
    !!values?.[key];
  if (policy.allOf?.some((key) => !hasValue(key))) return false;
  if (policy.anyOf?.length && !policy.anyOf.some(hasValue)) {
    return false;
  }
  return true;
}

function diagnosticsCandidates(candidates: IntentCandidate[]) {
  return candidates.slice(0, 3).map((candidate) => ({
    intentId: candidate.intentId,
    lane: candidate.lane,
    score: Number(candidate.score.toFixed(4)),
    confidence: Number(candidate.confidence.toFixed(4)),
    distance: typeof candidate.distance === "number" ? Number(candidate.distance.toFixed(4)) : undefined,
    supportCount: candidate.supportCount,
    rerankScore: typeof candidate.rerankScore === "number" ? Number(candidate.rerankScore.toFixed(4)) : undefined,
  }));
}

function resolverPolicyForIntent(intentId: ChatIntent): ChatResolverPolicy {
  if (intentId === "roadmap.explain_recommendation") {
    return "DB_FIRST_AI";
  }
  return intentId === "toeic_knowledge.general" ||
    intentId === "general_toeic_question"
    ? "GENERAL_AI"
    : "DB_FIRST";
}

function routeResult(params: {
  decision: ChatRoutingResult["decision"];
  scopeDecision: ScopeDecision;
  intent?: ChatIntent;
  source: ChatRouteSource;
  resolverPolicy: ChatResolverPolicy;
  confidence: number;
  margin?: number;
  candidates?: IntentCandidate[];
  reason?: string;
  reasonCodes?: string[];
  chromaQueried?: boolean;
  chromaAvailable?: boolean;
  diagnostics?: Partial<RoutingDiagnostics>;
}): ChatRoutingResult {
  const reasonCodes = [
    ...params.scopeDecision.reasonCodes,
    ...(params.reasonCodes ?? []),
  ];
  return {
    decision: params.decision,
    scope: params.scopeDecision.scope,
    intent: params.intent,
    confidence: params.confidence,
    slots: params.scopeDecision.slots,
    source: params.source,
    resolverPolicy: params.resolverPolicy,
    reasonCodes,
    diagnostics: {
      confidence: params.confidence,
      margin: params.margin,
      source: params.source,
      candidates: diagnosticsCandidates(params.candidates ?? []),
      reason: params.reason,
      chromaQueried: params.chromaQueried ?? false,
      chromaAvailable: params.chromaAvailable ?? false,
      ...params.diagnostics,
    },
  };
}

function ruleRoute(
  intentId: ChatIntent,
  reason: string,
  scopeDecision: ScopeDecision,
  source: ChatRouteSource = "rule"
): ChatRoutingResult {
  const entry = getIntentCatalogEntry(intentId);
  const lane = entry?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL";
  return routeResult({
    decision: { kind: "route", intentId, lane },
    scopeDecision,
    intent: intentId,
    source,
    resolverPolicy: resolverPolicyForIntent(intentId),
    confidence: scopeDecision.confidence,
    margin: 1,
    candidates: [
      {
        intentId,
        lane,
        confidence: 1,
        score: 1,
        matchedExamples: [],
      },
    ],
    reason,
    reasonCodes: [reason],
  });
}

function clarify(
  scopeDecision: ScopeDecision,
  reason: string,
  intentId?: ChatIntent
): ChatRoutingResult {
  return routeResult({
    decision: { kind: "clarify", intentId, reason },
    scopeDecision,
    intent: intentId,
    source: "rule",
    resolverPolicy: "CLARIFY",
    confidence: scopeDecision.confidence,
    reason,
    reasonCodes: [reason],
  });
}

function isQuestionIntent(intentId?: ChatIntent) {
  return !!intentId && /^(question|grammar|vocabulary)\./.test(intentId);
}

function buildResolvedFollowUpContext(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  conversationState?: ChatConversationState;
}): FollowUpContext {
  const normalized = normalizeText(params.userText);
  const followUpDetected =
    isFollowUpText(normalized) ||
    hasQuestionBindingSignal(normalized) ||
    normalized.includes("bai nay") ||
    normalized.includes("vay") ||
    normalized.includes("con") ||
    normalized.includes("tiep theo") ||
    normalized.includes("cau nay");

  const explicitReference = resolveQuestionReferenceFromRouteContext(
    params.userText,
    params.routeContext
  );

  if (explicitReference.matched && (explicitReference.questionId || explicitReference.questionNumber)) {
    return {
      followUpDetected: true,
      followUpResolved: true,
      resolvedFrom: "explicit_reference",
      resolvedQuestionId: explicitReference.questionId,
      resolvedAttemptId: params.routeContext?.attemptId,
      resolvedQuestionNumber: explicitReference.questionNumber,
      resolvedText:
        explicitReference.questionNumber && Number.isFinite(explicitReference.questionNumber)
          ? `cau ${explicitReference.questionNumber}`
          : "cau hien tai",
    };
  }

  if (
    followUpDetected &&
    params.conversationState?.scope &&
    params.conversationState.scope !== "unknown"
  ) {
    return {
      followUpDetected: true,
      followUpResolved: true,
      resolvedFrom: "conversation_state",
      resolvedQuestionId: params.conversationState.questionId,
      resolvedAttemptId: params.conversationState.attemptId,
      resolvedText:
        params.conversationState.scope === "attempt_analysis"
          ? "bai test gan nhat"
          : params.conversationState.scope === "single_question"
            ? "cau hien tai"
            : params.conversationState.scope === "overall_progress"
              ? "tong quan tien do"
              : undefined,
    };
  }

  return {
    followUpDetected,
    followUpResolved: false,
  };
}

function buildSemanticQuery(userText: string, followUpContext: FollowUpContext) {
  return {
    userText: userText.trim(),
    resolvedFollowUpText: followUpContext.followUpResolved
      ? followUpContext.resolvedText
      : undefined,
  };
}

function hasValidQuestionResolution(
  userText: string,
  routeContext: ChatRouteContext | undefined,
  followUpContext: FollowUpContext
) {
  const resolved = resolveQuestionReferenceFromRouteContext(userText, routeContext);
  if (resolved.matched && resolved.questionId) {
    return {
      ok: true,
      questionId: resolved.questionId,
      questionNumber: resolved.questionNumber,
    };
  }

  if (followUpContext.followUpResolved && followUpContext.resolvedQuestionId) {
    return {
      ok: true,
      questionId: followUpContext.resolvedQuestionId,
      questionNumber: followUpContext.resolvedQuestionNumber,
    };
  }

  return { ok: false as const };
}

function isLatestAttemptRequest(userText = "") {
  const value = normalizeText(userText);
  return /\b(gan nhat|moi nhat|vua lam|vua nop|latest|most recent)\b/.test(value);
}

function isCurrentAttemptRequest(userText = "") {
  const value = normalizeText(userText);
  return /\b(bai nay|de nay|attempt nay|ket qua nay|bai vua xem|de dang xem|bai hien tai|ket qua hien tai)\b/.test(value);
}

function isRoadmapIntent(intentId: ChatIntent) {
  return intentId.startsWith("roadmap.");
}

function hasRoadmapSignal(userText = "") {
  const value = normalizeText(userText);
  return /\b(roadmap|lo trinh|ke hoach hoc)\b/.test(value);
}

function canResolveAttemptForIntent(params: {
  routeContext: ChatRouteContext;
  followUpContext: FollowUpContext;
  userText: string;
}) {
  if (params.routeContext.attemptId || params.followUpContext.resolvedAttemptId) {
    return { ok: true as const, reason: "attempt_context_ready" };
  }
  if (isLatestAttemptRequest(params.userText)) {
    return { ok: true as const, reason: "latest_attempt_db_resolvable" };
  }
  if (isCurrentAttemptRequest(params.userText)) {
    return { ok: false as const, reason: "missing_current_attempt_reference" };
  }
  return { ok: false as const, reason: "missing_attempt_reference" };
}

function canResolveQuestionForIntent(params: {
  routeContext: ChatRouteContext;
  followUpContext: FollowUpContext;
  userText: string;
}) {
  const resolution = hasValidQuestionResolution(
    params.userText,
    params.routeContext,
    params.followUpContext
  );
  if (!resolution.ok) {
    return { ok: false as const, reason: "missing_question_reference" };
  }
  if (!params.routeContext.attemptId && !params.followUpContext.resolvedAttemptId) {
    return { ok: false as const, reason: "missing_attempt_reference" };
  }
  return { ok: true as const, reason: "question_context_ready" };
}

function validateContextPolicyForIntent(params: {
  intentId: ChatIntent;
  routeContext?: ChatRouteContext;
  followUpContext: FollowUpContext;
  userText: string;
}): {
  status: "ready" | "missing_required_context" | "unsupported_capability";
  policy: ChatResolverPolicy;
  reason: string;
  routeContext?: ChatRouteContext;
} {
  const entry = getIntentCatalogEntry(params.intentId);
  if (!entry) {
    return {
      status: "unsupported_capability",
      policy: "UNSUPPORTED_CAPABILITY",
      reason: "intent_catalog_missing",
    };
  }

  if (params.intentId === "toeic_knowledge.general" || params.intentId === "general_toeic_question") {
    return {
      status: "ready",
      policy: "GENERAL_AI",
      reason: "general_knowledge",
    };
  }

  const effectiveRouteContext: ChatRouteContext = {
    ...(params.routeContext ?? { page: "unknown" }),
  };
  if (params.followUpContext.resolvedQuestionId && !effectiveRouteContext.questionId) {
    effectiveRouteContext.questionId = params.followUpContext.resolvedQuestionId;
  }
  if (params.followUpContext.resolvedAttemptId && !effectiveRouteContext.attemptId) {
    effectiveRouteContext.attemptId = params.followUpContext.resolvedAttemptId;
  }

  const policy = entry.contextPolicy;
  const needsQuestionContext = isQuestionIntent(params.intentId);
  const needsAttemptContext = params.intentId === "test_attempt.analysis";

  if (needsQuestionContext) {
    const resolution = canResolveQuestionForIntent({
      userText: params.userText,
      routeContext: effectiveRouteContext,
      followUpContext: params.followUpContext,
    });
    if (!resolution.ok) {
      return {
        status: "missing_required_context",
        policy: policy.onMissing === "SAFE_FALLBACK" ? "SAFE_FALLBACK" : "CLARIFY_IF_CONTEXT_MISSING",
        reason: resolution.reason,
        routeContext: effectiveRouteContext,
      };
    }
  }

  if (needsAttemptContext) {
    const resolution = canResolveAttemptForIntent({
      routeContext: effectiveRouteContext,
      followUpContext: params.followUpContext,
      userText: params.userText,
    });
    if (!resolution.ok) {
      return {
        status: "missing_required_context",
        policy: policy.onMissing === "SAFE_FALLBACK" ? "SAFE_FALLBACK" : "CLARIFY_IF_CONTEXT_MISSING",
        reason: resolution.reason,
        routeContext: effectiveRouteContext,
      };
    }
    return {
      status: "ready",
      policy: resolverPolicyForIntent(params.intentId),
      reason: resolution.reason,
      routeContext: effectiveRouteContext,
    };
  }

  if (isRoadmapIntent(params.intentId)) {
    return {
      status: "ready",
      policy: resolverPolicyForIntent(params.intentId),
      reason: "roadmap_db_resolvable",
      routeContext: effectiveRouteContext,
    };
  }

  return {
    status: "ready",
    policy: resolverPolicyForIntent(params.intentId),
    reason: "context_ready",
    routeContext: effectiveRouteContext,
  };
}

function classifyLegacyRuleIntent(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  conversationState?: ChatConversationState;
}) {
  void params.routeContext;
  if (isSmalltalk(params.userText)) return "smalltalk.greeting_feedback" as const;
  const navigationIntent = explicitNavigationIntent(params.userText);
  if (navigationIntent) return navigationIntent;
  const roadmapIntent = explicitRoadmapIntent(params.userText);
  if (roadmapIntent) return roadmapIntent;

  const scopeDecision = detectScope(params.userText, params.conversationState);
  if (scopeDecision.scope === "single_question") {
    return (
      explicitQuestionIntent(params.userText) ??
      "question.explain_specific"
    );
  }
  if (scopeDecision.scope === "attempt_analysis") return "test_attempt.analysis" as const;
  if (scopeDecision.scope === "overall_progress") return "user_progress.summary" as const;
  if (scopeDecision.scope === "general_knowledge") return "toeic_knowledge.general" as const;
  if (scopeDecision.scope === "unknown" && isAppHelpQuestion(params.userText)) return "app.navigation_support" as const;
  if (scopeDecision.scope === "unknown" && isClearlyOutOfToeicScope(params.userText)) return "safe_fallback" as const;
  return "safe_fallback" as const;
}

function resolveFastPathRoute(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
  conversationState?: ChatConversationState;
  followUpContext: FollowUpContext;
  legacyRuleIntent: ChatIntent | "safe_fallback";
}): ChatRoutingResult | null {
  const scopeDecision = detectScope(params.userText, params.conversationState);
  const normalizedUserText = normalizeText(params.userText);
  const questionIntent = explicitQuestionIntent(params.userText);
  const navigationIntent = explicitNavigationIntent(params.userText);
  const roadmapIntent = explicitRoadmapIntent(params.userText);
  const smalltalkIntent = isSmalltalk(params.userText);

  const baseDiagnostics: Partial<RoutingDiagnostics> = {
    fastPathHit: true,
    legacyRuleIntent: params.legacyRuleIntent === "safe_fallback" ? undefined : params.legacyRuleIntent,
    followUp: params.followUpContext,
    semanticDegraded: false,
    rerankerDegraded: false,
    seedVersion: CHAT_INTENT_SEED_VERSION,
    rerankerVersion: CHAT_INTENT_RERANKER_VERSION,
  };

  if (smalltalkIntent) {
    return routeResult({
      decision: {
        kind: "route",
        intentId: "smalltalk.greeting_feedback",
        lane: "SYSTEM",
      },
      scopeDecision,
      intent: "smalltalk.greeting_feedback",
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent("smalltalk.greeting_feedback"),
      confidence: 0.99,
      margin: 1,
      candidates: [
        {
          intentId: "smalltalk.greeting_feedback",
          lane: "SYSTEM",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
          legacyRuleScore: 1,
        },
      ],
      reason: "fast_path_smalltalk",
      reasonCodes: ["fast_path_smalltalk"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: "smalltalk.greeting_feedback",
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (navigationIntent) {
    return routeResult({
      decision: {
        kind: "route",
        intentId: navigationIntent,
        lane: getIntentCatalogEntry(navigationIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL",
      },
      scopeDecision,
      intent: navigationIntent,
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent(navigationIntent),
      confidence: 0.98,
      margin: 1,
      candidates: [
        {
          intentId: navigationIntent,
          lane: getIntentCatalogEntry(navigationIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
          legacyRuleScore: 1,
        },
      ],
      reason: "fast_path_navigation",
      reasonCodes: ["fast_path_navigation"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: navigationIntent,
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (roadmapIntent) {
    return routeResult({
      decision: {
        kind: "route",
        intentId: roadmapIntent,
        lane: getIntentCatalogEntry(roadmapIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL",
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "overall_progress",
      },
      intent: roadmapIntent,
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent(roadmapIntent),
      confidence: 0.98,
      margin: 1,
      candidates: [
        {
          intentId: roadmapIntent,
          lane: getIntentCatalogEntry(roadmapIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
          legacyRuleScore: 1,
        },
      ],
      reason: "fast_path_roadmap",
      reasonCodes: ["fast_path_roadmap"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: roadmapIntent,
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (
    params.clientContext?.sourceAction === "quick_question_explain" &&
    params.routeContext?.questionId &&
    params.routeContext?.attemptId &&
    params.routeContext?.testId
  ) {
    const resolution = hasValidQuestionResolution(params.userText, params.routeContext, params.followUpContext);
    if (!resolution.ok) {
      return routeResult({
        decision: {
          kind: "clarify",
          intentId: "question.explain_specific",
          reason: "missing_required_context",
        },
        scopeDecision: {
          ...scopeDecision,
          scope: "single_question",
          confidence: 0.9,
        },
        intent: "question.explain_specific",
        source: "fast_path",
        resolverPolicy: "CLARIFY_IF_CONTEXT_MISSING",
        confidence: 0.9,
        reason: "missing_required_context",
        reasonCodes: ["fast_path_question_missing_context"],
        diagnostics: {
          ...baseDiagnostics,
          semanticIntent: "question.explain_specific",
          mismatchReason: "fast_path_question_missing_context",
        },
      });
    }

    const explicitIntent =
      questionIntent ??
      "question.explain_specific";
    return routeResult({
      decision: {
        kind: "route",
        intentId: explicitIntent,
        lane: getIntentCatalogEntry(explicitIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL",
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "single_question",
        confidence: 0.99,
      },
      intent: explicitIntent,
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent(explicitIntent),
      confidence: 0.99,
      margin: 1,
      candidates: [
        {
          intentId: explicitIntent,
          lane: getIntentCatalogEntry(explicitIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
          legacyRuleScore: 1,
        },
      ],
      reason: "fast_path_quick_question",
      reasonCodes: ["fast_path_quick_question"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: explicitIntent,
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (questionIntent) {
    const resolution = hasValidQuestionResolution(params.userText, params.routeContext, params.followUpContext);
    if (!resolution.ok) {
      return routeResult({
        decision: {
          kind: "clarify",
          intentId: questionIntent,
          reason: "missing_required_context",
        },
        scopeDecision: {
          ...scopeDecision,
          scope: "single_question",
          confidence: 0.9,
        },
        intent: questionIntent,
        source: "fast_path",
        resolverPolicy: "CLARIFY_IF_CONTEXT_MISSING",
        confidence: 0.9,
        reason: "missing_required_context",
        reasonCodes: ["fast_path_question_missing_context"],
        diagnostics: {
          ...baseDiagnostics,
          semanticIntent: questionIntent,
          mismatchReason: "fast_path_question_missing_context",
        },
      });
    }

    const lane = getIntentCatalogEntry(questionIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL";
    return routeResult({
      decision: {
        kind: "route",
        intentId: questionIntent,
        lane,
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "single_question",
        confidence: 0.99,
      },
      intent: questionIntent,
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent(questionIntent),
      confidence: 0.99,
      margin: 1,
      candidates: [
        {
          intentId: questionIntent,
          lane,
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
          legacyRuleScore: 1,
        },
      ],
      reason: "fast_path_question",
      reasonCodes: ["fast_path_question"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: questionIntent,
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (isAppHelpQuestion(params.userText)) {
    return routeResult({
      decision: {
        kind: "route",
        intentId: "app.navigation_support",
        lane: "CONTEXTUAL",
      },
      scopeDecision,
      intent: "app.navigation_support",
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent("app.navigation_support"),
      confidence: 0.9,
      margin: 1,
      candidates: [
        {
          intentId: "app.navigation_support",
          lane: "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
          legacyRuleScore: 1,
        },
      ],
      reason: "fast_path_app_help",
      reasonCodes: ["fast_path_app_help"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: "app.navigation_support",
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  return null;
}

export async function routeChatMessage(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
  conversationState?: ChatConversationState;
}): Promise<ChatRoutingResult> {
  const userText = params.userText.trim();
  const unknownScope: ScopeDecision = {
    scope: "unknown",
    confidence: 0,
    slots: {},
    reasonCodes: ["empty_message"],
  };
  if (!userText) {
    return routeResult({
      decision: { kind: "safe_fallback", reason: "empty_message" },
      scopeDecision: unknownScope,
      source: "fallback",
      resolverPolicy: "SAFE_FALLBACK",
      confidence: 0,
      reason: "empty_message",
      reasonCodes: ["empty_message"],
      diagnostics: {
        fastPathHit: false,
        legacyRuleIntent: "safe_fallback",
        semanticDegraded: true,
        rerankerDegraded: true,
        seedVersion: CHAT_INTENT_SEED_VERSION,
        rerankerVersion: CHAT_INTENT_RERANKER_VERSION,
      },
    });
  }

  const followUpContext = buildResolvedFollowUpContext({
    userText,
    routeContext: params.routeContext,
    conversationState: params.conversationState,
  });
  const legacyRuleIntent = classifyLegacyRuleIntent({
    userText,
    routeContext: params.routeContext,
    conversationState: params.conversationState,
  });

  const fastPath = resolveFastPathRoute({
    userText,
    routeContext: params.routeContext,
    clientContext: params.clientContext,
    conversationState: params.conversationState,
    followUpContext,
    legacyRuleIntent,
  });
  if (fastPath) {
    return fastPath;
  }

  if (isClearlyOutOfToeicScope(userText)) {
    return routeResult({
      decision: {
        kind: "safe_fallback",
        reason: "outside_toeic_scope",
      },
      scopeDecision: {
        scope: "unknown",
        confidence: 0.25,
        slots: {},
        reasonCodes: ["outside_toeic_scope"],
      },
      source: "fallback",
      resolverPolicy: "SAFE_FALLBACK",
      confidence: 0.25,
      reason: "outside_toeic_scope",
      reasonCodes: ["outside_toeic_scope"],
      diagnostics: {
        fastPathHit: false,
        legacyRuleIntent,
        semanticIntent: "safe_fallback",
        semanticDegraded: true,
        rerankerDegraded: true,
        seedVersion: CHAT_INTENT_SEED_VERSION,
        rerankerVersion: CHAT_INTENT_RERANKER_VERSION,
      },
    });
  }

  const semanticQuery = buildSemanticQuery(userText, followUpContext);
  const retrievalStartedAt = Date.now();
  const semanticRanking = await rankIntentCandidates({
    userText: semanticQuery.userText,
    routeContext: params.routeContext,
    clientContext: params.clientContext,
    retrievalTopK: 40,
    rerankTopK: 6,
  });
  const retrievalLatencyMs = Date.now() - retrievalStartedAt;

  const rerankStartedAt = Date.now();
  const reranked = await rerankIntentCandidates({
    userText: semanticQuery.userText,
    resolvedFollowUpText: semanticQuery.resolvedFollowUpText,
    candidates: semanticRanking.candidates,
  });
  const rerankLatencyMs = Date.now() - rerankStartedAt;

  const candidates = reranked.candidates;
  const winner = candidates[0];
  const runnerUp = candidates[1];
  const winnerScore = winner?.rerankScore ?? 0;
  const top1Top2Margin = winner ? winnerScore - (runnerUp?.rerankScore ?? 0) : 0;
  const semanticConfidence =
    winner && runnerUp
      ? winnerScore / (winnerScore + Math.max(runnerUp.rerankScore, 0.001))
      : winner
        ? 0.92
        : 0;
  const roadmapConflict =
    !!winner &&
    hasRoadmapSignal(userText) &&
    !isRoadmapIntent(winner.intentId) &&
    candidates.some((candidate) => isRoadmapIntent(candidate.intentId));
  const strongMarginConfident =
    top1Top2Margin >= DEFAULT_STRONG_MARGIN && !roadmapConflict;
  const confident =
    !!winner &&
    top1Top2Margin >= DEFAULT_MIN_MARGIN &&
    (semanticConfidence >= DEFAULT_MIN_CONFIDENCE || strongMarginConfident);

  const buildSemanticDiagnostics = (overrides: Partial<RoutingDiagnostics> = {}) => ({
    fastPathHit: false,
    legacyRuleIntent,
    semanticIntent: winner?.intentId,
    semanticDegraded: semanticRanking.semanticDegraded || reranked.degraded,
    rerankerDegraded: reranked.degraded,
    retrievalLatencyMs,
    rerankLatencyMs,
    validationLatencyMs: 0,
    seedVersion: CHAT_INTENT_SEED_VERSION,
    rerankerVersion: reranked.version,
    top1Top2Margin,
    winnerScore,
    retrievalTopK: semanticRanking.retrievalTopK,
    rerankTopK: semanticRanking.rerankTopK,
    followUp: followUpContext,
    chromaQueried: semanticRanking.queryCount > 0,
    chromaAvailable: semanticRanking.source === "chroma",
    ...overrides,
  });

  if (!winner || !confident) {
    if (isToeicGeneralQuestion(userText) || isExplicitGeneralKnowledge(userText)) {
      return routeResult({
        decision: {
          kind: "general_ai",
          intentId: "toeic_knowledge.general",
        },
        scopeDecision: {
          scope: "general_knowledge",
          confidence: semanticConfidence || 0.82,
          slots: {},
          reasonCodes: ["low_confidence_general_fallback"],
        },
        intent: "toeic_knowledge.general",
        source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
        resolverPolicy: "GENERAL_AI",
        confidence: semanticConfidence || 0.82,
        margin: top1Top2Margin,
        candidates,
        reason: "low_confidence_general_fallback",
        reasonCodes: ["low_confidence_general_fallback"],
        chromaQueried: semanticRanking.queryCount > 0,
        chromaAvailable: semanticRanking.source === "chroma",
        diagnostics: buildSemanticDiagnostics({
          semanticIntent: "toeic_knowledge.general",
          validationResult: "LOW_CONFIDENCE",
          mismatchReason: semanticRanking.semanticDegraded ? "semantic_degraded_general_fallback" : "low_confidence_general_fallback",
        }),
      });
    }

    return routeResult({
      decision: {
        kind: "clarify",
        reason: semanticRanking.semanticDegraded ? "semantic_degraded" : "low_confidence",
      },
      scopeDecision: {
        scope: "unknown",
        confidence: semanticConfidence || 0.25,
        slots: {},
        reasonCodes: [semanticRanking.semanticDegraded ? "semantic_degraded" : "low_confidence"],
      },
      source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
      resolverPolicy: semanticRanking.semanticDegraded ? "SAFE_FALLBACK" : "LOW_CONFIDENCE",
      confidence: semanticConfidence || 0.25,
      margin: top1Top2Margin,
      candidates,
      reason: semanticRanking.semanticDegraded ? "semantic_degraded" : "low_confidence",
      reasonCodes: [semanticRanking.semanticDegraded ? "semantic_degraded" : "low_confidence"],
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationResult: semanticRanking.semanticDegraded ? "UNSUPPORTED_CAPABILITY" : "LOW_CONFIDENCE",
        mismatchReason: semanticRanking.semanticDegraded ? "semantic_degraded" : "low_confidence",
      }),
    });
  }

  const validationStartedAt = Date.now();
  const validation = validateContextPolicyForIntent({
    intentId: winner.intentId,
    routeContext: params.routeContext,
    followUpContext,
    userText,
  });
  const validationLatencyMs = Date.now() - validationStartedAt;

  const winnerEntry = getIntentCatalogEntry(winner.intentId);
  if (validation.status === "unsupported_capability" || !winnerEntry || winnerEntry.availability === "DISABLED") {
    return routeResult({
      decision: {
        kind: "safe_fallback",
        reason: "unsupported_capability",
      },
      scopeDecision: {
        scope: "unknown",
        confidence: semanticConfidence,
        slots: {},
        reasonCodes: ["unsupported_capability"],
      },
      source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
      resolverPolicy: validation.policy,
      confidence: semanticConfidence,
      margin: top1Top2Margin,
      candidates,
      reason: "unsupported_capability",
      reasonCodes: ["unsupported_capability"],
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationLatencyMs,
        semanticIntent: winner.intentId,
        validationResult: "UNSUPPORTED_CAPABILITY",
        mismatchReason: "unsupported_capability",
      }),
    });
  }

  if (validation.status === "missing_required_context") {
    return routeResult({
      decision: {
        kind: "clarify",
        intentId: winner.intentId,
        reason: validation.reason,
      },
      scopeDecision: {
        scope: "unknown",
        confidence: semanticConfidence,
        slots: {},
        reasonCodes: [validation.reason],
      },
      intent: winner.intentId,
      source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
      resolverPolicy: validation.policy,
      confidence: semanticConfidence,
      margin: top1Top2Margin,
      candidates,
      reason: validation.reason,
      reasonCodes: [validation.reason],
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationLatencyMs,
        semanticIntent: winner.intentId,
        validationResult: "MISSING_REQUIRED_CONTEXT",
        mismatchReason: validation.reason,
      }),
    });
  }

  const generalIntent =
    winner.intentId === "toeic_knowledge.general" ||
    winner.intentId === "general_toeic_question";
  if (generalIntent) {
    return routeResult({
      decision: {
        kind: "general_ai",
        intentId: "toeic_knowledge.general",
      },
      scopeDecision: {
        scope: "general_knowledge",
        confidence: semanticConfidence,
        slots: {},
        reasonCodes: ["semantic_general_candidate"],
      },
      intent: "toeic_knowledge.general",
      source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
      resolverPolicy: "GENERAL_AI",
      confidence: semanticConfidence,
      margin: top1Top2Margin,
      candidates,
      reason: "semantic_general_candidate",
      reasonCodes: ["semantic_general_candidate"],
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationLatencyMs,
        semanticIntent: "toeic_knowledge.general",
        validationResult: "READY",
      }),
    });
  }

  const routeScope = isQuestionIntent(winner.intentId)
    ? "single_question"
    : winner.intentId === "test_attempt.analysis"
      ? "attempt_analysis"
      : winner.intentId === "user_progress.summary"
        ? "overall_progress"
        : winner.intentId.startsWith("roadmap.")
          ? "overall_progress"
          : "unknown";
  const selectedPolicy =
    validation.policy === "GENERAL_AI"
      ? "GENERAL_AI"
      : validation.policy === "SAFE_FALLBACK"
        ? "SAFE_FALLBACK"
        : resolverPolicyForIntent(winner.intentId);

  if (selectedPolicy === "SAFE_FALLBACK") {
    return routeResult({
      decision: {
        kind: "safe_fallback",
        reason: validation.reason,
      },
      scopeDecision: {
        scope: routeScope,
        confidence: semanticConfidence,
        slots: {},
        reasonCodes: [validation.reason],
      },
      intent: winner.intentId,
      source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
      resolverPolicy: "SAFE_FALLBACK",
      confidence: semanticConfidence,
      margin: top1Top2Margin,
      candidates,
      reason: validation.reason,
      reasonCodes: [validation.reason],
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationLatencyMs,
        semanticIntent: winner.intentId,
        validationResult: "READY",
        mismatchReason: validation.reason,
      }),
    });
  }

  return routeResult({
    decision: {
      kind: "route",
      intentId: winner.intentId,
      lane: winner.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL",
    },
    scopeDecision: {
      scope: routeScope,
      confidence: semanticConfidence,
      slots: {},
      reasonCodes: ["semantic_candidate_confident"],
    },
    intent: winner.intentId,
    source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
    resolverPolicy: selectedPolicy,
    confidence: semanticConfidence,
    margin: top1Top2Margin,
    candidates,
    reasonCodes: ["semantic_candidate_confident"],
    chromaQueried: semanticRanking.queryCount > 0,
    chromaAvailable: semanticRanking.source === "chroma",
    diagnostics: buildSemanticDiagnostics({
      validationLatencyMs,
      semanticIntent: winner.intentId,
      validationResult: "READY",
      mismatchReason: validation.reason,
    }),
  });
}

export function toLegacyChatIntent(intent: ChatIntent): ChatIntent {
  if (intent === "smalltalk.greeting_feedback") return "smalltalk";
  if (
    intent === "question.explain_specific" ||
    intent === "question.translate_context" ||
    intent === "vocabulary.contextual" ||
    intent === "grammar.contextual"
  ) {
    return "explain_question";
  }
  if (intent === "test_attempt.analysis") return "analyze_test_result";
  if (intent === "user_progress.summary") return "check_progress";
  if (intent === "toeic_knowledge.general") return "general_toeic_question";
  return intent;
}

export function shouldUseDbFirstIntent(intent: ChatIntent) {
  return DB_FIRST_INTENTS.has(intent);
}

export function isGeneralRagIntent(intent: ChatIntent) {
  return (
    intent === "general_toeic_question" || intent === "toeic_knowledge.general"
  );
}

export async function detectDbFirstIntent(
  message: string,
  routeContext?: ChatRouteContext,
  clientContext?: ChatClientContext
): Promise<ChatIntent> {
  const result = await routeChatMessage({
    userText: message,
    routeContext,
    clientContext,
  });
  if (result.decision.kind === "route") return result.decision.intentId;
  if (result.decision.kind === "general_ai") return result.decision.intentId;
  if (result.decision.kind === "clarify" && result.decision.intentId) {
    return result.decision.intentId;
  }
  return "safe_fallback";
}

export async function shouldFallbackDbFirstToLegacy(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
}) {
  const result = await routeChatMessage(params);
  return (
    result.decision.kind === "general_ai" ||
    result.decision.kind === "safe_fallback"
  );
}
