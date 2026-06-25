import { getIntentCatalogEntry } from "./chat_intent_examples.data";
import { ChatIntent, IntentCandidate } from "../types/chat.types";

export const CHAT_INTENT_RERANKER_VERSION = "heuristic-v1";

export interface RerankInput {
  userText: string;
  resolvedFollowUpText?: string;
  candidates: IntentCandidate[];
}

export interface RerankedIntentCandidate extends IntentCandidate {
  rerankScore: number;
  legacyRuleScore?: number;
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

function explicitIntentSignals(userText: string) {
  const value = normalizeText(userText);
  return {
    roadmap:
      /\b(roadmap|lo trinh|ke hoach hoc|buoc tiep theo|hom nay nen hoc gi|nen hoc gi tiep)\b/.test(
        value
      ),
    flashcard: /\b(flashcard|flash card|on tu)\b/.test(value),
    question:
      /\b(cau nay|cau do|cau\s*\d+|question\s*\d+|dap an nay|doan nay|tu nay|cum nay|passage nay|bai doc nay|trong bai doc)\b/.test(
        value
      ),
    explain: /\b(giai thich|vi sao|tai sao|tra loi|dich|translate|so sanh|nghia|dap an)\b/.test(value),
    progress:
      /\b(tien do|streak|target|muc tieu|diem gan nhat|diem hien tai|toi yeu phan nao|ky nang nao.*yeu|tong thoi gian hoc)\b/.test(
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

function scoreCandidate(candidate: IntentCandidate, input: RerankInput) {
  const queryTokens = uniqueTokens(input.userText, input.resolvedFollowUpText);
  const entry = getIntentCatalogEntry(candidate.intentId);
  const signals = explicitIntentSignals(input.userText);
  const followUpTokens = tokenize(input.resolvedFollowUpText ?? "");

  let score = candidate.score;
  const exampleOverlap = bestExampleOverlap(queryTokens, candidate.matchedExamples);
  score += exampleOverlap * 0.9;
  score += candidate.supportCount ? Math.min(candidate.supportCount, 4) * 0.05 : 0;

  if (entry) {
    score += overlapScore(queryTokens, tokenize(entry.intentId)) * 0.12;
    score -= hardNegativePenalty(input.userText, entry.hardNegatives) * 0.5;
  }

  if (signals.flashcard && candidate.intentId === "flashcard.personal") score += 1.1;
  if (signals.roadmap && candidate.intentId.startsWith("roadmap.")) score += 1.0;
  if (signals.progress && candidate.intentId === "user_progress.summary") score += 0.9;
  if (signals.attempt && candidate.intentId === "test_attempt.analysis") score += 0.9;
  if (signals.general && candidate.intentId === "toeic_knowledge.general") score += 0.9;
  if (signals.question && candidate.intentId === "question.explain_specific") score += 0.9;
  if (signals.question && candidate.intentId === "question.translate_context") score += 0.85;
  if (signals.question && candidate.intentId === "vocabulary.contextual") score += 0.75;
  if (signals.question && candidate.intentId === "grammar.contextual") score += 0.75;
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
  if (!signals.roadmap && candidate.intentId.startsWith("roadmap.")) {
    score -= 0.15;
  }

  return score;
}

export async function rerankIntentCandidates(input: RerankInput): Promise<RerankResult> {
  try {
    const candidates = input.candidates.map<RerankedIntentCandidate>((candidate) => ({
      ...candidate,
      rerankScore: scoreCandidate(candidate, input),
    }));

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

