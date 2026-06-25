import {
  STUDENT_ANSWER_END,
  STUDENT_ANSWER_START,
} from "./chat_prompt_builder.service";

function normalizeForPolicy(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function removeSelfCheckLines(reply: string) {
  const selfCheckLine =
    /^\s*(?:[-*]\s*)?(?:check constraint|step\s*\d+|short|no checklists?|[23]-[45]\s*(?:sentences?|cau|doan)|starts with|explains based|handles|ends with|no internal labels|constraint check|tone check)\b.*$/i;

  return reply
    .split(/\r?\n/)
    .filter((line) => !selfCheckLine.test(line.trim()))
    .join("\n")
    .trim();
}

function extractTaggedFinalAnswer(reply: string) {
  const taggedAnswer = new RegExp(
    `${STUDENT_ANSWER_START}\\s*([\\s\\S]*?)\\s*${STUDENT_ANSWER_END}`,
    "gi"
  );
  let match: RegExpExecArray | null;
  let lastTaggedAnswer = "";

  while ((match = taggedAnswer.exec(reply)) !== null) {
    lastTaggedAnswer = match[1].trim();
  }

  if (lastTaggedAnswer) return lastTaggedAnswer;

  const lastOpenTag = reply.toUpperCase().lastIndexOf(STUDENT_ANSWER_START);
  if (lastOpenTag >= 0) {
    return reply.slice(lastOpenTag + STUDENT_ANSWER_START.length).trim();
  }

  return reply;
}

function removeAnswerWrapperTags(reply: string) {
  return reply
    .replace(new RegExp(STUDENT_ANSWER_START, "gi"), "")
    .replace(new RegExp(STUDENT_ANSWER_END, "gi"), "")
    .trim();
}

function removeStudentFacingLabels(reply: string) {
  const labelLine =
    /^\s*(?:[-*]\s*)?(?:\*+)?(?:intro|explanation|tip(?:\/next step)?|next step)(?:\*+)?\s*:\s*/i;

  return reply
    .split(/\r?\n/)
    .map((line) => line.replace(labelLine, "").trimEnd())
    .join("\n")
    .trim();
}

function stripReasoningDraft(reply: string) {
  const taggedAnswer = extractTaggedFinalAnswer(reply);
  const withoutWrappers = removeAnswerWrapperTags(taggedAnswer);
  const withoutSelfChecks = removeSelfCheckLines(withoutWrappers);
  const finalMarkers = [
    "Chào bạn, mình sẽ hỗ trợ",
    "Chào bạn, mình sẽ giúp",
    "Chào bạn",
    "Bạn đã chọn",
    "Bạn chọn",
    "Đáp án đúng",
    "Intro:",
    "Ban da chon",
    "Ban chon",
    "Dap an dung",
    "*Intro:",
    "*   *Intro:*",
  ];

  const lines = withoutSelfChecks.split(/\r?\n/);
  let bestLineIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const normalizedLine = normalizeForPolicy(lines[i].trim());
    if (
      finalMarkers.some((marker) =>
        normalizedLine.startsWith(normalizeForPolicy(marker))
      )
    ) {
      bestLineIndex = i;
    }
  }

  const finalAnswer =
    bestLineIndex > 0
      ? lines.slice(bestLineIndex).join("\n").trim()
      : withoutSelfChecks.trim();

  return removeStudentFacingLabels(finalAnswer);
}

function compactStudentReply(reply: string) {
  return reply
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateReply(reply: string, fallback: string) {
  if (!reply || reply.length > 5000) return fallback;
  const cleaned = compactStudentReply(stripReasoningDraft(reply));
  if (!cleaned) return fallback;
  const forbidden = [
    "toi da doi lo trinh",
    "minh da doi lo trinh",
    "chac chan dat",
    "dam bao dat",
  ];
  const debugMarkers = [
    "step 1",
    "step 2",
    "drafting",
    "tone check",
    "constraint check",
    "friendly toeic assistant",
    "trusted_context",
    "short?",
    "no checklist",
    "no checklists",
    "3-5 sentences",
    "3-5 cau",
    "starts with",
    "explains based",
    "handles ",
    "ends with",
    "no internal labels",
  ];
  const promptEchoMarkers = [
    "persona:",
    "role:",
    "task:",
    "user_message:",
    "trusted_context",
    "explain_question_rules",
    "output_rules",
    "correctanswer",
    "historysummary",
  ];
  const lower = normalizeForPolicy(cleaned);
  if (forbidden.some((phrase) => lower.includes(phrase))) return fallback;
  const cleanedAgain = compactStudentReply(removeSelfCheckLines(cleaned));
  if (!cleanedAgain) return fallback;
  const lowerAgain = normalizeForPolicy(cleanedAgain);
  if (forbidden.some((phrase) => lowerAgain.includes(phrase))) return fallback;
  if (promptEchoMarkers.some((marker) => lowerAgain.includes(marker))) return fallback;
  const hasOnlyStyleNoise =
    debugMarkers.some((marker) => lowerAgain.includes(marker)) &&
    lowerAgain.length < 120;
  if (hasOnlyStyleNoise) return fallback;
  return cleanedAgain;
}
