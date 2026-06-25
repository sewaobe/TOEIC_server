import {
  ChatAction,
  ChatIntent,
} from "../types/chat.types";

export function buildActions(intent: ChatIntent, context: any): ChatAction[] {
  if (!context.ok) return [];

  if (
    intent === "explain_question" ||
    intent === "question.explain_specific" ||
    intent === "question.translate_context" ||
    intent === "vocabulary.contextual" ||
    intent === "grammar.contextual"
  ) {
    const question = context.data.question;
    const attempt = context.data.currentAttempt ?? context.data.attempt;
    const group = context.data.group;
    const actions: ChatAction[] = [
      {
        id: "practice-similar",
        label: "Luyện câu tương tự",
        type: "start_practice",
        payload: {
          part: question.part,
          tags: question.tags,
          sourceQuestionId: question.id,
        },
      },
      {
        id: "open-question-review",
        label: "Mở lại câu hỏi",
        type: "open_question_review",
        payload: {
          testId: attempt.testId,
          attemptId: attempt.id,
          questionId: question.id,
        },
      },
    ];

    if (group?.media?.hasAudio && group.media.audioUrl) {
      actions.push({
        id: "replay-audio",
        label: "Nghe lại audio",
        type: "replay_audio",
        payload: {
          audioUrl: group.media.audioUrl,
          questionId: question.id,
          testId: attempt.testId,
          attemptId: attempt.id,
        },
      });
    }

    return actions;
  }

  if (intent === "analyze_test_result" || intent === "test_attempt.analysis") {
    return [
      {
        id: "review-mistakes",
        label: "Xem câu sai",
        type: "review_mistakes",
        payload: {
          testId: context.data.attempt.testId,
          attemptId: context.data.attempt.id,
        },
      },
      {
        id: "start-weak-practice",
        label: "Luyện phần yếu",
        type: "start_practice",
        payload: {
          tags: context.data.topWeakTags?.map((item: any) => item.tag) ?? [],
        },
      },
    ];
  }

  if (intent === "check_progress" || intent === "user_progress.summary") {
    return [
      {
        id: "show-roadmap",
        label: "Xem lộ trình",
        type: "show_roadmap",
        payload: {
          roadmapId: context.data.progress?.learningPathId,
        },
      },
      {
        id: "study-today",
        label: "Học bài hôm nay",
        type: "show_roadmap",
        payload: {},
      },
    ];
  }

  if (intent === "roadmap.guidance") {
    return [
      {
        id: "show-roadmap",
        label: "Mở lộ trình",
        type: "show_roadmap",
        payload: {},
      },
    ];
  }

  if (
    intent === "roadmap.summary" ||
    intent === "roadmap.next_step" ||
    intent === "roadmap.explain_recommendation" ||
    intent === "roadmap.adjust"
  ) {
    return [
      {
        id: "show-roadmap",
        label: intent === "roadmap.adjust" ? "Điều chỉnh lộ trình" : "Xem lộ trình",
        type: "show_roadmap",
        payload: {
          roadmapId: context.data.roadmap?.id,
        },
      },
    ];
  }

  if (intent === "flashcard.personal") {
    return [
      {
        id: "open-flashcards",
        label: "Mở flashcard",
        type: "open_flashcards",
        payload: {},
      },
    ];
  }

  if (intent === "app.navigation_support") {
    return [
      {
        id: "show-roadmap",
        label: "Mở lộ trình",
        type: "show_roadmap",
        payload: {},
      },
      {
        id: "open-flashcards",
        label: "Mở flashcard",
        type: "open_flashcards",
        payload: {},
      },
    ];
  }

  return [];
}
