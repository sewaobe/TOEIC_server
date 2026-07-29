import OpenAI from "openai";

type StreamChunkHandler = (chunk: string) => boolean | void;

export type DeepSeekGenerationResult = {
  text: string;
  model: string;
  provider: "deepseek";
};

export type DeepSeekJsonResult = DeepSeekGenerationResult & {
  json: any;
};

type DeepSeekTextOptions = {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

type DeepSeekJsonOptions = DeepSeekTextOptions & {
  jsonSchema?: unknown;
  taskName?: string;
};

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 45_000;

let deepSeekClient: OpenAI | null = null;
let cachedClientKey = "";
let cachedClientBaseUrl = "";

function getDeepSeekConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
  };
}

function getDeepSeekClient() {
  const { apiKey, baseURL } = getDeepSeekConfig();
  if (!apiKey) {
    const err = new Error("Missing DEEPSEEK_API_KEY in environment.");
    (err as any).code = "DEEPSEEK_NOT_CONFIGURED";
    throw err;
  }

  if (!deepSeekClient || cachedClientKey !== apiKey || cachedClientBaseUrl !== baseURL) {
    deepSeekClient = new OpenAI({ apiKey, baseURL });
    cachedClientKey = apiKey;
    cachedClientBaseUrl = baseURL;
  }

  return deepSeekClient;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
        const err = new Error(`${label} timed out after ${timeoutMs}ms`);
        (err as any).code = "AI_TIMEOUT";
        reject(err);
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function stripJsonFences(text: string) {
  let cleaned = text.trim().replace(/^\uFEFF/, "");
  if (!cleaned.startsWith("```")) return cleaned;

  const lines = cleaned.split(/\r?\n/);
  lines.shift();
  if (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

export function parseDeepSeekJson(text: string) {
  const cleaned = stripJsonFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("DeepSeek response did not contain a JSON object.");
    return JSON.parse(jsonMatch[0]);
  }
}

function buildJsonSystemPrompt(options: DeepSeekJsonOptions) {
  const schemaText = options.jsonSchema
    ? `\n\nTarget JSON schema/shape:\n${JSON.stringify(options.jsonSchema, null, 2)}`
    : "";

  return [
    options.systemPrompt || "You are a precise TOEIC learning assistant.",
    "Return one valid JSON object only. Do not use markdown, code fences, comments, or explanatory text.",
    "The response must be parseable by JSON.parse.",
    options.taskName ? `Task: ${options.taskName}.` : "",
    schemaText,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateDeepSeekText(
  options: DeepSeekTextOptions
): Promise<DeepSeekGenerationResult> {
  const client = getDeepSeekClient();
  const { model } = getDeepSeekConfig();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const completion = await withTimeout(
    client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: options.systemPrompt || "You are a helpful TOEIC learning assistant.",
        },
        { role: "user", content: options.prompt },
      ],
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens,
      stream: false,
    }),
    timeoutMs,
    "DeepSeek request"
  );

  const text = completion.choices[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("Empty response from DeepSeek.");

  return { text, model, provider: "deepseek" };
}

export async function streamDeepSeekText(
  options: DeepSeekTextOptions,
  onChunk: StreamChunkHandler
): Promise<DeepSeekGenerationResult> {
  const client = getDeepSeekClient();
  const { model } = getDeepSeekConfig();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let fullText = "";

  const stream = await withTimeout(
    client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: options.systemPrompt || "You are a helpful TOEIC learning assistant.",
        },
        { role: "user", content: options.prompt },
      ],
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens,
      stream: true,
    }),
    timeoutMs,
    "DeepSeek stream request"
  );

  for await (const chunk of stream) {
    const chunkText = chunk.choices[0]?.delta?.content || "";
    if (!chunkText) continue;
    fullText += chunkText;
    onChunk(chunkText);
  }

  if (!fullText.trim()) throw new Error("Empty stream response from DeepSeek.");

  return { text: fullText, model, provider: "deepseek" };
}

export async function generateDeepSeekJson(
  options: DeepSeekJsonOptions
): Promise<DeepSeekJsonResult> {
  const client = getDeepSeekClient();
  const { model } = getDeepSeekConfig();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const completion = await withTimeout(
    client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildJsonSystemPrompt(options) },
        { role: "user", content: `${options.prompt}\n\nReturn JSON only.` },
      ],
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens,
      response_format: { type: "json_object" },
      stream: false,
    }),
    timeoutMs,
    "DeepSeek JSON request"
  );

  const text = completion.choices[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("Empty JSON response from DeepSeek.");

  return {
    text,
    json: parseDeepSeekJson(text),
    model,
    provider: "deepseek",
  };
}
