import type {
  NormalizeTestResultInput,
  NormalizedPartResultV2,
  NormalizedTestAnswerV2,
  NormalizedTestResultSourceV2,
  NormalizedTestResultV2,
  NormalizedTestTypeV2,
  RawUserTestLikeInput,
} from "../../types/learning_path_v2";
import { Group, Question } from "../../models";
import { normalizeToeicSkillTags } from "../../utils/toeic_skill.util";

type QuestionMetadata = {
  question_id: string;
  raw_tags?: string[];
  irt_difficulty?: number;
  part_type?: number;
};

// Layer 1 chuẩn hóa test result ở cấp question.
// Có enrich tags/part/irt_difficulty cho Layer 2, nhưng không tính ability, không gọi IRT, không ghi DB.
type BuildNormalizedTestResultOptions = {
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

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

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

const uniqueStrings = (values: string[]): string[] =>
  values.filter((value, index, list) => list.indexOf(value) === index);

const derivePartTypeFromName = (partName: unknown): number | undefined => {
  const value = toStringValue(partName);
  if (!value) return undefined;
  const match = value.match(/\bpart\s*(\d+)\b/i);
  if (!match) return undefined;
  const partType = Number(match[1]);
  return Number.isInteger(partType) && partType > 0 ? partType : undefined;
};

const getDefaultContextByTrigger = (
  triggerType: NormalizedTestResultV2["trigger_type"]
): {
  fallback_test_type: NormalizedTestTypeV2;
  source: NormalizedTestResultSourceV2;
} => {
  if (triggerType === "initial_generation") {
    return { fallback_test_type: "entry_test", source: "manual" };
  }
  if (triggerType === "mini_test_completion") {
    return { fallback_test_type: "mini_test", source: "lesson_mini_test" };
  }
  return { fallback_test_type: "practice", source: "overview_test" };
};

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

const normalizeCompletedPartToTestType = (
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

const normalizeDurationToSeconds = (
  duration: unknown
): number | undefined => {
  // FE hiện gửi duration theo giây; Layer 1 expose thống nhất là elapsed_seconds.
  const seconds = toNumberValue(duration);
  return seconds !== undefined && seconds > 0 ? seconds : undefined;
};

const normalizeAnswers = (answers: unknown): NormalizedTestAnswerV2[] => {
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
        partType !== undefined && isPositiveInteger(partType) ? partType : undefined,
      tags: normalizeTags(answer.tags),
      raw_tags: normalizeTags(answer.raw_tags),
      skills: [],
      skill_keys: [],
      response_time_seconds: responseTimeSeconds,
    });

    return normalized;
  }, []);
};

const normalizePartResults = (
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

const calculateAccuracyFromAnswers = (
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

const buildNormalizedTestResult = (
  rawInput: RawUserTestLikeInput,
  options: BuildNormalizedTestResultOptions
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

const loadQuestionMetadataByIds = async (
  questionIds: string[],
  testId?: string
): Promise<Map<string, QuestionMetadata>> => {
  const uniqueQuestionIds = uniqueStrings(questionIds);
  const metadataMap = new Map<string, QuestionMetadata>();
  if (uniqueQuestionIds.length === 0) return metadataMap;

  const questionDocs = await Question.find({
    _id: { $in: uniqueQuestionIds },
  })
    .select("_id tags irt_difficulty")
    .lean();

  for (const question of questionDocs as any[]) {
    const questionId = toStringValue(question?._id);
    if (!questionId) continue;

    metadataMap.set(questionId, {
      question_id: questionId,
      raw_tags: normalizeTags(question.tags) ?? [],
      irt_difficulty: toNumberValue(question.irt_difficulty),
    });
  }

  const groupQuery: Record<string, unknown> = {
    questions: { $in: uniqueQuestionIds },
  };
  if (testId) {
    groupQuery.$or = [{ test_id: testId }, { minitest_id: testId }];
  }

  const groupDocs = await Group.find(groupQuery)
    .select("_id part questions")
    .lean();

  for (const group of groupDocs as any[]) {
    const partType = toNumberValue(group?.part);
    if (partType === undefined || !isPositiveInteger(partType)) continue;
    const groupQuestionIds = Array.isArray(group?.questions) ? group.questions : [];

    for (const rawQuestionId of groupQuestionIds) {
      const questionId = toStringValue(rawQuestionId);
      if (!questionId || !uniqueQuestionIds.includes(questionId)) continue;

      const existing = metadataMap.get(questionId) ?? { question_id: questionId };
      metadataMap.set(questionId, {
        ...existing,
        part_type: partType,
      });
    }
  }

  return metadataMap;
};

const applyQuestionMetadataToAnswers = (
  answers: NormalizedTestAnswerV2[],
  metadataMap: Map<string, QuestionMetadata>
): {
  answers: NormalizedTestAnswerV2[];
  missingQuestionMetadataCount: number;
  missingIrtDifficultyCount: number;
  unmappedTags: string[];
  warnings: string[];
} => {
  const unmappedTags: string[] = [];
  const warnings: string[] = [];
  let missingQuestionMetadataCount = 0;
  let missingIrtDifficultyCount = 0;
  let missingPartTypeCount = 0;

  const enrichedAnswers = answers.map((answer) => {
    const metadata = metadataMap.get(answer.question_id);
    if (!metadata) {
      missingQuestionMetadataCount += 1;
      return {
        ...answer,
        skills: answer.skills ?? [],
        skill_keys: answer.skill_keys ?? [],
      };
    }

    // Question.tags là nguồn gốc raw skill; Group.part là nguồn ưu tiên cho part_type.
    const rawTags = metadata.raw_tags ?? [];
    const partType = metadata.part_type ?? answer.part_type;
    if (!partType) missingPartTypeCount += 1;
    if (metadata.irt_difficulty === undefined) missingIrtDifficultyCount += 1;

    const skills = normalizeToeicSkillTags(rawTags, partType);
    const mappedRawTags = new Set(skills.map((skill) => skill.raw_tag));
    for (const rawTag of rawTags) {
      if (!mappedRawTags.has(rawTag)) unmappedTags.push(rawTag);
    }

    return {
      ...answer,
      part_type: partType,
      // Rasch 1PL dùng irt_difficulty ở cấp question; Layer 2 mới tính ability.
      irt_difficulty: metadata.irt_difficulty,
      raw_tags: rawTags,
      skills,
      skill_keys: skills.map((skill) => skill.key),
    };
  });

  if (missingQuestionMetadataCount > 0) {
    warnings.push(
      `Không tìm thấy metadata cho ${missingQuestionMetadataCount} câu hỏi.`
    );
  }
  if (missingPartTypeCount > 0) {
    warnings.push(`Không xác định được part_type cho ${missingPartTypeCount} câu hỏi.`);
  }
  if (missingIrtDifficultyCount > 0) {
    warnings.push(
      `Không tìm thấy irt_difficulty cho ${missingIrtDifficultyCount} câu hỏi.`
    );
  }

  return {
    answers: enrichedAnswers,
    missingQuestionMetadataCount,
    missingIrtDifficultyCount,
    unmappedTags: uniqueStrings(unmappedTags),
    warnings,
  };
};

const enrichAnswersWithQuestionMetadata = async (
  result: NormalizedTestResultV2
): Promise<NormalizedTestResultV2> => {
  if (result.answers.length === 0) return result;

  const questionIds = result.answers.map((answer) => answer.question_id);
  const metadataMap = await loadQuestionMetadataByIds(questionIds, result.test_id);
  const enrichment = applyQuestionMetadataToAnswers(result.answers, metadataMap);
  const metadata = { ...result.metadata };

  if (enrichment.warnings.length > 0) {
    metadata.skill_enrichment_warnings = enrichment.warnings;
  }
  if (enrichment.unmappedTags.length > 0) {
    metadata.unmapped_tags = enrichment.unmappedTags;
  }
  if (enrichment.missingQuestionMetadataCount > 0) {
    metadata.missing_question_metadata_count =
      enrichment.missingQuestionMetadataCount;
  }
  if (enrichment.missingIrtDifficultyCount > 0) {
    metadata.missing_irt_difficulty_count =
      enrichment.missingIrtDifficultyCount;
  }

  return {
    ...result,
    answers: enrichment.answers,
    metadata,
  };
};

export const normalizeTestResult = async (
  input: NormalizeTestResultInput
): Promise<NormalizedTestResultV2> => {
  // Đây là core flow duy nhất của Layer 1.
  const defaultContext = getDefaultContextByTrigger(input.trigger_type);
  const rawInput: RawUserTestLikeInput = {
    ...input.raw_result,
    test_id: input.raw_result.test_id ?? input.test_id,
  };
  const result = buildNormalizedTestResult(rawInput, {
    trigger_type: input.trigger_type,
    user_id: input.user_id,
    fallback_test_type:
      input.default_test_type ?? defaultContext.fallback_test_type,
    source: input.source ?? defaultContext.source,
  });

  return enrichAnswersWithQuestionMetadata(result);
};
