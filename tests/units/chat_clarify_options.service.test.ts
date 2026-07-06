import { describe, expect, it, jest } from "@jest/globals";
import type {
  ChatRouteContext,
  ChatRoutingResult,
  ClarifyOption,
} from "../../src/types/chat.types";

jest.mock("../../src/core/llm", () => ({
  generateFromPromptWithMeta: jest.fn(),
  streamFromPromptWithMeta: jest.fn(),
}));

jest.mock("../../src/models/chat_message.model", () => ({
  ChatMessage: { create: jest.fn() },
}));

jest.mock("../../src/models/chat_session.model", () => ({
  ChatSession: {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock("../../src/models/user_test.model", () => ({
  UserTest: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

import { __test__ as dbFirstTest } from "../../src/services/chat_db_first.service";
import { __test__ as routerTest } from "../../src/services/chat_intent_router.service";

const routeContext: ChatRouteContext = {
  page: "question_review",
  testId: "test-1",
  attemptId: "attempt-1",
  questionId: "q6",
  currentVisibleQuestionId: "q6",
  currentVisibleQuestionNumber: 6,
  selectedQuestionId: "q6",
  selectedQuestionNumber: 6,
  currentQuestionNumber: 6,
  currentQuestionIndex: 1,
  questionRefs: [
    { questionNumber: 5, questionId: "q5", textPreview: "Question 5 text" },
    { questionNumber: 6, questionId: "q6", textPreview: "Question 6 text" },
    { questionNumber: 7, questionId: "q7", textPreview: "Question 7 text" },
  ],
  visibleQuestionRefs: [
    { questionNumber: 5, questionId: "q5", textPreview: "Question 5 text" },
    { questionNumber: 6, questionId: "q6", textPreview: "Question 6 text" },
    { questionNumber: 7, questionId: "q7", textPreview: "Question 7 text" },
  ],
};

function clarifyRouting(options: ClarifyOption[]): ChatRoutingResult {
  return {
    decision: {
      kind: "clarify_with_options",
      intentId: "question.explain_specific",
      reason: "missing_question_context",
      options,
    },
    scope: "single_question",
    intent: "question.explain_specific",
    confidence: 0.72,
    slots: {},
    source: "semantic",
    resolverPolicy: "CLARIFY",
    reasonCodes: ["missing_question_context"],
    diagnostics: {
      source: "semantic",
      candidates: [],
      clarifyOptions: options,
    },
  };
}

describe("chat clarify route continuation options", () => {
  it("prioritizes current visible question before nearby visible questions", () => {
    const options = routerTest.buildQuestionClarifyOptions(routeContext);

    expect(options.map((option) => option.reason)).toEqual([
      "current_visible_question",
      "nearby_visible_question_previous",
      "nearby_visible_question_next",
      "manual_input",
    ]);
    expect(options[0].value).toMatchObject({
      questionId: "q6",
      attemptId: "attempt-1",
      testId: "test-1",
      questionNumber: 6,
    });
    expect(options[1].value.questionId).toBe("q5");
    expect(options[2].value.questionId).toBe("q7");
  });

  it("uses selected question context when visible context is absent", () => {
    const options = routerTest.buildQuestionClarifyOptions({
      page: "question_review",
      testId: "test-1",
      attemptId: "attempt-1",
      selectedQuestionId: "q2",
      selectedQuestionNumber: 2,
      questionRefs: [
        { questionNumber: 1, questionId: "q1" },
        { questionNumber: 2, questionId: "q2" },
      ],
    });

    expect(options[0].reason).toBe("current_selected_question");
    expect(options[0].value).toMatchObject({
      questionId: "q2",
      attemptId: "attempt-1",
      testId: "test-1",
      questionNumber: 2,
    });
  });

  it("maps clarify options to route continuation actions without forcing intent", () => {
    const options = routerTest.buildQuestionClarifyOptions(routeContext);
    const actions = dbFirstTest.buildClarifyOptionActions({
      options,
      originalUserText: "cau nay toi sai o dau?",
      routeContext,
      previousIntentId: "question.explain_specific",
    });

    expect(actions[0]).toMatchObject({
      type: "select_clarify_option",
      payload: {
        originalUserText: "cau nay toi sai o dau?",
        manualInput: false,
        previousIntentId: "question.explain_specific",
      },
    });
    expect(actions[0].payload.selectedRouteContext).toMatchObject({
      page: "question_review",
      testId: "test-1",
      attemptId: "attempt-1",
      questionId: "q6",
      currentVisibleQuestionId: "q6",
      selectedQuestionId: "q6",
      currentQuestionNumber: 6,
      currentVisibleQuestionNumber: 6,
      selectedQuestionNumber: 6,
    });
    expect(actions[0].payload).not.toHaveProperty("intentId");

    const manualAction = actions[actions.length - 1];
    expect(manualAction.payload).toMatchObject({
      manualInput: true,
      selectedRouteContext: routeContext,
    });
  });

  it("keeps clarify replies action-backed instead of numbered text options", async () => {
    const options = routerTest.buildQuestionClarifyOptions(routeContext);
    const replyOptions = await dbFirstTest.buildClarifyOptionsForReply({
      userId: "user-1",
      routeContext,
      routing: clarifyRouting(options),
    });

    expect(replyOptions.map((option) => option.reason).slice(0, 3)).toEqual([
      "current_visible_question",
      "nearby_visible_question_previous",
      "nearby_visible_question_next",
    ]);
    expect(replyOptions).toContainEqual(
      expect.objectContaining({ reason: "manual_input" })
    );
  });
});
