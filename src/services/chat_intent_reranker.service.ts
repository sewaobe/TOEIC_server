import { getIntentCatalogEntry } from "./chat_intent_examples.data";
import { extractIntentSignal, IntentActionConfidence } from "./chat_intent_signal.service";
import { ChatIntent, ChatRouteContext, IntentCandidate } from "../types/chat.types";

export const CHAT_INTENT_RERANKER_VERSION = "heuristic-v1";

export interface RerankInput {
  userText: string;
  resolvedFollowUpText?: string;
  routeContext?: ChatRouteContext;
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
  "nay",
  "gi",
  "nao",
  "tai",
  "sao",
  "vi",
  "co",
  "khong",
  "mot",
  "nhung",
  "nhe",
  "di",
  "dii",
  "cau",
  "bai",
  "phan",
  "part",
  "question",
  "answer",
  "dap",
  "an",
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

function bestExampleOverlap(queryTokens: Set<string>, examples: string[]) {
  let best = 0;
  for (const example of examples) {
    best = Math.max(best, overlapScore(queryTokens, tokenize(example)));
  }
  return best;
}

function isShortSmalltalk(value: string) {
  const tokens = value.split(" ").filter(Boolean);
  if (tokens.length > 4) return false;

  return (
    /^(hi|hello|hey|alo|xin chao|chao|chao ban|cam on|cam on ban|cam on nhe|cam on nhieu|cam on ban nhieu|thanks|thank you|ok|okay|oke|duoc roi|uh|um|roi)$/.test(value) ||
    /\b(chan|nan|met|stress|het dong luc|buon ngu)\b/.test(value)
  );
}

function explicitIntentSignals(userText: string) {
  const value = normalizeText(userText);
  const flashcardCreate =
    /\b(tao|tao nhanh|sinh|generate|lam cho toi|create)\b/.test(value) &&
    (
      /\b(flashcard|flash card|bo tu|tu vung|tu de hoc|hoc tu|tu moi)\b/.test(value) ||
      /\b\d{1,2}\s*(tu|flashcard|cards?)\b/.test(value) ||
      /\b(chu de|ve|theo chu de|tu chu de|office|business|meeting|travel|workplace|company|email|project|sales|customer)\b/.test(value)
    );
  return {
    smalltalk: isShortSmalltalk(value),
    roadmap:
      /\b(roadmap|lo trinh|ke hoach hoc|buoc tiep theo|hom nay nen hoc gi|nen hoc gi tiep)\b/.test(
        value
      ),
    flashcard: /\b(flashcard|flash card|on tu)\b/.test(value) || flashcardCreate,
    question:
      /\b(cau nay|cau do|cau\s*\d+|question\s*\d+|dap an nay|doan nay|tu nay|cum nay|passage nay|bai doc nay|trong bai doc)\b/.test(
        value
      ),
    explain: /\b(giai thich|vi sao|tai sao|tra loi|dich|translate|so sanh|nghia|dap an)\b/.test(value),
    grammar:
      /\b(ngu phap|grammar|cau nay dung ngu phap|cau truc ngu phap|vi sao khong dung v-ing|vi sao khong dung to v|tai sao o day dung danh tu|tai sao o day dung dong tu)\b/.test(
        value
      ),
    vocabulary:
      /\b(tu vung|vocabulary|cum tu|nghia cua tu|pick up|awning|word nay|phrase nay)\b/.test(
        value
      ),
    progress:
      /\b(tien do|streak|target|muc tieu|diem gan nhat|diem hien tai|toi yeu phan nao|ky nang nao.*yeu|tong thoi gian hoc)\b/.test(
        value
      ),
    progressSummary:
      /\b(tien do|streak|target|muc tieu|diem gan nhat|diem hien tai|toi yeu phan nao|phan nao toi yeu nhat|phan nao toi can on nhieu nhat|tong thoi gian hoc)\b/.test(
        value
      ),
    abilityMap:
      /\b(nang luc|ban do nang luc|trinh do hien tai|trinh do toeic|muc nao|manh part nao|yeu part nao|nang luc tung part|skill cua toi|uoc tinh diem hien tai)\b/.test(
        value
      ),
    attempt:
      /\b(de gan nhat|de moi nhat|bai nay|bai gan nhat|bai vua lam|bai moi nhat|bai lam cua toi|test gan nhat|lan thi gan nhat|attempt|ket qua bai|vua nop|vua lam)\b/.test(
        value
      ),
    general:
      /\b(toeic|reading|listening|grammar|ngu phap|vocabulary|tu vung|meo|chien luoc|format|collocation|incomplete sentence|text completion)\b/.test(
        value
      ),
  };
}

function hardNegativePenalty(userText: string, hardNegatives: string[]) {
  const queryTokens = uniqueTokens(userText);
  let worst = 0;
  for (const negative of hardNegatives) {
    const score = overlapScore(queryTokens, tokenize(negative));
    worst = Math.max(worst, score);
  }
  return worst;
}

function isQuestionContextualIntent(intentId: ChatIntent) {
  return (
    intentId.startsWith("question.") ||
    intentId === "grammar.contextual" ||
    intentId === "vocabulary.contextual"
  );
}

function hasQuestionExecutionContext(routeContext?: ChatRouteContext) {
  return Boolean(routeContext?.questionId && routeContext?.attemptId);
}

function actionBoost(confidence: IntentActionConfidence) {
  if (confidence === "high") return 2.4;
  if (confidence === "medium") return 1.35;
  return 0.55;
}

function scoreCandidate(candidate: IntentCandidate, input: RerankInput) {
  const queryTokens = uniqueTokens(input.userText, input.resolvedFollowUpText);
  const entry = getIntentCatalogEntry(candidate.intentId);
  const signals = explicitIntentSignals(input.userText);
  const intentSignal = extractIntentSignal(input.userText, input.routeContext);
  const followUpTokens = tokenize(input.resolvedFollowUpText ?? "");

  let score = candidate.score;

  if (isQuestionContextualIntent(candidate.intentId) && !hasQuestionExecutionContext(input.routeContext)) {
    score -= 0.65;
  }

  const exampleOverlap = bestExampleOverlap(queryTokens, candidate.matchedExamples);
  score += exampleOverlap * 0.9;
  score += candidate.supportCount ? Math.min(candidate.supportCount, 4) * 0.05 : 0;

  if (entry) {
    score += overlapScore(queryTokens, tokenize(entry.intentId)) * 0.12;
    score -= hardNegativePenalty(input.userText, entry.hardNegatives) * 0.5;

    if (intentSignal.entity && entry.entities.includes(intentSignal.entity)) {
      score += 1.4;
    } else if (intentSignal.entity && isQuestionContextualIntent(candidate.intentId)) {
      score -= 3.5;
    }

    if (entry.actions.includes(intentSignal.action)) {
      score += actionBoost(intentSignal.actionConfidence);
    }
    if (entry.defaultAction === intentSignal.action) {
      score += actionBoost(intentSignal.actionConfidence) * 0.35;
    }
    if (entry.forbiddenActions?.includes(intentSignal.action)) {
      score -= actionBoost(intentSignal.actionConfidence) * 1.4;
    }
    if (intentSignal.intentHint === candidate.intentId) {
      score += actionBoost(intentSignal.actionConfidence) * 1.2;
    }
  }

  if (
    intentSignal.entity === "flashcard" &&
    intentSignal.action === "create" &&
    candidate.intentId === "flashcard.create"
  ) {
    score += 4.0;
  }
  if (
    intentSignal.entity === "flashcard" &&
    intentSignal.action !== "create" &&
    candidate.intentId === "flashcard.personal"
  ) {
    score += 3.2;
  }
  if (signals.smalltalk && candidate.intentId === "smalltalk.greeting_feedback") score += 5.0;
  if (signals.roadmap && candidate.intentId === "roadmap.guidance") score += intentSignal.action === "locate_ui" || intentSignal.action === "open" || intentSignal.action === "navigate" ? 2.0 : -1.0;
  if (signals.roadmap && candidate.intentId.startsWith("roadmap.") && candidate.intentId !== "roadmap.guidance") score += intentSignal.action === "general_ask" || intentSignal.action === "ask_status" ? 1.2 : 0.35;
  if (signals.progressSummary && candidate.intentId === "user_progress.summary") score += 7.0;
  if (signals.progressSummary && candidate.intentId === "user_progress.ability_map") score += 1.0;
  if (signals.progressSummary && candidate.intentId === "test_attempt.analysis") score -= 3.5;
  if (signals.abilityMap && candidate.intentId === "user_progress.ability_map") score += 4.0;
  if (signals.abilityMap && candidate.intentId === "user_progress.summary") score += 0.5;
  if (signals.abilityMap && candidate.intentId === "test_attempt.analysis") score -= 2.2;
  if (signals.attempt && candidate.intentId === "test_attempt.analysis") score += 0.9;
  if (signals.general && candidate.intentId === "toeic_knowledge.general") score += 0.9;
  if (signals.question && candidate.intentId === "question.explain_specific") score += 0.9;
  if (signals.question && candidate.intentId === "question.translate_context") score += 0.85;
  if (signals.question && candidate.intentId === "vocabulary.contextual") score += 0.75;
  if (signals.question && candidate.intentId === "grammar.contextual") score += 0.75;
  if (signals.vocabulary && candidate.intentId === "vocabulary.contextual") score += 1.25;
  if (signals.grammar && candidate.intentId === "grammar.contextual") score += 1.9;
  if (signals.grammar && candidate.intentId === "vocabulary.contextual") score -= 1.2;
  if (signals.grammar && candidate.intentId === "question.translate_context") score -= 1.1;
  if (signals.flashcard && candidate.intentId === "app.navigation_support") score -= 1.2;
  if (signals.roadmap && candidate.intentId === "app.navigation_support") score -= 0.25;
  if (signals.smalltalk && candidate.intentId.startsWith("question.")) score -= 0.5;
  if (signals.smalltalk && candidate.intentId === "test_attempt.analysis") score -= 2.8;
  if (followUpTokens.length && candidate.intentId.startsWith("question.")) {
    score += 0.15 * overlapScore(queryTokens, followUpTokens);
  }

  if (!signals.question && candidate.intentId.startsWith("question.")) {
    score -= 0.2;
  }
  if (!signals.attempt && candidate.intentId === "test_attempt.analysis") {
    score -= 0.15;
  }
  if (!signals.progress && candidate.intentId === "user_progress.summary") {
    score -= 0.15;
  }
  if (!signals.abilityMap && candidate.intentId === "user_progress.ability_map") {
    score -= 0.15;
  }
  if (!signals.roadmap && candidate.intentId.startsWith("roadmap.")) {
    score -= 0.15;
  }

  return score;
}

export async function rerankIntentCandidates(input: RerankInput): Promise<RerankResult> {
  try {
    const candidates = input.candidates
      .map<RerankedIntentCandidate>((candidate) => ({
        ...candidate,
        rerankScore: scoreCandidate(candidate, input),
      }))
      .filter((candidate) => Number.isFinite(candidate.rerankScore));

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
