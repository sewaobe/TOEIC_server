import {
  ChatErrorType,
  DbFirstContext,
} from "../types/chat.types";

function normalizeContextErrorType(context: DbFirstContext): ChatErrorType | undefined {
  if (context.ok) return undefined;
  switch (context.errorType) {
    case "MISSING_CONTEXT":
      if (context.outcome === "forbidden") return "UNAUTHORIZED";
      if (context.outcome === "no_data") return "NO_USER_DATA";
      return "MISSING_REQUIRED_CONTEXT";
    case "NO_DATA":
      return "NO_USER_DATA";
    default:
      return context.errorType;
  }
}

export function buildInitialResponseState(context: DbFirstContext): {
  errorType?: ChatErrorType;
  reply: string;
  contextType: string;
} {
  return {
    errorType: normalizeContextErrorType(context),
    reply: context.ok ? "Mình cần thêm ngữ cảnh để trả lời chính xác hơn." : context.fallback,
    contextType: context.ok ? context.contextType : "none",
  };
}
