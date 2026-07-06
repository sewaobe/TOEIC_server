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
  ClarifyOption,
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
import { extractIntentSignal } from "./chat_intent_signal.service";
import { resolveQuestionReferenceFromRouteContext } from "./chat_question_reference.service";

const DEFAULT_MIN_CONFIDENCE = Number(
  process.env.CHAT_INTENT_MIN_CONFIDENCE ?? 0.55
);
const DEFAULT_MIN_MARGIN = Number(process.env.CHAT_INTENT_MIN_MARGIN ?? 0.08);
const DEFAULT_STRONG_MARGIN = Number(
  process.env.CHAT_INTENT_STRONG_MARGIN ?? 0.65
);
const DEFAULT_MAX_DISTANCE = Number(
  process.env.CHAT_INTENT_MAX_DISTANCE ?? 1.25
);
const DEFAULT_MIN_RERANK_SCORE = Number(
  process.env.CHAT_INTENT_MIN_RERANK_SCORE ?? 4.5
);
const CHAT_INTENT_SEED_VERSION = String(CHAT_INTENT_CATALOG_VERSION);

const DB_FIRST_INTENTS = new Set<ChatIntent>([
  "smalltalk",
  "smalltalk.greeting_feedback",
  "identify_question",
  "explain_question",
  "question.explain_specific",
  "question.translate_context",
  "question.similar_practice",
  "lesson.recommendation",
  "vocabulary.contextual",
  "grammar.contextual",
  "analyze_test_result",
  "test_attempt.analysis",
  "user_profile.identity",
  "check_progress",
  "user_progress.summary",
  "user_progress.ability_map",
  "roadmap.guidance",
  "roadmap.summary",
  "roadmap.next_step",
  "roadmap.explain_recommendation",
  "roadmap.adjust",
  "flashcard.personal",
  "flashcard.create",
  "app.navigation_support",
  "out_of_project.general",
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

const ATTEMPT_REFERENCE_PATTERN =
  /\b(de nay|de thi nay|de hien tai|de thi hien tai|de dang xem|de thi dang xem|de gan nhat|de thi gan nhat|de moi nhat|de thi moi nhat|de vua lam|de thi vua lam|de vua nop|de thi vua nop|bai nay|bai test nay|bai thi nay|test nay|bai gan nhat|bai thi gan nhat|bai vua lam|bai test vua lam|bai thi vua lam|bai vua roi|bai moi nhat|bai thi moi nhat|bai lam cua toi|bai lam gan day nhat|test gan nhat|lan thi gan nhat|attempt|ket qua bai|ket qua de thi|vua nop|vua lam|gan day nhat)\b/;

const PERSONAL_ATTEMPT_REFERENCE_PATTERN =
  /\b(toi sai|toi dung|diem cua toi|ket qua cua toi|bai cua toi|de cua toi|de thi cua toi|bai lam cua toi)\b/;

const ATTEMPT_ANALYSIS_ACTION_PATTERN =
  /\b(xem|phan tich|danh gia|ket qua|dung nhieu|sai|loi|yeu|manh|diem|review|so sanh|dang cau|the nao|o dau|phan nao|part nao)\b/;

function hasAttemptReference(value: string) {
  return (
    ATTEMPT_REFERENCE_PATTERN.test(value) ||
    PERSONAL_ATTEMPT_REFERENCE_PATTERN.test(value)
  );
}

function hasAttemptAnalysisAction(value: string) {
  return ATTEMPT_ANALYSIS_ACTION_PATTERN.test(value);
}

function isAttemptTheoryOrNavigationQuestion(value: string) {
  return (
    /\b(format|cau truc|dinh dang|co may|bao nhieu|nen luyen|cach luyen|cach lam|lam sao|meo|chien luoc)\b/.test(value) ||
    /\b(o dau|muc nao|tab nao|trang nao|nut nao|trong app|tren web|bam o dau|click o dau)\b/.test(value)
  );
}

function hasPersonalAttemptIntent(value: string) {
  return (
    !isAttemptTheoryOrNavigationQuestion(value) &&
    hasAttemptReference(value) &&
    hasAttemptAnalysisAction(value)
  );
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
    /\b(toeic|part\s*[1-7]|phan\s*[1-7]|reading|listening|grammar|ngu phap|vocabulary|tu vung|doc hieu|nghe|de thi|bai thi|test format|incomplete sentences?|text completion|collocation|relative clause|affect|effect|thi hien tai|qua khu|tuong lai|danh tu|dong tu|tinh tu|trang tu|gioi tu|menh de|although|despite|because|since|for)\b/.test(
      value
    ) || /\b(tu\s*\d{3}\s*len\s*\d{3}|tang diem|hoc sao)\b/.test(value);
  const learningAction =
    /\b(la gi|khac nhau|phan biet|meo|chien luoc|cach hoc|cach lam|lam sao|the nao|co may phan|gom may phan|bao nhieu phan|cau truc|format|dinh dang|nen hoc|nen luyen|hoc gi|chu y gi|tang diem|tranh bay|dung the nao|nghia la gi|hoc sao)\b/.test(
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
    hasContextualQuestionAction(value) ||
    looksLikeToeicKnowledge(value) ||
    isToeicGeneralQuestion(value)
  ) {
    return false;
  }
  if (/^ai\s+la\s+gi$/.test(value) || /^ai\s+la\s+gi\s+vay$/.test(value)) {
    return true;
  }
  return /\b(thoi tiet|weather|bong da|football|crypto|bitcoin|gia vang|vang hom nay|chung khoan|stock|nau an|nau|mon an|du lich|khach san o dau|lap trinh|code|javascript|python|java|chinh tri|tin tuc|phim|game|chuyen ma|tho tinh|ve may bay|dat ve|may bay|laptop|mua sam|shopping|y te|benh|thuoc|phap luat)\b/.test(
    value
  );
}

function hasContextualQuestionAction(value: string) {
  return /\b(giai thich|explain|why|tra loi|vi sao|tai sao|dung|correct|sai|dich|translate|ngu phap|grammar|tu vung|vocabulary|vocab|nghia|viet tat|chon|khong chon|dap an|option|lua chon|phan tich|suy luan|cau truc|mau cau|tuong tu|giong vay|cung dang|luyen them)\b/.test(
    value
  );
}

function hasOptionReference(value: string) {
  return /\b(option|lua chon|dap an|chon|khong chon)\s*[abcd]\b/.test(value) ||
    /\b[abcd]\b/.test(value) && /\b(tai sao|vi sao|chon|khong chon|dap an|option|lua chon|dung|sai)\b/.test(value);
}

function hasQuestionBindingSignal(value: string) {
  return /\b(cai nay|cau nay|cau do|cau vua roi|cau hoi nay|cau\s*\d+|question\s*\d+|dap an nay|doan nay|tu nay|cum nay|bai doc|passage|audio|trong cau nay|trong bai doc|lua chon nay|option nay)\b/.test(
    value
  ) || hasOptionReference(value);
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
  return /^(hi|hello|hey|hey bot|alo|xin chao|chao|chao ban|co ai o do khong|bat dau hoc nao|cam on|cam on ban|cam on nhe|cam on nha|cam on ban nhe|thanks|thanks a lot|thank you|tam biet|bye|goodbye|ok|okay|oke|okeee|um|uh|uhm|um duoc roi|uh duoc roi|uhm duoc roi|duoc roi|giup toi voi|ban giup minh voi|toi khong biet bat dau tu dau)$/.test(
    value
  ) || /\b(chan|nan|met|duoi|stress|ap luc|buon ngu|het dong luc|dong vien|kho qua|roi qua|bi roi|bat dau tu dau)\b/.test(value);
}

function explicitNavigationIntent(text: string): ChatIntent | null {
  const value = normalizeText(text);
  if (/\b(dang o dau trong lo trinh|toi o dau trong lo trinh|minh o dau trong lo trinh)\b/.test(value)) {
    return null;
  }
  const hasNavigationAction =
    /\b(mo|open|show|di den|di toi|chuyen toi|cho toi vao|xem|xem trang|muon xem|vao phan)\b/.test(value);
  const hasUiLocateAction =
    /\b(trong app|tren web|tab nao|muc nao|trang nao|nut nao|bam o dau|click o dau|xem o dau|vao dau|o dau|cho nao|nam o dau|o dau trong app|o dau tren web|xem.*cho nao)\b/.test(value);
  const explicitPageNavigation =
    /\b(mo lai trang|mo trang|di toi trang|di den trang|chuyen toi trang|xem trang)\b/.test(value);
  const nonUiWhere =
    /\b(o dau tot|o dau hieu qua|trung tam nao|nen hoc o dau tot|nen hoc o dau hieu qua)\b/.test(value);
  const hasDirectAppNavigationTarget =
    /\b(review cau sai|cau sai|luyen de|luyen tap|lam de|lam bai test|lam test|dashboard|trang ket qua|ket qua test|lich su lam bai|chi tiet bai lam)\b/.test(value);
  if (!hasNavigationAction && !hasDirectAppNavigationTarget && !explicitPageNavigation && (!hasUiLocateAction || nonUiWhere)) {
    return null;
  }
  if (!hasUiLocateAction && !explicitPageNavigation && /^xem\b/.test(value) && /\b(bai lam|bai test|de gan|bai gan|attempt|gan day nhat)\b/.test(value)) {
    return null;
  }
  if (hasNavigationAction && /\b(flashcard|flash card|on tu|tu vung)\b/.test(value)) return "flashcard.personal";
  if (/\b(roadmap|lo trinh|ke hoach hoc)\b/.test(value)) return "roadmap.guidance";
  if (/\b(review|cau sai|review cau sai|luyen tap|luyen de|lam de|lam bai test|lam test|bai test|de thi|dashboard|tien do|lich su|ket qua|bai lam)\b/.test(value)) {
    return "app.navigation_support";
  }
  return null;
}

function isFlashcardCreateRequest(text: string) {
  const value = normalizeText(text);
  const hasCreateAction = /\b(tao|tao nhanh|sinh|generate|lam cho toi|lap|build|create|make|them|add|luu|save)\b/.test(value);
  const hasFlashcardTarget =
    /\b(flashcards?|flash cards?|cards?|bo tu|the tu vung|tu vung|vocab|word|tu de hoc|hoc tu|tu moi)\b/.test(value);
  const hasCountedWordRequest = /\b\d{1,2}\s*(tu|flashcard|cards?)\b/.test(value);
  const hasTopicOrQuestionSource =
    /\b(chu de|ve|theo chu de|tu chu de|tu cau nay|trong cau nay|cau sai nay|cau nay|tu sai|cac tu sai|wrong answers|mistakes|my mistakes|this word|tu nay|vocab nay|bai vua lam|hay sai)\b/.test(value) ||
    /\b(office|business|meeting|travel|workplace|company|email|project|sales|customer)\b/.test(value);
  return hasCreateAction && (hasFlashcardTarget || hasCountedWordRequest) && (hasTopicOrQuestionSource || hasFlashcardTarget);
}

function isQuestionBoundFlashcardCreateRequest(text: string) {
  const value = normalizeText(text);
  return (
    isFlashcardCreateRequest(value) &&
    /\b(cau nay|cau sai nay|tu cau nay|trong cau nay|question nay|this question)\b/.test(value)
  );
}

function explicitRoadmapIntent(text: string): ChatIntent | null {
  const value = normalizeText(text);
  const mentionsRoadmap =
    /\b(roadmap|lo trinh|ke hoach hoc)\b/.test(value);
  const roadmapProgressWhere =
    /\b(dang o dau trong lo trinh|toi o dau trong lo trinh|minh o dau trong lo trinh)\b/.test(value);
  const asksUiLocation =
    !roadmapProgressWhere &&
    /\b(trong app|tren web|tab nao|muc nao|trang nao|nut nao|bam o dau|click o dau|xem o dau|o dau|cho nao|nam o dau|o dau trong app|o dau tren web|xem.*cho nao)\b/.test(value) &&
    !/\b(o dau tot|o dau hieu qua|trung tam nao|nen hoc o dau tot|nen hoc o dau hieu qua)\b/.test(value);

  if (
    /\b(tai sao|vi sao)\b/.test(value) &&
    /\b(he thong|roadmap|lo trinh|ke hoach)\b/.test(value) &&
    /\b(chon|de xuat|goi y|xep)\b/.test(value)
  ) {
    return "roadmap.explain_recommendation";
  }

  if (
    /\b(ly do.*hoc buoc|giai thich de xuat hoc tap|tai sao bai nay duoc xep|vi sao stage|tai sao stage|vi sao cycle|tai sao cycle|vi sao giai doan)\b/.test(value)
  ) {
    return "roadmap.explain_recommendation";
  }

  if (
    /\b(hom nay.*nen hoc gi|nen hoc gi tiep|buoc tiep theo|hoc gi tiep theo|tiep theo hoc gi|roadmap giao bai gi tiep theo|tiep theo toi can lam gi|goi y bai hoc tiep theo|toi nen hoc part nao tiep theo)\b/.test(
      value
    )
  ) {
    return "roadmap.next_step";
  }

  if (
    mentionsRoadmap &&
    /\b(doi|chinh|dieu chinh|giam|tang|cap nhat|doi muc tieu|muon doi muc tieu|khoi luong)\b/.test(value)
  ) {
    return "roadmap.adjust";
  }

  if (/\b(giam khoi luong hoc|tang thoi gian hoc moi ngay|doi muc tieu hoc|muon doi muc tieu hoc)\b/.test(value)) {
    return "roadmap.adjust";
  }

  if (
    mentionsRoadmap &&
    !asksUiLocation &&
    /\b(the nao|ra sao|thi sao|toi dau|den dau|con bao nhieu buoc|bao nhieu buoc|tien do|hien tai|hoan thanh|dang o dau trong lo trinh)\b/.test(
      value
    )
  ) {
    return "roadmap.summary";
  }

  if (
    mentionsRoadmap &&
    !asksUiLocation &&
    /^(roadmap|lo trinh|lo trinh hoc|ke hoach hoc|lo trinh cua toi)$/.test(value)
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
    /\b(cai nay|cau nay|cau do|cau hoi|cau hoi nay|dap an nay|dap an\s*[abcd]|doan nay|tu nay|cum nay|passage nay|bai doc nay|trong bai doc|bai doc|lua chon nay|lua chon\s*[abcd]|option nay|option\s*[abcd]|cau\s*\d+|question\s*\d+)\b/.test(
      value
    ) || hasOptionReference(value);
  if (!hasQuestionReference) return null;

  if (/\b(dich|translate|nghia tieng viet|ban dich)\b/.test(value)) {
    return "question.translate_context";
  }
  if (/\b(ngu phap|grammar|loai tu|v ing|to v|menh de|thi gi|dung thi gi|cau truc|mau cau|tense|structure|cho trong|danh tu|tinh tu|dong tu|trang tu)\b/.test(value)) {
    return "grammar.contextual";
  }
  if (/\b(tu vung|vocabulary|vocab|cum tu|tu nay|tu nao quan trong|collocation|paraphrase|synonym|keyword|nghia la gi|viet tat)\b/.test(value)) {
    return "vocabulary.contextual";
  }
  if (/\b(tuong tu|luyen them|cau tuong tu|bai tuong tu|similar|practice|giong vay|cung dang|dang cau|dang nay|dang bay|cho them|bai giong vay|cung tag|tag cua cau nay|bai tap lien quan)\b/.test(value)) {
    return "question.similar_practice";
  }
  if (
    /\b(giai thich|explain|why|why not|correct|tra loi|vi sao|tai sao|dung|sai|dap an|noi gi|dua vao dau|khong chon|phan tich|lua chon|option|suy luan|chu y gi|cau\s*\d+|cau nay)\b/.test(value)
  ) {
    return "question.explain_specific";
  }
  return null;
}

function explicitPersonalIntent(text: string): ChatIntent | null {
  const value = normalizeText(text);
  if (/\b(muc tieu diem|target toeic|phan nao toi can on|phan nao toi can on nhieu nhat)\b/.test(value)) {
    return "user_progress.summary";
  }
  if (hasPersonalAttemptIntent(value)) {
    return "test_attempt.analysis";
  }
  if (
    PERSONAL_ATTEMPT_REFERENCE_PATTERN.test(value) &&
    hasAttemptAnalysisAction(value) &&
    !isAttemptTheoryOrNavigationQuestion(value)
  ) {
    return "test_attempt.analysis";
  }
  if (
    /\b(nang luc|ban do nang luc|trinh do hien tai|trinh do toeic|muc nao|level nao|manh part nao|yeu part nao|part nao yeu|part nao yeu nhat|nang luc tung part|skill cua toi|ky nang nao|ky nang nao.*yeu|dang yeu reading|reading hay listening|diem manh diem yeu|can cai thien ky nang|kha nang reading listening|reading listening cua toi|uoc tinh diem hien tai)\b/.test(
      value
    )
  ) {
    return "user_progress.ability_map";
  }
  if (
    /\b(tien do|show my progress|my progress|streak|target|muc tieu|diem gan nhat|diem hien tai|toi yeu phan nao|toi yeu ky nang nao|toi da hoan thanh bao nhieu bai|hoan thanh bao nhieu bai|tinh trang hoc tap|hien tai hoc tap|tong quan|bao nhieu phan tram|muc tieu diem|target toeic|dang o trinh do|tien bo|toc do hoc|tong thoi gian hoc)\b/.test(
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
    hasQuestionBindingSignal(value) ||
    /\b(this question)\b/.test(value);
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
  const hasAttemptReferenceForScope = hasAttemptReference(value);
  const hasAttemptAnalysisActionForScope = hasAttemptAnalysisAction(value);

  if (
    attemptIntent === "test_attempt.analysis" ||
    (hasAttemptReferenceForScope &&
      hasAttemptAnalysisActionForScope &&
      !isAttemptTheoryOrNavigationQuestion(value)) ||
    (parts.length > 0 &&
      /\b(de gan nhat|de thi gan nhat|bai gan nhat|bai thi gan nhat|test gan nhat|vua lam|vua nop|ket qua cua toi|toi sai|toi dung|diem cua toi)\b/.test(value) &&
      hasAttemptAnalysisActionForScope)
  ) {
    const attemptScope = /\b(gan nhat|moi nhat)\b/.test(value)
      ? "latest"
      : /\b(vua lam|vua nop|bai nay|bai thi nay|de nay|de thi nay|hien tai)\b/.test(value)
        ? "current"
        : "selected";
    return {
      scope: "attempt_analysis",
      confidence: 0.98,
      slots: { ...slots, attemptScope },
      reasonCodes: ["explicit_attempt_scope"],
    };
  }

  const personalIntent = explicitPersonalIntent(text);
  if (
    personalIntent === "user_progress.summary" ||
    personalIntent === "user_progress.ability_map"
  ) {
    return {
      scope: "overall_progress",
      confidence: 0.96,
      slots,
      reasonCodes: [
        personalIntent === "user_progress.ability_map"
          ? "explicit_ability_map_scope"
          : "explicit_progress_scope",
      ],
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
  if (intentId === "out_of_project.general") {
    return "SAFE_FALLBACK";
  }
  return intentId === "toeic_knowledge.general" ||
    intentId === "general_toeic_question"
    ? "GENERAL_AI"
    : "DB_FIRST";
}

function scopeForIntent(intentId: ChatIntent): ChatScope {
  return isQuestionIntent(intentId)
    ? "single_question"
    : intentId === "test_attempt.analysis"
      ? "attempt_analysis"
      : intentId === "user_progress.summary" ||
          intentId === "user_progress.ability_map" ||
          intentId === "user_profile.identity" ||
          intentId === "lesson.recommendation" ||
          intentId.startsWith("roadmap.")
        ? "overall_progress"
        : intentId === "toeic_knowledge.general" || intentId === "general_toeic_question"
          ? "general_knowledge"
          : "unknown";
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

function clarifyWithOptions(
  scopeDecision: ScopeDecision,
  reason: string,
  options: ClarifyOption[],
  intentId?: ChatIntent,
  diagnostics?: Partial<RoutingDiagnostics>
): ChatRoutingResult {
  return routeResult({
    decision: { kind: "clarify_with_options", intentId, reason, options },
    scopeDecision,
    intent: intentId,
    source: "semantic",
    resolverPolicy: "CLARIFY",
    confidence: scopeDecision.confidence,
    reason,
    reasonCodes: [reason],
    diagnostics: {
      clarifyOptions: options,
      ...diagnostics,
    },
  });
}

function buildQuestionClarifyOptions(
  routeContext?: ChatRouteContext,
  conversationState?: ChatConversationState
): ClarifyOption[] {
  const options: ClarifyOption[] = [];
  const seen = new Set<string>();
  const addOption = (option: ClarifyOption) => {
    const key = option.value.questionId
      ? `question:${option.value.questionId}`
      : option.reason;
    if (seen.has(key)) return;
    seen.add(key);
    options.push(option);
  };

  const visibleRefs =
    routeContext?.visibleQuestionRefs?.length
      ? routeContext.visibleQuestionRefs
      : routeContext?.questionRefs ?? [];
  const allRefs = routeContext?.questionRefs ?? visibleRefs;
  const findRefById = (questionId?: string) =>
    questionId ? allRefs.find((ref) => String(ref.questionId) === String(questionId)) : undefined;
  const findVisibleRefById = (questionId?: string) =>
    questionId ? visibleRefs.find((ref) => String(ref.questionId) === String(questionId)) : undefined;
  const findVisibleRefByNumber = (questionNumber?: number) =>
    questionNumber
      ? visibleRefs.find((ref) => Number(ref.questionNumber) === Number(questionNumber))
      : undefined;
  const optionFromRef = (
    ref: { questionId?: string; questionNumber?: number; textPreview?: string } | undefined,
    label: string,
    reason: string,
    confidence: number
  ) => {
    if (!ref?.questionId) return;
    addOption({
      label,
      value: {
        questionId: ref.questionId,
        attemptId: routeContext?.attemptId,
        testId: routeContext?.testId,
        questionNumber: ref.questionNumber,
        textPreview: ref.textPreview,
      },
      reason,
      confidence,
    });
  };

  const currentVisibleRef =
    findVisibleRefById(routeContext?.currentVisibleQuestionId) ??
    findVisibleRefByNumber(routeContext?.currentVisibleQuestionNumber) ??
    findVisibleRefById(routeContext?.questionId);
  const selectedRef =
    findVisibleRefById(routeContext?.selectedQuestionId) ??
    findVisibleRefByNumber(routeContext?.selectedQuestionNumber);

  if (currentVisibleRef) {
    optionFromRef(
      currentVisibleRef,
      currentVisibleRef.questionNumber
        ? `Câu ${currentVisibleRef.questionNumber} đang hiển thị`
        : "Câu đang hiển thị",
      "current_visible_question",
      0.98
    );
  } else if (routeContext?.currentVisibleQuestionId) {
    optionFromRef(
      {
        questionId: routeContext.currentVisibleQuestionId,
        questionNumber: routeContext.currentVisibleQuestionNumber,
      },
      routeContext.currentVisibleQuestionNumber
        ? `Câu ${routeContext.currentVisibleQuestionNumber} đang hiển thị`
        : "Câu đang hiển thị",
      "current_visible_question",
      0.96
    );
  }

  if (selectedRef) {
    optionFromRef(
      selectedRef,
      selectedRef.questionNumber
        ? `Câu ${selectedRef.questionNumber} đang chọn trên màn hình`
        : "Câu đang chọn trên màn hình",
      "current_selected_question",
      0.9
    );
  } else if (routeContext?.selectedQuestionId) {
    optionFromRef(
      {
        questionId: routeContext.selectedQuestionId,
        questionNumber: routeContext.selectedQuestionNumber,
      },
      routeContext.selectedQuestionNumber
        ? `Câu ${routeContext.selectedQuestionNumber} đang chọn trên màn hình`
        : "Câu đang chọn trên màn hình",
      "current_selected_question",
      0.88
    );
  }

  const explicitIndex =
    typeof routeContext?.currentQuestionIndex === "number" &&
    Number.isFinite(routeContext.currentQuestionIndex)
      ? routeContext.currentQuestionIndex
      : undefined;
  const inferredIndex =
    explicitIndex ??
    (currentVisibleRef
      ? visibleRefs.findIndex((ref) => ref.questionId === currentVisibleRef.questionId)
      : selectedRef
        ? visibleRefs.findIndex((ref) => ref.questionId === selectedRef.questionId)
        : -1);
  if (visibleRefs.length && inferredIndex >= 0) {
    const previousRef = visibleRefs[inferredIndex - 1];
    const nextRef = visibleRefs[inferredIndex + 1];
    optionFromRef(
      previousRef,
      previousRef?.questionNumber ? `Câu ${previousRef.questionNumber} phía trên` : "Câu phía trên",
      "nearby_visible_question_previous",
      0.72
    );
    optionFromRef(
      nextRef,
      nextRef?.questionNumber ? `Câu ${nextRef.questionNumber} phía dưới` : "Câu phía dưới",
      "nearby_visible_question_next",
      0.72
    );
  } else if (!options.length && visibleRefs.length) {
    visibleRefs.slice(0, 5).forEach((ref) => {
      optionFromRef(
        ref,
        ref.questionNumber ? `Câu ${ref.questionNumber}` : "Câu đang hiển thị",
        "nearby_visible_question",
        0.55
      );
    });
  }

  const recentRef = findRefById(conversationState?.questionId);
  if (conversationState?.questionId) {
    optionFromRef(
      recentRef ?? {
        questionId: conversationState.questionId,
      },
      recentRef?.questionNumber
        ? `Câu ${recentRef.questionNumber} vừa nhắc trong chat`
        : "Câu vừa nhắc trong chat",
      "recent_chat_question_reference",
      0.68
    );
  }

  addOption({
    label: "Tôi sẽ gửi nội dung câu hỏi khác",
    value: {},
    reason: "manual_input",
    confidence: 1,
  });

  return options;
}

function isDeterministicClientAction(clientContext?: ChatClientContext) {
  const action = clientContext?.sourceAction;
  return (
    action === "quick_question_explain" ||
    action === "recommend_similar_practice" ||
    action === "flashcard_create"
  );
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

function shouldHardBlockOutOfScope(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  conversationState?: ChatConversationState;
  followUpContext: FollowUpContext;
}) {
  const value = normalizeText(params.userText);
  if (!value || isSmalltalk(value)) return false;
  if (
    isAppHelpQuestion(value) ||
    explicitNavigationIntent(value) ||
    explicitRoadmapIntent(value) ||
    isFlashcardCreateRequest(value) ||
    looksLikeToeicKnowledge(value) ||
    isToeicGeneralQuestion(value)
  ) {
    return false;
  }

  const hasQuestionContext =
    !!params.routeContext?.questionId ||
    !!params.followUpContext.resolvedQuestionId ||
    params.conversationState?.scope === "single_question";
  if (
    hasQuestionBindingSignal(value) ||
    (hasQuestionContext && hasContextualQuestionAction(value))
  ) {
    return false;
  }

  const hasExternalDomainSignal =
    /\b(thoi tiet|weather|bong da|football|crypto|bitcoin|gia vang|vang hom nay|chung khoan|stock|nau an|nau|mon an|du lich|khach san|chinh tri|tin tuc|phim|game|chuyen ma|tho tinh|ve may bay|dat ve|may bay|laptop|mua sam|shopping|y te|benh|thuoc|phap luat)\b/.test(value) ||
    /\b(viet|tao|debug|fix|sua|lap trinh|code)\b.*\b(code|python|javascript|java|node|react|sql|api)\b/.test(value) ||
    /\b(lap trinh|code python|code javascript|code java|python script)\b/.test(value);

  return hasExternalDomainSignal && isClearlyOutOfToeicScope(value);
}

function resolveContextualQuestionIntent(text: string): ChatIntent | null {
  const value = normalizeText(text);
  if (!value) return null;
  if (/\b(tuong tu|luyen them|luyen dang cau|cau tuong tu|bai tuong tu|similar|practice|giong vay|cung dang|dang cau|dang nay|dang bay|cho them|bai giong vay|cung tag|tag cua cau nay|bai tap lien quan)\b/.test(value)) {
    return "question.similar_practice";
  }
  if (/\b(dich|translate|nghia tieng viet|ban dich)\b/.test(value)) {
    return "question.translate_context";
  }
  if (/\b(ngu phap|grammar|loai tu|v ing|to v|menh de|chu ngu|vi ngu|thi gi|dung thi gi|cau truc|mau cau|tense|structure|cho trong|danh tu|tinh tu|dong tu|trang tu)\b/.test(value)) {
    return "grammar.contextual";
  }
  if (/\b(tu vung|vocabulary|vocab|cum tu|tu nay|tu nao quan trong|collocation|paraphrase|synonym|keyword|nghia la gi|viet tat)\b/.test(value)) {
    return "vocabulary.contextual";
  }
  if (
    /\b(giai thich|explain|why|why not|correct|tra loi|vi sao|tai sao|dung|sai|dap an|noi gi|dua vao dau|khong chon|phan tich|lua chon|option|suy luan|chu y gi)\b/.test(value) ||
    hasQuestionBindingSignal(value)
  ) {
    return "question.explain_specific";
  }
  return null;
}

function hasValidQuestionResolution(
  userText: string,
  routeContext: ChatRouteContext | undefined,
  followUpContext: FollowUpContext
) {
  const contextualQuestionId =
    routeContext?.questionId ??
    routeContext?.currentVisibleQuestionId ??
    routeContext?.selectedQuestionId;
  if (contextualQuestionId) {
    return {
      ok: true,
      questionId: contextualQuestionId,
      questionNumber:
        routeContext?.currentQuestionNumber ??
        routeContext?.currentVisibleQuestionNumber ??
        routeContext?.selectedQuestionNumber,
    };
  }

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
  return /\b(gan nhat|gan day nhat|moi nhat|vua lam|vua nop|de thi vua lam|de thi vua nop|latest|most recent)\b/.test(value);
}

function isCurrentAttemptRequest(userText = "") {
  const value = normalizeText(userText);
  return /\b(bai nay|bai test nay|bai thi nay|test nay|de nay|de thi nay|attempt nay|ket qua nay|bai vua xem|de dang xem|de thi dang xem|bai hien tai|de hien tai|de thi hien tai|ket qua hien tai)\b/.test(value);
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
  if (params.routeContext.questionId && params.routeContext.attemptId) {
    return { ok: true as const, reason: "question_context_ready" };
  }
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

function hydrateQuestionContextFromRoute(
  routeContext: ChatRouteContext,
  userText: string
) {
  if (!routeContext.questionId) {
    routeContext.questionId =
      routeContext.currentVisibleQuestionId ??
      routeContext.selectedQuestionId;
    routeContext.questionNumber =
      routeContext.currentVisibleQuestionNumber ??
      routeContext.selectedQuestionNumber ??
      routeContext.currentQuestionNumber ??
      routeContext.questionNumber;
    routeContext.currentQuestionNumber =
      routeContext.currentVisibleQuestionNumber ??
      routeContext.selectedQuestionNumber ??
      routeContext.currentQuestionNumber;
  }

  const singleQuestionRef = routeContext.questionRefs?.length === 1
    ? routeContext.questionRefs[0]
    : undefined;
  if (
    singleQuestionRef &&
    hasQuestionBindingSignal(normalizeText(userText)) &&
    !routeContext.questionId
  ) {
    routeContext.questionId = singleQuestionRef.questionId;
    routeContext.questionNumber = singleQuestionRef.questionNumber;
    routeContext.currentQuestionNumber = singleQuestionRef.questionNumber;
  }
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
  if (params.intentId === "out_of_project.general") {
    return {
      status: "ready",
      policy: "SAFE_FALLBACK",
      reason: "out_of_project_detected",
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
  const needsQuestionForFlashcard =
    params.intentId === "flashcard.create" &&
    isQuestionBoundFlashcardCreateRequest(params.userText);

  if (params.intentId === "question.similar_practice") {
    if (!effectiveRouteContext.questionId && !params.followUpContext.resolvedQuestionId) {
      return {
        status: "missing_required_context",
        policy: "CLARIFY_IF_CONTEXT_MISSING",
        reason: "missing_question_reference",
        routeContext: effectiveRouteContext,
      };
    }
    return {
      status: "ready",
      policy: resolverPolicyForIntent(params.intentId),
      reason: "question_context_ready",
      routeContext: effectiveRouteContext,
    };
  }

  if (needsQuestionContext || needsQuestionForFlashcard) {
    hydrateQuestionContextFromRoute(effectiveRouteContext, params.userText);
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
  if (isFlashcardCreateRequest(params.userText)) return "flashcard.create" as const;
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
  if (scopeDecision.scope === "overall_progress") {
    return explicitPersonalIntent(params.userText) ?? "user_progress.summary" as const;
  }
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
  const questionIntent = explicitQuestionIntent(params.userText) as ChatIntent;
  const contextualQuestionIntent = resolveContextualQuestionIntent(params.userText);
  const navigationIntent = explicitNavigationIntent(params.userText) as ChatIntent;
  const roadmapIntent = explicitRoadmapIntent(params.userText) as ChatIntent;
  const personalIntent = explicitPersonalIntent(params.userText);
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

  if (params.clientContext?.sourceAction === "quick_question_explain") {
    if (
      !params.routeContext?.questionId ||
      !params.routeContext?.attemptId ||
      !params.routeContext?.testId
    ) {
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

    return routeResult({
      decision: {
        kind: "route",
        intentId: "question.explain_specific",
        lane: "CONTEXTUAL",
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "single_question",
        confidence: 0.99,
      },
      intent: "question.explain_specific",
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent("question.explain_specific"),
      confidence: 0.99,
      margin: 1,
      candidates: [
        {
          intentId: "question.explain_specific",
          lane: "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
        },
      ],
      reason: "fast_path_quick_question",
      reasonCodes: ["fast_path_quick_question"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: "question.explain_specific",
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (params.clientContext?.sourceAction === "recommend_similar_practice") {
    const payload = params.clientContext.actionPayload ?? {};
    const questionId = payload.questionId ?? payload.sourceQuestionId ?? params.routeContext?.questionId;
    if (!questionId) {
      return routeResult({
        decision: {
          kind: "clarify",
          intentId: "question.similar_practice",
          reason: "missing_required_context",
        },
        scopeDecision: {
          ...scopeDecision,
          scope: "single_question",
          confidence: 0.9,
        },
        intent: "question.similar_practice",
        source: "fast_path",
        resolverPolicy: "CLARIFY_IF_CONTEXT_MISSING",
        confidence: 0.9,
        reason: "missing_required_context",
        reasonCodes: ["fast_path_similar_practice_missing_context"],
        diagnostics: {
          ...baseDiagnostics,
          semanticIntent: "question.similar_practice",
          mismatchReason: "fast_path_similar_practice_missing_context",
        },
      });
    }

    return routeResult({
      decision: {
        kind: "route",
        intentId: "question.similar_practice",
        lane: "CONTEXTUAL",
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "single_question",
        confidence: 1,
      },
      intent: "question.similar_practice",
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent("question.similar_practice"),
      confidence: 1,
      margin: 1,
      candidates: [
        {
          intentId: "question.similar_practice",
          lane: "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
        },
      ],
      reason: "fast_path_similar_practice",
      reasonCodes: ["fast_path_similar_practice"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: "question.similar_practice",
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (params.clientContext?.sourceAction === "flashcard_create") {
    return routeResult({
      decision: {
        kind: "route",
        intentId: "flashcard.create",
        lane: "CONTEXTUAL",
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "overall_progress",
        confidence: 0.98,
      },
      intent: "flashcard.create",
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent("flashcard.create"),
      confidence: 0.98,
      margin: 1,
      candidates: [
        {
          intentId: "flashcard.create",
          lane: "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
        },
      ],
      reason: "fast_path_flashcard_create",
      reasonCodes: ["fast_path_flashcard_create"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: "flashcard.create",
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

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

  const hasResolvedQuestionContext =
    !!params.routeContext?.questionId ||
    !!params.followUpContext.resolvedQuestionId;

  if (
    personalIntent === "test_attempt.analysis" &&
    !(hasResolvedQuestionContext && contextualQuestionIntent)
  ) {
    const effectiveRouteContext = params.routeContext ?? { page: "unknown" as const };
    const resolution = canResolveAttemptForIntent({
      routeContext: effectiveRouteContext,
      followUpContext: params.followUpContext,
      userText: params.userText,
    });
    if (!resolution.ok) {
      return routeResult({
        decision: {
          kind: "clarify",
          intentId: "test_attempt.analysis",
          reason: resolution.reason,
        },
        scopeDecision: {
          ...scopeDecision,
          scope: "attempt_analysis",
          confidence: 0.9,
        },
        intent: "test_attempt.analysis",
        source: "fast_path",
        resolverPolicy: "CLARIFY_IF_CONTEXT_MISSING",
        confidence: 0.9,
        reason: resolution.reason,
        reasonCodes: ["fast_path_attempt_missing_context"],
        diagnostics: {
          ...baseDiagnostics,
          semanticIntent: "test_attempt.analysis",
          mismatchReason: resolution.reason,
        },
      });
    }

    return routeResult({
      decision: {
        kind: "route",
        intentId: "test_attempt.analysis",
        lane: "CONTEXTUAL",
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "attempt_analysis",
        confidence: 0.98,
      },
      intent: "test_attempt.analysis",
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent("test_attempt.analysis"),
      confidence: 0.98,
      margin: 1,
      candidates: [
        {
          intentId: "test_attempt.analysis",
          lane: "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
        },
      ],
      reason: "fast_path_attempt_analysis",
      reasonCodes: ["fast_path_attempt_analysis", resolution.reason],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: "test_attempt.analysis",
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
    scopeDecision.scope === "general_knowledge" &&
    !(hasResolvedQuestionContext && contextualQuestionIntent)
  ) {
    return routeResult({
      decision: {
        kind: "general_ai",
        intentId: "toeic_knowledge.general",
      },
      scopeDecision,
      intent: "toeic_knowledge.general",
      source: "fast_path",
      resolverPolicy: "GENERAL_AI",
      confidence: Math.max(scopeDecision.confidence, 0.95),
      margin: 1,
      candidates: [
        {
          intentId: "toeic_knowledge.general",
          lane: "GENERAL_AI",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
        },
      ],
      reason: "fast_path_general_knowledge",
      reasonCodes: ["fast_path_general_knowledge"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: "toeic_knowledge.general",
        winnerScore: 1,
        top1Top2Margin: 1,
      },
    });
  }

  if (contextualQuestionIntent) {
    const hasAttemptOnlyQuestionReference =
      !hasResolvedQuestionContext &&
      (!!params.routeContext?.attemptId ||
        !!params.followUpContext.resolvedAttemptId) &&
      hasQuestionBindingSignal(normalizedUserText);

    if (hasResolvedQuestionContext) {
      const resolution = hasValidQuestionResolution(
        params.userText,
        params.routeContext,
        params.followUpContext
      );
      if (!resolution.ok) {
        return routeResult({
          decision: {
            kind: "clarify",
            intentId: contextualQuestionIntent,
            reason: "missing_required_context",
          },
          scopeDecision: {
            ...scopeDecision,
            scope: "single_question",
            confidence: 0.9,
          },
          intent: contextualQuestionIntent,
          source: "fast_path",
          resolverPolicy: "CLARIFY_IF_CONTEXT_MISSING",
          confidence: 0.9,
          reason: "missing_required_context",
          reasonCodes: ["fast_path_question_missing_context"],
          diagnostics: {
            ...baseDiagnostics,
            semanticIntent: contextualQuestionIntent,
            mismatchReason: "fast_path_question_missing_context",
          },
        });
      }

      const lane = getIntentCatalogEntry(contextualQuestionIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL";
      return routeResult({
        decision: {
          kind: "route",
          intentId: contextualQuestionIntent,
          lane,
        },
        scopeDecision: {
          ...scopeDecision,
          scope: "single_question",
          confidence: 0.99,
        },
        intent: contextualQuestionIntent,
        source: "fast_path",
        resolverPolicy: resolverPolicyForIntent(contextualQuestionIntent),
        confidence: 0.99,
        margin: 1,
        candidates: [
          {
            intentId: contextualQuestionIntent,
            lane,
            confidence: 1,
            score: 1,
            matchedExamples: [],
            rerankScore: 1,
          },
        ],
        reason: "fast_path_contextual_question",
        reasonCodes: ["fast_path_contextual_question"],
        diagnostics: {
          ...baseDiagnostics,
          semanticIntent: contextualQuestionIntent,
          winnerScore: 1,
          top1Top2Margin: 1,
        },
      });
    }

    if (hasAttemptOnlyQuestionReference) {
      return routeResult({
        decision: {
          kind: "clarify",
          intentId: contextualQuestionIntent,
          reason: "missing_question_reference",
        },
        scopeDecision: {
          ...scopeDecision,
          scope: "single_question",
          confidence: 0.9,
        },
        intent: contextualQuestionIntent,
        source: "fast_path",
        resolverPolicy: "CLARIFY_IF_CONTEXT_MISSING",
        confidence: 0.9,
        reason: "missing_question_reference",
        reasonCodes: ["fast_path_question_missing_context"],
        diagnostics: {
          ...baseDiagnostics,
          semanticIntent: contextualQuestionIntent,
          mismatchReason: "fast_path_question_missing_context",
        },
      });
    }
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

  if (params.clientContext?.sourceAction === "recommend_similar_practice") {
    return routeResult({
      decision: {
        kind: "route",
        intentId: "question.similar_practice",
        lane: "CONTEXTUAL",
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "single_question",
        confidence: 1,
      },
      intent: "question.similar_practice",
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent("question.similar_practice"),
      confidence: 1,
      margin: 1,
      candidates: [
        {
          intentId: "question.similar_practice",
          lane: "CONTEXTUAL",
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
        },
      ],
      reason: "fast_path_similar_practice",
      reasonCodes: ["fast_path_similar_practice"],
      diagnostics: {
        ...baseDiagnostics,
        fastPathHit: true,
        semanticIntent: "question.similar_practice",
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

  if (
    personalIntent === "user_progress.summary" ||
    personalIntent === "user_progress.ability_map"
  ) {
    const lane = getIntentCatalogEntry(personalIntent)?.lane === "SYSTEM" ? "SYSTEM" : "CONTEXTUAL";
    return routeResult({
      decision: {
        kind: "route",
        intentId: personalIntent,
        lane,
      },
      scopeDecision: {
        ...scopeDecision,
        scope: "overall_progress",
        confidence: 0.96,
      },
      intent: personalIntent,
      source: "fast_path",
      resolverPolicy: resolverPolicyForIntent(personalIntent),
      confidence: 0.96,
      margin: 1,
      candidates: [
        {
          intentId: personalIntent,
          lane,
          confidence: 1,
          score: 1,
          matchedExamples: [],
          rerankScore: 1,
        },
      ],
      reason: "fast_path_personal_progress",
      reasonCodes: ["fast_path_personal_progress"],
      diagnostics: {
        ...baseDiagnostics,
        semanticIntent: personalIntent,
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
  const signalRouteContext: ChatRouteContext = {
    ...(params.routeContext ?? { page: "unknown" }),
  };
  if (followUpContext.resolvedQuestionId && !signalRouteContext.questionId) {
    signalRouteContext.questionId = followUpContext.resolvedQuestionId;
  }
  if (followUpContext.resolvedAttemptId && !signalRouteContext.attemptId) {
    signalRouteContext.attemptId = followUpContext.resolvedAttemptId;
  }
  const legacyRuleIntent = classifyLegacyRuleIntent({
    userText,
    routeContext: params.routeContext,
    conversationState: params.conversationState,
  });
  const actionSignal = extractIntentSignal(userText, signalRouteContext);
  const actionLayerIntent = actionSignal.intentHint;

  if (isDeterministicClientAction(params.clientContext)) {
    const fastPath = resolveFastPathRoute({
      userText,
      routeContext: signalRouteContext,
      clientContext: params.clientContext,
      conversationState: params.conversationState,
      followUpContext,
      legacyRuleIntent,
    });
    if (fastPath) {
      return fastPath;
    }
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
  const distanceTooFar =
    typeof winner?.distance === "number" &&
    Number.isFinite(winner.distance) &&
    winner.distance > DEFAULT_MAX_DISTANCE;
  const ragStatus: NonNullable<RoutingDiagnostics["ragStatus"]> =
    semanticRanking.semanticDegraded
      ? "rag_error"
      : !winner
        ? "rag_miss"
        : distanceTooFar
          ? "rag_low_confidence"
          : winnerScore < DEFAULT_MIN_RERANK_SCORE
            ? "rag_low_confidence"
          : semanticConfidence < DEFAULT_MIN_CONFIDENCE
          ? "rag_low_confidence"
          : top1Top2Margin < DEFAULT_MIN_MARGIN
            ? "rag_ambiguous"
            : "rag_hit";
  const ragDecision: NonNullable<RoutingDiagnostics["ragDecision"]> =
    ragStatus === "rag_hit"
      ? "RAG_DECIDED"
      : ragStatus === "rag_error"
        ? "RAG_ERROR"
        : "RAG_ABSTAIN";
  const ragAbstainReason: RoutingDiagnostics["ragAbstainReason"] =
    ragStatus === "rag_low_confidence"
      ? "LOW_CONFIDENCE"
      : ragStatus === "rag_ambiguous"
        ? "AMBIGUOUS"
        : ragStatus === "rag_miss"
          ? "NO_MATCH"
          : undefined;

  const buildSemanticDiagnostics = (overrides: Partial<RoutingDiagnostics> = {}) => ({
    fastPathHit: false,
    legacyRuleIntent,
    semanticIntent: winner?.intentId,
    semanticEntity: actionSignal.entity,
    semanticAction: actionSignal.action,
    semanticActionConfidence: actionSignal.actionConfidence,
    actionLayerIntent,
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
    ragStatus,
    ragDecision,
    ragAbstainReason,
    ragErrorCode: ragStatus === "rag_error" ? semanticRanking.errorCode ?? semanticRanking.degradedReason ?? "SEMANTIC_RANKING_ERROR" : undefined,
    ragDistanceTooFar: distanceTooFar,
    ...overrides,
  });

  if (semanticRanking.semanticDegraded || ragStatus === "rag_error") {
    const reason = "semantic_router_unavailable";
    return routeResult({
      decision: {
        kind: "safe_fallback",
        reason,
      },
      scopeDecision: {
        scope: "unknown",
        confidence: 0,
        slots: {},
        reasonCodes: [reason],
      },
      source: "fallback",
      resolverPolicy: "SAFE_FALLBACK",
      confidence: 0,
      margin: top1Top2Margin,
      candidates,
      reason,
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationResult: "SEMANTIC_ROUTER_UNAVAILABLE",
        mismatchReason: reason,
      }),
    });
  }

  if (ragDecision !== "RAG_DECIDED") {
    const reason =
      ragStatus === "rag_miss"
        ? "rag_miss"
        : ragStatus === "rag_ambiguous"
          ? "rag_ambiguous"
          : "rag_low_confidence";
    return routeResult({
      decision: {
        kind: "gemini_fallback",
        reason,
        intentId: winner?.intentId,
      },
      scopeDecision: {
        scope: "unknown",
        confidence: semanticConfidence || 0.25,
        slots: {},
        reasonCodes: [reason],
      },
      source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
      resolverPolicy: "GEMINI_FALLBACK",
      confidence: semanticConfidence || 0.25,
      margin: top1Top2Margin,
      candidates,
      reason,
      reasonCodes: [reason],
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationResult: ragDecision,
        mismatchReason: reason,
        geminiFallbackUsed: true,
        geminiFallbackReason: reason,
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
    const clarifyOptions = (
      isQuestionIntent(winner.intentId) ||
      (winner.intentId === "flashcard.create" && isQuestionBoundFlashcardCreateRequest(userText))
    )
      ? buildQuestionClarifyOptions(validation.routeContext ?? params.routeContext, params.conversationState)
      : [];
    if (clarifyOptions.length > 0) {
      return routeResult({
        decision: {
          kind: "clarify_with_options",
          intentId: winner.intentId,
          reason: validation.reason,
          options: clarifyOptions,
        },
        scopeDecision: {
          scope: "unknown",
          confidence: semanticConfidence,
          slots: {},
          reasonCodes: [validation.reason],
        },
        intent: winner.intentId,
        source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
        resolverPolicy: "CLARIFY",
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
          clarifyOptions,
          recoveredRouteContext: validation.routeContext,
        }),
      });
    }
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
        recoveredRouteContext: validation.routeContext,
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
        recoveredRouteContext: validation.routeContext,
      }),
    });
  }

  const routeScope = isQuestionIntent(winner.intentId)
    ? "single_question"
    : winner.intentId === "test_attempt.analysis"
      ? "attempt_analysis"
      : winner.intentId === "user_progress.summary" ||
          winner.intentId === "user_progress.ability_map" ||
          winner.intentId === "user_profile.identity" ||
          winner.intentId === "lesson.recommendation"
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

  if (winner.intentId === "out_of_project.general") {
    return routeResult({
      decision: {
        kind: "route",
        intentId: "out_of_project.general",
        lane: "SYSTEM",
      },
      scopeDecision: {
        scope: "unknown",
        confidence: semanticConfidence,
        slots: {},
        reasonCodes: ["semantic_out_of_project_candidate"],
      },
      intent: "out_of_project.general",
      source: semanticRanking.semanticDegraded ? "fallback" : "semantic",
      resolverPolicy: "SAFE_FALLBACK",
      confidence: semanticConfidence,
      margin: top1Top2Margin,
      candidates,
      reason: "semantic_out_of_project_candidate",
      reasonCodes: ["semantic_out_of_project_candidate"],
      chromaQueried: semanticRanking.queryCount > 0,
      chromaAvailable: semanticRanking.source === "chroma",
      diagnostics: buildSemanticDiagnostics({
        validationLatencyMs,
        semanticIntent: "out_of_project.general",
        validationResult: "READY",
        recoveredRouteContext: validation.routeContext,
      }),
    });
  }

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
        recoveredRouteContext: validation.routeContext,
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
      recoveredRouteContext: validation.routeContext,
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
  if (intent === "user_progress.ability_map") return "check_progress";
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
  if (result.decision.kind === "clarify_with_options" && result.decision.intentId) {
    return result.decision.intentId;
  }
  if (result.decision.kind === "gemini_fallback" && result.decision.intentId) {
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

export const __test__ = {
  buildQuestionClarifyOptions,
};
