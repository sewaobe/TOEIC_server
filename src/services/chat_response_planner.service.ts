import {
  ChatIntent,
  ChatResponseMode,
} from "../types/chat.types";

export function chooseResponseMode(intent: ChatIntent, context: any): ChatResponseMode {
  if (!context.ok) return "fallback";
  if (intent === "smalltalk" || intent === "smalltalk.greeting_feedback") return "template";
  if (intent === "user_profile.identity") return "template";
  if (intent === "lesson.recommendation") return "template";
  if (intent === "out_of_project.general") return "template";
  if (intent === "identify_question") return "template";
  if (intent === "question.similar_practice") return "template";
  if (intent === "flashcard.create") return "template";
  if (
    intent === "check_progress" ||
    intent === "user_progress.summary" ||
    intent === "user_progress.ability_map"
  ) {
    return "template";
  }
  if (
    intent === "roadmap.summary" ||
    intent === "roadmap.next_step" ||
    intent === "roadmap.adjust"
  ) {
    return "template";
  }
  if (intent === "roadmap.explain_recommendation") return "ai";
  if (
    intent === "roadmap.guidance" ||
    intent === "flashcard.personal" ||
    intent === "app.navigation_support"
  ) {
    return "template";
  }
  if (
    intent === "explain_question" ||
    intent === "question.explain_specific" ||
    intent === "question.translate_context" ||
    intent === "vocabulary.contextual" ||
    intent === "grammar.contextual" ||
    intent === "analyze_test_result" ||
    intent === "test_attempt.analysis" ||
    intent === "toeic_knowledge.general" ||
    intent === "general_toeic_question"
  ) {
    return "ai";
  }
  return "fallback";
}
