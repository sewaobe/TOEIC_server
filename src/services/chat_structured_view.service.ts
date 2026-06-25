import {
  ChatAction,
  ChatErrorType,
  ChatIntent,
  ChatRouteContext,
  DbFirstContext,
  IChatStructuredView,
  IQuickQuestionView,
  IStructuredListItem,
  IStructuredStatItem,
} from "../types/chat.types";
import {
  formatDbInlineText,
  formatDbTextForCard,
} from "./chat_db_text_formatter.service";

type BuildStructuredViewInput = {
  intent: ChatIntent;
  context: DbFirstContext;
  reply: string;
  actions: ChatAction[];
  routeContext?: ChatRouteContext;
  errorType?: ChatErrorType | string;
  quickQuestionView?: IQuickQuestionView;
};

function percent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${Math.round(numeric)}%`;
}

function numberText(value: unknown, fallback = "0") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return String(Math.round(numeric));
}

function compactReply(reply: string, maxLength = 900) {
  return formatDbTextForCard(reply, maxLength);
}

function formatChoice(choices: any, key?: string) {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return "Chưa chọn";
  const value = choices?.[normalizedKey];
  if (!value) return normalizedKey;
  return `${normalizedKey}. ${formatDbInlineText(value, 220)}`;
}

function questionLabel(routeContext?: ChatRouteContext) {
  const questionNumber = Number(routeContext?.currentQuestionNumber);
  return Number.isFinite(questionNumber) && questionNumber > 0
    ? `Câu ${questionNumber}`
    : "Câu hỏi hiện tại";
}

function buildFallbackView(
  context: DbFirstContext,
  reply: string,
  errorType?: ChatErrorType | string
): IChatStructuredView {
  const isMissingContext =
    errorType === "MISSING_CONTEXT" ||
    errorType === "MISSING_REQUIRED_CONTEXT" ||
    (!context.ok &&
      (context.errorType === "MISSING_CONTEXT" ||
        context.errorType === "MISSING_REQUIRED_CONTEXT"));
  return {
    type: "fallback_notice",
    title: isMissingContext ? "Thiếu ngữ cảnh để trả lời" : "Chưa thể trả lời ngay",
    subtitle: isMissingContext
      ? "Mình cần thêm dữ liệu từ trang hiện tại để tránh đoán sai."
      : "Yêu cầu này đang được chuyển về phản hồi an toàn.",
    message: compactReply(reply || (!context.ok ? context.fallback : ""), 700),
    tone: isMissingContext ? "warning" : "info",
  };
}

function buildProgressView(context: DbFirstContext): IChatStructuredView | undefined {
  if (!context.ok) return undefined;
  const progress = context.data.progress;
  const latestTest = context.data.latestTest;
  const weakParts = (context.data.skillParts ?? [])
    .filter((part: any) => part.status === "weak")
    .map((part: any) => `Part ${part.part_type}`)
    .slice(0, 4);

  const stats: IStructuredStatItem[] = [
    {
      label: "Hoàn thành",
      value: progress
        ? `${numberText(progress.completedLessons)}/${numberText(progress.totalLessons)} bài`
        : "Chưa có",
      tone: "info",
    },
    {
      label: "Tỷ lệ",
      value: progress ? percent(progress.completionRate) : "0%",
      tone: "success",
    },
    {
      label: "Streak",
      value: `${numberText(progress?.streakDays)} ngày`,
      tone: "warning",
    },
    {
      label: "Điểm gần nhất",
      value: latestTest ? `${numberText(latestTest.score)} điểm` : "Chưa có",
      tone: latestTest ? "success" : "default",
    },
  ];

  const highlights: IStructuredListItem[] = [
    progress?.totalStudyTime
      ? { label: "Tổng thời gian học", value: `${numberText(progress.totalStudyTime)} phút`, tone: "info" }
      : null,
    progress?.targetScore
      ? { label: "Mục tiêu", value: `${numberText(progress.targetScore)} điểm`, tone: "success" }
      : null,
    latestTest?.submittedAt
      ? { label: "Bài test gần nhất", value: new Date(latestTest.submittedAt).toLocaleDateString("vi-VN") }
      : null,
  ].filter(Boolean) as IStructuredListItem[];

  return {
    type: "progress_summary",
    title: "Tổng quan tiến độ",
    subtitle: "Dữ liệu được lấy từ hồ sơ học tập và bài test gần nhất.",
    stats,
    highlights,
    weakParts,
    nextStep: "Mở lộ trình và hoàn thành hoạt động được giao cho hôm nay.",
  };
}

function buildTestAttemptView(context: DbFirstContext, reply: string): IChatStructuredView | undefined {
  if (!context.ok) return undefined;
  const attempt = context.data.attempt;
  const totalQuestions = Number(attempt.totalQuestions ?? 0);
  const correctCount = Number(attempt.correctCount ?? 0);
  const wrongCount = Number(attempt.wrongCount ?? 0);
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const stats: IStructuredStatItem[] = [
    { label: "Điểm", value: `${numberText(attempt.score)} điểm`, tone: "success" },
    { label: "Đúng", value: `${numberText(correctCount)}/${numberText(totalQuestions)} câu`, tone: "success" },
    { label: "Sai", value: `${numberText(wrongCount)} câu`, tone: wrongCount ? "danger" : "success" },
    { label: "Độ chính xác", value: `${accuracy}%`, tone: accuracy >= 70 ? "success" : "warning" },
  ];

  const weakTags = (context.data.topWeakTags ?? []).slice(0, 6).map((item: any) => ({
    label: formatDbInlineText(String(item.tag ?? "Kỹ năng yếu"), 80),
    value: `${numberText(item.count)} câu`,
    tone: "warning",
  }));

  const wrongAnswers = (context.data.wrongAnswers ?? []).slice(0, 6).map((item: any) => ({
    label: formatDbInlineText(item.name || item.part || "Câu sai", 90),
    value: `${item.selectedOption || "?"} -> ${item.correctAnswer || "?"}`,
    tone: "danger",
  }));

  return {
    type: "test_attempt_analysis",
    title: "Phân tích bài test",
    subtitle: attempt.submittedAt
      ? `Nộp ngày ${new Date(attempt.submittedAt).toLocaleDateString("vi-VN")}`
      : "Dữ liệu lấy từ bài làm hiện tại.",
    stats,
    weakTags,
    wrongAnswers,
    summary: compactReply(reply, 650),
  };
}

function buildQuestionContextView(
  context: DbFirstContext,
  reply: string,
  routeContext?: ChatRouteContext
): IChatStructuredView | undefined {
  if (!context.ok) return undefined;
  const question = context.data.question;
  const attempt = context.data.currentAttempt ?? context.data.attempt;
  const userAnswer = attempt?.userAnswer ?? context.data.userAnswer ?? "";
  const isCorrect = attempt?.isCorrect ?? context.data.isCorrect;
  const status =
    userAnswer === "" ? "skipped" : isCorrect === true ? "correct" : isCorrect === false ? "wrong" : "neutral";

  return {
    type: "question_context",
    title: questionLabel(routeContext),
    subtitle: question?.part ? String(question.part) : undefined,
    status,
    stats: [
      question?.plannedTime ? { label: "Thời gian gợi ý", value: `${numberText(question.plannedTime)} giây`, tone: "info" } : null,
      context.data.group?.media?.hasAudio ? { label: "Audio", value: "Có", tone: "info" } : null,
      context.data.group?.media?.hasImages ? { label: "Hình ảnh", value: "Có", tone: "info" } : null,
    ].filter(Boolean) as IStructuredStatItem[],
    questionText: question?.textQuestion ? formatDbInlineText(question.textQuestion, 320) : undefined,
    userAnswer: formatChoice(question?.choices, userAnswer),
    correctAnswer: formatChoice(question?.choices, question?.correctAnswer),
    answer: compactReply(reply, 900),
    reminder: Array.isArray(question?.tags) && question.tags.length
      ? `Luyện lại ${question.tags
          .map((tag: string) => String(tag).replace(/\[|\]/g, "").trim())
          .filter(Boolean)
          .filter((tag: string) => !/^part\s*\d+$/i.test(tag))
          .slice(0, 3)
          .join(", ")}.`
      : undefined,
  };
}

function buildRoadmapView(context: any): IChatStructuredView {
  const roadmap = context.data.roadmap;
  const nextStep = context.data.nextStep;
  return {
    type: "progress_summary",
    title: roadmap.title || "Lộ trình học",
    subtitle: `Tuần ${roadmap.currentWeek}/${roadmap.totalWeeks || roadmap.currentWeek}`,
    stats: [
      {
        label: "Hoàn thành",
        value: `${roadmap.completedDays}/${roadmap.totalDays} ngày`,
        tone: "success",
      },
      {
        label: "Tiến độ",
        value: `${roadmap.completionRate}%`,
        tone: "info",
      },
      {
        label: "Mục tiêu",
        value: roadmap.targetScore ? `${roadmap.targetScore} điểm` : "Chưa đặt",
      },
    ],
    nextStep: nextStep
      ? `${nextStep.title || `Buổi ${nextStep.sessionNo}`}${nextStep.part ? ` - Part ${nextStep.part}` : ""}`
      : "Đã hoàn thành các hoạt động hiện có.",
  };
}

function buildNavigationView(intent: ChatIntent): IChatStructuredView {
  if (intent === "flashcard.personal") {
    return {
      type: "navigation_support",
      title: "Ôn flashcard",
      subtitle: "Mình đã chuẩn bị thao tác mở khu vực flashcard cho bạn.",
      items: [
        { label: "Flashcard cá nhân", value: "Ôn từ đến hạn hoặc xem lại bộ từ đã lưu.", tone: "info" },
      ],
    };
  }

  if (intent === "roadmap.guidance") {
    return {
      type: "navigation_support",
      title: "Lộ trình học",
      subtitle: "Bạn có thể mở roadmap để xem bước tiếp theo.",
      items: [
        { label: "Roadmap", value: "Xem nhiệm vụ hôm nay và cập nhật kế hoạch học.", tone: "success" },
      ],
    };
  }

  return {
    type: "navigation_support",
    title: "Điều hướng trong app",
    subtitle: "Chọn thao tác phù hợp bên dưới để đi tới đúng tính năng.",
    items: [
      { label: "Lộ trình", value: "Xem kế hoạch học và nhiệm vụ hôm nay.", tone: "success" },
      { label: "Flashcard", value: "Ôn lại từ vựng cá nhân.", tone: "info" },
    ],
  };
}

export function buildChatStructuredView(input: BuildStructuredViewInput): IChatStructuredView | undefined {
  if (input.quickQuestionView) return undefined;
  if (!input.context.ok) return buildFallbackView(input.context, input.reply, input.errorType);

  if (input.intent === "check_progress" || input.intent === "user_progress.summary") {
    return buildProgressView(input.context);
  }

  if (input.intent === "analyze_test_result" || input.intent === "test_attempt.analysis") {
    return buildTestAttemptView(input.context, input.reply);
  }

  if (
    input.intent === "explain_question" ||
    input.intent === "question.explain_specific" ||
    input.intent === "question.translate_context" ||
    input.intent === "vocabulary.contextual" ||
    input.intent === "grammar.contextual"
  ) {
    return buildQuestionContextView(input.context, input.reply, input.routeContext);
  }

  if (
    input.intent === "roadmap.summary" ||
    input.intent === "roadmap.next_step" ||
    input.intent === "roadmap.explain_recommendation" ||
    input.intent === "roadmap.adjust"
  ) {
    return buildRoadmapView(input.context);
  }

  if (
    input.intent === "roadmap.guidance" ||
    input.intent === "flashcard.personal" ||
    input.intent === "app.navigation_support"
  ) {
    return buildNavigationView(input.intent);
  }

  if (input.errorType) return buildFallbackView(input.context, input.reply, input.errorType);
  return undefined;
}
