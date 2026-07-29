import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import {
  Dictation,
  DictationPlan,
  DictationProgress,
} from "../models";
import { TestStatus } from "../models/enums/TestStatus";

process.env.DICTATION_AI_SKIP_GEMINI = "true";

type TestStatusName = "PASS" | "FAIL";

interface RuntimeTestResult {
  id: string;
  status: TestStatusName;
  evidence: string;
  error?: string;
}

const USER_ID = new Types.ObjectId("64f000000000000000000001");
const PREFIX = `AI_REC_RUNTIME_${Date.now()}`;
const results: RuntimeTestResult[] = [];

const buildRuntimeMongoUri = () => {
  if (process.env.DICTATION_AI_RUNTIME_MONGO_URI) {
    return process.env.DICTATION_AI_RUNTIME_MONGO_URI;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGO_URI or DICTATION_AI_RUNTIME_MONGO_URI");
  }

  const [base, query] = mongoUri.split("?");
  const slashIndex = base.lastIndexOf("/");
  if (slashIndex < 0) {
    throw new Error("MONGO_URI must include a database name for runtime tests");
  }

  const dbName = base.slice(slashIndex + 1) || "toeic-db";
  const runtimeBase = `${base.slice(0, slashIndex + 1)}${dbName}_ai_rec_runtime`;
  return query ? `${runtimeBase}?${query}` : runtimeBase;
};

const makeTitle = (caseId: string, label: string) => `${PREFIX}_${caseId}_${label}`;

const cleanupRuntimeData = async () => {
  const seededDictations = await Dictation.find({
    title: { $regex: `^${PREFIX}` },
  })
    .select("_id")
    .lean();
  const seededIds = seededDictations.map((item: any) => item._id);

  await Promise.all([
    DictationProgress.deleteMany({ user_id: USER_ID }),
    DictationPlan.deleteMany({ user_id: USER_ID }),
    seededIds.length
      ? Dictation.deleteMany({ _id: { $in: seededIds } })
      : Promise.resolve(),
  ]);
};

const createDictation = async (
  caseId: string,
  label: string,
  overrides: Record<string, unknown> = {},
) => {
  const dictation = await Dictation.create({
    title: makeTitle(caseId, label),
    transcript: "This is a runtime dictation test.",
    status: TestStatus.APPROVED,
    level: "A1",
    part_type: 1,
    tags: ["runtime", caseId],
    weight: 3,
    timings: [
      { text: "This is a runtime dictation test.", startTime: 0, endTime: 4 },
    ],
    display_mode: "sentence",
    ...overrides,
  });

  return dictation.toObject() as any;
};

const createProgress = async (
  dictationId: any,
  accuracy: number,
  options: {
    logs?: Record<string, unknown>[];
    avgDuration?: number;
    totalTime?: number;
    difficulty?: "easy" | "medium" | "hard";
  } = {},
) => {
  const logs =
    options.logs ??
    [
      {
        index: 0,
        accuracy,
        duration: options.avgDuration ?? 4,
        mistakes: [],
      },
    ];

  return DictationProgress.create({
    user_id: USER_ID,
    dictation_id: dictationId,
    status: "completed",
    difficulty: options.difficulty ?? "hard",
    current_index: logs.length - 1,
    completed_indices: logs.map((_, index) => index),
    attempt_logs: logs,
    summary: {
      accuracy,
      avgDuration: options.avgDuration,
      difficulty: options.difficulty ?? "hard",
      totalTime:
        options.totalTime ??
        logs.reduce((sum, log: any) => sum + Number(log.duration ?? 0), 0),
      logs,
    },
    completed_at: new Date(),
  });
};

const createPlan = async (
  dictationId: any,
  accuracy: number,
  totalAttempts: number,
) =>
  DictationPlan.create({
    user_id: USER_ID,
    dictation_id: dictationId,
    accuracy_overall: accuracy,
    total_attempts: totalAttempts,
  });

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const getFeedback = async (progressId: any) => {
  const { getDictationAIFeedbackService } = await import(
    "../services/dictation_ai_feedback.service"
  );
  return getDictationAIFeedbackService(progressId.toString(), USER_ID.toString());
};

const runCase = async (
  id: string,
  fn: () => Promise<string>,
) => {
  await cleanupRuntimeData();

  try {
    const evidence = await fn();
    results.push({ id, status: "PASS", evidence });
  } catch (error: any) {
    results.push({
      id,
      status: "FAIL",
      evidence: "Runtime assertion failed.",
      error: error?.message ?? String(error),
    });
  } finally {
    await cleanupRuntimeData();
  }
};

const recommendationTitles = (response: any) =>
  response.recommendations.map((item: any) => item.title).join(", ");

const hasReason = (item: any, pattern: RegExp) =>
  Array.isArray(item?.reasons) && item.reasons.some((reason: string) => pattern.test(reason));

const main = async () => {
  const mongoUri = buildRuntimeMongoUri();
  await mongoose.connect(mongoUri);

  await runCase("EVAL-01", async () => {
    const currentA = await createDictation("EVAL01A", "CURRENT");
    const progressA = await createProgress(currentA._id, 0.84);
    const responseA = await getFeedback(progressA._id);

    const currentB = await createDictation("EVAL01B", "CURRENT");
    const progressB = await createProgress(currentB._id, 84);
    const responseB = await getFeedback(progressB._id);

    assertCondition(responseA.summary.accuracy === 84, "0.84 did not normalize to 84");
    assertCondition(responseB.summary.accuracy === 84, "84 did not remain 84");
    return `accuracyA=${responseA.summary.accuracy}, accuracyB=${responseB.summary.accuracy}`;
  });

  await runCase("EVAL-02", async () => {
    const cases: Array<[number, string]> = [
      [45, "very_weak"],
      [60, "weak"],
      [70, "needs_practice"],
      [84, "developing"],
      [88, "good"],
      [95, "excellent"],
    ];
    const actual: string[] = [];

    for (const [accuracy, expectedBand] of cases) {
      const current = await createDictation(`EVAL02_${accuracy}`, "CURRENT");
      const progress = await createProgress(current._id, accuracy);
      const response = await getFeedback(progress._id);
      actual.push(`${accuracy}:${response.summary.performanceBand}`);
      assertCondition(
        response.summary.performanceBand === expectedBand,
        `${accuracy} expected ${expectedBand}, got ${response.summary.performanceBand}`,
      );
    }

    return actual.join(", ");
  });

  await runCase("EVAL-03", async () => {
    const current = await createDictation("EVAL03", "CURRENT", { timings: [] });
    const progress = await createProgress(current._id, 84, { avgDuration: 10 });
    const response = await getFeedback(progress._id);

    assertCondition(response.summary.speedStatus === "unknown", "speedStatus should be unknown");
    return `speedStatus=${response.summary.speedStatus}`;
  });

  await runCase("EVAL-04", async () => {
    const current = await createDictation("EVAL04", "CURRENT", {
      timings: [
        { text: "Slow sentence one.", startTime: 0, endTime: 4 },
        { text: "Slow sentence two.", startTime: 5, endTime: 9 },
        { text: "Slow sentence three.", startTime: 10, endTime: 14 },
      ],
    });
    const progress = await createProgress(current._id, 88, {
      logs: [
        { index: 0, accuracy: 88, duration: 65, mistakes: [] },
        { index: 1, accuracy: 88, duration: 65, mistakes: [] },
        { index: 2, accuracy: 88, duration: 65, mistakes: [] },
      ],
    });
    const response = await getFeedback(progress._id);

    assertCondition(
      ["slow", "slightly_slow"].includes(response.summary.speedStatus),
      `expected slow/slightly_slow, got ${response.summary.speedStatus}`,
    );
    assertCondition(response.summary.speedReliable === true, "expected reliable speed signal");
    assertCondition(
      response.summary.recommendationMode === "build_reflex",
      `expected build_reflex, got ${response.summary.recommendationMode}`,
    );
    return `speedStatus=${response.summary.speedStatus}, speedReliable=${response.summary.speedReliable}, mode=${response.summary.recommendationMode}`;
  });

  await runCase("EVAL-05", async () => {
    const current = await createDictation("EVAL05", "CURRENT");
    const progress = await createProgress(current._id, 70, {
      logs: [
        { index: 0, accuracy: 70, duration: 4, mistakes: ["the", "invoice"] },
        { index: 1, accuracy: 72, duration: 5, mistakes: ["The", "invoice."] },
      ],
    });
    const response = await getFeedback(progress._id);
    const mistakes = response.charts.frequentMistakes;
    const the = mistakes.find((item: any) => item.text === "the");
    const invoice = mistakes.find((item: any) => item.text === "invoice");

    assertCondition(the?.count === 2, "expected repeated mistake 'the' count 2");
    assertCondition(invoice?.count === 2, "expected repeated mistake 'invoice' count 2");
    return `frequentMistakes=${JSON.stringify(mistakes)}`;
  });

  await runCase("DIFF-RT-01", async () => {
    const current = await createDictation("DIFF01", "CURRENT", {
      tags: ["diff-hard"],
      part_type: 1,
      level: "A1",
      weight: 0.7,
    });
    await createDictation("DIFF01", "NEXT_HIGHER", {
      tags: ["diff-hard"],
      part_type: 1,
      level: "A1",
      weight: 0.78,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "hard" });
    const response = await getFeedback(progress._id);

    assertCondition(response.summary.rawPerformanceBand === "excellent", "raw band should be excellent");
    assertCondition(
      response.summary.adjustedPerformanceBand === "excellent",
      "hard adjusted band should be excellent",
    );
    assertCondition(response.summary.recommendationMode === "advance", "hard 100 should advance");
    return `difficulty=${response.summary.difficulty}, raw=${response.summary.rawPerformanceBand}, adjusted=${response.summary.adjustedPerformanceBand}, mode=${response.summary.recommendationMode}`;
  });

  await runCase("DIFF-RT-02", async () => {
    const current = await createDictation("DIFF02", "CURRENT", {
      tags: ["diff-medium"],
      part_type: 1,
      level: "A1",
      weight: 0.5,
    });
    await createDictation("DIFF02", "NEXT_MEDIUM", {
      tags: ["diff-medium"],
      part_type: 1,
      level: "A1",
      weight: 0.55,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "medium" });
    const response = await getFeedback(progress._id);

    assertCondition(response.summary.adjustedPerformanceBand === "excellent", "medium 100 should be excellent");
    assertCondition(
      response.summary.recommendationMode === "same_or_slightly_harder",
      `expected same_or_slightly_harder, got ${response.summary.recommendationMode}`,
    );
    return `difficulty=${response.summary.difficulty}, adjusted=${response.summary.adjustedPerformanceBand}, mode=${response.summary.recommendationMode}`;
  });

  await runCase("DIFF-RT-03", async () => {
    const current = await createDictation("DIFF03", "CURRENT", {
      tags: ["diff-easy"],
      part_type: 1,
      level: "A1",
      weight: 0.4,
    });
    await createDictation("DIFF03", "NEXT_EASY_TO_MEDIUM", {
      tags: ["diff-easy"],
      part_type: 1,
      level: "A1",
      weight: 0.45,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "easy" });
    const response = await getFeedback(progress._id);

    assertCondition(response.summary.rawPerformanceBand === "excellent", "easy raw band should be excellent");
    assertCondition(response.summary.adjustedPerformanceBand === "good", "easy 100 adjusted band should be good");
    assertCondition(
      response.summary.recommendationMode === "move_to_less_supported_mode",
      `expected move_to_less_supported_mode, got ${response.summary.recommendationMode}`,
    );
    assertCondition(
      response.recommendations[0]?.suggestedDifficulty === "medium",
      "easy 100 recommendation should suggest medium",
    );
    assertCondition(
      response.recommendations[0]?.dictationId === current._id.toString(),
      "easy 100 first recommendation should be the current dictation at medium",
    );
    return `raw=${response.summary.rawPerformanceBand}, adjusted=${response.summary.adjustedPerformanceBand}, mode=${response.summary.recommendationMode}, suggested=${response.recommendations[0]?.suggestedDifficulty}`;
  });

  await runCase("SPEED-RT-01", async () => {
    const current = await createDictation("SPEED01", "CURRENT", {
      tags: ["speed-one"],
      part_type: 1,
      level: "A1",
      weight: 0.6,
      timings: [{ text: "One slow sentence.", startTime: 0, endTime: 5 }],
    });
    await createDictation("SPEED01", "NEXT_HIGHER", {
      tags: ["speed-one"],
      part_type: 1,
      level: "A1",
      weight: 0.66,
    });
    const progress = await createProgress(current._id, 100, {
      difficulty: "hard",
      logs: [{ index: 0, accuracy: 100, duration: 60, mistakes: [] }],
    });
    const response = await getFeedback(progress._id);

    assertCondition(response.summary.speedReliable === false, "single sentence speed should not be reliable");
    assertCondition(
      response.summary.recommendationMode === "advance",
      `single slow sentence should not force reflex mode, got ${response.summary.recommendationMode}`,
    );
    assertCondition(
      response.warnings?.includes("SPEED_USED_AS_FEEDBACK_ONLY"),
      "expected speed feedback-only warning",
    );
    return `speedStatus=${response.summary.speedStatus}, reliable=${response.summary.speedReliable}, mode=${response.summary.recommendationMode}, warnings=${JSON.stringify(response.warnings ?? [])}`;
  });

  await runCase("SPEED-RT-02", async () => {
    const current = await createDictation("SPEED02", "CURRENT", {
      tags: ["speed-many"],
      part_type: 1,
      level: "A1",
      weight: 0.6,
      timings: [
        { text: "Slow sentence one.", startTime: 0, endTime: 4 },
        { text: "Slow sentence two.", startTime: 5, endTime: 9 },
        { text: "Slow sentence three.", startTime: 10, endTime: 14 },
      ],
    });
    await createDictation("SPEED02", "REFLEX_NEXT", {
      tags: ["speed-many"],
      part_type: 1,
      level: "A1",
      weight: 0.58,
    });
    const progress = await createProgress(current._id, 95, {
      difficulty: "hard",
      logs: [
        { index: 0, accuracy: 95, duration: 65, mistakes: [] },
        { index: 1, accuracy: 95, duration: 65, mistakes: [] },
        { index: 2, accuracy: 95, duration: 65, mistakes: [] },
      ],
    });
    const response = await getFeedback(progress._id);

    assertCondition(response.summary.speedReliable === true, "multi sentence slow speed should be reliable");
    assertCondition(response.summary.recommendationMode === "build_reflex", "expected build_reflex");
    assertCondition(
      response.recommendations[0]?.recommendationGoal === "build_reflex",
      "expected build_reflex recommendation goal",
    );
    return `speedStatus=${response.summary.speedStatus}, slowRate=${response.summary.slowSentenceRate}, mode=${response.summary.recommendationMode}, goal=${response.recommendations[0]?.recommendationGoal}`;
  });

  await runCase("GOAL-RT-01", async () => {
    const current = await createDictation("GOAL01", "CURRENT", {
      tags: ["goal-easy"],
      part_type: 1,
      level: "A1",
      weight: 0.4,
    });
    await createDictation("GOAL01", "GOAL_NEXT", {
      tags: ["goal-easy"],
      part_type: 1,
      level: "A1",
      weight: 0.45,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "easy" });
    const response = await getFeedback(progress._id);
    const first = response.recommendations[0];

    assertCondition(first.recommendationGoal === "move_to_less_supported_mode", "goal missing");
    assertCondition(first.suggestedDifficulty === "medium", "suggested difficulty should be medium");
    assertCondition(
      first.reasons.some((reason: string) => /medium|chính bài này|giảm mức hỗ trợ/.test(reason)),
      `expected meaningful Vietnamese reasons, got ${JSON.stringify(first.reasons)}`,
    );
    return `goal=${first.recommendationGoal}, suggested=${first.suggestedDifficulty}, reasons=${JSON.stringify(first.reasons)}`;
  });

  await runCase("EASY-MODE-RT-01", async () => {
    const current = await createDictation("EASYMODE01", "CURRENT", {
      tags: ["easy-mode"],
      part_type: 1,
      level: "A1",
      weight: 0.4,
    });
    await createDictation("EASYMODE01", "OTHER_HIGHER_EASY", {
      tags: ["easy-mode"],
      part_type: 1,
      level: "A1",
      weight: 0.48,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "easy" });
    const response = await getFeedback(progress._id);
    const first = response.recommendations[0];

    assertCondition(first.dictationId === current._id.toString(), "first card should be current dictation");
    assertCondition(first.suggestedDifficulty === "medium", "first card should suggest medium");
    assertCondition(
      first.recommendationGoal === "move_to_less_supported_mode",
      "first card should be mode transition goal",
    );
    return `first=${first.title}, suggested=${first.suggestedDifficulty}, goal=${first.recommendationGoal}`;
  });

  await runCase("EASY-MODE-RT-02", async () => {
    const current = await createDictation("EASYMODE02", "CURRENT", {
      tags: ["easy-mode-other"],
      part_type: 1,
      level: "A1",
      weight: 0.4,
    });
    const other = await createDictation("EASYMODE02", "OTHER_HIGHER_EASY", {
      tags: ["easy-mode-other"],
      part_type: 1,
      level: "A1",
      weight: 0.5,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "easy" });
    const response = await getFeedback(progress._id);
    const otherCard = response.recommendations.find((item: any) =>
      item.dictationId === other._id.toString(),
    );

    assertCondition(otherCard, "expected other same-tag recommendation");
    assertCondition(otherCard.suggestedDifficulty === "easy", "other card should stay easy");
    assertCondition(
      otherCard.recommendationGoal === "same_level_stabilization",
      "other card should stabilize at same mode",
    );
    return `other=${otherCard.title}, suggested=${otherCard.suggestedDifficulty}, goal=${otherCard.recommendationGoal}`;
  });

  await runCase("EASY-MODE-RT-03", async () => {
    const current = await createDictation("EASYMODE03", "CURRENT", {
      tags: ["easy-mode-duplicate"],
      part_type: 1,
      level: "A1",
      weight: 0.4,
    });
    await createDictation("EASYMODE03", "OTHER_A", {
      tags: ["easy-mode-duplicate"],
      part_type: 1,
      level: "A1",
      weight: 0.42,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "easy" });
    const response = await getFeedback(progress._id);
    const currentCount = response.recommendations.filter((item: any) =>
      item.dictationId === current._id.toString(),
    ).length;

    assertCondition(currentCount === 1, `current dictation duplicated ${currentCount} times`);
    return `currentCount=${currentCount}, recommendations=${recommendationTitles(response)}`;
  });

  await runCase("EASY-MODE-RT-04", async () => {
    const current = await createDictation("EASYMODE04", "CURRENT", {
      tags: ["easy-mode-mixed"],
      part_type: 1,
      level: "A1",
      weight: 0.4,
    });
    await createDictation("EASYMODE04", "OTHER_A", {
      tags: ["easy-mode-mixed"],
      part_type: 1,
      level: "A1",
      weight: 0.45,
    });
    await createDictation("EASYMODE04", "OTHER_B", {
      tags: ["easy-mode-mixed"],
      part_type: 1,
      level: "A1",
      weight: 0.5,
    });
    const progress = await createProgress(current._id, 100, { difficulty: "easy" });
    const response = await getFeedback(progress._id);
    const suggestedDifficulties = response.recommendations.map((item: any) => item.suggestedDifficulty);

    assertCondition(
      suggestedDifficulties.includes("medium") && suggestedDifficulties.includes("easy"),
      `expected mixed medium/easy suggestions, got ${suggestedDifficulties.join(",")}`,
    );
    assertCondition(
      !response.recommendations.every((item: any) => item.suggestedDifficulty === "medium"),
      "not every recommendation should be medium",
    );
    return `suggested=${suggestedDifficulties.join(",")}`;
  });

  await runCase("REC-RT-01", async () => {
    const current = await createDictation("REC01", "CURRENT", {
      tags: ["strict-tag", "shared"],
      part_type: 1,
    });
    const approved = await createDictation("REC01", "APPROVED_STRICT", {
      tags: ["strict-tag", "shared"],
      part_type: 1,
    });
    await createDictation("REC01", "DRAFT_STRICT", {
      tags: ["strict-tag", "shared"],
      part_type: 1,
      status: TestStatus.DRAFT,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const ids = response.recommendations.map((item: any) => item.dictationId);

    assertCondition(ids.includes(approved._id.toString()), "approved strict candidate missing");
    assertCondition(
      response.recommendations.every((item: any) => !item.title.includes("DRAFT_STRICT")),
      "draft candidate leaked into recommendations",
    );
    return `recommendations=${recommendationTitles(response)}`;
  });

  await runCase("REC-RT-02", async () => {
    const current = await createDictation("REC02", "CURRENT", {
      tags: ["no-part-fallback-tag-match"],
      part_type: 1,
    });
    await createDictation("REC02", "SAME_PART", {
      tags: ["different-tag"],
      part_type: 1,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);

    assertCondition(
      response.warnings?.includes("NO_STRICT_MATCH_FOUND_USED_SAME_PART_FALLBACK"),
      `same_part fallback warning missing; warnings=${JSON.stringify(response.warnings ?? [])}`,
    );
    return `warnings=${JSON.stringify(response.warnings ?? [])}, recommendations=${recommendationTitles(response)}`;
  });

  await runCase("REC-RT-03", async () => {
    const current = await createDictation("REC03", "CURRENT", {
      tags: ["same-level-current"],
      part_type: 1,
      level: "A1",
    });
    const sameLevel = await createDictation("REC03", "SAME_LEVEL", {
      tags: ["different-tag"],
      part_type: 2,
      level: "A1",
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);

    assertCondition(
      response.recommendations.some((item: any) => item.dictationId === sameLevel._id.toString()),
      "same level candidate missing",
    );
    assertCondition(
      response.warnings?.includes("NO_PART_MATCH_FOUND_USED_SAME_LEVEL_FALLBACK"),
      "same level fallback warning missing",
    );
    return `warnings=${JSON.stringify(response.warnings ?? [])}, recommendations=${recommendationTitles(response)}`;
  });

  await runCase("REC-RT-04", async () => {
    const current = await createDictation("REC04", "CURRENT", {
      tags: ["nearest-current"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    const nearest = await createDictation("REC04", "NEAREST_WEIGHT", {
      tags: ["different-tag-a"],
      part_type: 2,
      level: "B2",
      weight: 4,
    });
    await createDictation("REC04", "FAR_WEIGHT", {
      tags: ["different-tag-b"],
      part_type: 3,
      level: "C1",
      weight: 9,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);

    assertCondition(
      response.recommendations[0]?.dictationId === nearest._id.toString(),
      `nearest weight candidate not first: ${recommendationTitles(response)}`,
    );
    assertCondition(
      response.warnings?.includes("NO_LEVEL_MATCH_FOUND_USED_NEAREST_WEIGHT_FALLBACK"),
      "nearest weight fallback warning missing",
    );
    return `warnings=${JSON.stringify(response.warnings ?? [])}, top=${response.recommendations[0]?.title}`;
  });

  await runCase("REC-RT-05", async () => {
    const current = await createDictation("REC05", "CURRENT");
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);

    assertCondition(response.recommendations.length === 1, "expected only retry current");
    assertCondition(response.recommendations[0].action === "retry_dictation", "expected retry action");
    assertCondition(
      response.warnings?.includes("NO_OTHER_APPROVED_DICTATION_USED_RETRY_CURRENT"),
      "retry fallback warning missing",
    );
    return `recommendation=${response.recommendations[0].title}, warnings=${JSON.stringify(response.warnings ?? [])}`;
  });

  await runCase("REC-RT-06", async () => {
    const current = await createDictation("REC06", "CURRENT", { tags: ["low-score"] });
    await createDictation("REC06", "NEXT_A", { tags: ["low-score"] });
    await createDictation("REC06", "NEXT_B", { tags: ["low-score"] });
    await createDictation("REC06", "NEXT_C", { tags: ["low-score"] });
    const progress = await createProgress(current._id, 45);
    const response = await getFeedback(progress._id);

    assertCondition(response.recommendations.length <= 3, "expected max 3 recommendations");
    assertCondition(response.recommendations[0].action === "retry_dictation", "retry should be first");
    assertCondition(
      new Set(response.recommendations.map((item: any) => item.dictationId)).size ===
        response.recommendations.length,
      "duplicate recommendation ids found",
    );
    return `recommendations=${recommendationTitles(response)}`;
  });

  await runCase("REC-RT-08", async () => {
    const current = await createDictation("REC08", "CURRENT", {
      tags: [],
      part_type: undefined,
      weight: undefined,
    });
    await createDictation("REC08", "MISSING_FIELDS", {
      tags: undefined,
      part_type: undefined,
      weight: undefined,
      level: "A1",
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);

    assertCondition(response.recommendations.length >= 1, "expected recommendation despite missing fields");
    return `recommendations=${recommendationTitles(response)}`;
  });

  await runCase("SCORE-RT-01", async () => {
    const current = await createDictation("SCORE01", "CURRENT", {
      tags: ["daily", "basic", "short"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE01", "OVERLAP_3", {
      tags: ["daily", "basic", "short"],
      part_type: 2,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE01", "OVERLAP_1", {
      tags: ["daily"],
      part_type: 2,
      level: "A1",
      weight: 3,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const overlap3 = response.recommendations.find((item: any) => item.title.includes("OVERLAP_3"));
    const overlap1 = response.recommendations.find((item: any) => item.title.includes("OVERLAP_1"));

    assertCondition(overlap3 && overlap1, "overlap candidates missing");
    assertCondition(overlap3.score > overlap1.score, "overlap 3 should score above overlap 1");
    return `overlap3=${overlap3.score}, overlap1=${overlap1.score}`;
  });

  await runCase("SCORE-RT-02", async () => {
    const current = await createDictation("SCORE02", "CURRENT", {
      tags: ["same-part-score-current"],
      part_type: 1,
    });
    await createDictation("SCORE02", "SAME_PART", {
      tags: ["different-tag"],
      part_type: 1,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const samePart = response.recommendations.find((item: any) => item.title.includes("SAME_PART"));

    assertCondition(samePart, "same part recommendation missing");
    assertCondition(hasReason(samePart, /Cùng dạng luyện tập/), "same part reason missing");
    return `score=${samePart.score}, reasons=${JSON.stringify(samePart.reasons)}`;
  });

  await runCase("SCORE-RT-03", async () => {
    const current = await createDictation("SCORE03", "CURRENT", {
      tags: ["level-score-current"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE03", "LEVEL_A1", {
      tags: ["level-score-current"],
      part_type: 2,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE03", "LEVEL_A2", {
      tags: ["level-score-current"],
      part_type: 2,
      level: "A2",
      weight: 3,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const sameLevel = response.recommendations.find((item: any) => item.title.includes("LEVEL_A1"));
    const nextLevel = response.recommendations.find((item: any) => item.title.includes("LEVEL_A2"));

    assertCondition(sameLevel && nextLevel, "level candidates missing");
    assertCondition(sameLevel.score > nextLevel.score, "same level should score above one-level diff");
    return `sameLevel=${sameLevel.score}, nextLevel=${nextLevel.score}`;
  });

  await runCase("SCORE-RT-04", async () => {
    const current = await createDictation("SCORE04", "CURRENT", {
      tags: ["weight-score-current"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE04", "WEIGHT_3", {
      tags: ["weight-score-current"],
      part_type: 2,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE04", "WEIGHT_6", {
      tags: ["weight-score-current"],
      part_type: 2,
      level: "A1",
      weight: 6,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const weight3 = response.recommendations.find((item: any) => item.title.includes("WEIGHT_3"));
    const weight6 = response.recommendations.find((item: any) => item.title.includes("WEIGHT_6"));

    assertCondition(weight3 && weight6, "weight candidates missing");
    assertCondition(weight3.score > weight6.score, "near weight should score above far weight");
    return `weight3=${weight3.score}, weight6=${weight6.score}`;
  });

  await runCase("SCORE-RT-05", async () => {
    const current = await createDictation("SCORE05", "CURRENT", {
      tags: ["history-score-current"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE05", "NEW_PLANLESS", {
      tags: ["history-score-current"],
      part_type: 2,
      level: "A1",
      weight: 3,
    });
    const mastered = await createDictation("SCORE05", "MASTERED", {
      tags: ["history-score-current"],
      part_type: 2,
      level: "A1",
      weight: 3,
    });
    await createPlan(mastered._id, 92, 2);
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const newItem = response.recommendations.find((item: any) => item.title.includes("NEW_PLANLESS"));
    const masteredItem = response.recommendations.find((item: any) => item.title.includes("MASTERED"));

    assertCondition(newItem && masteredItem, "history candidates missing");
    assertCondition(newItem.score > masteredItem.score, "new planless should score above mastered");
    return `new=${newItem.score}, mastered=${masteredItem.score}`;
  });

  await runCase("SCORE-RT-06", async () => {
    const current = await createDictation("SCORE06", "CURRENT", {
      tags: ["daily", "basic", "short"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE06", "CANDIDATE_A", {
      tags: ["daily", "basic", "short"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE06", "CANDIDATE_B", {
      tags: ["daily"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    const candidateC = await createDictation("SCORE06", "CANDIDATE_C", {
      tags: ["none"],
      part_type: 2,
      level: "A2",
      weight: 6,
    });
    await createPlan(candidateC._id, 92, 2);
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const a = response.recommendations.find((item: any) => item.title.includes("CANDIDATE_A"));
    const b = response.recommendations.find((item: any) => item.title.includes("CANDIDATE_B"));
    const c = response.recommendations.find((item: any) => item.title.includes("CANDIDATE_C"));

    assertCondition(a && b, "candidate A/B missing");
    assertCondition(a.score > b.score, "candidate A should score above B");
    if (c) assertCondition(b.score > c.score, "candidate B should score above C");
    return `ranking=${response.recommendations.map((item: any) => `${item.title}:${item.score}`).join(", ")}`;
  });

  await runCase("SCORE-RT-07", async () => {
    const current = await createDictation("SCORE07", "CURRENT", {
      tags: ["reason", "tag", "check"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE07", "REASON_TARGET", {
      tags: ["reason", "tag", "check"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const target = response.recommendations[0];

    assertCondition(hasReason(target, /tag trùng|cùng nhóm tag/i), "tag reason missing");
    assertCondition(hasReason(target, /Cùng dạng luyện tập/), "part reason missing");
    assertCondition(hasReason(target, /Level phù hợp/), "level reason missing");
    assertCondition(hasReason(target, /Độ nặng/), "weight reason missing");
    return `reasons=${JSON.stringify(target.reasons)}`;
  });

  await runCase("SCORE-RT-08", async () => {
    const current = await createDictation("SCORE08", "CURRENT", {
      tags: ["tie-break"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE08", "AAA_TIE", {
      tags: ["tie-break"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    await createDictation("SCORE08", "BBB_TIE", {
      tags: ["tie-break"],
      part_type: 1,
      level: "A1",
      weight: 3,
    });
    const progress = await createProgress(current._id, 84);
    const response = await getFeedback(progress._id);
    const tieItems = response.recommendations.filter((item: any) => item.title.includes("_TIE"));

    assertCondition(tieItems.length >= 2, "tie candidates missing");
    assertCondition(tieItems[0].title.includes("AAA_TIE"), "AAA_TIE should sort before BBB_TIE");
    return `tieOrder=${tieItems.map((item: any) => item.title).join(", ")}`;
  });

  await runCase("WEIGHT-RT-01", async () => {
    const current = await createDictation("WEIGHT01", "CURRENT", {
      tags: ["weight-advance"],
      part_type: 1,
      level: "A1",
      weight: 0.908,
    });
    await createDictation("WEIGHT01", "HIGH_095", {
      tags: ["weight-advance"],
      part_type: 1,
      level: "A1",
      weight: 0.95,
    });
    await createDictation("WEIGHT01", "LOW_045", {
      tags: ["weight-advance"],
      part_type: 1,
      level: "A1",
      weight: 0.45,
    });
    const progress = await createProgress(current._id, 100);
    const response = await getFeedback(progress._id);
    const high = response.recommendations.find((item: any) => item.title.includes("HIGH_095"));
    const low = response.recommendations.find((item: any) => item.title.includes("LOW_045"));

    assertCondition(high && low, "high/low weight candidates missing");
    assertCondition(high.score > low.score, "high weight candidate should score above low weight");
    assertCondition(
      response.recommendations[0].dictationId === high.dictationId,
      "high weight candidate should be first",
    );
    assertCondition(
      !hasReason(low, /Weight cao hon|Weight gan voi/i),
      "low fallback must not have positive weight reason",
    );
    return `high=${high.score}, low=${low.score}, top=${response.recommendations[0].title}`;
  });

  await runCase("WEIGHT-RT-02", async () => {
    const current = await createDictation("WEIGHT02", "CURRENT", {
      tags: ["weight-low-only"],
      part_type: 1,
      level: "A1",
      weight: 0.908,
    });
    await createDictation("WEIGHT02", "LOW_045", {
      tags: ["weight-low-only"],
      part_type: 1,
      level: "A1",
      weight: 0.45,
    });
    const progress = await createProgress(current._id, 100);
    const response = await getFeedback(progress._id);

    assertCondition(response.recommendations.length >= 1, "expected low fallback recommendation");
    assertCondition(
      response.warnings?.includes("USED_LOW_WEIGHT_FALLBACK_IN_ADVANCE_MODE"),
      "expected low-weight fallback warning",
    );
    assertCondition(
      hasReason(response.recommendations[0], /Chưa tìm thấy đủ bài có weight gần hoặc cao hơn/),
      "expected low fallback reason",
    );
    assertCondition(
      /tạm gợi ý bài liên quan/.test(response.feedback.overall),
      "feedback should explain related-practice fallback instead of stronger challenge",
    );
    return `warnings=${JSON.stringify(response.warnings ?? [])}, overall=${response.feedback.overall}`;
  });

  await runCase("WEIGHT-RT-03", async () => {
    const current = await createDictation("WEIGHT03", "CURRENT", {
      tags: ["weight-tag-a", "weight-tag-b", "weight-tag-c"],
      part_type: 1,
      level: "A1",
      weight: 0.908,
    });
    await createDictation("WEIGHT03", "HIGH_FEWER_TAGS_095", {
      tags: [],
      part_type: 1,
      level: "A1",
      weight: 0.95,
    });
    await createDictation("WEIGHT03", "LOW_MORE_TAGS_025", {
      tags: ["weight-tag-a", "weight-tag-b", "weight-tag-c"],
      part_type: 1,
      level: "A1",
      weight: 0.25,
    });
    const progress = await createProgress(current._id, 100);
    const response = await getFeedback(progress._id);
    const high = response.recommendations.find((item: any) =>
      item.title.includes("HIGH_FEWER_TAGS_095"),
    );
    const low = response.recommendations.find((item: any) =>
      item.title.includes("LOW_MORE_TAGS_025"),
    );

    assertCondition(high && low, "high/low tag-vs-weight candidates missing");
    assertCondition(
      response.recommendations[0].dictationId === high.dictationId,
      `high weight candidate should beat low weight tag match: ${recommendationTitles(response)}`,
    );
    assertCondition(high.score > low.score, "high weight candidate should score above low tag match");
    assertCondition(
      new Set(response.recommendations.map((item: any) => item.dictationId)).size ===
        response.recommendations.length,
      "weight recommendation ids should not duplicate across deferred fallback tiers",
    );
    return `high=${high.score}, low=${low.score}, order=${recommendationTitles(response)}`;
  });

  const passCount = results.filter((result) => result.status === "PASS").length;
  const failCount = results.filter((result) => result.status === "FAIL").length;

  console.log("\nDictation AI runtime check results");
  console.log(`Mongo database: ${mongoose.connection.name}`);
  console.log(`Seed prefix: ${PREFIX}`);
  console.log(`PASS=${passCount} FAIL=${failCount}`);
  for (const result of results) {
    const suffix = result.status === "PASS" ? result.evidence : result.error;
    console.log(`[${result.status}] ${result.id}: ${suffix}`);
  }

  if (failCount > 0) {
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error("Dictation AI runtime check failed before completing cases.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupRuntimeData().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
  });
