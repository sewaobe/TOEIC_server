import { GoogleGenerativeAI } from "@google/generative-ai";

type GeminiModelConfig = {
  model: string;
  timeoutMs: number;
};

export type LlmGenerationResult = {
  text: string;
  model: string;
};

type StreamChunkHandler = (chunk: string) => boolean | void;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const CHAT_TEXT_MODEL_CHAIN: GeminiModelConfig[] = [
  { model: "gemini-2.5-flash", timeoutMs: 30_000 },
  { model: "gemini-3-flash-preview", timeoutMs: 20_000 },
  { model: "gemini-3.1-flash-lite", timeoutMs: 20_000 },
  { model: "gemini-3.1-flash-lite-preview", timeoutMs: 20_000 },
  { model: "gemini-2.5-flash-lite", timeoutMs: 20_000 },
  { model: "gemma-4-31b-it", timeoutMs: 35_000 },
];

function getGeminiErrorStatus(error: any) {
  return error?.status ?? error?.code ?? error?.error?.code ?? error?.response?.status;
}

function summarizeGeminiError(err: unknown) {
  const error = err as any;
  const status = getGeminiErrorStatus(error);
  const message = String(error?.message ?? error ?? "Unknown Gemini error").replace(/\s+/g, " ").trim();
  return status ? `${status}: ${message.slice(0, 240)}` : message.slice(0, 240);
}

function isTransientGeminiError(err: unknown) {
  const error = err as any;
  const status = Number(getGeminiErrorStatus(error));
  const message = String(error?.message ?? "").toLowerCase();
  const statusMatches = [404, 429, 500, 502, 503, 504].includes(status);
  const transientMessages = [
    "503 service unavailable",
    "fetch failed",
    "high demand",
    "rate",
    "rate limit",
    "quota",
    "timeout",
    "timed out",
    "overloaded",
    "unavailable",
    "resource_exhausted",
    "resource exhausted",
    "deadline_exceeded",
    "deadline exceeded",
    "internal",
    "model not found",
    "not found",
  ];

  return (
    error?.code === "AI_TIMEOUT" ||
    statusMatches ||
    transientMessages.some((item) => message.includes(item))
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        const err = new Error(`Gemini request timed out after ${timeoutMs}ms`);
        (err as any).code = "AI_TIMEOUT";
        reject(err);
      }, timeoutMs);
    }),
  ]);
}

async function callModel(prompt: string, config: GeminiModelConfig) {
  const model = genAI.getGenerativeModel({ model: config.model });
  const result = await withTimeout(model.generateContent(prompt), config.timeoutMs);
  return result.response.text();
}

async function streamModel(
  prompt: string,
  config: GeminiModelConfig,
  onChunk: StreamChunkHandler
) {
  let fullText = "";
  let emittedChunk = false;
  let cancelled = false;
  const model = genAI.getGenerativeModel({ model: config.model });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cancelled = true;
      const err = new Error(`Gemini request timed out after ${config.timeoutMs}ms`);
      (err as any).code = "AI_TIMEOUT";
      reject(err);
    }, config.timeoutMs);

    (async () => {
      const result = await model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        if (cancelled) break;
        const chunkText = chunk.text();
        if (!chunkText) continue;
        fullText += chunkText;
        emittedChunk = onChunk(chunkText) === true || emittedChunk;
      }
      clearTimeout(timer);
      resolve();
    })().catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return { text: fullText, emittedChunk };
}

export async function generateFromPromptWithMeta(prompt: string): Promise<LlmGenerationResult> {
  let lastError: unknown;

  for (let index = 0; index < CHAT_TEXT_MODEL_CHAIN.length; index += 1) {
    const config = CHAT_TEXT_MODEL_CHAIN[index];
    try {
      console.info(`[llm] Trying chat model: ${config.model}`);
      const text = await callModel(prompt, config);
      console.info(`[llm] Chat model succeeded: ${config.model}`);
      return { text, model: config.model };
    } catch (err) {
      lastError = err;
      const canRetry = isTransientGeminiError(err) && index < CHAT_TEXT_MODEL_CHAIN.length - 1;
      console.warn(
        `[llm] Chat model failed: ${config.model}; retry=${canRetry}; error=${summarizeGeminiError(err)}`
      );
      if (!isTransientGeminiError(err)) throw err;
    }
  }

  throw lastError ?? new Error("Gemini model chain failed");
}

export async function streamFromPromptWithMeta(
  prompt: string,
  onChunk: StreamChunkHandler
): Promise<LlmGenerationResult> {
  let lastError: unknown;

  for (let index = 0; index < CHAT_TEXT_MODEL_CHAIN.length; index += 1) {
    const config = CHAT_TEXT_MODEL_CHAIN[index];
    let hasEmittedChunk = false;
    try {
      console.info(`[llm] Trying chat stream model: ${config.model}`);
      const result = await streamModel(prompt, config, (chunk) => {
        const emitted = onChunk(chunk) === true;
        hasEmittedChunk = emitted || hasEmittedChunk;
        return emitted;
      });
      console.info(`[llm] Chat stream model succeeded: ${config.model}`);
      return { text: result.text, model: config.model };
    } catch (err) {
      lastError = err;
      const canRetry = !hasEmittedChunk && isTransientGeminiError(err) && index < CHAT_TEXT_MODEL_CHAIN.length - 1;
      console.warn(
        `[llm] Chat stream model failed: ${config.model}; emitted=${hasEmittedChunk}; retry=${canRetry}; error=${summarizeGeminiError(err)}`
      );
      if (hasEmittedChunk || !isTransientGeminiError(err)) throw err;
    }
  }

  throw lastError ?? new Error("Gemini model chain failed");
}

export async function generateFromPrompt(prompt: string) {
  const result = await generateFromPromptWithMeta(prompt);
  return result.text;
}

export async function generateAnswer(question: string, context: string) {
  const prompt = `
        Bạn là trợ lý TOEIC thân thiện, chỉ trả lời dựa trên thông tin được cung cấp dưới đây.
        Nếu người dùng hỏi về chủ đề ngoài TOEIC hoặc ngoài dữ liệu, bạn PHẢI trả lời:
        "Mình chưa có thông tin cho câu này."

        --- DỮ LIỆU LIÊN QUAN (context) ---
        ${context}
        ------------------------------------

        Người học hỏi: "${question}"

        Yêu cầu:
        - Trả lời ngắn gọn, chính xác, chỉ dựa trên thông tin trong context.
        - Nếu context không chứa thông tin, nói đúng mẫu câu trên.
        - Viết bằng tiếng Việt tự nhiên, thân thiện, dễ hiểu.
    `;

  const result = await generateFromPromptWithMeta(prompt);
  return result.text;
}
