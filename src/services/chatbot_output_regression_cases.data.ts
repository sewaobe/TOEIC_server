import { ChatIntent, ChatRouteContext } from "../types/chat.types";

export type ChatbotOutputContextType =
  | "none"
  | "screenQuestion"
  | "screenQuestion165"
  | "quickQuestion165"
  | "missingQuestion"
  | "missingAttempt"
  | "roadmap"
  | "flashcard";

export type ChatbotOutputSeverity = "critical" | "major" | "minor";

export type FabricationGuard = {
  scores?: boolean;
  wrongQuestionCount?: boolean;
  weakParts?: boolean;
  questionAnswer?: boolean;
  roadmapStage?: boolean;
  flashcardStatus?: boolean;
};

export type ChatbotOutputRegressionCase = {
  id: string;
  group: string;
  input: string;
  contextType: ChatbotOutputContextType;
  expectedIntent?: ChatIntent;
  expectedDecisionKind?: string;
  includeInSmoke?: boolean;
  requiresAi?: boolean;
  flow?: {
    kind: "clickClarifyOption";
    clickLabelIncludesAny: string[];
    expectedSelectedQuestionId: string;
    expectedFollowupIntent: ChatIntent;
    forbiddenFollowupDecisionKinds?: string[];
    forbidReasonCodesAny?: string[];
  };
  contract?: {
    forbidInternalTerms?: boolean;
    requireActions?: string[];
    requireAnyActionTypes?: string[];
    forbidActionTypes?: string[];
    requireActionLabelsAny?: string[];
    forbidActionLabelsAny?: string[];
    requireActionPayloadKeys?: string[];
    requireActionPayloadMatches?: Array<{
      labelIncludes: string;
      values: Record<string, unknown>;
    }>;
    requireActionOrder?: string[];
    requireManualActionLast?: boolean;
    requireNoActions?: boolean;
    requireUsedAI?: boolean;
    forbidUsedAI?: boolean;
    maxLength?: number;
  };
  quality?: {
    mustIncludeAny?: string[];
    mustNotInclude?: string[];
    mustAskClarification?: boolean;
    mustRefuseOutOfScope?: boolean;
    forbidFabrication?: FabricationGuard;
  };
  severity?: ChatbotOutputSeverity;
  notes?: string;
};

const OUTPUT_TEST_IDS = {
  testId: "507f1f77bcf86cd799439030",
  attemptId: "507f1f77bcf86cd799439031",
  q5: "507f1f77bcf86cd799439035",
  q6: "507f1f77bcf86cd799439036",
  q7: "507f1f77bcf86cd799439037",
  q8: "507f1f77bcf86cd799439038",
  q164: "507f1f77bcf86cd799439164",
  q165: "507f1f77bcf86cd799439165",
  q166: "507f1f77bcf86cd799439166",
};

export const CHATBOT_OUTPUT_CONTEXTS: Record<
  ChatbotOutputContextType,
  { routeContext: ChatRouteContext }
> = {
  none: {
    routeContext: { page: "dashboard" },
  },
  screenQuestion: {
    routeContext: {
      page: "question_review",
      testId: OUTPUT_TEST_IDS.testId,
      attemptId: OUTPUT_TEST_IDS.attemptId,
      visibleQuestionRefs: [
        {
          questionId: OUTPUT_TEST_IDS.q5,
          questionNumber: 5,
          textPreview: "Previous question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q6,
          questionNumber: 6,
          textPreview: "Current visible question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q7,
          questionNumber: 7,
          textPreview: "Next question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q8,
          questionNumber: 8,
          textPreview: "Selected question preview",
        },
      ],
      questionRefs: [
        {
          questionId: OUTPUT_TEST_IDS.q5,
          questionNumber: 5,
          textPreview: "Previous question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q6,
          questionNumber: 6,
          textPreview: "Current visible question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q7,
          questionNumber: 7,
          textPreview: "Next question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q8,
          questionNumber: 8,
          textPreview: "Selected question preview",
        },
      ],
      currentQuestionIndex: 1,
    },
  },
  screenQuestion165: {
    routeContext: {
      page: "question_review",
      testId: OUTPUT_TEST_IDS.testId,
      attemptId: OUTPUT_TEST_IDS.attemptId,
      visibleQuestionRefs: [
        {
          questionId: OUTPUT_TEST_IDS.q164,
          questionNumber: 164,
          textPreview: "Previous real attempt question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q165,
          questionNumber: 165,
          textPreview: "Current real attempt question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q166,
          questionNumber: 166,
          textPreview: "Next real attempt question preview",
        },
      ],
      questionRefs: [
        {
          questionId: OUTPUT_TEST_IDS.q164,
          questionNumber: 164,
          textPreview: "Previous real attempt question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q165,
          questionNumber: 165,
          textPreview: "Current real attempt question preview",
        },
        {
          questionId: OUTPUT_TEST_IDS.q166,
          questionNumber: 166,
          textPreview: "Next real attempt question preview",
        },
      ],
      currentQuestionIndex: 1,
    },
  },
  quickQuestion165: {
    routeContext: {
      page: "question_review",
      testId: OUTPUT_TEST_IDS.testId,
      attemptId: OUTPUT_TEST_IDS.attemptId,
      questionId: OUTPUT_TEST_IDS.q165,
      questionNumber: 165,
      currentQuestionNumber: 165,
      currentVisibleQuestionId: OUTPUT_TEST_IDS.q165,
      currentVisibleQuestionNumber: 165,
      selectedQuestionId: OUTPUT_TEST_IDS.q165,
      selectedQuestionNumber: 165,
      visibleQuestionRefs: [
        {
          questionId: OUTPUT_TEST_IDS.q165,
          questionNumber: 165,
          textPreview: "Current real attempt question preview",
        },
      ],
      questionRefs: [
        {
          questionId: OUTPUT_TEST_IDS.q165,
          questionNumber: 165,
          textPreview: "Current real attempt question preview",
        },
      ],
      currentQuestionIndex: 0,
    },
  },
  missingQuestion: {
    routeContext: {
      page: "question_review",
      testId: "507f1f77bcf86cd799439010",
      attemptId: "507f1f77bcf86cd799439012",
      questionId: "507f1f77bcf86cd799439011",
      currentQuestionNumber: 6,
    },
  },
  missingAttempt: {
    routeContext: {
      page: "test_result",
      testId: "507f1f77bcf86cd799439020",
      attemptId: "507f1f77bcf86cd799439021",
    },
  },
  roadmap: {
    routeContext: { page: "roadmap" },
  },
  flashcard: {
    routeContext: { page: "flashcard" },
  },
};

export const CHATBOT_OUTPUT_REGRESSION_CASES: ChatbotOutputRegressionCase[] = [
  {
    id: "smalltalk_greeting_smoke",
    group: "contract smoke",
    input: "hello bot",
    contextType: "none",
    expectedIntent: "smalltalk.greeting_feedback",
    expectedDecisionKind: "route",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      forbidUsedAI: true,
      maxLength: 700,
    },
    quality: {
      mustIncludeAny: ["TOEIC", "tien do", "cau sai", "bai test"],
    },
  },
  {
    id: "smalltalk_thanks_smoke",
    group: "contract smoke",
    input: "cam on nha",
    contextType: "none",
    expectedIntent: "smalltalk.greeting_feedback",
    expectedDecisionKind: "route",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      forbidUsedAI: true,
      maxLength: 700,
    },
  },
  {
    id: "out_of_project_refusal_weather",
    group: "contract smoke",
    input: "thoi tiet ngay mai o Ha Noi the nao",
    contextType: "none",
    expectedIntent: "out_of_project.general",
    expectedDecisionKind: "route",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      forbidUsedAI: true,
      maxLength: 700,
    },
    quality: {
      mustRefuseOutOfScope: true,
      mustIncludeAny: ["TOEIC", "he thong", "chi ho tro"],
    },
    severity: "critical",
  },
  {
    id: "question_explain_missing_context_visible",
    group: "missing context",
    input: "giai thich cau nay giup minh",
    contextType: "none",
    expectedIntent: "question.explain_specific",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "question_translate_missing_context_visible",
    group: "missing context",
    input: "dich cau nay sang tieng Viet",
    contextType: "none",
    expectedIntent: "question.translate_context",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "grammar_missing_question_guard",
    group: "missing context",
    input: "cau nay dang dung thi gi vay",
    contextType: "none",
    expectedIntent: "grammar.contextual",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "vocabulary_missing_question_guard",
    group: "missing context",
    input: "tu nay nghia la gi",
    contextType: "none",
    expectedIntent: "vocabulary.contextual",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "similar_missing_question_guard",
    group: "missing context",
    input: "cho minh cau tuong tu de luyen them",
    contextType: "none",
    expectedIntent: "question.similar_practice",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
    },
  },
  {
    id: "screen_context_clarify_order",
    group: "screenContext",
    input: "giai thich cau nay giup minh",
    contextType: "screenQuestion",
    expectedIntent: "question.explain_specific",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      requireActionLabelsAny: [
        "Cau 6 dang hien thi",
        "Cau 5 phia tren",
        "Cau 7 phia duoi",
      ],
      requireActionPayloadKeys: ["selectedRouteContext.questionId", "selectedRouteContext.attemptId", "selectedRouteContext.testId"],
      requireActionOrder: [
        "Cau 6 dang hien thi",
        "Cau 5 phia tren",
        "Cau 7 phia duoi",
      ],
      requireManualActionLast: true,
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "click_clarify_visible_question",
    group: "clickClarify",
    input: "giai thich cau nay",
    contextType: "screenQuestion",
    expectedIntent: "question.explain_specific",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    flow: {
      kind: "clickClarifyOption",
      clickLabelIncludesAny: ["Cau 6 dang hien thi", "Cau 6"],
      expectedSelectedQuestionId: OUTPUT_TEST_IDS.q6,
      expectedFollowupIntent: "question.explain_specific",
      forbiddenFollowupDecisionKinds: ["clarify", "clarify_with_options"],
      forbidReasonCodesAny: ["missing_required_context", "missing_question_reference", "fast_path_question_missing_context"],
    },
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      requireActionPayloadKeys: ["selectedRouteContext.questionId", "selectedRouteContext.attemptId", "selectedRouteContext.testId"],
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "screen_context_uses_real_question_numbers_165",
    group: "screenContext",
    input: "cau nay toi sai gi",
    contextType: "screenQuestion165",
    expectedIntent: "question.explain_specific",
    expectedDecisionKind: "clarify_with_options",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["select_clarify_option"],
      requireActionLabelsAny: [
        "Cau 165 dang hien thi",
        "Cau 164 phia tren",
        "Cau 166 phia duoi",
      ],
      forbidActionLabelsAny: ["Cau 1", "Cau 2", "Cau 3", "Cau 4", "Cau 5"],
      requireActionPayloadKeys: [
        "selectedRouteContext.questionId",
        "selectedRouteContext.questionNumber",
        "selectedRouteContext.attemptId",
        "selectedRouteContext.testId",
      ],
      requireActionPayloadMatches: [
        {
          labelIncludes: "Cau 165 dang hien thi",
          values: {
            "selectedRouteContext.questionId": OUTPUT_TEST_IDS.q165,
            "selectedRouteContext.questionNumber": 165,
            "selectedRouteContext.attemptId": OUTPUT_TEST_IDS.attemptId,
            "selectedRouteContext.testId": OUTPUT_TEST_IDS.testId,
          },
        },
        {
          labelIncludes: "Cau 164 phia tren",
          values: {
            "selectedRouteContext.questionId": OUTPUT_TEST_IDS.q164,
            "selectedRouteContext.questionNumber": 164,
            "selectedRouteContext.attemptId": OUTPUT_TEST_IDS.attemptId,
            "selectedRouteContext.testId": OUTPUT_TEST_IDS.testId,
          },
        },
        {
          labelIncludes: "Cau 166 phia duoi",
          values: {
            "selectedRouteContext.questionId": OUTPUT_TEST_IDS.q166,
            "selectedRouteContext.questionNumber": 166,
            "selectedRouteContext.attemptId": OUTPUT_TEST_IDS.attemptId,
            "selectedRouteContext.testId": OUTPUT_TEST_IDS.testId,
          },
        },
      ],
      requireActionOrder: [
        "Cau 165 dang hien thi",
        "Cau 164 phia tren",
        "Cau 166 phia duoi",
      ],
      requireManualActionLast: true,
      maxLength: 900,
    },
    quality: {
      mustAskClarification: true,
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "quick_question_165_routes_directly",
    group: "clickClarify",
    input: "cau nay toi sai gi",
    contextType: "quickQuestion165",
    expectedIntent: "question.explain_specific",
    expectedDecisionKind: "route",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireNoActions: true,
      maxLength: 1200,
    },
    quality: {
      forbidFabrication: { questionAnswer: true },
    },
    severity: "critical",
  },
  {
    id: "attempt_missing_no_fabrication",
    group: "db backed no fabrication",
    input: "phan tich bai test gan nhat cua toi",
    contextType: "none",
    expectedIntent: "test_attempt.analysis",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 1000,
    },
    quality: {
      mustIncludeAny: ["bai", "test", "chua", "chon", "mo"],
      forbidFabrication: {
        scores: true,
        wrongQuestionCount: true,
        weakParts: true,
      },
    },
    severity: "critical",
  },
  {
    id: "progress_summary_missing_no_fabrication",
    group: "db backed no fabrication",
    input: "tong quan tien do hoc cua toi sao roi",
    contextType: "none",
    expectedIntent: "user_progress.summary",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 1000,
    },
    quality: {
      forbidFabrication: {
        scores: true,
        weakParts: true,
      },
    },
    severity: "critical",
  },
  {
    id: "user_profile_identity_missing_safe",
    group: "db backed no fabrication",
    input: "toi la ai tren he thong",
    contextType: "none",
    expectedIntent: "user_profile.identity",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 700,
    },
    quality: {
      mustIncludeAny: ["ho so", "tai khoan", "thong tin"],
      mustNotInclude: ["passwordHash", "firebaseUid", "_id", "token", "cookie"],
    },
    severity: "critical",
  },
  {
    id: "ability_map_missing_no_fabrication",
    group: "abilityWording",
    input: "minh dang yeu ky nang nao nhat",
    contextType: "none",
    expectedIntent: "user_progress.ability_map",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 1000,
    },
    quality: {
      mustIncludeAny: ["nang luc", "ky nang", "danh gia"],
      mustNotInclude: ["tong hop tien do"],
      forbidFabrication: {
        scores: true,
        weakParts: true,
      },
    },
    severity: "critical",
  },
  {
    id: "roadmap_guidance_action",
    group: "actions",
    input: "mo roadmap ca nhan cho minh",
    contextType: "roadmap",
    expectedIntent: "roadmap.guidance",
    expectedDecisionKind: "route",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["show_roadmap"],
      maxLength: 700,
    },
    quality: {
      mustIncludeAny: ["lo trinh", "roadmap"],
    },
  },
  {
    id: "roadmap_next_step_missing_no_fabrication",
    group: "db backed no fabrication",
    input: "hom nay roadmap muon minh hoc gi tiep",
    contextType: "roadmap",
    expectedIntent: "roadmap.next_step",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 900,
    },
    quality: {
      forbidFabrication: {
        roadmapStage: true,
      },
    },
    severity: "critical",
  },
  {
    id: "roadmap_adjust_no_mutation_text",
    group: "contract smoke",
    input: "toi muon giam khoi luong hoc trong lo trinh",
    contextType: "roadmap",
    expectedIntent: "roadmap.adjust",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 900,
    },
    quality: {
      mustIncludeAny: ["dieu chinh", "lo trinh", "xac nhan"],
    },
  },
  {
    id: "flashcard_personal_action",
    group: "actions",
    input: "mo trang flashcard de minh on",
    contextType: "flashcard",
    expectedIntent: "flashcard.personal",
    expectedDecisionKind: "route",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["open_flashcards"],
      maxLength: 700,
    },
    quality: {
      mustIncludeAny: ["flashcard"],
    },
  },
  {
    id: "flashcard_create_missing_source_guard",
    group: "db backed no fabrication",
    input: "tao 15 flashcard tu cac tu minh hay sai",
    contextType: "flashcard",
    expectedIntent: "flashcard.create",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 1000,
    },
    quality: {
      forbidFabrication: {
        flashcardStatus: true,
      },
    },
    severity: "critical",
  },
  {
    id: "app_navigation_action",
    group: "actionRelevance",
    input: "xem cau sai o dau trong app",
    contextType: "none",
    expectedIntent: "app.navigation_support",
    expectedDecisionKind: "route",
    includeInSmoke: true,
    contract: {
      forbidInternalTerms: true,
      requireAnyActionTypes: ["review_mistakes", "open_test_result", "open_attempt_review"],
      requireActionLabelsAny: ["cau sai", "review", "ket qua", "bai lam"],
      forbidActionTypes: ["show_roadmap", "open_flashcards"],
      maxLength: 800,
    },
    quality: {
      mustIncludeAny: ["mo", "huong dan", "review", "cau sai"],
    },
  },
  {
    id: "toeic_general_ai_quality",
    group: "ai quality",
    input: "TOEIC Part 5 nen lam nhu the nao cho nhanh",
    contextType: "none",
    expectedIntent: "toeic_knowledge.general",
    expectedDecisionKind: "general_ai",
    requiresAi: true,
    contract: {
      forbidInternalTerms: true,
      requireUsedAI: true,
      maxLength: 1400,
    },
    quality: {
      mustIncludeAny: ["Part 5", "ngu phap", "tu loai", "dap an", "thoi gian"],
    },
  },
  {
    id: "emotion_support_ai_quality",
    group: "ai quality",
    input: "hoc TOEIC mai khong len diem nen minh nan qua",
    contextType: "none",
    expectedIntent: "smalltalk.greeting_feedback",
    requiresAi: true,
    contract: {
      forbidInternalTerms: true,
      requireUsedAI: true,
      maxLength: 900,
    },
    quality: {
      mustIncludeAny: ["TOEIC", "nghi", "cau sai", "luyen", "buoc"],
    },
  },
  {
    id: "roadmap_explain_recommendation_ai_quality",
    group: "ai quality",
    input: "vi sao roadmap lai uu tien bai nay cho minh",
    contextType: "roadmap",
    expectedIntent: "roadmap.explain_recommendation",
    requiresAi: true,
    contract: {
      forbidInternalTerms: true,
      maxLength: 1200,
    },
    quality: {
      forbidFabrication: {
        roadmapStage: true,
      },
    },
    severity: "critical",
  },
];
