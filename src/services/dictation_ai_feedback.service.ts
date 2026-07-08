import { Types } from "mongoose";
import {
  Dictation,
  DictationAttempt,
  DictationPlan,
  DictationProgress,
} from "../models";
import { TestStatus } from "../models/enums/TestStatus";
import { generateDictationRuleFeedbackWithAI } from "./gemini.service";

type PerformanceBand =
  | "very_weak"
  | "weak"
  | "needs_practice"
  | "developing"
  | "good"
  | "excellent";

type SpeedStatus = "unknown" | "slow" | "slightly_slow" | "normal" | "fast";

type RecommendationMode =
  | "retry_current"
  | "reinforce_foundation"
  | "same_focus_reinforce"
  | "same_level_practice"
  | "build_reflex"
  | "move_to_less_supported_mode"
  | "same_or_slightly_harder"
  | "advance";

type RecommendationAction = "start_dictation" | "retry_dictation";
type DictationDifficulty = "easy" | "medium" | "hard";
type RecommendationGoal =
  | "increase_difficulty"
  | "build_reflex"
  | "reinforce_foundation"
  | "retry_current"
  | "move_to_less_supported_mode"
  | "same_level_stabilization";

type CandidateStrategy =
  | "strict_match"
  | "same_part_fallback"
  | "same_level_fallback"
  | "nearest_weight_fallback";

interface AttemptLogLike {
  index?: number;
  accuracy?: number;
  duration?: number;
  mistakes?: string[];
  text?: string;
  sentence?: string;
  transcript?: string;
}

interface DictationRecommendation {
  dictationId: string;
  title: string;
  level?: string;
  part_type?: number;
  partLabel?: string;
  tags: string[];
  weight?: number;
  suggestedDifficulty?: DictationDifficulty;
  recommendationGoal: RecommendationGoal;
  action: RecommendationAction;
  score: number;
  reasons: string[];
}

type AdvanceWeightTier = "preferred" | "lower_near" | "low_fallback";

type ScoredDictationRecommendation = DictationRecommendation & {
  advanceWeightTier?: AdvanceWeightTier;
};

interface DictationFeedback {
  overall: string;
  strengths: string[];
  weaknesses: string[];
  tips: string[];
  sentenceAccuracyInsights: string[];
  commonMistakeInsights: string[];
}

interface DictationAnalysisSignals {
  currentAccuracy: number;
  difficulty: DictationDifficulty;
  avgDuration?: number;
  totalDuration?: number;
  expectedDuration?: number | null;
  rawPerformanceBand: PerformanceBand;
  adjustedPerformanceBand: PerformanceBand;
  performanceBand: PerformanceBand;
  speedStatus: SpeedStatus;
  speedReliable: boolean;
  slowSentenceRate?: number;
  recommendationMode: RecommendationMode;
  repeatedMistakes: { text: string; count: number }[];
  allMistakes: { text: string; count: number }[];
  logs: AttemptLogLike[];
  currentDictation: {
    id: string;
    title: string;
    level?: string;
    part_type?: number;
    partLabel?: string;
    tags: string[];
    weight?: number;
    weightValid?: boolean;
  };
}

export interface DictationAIFeedbackResponse {
  source: "rule_based_gemini" | "rule_based_deepseek" | "rule_based_template";
  summary: {
    accuracy: number;
    difficulty: DictationDifficulty;
    avgDuration?: number;
    totalTime?: number;
    rawPerformanceBand: PerformanceBand;
    adjustedPerformanceBand: PerformanceBand;
    performanceBand: PerformanceBand;
    speedStatus: SpeedStatus;
    speedReliable: boolean;
    slowSentenceRate?: number;
    recommendationMode: RecommendationMode;
  };
  feedback: DictationFeedback;
  charts: {
    accuracyBySentence: { index: number; accuracy: number }[];
    frequentMistakes: { text: string; count: number }[];
  };
  recommendations: DictationRecommendation[];
  warnings?: string[];
}

const MAX_RECOMMENDATIONS = 3;
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "of",
  "to",
  "for",
  "from",
  "with",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "and",
  "or",
  "but",
]);

const toObjectId = (value: string, label: string) => {
  if (!Types.ObjectId.isValid(value)) {
    const error = new Error(`${label} khong hop le`) as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  return new Types.ObjectId(value);
};

const normalizeAccuracy = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
};

const normalizeMistake = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ");

const getWeight = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const isValidDecimalWeight = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1;
};

const formatPartType = (partType?: number) => {
  if (!partType) return undefined;
  return `Part ${partType}`;
};

const uniqueStrings = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  return Array.from(
    new Set(
      items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
};

const countOverlap = (left: string[] = [], right: string[] = []) => {
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => rightSet.has(item.toLowerCase())).length;
};

const levelRank = (level?: string) => CEFR_ORDER.indexOf((level ?? "").toUpperCase());

const getPerformanceBand = (accuracy: number): PerformanceBand => {
  if (accuracy < 50) return "very_weak";
  if (accuracy < 65) return "weak";
  if (accuracy < 75) return "needs_practice";
  if (accuracy < 85) return "developing";
  if (accuracy < 92) return "good";
  return "excellent";
};

const getAdjustedPerformanceBand = (
  accuracy: number,
  difficulty: DictationDifficulty,
): PerformanceBand => {
  if (difficulty === "hard") return getPerformanceBand(accuracy);

  if (difficulty === "medium") {
    if (accuracy < 60) return "very_weak";
    if (accuracy < 75) return "weak";
    if (accuracy < 85) return "needs_practice";
    if (accuracy < 92) return "developing";
    if (accuracy < 98) return "good";
    return "excellent";
  }

  if (accuracy < 70) return "very_weak";
  if (accuracy < 85) return "weak";
  if (accuracy < 92) return "needs_practice";
  if (accuracy < 98) return "developing";
  return "good";
};

const normalizeDifficulty = (value: unknown): DictationDifficulty => {
  return value === "easy" || value === "medium" || value === "hard" ? value : "hard";
};

const inferExpectedDurationFromTimings = (
  timings?: { startTime?: number; endTime?: number }[],
) => {
  if (!Array.isArray(timings) || !timings.length) return null;

  const durations = timings
    .map((timing) => Math.abs(Number(timing.endTime) - Number(timing.startTime)))
    .filter((duration) => Number.isFinite(duration) && duration > 0);

  if (!durations.length) return null;

  const avg = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;

  if (avg > 1000) return avg / 1000;
  if (avg > 0.2 && avg < 600) return avg;
  return null;
};

const countWords = (value: unknown) => {
  if (typeof value !== "string") return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
};

const getModeTimeProfile = (difficulty: DictationDifficulty) => {
  if (difficulty === "easy") {
    return { listenFactor: 1.8, inputSecondsPerWord: 0.25, baseThinkingSeconds: 3 };
  }
  if (difficulty === "medium") {
    return { listenFactor: 2.2, inputSecondsPerWord: 0.45, baseThinkingSeconds: 5 };
  }
  return { listenFactor: 2.8, inputSecondsPerWord: 0.7, baseThinkingSeconds: 7 };
};

const getTimingDuration = (timing: any) => {
  const duration = Math.abs(Number(timing?.endTime) - Number(timing?.startTime));
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (duration > 1000) return duration / 1000;
  if (duration > 0.2 && duration < 600) return duration;
  return null;
};

const getExpectedDurationForSentence = (
  timing: any,
  difficulty: DictationDifficulty,
): number | null => {
  const audioDuration = getTimingDuration(timing);
  if (!audioDuration) return null;

  const profile = getModeTimeProfile(difficulty);
  const wordCount = Math.max(
    countWords(timing?.text),
    countWords(timing?.sentence),
    countWords(timing?.transcript),
  );

  return (
    audioDuration * profile.listenFactor +
    wordCount * profile.inputSecondsPerWord +
    profile.baseThinkingSeconds
  );
};

const getSpeedStatus = (
  actualDuration?: number,
  expectedDuration?: number | null,
): SpeedStatus => {
  if (!actualDuration || !expectedDuration) return "unknown";
  if (actualDuration > expectedDuration * 2.5 + 5) return "slow";
  if (actualDuration > expectedDuration * 1.8 + 3) return "slightly_slow";
  if (actualDuration < expectedDuration * 0.75) return "fast";
  return "normal";
};

const buildSpeedSignals = (
  logs: AttemptLogLike[],
  timings: any[] | undefined,
  difficulty: DictationDifficulty,
) => {
  if (!Array.isArray(timings) || !timings.length) {
    return {
      expectedDuration: null,
      speedStatus: "unknown" as SpeedStatus,
      speedReliable: false,
      slowSentenceRate: undefined,
      timingReliable: false,
    };
  }

  const sentenceStatuses = logs.map((log, fallbackIndex) => {
    const timingIndex = typeof log.index === "number" ? log.index : fallbackIndex;
    const expected = getExpectedDurationForSentence(timings[timingIndex], difficulty);
    const actual = Number(log.duration);
    if (!expected || !Number.isFinite(actual) || actual <= 0) return "unknown" as SpeedStatus;
    return getSpeedStatus(actual, expected);
  });
  const knownStatuses = sentenceStatuses.filter((status) => status !== "unknown");
  const slowCount = knownStatuses.filter(
    (status) => status === "slow" || status === "slightly_slow",
  ).length;
  const severeSlowCount = knownStatuses.filter((status) => status === "slow").length;
  const slowSentenceRate = knownStatuses.length ? slowCount / knownStatuses.length : undefined;
  const expectedDurations = logs
    .map((log, fallbackIndex) => {
      const timingIndex = typeof log.index === "number" ? log.index : fallbackIndex;
      return getExpectedDurationForSentence(timings[timingIndex], difficulty);
    })
    .filter((duration): duration is number => typeof duration === "number");
  const expectedDuration = expectedDurations.length
    ? expectedDurations.reduce((sum, duration) => sum + duration, 0) / expectedDurations.length
    : inferExpectedDurationFromTimings(timings);
  const speedStatus =
    knownStatuses.length && slowCount / knownStatuses.length >= 0.6
      ? slowCount === knownStatuses.length
        ? severeSlowCount === knownStatuses.length
          ? "slow"
          : "slightly_slow"
        : "slightly_slow"
      : getSpeedStatus(
          logs.length
            ? logs.reduce((sum, log) => sum + Number(log.duration ?? 0), 0) / logs.length
            : undefined,
          expectedDuration,
        );
  const timingReliable = knownStatuses.length === logs.length && knownStatuses.length > 0;
  const speedReliable =
    logs.length >= 3 &&
    timingReliable &&
    typeof slowSentenceRate === "number" &&
    slowSentenceRate >= 0.6;

  return {
    expectedDuration,
    speedStatus,
    speedReliable,
    slowSentenceRate,
    timingReliable,
  };
};

const getRecommendationMode = (
  performanceBand: PerformanceBand,
  difficulty: DictationDifficulty,
  speedStatus: SpeedStatus,
): RecommendationMode => {
  if (performanceBand === "very_weak") return "retry_current";
  if (performanceBand === "weak") return "reinforce_foundation";
  if (performanceBand === "needs_practice") return "same_focus_reinforce";
  if (performanceBand === "developing") return "same_level_practice";
  if (speedStatus === "slow" || speedStatus === "slightly_slow") return "build_reflex";
  if (difficulty === "easy" && performanceBand === "good") return "move_to_less_supported_mode";
  if (difficulty === "medium" && performanceBand === "excellent") return "same_or_slightly_harder";
  if (difficulty === "hard" && performanceBand === "excellent") return "advance";
  return "same_or_slightly_harder";
};

const getTagScore = (candidateTags: string[], currentTags: string[]) => {
  const overlap = countOverlap(candidateTags, currentTags);
  if (overlap >= 3) return 30;
  if (overlap === 2) return 24;
  if (overlap === 1) return 16;
  return 0;
};

const getLevelScore = (
  candidateLevel: string | undefined,
  currentLevel: string | undefined,
  mode: RecommendationMode,
) => {
  const candidateRank = levelRank(candidateLevel);
  const currentRank = levelRank(currentLevel);
  if (candidateRank === -1 || currentRank === -1) return 8;

  const diff = candidateRank - currentRank;
  if (mode === "reinforce_foundation") return diff <= 0 ? 15 : 0;
  if (
    mode === "same_focus_reinforce" ||
    mode === "same_level_practice" ||
    mode === "build_reflex"
  ) {
    return diff === 0 ? 15 : Math.abs(diff) === 1 ? 8 : 0;
  }
  if (
    mode === "advance" ||
    mode === "same_or_slightly_harder" ||
    mode === "move_to_less_supported_mode"
  ) {
    return diff === 0 || diff === 1 ? 15 : diff === -1 || diff === 2 ? 8 : 0;
  }
  return 8;
};

const getWeightScore = (
  candidateWeight: number,
  currentWeight: number,
  mode: RecommendationMode,
): { score: number; reason: string | null } => {
  const diff = candidateWeight - currentWeight;

  if (mode === "reinforce_foundation") {
    if (diff <= 0) return { score: 20, reason: "Độ nặng thấp hơn hoặc ngang bài vừa làm, phù hợp để củng cố nền." };
    if (diff > 0 && diff <= 0.1) return { score: 8, reason: "Độ nặng gần với bài vừa hoàn thành." };
    return { score: 0, reason: null };
  }

  if (
    mode === "same_focus_reinforce" ||
    mode === "same_level_practice" ||
    mode === "build_reflex"
  ) {
    if (diff >= -0.15 && diff <= 0.15) {
      return { score: 20, reason: "Độ nặng gần bài vừa làm, phù hợp để luyện ổn định và phản xạ." };
    }
    if (diff >= -0.3 && diff <= 0.3) {
      return { score: 10, reason: "Độ nặng vẫn nằm gần vùng bài vừa hoàn thành." };
    }
    return { score: 0, reason: null };
  }

  if (mode === "move_to_less_supported_mode") {
    if (diff >= 0 && diff <= 0.15) {
      return {
        score: 20,
        reason: "Weight ngang hoặc cao hơn nhẹ, phù hợp để luyện thêm ở easy mà chưa tăng mode quá đột ngột.",
      };
    }
    if (diff >= -0.05 && diff < 0) {
      return { score: 12, reason: "Weight gần với bài vừa hoàn thành, phù hợp để luyện thêm ở easy." };
    }
    if (diff > 0.15 && diff <= 0.3) {
      return {
        score: 10,
        reason: "Weight cao hơn một chút, giúp mở rộng luyện tập ở easy.",
      };
    }
    if (diff < -0.1) return { score: -10, reason: null };
    return { score: 0, reason: null };
  }

  if (mode === "same_or_slightly_harder") {
    if (diff >= 0 && diff <= 0.15) {
      return { score: 20, reason: "Độ nặng ngang hoặc nhỉnh hơn nhẹ so với bài vừa hoàn thành." };
    }
    if (diff >= -0.05 && diff < 0) {
      return { score: 12, reason: "Độ nặng gần với bài vừa hoàn thành." };
    }
    if (diff > 0.15 && diff <= 0.3) {
      return { score: 10, reason: "Độ nặng cao hơn nhẹ, phù hợp để tăng thử thách có kiểm soát." };
    }
    if (diff < -0.1) return { score: -10, reason: null };
    return { score: 0, reason: null };
  }

  if (mode === "advance") {
    if (diff >= 0.05 && diff <= 0.25) {
      return {
        score: 25,
        reason: "Weight cao hơn bài vừa hoàn thành, phù hợp để tăng độ khó.",
      };
    }
    if (Math.abs(diff) <= 0.05) {
      return {
        score: 20,
        reason: "Weight gần với bài vừa hoàn thành.",
      };
    }
    if (diff > 0.25 && diff <= 0.5) {
      return {
        score: 14,
        reason: "Weight cao hơn đáng kể, phù hợp nếu bạn muốn thử thách hơn.",
      };
    }
    if (diff >= -0.1 && diff < -0.05) {
      return {
        score: 6,
        reason: "Weight hơi thấp hơn bài vừa hoàn thành nhưng vẫn gần mức hiện tại.",
      };
    }
    if (diff < -0.1) return { score: -35, reason: null };
    return { score: 0, reason: null };
  }

  return { score: 0, reason: null };
};

const getAdvanceWeightTier = (
  candidateWeight: number,
  currentWeight: number,
): AdvanceWeightTier => {
  if (candidateWeight >= currentWeight - 0.05) return "preferred";
  if (candidateWeight >= currentWeight - 0.1 && candidateWeight < currentWeight - 0.05) {
    return "lower_near";
  }
  return "low_fallback";
};

const getHistoryScore = (plan: any, mode: RecommendationMode) => {
  if (!plan) {
    return {
      score: 10,
      reason: "Bài mới, phù hợp để luyện tiếp và mở rộng dữ liệu học tập.",
    };
  }

  const accuracy = normalizeAccuracy(plan.accuracy_overall ?? 0);
  if (
    accuracy < 70 &&
    ["reinforce_foundation", "same_focus_reinforce", "same_level_practice"].includes(mode)
  ) {
    return {
      score: 14,
      reason: "Bài từng luyện nhưng độ chính xác còn thấp, phù hợp để củng cố.",
    };
  }

  if (accuracy >= 90 && Number(plan.total_attempts ?? 0) >= 2) {
    return { score: -8, reason: null };
  }

  return {
    score: 4,
    reason: "Bài đã từng luyện và vẫn có thể dùng để củng cố.",
  };
};

const countMistakes = (logs: AttemptLogLike[]) => {
  const counts = new Map<string, number>();
  for (const log of logs) {
    const mistakes = Array.isArray(log.mistakes) ? log.mistakes : [];
    for (const mistake of mistakes) {
      const normalized = normalizeMistake(mistake);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
};

const buildCharts = (signals: DictationAnalysisSignals) => ({
  accuracyBySentence: signals.logs.map((log, index) => ({
    index: typeof log.index === "number" ? log.index : index,
    accuracy: normalizeAccuracy(log.accuracy),
  })),
  frequentMistakes: signals.allMistakes.slice(0, 8),
});

const buildTemplateFeedback = (
  signals: DictationAnalysisSignals,
  warnings: string[] = [],
): DictationFeedback => {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const tips: string[] = [];
  const sentenceAccuracyInsights = signals.logs.slice(0, 8).map((log, idx) => {
    const sentenceIndex = typeof log.index === "number" ? log.index + 1 : idx + 1;
    return `Câu ${sentenceIndex}: ${Math.round(normalizeAccuracy(log.accuracy))}%`;
  });
  const commonMistakeInsights = signals.allMistakes.slice(0, 5).map((mistake) => {
    return `${mistake.text} (${mistake.count} lần)`;
  });

  if (signals.currentAccuracy >= 85) {
    strengths.push("Trong bài này, bạn nhận diện được phần lớn nội dung cần nghe.");
  } else if (signals.currentAccuracy >= 75) {
    strengths.push("Bạn đã hoàn thành bài ở mức khá ổn và có nền tảng để luyện ổn định hơn.");
  }

  if (signals.logs.length > 0) {
    strengths.push(`Bạn đã hoàn thành bài ở chế độ ${signals.difficulty}.`);
  }

  if (signals.repeatedMistakes.length === 0) {
    strengths.push("Không có nhóm lỗi lặp lại nổi bật trong bài này.");
  }

  const hasRepeatedFunctionWords = signals.repeatedMistakes.some((mistake) =>
    FUNCTION_WORDS.has(mistake.text),
  );

  if (signals.currentAccuracy < 75) {
    weaknesses.push("Cần củng cố độ chính xác trong bài Dictation này.");
  }
  if (hasRepeatedFunctionWords) {
    weaknesses.push("Bạn dễ bỏ sót một số từ ngắn hoặc từ chức năng trong bài.");
  }
  if (signals.speedStatus === "slow" || signals.speedStatus === "slightly_slow") {
    weaknesses.push(
      signals.speedReliable
        ? "Thời gian xử lý chậm ở nhiều câu, đủ tin cậy để ưu tiên luyện phản xạ."
        : "Thời gian làm bài hơi dài, nhưng dữ liệu chưa đủ để kết luận chắc về tốc độ.",
    );
  }
  if (signals.repeatedMistakes.length > 0) {
    weaknesses.push("Một số lỗi xuất hiện lặp lại và nên được nghe lại trước khi học bài mới.");
  }
  if (!weaknesses.length) {
    weaknesses.push("Mục tiêu tiếp theo là giảm lỗi nhỏ và giữ độ chính xác ổn định hơn.");
  }

  switch (signals.recommendationMode) {
    case "retry_current":
      tips.push("Nghe lại từng câu, so sánh với transcript, rồi luyện lại bài hiện tại.");
      break;
    case "reinforce_foundation":
      tips.push("Luyện bài cùng trọng tâm nhưng nhẹ hơn hoặc ngang mức để củng cố nền.");
      break;
    case "same_focus_reinforce":
      tips.push("Làm thêm 1-2 bài cùng tag hoặc cùng Part để ổn định độ chính xác.");
      break;
    case "same_level_practice":
      tips.push("Luyện bài ngang mức để giảm lỗi nhỏ và giữ độ chính xác ổn định.");
      break;
    case "build_reflex":
      tips.push("Luyện bài có độ nặng tương đương để tập trung rút ngắn thời gian nghe và nhập câu trả lời.");
      break;
    case "move_to_less_supported_mode":
      tips.push("Bạn làm tốt ở chế độ easy, nên luyện bài tiếp theo ở medium để tăng dần độ thử thách.");
      break;
    case "advance":
      tips.push(
        warnings.includes("USED_LOW_WEIGHT_FALLBACK_IN_ADVANCE_MODE")
          ? "Hiện chưa tìm thấy đủ bài có weight gần hoặc cao hơn, nên tiếp tục luyện bài cùng tag/Part gần nhất."
          : "Có thể chuyển sang bài có weight ngang hoặc cao hơn để tăng độ thử thách.",
      );
      break;
    default:
      tips.push("Tiếp tục luyện bài liên quan với độ khó ngang hoặc cao hơn nhẹ.");
      break;
  }

  let overall = `Bạn đã hoàn thành bài Dictation ở chế độ ${signals.difficulty} với độ chính xác ${Math.round(signals.currentAccuracy)}%.`;
  if (signals.performanceBand === "very_weak") {
    overall =
      "Bạn đang gặp nhiều khó khăn với bài Dictation này. Nên luyện lại bài hiện tại trước khi chuyển sang bài mới.";
  } else if (signals.performanceBand === "weak") {
    overall =
      "Bạn đã hoàn thành bài nhưng độ chính xác còn thấp. Nên củng cố lại nhóm bài cùng chủ đề và cùng dạng.";
  } else if (signals.performanceBand === "needs_practice") {
    overall =
      "Bạn đã nắm được một phần nội dung, nhưng vẫn còn nhiều lỗi cần luyện thêm.";
  } else if (signals.performanceBand === "developing") {
    overall =
      "Bạn làm bài ở mức khá ổn. Mục tiêu tiếp theo là giảm lỗi nhỏ và ổn định độ chính xác.";
  } else if (signals.performanceBand === "good") {
    overall = signals.recommendationMode === "move_to_less_supported_mode"
      ? "Bạn đạt kết quả tốt ở chế độ easy. Hệ thống gợi ý luyện bài tiếp theo ở medium để tăng dần độ thử thách."
      : "Bạn có kết quả tốt trong bài này. Có thể tiếp tục luyện bài cùng nhóm hoặc tăng nhẹ độ thử thách.";
  } else {
    overall = warnings.includes("USED_LOW_WEIGHT_FALLBACK_IN_ADVANCE_MODE")
      ? "Bạn hoàn thành bài với độ chính xác cao. Hiện chưa tìm thấy đủ bài có weight gần hoặc cao hơn phù hợp, nên hệ thống tạm gợi ý bài liên quan để duy trì luyện tập."
      : "Bạn hoàn thành bài với độ chính xác cao. Có thể chuyển sang bài có weight ngang hoặc cao hơn.";
  }

  return {
    overall,
    strengths,
    weaknesses,
    tips,
    sentenceAccuracyInsights,
    commonMistakeInsights,
  };
};

const buildSignals = (progress: any, dictation: any): DictationAnalysisSignals => {
  const summary = (progress.summary ?? {}) as Record<string, any>;
  const logs = (
    Array.isArray(summary.logs) && summary.logs.length
      ? summary.logs
      : Array.isArray(progress.attempt_logs)
      ? progress.attempt_logs
      : []
  ) as AttemptLogLike[];

  if (!logs.length) {
    const error = new Error("Khong co attempt logs de phan tich dictation") as Error & {
      status?: number;
    };
    error.status = 400;
    throw error;
  }

  const averageAccuracy =
    logs.reduce((sum, log) => sum + normalizeAccuracy(log.accuracy), 0) / logs.length;
  const currentAccuracy = normalizeAccuracy(
    typeof summary.accuracy === "number" ? summary.accuracy : averageAccuracy,
  );
  const totalDuration =
    typeof summary.totalTime === "number"
      ? summary.totalTime
      : logs.reduce((sum, log) => sum + Number(log.duration ?? 0), 0);
  const avgDuration =
    typeof summary.avgDuration === "number"
      ? summary.avgDuration
      : typeof summary.avgTime === "number"
      ? summary.avgTime
      : logs.length
      ? totalDuration / logs.length
      : undefined;
  const difficulty = normalizeDifficulty(progress.difficulty ?? summary.difficulty);
  const speedSignals = buildSpeedSignals(logs, dictation.timings, difficulty);
  const speedStatusForRecommendation = speedSignals.speedReliable
    ? speedSignals.speedStatus
    : "unknown";
  const rawPerformanceBand = getPerformanceBand(currentAccuracy);
  const adjustedPerformanceBand = getAdjustedPerformanceBand(currentAccuracy, difficulty);
  const performanceBand = adjustedPerformanceBand;
  const recommendationMode = getRecommendationMode(
    performanceBand,
    difficulty,
    speedStatusForRecommendation,
  );
  const allMistakes = countMistakes(logs);

  return {
    currentAccuracy,
    difficulty,
    avgDuration,
    totalDuration,
    expectedDuration: speedSignals.expectedDuration,
    rawPerformanceBand,
    adjustedPerformanceBand,
    performanceBand,
    speedStatus: speedSignals.speedStatus,
    speedReliable: speedSignals.speedReliable,
    slowSentenceRate: speedSignals.slowSentenceRate,
    recommendationMode,
    repeatedMistakes: allMistakes.filter((mistake) => mistake.count >= 2),
    allMistakes,
    logs,
    currentDictation: {
      id: dictation._id.toString(),
      title: dictation.title,
      level: dictation.level,
      part_type: dictation.part_type,
      partLabel: formatPartType(dictation.part_type),
      tags: uniqueStrings(dictation.tags),
      weight: getWeight(dictation.weight),
      weightValid: isValidDecimalWeight(dictation.weight),
    },
  };
};

const createRetryRecommendation = (
  signals: DictationAnalysisSignals,
  type: "performance_retry" | "fallback_retry",
): DictationRecommendation => ({
  dictationId: signals.currentDictation.id,
  title: signals.currentDictation.title,
  level: signals.currentDictation.level,
  part_type: signals.currentDictation.part_type,
  partLabel: signals.currentDictation.partLabel,
  tags: signals.currentDictation.tags,
  weight: signals.currentDictation.weight,
  action: "retry_dictation",
  suggestedDifficulty: signals.difficulty,
  recommendationGoal: "retry_current",
  score: type === "performance_retry" ? 100 : 50,
  reasons:
    type === "performance_retry"
      ? [
          "Độ chính xác bài vừa làm còn thấp.",
          "Nên luyện lại bài hiện tại trước khi chuyển sang bài mới.",
        ]
      : [
          "Hiện chưa tìm thấy bài Dictation khác phù hợp hơn.",
          "Bạn có thể luyện lại bài hiện tại để củng cố kết quả.",
        ],
});

const createMoveCurrentToMediumRecommendation = (
  signals: DictationAnalysisSignals,
): ScoredDictationRecommendation => ({
  dictationId: signals.currentDictation.id,
  title: signals.currentDictation.title,
  level: signals.currentDictation.level,
  part_type: signals.currentDictation.part_type,
  partLabel: signals.currentDictation.partLabel,
  tags: signals.currentDictation.tags,
  weight: signals.currentDictation.weight,
  suggestedDifficulty: "medium",
  recommendationGoal: "move_to_less_supported_mode",
  action: "start_dictation",
  score: 120,
  reasons: [
    "Bạn đã làm tốt bài này ở chế độ easy.",
    "Hệ thống gợi ý làm lại chính bài này ở medium để giảm mức hỗ trợ.",
    "Cách này giúp kiểm tra khả năng nghe chính xác hơn trước khi chuyển sang bài mới.",
  ],
});

const getRecommendationGoal = (mode: RecommendationMode): RecommendationGoal => {
  if (mode === "advance") return "increase_difficulty";
  if (mode === "build_reflex") return "build_reflex";
  if (mode === "move_to_less_supported_mode") return "same_level_stabilization";
  if (mode === "reinforce_foundation" || mode === "same_focus_reinforce") {
    return "reinforce_foundation";
  }
  if (mode === "retry_current") return "retry_current";
  return "same_level_stabilization";
};

const getSuggestedDifficulty = (signals: DictationAnalysisSignals): DictationDifficulty => {
  if (signals.recommendationMode === "move_to_less_supported_mode") return "easy";
  return signals.difficulty;
};

const getGoalReason = (signals: DictationAnalysisSignals) => {
  switch (signals.recommendationMode) {
    case "advance":
      return "Mục tiêu: tăng độ khó sau khi bạn đạt độ chính xác cao ở chế độ hard.";
    case "build_reflex":
      return "Mục tiêu: luyện phản xạ nghe - nhập với bài có độ nặng tương đương.";
    case "reinforce_foundation":
    case "same_focus_reinforce":
      return "Mục tiêu: củng cố nền bằng bài cùng trọng tâm hoặc dễ hơn.";
    case "move_to_less_supported_mode":
      return "Mục tiêu: luyện thêm bài liên quan ở easy để mở rộng luyện tập sau khi bạn làm tốt bài vừa rồi.";
    case "same_or_slightly_harder":
      return "Mục tiêu: luyện bài ngang hoặc nhỉnh hơn nhẹ để tăng độ ổn định.";
    case "same_level_practice":
      return "Mục tiêu: luyện thêm bài cùng mức để giảm lỗi nhỏ.";
    default:
      return "Mục tiêu: luyện tiếp bài phù hợp với kết quả hiện tại.";
  }
};

const scoreCandidate = (
  candidate: any,
  signals: DictationAnalysisSignals,
  candidatePlan: any,
  strategy: CandidateStrategy,
): ScoredDictationRecommendation => {
  const candidateTags = uniqueStrings(candidate.tags);
  const currentTags = signals.currentDictation.tags;
  const candidateWeight = getWeight(candidate.weight);
  const currentWeight = getWeight(signals.currentDictation.weight);
  const useAdvanceWeightRule =
    signals.recommendationMode === "advance" && signals.currentDictation.weightValid;
  const advanceWeightTier = useAdvanceWeightRule
    ? getAdvanceWeightTier(candidateWeight, currentWeight)
    : undefined;
  const reasons: string[] = [];
  let score = 0;
  reasons.push(getGoalReason(signals));

  const tagScore = getTagScore(candidateTags, currentTags);
  score += tagScore;
  if (tagScore > 0) {
    reasons.push(
      signals.currentAccuracy < 75
        ? "Bài này cùng nhóm tag với bài bạn vừa làm chưa tốt, phù hợp để củng cố."
        : "Có tag trùng với bài vừa làm.",
    );
  }

  if (candidate.part_type && candidate.part_type === signals.currentDictation.part_type) {
    score += 15;
    reasons.push("Cùng dạng luyện tập với bài vừa hoàn thành.");
  }

  const levelScore = getLevelScore(
    candidate.level,
    signals.currentDictation.level,
    signals.recommendationMode,
  );
  score += levelScore;
  if (levelScore >= 15) {
    reasons.push("Level phù hợp với kết quả hiện tại.");
  } else if (levelScore > 0) {
    reasons.push("Level chấp nhận được để luyện tiếp.");
  }

  const weightResult = useAdvanceWeightRule
    ? getWeightScore(candidateWeight, currentWeight, signals.recommendationMode)
    : signals.recommendationMode === "advance"
    ? { score: 0, reason: null }
    : getWeightScore(candidateWeight, currentWeight, signals.recommendationMode);
  score += weightResult.score;
  if (weightResult.reason) reasons.push(weightResult.reason);

  const history = getHistoryScore(candidatePlan, signals.recommendationMode);
  score += history.score;
  if (history.reason) reasons.push(history.reason);

  if (!candidatePlan) score += 5;
  if (strategy === "nearest_weight_fallback") {
    const shouldApplyNearestWeightBonus =
      signals.recommendationMode !== "advance" ||
      !signals.currentDictation.weightValid ||
      advanceWeightTier !== "low_fallback";
    if (shouldApplyNearestWeightBonus) {
      score += Math.max(0, 10 - Math.abs(candidateWeight - currentWeight) * 2);
      reasons.push("Độ nặng bài học gần với bài vừa hoàn thành.");
    }
  }

  if (advanceWeightTier === "low_fallback") {
    reasons.unshift(
      "Chưa tìm thấy đủ bài có weight gần hoặc cao hơn, nên hệ thống chọn bài cùng tag/Part gần nhất.",
    );
  }

  if (!reasons.length) {
    reasons.push("Bài Dictation này phù hợp để tiếp tục luyện tập.");
  }

  return {
    dictationId: candidate._id.toString(),
    title: candidate.title,
    level: candidate.level,
    part_type: candidate.part_type,
    partLabel: formatPartType(candidate.part_type),
    tags: candidateTags,
    weight: candidateWeight,
    suggestedDifficulty: getSuggestedDifficulty(signals),
    recommendationGoal: getRecommendationGoal(signals.recommendationMode),
    action: "start_dictation" as RecommendationAction,
    score,
    reasons: Array.from(new Set(reasons)).slice(0, 5),
    advanceWeightTier,
  };
};

const buildCandidateQuery = (signals: DictationAnalysisSignals, strategy: CandidateStrategy) => {
  const base: any = {
    _id: { $ne: toObjectId(signals.currentDictation.id, "dictationId") },
    status: TestStatus.APPROVED,
  };

  if (strategy === "strict_match") {
    if (signals.currentDictation.tags.length) {
      return { ...base, tags: { $in: signals.currentDictation.tags } };
    }
    return { _id: { $in: [] }, status: TestStatus.APPROVED };
  }

  if (strategy === "same_part_fallback" && signals.currentDictation.part_type) {
    return { ...base, part_type: signals.currentDictation.part_type };
  }

  if (strategy === "same_level_fallback" && signals.currentDictation.level) {
    return { ...base, level: signals.currentDictation.level };
  }

  return base;
};

const buildRecommendations = async (
  userId: string,
  signals: DictationAnalysisSignals,
) => {
  const warnings: string[] = [];
  const recommendations: ScoredDictationRecommendation[] = [];
  const lowWeightFallbackCandidates: ScoredDictationRecommendation[] = [];
  const addedIds = new Set<string>();
  const isAdvanceMode = signals.recommendationMode === "advance";
  const useAdvanceWeightRule = isAdvanceMode && signals.currentDictation.weightValid;
  if (
    !signals.speedReliable &&
    (signals.speedStatus === "slow" || signals.speedStatus === "slightly_slow")
  ) {
    warnings.push("SPEED_SIGNAL_NOT_RELIABLE_FOR_RECOMMENDATION");
    warnings.push("SPEED_USED_AS_FEEDBACK_ONLY");
  }
  if (isAdvanceMode && !signals.currentDictation.weightValid) {
    warnings.push("CURRENT_WEIGHT_MISSING_ADVANCE_WEIGHT_RULE_SKIPPED");
  }
  const shouldPerformanceRetry =
    signals.currentAccuracy < 50 ||
    (signals.currentAccuracy < 60 && signals.repeatedMistakes.length >= 2);

  if (signals.recommendationMode === "move_to_less_supported_mode") {
    const currentMedium = createMoveCurrentToMediumRecommendation(signals);
    recommendations.push(currentMedium);
    addedIds.add(currentMedium.dictationId);
  }

  if (shouldPerformanceRetry) {
    const retry = createRetryRecommendation(signals, "performance_retry");
    recommendations.push(retry);
    addedIds.add(retry.dictationId);
  }

  const remainingLimit = () => MAX_RECOMMENDATIONS - recommendations.length;
  const strategies: CandidateStrategy[] = [
    "strict_match",
    "same_part_fallback",
    "same_level_fallback",
    "nearest_weight_fallback",
  ];
  const warningByStrategy: Partial<Record<CandidateStrategy, string>> = {
    same_part_fallback: "NO_STRICT_MATCH_FOUND_USED_SAME_PART_FALLBACK",
    same_level_fallback: "NO_PART_MATCH_FOUND_USED_SAME_LEVEL_FALLBACK",
    nearest_weight_fallback: "NO_LEVEL_MATCH_FOUND_USED_NEAREST_WEIGHT_FALLBACK",
  };

  for (const strategy of strategies) {
    if (remainingLimit() <= 0) break;

    const candidates = await Dictation.find(buildCandidateQuery(signals, strategy))
      .limit(strategy === "nearest_weight_fallback" ? 80 : 40)
      .lean();

    const availableCandidates = candidates.filter(
      (candidate: any) => !addedIds.has(candidate._id.toString()),
    );

    if (!availableCandidates.length) continue;

    const candidateIds = availableCandidates.map((candidate: any) => candidate._id);
    const plans = await DictationPlan.find({
      user_id: toObjectId(userId, "userId"),
      dictation_id: { $in: candidateIds },
    }).lean();
    const planByDictationId = new Map(
      plans.map((plan: any) => [plan.dictation_id.toString(), plan]),
    );

    const scored = availableCandidates
      .map((candidate: any) =>
        scoreCandidate(
          candidate,
          signals,
          planByDictationId.get(candidate._id.toString()),
          strategy,
        ),
      )
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    const selectableNow = useAdvanceWeightRule
      ? scored.filter((recommendation) => recommendation.advanceWeightTier !== "low_fallback")
      : scored;
    const deferredLowFallback = useAdvanceWeightRule
      ? scored.filter((recommendation) => recommendation.advanceWeightTier === "low_fallback")
      : [];

    for (const recommendation of selectableNow.slice(0, remainingLimit())) {
      recommendations.push(recommendation);
      addedIds.add(recommendation.dictationId);
    }

    for (const recommendation of deferredLowFallback) {
      if (!addedIds.has(recommendation.dictationId)) {
        lowWeightFallbackCandidates.push(recommendation);
      }
    }

    if (
      strategy !== "strict_match" &&
      warningByStrategy[strategy] &&
      selectableNow.length > 0
    ) {
      warnings.push(warningByStrategy[strategy]!);
    }
  }

  if (remainingLimit() > 0 && lowWeightFallbackCandidates.length > 0) {
    const seenLowFallbackIds = new Set<string>();
    const uniqueLowFallback = lowWeightFallbackCandidates
      .filter((recommendation) => {
        if (addedIds.has(recommendation.dictationId)) return false;
        if (seenLowFallbackIds.has(recommendation.dictationId)) return false;
        seenLowFallbackIds.add(recommendation.dictationId);
        return true;
      })
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    for (const recommendation of uniqueLowFallback.slice(0, remainingLimit())) {
      recommendations.push(recommendation);
      addedIds.add(recommendation.dictationId);
    }

    if (uniqueLowFallback.length > 0) {
      warnings.push("USED_LOW_WEIGHT_FALLBACK_IN_ADVANCE_MODE");
    }
  }

  if (!recommendations.length) {
    const retry = createRetryRecommendation(signals, "fallback_retry");
    recommendations.push(retry);
    addedIds.add(retry.dictationId);
    warnings.push("NO_OTHER_APPROVED_DICTATION_USED_RETRY_CURRENT");
  }

  const cleanRecommendations = recommendations
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ advanceWeightTier, ...recommendation }) => recommendation);

  return {
    recommendations: cleanRecommendations,
    warnings,
  };
};

export const getDictationAIFeedbackService = async (
  progressId: string,
  userId: string,
): Promise<DictationAIFeedbackResponse> => {
  const startedAt = Date.now();
  console.info("[DictationAI] service load progress", { progressId, userId });
  const progress = await DictationProgress.findOne({
    _id: toObjectId(progressId, "progressId"),
    user_id: toObjectId(userId, "userId"),
  }).lean();

  if (!progress) {
    const error = new Error("Khong tim thay tien trinh dictation") as Error & {
      status?: number;
    };
    error.status = 404;
    throw error;
  }

  console.info("[DictationAI] service load dictation", {
    progressId,
    dictationId: progress.dictation_id?.toString(),
  });
  const dictation = await Dictation.findById(progress.dictation_id).lean();
  if (!dictation) {
    const error = new Error("Khong tim thay bai dictation hien tai") as Error & {
      status?: number;
    };
    error.status = 404;
    throw error;
  }

  await Promise.all([
    DictationPlan.findOne({
      user_id: toObjectId(userId, "userId"),
      dictation_id: progress.dictation_id,
    }).lean(),
    DictationAttempt.find({
      user_id: toObjectId(userId, "userId"),
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  console.info("[DictationAI] service build signals", {
    progressId,
    difficulty: progress.difficulty,
    logs:
      Array.isArray((progress.summary as any)?.logs) && (progress.summary as any).logs.length
        ? (progress.summary as any).logs.length
        : Array.isArray(progress.attempt_logs)
        ? progress.attempt_logs.length
        : 0,
  });
  const signals = buildSignals(progress, dictation);
  const charts = buildCharts(signals);
  console.info("[DictationAI] service build recommendations", {
    progressId,
    accuracy: Math.round(signals.currentAccuracy),
    difficulty: signals.difficulty,
    mode: signals.recommendationMode,
    speedStatus: signals.speedStatus,
    speedReliable: signals.speedReliable,
  });
  const { recommendations, warnings } = await buildRecommendations(userId, signals);
  const templateFeedback = buildTemplateFeedback(signals, warnings);
  const summary = {
    accuracy: Math.round(signals.currentAccuracy),
    difficulty: signals.difficulty,
    avgDuration: signals.avgDuration,
    totalTime: signals.totalDuration,
    rawPerformanceBand: signals.rawPerformanceBand,
    adjustedPerformanceBand: signals.adjustedPerformanceBand,
    performanceBand: signals.performanceBand,
    speedStatus: signals.speedStatus,
    speedReliable: signals.speedReliable,
    slowSentenceRate: signals.slowSentenceRate,
    recommendationMode: signals.recommendationMode,
  };

  if (process.env.DICTATION_AI_SKIP_GEMINI === "true") {
    console.info("[DictationAI] service return template because Gemini skipped", {
      progressId,
      elapsedMs: Date.now() - startedAt,
      recommendations: recommendations.length,
      warnings,
    });
    return {
      source: "rule_based_template",
      summary,
      feedback: templateFeedback,
      charts,
      recommendations,
      warnings: [...warnings, "GEMINI_FEEDBACK_WRITER_SKIPPED_USED_TEMPLATE"],
    };
  }

  try {
    console.info("[DictationAI] service Gemini writer start", {
      progressId,
      recommendations: recommendations.length,
    });
    const aiFeedbackResult = await generateDictationRuleFeedbackWithAI({
      signals,
      templateFeedback,
      charts,
      recommendations,
    });

    console.info("[DictationAI] service feedback writer success", {
      progressId,
      elapsedMs: Date.now() - startedAt,
      provider: aiFeedbackResult.provider,
    });
    return {
      source:
        aiFeedbackResult.provider === "deepseek"
          ? "rule_based_deepseek"
          : "rule_based_gemini",
      summary,
      feedback: {
        ...templateFeedback,
        ...aiFeedbackResult.feedback,
      },
      charts,
      recommendations,
      warnings,
    };
  } catch (error) {
    console.error("Dictation AI feedback writer failed, using template feedback.", error);
    console.info("[DictationAI] service return template after Gemini failure", {
      progressId,
      elapsedMs: Date.now() - startedAt,
      recommendations: recommendations.length,
      warnings,
    });
    return {
      source: "rule_based_template",
      summary,
      feedback: templateFeedback,
      charts,
      recommendations,
      warnings: [...warnings, "GEMINI_FEEDBACK_WRITER_FAILED_USED_TEMPLATE"],
    };
  }
};
