import path from "path";
import dotenv from "dotenv";
import { ChatIntent, ChatRouteContext } from "../types/chat.types";
import { routeChatMessage } from "../services/chat_intent_router.service";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type IntentCheck = {
  userText: string;
  expected: ChatIntent | "clarify" | "safe_fallback";
  routeContext?: ChatRouteContext;
};

const CHECKS: IntentCheck[] = [
  { userText: "hi", expected: "smalltalk.greeting_feedback" },
  { userText: "cảm ơn bạn", expected: "smalltalk.greeting_feedback" },
  { userText: "toi yeu phan nao", expected: "user_progress.summary" },
  { userText: "tien do hoc cua toi the nao", expected: "user_progress.summary" },
  {
    userText: "bai test nay toi yeu phan nao",
    expected: "test_attempt.analysis",
    routeContext: { page: "test_result", attemptId: "attempt-id" },
  },
  {
    userText: "de gan nhat toi sai chu yeu o dau",
    expected: "test_attempt.analysis",
    routeContext: { page: "question_review", attemptId: "older-attempt-id" },
  },
  {
    userText: "sao dap an la C",
    expected: "question.explain_specific",
    routeContext: {
      page: "question_review",
      questionId: "question-id",
      attemptId: "attempt-id",
    },
  },
  {
    userText: "dich cau nay",
    expected: "question.translate_context",
    routeContext: {
      page: "question_review",
      questionId: "question-id",
      attemptId: "attempt-id",
    },
  },
  {
    userText: "pick up trong cau nay nghia la gi",
    expected: "vocabulary.contextual",
    routeContext: {
      page: "question_review",
      questionId: "question-id",
      attemptId: "attempt-id",
    },
  },
  {
    userText: "cau nay dung ngu phap gi",
    expected: "grammar.contextual",
    routeContext: {
      page: "question_review",
      questionId: "question-id",
      attemptId: "attempt-id",
    },
  },
  { userText: "mo flashcard", expected: "flashcard.personal" },
  { userText: "mo roadmap", expected: "roadmap.guidance" },
  { userText: "meo lam Part 5", expected: "toeic_knowledge.general" },
  { userText: "chan qua", expected: "smalltalk.greeting_feedback" },
  {
    userText: "vi sao dap an nay sai",
    expected: "clarify",
    routeContext: { page: "question_review" },
  },
];

function actualLabel(result: Awaited<ReturnType<typeof routeChatMessage>>) {
  if (result.decision.kind === "route") return result.decision.intentId;
  if (result.decision.kind === "general_ai") return result.decision.intentId;
  return result.decision.kind;
}

function matchesExpected(
  expected: IntentCheck["expected"],
  actual: ReturnType<typeof actualLabel>
) {
  if (expected === "clarify") {
    return actual === "clarify" || actual === "clarify_with_options";
  }
  return actual === expected;
}

async function run() {
  const rows = [];
  let failed = 0;
  const decisionCounts = new Map<string, number>();

  for (const check of CHECKS) {
    const result = await routeChatMessage({
      userText: check.userText,
      routeContext: check.routeContext,
    });
    const actual = actualLabel(result);
    const pass = matchesExpected(check.expected, actual);
    if (!pass) failed += 1;
    decisionCounts.set(
      result.decision.kind,
      (decisionCounts.get(result.decision.kind) ?? 0) + 1
    );
    rows.push({
      pass,
      userText: check.userText,
      expected: check.expected,
      actual,
      decision: result.decision.kind,
      confidence: result.diagnostics.confidence,
      margin: result.diagnostics.margin,
      source: result.diagnostics.source,
      candidates: result.diagnostics.candidates,
    });
  }

  console.log(JSON.stringify({
    rows,
    metrics: {
      total: CHECKS.length,
      passed: CHECKS.length - failed,
      failed,
      decisionCounts: Object.fromEntries(decisionCounts),
    },
  }, null, 2));

  if (failed > 0) {
    console.error(`Chat intent confusion checks failed: ${failed}`);
    process.exit(1);
  }

  console.log("Chat intent confusion checks passed.");
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default run;
