type FormatDbTextOptions = {
  maxLength?: number;
  bulletizeSentences?: boolean;
};

const SECTION_LABELS: Record<string, string> = {
  explanation: "Giải thích",
  "giai thich": "Giải thích",
  translation: "Bản dịch",
  "dich cau": "Bản dịch",
  "ban dich": "Bản dịch",
  vocabulary: "Từ vựng",
  "tu vung": "Từ vựng",
  reminder: "Cần nhớ",
  note: "Ghi chú",
};

function normalizeLabel(label = "") {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactWhitespace(text = "") {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(
      /\s+(Explanation|Giai thich|Giải thích|Translation|Dich cau|Dịch câu|Ban dich|Bản dịch|Vocabulary|Tu vung|Từ vựng|Reminder|Note)\s*:/gi,
      "\n$1:"
    )
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateAtBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const boundary = Math.max(
    slice.lastIndexOf("\n"),
    slice.lastIndexOf(". "),
    slice.lastIndexOf("; "),
    slice.lastIndexOf(", ")
  );
  const safeSlice = boundary > maxLength * 0.55 ? slice.slice(0, boundary) : slice;
  return `${safeSlice.trim()}...`;
}

function normalizeBullet(line: string) {
  return line
    .replace(/^\s*[-*•]\s*/, "- ")
    .replace(/^\s*\d+[.)]\s*/, "- ")
    .trim();
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ỹ0-9])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatLabeledLine(line: string) {
  const match = line.match(/^([^:]{2,35})\s*:\s*(.+)$/);
  if (!match) return line;

  const label = SECTION_LABELS[normalizeLabel(match[1])];
  if (!label) return line;

  return `**${label}:** ${match[2].trim()}`;
}

export function formatDbTextForChat(
  rawText: unknown,
  options: FormatDbTextOptions = {}
) {
  const maxLength = options.maxLength ?? 900;
  const normalized = compactWhitespace(String(rawText ?? ""));
  if (!normalized) return "";

  const lines = normalized
    .split("\n")
    .map((line) => normalizeBullet(line))
    .filter(Boolean)
    .map(formatLabeledLine);

  const hasStructure = lines.some(
    (line) => line.startsWith("- ") || line.startsWith("**")
  );

  let formatted = "";
  if (hasStructure || lines.length > 1) {
    formatted = lines.join("\n");
  } else if (options.bulletizeSentences) {
    const sentences = splitSentences(lines[0]);
    formatted =
      sentences.length >= 2
        ? sentences.slice(0, 4).map((sentence) => `- ${sentence}`).join("\n")
        : lines[0];
  } else {
    formatted = lines[0];
  }

  return truncateAtBoundary(formatted, maxLength);
}

export function formatDbTextForCard(rawText: unknown, maxLength = 700) {
  return formatDbTextForChat(rawText, {
    maxLength,
    bulletizeSentences: true,
  });
}

export function formatDbInlineText(rawText: unknown, maxLength = 160) {
  const normalized = compactWhitespace(String(rawText ?? "")).replace(/\n+/g, " ");
  return truncateAtBoundary(normalized, maxLength);
}
