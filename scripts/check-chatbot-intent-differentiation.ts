import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  CHAT_INTENT_CATALOG_VERSION,
  CHAT_INTENT_EXAMPLES,
} from "../src/services/chat_intent_examples.data";
import {
  CHAT_INTENT_DIFFERENTIATION_CASES,
  CHAT_INTENT_DIFFERENTIATION_GROUPS,
  INTENT_DIFFERENTIATION_EXPECTED_COUNTS,
  IntentDifferentiationCase,
  IntentDifferentiationCategory,
} from "../src/services/chat_intent_differentiation_cases.data";
import { rerankIntentCandidates } from "../src/services/chat_intent_reranker.service";
import { rankIntentCandidates } from "../src/services/chat_semantic_intent.service";
import { ChatIntent } from "../src/types/chat.types";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPORT_DIR = path.resolve(__dirname, "../../doc/docs/chatbot/output-check");
const REPORT_FILES = {
  summary: path.join(REPORT_DIR, "intent-differentiation-summary.json"),
  passed: path.join(REPORT_DIR, "intent-differentiation-passed.json"),
  failed: path.join(REPORT_DIR, "intent-differentiation-failed.json"),
  markdown: path.join(REPORT_DIR, "intent-differentiation-report.md"),
};

const POSITIVE_CATEGORIES: Array<Exclude<IntentDifferentiationCategory, "hardNegative">> = [
  "clear",
  "paraphrase",
  "noise",
];
const ACCEPTANCE_THRESHOLDS = {
  minOverallPassRate: 75,
  minIntentPassRate: 55,
};

type CandidateTrace = {
  intentId: string;
  confidence?: number;
  score?: number;
  distance?: number;
  supportCount?: number;
  rerankScore?: number;
  matchedExamples: string[];
  matchedProfileExamples?: string[];
  negativeMatchedExamples?: string[];
  evidenceBreakdown?: Record<string, unknown>;
};

type DifferentiationResult = {
  id: string;
  input: string;
  focusIntent: ChatIntent;
  category: IntentDifferentiationCategory;
  expectedIntent: ChatIntent;
  actualIntent: string;
  forbiddenIntents: ChatIntent[];
  passed: boolean;
  failureReason?: string;
  candidates: CandidateTrace[];
  chromaSource: "chroma" | "fallback";
  chromaQueried: boolean;
  semanticDegraded: boolean;
  degradedReason?: string;
  errorCode?: string;
  retrievalTopK: number;
  rerankTopK: number;
  rerankerDegraded: boolean;
  rerankerVersion: string;
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

function assertFixtureShape() {
  const searchableCatalogIntents = CHAT_INTENT_EXAMPLES.filter(
    (entry) => entry.semanticSearchEnabled && entry.availability !== "DISABLED"
  ).map((entry) => entry.intentId);
  const fixtureIntents = CHAT_INTENT_DIFFERENTIATION_GROUPS.map(
    (group) => group.focusIntent
  );
  const missingFixture = searchableCatalogIntents.filter(
    (intentId) => !fixtureIntents.includes(intentId)
  );
  const extraFixture = fixtureIntents.filter(
    (intentId) => !searchableCatalogIntents.includes(intentId)
  );

  if (missingFixture.length || extraFixture.length) {
    throw new Error(
      [
        "Fixture intent coverage does not match searchable chat intent catalog.",
        `missingFixture=${missingFixture.join(",") || "none"}`,
        `extraFixture=${extraFixture.join(",") || "none"}`,
      ].join(" ")
    );
  }

  for (const group of CHAT_INTENT_DIFFERENTIATION_GROUPS) {
    for (const category of POSITIVE_CATEGORIES) {
      const actual = group.positive[category].length;
      const expected = INTENT_DIFFERENTIATION_EXPECTED_COUNTS[category];
      if (actual !== expected) {
        throw new Error(
          `${group.focusIntent}.${category} expected ${expected} case(s), got ${actual}`
        );
      }
    }
    const actualHardNegatives = group.hardNegatives.length;
    const expectedHardNegatives =
      INTENT_DIFFERENTIATION_EXPECTED_COUNTS.hardNegative;
    if (actualHardNegatives !== expectedHardNegatives) {
      throw new Error(
        `${group.focusIntent}.hardNegative expected ${expectedHardNegatives} case(s), got ${actualHardNegatives}`
      );
    }
  }

  const seedExamples = new Map<string, string>();
  for (const entry of CHAT_INTENT_EXAMPLES) {
    for (const example of entry.examples) {
      seedExamples.set(normalizeText(example), `${entry.intentId}: ${example}`);
    }
  }

  const fixtureInputs = new Map<string, IntentDifferentiationCase>();
  const seedDuplicates: Array<{
    testCaseId: string;
    input: string;
    seedExample: string;
  }> = [];
  for (const testCase of CHAT_INTENT_DIFFERENTIATION_CASES) {
    const key = normalizeText(testCase.input);
    if (!key) {
      throw new Error(`Empty normalized test input: ${testCase.id}`);
    }
    const duplicateCase = fixtureInputs.get(key);
    if (duplicateCase) {
      throw new Error(
        `Duplicate fixture input after normalization: ${duplicateCase.id} and ${testCase.id}`
      );
    }
    fixtureInputs.set(key, testCase);

    const seedDuplicate = seedExamples.get(key);
    if (seedDuplicate) {
      seedDuplicates.push({
        testCaseId: testCase.id,
        input: testCase.input,
        seedExample: seedDuplicate,
      });
    }
  }

  return {
    seedDuplicateCount: seedDuplicates.length,
    seedDuplicates: seedDuplicates.slice(0, 50),
  };
}

function traceCandidates(candidates: Awaited<ReturnType<typeof rerankIntentCandidates>>["candidates"]): CandidateTrace[] {
  return candidates.slice(0, 6).map((candidate) => ({
    intentId: candidate.intentId,
    confidence: round(candidate.confidence),
    score: round(candidate.score),
    distance: round(candidate.distance),
    supportCount: candidate.supportCount,
    rerankScore: round(candidate.rerankScore),
    matchedExamples: candidate.matchedExamples,
    matchedProfileExamples: candidate.matchedProfileExamples,
    negativeMatchedExamples: candidate.negativeMatchedExamples,
    evidenceBreakdown: candidate.evidenceBreakdown
      ? Object.fromEntries(
          Object.entries(candidate.evidenceBreakdown).map(([key, value]) => [
            key,
            round(value) ?? value,
          ])
        )
      : undefined,
  }));
}

function round(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(4))
    : undefined;
}

function resultFromUnavailableChroma(
  testCase: IntentDifferentiationCase,
  reason: {
    source: "chroma" | "fallback";
    queryCount: number;
    semanticDegraded: boolean;
    degradedReason?: string;
    errorCode?: string;
    retrievalTopK: number;
    rerankTopK: number;
  }
): DifferentiationResult {
  return {
    id: testCase.id,
    input: testCase.input,
    focusIntent: testCase.focusIntent,
    category: testCase.category,
    expectedIntent: testCase.expectedIntent,
    actualIntent: "unknown",
    forbiddenIntents: testCase.forbiddenIntents ?? [],
    passed: false,
    failureReason: reason.errorCode ?? reason.degradedReason ?? "SEMANTIC_UNAVAILABLE",
    candidates: [],
    chromaSource: reason.source,
    chromaQueried: reason.queryCount > 0,
    semanticDegraded: reason.semanticDegraded,
    degradedReason: reason.degradedReason,
    errorCode: reason.errorCode,
    retrievalTopK: reason.retrievalTopK,
    rerankTopK: reason.rerankTopK,
    rerankerDegraded: true,
    rerankerVersion: "not_run",
    notes: testCase.notes,
  };
}

async function runCase(testCase: IntentDifferentiationCase): Promise<DifferentiationResult> {
  const ranking = await rankIntentCandidates({
    userText: testCase.input,
    retrievalTopK: 40,
    rerankTopK: 8,
  });

  if (ranking.semanticDegraded) {
    return resultFromUnavailableChroma(testCase, ranking);
  }

  const reranked = await rerankIntentCandidates({
    userText: testCase.input,
    candidates: ranking.candidates,
  });
  const winner = reranked.candidates[0];
  const actualIntent = winner?.intentId ?? "unknown";
  const forbiddenIntents = testCase.forbiddenIntents ?? [];
  const expectedMatched = actualIntent === testCase.expectedIntent;
  const forbiddenMatched = forbiddenIntents.includes(actualIntent as ChatIntent);
  const passed = expectedMatched && !forbiddenMatched;

  return {
    id: testCase.id,
    input: testCase.input,
    focusIntent: testCase.focusIntent,
    category: testCase.category,
    expectedIntent: testCase.expectedIntent,
    actualIntent,
    forbiddenIntents,
    passed,
    failureReason: passed
      ? undefined
      : forbiddenMatched
        ? `actual intent ${actualIntent} is forbidden`
        : `expected ${testCase.expectedIntent} but got ${actualIntent}`,
    candidates: traceCandidates(reranked.candidates),
    chromaSource: ranking.source,
    chromaQueried: ranking.queryCount > 0,
    semanticDegraded: ranking.semanticDegraded,
    degradedReason: ranking.degradedReason,
    errorCode: ranking.errorCode,
    retrievalTopK: ranking.retrievalTopK,
    rerankTopK: ranking.rerankTopK,
    rerankerDegraded: reranked.degraded,
    rerankerVersion: reranked.version,
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

function formatPassRate(passed: number, total: number) {
  return total > 0 ? `${((passed / total) * 100).toFixed(2)}%` : "0.00%";
}

function numericPassRate(passed: number, total: number) {
  return total > 0 ? (passed / total) * 100 : 0;
}

function summarizeGroups(results: DifferentiationResult[], keyName: string, keyFn: (row: DifferentiationResult) => string) {
  return Array.from(groupBy(results, keyFn)).map(([key, rows]) => {
    const passed = rows.filter((row) => row.passed).length;
    return {
      [keyName]: key,
      total: rows.length,
      passed,
      failed: rows.length - passed,
      passRate: formatPassRate(passed, rows.length),
    };
  });
}

function buildConfusionRows(results: DifferentiationResult[]) {
  return Array.from(
    groupBy(
      results.filter((row) => !row.passed),
      (row) => `${row.expectedIntent} -> ${row.actualIntent}`
    )
  ).map(([pair, rows]) => ({
    pair,
    expectedIntent: rows[0]?.expectedIntent,
    actualIntent: rows[0]?.actualIntent,
    count: rows.length,
    examples: rows.slice(0, 5).map((row) => row.input),
  }));
}

function markdownEscape(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function markdownTable(headers: string[], rows: Array<Array<unknown>>) {
  const headerLine = `| ${headers.map(markdownEscape).join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.map(markdownEscape).join(" | ")} |`);
  return [headerLine, dividerLine, ...rowLines].join("\n");
}

function buildMarkdownReport(params: {
  summary: Record<string, unknown>;
  intentRows: Array<Record<string, unknown>>;
  categoryRows: Array<Record<string, unknown>>;
  confusionRows: Array<Record<string, unknown>>;
  failed: DifferentiationResult[];
}) {
  const { summary, intentRows, categoryRows, confusionRows, failed } = params;
  return [
    "# Chatbot Intent Differentiation Semantic Report",
    "",
    "Generated by `TOEIC_server/scripts/check-chatbot-intent-differentiation.ts`.",
    "This is semantic-only: it calls Chroma ranking and local reranking, not chatbot response generation.",
    "",
    "## Summary",
    "",
    markdownTable(
      ["Metric", "Value"],
      [
        ["Generated At", summary.generatedAt],
        ["Catalog Version", summary.catalogVersion],
        ["Total Cases", summary.totalCases],
        ["Passed", summary.passedCases],
        ["Failed", summary.failedCases],
        ["Pass Rate", summary.passRate],
        ["Output Directory", summary.reportDir],
      ]
    ),
    "",
    "## Intent Results",
    "",
    markdownTable(
      ["Intent", "Total", "Passed", "Failed", "Pass Rate"],
      intentRows.map((row) => [
        row.intent,
        row.total,
        row.passed,
        row.failed,
        row.passRate,
      ])
    ),
    "",
    "## Category Results",
    "",
    markdownTable(
      ["Category", "Total", "Passed", "Failed", "Pass Rate"],
      categoryRows.map((row) => [
        row.category,
        row.total,
        row.passed,
        row.failed,
        row.passRate,
      ])
    ),
    "",
    "## Confusion Pairs",
    "",
    confusionRows.length
      ? markdownTable(
          ["Expected -> Actual", "Count", "Examples"],
          confusionRows.map((row) => [
            row.pair,
            row.count,
            Array.isArray(row.examples) ? row.examples.join(" ; ") : "",
          ])
        )
      : "No failed confusion pairs.",
    "",
    "## Top Failed Cases",
    "",
    failed.length
      ? markdownTable(
          ["ID", "Category", "Input", "Expected", "Actual", "Reason"],
          failed.slice(0, 50).map((row) => [
            row.id,
            row.category,
            row.input,
            row.expectedIntent,
            row.actualIntent,
            row.failureReason,
          ])
        )
      : "No failed cases.",
    "",
  ].join("\n");
}

function writeReports(params: {
  summary: Record<string, unknown>;
  passed: DifferentiationResult[];
  failed: DifferentiationResult[];
  intentRows: Array<Record<string, unknown>>;
  categoryRows: Array<Record<string, unknown>>;
  confusionRows: Array<Record<string, unknown>>;
}) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILES.summary, `${JSON.stringify(params.summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_FILES.passed, `${JSON.stringify(params.passed, null, 2)}\n`, "utf8");
  fs.writeFileSync(REPORT_FILES.failed, `${JSON.stringify(params.failed, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    REPORT_FILES.markdown,
    buildMarkdownReport({
      summary: params.summary,
      intentRows: params.intentRows,
      categoryRows: params.categoryRows,
      confusionRows: params.confusionRows,
      failed: params.failed,
    }),
    "utf8"
  );
}

async function run() {
  const fixtureShape = assertFixtureShape();

  const preflight = await rankIntentCandidates({
    userText: "semantic preflight check",
    retrievalTopK: 3,
    rerankTopK: 3,
  });

  let results: DifferentiationResult[];
  if (preflight.semanticDegraded) {
    results = CHAT_INTENT_DIFFERENTIATION_CASES.map((testCase) =>
      resultFromUnavailableChroma(testCase, preflight)
    );
  } else {
    results = [];
    for (const testCase of CHAT_INTENT_DIFFERENTIATION_CASES) {
      results.push(await runCase(testCase));
    }
  }

  const passed = results.filter((row) => row.passed);
  const failed = results.filter((row) => !row.passed);
  const intentRows = summarizeGroups(results, "intent", (row) => row.focusIntent);
  const categoryRows = summarizeGroups(results, "category", (row) => row.category);
  const confusionRows = buildConfusionRows(results);
  const summary = {
    generatedAt: new Date().toISOString(),
    reportDir: REPORT_DIR,
    reportFiles: REPORT_FILES,
    catalogVersion: CHAT_INTENT_CATALOG_VERSION,
    totalCases: results.length,
    passedCases: passed.length,
    failedCases: failed.length,
    passRate: formatPassRate(passed.length, results.length),
    acceptance: {
      thresholds: ACCEPTANCE_THRESHOLDS,
      overallPassRate: Number(numericPassRate(passed.length, results.length).toFixed(2)),
      minIntentPassRate: Number(
        Math.min(
          ...intentRows.map((row) =>
            Number(String(row.passRate).replace("%", ""))
          )
        ).toFixed(2)
      ),
      passed:
        numericPassRate(passed.length, results.length) >= ACCEPTANCE_THRESHOLDS.minOverallPassRate &&
        intentRows.every((row) =>
          Number(String(row.passRate).replace("%", "")) >= ACCEPTANCE_THRESHOLDS.minIntentPassRate
        ),
    },
    expectedCounts: INTENT_DIFFERENTIATION_EXPECTED_COUNTS,
    fixtureSeedDuplicateCount: fixtureShape.seedDuplicateCount,
    fixtureSeedDuplicates: fixtureShape.seedDuplicates,
    searchableIntentCount: CHAT_INTENT_DIFFERENTIATION_GROUPS.length,
    semanticOnly: true,
    callsRouteChatMessage: false,
    callsGemini: false,
    preflight: {
      source: preflight.source,
      queryCount: preflight.queryCount,
      semanticDegraded: preflight.semanticDegraded,
      degradedReason: preflight.degradedReason,
      errorCode: preflight.errorCode,
    },
    intentResults: intentRows,
    categoryResults: categoryRows,
    confusionPairs: confusionRows,
  };

  writeReports({ summary, passed, failed, intentRows, categoryRows, confusionRows });

  console.log("# Chatbot Intent Differentiation");
  console.log(
    JSON.stringify(
      {
        totalCases: summary.totalCases,
        passedCases: summary.passedCases,
        failedCases: summary.failedCases,
        passRate: summary.passRate,
        acceptance: summary.acceptance,
        fixtureSeedDuplicateCount: summary.fixtureSeedDuplicateCount,
        reportDir: summary.reportDir,
      },
      null,
      2
    )
  );
  console.log("\n# Category Results");
  console.table(categoryRows);
  console.log("\n# Intent Results");
  console.table(intentRows);
  console.log("\n# Top Confusions");
  console.table(confusionRows.slice(0, 20));
  console.log("\n# Report Files");
  console.table(Object.entries(REPORT_FILES).map(([name, filePath]) => ({ name, filePath })));

  if (!summary.acceptance.passed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default run;
