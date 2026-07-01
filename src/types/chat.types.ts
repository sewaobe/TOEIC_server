export type ChatRoutePage =
  | "dashboard"
  | "roadmap"
  | "today_plan"
  | "test_practice"
  | "test_result"
  | "question_review"
  | "dictation"
  | "shadowing"
  | "flashcard"
  | "lesson"
  | "unknown";

export type ChatIntent =
  | "smalltalk"
  | "identify_question"
  | "explain_question"
  | "analyze_test_result"
  | "check_progress"
  | "general_toeic_question"
  | "smalltalk.greeting_feedback"
  | "user_progress.summary"
  | "user_progress.ability_map"
  | "test_attempt.analysis"
  | "question.explain_specific"
  | "question.translate_context"
  | "question.similar_practice"
  | "vocabulary.contextual"
  | "grammar.contextual"
  | "toeic_knowledge.general"
  | "roadmap.guidance"
  | "roadmap.summary"
  | "roadmap.next_step"
  | "roadmap.explain_recommendation"
  | "roadmap.adjust"
  | "flashcard.personal"
  | "flashcard.create"
  | "listening_practice.analysis"
  | "app.navigation_support"
  | "safe_fallback"
  | "unknown";

export type IntentLane = "SYSTEM" | "CONTEXTUAL" | "GENERAL_AI";

export type IntentAvailability = "ACTIVE" | "ACTION_ONLY" | "DISABLED";

export type ChatScope =
  | "single_question"
  | "attempt_analysis"
  | "overall_progress"
  | "general_knowledge"
  | "unknown";

export type ChatAttemptScope = "latest" | "current" | "selected" | "explicit";

export type ChatAnalysisMetric =
  | "strength"
  | "weakness"
  | "error_pattern"
  | "score_breakdown";

export interface ChatRouteSlots {
  attemptScope?: ChatAttemptScope;
  parts?: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
  comparison?: boolean;
  metric?: ChatAnalysisMetric;
  questionNumber?: number;
  explicitQuestionRef?: boolean;
  followUp?: boolean;
  roadmapRequest?:
    | "navigation"
    | "status"
    | "next_step"
    | "explain_recommendation"
    | "adjust";
}

export interface ScopeDecision {
  scope: ChatScope;
  confidence: number;
  slots: ChatRouteSlots;
  reasonCodes: string[];
}

export type ChatRouteSource = "rule" | "fast_path" | "semantic" | "follow_up" | "fallback";
export type ChatResolverPolicy =
  | "DB_FIRST"
  | "DB_FIRST_AI"
  | "GENERAL_AI"
  | "CLARIFY"
  | "CLARIFY_IF_CONTEXT_MISSING"
  | "NO_DATA"
  | "UNAUTHORIZED"
  | "UNSUPPORTED_CAPABILITY"
  | "LOW_CONFIDENCE"
  | "SAFE_FALLBACK";

export interface FollowUpContext {
  followUpDetected: boolean;
  followUpResolved: boolean;
  resolvedFrom?: "conversation_state" | "explicit_reference";
  resolvedQuestionId?: string;
  resolvedAttemptId?: string;
  resolvedQuestionNumber?: number;
  resolvedText?: string;
}

export interface ChatConversationState {
  scope?: ChatScope;
  intent?: ChatIntent;
  attemptId?: string;
  questionId?: string;
}

export type ChatRouteDecision =
  | { kind: "route"; intentId: ChatIntent; lane: "SYSTEM" | "CONTEXTUAL" }
  | { kind: "clarify"; intentId?: ChatIntent; reason: string }
  | { kind: "general_ai"; intentId: "toeic_knowledge.general" }
  | { kind: "safe_fallback"; reason: string };

export interface IntentCandidate {
  intentId: ChatIntent;
  lane: IntentLane;
  confidence: number;
  score: number;
  distance?: number;
  matchedExamples: string[];
  supportCount?: number;
  rerankScore?: number;
}

export interface RoutingDiagnosticCandidate {
  intentId: ChatIntent;
  lane: IntentLane;
  confidence: number;
  score: number;
  distance?: number;
  supportCount?: number;
  rerankScore?: number;
}

export interface RoutingDiagnostics {
  confidence?: number;
  margin?: number;
  source: ChatRouteSource | "chroma" | "heuristic";
  candidates: RoutingDiagnosticCandidate[];
  reason?: string;
  chromaQueried?: boolean;
  chromaAvailable?: boolean;
  fastPathHit?: boolean;
  semanticIntent?: ChatIntent;
  legacyRuleIntent?: ChatIntent;
  semanticEntity?: string;
  semanticAction?: string;
  semanticActionConfidence?: string;
  actionLayerIntent?: ChatIntent;
  semanticDegraded?: boolean;
  rerankerDegraded?: boolean;
  retrievalLatencyMs?: number;
  rerankLatencyMs?: number;
  validationLatencyMs?: number;
  seedVersion?: string;
  rerankerVersion?: string;
  followUp?: FollowUpContext;
  top1Top2Margin?: number;
  winnerScore?: number;
  retrievalTopK?: number;
  rerankTopK?: number;
  mismatchReason?: string;
  validationResult?: string;
  ragStatus?: "rag_hit" | "rag_low_confidence" | "rag_ambiguous" | "rag_miss" | "rag_error";
  ragDecision?: "RAG_DECIDED" | "RAG_ABSTAIN" | "RAG_ERROR";
  ragAbstainReason?: "LOW_CONFIDENCE" | "AMBIGUOUS" | "NO_MATCH";
  ragErrorCode?: string;
  ragDistanceTooFar?: boolean;
  geminiFallbackUsed?: boolean;
}

export interface ChatRoutingResult {
  decision: ChatRouteDecision;
  scope: ChatScope;
  intent?: ChatIntent;
  confidence: number;
  slots: ChatRouteSlots;
  source: ChatRouteSource;
  resolverPolicy: ChatResolverPolicy;
  reasonCodes: string[];
  diagnostics: RoutingDiagnostics;
}

export type ChatActionType =
  | "open_question_review"
  | "review_mistakes"
  | "start_practice"
  | "recommend_similar_practice"
  | "show_roadmap"
  | "open_flashcards"
  | "open_flashcard_deck"
  | "replay_audio"
  | "request_roadmap_recompute";

export type ChatResponseMode = "template" | "ai" | "fallback";

export type ChatErrorType =
  | "AUTH_REQUIRED"
  | "SOCKET_DISCONNECTED"
  | "MISSING_CONTEXT"
  | "MISSING_REQUIRED_CONTEXT"
  | "UNAUTHORIZED"
  | "NO_DATA"
  | "NO_USER_DATA"
  | "AI_SERVICE_ERROR"
  | "LEGACY_RETRIEVER_UNAVAILABLE"
  | "UNSUPPORTED_CAPABILITY"
  | "LOW_CONFIDENCE"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

export interface ChatRouteContext {
  page: ChatRoutePage;
  roadmapId?: string;
  nodeId?: string;
  testId?: string;
  attemptId?: string;
  questionId?: string;
  lessonId?: string;
  dictationAttemptId?: string;
  shadowingAttemptId?: string;
  currentQuestionNumber?: number;
  questionRefs?: ChatRouteQuestionRef[];
}

export interface ChatRouteQuestionRef {
  questionNumber: number;
  questionId: string;
  textPreview?: string;
}

export interface ChatClientContext {
  selectedText?: string;
  currentAudioTime?: number;
  userTimezone?: string;
  sourceAction?: "quick_question_explain" | string;
  actionPayload?: Record<string, any>;
  clientRequestId?: string;
  testTitle?: string;
}

export interface ChatAction {
  id: string;
  label: string;
  type: ChatActionType;
  payload: Record<string, any>;
}

export interface ChatActionClick {
  actionType: string;
  payload: Record<string, any>;
  clickedAt: Date;
  userId?: string;
}

export interface ChatMessagePayload {
  sessionId: string;
  userText: string;
  questionId?: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
  mode?: "legacy" | "db_first";
}

export interface DbFirstInput {
  sessionId: string;
  userId: string;
  userText: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
  conversationState?: ChatConversationState;
  routing?: ChatRoutingResult;
}

export interface DbFirstResult {
  botMessage: any;
}

export type DbFirstContextSuccess = {
  ok: true;
  contextType: string;
  data: any;
};

export type DbFirstContextFailure = {
  ok: false;
  errorType: ChatErrorType;
  fallback: string;
  outcome?: "clarify" | "no_data" | "forbidden" | "safe_fallback" | "unauthorized" | "unsupported_capability";
};

export type DbFirstContext = DbFirstContextSuccess | DbFirstContextFailure;

export interface IPronunciationMistake {
  original: string;
  correction: string;
  type: "grammar" | "vocabulary" | "pronunciation";
  explanation: string;
}

export interface IVocabSuggestion {
  word: string;
  context: string;
  alternatives: string[];
}

export interface IGrammarBreakdownItem {
  structure: string;
  example: string;
  advice: string;
  status: "Correct" | "Needs Improvement";
}

export interface IPronunciationFeedback {
  pronunciationScore?: number;
  fluencyScore?: number;
  intonationScore?: number;
  grammarScore?: number;
  mistakes?: IPronunciationMistake[];
  improvementTip?: string;
  totalScore?: number;
  vocabSuggestions?: IVocabSuggestion[];
  grammarBreakdown?: IGrammarBreakdownItem[];
}

export interface IQuickQuestionVocabularyItem {
  word: string;
  pos?: string;
  meaning: string;
}

export interface IQuickQuestionView {
  questionLabel: string;
  status: "correct" | "wrong" | "skipped";
  statusText: string;
  userAnswer: string;
  correctAnswer: string;
  explanation?: string;
  vocabulary?: IQuickQuestionVocabularyItem[];
  reminder?: string;
}

export interface IQuickQuestionContext {
  questionId: string;
  questionNumber?: number;
  attemptId: string;
  testId: string;
  testTitle?: string;
  part?: string;
  questionText?: string;
  choices?: Record<string, any>;
  userAnswer?: string;
  userAnswerText?: string;
  correctAnswer?: string;
  correctAnswerText?: string;
  isCorrect?: boolean;
  status: "correct" | "wrong" | "skipped";
}

export interface IStructuredStatItem {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

export interface IStructuredListItem {
  label: string;
  value?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

export type IChatStructuredView =
  | {
      type: "progress_summary";
      title: string;
      subtitle?: string;
      stats: IStructuredStatItem[];
      highlights?: IStructuredListItem[];
      weakParts?: string[];
      nextStep?: string;
    }
  | {
      type: "ability_map_summary";
      title: string;
      subtitle?: string;
      stats: IStructuredStatItem[];
      parts: Array<{
        label: string;
        domain?: string;
        abilityPercent: number;
        status: string;
        trend?: string;
        isFocusPart?: boolean;
      }>;
      highlights?: IStructuredListItem[];
    }
  | {
      type: "test_attempt_analysis";
      title: string;
      subtitle?: string;
      stats: IStructuredStatItem[];
      weakTags?: IStructuredListItem[];
      wrongAnswers?: IStructuredListItem[];
      summary?: string;
    }
  | {
      type: "question_context";
      title: string;
      subtitle?: string;
      status?: "correct" | "wrong" | "skipped" | "neutral";
      stats?: IStructuredStatItem[];
      questionText?: string;
      userAnswer?: string;
      correctAnswer?: string;
      answer?: string;
      reminder?: string;
    }
  | {
      type: "similar_practice_recommendations";
      title: string;
      subtitle?: string;
      sourceTags: string[];
      items: Array<{
        lessonManagerId: string;
        title: string;
        part?: number;
        targetTags: string[];
        weight?: number;
        fitScore?: number;
        activities: Array<{
          id: string;
          type: "vocabulary" | "dictation" | "shadowing" | "quiz";
          title: string;
          estimatedMinutes?: number;
          action: ChatAction;
        }>;
      }>;
    }
  | {
      type: "flashcard_supply";
      title: string;
      subtitle?: string;
      requestedCount: number;
      returnedCount: number;
      suppliedBy: {
        systemCatalog: number;
        gemini: number;
      };
      policyReason:
        | "DB_ENOUGH"
        | "FILL_FROM_GEMINI"
        | "STRICT_SOURCE_LIMIT"
        | "PARTIAL_DB_ONLY"
        | "PARTIAL_AFTER_GENERATION"
        | "REUSED_EXISTING_DECK";
      words: Array<{
        word: string;
        type?: string;
        definition?: string;
        source: "systemCatalog" | "gemini";
      }>;
      action: ChatAction;
    }
  | {
      type: "navigation_support";
      title: string;
      subtitle?: string;
      items: IStructuredListItem[];
    }
  | {
      type: "fallback_notice";
      title: string;
      subtitle?: string;
      message: string;
      tone?: "warning" | "danger" | "info";
    };

export interface IChatMessageMeta {
  token_usage?: number;
  model?: string;
  feedback?: "like" | "dislike" | null;
  error?: string;
  intent?: ChatIntent | string;
  usedAI?: boolean;
  contextType?: string;
  actions?: ChatAction[];
  routeContext?: ChatRouteContext | Record<string, any>;
  clientContext?: ChatClientContext | Record<string, any>;
  responseTimeMs?: number;
  errorType?: ChatErrorType | string;
  fallbackUsed?: boolean;
  actionClicks?: ChatActionClick[];
  stt_text?: string;
  pronunciation_feedback?: IPronunciationFeedback;
  is_unintelligible?: boolean;
  quickQuestionView?: IQuickQuestionView;
  quickQuestionContext?: IQuickQuestionContext;
  structuredView?: IChatStructuredView;
  resolverOutcome?: "resolved" | "clarify" | "no_data" | "forbidden" | "safe_fallback";
  routing?: RoutingDiagnostics & {
    decision: ChatRouteDecision["kind"];
    scope?: ChatScope;
    intent?: ChatIntent;
    slots?: ChatRouteSlots;
    resolverPolicy?: ChatResolverPolicy;
    reasonCodes?: string[];
  };
}
