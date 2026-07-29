import { IntentCandidate } from "../types/chat.types";
import { extractIntentSignal, IntentAction } from "./chat_intent_signal.service";

export const CHAT_INTENT_RERANKER_VERSION = "chroma-metadata-v6";

export interface RerankInput {
  userText: string;
  resolvedFollowUpText?: string;
  candidates: IntentCandidate[];
}

export interface RerankedIntentCandidate extends IntentCandidate {
  rerankScore: number;
}

export interface RerankResult {
  candidates: RerankedIntentCandidate[];
  degraded: boolean;
  version: string;
}

const STOPWORDS = new Set([
  "la",
  "cua",
  "toi",
  "ban",
  "minh",
  "cho",
  "voi",
  "va",
  "thi",
  "se",
  "can",
  "nen",
  "roi",
  "nay",
  "do",
  "gi",
  "nao",
  "tai",
  "sao",
  "vi",
  "co",
  "khong",
]);

function normalizeText(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && token.length > 1 && !STOPWORDS.has(token));
}

function uniqueTokens(...values: Array<string | undefined>) {
  return new Set(
    values
      .filter(Boolean)
      .flatMap((value) => tokenize(String(value)))
  );
}

function overlapScore(left: Set<string>, rightTokens: string[]) {
  if (!rightTokens.length) return 0;
  let hits = 0;
  for (const token of rightTokens) {
    if (left.has(token)) hits += 1;
  }
  return hits / rightTokens.length;
}

function bestMatchedExampleOverlap(queryTokens: Set<string>, examples: string[]) {
  let best = 0;
  for (const example of examples) {
    best = Math.max(best, overlapScore(queryTokens, tokenize(example)));
  }
  return best;
}

function actionWeight(confidence: string) {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.7;
  return 0.45;
}

function candidateHasAction(candidate: IntentCandidate, action: IntentAction) {
  return (candidate.actions ?? []).includes(action);
}

function candidateHasEntity(candidate: IntentCandidate, entity?: string) {
  return !!entity && (candidate.entities ?? []).includes(entity);
}

function intentSpecificLexicalBoost(candidate: IntentCandidate, normalizedText: string) {
  const intentId = candidate.intentId;
  const isProgressLevelStatus =
    /\b(dang o muc nao|toi o muc nao|minh o muc nao|trinh do nao|level nao)\b/.test(normalizedText);
  const isGeneralToeicAdvice =
    /\b(nen|bao nhieu|moi tuan|moi ngay|cach|meo|chien luoc|format|cau truc|dinh dang)\b/.test(normalizedText);
  const hasAppNavigationPhrase =
    /\b(trong app|tren web|tab nao|muc nao trong app|trang nao|nut nao|man hinh|dashboard|bam o dau|click o dau|xem o dau|cho nao trong app|nam o dau|lam bai test o dau|lam de o dau|luyen de o dau|xem cau sai o dau|ket qua.*o dau|tien do.*o dau|chi tiet.*o dau)\b/.test(normalizedText) ||
    (/\b(o dau|cho nao|nam dau|nam o dau|xem.*cho nao|xem.*o dau)\b/.test(normalizedText) &&
      /\b(review cau sai|cau sai|dap an|ket qua|tien do|bai test|bai thi|lam test|lam de|luyen de|bai lam|chi tiet)\b/.test(normalizedText));
  const hasAttemptAnchor =
    /\b(de thi nay|de thi hien tai|de thi dang xem|de thi gan nhat|de thi moi nhat|de thi vua lam|de thi vua nop|de thi cua toi|de nay|de gan nhat|de moi nhat|bai nay|bai test nay|bai thi nay|bai gan nhat|bai thi gan nhat|bai vua lam|bai thi vua lam|bai moi nhat|bai lam cua toi|test gan nhat|attempt|ket qua bai|ket qua de thi|vua nop|vua lam)\b/.test(normalizedText);
  const hasAttemptAction =
    /\b(xem|phan tich|danh gia|review|tom tat|sai|loi|yeu|manh|mat diem|diem|ket qua|dang nao|nhom cau|the nao|ra sao|o dau|phan nao|part nao)\b/.test(normalizedText);
  const isTheoryOrNavigation =
    /\b(format|cau truc|dinh dang|co may|bao nhieu|nen luyen|cach luyen|cach lam|lam sao|meo|chien luoc|o dau trong app|muc nao|tab nao|trang nao|nut nao|trong app|tren web)\b/.test(normalizedText);
  const hasCreateAction =
    /\b(tao|create|make|generate|sinh|them|add|luu|save|build|lap)\b/.test(normalizedText);
  const hasQuestionAnchor =
    /\b(cau nay|cau sai nay|cau dang xem|cau hien tai|tu cau nay|trong cau nay|lien quan den cau|question nay|this question)\b/.test(normalizedText);
  const hasCountedWordRequest =
    /\b\d{1,2}\s*(tu|tu vung|word|words?|flashcard|cards?)\b/.test(normalizedText);
  const hasVocabularyLookup =
    /\b(tu nay|cum nay|word|phrase|vocab|tu vung|keyword|synonym|collocation|paraphrase|nghia)\b/.test(normalizedText) ||
    /\b(giai thich|explain|nghia cua|meaning of)\s+tu\s+[a-z0-9]+\b/.test(normalizedText) ||
    /\btu\s+[a-z0-9]+\s+(trong cau nay|trong ngu canh nay|nghia la gi|co nghia gi)\b/.test(normalizedText);
  const hasTranslateSignal =
    /\b(dich|translate|ban dich|nghia tieng viet)\b/.test(normalizedText);
  const hasRoadmapNextStepRequest =
    /\b(hom nay.*hoc gi|hom nay.*nen hoc|bai tiep theo|lesson tiep theo|hoc gi tiep|nen hoc gi tiep|tiep theo hoc gi|goi y bai hoc tiep theo|hoc gi theo lo trinh|bai hoc tiep theo cua toi|goi y theo tien do hien tai|buoc tiep theo|next step|today plan)\b/.test(normalizedText);
  const hasQuestionSimilarPracticeRequest =
    /\b(luyen cau tuong tu|bai luyen tuong tu|cau tuong tu|cung tag|dang cau nay|skill cua cau nay|bai tap lien quan|lien quan den cau|cau dang xem|lam them dang|na na|cung pattern|more drills|duong dan luyen|de xuat practice|cung dang|giong cau|similar|practice dang nay|luyen them|cho them.*cau)\b/.test(normalizedText);
  const hasLessonRecommendationAction =
    /\b(goi y|de xuat|tim|cho toi|cho minh|recommend|suggest|find|list|danh sach)\b/.test(normalizedText);
  const hasLessonRecommendationObject =
    /\b(bai hoc|lessons?|bai luyen|activity|activities|unit|hoc phan)\b/.test(normalizedText);
  const hasLessonAcademicFilter =
    /\b(part\s*[1-7]|phan\s*[1-7]|ngu phap|grammar|dang|chu de|ky nang|skill|tag|relative clause|menh de|tu loai|danh tu|dong tu|tinh tu|trang tu|gioi tu|lien tu|cau bi dong|suy luan|inference|main idea|chi tiet|detail|company|office|travel|shopping|email|meeting|reading|listening)\b/.test(normalizedText);
  const isGeneralTheoryQuestion =
    /\b(la gi|cach lam|meo|chien luoc|gom gi|gom nhung gi|bao nhieu|format|cau truc|dinh dang|khac nhau|phan biet)\b/.test(normalizedText);
  const hasUserProfileAnchor =
    /\b(toi la ai|minh la ai|ban biet gi ve toi|ban dang biet gi ve toi|thong tin ca nhan|ho so|profile|account|tai khoan|email dang dang nhap|email cua toi|ten hien thi|ten cua toi|username|dang dung tai khoan|dang nhap tai khoan)\b/.test(normalizedText);
  const isPhilosophicalIdentity =
    /\b(cuoc doi|tren doi|ngoai doi|nguoi tot|song nhu the nao|y nghia cuoc song|ban chat|con nguoi)\b/.test(normalizedText);
  const isAccountMutation =
    /\b(doi|sua|cap nhat|update|change|mo|vao|xoa|quen mat khau|mat khau|password|avatar)\b/.test(normalizedText);
  const isLearningProfileRequest =
    /\b(tien do|nang luc|ban do|yeu phan|yeu part|diem gan nhat|de gan nhat|bai gan nhat|lo trinh|roadmap)\b/.test(normalizedText);
  if (
    intentId === "user_profile.identity" &&
    hasUserProfileAnchor &&
    !isPhilosophicalIdentity &&
    !isAccountMutation &&
    !isLearningProfileRequest
  ) return 5.2;
  if (
    intentId === "test_attempt.analysis" &&
    hasAttemptAnchor &&
    hasAttemptAction &&
    !isTheoryOrNavigation
  ) return 4.2;
  if (
    intentId === "roadmap.next_step" &&
    (hasRoadmapNextStepRequest || /\b(next step|next action|tiep theo|ke tiep|hom nay|today|hoc gi|lam gi|lesson tiep|task|den luot|bai nao)\b/.test(normalizedText))
  ) return hasRoadmapNextStepRequest ? 5.2 : 3.3;
  if (
    intentId === "roadmap.guidance" &&
    /\b(mo|open|vao|di den|chuyen|tab|trang|man hinh|bam|click)\b/.test(normalizedText)
  ) return 3.0;
  if (
    intentId === "roadmap.summary" &&
    /\b(status|toi dau|dang o|giai doan|stage|cycle|hoan thanh|con bao nhieu|tien trien)\b/.test(normalizedText)
  ) return 2.7;
  if (
    intentId === "roadmap.explain_recommendation" &&
    /\b(roadmap|lo trinh|stage|cycle|ke hoach|plan|de xuat|goi y|recommendation)\b/.test(normalizedText) &&
    /\b(vi sao|tai sao|why|reason|ly do|dua vao|logic|co so|chon|de xuat|goi y|recommendation)\b/.test(normalizedText)
  ) return 3.5;
  if (
    intentId === "roadmap.adjust" &&
    /\b(adjust|doi|chinh|dieu chinh|cap nhat|update|giam|tang|sua lai|sap xep lai)\b/.test(normalizedText)
  ) return 3.4;
  if (
    intentId === "flashcard.create" &&
    hasCreateAction &&
    hasQuestionAnchor &&
    (hasCountedWordRequest || /\b(bo tu|tu vung|de hoc|flashcards?|cards?)\b/.test(normalizedText))
  ) return 5.4;
  if (
    intentId === "flashcard.create" &&
    hasCreateAction
  ) return 3.4;
  if (
    intentId === "flashcard.personal" &&
    /\b(mo|open|vao|review|on|deck|cards?|flashcard tab|da luu)\b/.test(normalizedText) &&
    !/\b(tao|create|make|generate|sinh|them|add|luu|save)\b/.test(normalizedText)
  ) return 2.8;
  if (
    intentId === "app.navigation_support" &&
    hasAppNavigationPhrase &&
    !isProgressLevelStatus &&
    !isGeneralToeicAdvice
  ) return 3.2;
  if (
    intentId === "user_progress.ability_map" &&
    /\b(nang luc|ban do|skill|ky nang|part nao|manh|yeu|level|listening|reading|uoc tinh)\b/.test(normalizedText)
  ) return 3.2;
  if (
    intentId === "user_progress.summary" &&
    /\b(tien do|tien bo|tinh hinh hoc|hoc tap|tong quan|tong the|bao cao|recap|profile hoc|buc tranh|di dung huong|theo kip|cham hoc|hoan thanh|target|muc tieu|streak|trang thai hoc)\b/.test(normalizedText)
  ) return 3.2;
  if (
    intentId === "question.similar_practice" &&
    (hasQuestionSimilarPracticeRequest || /\b(tuong tu|similar|practice|luyen them|cung dang|giong|cung tag|drill|bai bo tro)\b/.test(normalizedText))
  ) return hasQuestionSimilarPracticeRequest ? 5.0 : 3.4;
  if (
    intentId === "lesson.recommendation" &&
    hasLessonRecommendationAction &&
    hasLessonRecommendationObject &&
    hasLessonAcademicFilter &&
    !hasRoadmapNextStepRequest &&
    !hasQuestionSimilarPracticeRequest &&
    !hasCreateAction &&
    !hasQuestionAnchor &&
    !hasVocabularyLookup &&
    !hasTranslateSignal &&
    !isGeneralTheoryQuestion
  ) return 5.5;
  if (
    intentId === "lesson.recommendation" &&
    hasLessonRecommendationObject &&
    hasLessonAcademicFilter &&
    normalizedText.split(" ").filter(Boolean).length <= 5 &&
    !hasRoadmapNextStepRequest &&
    !hasQuestionSimilarPracticeRequest &&
    !hasCreateAction &&
    !hasQuestionAnchor &&
    !hasVocabularyLookup &&
    !hasTranslateSignal &&
    !isGeneralTheoryQuestion
  ) return 3.8;
  if (
    intentId === "lesson.recommendation" &&
    (hasRoadmapNextStepRequest || hasQuestionSimilarPracticeRequest || hasCreateAction || hasQuestionAnchor || hasVocabularyLookup || hasTranslateSignal || isGeneralTheoryQuestion)
  ) return -3.4;
  if (
    intentId === "question.translate_context" &&
    /\b(dich|translate|tieng viet|vietsub|ban dich)\b/.test(normalizedText)
  ) return 2.8;
  if (
    intentId === "vocabulary.contextual" &&
    hasCreateAction
  ) return -3.0;
  if (
    intentId === "vocabulary.contextual" &&
    hasVocabularyLookup
  ) return 4.4;
  if (
    intentId === "grammar.contextual" &&
    /\b(grammar|grammar point|ngu phap|cau truc|loai tu|danh tu|trang tu|tinh tu|dong tu|chu ngu|vi ngu|chia|dau hieu|thi|tense|participle|past participle|v ing|to v|menh de|cho trong)\b/.test(normalizedText) &&
    !/\bde thi\b/.test(normalizedText) &&
    (!isGeneralTheoryQuestion || hasQuestionAnchor)
  ) return 4.2;
  if (
    intentId === "grammar.contextual" &&
    isGeneralTheoryQuestion &&
    !hasQuestionAnchor
  ) return -2.4;
  if (
    intentId === "question.explain_specific" &&
    /\b(giai thich|explain|vi sao|tai sao|why|dap an|chon|sai|dung|logic|option)\b/.test(normalizedText) &&
    !hasAttemptAnchor &&
    !hasVocabularyLookup &&
    !/\b(grammar|grammar point|ngu phap|cau truc|loai tu|danh tu|trang tu|tinh tu|dong tu|chu ngu|vi ngu|chia|dau hieu|thi|tense|participle|past participle|menh de|cho trong|dich|translate|tu vung|vocab|similar|tuong tu)\b/.test(normalizedText)
  ) return 2.2;
  if (
    intentId === "out_of_project.general" &&
    /\b(thoi tiet|weather|co mua|sai gon|gia vang|gia do|usd|bitcoin|btc|crypto|bong da|tran bong|phim|nau|recipe|laptop|dien thoai|du lich|facebook|caption|quang cao|ban ao|trang tri|chuyen vui|quan an)\b/.test(normalizedText)
  ) return 3.8;
  if (
    intentId === "toeic_knowledge.general" &&
    /\b(toeic|part|reading|listening|grammar|ngu phap|vocabulary|tu vung|menh de|relative clause|tu loai|gioi tu|lien tu|cau bi dong|suy luan|inference|meo|chien luoc|format|hoc sao|cach hoc|cach lam)\b/.test(normalizedText) &&
    !/\b(cua minh|cau nay|doan nay|tu nay|roadmap|flashcard)\b/.test(normalizedText)
  ) return isGeneralTheoryQuestion && !hasLessonRecommendationObject ? 4.2 : 2.5;
  return 0;
}

function signalScore(candidate: IntentCandidate, input: RerankInput) {
  const signal = extractIntentSignal(input.userText);
  const confidenceWeight = actionWeight(signal.actionConfidence);
  let score = 0;

  if (signal.intentHint === candidate.intentId) {
    score += 6 * confidenceWeight;
  } else if (signal.intentHint) {
    score -= 1.8 * confidenceWeight;
  }
  if (candidateHasEntity(candidate, signal.entity)) {
    score += 1.6 * confidenceWeight;
  } else if (signal.entity) {
    score -= 1.1 * confidenceWeight;
  }
  if (candidateHasAction(candidate, signal.action)) {
    score += 1.4 * confidenceWeight;
  }
  if ((candidate.forbiddenActions ?? []).includes(signal.action)) {
    score -= 3.2 * confidenceWeight;
  }
  if (candidate.defaultAction === signal.action) {
    score += 0.7 * confidenceWeight;
  }

  return score + intentSpecificLexicalBoost(candidate, normalizeText(input.userText));
}

function scoreCandidate(candidate: IntentCandidate, input: RerankInput) {
  const queryTokens = uniqueTokens(input.userText, input.resolvedFollowUpText);
  const matchedExampleOverlap = bestMatchedExampleOverlap(
    queryTokens,
    [...candidate.matchedExamples, ...(candidate.matchedProfileExamples ?? [])]
  );
  const supportScore = Math.min(candidate.supportCount ?? 0, 5) * 0.03;
  const confidenceScore = Math.max(candidate.confidence ?? 0, 0) * 0.08;
  const bestDistance = Number.isFinite(candidate.distance ?? Number.NaN)
    ? Number(candidate.distance)
    : Number.POSITIVE_INFINITY;
  const exactHitScore = bestDistance <= 0.0001 ? 2.5 : bestDistance <= 0.08 ? 0.9 : 0;
  const noLexicalEvidencePenalty =
    matchedExampleOverlap === 0 && bestDistance > 0.25 ? 0.9 : 0;
  const negativeEvidencePenalty = Math.min(
    candidate.evidenceBreakdown?.negativeEvidenceScore ?? 0,
    1.25
  ) * 1.35;
  const semanticSignalScore = signalScore(candidate, input);
  if (candidate.evidenceBreakdown) {
    candidate.evidenceBreakdown.signalScore = semanticSignalScore;
  }

  return (
    candidate.score +
    matchedExampleOverlap * 0.6 +
    supportScore +
    confidenceScore +
    exactHitScore +
    semanticSignalScore -
    noLexicalEvidencePenalty -
    negativeEvidencePenalty
  );
}

export async function rerankIntentCandidates(input: RerankInput): Promise<RerankResult> {
  try {
    const candidates = input.candidates
      .map<RerankedIntentCandidate>((candidate) => ({
        ...candidate,
        rerankScore: scoreCandidate(candidate, input),
      }))
      .filter((candidate) => Number.isFinite(candidate.rerankScore));
    candidates.forEach((candidate) => {
      if (candidate.evidenceBreakdown) {
        candidate.evidenceBreakdown.finalScore = candidate.rerankScore;
      }
    });

    candidates.sort((left, right) => right.rerankScore - left.rerankScore);

    return {
      candidates,
      degraded: false,
      version: CHAT_INTENT_RERANKER_VERSION,
    };
  } catch (err) {
    console.warn("Intent reranker degraded:", err);
    return {
      candidates: input.candidates.map((candidate) => ({
        ...candidate,
        rerankScore: candidate.score,
      })),
      degraded: true,
      version: CHAT_INTENT_RERANKER_VERSION,
    };
  }
}

export function isRerankBetterThan(candidateA: RerankedIntentCandidate, candidateB?: RerankedIntentCandidate) {
  return !candidateB || candidateA.rerankScore >= candidateB.rerankScore;
}
