import { ChatIntent } from "../types/chat.types";
import {
  formatDbInlineText,
  formatDbTextForChat,
} from "./chat_db_text_formatter.service";

type TemplateOptions = {
  sessionId?: string;
  userText?: string;
  now?: Date;
  clientContext?: any;
  routeContext?: any;
};

const smalltalkTemplates: Record<string, string[]> = {
  greeting: [
    "Chào bạn, hôm nay mình có thể giúp bạn xem tiến độ, phân tích câu sai hoặc luyện thêm phần đang yếu.",
    "Chào bạn. Bạn muốn mình xem tiến độ học, giải thích một câu TOEIC, hay phân tích bài test gần nhất?",
    "Mình đây. Bạn cứ gửi câu cần hỏi, hoặc hỏi nhanh về tiến độ và điểm yếu hiện tại nhé.",
  ],
  thanks: [
    "Không có gì. Khi cần xem lại câu sai hoặc lên bước học tiếp theo, bạn cứ hỏi mình.",
    "Rất sẵn lòng. Nếu muốn, bạn có thể gửi tiếp câu TOEIC đang vướng.",
    "Ok bạn. Mình vẫn ở đây nếu bạn muốn phân tích thêm câu sai hoặc tiến độ học.",
  ],
  ack: [
    "Ok, mình nắm rồi. Bạn muốn xử lý tiếp phần nào?",
    "Được nhé. Bạn có thể hỏi tiếp về câu sai, kết quả bài test hoặc lộ trình học.",
    "Ừm, mình hiểu. Gửi tiếp nội dung bạn muốn xem kỹ hơn nhé.",
  ],
  emotion_support: [
    "Mình hiểu. Học TOEIC có lúc rất nản, nhất là khi làm sai liên tục. Bạn nghỉ vài phút rồi quay lại bằng một việc nhỏ thôi: xem lại 1 câu sai hoặc làm 3 câu cùng dạng.",
    "Nghe có vẻ hôm nay bạn đang hơi đuối. Mình đề xuất giảm nhịp lại: nghỉ 3-5 phút, sau đó chỉ chọn một phần nhỏ để làm tiếp, không cần ép làm cả set.",
    "Nản là bình thường khi học một kỹ năng dài hơi như TOEIC. Mình ở đây để giúp bạn chia nhỏ việc học: chọn một câu sai, một từ mới, hoặc một bài ngắn để xử lý trước.",
  ],
  fallback: [
    "Mình có thể hỗ trợ nhanh về tiến độ, điểm yếu, câu sai TOEIC và bài test của bạn.",
    "Bạn có thể hỏi mình kiểu: tiến độ của tôi thế nào, vì sao câu này sai, hoặc phân tích bài test này.",
    "Mình đang sẵn sàng hỗ trợ học TOEIC theo dữ liệu của bạn: tiến độ, câu sai, bài test và phần cần luyện thêm.",
  ],
};

function normalizeText(text = "") {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function resolveSmalltalkSubtype(text = "") {
  const normalized = normalizeText(text);
  if (/\b(thanks?|thank you|cam on|thank)\b/.test(normalized)) return "thanks";
  if (/^(ok|okay|oke|uhm|um|u|duoc|yes|yeah|yep)\b/.test(normalized)) return "ack";
  if (/\b(hi|hello|hey|chao|xin chao|alo)\b/.test(normalized)) return "greeting";
  if (
    /\b(chan|nan|met|duoi|ap luc|stress|cang thang|buon ngu|kho qua|roi qua|het dong luc|khong muon hoc)\b/.test(
      normalized
    )
  ) {
    return "emotion_support";
  }
  return "fallback";
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickSmalltalkTemplate(options: TemplateOptions = {}) {
  const subtype = resolveSmalltalkSubtype(options.userText);
  const pool = smalltalkTemplates[subtype] ?? smalltalkTemplates.fallback;
  const now = options.now ?? new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const index = hashString(`${options.sessionId ?? ""}:${dateKey}:${subtype}`) % pool.length;
  return pool[index];
}

function compactTemplateText(text = "", maxLength = 900) {
  return formatDbTextForChat(text, {
    maxLength,
    bulletizeSentences: true,
  });
}

function formatChoice(choices: any, key?: string) {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return "chưa chọn";
  const value = choices?.[normalizedKey];
  if (!value) return normalizedKey;
  return `${normalizedKey}. ${formatDbInlineText(value, 220)}`;
}

function formatQuestionLabel(routeContext?: any) {
  const questionNumber = Number(routeContext?.currentQuestionNumber);
  return Number.isFinite(questionNumber) && questionNumber > 0
    ? `Câu ${questionNumber}`
    : "Câu này";
}

function buildQuickQuestionExplainTemplate(context: any, options: TemplateOptions = {}) {
  const question = context.data.question;
  const attempt = context.data.currentAttempt ?? context.data.attempt;
  const userAnswer = attempt?.userAnswer ?? context.data.userAnswer ?? "";
  const isCorrect = attempt?.isCorrect ?? context.data.isCorrect;
  const status = userAnswer === "" ? "Bỏ qua" : isCorrect ? "Đúng" : "Sai";
  const tags = Array.isArray(question.tags)
    ? question.tags
        .map((tag: string) => String(tag).replace(/\[|\]/g, "").trim())
        .filter(Boolean)
        .filter((tag: string) => !/^part\s*\d+$/i.test(tag))
        .slice(0, 3)
    : [];

  const lines = [
    `${formatQuestionLabel(options.routeContext)} - ${status}`,
    `- Bạn chọn: ${formatChoice(question.choices, userAnswer)}`,
    `- Đáp án đúng: ${formatChoice(question.choices, question.correctAnswer)}`,
  ];

  if (question.explanation) {
    const formattedExplanation = compactTemplateText(question.explanation, 650);
    if (formattedExplanation.startsWith("**Giải thích:**")) {
      lines.push(formattedExplanation);
    } else {
      lines.push("Giải thích:");
      lines.push(formattedExplanation);
    }
  } else if (context.data.contextQuality?.hasMediaOnly) {
    lines.push("- Giải thích: Câu này chỉ có audio/ảnh trong DB, chưa có transcript hoặc lời giải dạng text.");
  } else {
    lines.push("- Giải thích: DB chưa có lời giải chi tiết cho câu này.");
  }

  if (tags.length) {
    lines.push(`- Cần nhớ: luyện lại ${tags.join(", ")}.`);
  }

  return lines.join("\n");
}

export function buildTemplateReply(intent: ChatIntent, context: any, options: TemplateOptions = {}) {
  if (intent === "smalltalk" || intent === "smalltalk.greeting_feedback") {
    return pickSmalltalkTemplate(options);
  }

  if (
    (intent === "explain_question" || intent === "question.explain_specific") &&
    context.ok &&
    options.clientContext?.sourceAction === "quick_question_explain"
  ) {
    return buildQuickQuestionExplainTemplate(context, options);
  }

  if (intent === "identify_question") {
    const question = context.data.question;
    const questionLabel = question.questionNumber ? `câu ${question.questionNumber}` : "câu này";
    const textQuestion = question.textQuestion
      ? formatDbInlineText(question.textQuestion, 260)
      : "(câu hỏi này không có nội dung text hiển thị)";
    return `Mình đang hiểu bạn đang hỏi ${questionLabel}: "${textQuestion}"`;
  }

  if (
    intent === "roadmap.summary" ||
    intent === "roadmap.next_step" ||
    intent === "roadmap.adjust"
  ) {
    const roadmap = context.data.roadmap;
    const nextStep = context.data.nextStep;

    if (intent === "roadmap.summary") {
      return [
        `Lộ trình "${roadmap.title}" hiện hoàn thành ${roadmap.completedDays}/${roadmap.totalDays} ngày (${roadmap.completionRate}%).`,
        `Bạn đang ở tuần ${roadmap.currentWeek}/${roadmap.totalWeeks || roadmap.currentWeek}.`,
        nextStep
          ? `Bước tiếp theo: ${nextStep.title || `buổi ${nextStep.sessionNo}`}${nextStep.part ? `, Part ${nextStep.part}` : ""}${nextStep.plannedMinutes ? ` (${nextStep.plannedMinutes} phút)` : ""}.`
          : "Bạn đã hoàn thành các hoạt động hiện có trong lộ trình.",
      ].join("\n");
    }

    if (intent === "roadmap.next_step") {
      return nextStep
        ? `Bước tiếp theo của bạn là ${nextStep.title || `buổi ${nextStep.sessionNo}`}${nextStep.part ? ` ở Part ${nextStep.part}` : ""}${nextStep.plannedMinutes ? `, dự kiến ${nextStep.plannedMinutes} phút` : ""}.`
        : "Bạn đã hoàn thành các hoạt động hiện có trong lộ trình.";
    }

    return "Bạn có thể mở phần lộ trình để điều chỉnh kế hoạch học. Mình sẽ không tự thay đổi lộ trình khi chưa có thao tác xác nhận của bạn.";
  }

  if (intent === "roadmap.guidance") {
    return "Mình có thể mở lộ trình học để bạn xem bước tiếp theo, hoặc yêu cầu tạo lại roadmap nếu cần.";
  }

  if (intent === "flashcard.personal") {
    return "Mình có thể mở flashcard để bạn ôn các từ đến hạn. Nếu bạn hỏi nghĩa một từ cụ thể, hãy chọn từ hoặc gửi từ đó cho mình.";
  }

  if (intent === "app.navigation_support") {
    return "Mình có thể hỗ trợ mở lộ trình, flashcard, trang review câu sai hoặc hướng dẫn bạn tiếp tục luyện TOEIC.";
  }

  if (intent !== "check_progress" && intent !== "user_progress.summary") return context.fallback;

  const progress = context.data.progress;
  const latestTest = context.data.latestTest;
  const weakParts = (context.data.skillParts ?? [])
    .filter((part: any) => part.status === "weak")
    .map((part: any) => `Part ${part.part_type}`)
    .slice(0, 3);

  const lines = [
    "Tổng quan tiến độ của bạn:",
    progress
      ? `- Hoàn thành ${progress.completedLessons}/${progress.totalLessons} bài (${Math.round(progress.completionRate ?? 0)}%).`
      : "- Chưa có bản ghi progress tổng hợp.",
    progress
      ? `- Streak hiện tại: ${progress.streakDays ?? 0} ngày, tổng thời gian học: ${progress.totalStudyTime ?? 0} phút.`
      : "",
    latestTest
      ? `- Bài test gần nhất: ${latestTest.score ?? 0} điểm.`
      : "- Chưa có bài test gần nhất.",
    weakParts.length ? `- Phần cần ưu tiên: ${weakParts.join(", ")}.` : "- Chưa xác định phần yếu rõ ràng.",
    "Bước tiếp theo: mở lộ trình và hoàn thành hoạt động được giao cho hôm nay.",
  ];

  return lines.filter(Boolean).join("\n");
}
