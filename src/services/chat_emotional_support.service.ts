import { generateFromPromptWithMeta, LlmGenerationResult } from "../core/llm";
import { ChatMessage } from "../models/chat_message.model";
import { ChatClientContext, ChatRouteContext } from "../types/chat.types";
import { validateReply } from "./chat_response_validator.service";

const EMOTIONAL_SUPPORT_FALLBACK =
  "Mình hiểu. Học TOEIC có lúc rất nản, nhất là khi làm sai liên tục. Bạn nghỉ vài phút rồi quay lại bằng một việc nhỏ thôi: xem lại 1 câu sai hoặc làm 3 câu cùng dạng.";

async function loadRecentChatHistory(sessionId: string) {
  try {
    const messages = await ChatMessage.find({ session_id: sessionId })
      .sort({ created_at: -1 })
      .limit(20)
      .lean();

    return messages
      .reverse()
      .map((message) => `${message.sender === "user" ? "User" : "Bot"}: ${String(message.text ?? "").slice(0, 500)}`)
      .join("\n");
  } catch (err) {
    console.warn("Could not load chat history for emotional support:", err);
    return "";
  }
}

function summarizeRouteContext(routeContext?: ChatRouteContext) {
  if (!routeContext) return "(khong co route context)";
  return JSON.stringify({
    page: routeContext.page,
    hasQuestionId: !!routeContext.questionId,
    hasAttemptId: !!routeContext.attemptId,
    hasTestId: !!routeContext.testId,
    currentQuestionNumber: routeContext.currentQuestionNumber,
  });
}

function summarizeClientContext(clientContext?: ChatClientContext) {
  if (!clientContext) return "(khong co client context)";
  return JSON.stringify({
    sourceAction: clientContext.sourceAction,
    hasSelectedText: !!clientContext.selectedText,
    testTitle: clientContext.testTitle,
  });
}

function buildEmotionalSupportPrompt(params: {
  userText: string;
  history: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
}) {
  return `
ROLE:
Ban la tro ly hoc TOEIC trong app luyen thi. Nguoi dung dang the hien cam xuc met, chan, nan hoac mat dong luc.

RECENT_CHAT_HISTORY:
${params.history || "(khong co lich su chat gan day)"}

ROUTE_CONTEXT:
${summarizeRouteContext(params.routeContext)}

CLIENT_CONTEXT:
${summarizeClientContext(params.clientContext)}

USER_MESSAGE:
${params.userText}

RULES:
- Tra loi bang tieng Viet tu nhien, am ap, ngan gon trong 2-4 cau.
- Cong nhan cam xuc cua nguoi dung, khong day doi hay day guilt.
- Neu lich su chat gan day co noi ve Part, cau sai, tu vung, test hoac grammar, co the nhac lai theo kieu "vua roi ban dang vuong..." nhung chi khi that su co trong lich su.
- Khong bia diem so, tien do, cau sai, roadmap, flashcard, dap an dung, hoac du lieu ca nhan neu context khong co.
- Goi y mot buoc rat nho de tiep tuc hoc TOEIC: nghi 3-5 phut, xem lai 1 cau sai, lam 3 cau cung dang, nghe lai 1 audio ngan, hoac luu 1 tu moi.
- Khong noi ve intent, router, Chroma, RAG, prompt hay luat noi bo.
`.trim();
}

export async function generateEmotionalSupportReply(params: {
  sessionId: string;
  userText: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
}): Promise<LlmGenerationResult> {
  const history = await loadRecentChatHistory(params.sessionId);
  const prompt = buildEmotionalSupportPrompt({
    userText: params.userText,
    history,
    routeContext: params.routeContext,
    clientContext: params.clientContext,
  });
  const result = await generateFromPromptWithMeta(prompt);
  return {
    model: result.model,
    text: validateReply(result.text, EMOTIONAL_SUPPORT_FALLBACK),
  };
}
