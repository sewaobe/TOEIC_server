import type {
  NormalizeFullTestResultInput,
  NormalizeInitialAssessmentInput,
  NormalizeMiniTestResultInput,
  NormalizedPartResultV2,
  NormalizedTestAnswerV2,
  NormalizedTestResultSourceV2,
  NormalizedTestResultV2,
  NormalizedTestTypeV2,
  RawUserTestLikeInput,
} from "../../types/learning_path_v2";

// Layer 1 chỉ chuẩn hóa kết quả test để làm input cho Layer 2.
// Không tính ability, không gọi IRT, không ghi DB.
type NormalizeUserTestResultOptions = {
  trigger_type: NormalizedTestResultV2["trigger_type"];
  user_id: string;
  fallback_test_type: NormalizedTestTypeV2;
  source: NormalizedTestResultSourceV2;
  raw_input_metadata?: Record<string, unknown>;
};

const KNOWN_RESULT_KEYS = new Set([
  "_id",
  "id",
  "user_test_id",
  "test_result_id",
  "user_id",
  "test_id",
  "score",
  "raw_score",
  "answers",
  "parts",
  "part_results",
  "completedPart",
  "completed_part",
  "duration",
  "elapsed_seconds",
  "submit_at",
  "submitted_at",
  "metadata",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (isRecord(value)) {
    const oid = value.$oid ?? value._id ?? value.id;
    if (oid !== value) return toStringValue(oid);
  }
  if (value && typeof value === "object" && "toString" in value) {
    const asString = String(value);
    if (asString && asString !== "[object Object]") return asString;
  }
  return undefined;
};

const toNumberValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toBooleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  return undefined;
};

const toDateValue = (value: unknown): Date | undefined => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return undefined;
};

const normalizeTags = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map(toStringValue)
    .filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
  return tags.length > 0 ? tags : undefined;
};

const derivePartTypeFromName = (partName: unknown): number | undefined => {
  const value = toStringValue(partName);
  if (!value) return undefined;
  const match = value.match(/\bpart\s*(\d+)\b/i);
  if (!match) return undefined;
  const partType = Number(match[1]);
  return Number.isInteger(partType) && partType > 0 ? partType : undefined;
};

const isValidSource = (value: unknown): value is NormalizedTestResultSourceV2 =>
  value === "overview_test" || value === "lesson_mini_test" || value === "manual";

const getRawCompletedPart = (input: RawUserTestLikeInput): unknown =>
  input.completedPart ?? input.completed_part;

const getTestResultId = (input: RawUserTestLikeInput): string | undefined =>
  toStringValue(input.test_result_id) ??
  toStringValue(input.user_test_id) ??
  toStringValue(input._id) ??
  toStringValue(input.id);

const stripNormalizedLargeFields = (
  input: RawUserTestLikeInput
): Record<string, unknown> => {
  const rawInput: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_RESULT_KEYS.has(key)) {
      rawInput[key] = value;
    }
  }
  return rawInput;
};

export const normalizeCompletedPartToTestType = (
  completedPart: unknown,
  fallback: NormalizedTestTypeV2
): NormalizedTestTypeV2 => {
  // Luồng cũ lưu mini test là "mini-test"; v2 chuẩn hóa về "mini_test".
  // Chuỗi part/practice được xem là bài luyện tập.
  const value = toStringValue(completedPart)?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "full_test") return "full_test";
  if (value === "demo_test") return "demo_test";
  if (value === "mini-test" || value === "mini_test") return "mini_test";
  if (
    value.includes("part") ||
    value.includes("practice") ||
    /^\d+(,\d+)*$/.test(value)
  ) {
    return "practice";
  }
  return fallback;
};

export const normalizeDurationToSeconds = (
  duration: unknown
): number | undefined => {
  // FE hiện gửi duration theo giây; Layer 1 expose thống nhất là elapsed_seconds.
  const seconds = toNumberValue(duration);
  return seconds !== undefined && seconds > 0 ? seconds : undefined;
};

export const normalizeAnswers = (answers: unknown): NormalizedTestAnswerV2[] => {
  // Hỗ trợ cả camelCase legacy và snake_case mới từ các nguồn kết quả khác nhau.
  if (!Array.isArray(answers)) return [];

  return answers.reduce<NormalizedTestAnswerV2[]>((normalized, answer) => {
    if (!isRecord(answer)) return normalized;

    const questionId = toStringValue(answer.question_id ?? answer.questionId);
    if (!questionId) return normalized;

    const partType = toNumberValue(answer.part_type ?? answer.part);
    const responseTimeSeconds = normalizeDurationToSeconds(
      answer.response_time_seconds ?? answer.responseTimeSeconds
    );

    normalized.push({
      question_id: questionId,
      selected_option: toStringValue(
        answer.selected_option ?? answer.selectedOption
      ),
      correct_answer: toStringValue(answer.correct_answer ?? answer.correctAnswer),
      is_correct: toBooleanValue(answer.is_correct ?? answer.isCorrect),
      part_type:
        partType !== undefined && Number.isInteger(partType) && partType > 0
          ? partType
          : undefined,
      tags: normalizeTags(answer.tags),
      response_time_seconds: responseTimeSeconds,
    });

    return normalized;
  }, []);
};

export const normalizePartResults = (
  parts: unknown
): NormalizedPartResultV2[] => {
  // Giữ accuracy theo Part và chỉ suy ra part_type khi tên Part đủ rõ ràng.
  if (!Array.isArray(parts)) return [];

  return parts.reduce<NormalizedPartResultV2[]>((normalized, part) => {
    if (!isRecord(part)) return normalized;

    const accuracy = toNumberValue(part.accuracy);
    if (accuracy === undefined) return normalized;

    const partName = toStringValue(part.part_name ?? part.partName ?? part.name);
    const explicitPartType = toNumberValue(part.part_type ?? part.part);
    const partType =
      explicitPartType !== undefined &&
      Number.isInteger(explicitPartType) &&
      explicitPartType > 0
        ? explicitPartType
        : derivePartTypeFromName(partName);

    normalized.push({
      part_type: partType,
      part_name: partName,
      total_questions: toNumberValue(
        part.total_questions ?? part.totalQuestions ?? part.total
      ),
      correct_count: toNumberValue(
        part.correct_count ?? part.correctCount ?? part.correct
      ),
      accuracy,
    });

    return normalized;
  }, []);
};

export const calculateAccuracyFromAnswers = (
  answers: NormalizedTestAnswerV2[]
): number | undefined => {
  // Không đủ dữ liệu chấm đúng/sai thì để undefined, không mặc định là 0.
  if (answers.length === 0) return undefined;
  if (answers.some((answer) => typeof answer.is_correct !== "boolean")) {
    return undefined;
  }

  const correctCount = answers.filter((answer) => answer.is_correct).length;
  return (correctCount / answers.length) * 100;
};

export const normalizeUserTestResult = (
  rawInput: RawUserTestLikeInput,
  options: NormalizeUserTestResultOptions
): NormalizedTestResultV2 => {
  // Adapter chung cho object giống UserTest; không ghi DB và không thay thế UserTest model.
  const answers = normalizeAnswers(rawInput.answers);
  const partResults = normalizePartResults(rawInput.parts ?? rawInput.part_results);
  const rawCompletedPart = getRawCompletedPart(rawInput);
  const rawDuration = rawInput.duration ?? rawInput.elapsed_seconds;
  const metadata: Record<string, unknown> = {
    ...(isRecord(rawInput.metadata) ? rawInput.metadata : {}),
    ...(options.raw_input_metadata ?? {}),
    raw_completedPart: rawCompletedPart,
    raw_duration: rawDuration,
  };

  const rawInputRemainder = stripNormalizedLargeFields(rawInput);
  if (Object.keys(rawInputRemainder).length > 0) {
    metadata.raw_input = rawInputRemainder;
  }

  if (rawInput.day_study_id !== undefined) {
    metadata.day_study_id = rawInput.day_study_id;
  }
  if (rawInput.fromLesson !== undefined) {
    metadata.fromLesson = rawInput.fromLesson;
  }

  return {
    trigger_type: options.trigger_type,
    user_id: toStringValue(rawInput.user_id) ?? options.user_id,
    test_id: toStringValue(rawInput.test_id) ?? "",
    test_result_id: getTestResultId(rawInput),
    test_type: normalizeCompletedPartToTestType(
      rawCompletedPart,
      options.fallback_test_type
    ),
    source: options.source,
    submitted_at: toDateValue(rawInput.submit_at ?? rawInput.submitted_at),
    elapsed_seconds: normalizeDurationToSeconds(rawDuration),
    raw_score: toNumberValue(rawInput.raw_score ?? rawInput.score),
    accuracy: calculateAccuracyFromAnswers(answers),
    answers,
    part_results: partResults,
    metadata,
  };
};

export const normalizeInitialAssessment = async (
  input: NormalizeInitialAssessmentInput
): Promise<NormalizedTestResultV2> => {
  // Chuẩn hóa kết quả đánh giá đầu vào cho trigger initial_generation.
  const rawInput = input.initial_assessment as RawUserTestLikeInput;
  const source = isValidSource(rawInput.source)
    ? rawInput.source
    : isRecord(rawInput.metadata) && isValidSource(rawInput.metadata.source)
      ? rawInput.metadata.source
      : "manual";

  return normalizeUserTestResult(rawInput, {
    trigger_type: "initial_generation",
    user_id: input.user_id,
    fallback_test_type: "entry_test",
    source,
  });
};

export const normalizeFullTestResult = async (
  input: NormalizeFullTestResultInput
): Promise<NormalizedTestResultV2> =>
  // Chuẩn hóa kết quả full/practice/demo test từ luồng overview_test.
  normalizeUserTestResult(input.full_test_result as RawUserTestLikeInput, {
    trigger_type: "full_test_review",
    user_id: input.user_id,
    fallback_test_type: "practice",
    source: "overview_test",
  });

export const normalizeMiniTestResult = async (
  input: NormalizeMiniTestResultInput
): Promise<NormalizedTestResultV2> =>
  // Chuẩn hóa kết quả mini test từ lesson, không gọi weekly-plan hoặc IRT.
  normalizeUserTestResult(input.mini_test_result as RawUserTestLikeInput, {
    trigger_type: "mini_test_completion",
    user_id: input.user_id,
    fallback_test_type: "mini_test",
    source: "lesson_mini_test",
  });
