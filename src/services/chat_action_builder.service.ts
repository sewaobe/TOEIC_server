import {
  ChatAction,
  ChatIntent,
} from "../types/chat.types";

function normalizeActionText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildActions(
  intent: ChatIntent,
  context: any,
  options: { userText?: string } = {}
): ChatAction[] {
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
        type: "recommend_similar_practice",
        payload: {
          part: question.part,
          tags: question.tags,
          sourceQuestionId: question.id,
          questionId: question.id,
          attemptId: attempt.id,
          testId: attempt.testId,
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

  if (
    intent === "check_progress" ||
    intent === "user_progress.summary" ||
    intent === "user_progress.ability_map"
  ) {
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

  if (intent === "flashcard.create") {
    return [
      {
        id: "open-created-flashcard-deck",
        label: "Học ngay",
        type: "open_flashcard_deck",
        payload: {
          topicVocabularyId: context.data.topicVocabularyId,
        },
      },
    ];
  }

  if (intent === "app.navigation_support") {
    const value = normalizeActionText(options.userText);
    if (/\b(cau sai|loi sai|review|ket qua|bai lam|attempt|lich su)\b/.test(value)) {
      return [
        {
          id: "open-attempt-review",
          label: "Mở review câu sai",
          type: "open_attempt_review",
          payload: {
            target: "mistake_review",
          },
        },
        {
          id: "open-test-result",
          label: "Mở kết quả bài làm",
          type: "open_test_result",
          payload: {
            target: "test_result",
          },
        },
      ];
    }

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
