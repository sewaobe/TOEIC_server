import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import { ChatMessage } from "../src/models/chat_message.model";
import { ChatSession } from "../src/models/chat_session.model";
import {
  processDbFirstMessageService,
  routeChatMessage,
} from "../src/services/chat_db_first.service";
import {
  CHATBOT_OUTPUT_CONTEXTS,
  CHATBOT_OUTPUT_REGRESSION_CASES,
  ChatbotOutputRegressionCase,
  ChatbotOutputSeverity,
  FabricationGuard,
} from "../src/services/chatbot_output_regression_cases.data";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPORT_DIR = path.resolve(__dirname, "../../doc/docs/chatbot/output-check");
const REPORT_FILES = {
  summary: path.join(REPORT_DIR, "chatbot-output-summary.json"),
  passed: path.join(REPORT_DIR, "chatbot-output-passed.json"),
  failed: path.join(REPORT_DIR, "chatbot-output-failed.json"),
  markdown: path.join(REPORT_DIR, "chatbot-output-report.md"),
};

const RUNNER_TAG = "chatbot-output-regression";
const INCLUDE_AI = process.env.CHATBOT_OUTPUT_INCLUDE_AI === "1";
const FULL = process.env.CHATBOT_OUTPUT_FULL === "1";

const GLOBAL_FORBIDDEN_TERMS = [
  "Chroma",
  "router",
  "rerank",
  "intent",
  "resolver",
  "prompt",
  "Gemini prompt",
  "questionId",
  "attemptId",
  "testId",
  "ObjectId",
  "undefined",
  "null",
  "stack trace",
  "missing context",
  "missing questionId",
  "semantic",
];

type AssertionFailure = {
  code: string;
  message: string;
  severity: ChatbotOutputSeverity;
};

type OutputResult = {
  id: string;
  group: string;
  input: string;
  contextType: string;
  expectedIntent?: string;
  actualIntent?: string;
  expectedDecisionKind?: string;
  actualDecisionKind?: string;
  responseText: string;
  model?: string;
  usedAI?: boolean;
  contextTypeMeta?: string;
  actions: Array<Record<string, unknown>>;
  passed: boolean;
  maxSeverity?: ChatbotOutputSeverity;
  failures: AssertionFailure[];
  routing?: unknown;
  flowTrace?: unknown;
  notes?: string;
};

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

function includesAny(text: string, terms: string[]) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function includesTerm(text: string, term: string) {
  return normalizeText(text).includes(normalizeText(term));
}

function severityRank(severity: ChatbotOutputSeverity) {
  if (severity === "critical") return 3;
  if (severity === "major") return 2;
  return 1;
}

function maxSeverity(failures: AssertionFailure[]) {
  return failures
    .map((failure) => failure.severity)
    .sort((a, b) => severityRank(b) - severityRank(a))[0];
}

function addFailure(
  failures: AssertionFailure[],
  code: string,
  message: string,
  severity: ChatbotOutputSeverity = "major"
) {
  failures.push({ code, message, severity });
}

function actionTypes(actions: Array<Record<string, unknown>>) {
  return actions.map((action) => String(action.type ?? ""));
}

function actionLabels(actions: Array<Record<string, unknown>>) {
  return actions.map((action) => String(action.label ?? ""));
}

function getPathValue(value: any, pathValue: string) {
  return pathValue.split(".").reduce((current, key) => current?.[key], value);
}

function actionHasPayloadKey(action: Record<string, unknown>, key: string) {
  return getPathValue((action as any).payload, key) !== undefined;
}

function findActionByLabel(actions: Array<Record<string, unknown>>, labels: string[]) {
  return actions.find((action) =>
    labels.some((label) => includesTerm(String(action.label ?? ""), label))
  );
}

function assertFabricationGuard(
  text: string,
  guard: FabricationGuard | undefined,
  failures: AssertionFailure[]
) {
  if (!guard) return;
  const normalized = normalizeText(text);

  if (
    guard.scores &&
    /(\b\d{2,3}\s*\/\s*\d{2,3}\b|\b\d{2,3}\s*(diem|points?)\b|\bscore\s*(is|la)?\s*\d{2,3}\b)/i.test(text)
  ) {
    addFailure(failures, "FABRICATED_SCORE", "Response appears to invent a score.", "critical");
  }

  if (
    guard.wrongQuestionCount &&
    /\b(sai|wrong|incorrect)\s+\d{1,3}\s+(cau|questions?)\b/i.test(normalized)
  ) {
    addFailure(
      failures,
      "FABRICATED_WRONG_COUNT",
      "Response appears to invent a wrong-question count.",
      "critical"
    );
  }

  if (
    guard.weakParts &&
    /\b(part|phan)\s*[1-7]\b.*\b(yeu|kem|sai nhieu|weak)\b/i.test(normalized)
  ) {
    addFailure(failures, "FABRICATED_WEAK_PART", "Response appears to invent weak TOEIC parts.", "critical");
  }

  if (
    guard.questionAnswer &&
    /\b(dap an dung|correct answer|chon)\s*(la)?\s*[abcd]\b/i.test(normalized)
  ) {
    addFailure(
      failures,
      "FABRICATED_QUESTION_ANSWER",
      "Response appears to invent a question answer.",
      "critical"
    );
  }

  if (
    guard.roadmapStage &&
    /\b(cycle|stage|session)\s*\d{1,2}\b/i.test(text) &&
    !/\bchua|khong co|can|mo|chon\b/i.test(normalized)
  ) {
    addFailure(
      failures,
      "FABRICATED_ROADMAP_STAGE",
      "Response appears to invent a roadmap stage.",
      "critical"
    );
  }

  if (
    guard.flashcardStatus &&
    /\b(mastered|due|den han|sap quen|da luu|da tao)\b/i.test(normalized) &&
    /\b\d{1,3}\b/.test(normalized)
  ) {
    addFailure(
      failures,
      "FABRICATED_FLASHCARD_STATUS",
      "Response appears to invent flashcard status/count.",
      "critical"
    );
  }
}

function assertCase(
  testCase: ChatbotOutputRegressionCase,
  params: {
    responseText: string;
    meta: any;
    decisionKind?: string;
  }
) {
  const failures: AssertionFailure[] = [];
  const text = params.responseText ?? "";
  const meta = params.meta ?? {};
  const actions = Array.isArray(meta.actions) ? meta.actions : [];

  if (testCase.expectedIntent && meta.intent !== testCase.expectedIntent) {
    addFailure(
      failures,
      "INTENT_MISMATCH",
      `Expected intent ${testCase.expectedIntent} but got ${meta.intent ?? "unknown"}.`,
      testCase.severity ?? "major"
    );
  }

  if (
    testCase.expectedDecisionKind &&
    params.decisionKind !== testCase.expectedDecisionKind
  ) {
    addFailure(
      failures,
      "DECISION_MISMATCH",
      `Expected decision ${testCase.expectedDecisionKind} but got ${params.decisionKind ?? "unknown"}.`,
      testCase.severity ?? "major"
    );
  }

  if (!text.trim()) {
    addFailure(failures, "EMPTY_RESPONSE", "Response text is empty.", "critical");
  }

  if (testCase.contract?.maxLength && text.length > testCase.contract.maxLength) {
    addFailure(
      failures,
      "TOO_LONG",
      `Response length ${text.length} exceeds ${testCase.contract.maxLength}.`,
      "minor"
    );
  }

  if (testCase.contract?.forbidInternalTerms) {
    for (const term of GLOBAL_FORBIDDEN_TERMS) {
      if (includesTerm(text, term)) {
        addFailure(failures, "INTERNAL_LEAKAGE", `Response leaks internal term: ${term}.`, "critical");
      }
    }
  }

  if (testCase.contract?.requireUsedAI && meta.usedAI !== true) {
    addFailure(failures, "AI_NOT_USED", "Expected AI response but meta.usedAI is not true.", "major");
  }

  if (testCase.contract?.forbidUsedAI && meta.usedAI === true) {
    addFailure(failures, "AI_UNEXPECTED", "Expected non-AI response but meta.usedAI is true.", "major");
  }

  if (testCase.contract?.requireNoActions && actions.length > 0) {
    addFailure(failures, "ACTIONS_UNEXPECTED", "Expected no actions but response has actions.", "major");
  }

  for (const requiredType of testCase.contract?.requireActions ?? []) {
    if (!actionTypes(actions).includes(requiredType)) {
      addFailure(failures, "ACTION_MISSING", `Missing required action type ${requiredType}.`, "major");
    }
  }

  const anyActionTypes = testCase.contract?.requireAnyActionTypes ?? [];
  if (anyActionTypes.length && !actionTypes(actions).some((type) => anyActionTypes.includes(type))) {
    addFailure(
      failures,
      "ACTION_ANY_MISSING",
      `Expected at least one action type among ${anyActionTypes.join(", ")}.`,
      "major"
    );
  }

  for (const forbiddenType of testCase.contract?.forbidActionTypes ?? []) {
    if (actionTypes(actions).includes(forbiddenType)) {
      addFailure(failures, "ACTION_FORBIDDEN", `Forbidden action type was present: ${forbiddenType}.`, "major");
    }
  }

  const requiredLabels = testCase.contract?.requireActionLabelsAny ?? [];
  if (
    requiredLabels.length &&
    !actionLabels(actions).some((label) => requiredLabels.some((expected) => includesTerm(label, expected)))
  ) {
    addFailure(
      failures,
      "ACTION_LABEL_MISSING",
      `Expected at least one action label among ${requiredLabels.join(", ")}.`,
      "major"
    );
  }

  const forbiddenLabels = testCase.contract?.forbidActionLabelsAny ?? [];
  for (const forbiddenLabel of forbiddenLabels) {
    const normalizedForbiddenLabel = normalizeText(forbiddenLabel);
    if (actionLabels(actions).some((label) => normalizeText(label) === normalizedForbiddenLabel)) {
      addFailure(
        failures,
        "ACTION_LABEL_FORBIDDEN",
        `Forbidden action label was present: ${forbiddenLabel}.`,
        "major"
      );
    }
  }

  const payloadKeys = testCase.contract?.requireActionPayloadKeys ?? [];
  if (payloadKeys.length) {
    const nonManualActions = actions.filter((action: Record<string, unknown>) => !getPathValue(action, "payload.manualInput"));
    for (const key of payloadKeys) {
      if (!nonManualActions.some((action: Record<string, unknown>) => actionHasPayloadKey(action, key))) {
        addFailure(failures, "ACTION_PAYLOAD_MISSING", `Missing action payload key ${key}.`, "major");
      }
    }
  }

  for (const payloadMatch of testCase.contract?.requireActionPayloadMatches ?? []) {
    const matchingAction = actions.find((action: Record<string, unknown>) =>
      includesTerm(String(action.label ?? ""), payloadMatch.labelIncludes)
    );
    if (!matchingAction) {
      addFailure(
        failures,
        "ACTION_PAYLOAD_MATCH_LABEL_MISSING",
        `Could not find action label ${payloadMatch.labelIncludes} for payload assertion.`,
        "major"
      );
      continue;
    }

    for (const [pathValue, expectedValue] of Object.entries(payloadMatch.values)) {
      const actualValue = getPathValue((matchingAction as any).payload, pathValue);
      if (actualValue !== expectedValue) {
        addFailure(
          failures,
          "ACTION_PAYLOAD_VALUE_MISMATCH",
          `Action ${payloadMatch.labelIncludes} expected payload ${pathValue}=${String(expectedValue)} but got ${String(actualValue)}.`,
          "major"
        );
      }
    }
  }

  const expectedOrder = testCase.contract?.requireActionOrder ?? [];
  if (expectedOrder.length) {
    let lastIndex = -1;
    for (const labelCue of expectedOrder) {
      const index = actionLabels(actions).findIndex((label, actionIndex) => {
        return actionIndex > lastIndex && includesTerm(label, labelCue);
      });
      if (index < 0) {
        addFailure(failures, "ACTION_ORDER_MISSING", `Missing ordered action label cue ${labelCue}.`, "major");
        break;
      }
      lastIndex = index;
    }
  }

  if (testCase.contract?.requireManualActionLast) {
    const manualIndex = actions.findIndex((action: Record<string, unknown>) => getPathValue(action, "payload.manualInput") === true);
    if (manualIndex < 0) {
      addFailure(failures, "MANUAL_ACTION_MISSING", "Expected a manual clarify action.", "major");
    } else if (manualIndex !== actions.length - 1) {
      addFailure(failures, "MANUAL_ACTION_ORDER", "Manual clarify action should be last.", "major");
    }
  }

  const quality = testCase.quality;
  if (quality?.mustIncludeAny?.length && !includesAny(text, quality.mustIncludeAny)) {
    addFailure(
      failures,
      "MISSING_EXPECTED_CONTENT",
      `Response does not include any expected content cue: ${quality.mustIncludeAny.join(", ")}.`,
      "major"
    );
  }

  for (const term of quality?.mustNotInclude ?? []) {
    if (includesTerm(text, term)) {
      addFailure(failures, "FORBIDDEN_CONTENT", `Response includes forbidden term: ${term}.`, "major");
    }
  }

  if (
    quality?.mustAskClarification &&
    !includesAny(text, ["chon", "cau nao", "bai nao", "lam ro", "gui them", "phu hop"])
  ) {
    addFailure(failures, "NO_CLARIFICATION", "Response should ask user to clarify/select context.", "major");
  }

  if (
    quality?.mustRefuseOutOfScope &&
    !includesAny(text, ["chi ho tro", "TOEIC", "he thong", "khong ho tro"])
  ) {
    addFailure(failures, "NO_OUT_OF_SCOPE_REFUSAL", "Response should refuse or redirect out-of-scope query.", "major");
  }

  assertFabricationGuard(text, quality?.forbidFabrication, failures);

  return failures;
}

function safeFallbackText(reason?: string) {
  if (reason === "semantic_router_unavailable") {
    return "Chatbot dang tam thoi gap loi. Ban vui long thu lai sau.";
  }
  if (reason === "outside_toeic_scope") {
    return "Minh chi ho tro cac cau hoi lien quan TOEIC, tieng Anh hoc TOEIC va viec hoc trong he thong nay.";
  }
  return "Minh chua xac dinh duoc yeu cau du ro de xu ly an toan. Ban co the hoi cu the ve cau sai, bai test, tien do hoac kien thuc TOEIC.";
}

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required for chatbot output regression.");
  await mongoose.connect(uri);
}

async function createSession(testCase: ChatbotOutputRegressionCase) {
  const userId = new Types.ObjectId();
  const session = await ChatSession.create({
    user_id: userId,
    title: `Output regression ${testCase.id}`,
    type: "question",
    metadata: {
      runner: RUNNER_TAG,
      caseId: testCase.id,
      createdAt: new Date().toISOString(),
    },
  });
  return { userId: String(userId), sessionId: String(session._id) };
}

async function executeChatTurn(params: {
  testCase: ChatbotOutputRegressionCase;
  sessionId: string;
  userId: string;
  userText: string;
  routeContext: any;
}) {
  await ChatMessage.create({
    session_id: params.sessionId,
    sender: "user",
    text: params.userText,
    meta: {
      runner: RUNNER_TAG,
      caseId: params.testCase.id,
      routeContext: params.routeContext,
    },
  });

  const routing = await routeChatMessage({
    userText: params.userText,
    routeContext: params.routeContext,
  });

  let responseText = "";
  let meta: any = {};

  if (routing.decision.kind === "safe_fallback") {
    responseText = safeFallbackText(routing.decision.reason);
    meta = {
      model: "router-safe-fallback",
      intent: "safe_fallback",
      usedAI: false,
      actions: [],
      routing: {
        ...routing.diagnostics,
        decision: routing.decision.kind,
        scope: routing.scope,
        intent: routing.intent,
        slots: routing.slots,
        resolverPolicy: routing.resolverPolicy,
        reasonCodes: routing.reasonCodes,
      },
    };
  } else {
    const { botMessage } = await processDbFirstMessageService({
      sessionId: params.sessionId,
      userId: params.userId,
      userText: params.userText,
      routeContext: params.routeContext,
      routing,
    });
    responseText = String(botMessage.text ?? "");
    meta = botMessage.meta ?? {};
  }

  return { responseText, meta, routing };
}

async function runClickClarifyFlow(params: {
  testCase: ChatbotOutputRegressionCase;
  sessionId: string;
  userId: string;
  initialMeta: any;
}) {
  const flow = params.testCase.flow;
  const failures: AssertionFailure[] = [];
  if (!flow || flow.kind !== "clickClarifyOption") {
    return { failures, trace: undefined };
  }

  const actions = Array.isArray(params.initialMeta.actions)
    ? params.initialMeta.actions
    : [];
  const action = findActionByLabel(actions, flow.clickLabelIncludesAny);
  if (!action) {
    addFailure(
      failures,
      "CLICK_ACTION_NOT_FOUND",
      `Could not find clarify action label among ${flow.clickLabelIncludesAny.join(", ")}.`,
      "critical"
    );
    return { failures, trace: { actionLabels: actionLabels(actions) } };
  }

  const selectedRouteContext = getPathValue(action, "payload.selectedRouteContext");
  if (selectedRouteContext?.questionId !== flow.expectedSelectedQuestionId) {
    addFailure(
      failures,
      "CLICK_SELECTED_CONTEXT_MISMATCH",
      `Expected selected questionId ${flow.expectedSelectedQuestionId} but got ${selectedRouteContext?.questionId ?? "none"}.`,
      "critical"
    );
  }

  const originalUserText =
    String(getPathValue(action, "payload.originalUserText") ?? params.testCase.input);
  const followup = await executeChatTurn({
    testCase: params.testCase,
    sessionId: params.sessionId,
    userId: params.userId,
    userText: originalUserText,
    routeContext: selectedRouteContext,
  });

  if (followup.meta?.intent !== flow.expectedFollowupIntent) {
    addFailure(
      failures,
      "CLICK_FOLLOWUP_INTENT_MISMATCH",
      `Expected follow-up intent ${flow.expectedFollowupIntent} but got ${followup.meta?.intent ?? "unknown"}.`,
      "critical"
    );
  }

  if (flow.forbiddenFollowupDecisionKinds?.includes(followup.routing.decision.kind)) {
    addFailure(
      failures,
      "CLICK_FOLLOWUP_CLARIFIED_AGAIN",
      `Follow-up decision should not be ${followup.routing.decision.kind}.`,
      "critical"
    );
  }

  const reasonCodes = followup.routing.reasonCodes ?? [];
  for (const forbiddenReason of flow.forbidReasonCodesAny ?? []) {
    if (reasonCodes.includes(forbiddenReason)) {
      addFailure(
        failures,
        "CLICK_FORBIDDEN_REASON_CODE",
        `Follow-up emitted forbidden reason code ${forbiddenReason}.`,
        "critical"
      );
    }
  }

  if (followup.meta?.routeContext?.questionId !== flow.expectedSelectedQuestionId) {
    addFailure(
      failures,
      "CLICK_META_CONTEXT_MISMATCH",
      `Expected follow-up meta routeContext.questionId ${flow.expectedSelectedQuestionId} but got ${followup.meta?.routeContext?.questionId ?? "none"}.`,
      "critical"
    );
  }

  return {
    failures,
    trace: {
      clickedAction: action,
      followupDecisionKind: followup.routing.decision.kind,
      followupIntent: followup.meta?.intent,
      followupReasonCodes: reasonCodes,
      followupRouteContext: followup.meta?.routeContext,
      followupResponseText: followup.responseText,
    },
  };
}

async function runCase(testCase: ChatbotOutputRegressionCase): Promise<OutputResult> {
  const context = CHATBOT_OUTPUT_CONTEXTS[testCase.contextType];
  const { userId, sessionId } = await createSession(testCase);
  const turn = await executeChatTurn({
    testCase,
    sessionId,
    userId,
    userText: testCase.input,
    routeContext: context.routeContext,
  });

  const failures = assertCase(testCase, {
    responseText: turn.responseText,
    meta: turn.meta,
    decisionKind: turn.routing.decision.kind,
  });
  const flowResult = await runClickClarifyFlow({
    testCase,
    sessionId,
    userId,
    initialMeta: turn.meta,
  });
  failures.push(...flowResult.failures);

  return {
    id: testCase.id,
    group: testCase.group,
    input: testCase.input,
    contextType: testCase.contextType,
    expectedIntent: testCase.expectedIntent,
    actualIntent: turn.meta.intent,
    expectedDecisionKind: testCase.expectedDecisionKind,
    actualDecisionKind: turn.routing.decision.kind,
    responseText: turn.responseText,
    model: turn.meta.model,
    usedAI: turn.meta.usedAI,
    contextTypeMeta: turn.meta.contextType,
    actions: Array.isArray(turn.meta.actions) ? turn.meta.actions : [],
    passed: failures.length === 0,
    maxSeverity: maxSeverity(failures),
    failures,
    routing: turn.meta.routing,
    flowTrace: flowResult.trace,
    notes: testCase.notes,
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function formatPassRate(pass: number, total: number) {
  return total ? `${((pass / total) * 100).toFixed(2)}%` : "0.00%";
}

function markdownEscape(value: unknown) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function markdownTable(headers: string[], rows: Array<Array<unknown>>) {
  return [
    `| ${headers.map(markdownEscape).join(" |")} |`,
    `| ${headers.map(() => "---").join(" |")} |`,
    ...rows.map((row) => `| ${row.map(markdownEscape).join(" |")} |`),
  ].join("\n");
}

function buildSummary(results: OutputResult[]) {
  const passed = results.filter((result) => result.passed);
  const failed = results.filter((result) => !result.passed);
  const criticalFailures = failed.filter((result) => result.maxSeverity === "critical");
  const groupRows = Array.from(groupBy(results, (result) => result.group)).map(
    ([group, rows]) => {
      const pass = rows.filter((row) => row.passed).length;
      return {
        group,
        total: rows.length,
        pass,
        fail: rows.length - pass,
        passRate: formatPassRate(pass, rows.length),
      };
    }
  );
  const intentRows = Array.from(
    groupBy(results, (result) => result.expectedIntent ?? "unknown")
  ).map(([intent, rows]) => {
    const pass = rows.filter((row) => row.passed).length;
    return {
      intent,
      total: rows.length,
      pass,
      fail: rows.length - pass,
      passRate: formatPassRate(pass, rows.length),
    };
  });
  const groupPassRateValue = (group: string) => {
    const rows = results.filter((result) => result.group === group);
    if (!rows.length) return undefined;
    return (rows.filter((row) => row.passed).length / rows.length) * 100;
  };
  const criticalFailureCodes = new Set(
    failed.flatMap((result) =>
      result.failures
        .filter((failure) => failure.severity === "critical")
        .map((failure) => failure.code)
    )
  );
  const aiCriticalFailures = failed.filter(
    (result) =>
      result.group === "ai quality" &&
      result.failures.some((failure) => failure.severity === "critical")
  ).length;
  const screenContextPassRate = groupPassRateValue("screenContext");
  const clickClarifyPassRate = groupPassRateValue("clickClarify");
  const actionRelevancePassRate = groupPassRateValue("actionRelevance");
  const overallPassRate = results.length > 0 ? (passed.length / results.length) * 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    mode: {
      smoke: !FULL,
      includeAi: INCLUDE_AI,
      preferGemma:
        process.env.CHAT_LLM_PREFER_GEMMA === "1" ||
        process.env.CHAT_LLM_MODEL_ORDER === "gemma-first",
    },
    totalCases: results.length,
    passedCases: passed.length,
    failedCases: failed.length,
    passRate: formatPassRate(passed.length, results.length),
    criticalFailures: criticalFailures.length,
    acceptance: {
      minOverallPassRate: 80,
      maxCriticalFailures: 0,
      minScreenContextPassRate: 90,
      minClickClarifyPassRate: 100,
      minActionRelevancePassRate: 90,
      maxAiCriticalFailures: 0,
      passed:
        results.length > 0 &&
        overallPassRate >= 80 &&
        criticalFailures.length === 0 &&
        (screenContextPassRate === undefined || screenContextPassRate >= 90) &&
        (clickClarifyPassRate === undefined || clickClarifyPassRate >= 100) &&
        (actionRelevancePassRate === undefined || actionRelevancePassRate >= 90) &&
        aiCriticalFailures === 0,
      screenContextPassRate:
        screenContextPassRate === undefined ? "n/a" : `${screenContextPassRate.toFixed(2)}%`,
      clickClarifyPassRate:
        clickClarifyPassRate === undefined ? "n/a" : `${clickClarifyPassRate.toFixed(2)}%`,
      actionRelevancePassRate:
        actionRelevancePassRate === undefined ? "n/a" : `${actionRelevancePassRate.toFixed(2)}%`,
      aiCriticalFailures,
      criticalFailureCodes: Array.from(criticalFailureCodes),
    },
    groupRows,
    intentRows,
  };
}

function buildMarkdownReport(summary: any, results: OutputResult[]) {
  const failed = results.filter((result) => !result.passed);
  const summaryRows = [
    ["Generated At", summary.generatedAt],
    ["Mode", summary.mode.includeAi ? "AI included" : "smoke/no-AI preferred"],
    ["Gemma First", summary.mode.preferGemma],
    ["Total", summary.totalCases],
    ["Passed", summary.passedCases],
    ["Failed", summary.failedCases],
    ["Pass Rate", summary.passRate],
    ["Critical Failures", summary.criticalFailures],
    ["Screen Context Pass Rate", summary.acceptance.screenContextPassRate],
    ["Click Clarify Pass Rate", summary.acceptance.clickClarifyPassRate],
    ["Action Relevance Pass Rate", summary.acceptance.actionRelevancePassRate],
    ["AI Critical Failures", summary.acceptance.aiCriticalFailures],
    ["Acceptance", summary.acceptance.passed ? "PASS" : "FAIL"],
  ];

  const failureRows = failed.map((result) => [
    result.id,
    result.expectedIntent,
    result.actualIntent,
    result.actualDecisionKind,
    result.model,
    result.maxSeverity,
    result.failures.map((failure) => failure.code).join(", "),
  ]);

  return [
    "# Chatbot Output Regression Report",
    "",
    "Generated by `TOEIC_server/scripts/check-chatbot-output-regression.ts`.",
    "",
    "## Summary",
    "",
    markdownTable(["Metric", "Value"], summaryRows),
    "",
    "## Groups",
    "",
    markdownTable(
      ["Group", "Total", "Pass", "Fail", "Pass Rate"],
      summary.groupRows.map((row: any) => [
        row.group,
        row.total,
        row.pass,
        row.fail,
        row.passRate,
      ])
    ),
    "",
    "## Intents",
    "",
    markdownTable(
      ["Intent", "Total", "Pass", "Fail", "Pass Rate"],
      summary.intentRows.map((row: any) => [
        row.intent,
        row.total,
        row.pass,
        row.fail,
        row.passRate,
      ])
    ),
    "",
    "## Failed Cases",
    "",
    failureRows.length
      ? markdownTable(
          ["ID", "Expected", "Actual", "Decision", "Model", "Severity", "Codes"],
          failureRows
        )
      : "No failed cases.",
    "",
  ].join("\n");
}

function writeReports(results: OutputResult[]) {
  const summary = buildSummary(results);
  const passed = results.filter((result) => result.passed);
  const failed = results.filter((result) => !result.passed);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILES.summary, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_FILES.passed, `${JSON.stringify(passed, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_FILES.failed, `${JSON.stringify(failed, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_FILES.markdown, buildMarkdownReport(summary, results), "utf8");
  return summary;
}

async function cleanupRunnerData() {
  const sessions = await ChatSession.find({ "metadata.runner": RUNNER_TAG }).select("_id");
  const sessionIds = sessions.map((session) => session._id);
  if (sessionIds.length) {
    await ChatMessage.deleteMany({ session_id: { $in: sessionIds } });
    await ChatSession.deleteMany({ _id: { $in: sessionIds } });
  }
  await ChatMessage.deleteMany({ "meta.runner": RUNNER_TAG });
}

async function run() {
  await connectMongo();
  await cleanupRunnerData();
  const selectedCases = CHATBOT_OUTPUT_REGRESSION_CASES.filter((testCase) => {
    if (testCase.requiresAi && !INCLUDE_AI) return false;
    if (FULL) return true;
    return testCase.includeInSmoke !== false;
  });

  const results: OutputResult[] = [];
  try {
    for (const testCase of selectedCases) {
      try {
        results.push(await runCase(testCase));
      } catch (err) {
        results.push({
          id: testCase.id,
          group: testCase.group,
          input: testCase.input,
          contextType: testCase.contextType,
          expectedIntent: testCase.expectedIntent,
          expectedDecisionKind: testCase.expectedDecisionKind,
          responseText: "",
          actions: [],
          passed: false,
          maxSeverity: "critical",
          failures: [
            {
              code: "RUNNER_ERROR",
              message: err instanceof Error ? err.message : String(err),
              severity: "critical",
            },
          ],
          notes: testCase.notes,
        });
      }
    }

    const summary = writeReports(results);
    console.log(
      JSON.stringify(
        {
          total: summary.totalCases,
          passed: summary.passedCases,
          failed: summary.failedCases,
          passRate: summary.passRate,
          criticalFailures: summary.criticalFailures,
          acceptance: summary.acceptance,
          reportDir: REPORT_DIR,
        },
        null,
        2
      )
    );

    if (!summary.acceptance.passed) {
      process.exitCode = 1;
    }
  } finally {
    await cleanupRunnerData();
    await mongoose.disconnect();
  }
}

run().catch(async (err) => {
  console.error("Chatbot output regression failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
