import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { Type } from "@google/genai";
import { writeTotalsReport } from "../utils/planTotals";
import {
  retrieveContentByMentor,
  formatContentForPrompt,
} from "./learningPath.retriever";
import { saveDebugFile } from "./demo.service";
import { DictionaryEntry } from "../models/dictionary_entry.model";
import { generateDeepSeekJson } from "../core/deepseek";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODELS: string[] = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
];

const DICTATION_RULE_GEMINI_TIMEOUT_MS = Number(
  process.env.DICTATION_AI_GEMINI_TIMEOUT_MS || 7000,
);
const DICTATION_RULE_DEEPSEEK_TIMEOUT_MS = Number(
  process.env.DICTATION_AI_DEEPSEEK_TIMEOUT_MS || 8000,
);
const DICTATION_RULE_GEMINI_MODEL =
  process.env.DICTATION_AI_GEMINI_MODEL || MODELS[0];

function withAiTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`${label} timed out after ${timeoutMs}ms`);
        (err as any).code = "AI_TIMEOUT";
        reject(err);
      }, timeoutMs);
    }),
  ]);
}

async function generateDeepSeekJsonFallback(params: {
  prompt: string;
  jsonSchema: unknown;
  taskName: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}) {
  console.warn(`[DeepSeek fallback] Gemini chain failed for ${params.taskName}; trying DeepSeek.`);
  const result = await generateDeepSeekJson({
    prompt: params.prompt,
    jsonSchema: params.jsonSchema,
    taskName: params.taskName,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    timeoutMs: params.timeoutMs,
  });
  console.log(`[DeepSeek fallback] ${params.taskName} succeeded with model: ${result.model}`);
  return result;
}

export const ToeicPlanSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.OBJECT,
      properties: {
        current_score: { type: Type.NUMBER },
        target_score: { type: Type.NUMBER },
        estimated_hours: { type: Type.NUMBER },
        total_weeks: { type: Type.NUMBER },
        hours_per_day: { type: Type.NUMBER },
        study_days_per_week: { type: Type.NUMBER },
        start_date: { type: Type.STRING },
        end_date: { type: Type.STRING },
        warning: { type: Type.STRING },
      },
      propertyOrdering: [
        "current_score",
        "target_score",
        "estimated_hours",
        "total_weeks",
        "hours_per_day",
        "study_days_per_week",
        "start_date",
        "end_date",
        "warning",
      ],
    },
    phase_overview: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phase: { type: Type.STRING },
          percentage: { type: Type.NUMBER },
          hours: { type: Type.NUMBER },
          weeks: { type: Type.NUMBER },
          methods: {
            type: Type.OBJECT,
            properties: {
              video: { type: Type.NUMBER },
              flashcard: { type: Type.NUMBER },
              dictation: { type: Type.NUMBER },
              shadowing: { type: Type.NUMBER },
              quiz: { type: Type.NUMBER },
              mini_test: { type: Type.NUMBER },
            },
            propertyOrdering: [
              "video",
              "flashcard",
              "dictation",
              "shadowing",
              "quiz",
              "mini_test",
            ],
          },
          focus_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        propertyOrdering: [
          "phase",
          "percentage",
          "hours",
          "weeks",
          "methods",
          "focus_topics",
        ],
      },
    },
    schedule_by_week: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          week: { type: Type.NUMBER },
          phase: { type: Type.STRING },
          goal: { type: Type.STRING },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                activity: { type: Type.STRING },
                duration: { type: Type.NUMBER },
                topic: { type: Type.STRING },
              },
              propertyOrdering: ["date", "activity", "duration", "topic"],
            },
          },
        },
        propertyOrdering: ["week", "phase", "goal", "days"],
      },
    },
  },
  propertyOrdering: ["summary", "phase_overview", "schedule_by_week"],
};

// ========== WEEKLY PLAN SCHEMA (RAG-based) ==========
export const WeeklyPlanSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.OBJECT,
      properties: {
        current_score: { type: Type.NUMBER },
        target_score: { type: Type.NUMBER },
        hours_per_day: { type: Type.NUMBER },
        study_days_per_week: { type: Type.NUMBER },
        start_date: { type: Type.STRING },
        end_date: { type: Type.STRING },
      },
      propertyOrdering: [
        "current_score",
        "target_score",
        "hours_per_day",
        "study_days_per_week",
        "start_date",
        "end_date",
      ],
    },
    week_plan: {
      type: Type.OBJECT,
      properties: {
        week: { type: Type.NUMBER },
        goal: { type: Type.STRING },
        days: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              activities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    resource_id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    duration: { type: Type.NUMBER },
                    part_type: { type: Type.NUMBER },
                  },
                  propertyOrdering: [
                    "type",
                    "resource_id",
                    "title",
                    "duration",
                    "part_type",
                  ],
                },
              },
            },
            propertyOrdering: ["date", "activities"],
          },
        },
      },
      propertyOrdering: ["week", "goal", "days"],
    },
    final_summary: {
      type: Type.OBJECT,
      properties: {
        total_hours: { type: Type.NUMBER },
        key_focus: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendation: { type: Type.STRING },
      },
      propertyOrdering: ["total_hours", "key_focus", "recommendation"],
    },
  },
  propertyOrdering: ["summary", "week_plan", "final_summary"],
};

export async function generateToeicPlan(userInput: any) {
  const templatePath = path.resolve(__dirname, "../configs/toeic-plan.txt");
  const promptTemplate = fs.readFileSync(templatePath, "utf8");

  console.log("🧩 Gemini TOEIC Plan - User Input:", userInput);
  const prompt = promptTemplate.replace(
    "{{USER_INPUT}}",
    JSON.stringify(userInput, null, 2)
  );

  for (const model of MODELS) {
    try {
      console.log(`🧠 Trying model (raw JSON output): ${model}`);

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 65000,
          responseMimeType: "application/json",
          responseSchema: ToeicPlanSchema,
          thinkingConfig: {
            thinkingBudget: 0
          }
        },
      });

      if (!result.text) throw new Error("Empty structured response");

      console.log(
        "🧩 Raw Gemini output (first 300 chars):",
        result.text.slice(0, 300)
      );

      // Parse JSON kết quả an toàn
      let parsed: any = null;
      try {
        parsed = JSON.parse(result.text?.trim());
      } catch (e) {
        console.warn("⚠️ Không parse được JSON, trả về text thô.");
      }

      // Best-effort: write totals report (text + JSON artifact) for inspection
      try {
        if (parsed && typeof parsed === "object") writeTotalsReport(parsed);
        // Export Gemini raw + parsed JSON to toeic_outputs for debugging
        try {
          const outputsRoot = path.resolve(
            __dirname,
            "../../../",
            "toeic_outputs"
          );
          fs.mkdirSync(outputsRoot, { recursive: true });
          const now = new Date();
          const ts = now.toISOString().replace(/[:.]/g, "-");
          // raw text
          const rawName = `${ts}-${model}-gemini-raw.txt`;
          const rawPath = path.join(outputsRoot, rawName);
          fs.writeFileSync(rawPath, String(result.text || ""), "utf8");
          // parsed JSON (if available)
          if (parsed && typeof parsed === "object") {
            const jsonName = `${ts}-${model}-toeic-plan.json`;
            const jsonPath = path.join(outputsRoot, jsonName);
            fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), "utf8");
            console.log(`📝 Đã xuất Gemini parsed JSON: ${jsonPath}`);
          } else {
            console.log(`📝 Đã xuất Gemini raw text: ${rawPath}`);
          }
        } catch (e) {
          console.warn("⚠️ Không thể ghi file outputs Gemini:", e);
        }
      } catch (e) {
        console.warn("⚠️ Không thể xuất báo cáo tổng thời gian từ service:", e);
      }

      return { model, json: parsed };
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || "";
      const code = err?.error?.code;

      // Fallback cho lỗi quota (429), overload (503), model không tồn tại (404)
      if (
        msg.includes("503") ||
        msg.includes("overloaded") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("404") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("not found") ||
        code === 503 ||
        code === 429 ||
        code === 404
      ) {
        console.warn(
          `🚧 ${model} bị lỗi (${code || "unknown"}), thử model kế tiếp...`
        );
        continue;
      }
      console.error(`❌ Lỗi khi gọi ${model}:`, msg);
      continue;
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: ToeicPlanSchema,
    taskName: "toeic_plan",
    temperature: 0.1,
    maxTokens: 65000,
  });
  if (fallback.json && typeof fallback.json === "object") {
    try {
      writeTotalsReport(fallback.json);
    } catch (e) {
      console.warn("DeepSeek TOEIC plan totals report failed:", e);
    }
  }
  return { model: fallback.model, json: fallback.json };
}

// ========== GENERATE WEEKLY PLAN WITH RAG ==========
/**
 * Tạo lộ trình học 1 tuần dựa trên nội dung DB (RAG)
 * @param userInput - Thông tin user (current_score, target_score, etc.)
 * @param mentorId - ID của mentor (để lấy nội dung từ DB)
 * @returns { model: string, json: any }
 */
export async function generateWeeklyPlanWithRAG(
  userInput: any,
  mentorId: string
) {
  // 1. Retrieve content from DB
  console.log(`📚 Retrieving content for mentor: ${mentorId}`);
  const content = await retrieveContentByMentor(mentorId);
  const formattedContent = formatContentForPrompt(content);

  // 2. Load prompt template
  const templatePath = path.resolve(
    __dirname,
    "../configs/toeic-plan-weekly.txt"
  );
  const promptTemplate = fs.readFileSync(templatePath, "utf8");

  // 3. Inject user input + RAG content
  const prompt = promptTemplate
    .replace("{{USER_INPUT}}", JSON.stringify(userInput, null, 2))
    .replace("{{AVAILABLE_CONTENT}}", formattedContent);

  console.log("🧩 Gemini Weekly Plan - User Input:", userInput);
  console.log(
    "📚 RAG Content (first 500 chars):",
    formattedContent.slice(0, 500)
  );

  // 4. Call Gemini with WeeklyPlanSchema
  for (const model of MODELS) {
    try {
      console.log(`🧠 Trying model (weekly plan): ${model}`);

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 32000,
          responseMimeType: "application/json",
          responseSchema: WeeklyPlanSchema,
        },
      });

      if (!result.text) throw new Error("Empty structured response");

      console.log(
        "🧩 Raw Gemini weekly output (first 300 chars):",
        result.text.slice(0, 300)
      );

      let parsed: any = null;
      try {
        // Loại bỏ BOM và whitespace đầu/cuối trước khi parse
        const cleanText = result.text.replace(/^\uFEFF/, "").trim();
        parsed = JSON.parse(cleanText);
        console.log("✅ JSON parsed successfully");
      } catch (e: any) {
        console.warn("⚠️ Không parse được JSON:", e?.message || e);
        // Thử parse lại với regex extract JSON object
        try {
          const jsonMatch = result.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
            console.log("✅ JSON parsed with regex extraction");
          }
        } catch (e2) {
          console.warn("⚠️ Regex extraction cũng thất bại");
        }
      }

      // Export artifacts for debugging
      try {
        const outputsRoot = path.resolve(
          __dirname,
          "../../../",
          "toeic_outputs"
        );
        fs.mkdirSync(outputsRoot, { recursive: true });
        const now = new Date();
        const ts = now.toISOString().replace(/[:.]/g, "-");
        const rawName = `${ts}-${model}-weekly-raw.txt`;
        const rawPath = path.join(outputsRoot, rawName);
        fs.writeFileSync(rawPath, String(result.text || ""), "utf8");

        if (parsed && typeof parsed === "object") {
          const jsonName = `${ts}-${model}-weekly-plan.json`;
          const jsonPath = path.join(outputsRoot, jsonName);
          fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), "utf8");
          console.log(`📝 Đã xuất weekly plan JSON: ${jsonPath}`);
        }
      } catch (e) {
        console.warn("⚠️ Không thể ghi file outputs:", e);
      }

      return { model, json: parsed };
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || "";
      const code = err?.error?.code;

      // Fallback cho lỗi quota (429), overload (503), model không tồn tại (404)
      if (
        msg.includes("503") ||
        msg.includes("overloaded") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("404") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("not found") ||
        code === 503 ||
        code === 429 ||
        code === 404
      ) {
        console.warn(
          `🚧 ${model} bị lỗi (${code || "unknown"}), thử model kế tiếp...`
        );
        continue;
      }
      console.error(`❌ Lỗi khi gọi ${model}:`, msg);
      continue;
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: WeeklyPlanSchema,
    taskName: "weekly_plan",
    temperature: 0.1,
    maxTokens: 32000,
  });
  return { model: fallback.model, json: fallback.json };
}

export const DictionarySchema = {
  type: Type.OBJECT,
  properties: {
    englishWord: { type: Type.STRING },
    phonetic_uk: { type: Type.STRING },
    phonetic_us: { type: Type.STRING },
    audio_uk: { type: Type.STRING },
    audio_us: { type: Type.STRING },
    translations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          partOfSpeech: { type: Type.STRING },
          meanings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                en: { type: Type.STRING },
                vi: { type: Type.STRING },
              },
              required: ["en", "vi"],
            },
          },
        },
        required: ["partOfSpeech", "meanings"],
      },
    },
    examples: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          en: { type: Type.STRING },
          vi: { type: Type.STRING },
        },
        required: ["en", "vi"],
      },
    },
    synonyms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          meaning: { type: Type.STRING },
        },
        required: ["word", "meaning"],
      },
    },
    antonyms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          meaning: { type: Type.STRING },
        },
        required: ["word", "meaning"],
      },
    },
    word_family: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          partOfSpeech: { type: Type.STRING },
        },
        required: ["word", "partOfSpeech"],
      },
    },
    collocations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phrase: { type: Type.STRING },
          meaning: { type: Type.STRING },
        },
        required: ["phrase", "meaning"],
      },
    },
    metadata: {
      type: Type.OBJECT,
      properties: {
        source: { type: Type.STRING },
        enrichedByAI: { type: Type.BOOLEAN },
        missingFieldsFilledByAI: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["source", "enrichedByAI", "missingFieldsFilledByAI"],
    },
    imageKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "englishWord",
    "phonetic_uk",
    "phonetic_us",
    "audio_uk",
    "audio_us",
    "translations",
    "examples",
    "synonyms",
    "antonyms",
    "word_family",
    "collocations",
    "imageKeywords",
    "metadata",
  ],
  propertyOrdering: [
    "englishWord",
    "phonetic_uk",
    "phonetic_us",
    "audio_uk",
    "audio_us",
    "translations",
    "examples",
    "synonyms",
    "antonyms",
    "word_family",
    "collocations",
    "imageKeywords",
    "metadata",
  ],
};

const FREE_DICTIONARY_SOURCE = "freedictionaryapi.com";
const AI_GENERATED_DICTIONARY_SOURCE = "ai_generated";

type DictionaryLookupKind = "dictionary_entry" | "contextual_query";

type DictionaryRawLookupResult = {
  provider: string;
  language: string;
  query: string;
  lookupKind: DictionaryLookupKind;
  providerHadData: boolean;
  rawData: any | null;
  providerError?: string;
};

// Fetch data from the dictionary provider without failing the AI fallback path.
async function fetchDictionaryRawData(
  word: string,
  lookupKind: DictionaryLookupKind
): Promise<DictionaryRawLookupResult> {
  if (lookupKind === "contextual_query") {
    return {
      provider: FREE_DICTIONARY_SOURCE,
      language: "en",
      query: word,
      lookupKind,
      providerHadData: false,
      rawData: null,
      providerError: "Skipped provider lookup for contextual query.",
    };
  }

  const url = `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(
    word
  )}?translations=true`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    const providerHadData =
      res.ok &&
      data &&
      typeof data === "object" &&
      Array.isArray(data.entries) &&
      data.entries.length > 0;

    return {
      provider: FREE_DICTIONARY_SOURCE,
      language: "en",
      query: word,
      lookupKind,
      providerHadData,
      rawData: providerHadData ? data : null,
      providerError: providerHadData
        ? undefined
        : `Provider returned no entries${res.ok ? "" : ` (${res.status})`}.`,
    };
  } catch (error: any) {
    return {
      provider: FREE_DICTIONARY_SOURCE,
      language: "en",
      query: word,
      lookupKind,
      providerHadData: false,
      rawData: null,
      providerError: error?.message || "Provider request failed.",
    };
  }
}

export async function fetchUnsplashImages(keywords: string[], limit = 2) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error("Missing UNSPLASH_ACCESS_KEY in .env");

  const query = encodeURIComponent(keywords.join(" "));
  const url = `https://api.unsplash.com/search/photos?query=${query}&per_page=6&orientation=squarish`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) throw new Error(`Unsplash error: ${res.statusText}`);
  const data = await res.json();

  // 🎯 Lọc ảnh có từ khóa xuất hiện trong mô tả / alt_description
  const filtered = (data.results || []).filter((img: any) => {
    const desc = `${img.description || ""} ${img.alt_description || ""
      }`.toLowerCase();
    return keywords.some((kw) => desc.includes(kw.toLowerCase()));
  });

  // Nếu không có ảnh match hoàn hảo → fallback
  const final = filtered.length > 0 ? filtered : data.results.slice(0, limit);

  return final.slice(0, limit).map((img: any) => ({
    url: img.urls.small,
    description: img.alt_description,
    photographer: img.user.name,
    link: img.links.html,
  }));
}

const normalizeDictionaryQuery = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const countDictionaryQueryWords = (value: string): number =>
  normalizeDictionaryQuery(value)
    .split(" ")
    .filter(Boolean).length;

const classifyDictionaryLookupKind = (
  wordCount: number
): DictionaryLookupKind =>
  wordCount === 1 ? "dictionary_entry" : "contextual_query";

const isLikelyEnglishDictionaryQuery = (value: string): boolean =>
  /^[a-zA-Z][a-zA-Z\s'-]*$/.test(value.trim());

const findDictionaryCache = async (normalizedQuery: string) =>
  DictionaryEntry.findOne({
    $or: [
      { normalized_key: normalizedQuery },
      { query_aliases: normalizedQuery },
    ],
  });

const touchDictionaryCache = async (
  entryId: unknown,
  alias?: string
): Promise<void> => {
  const normalizedAlias = alias ? normalizeDictionaryQuery(alias) : "";
  const update: Record<string, any> = {
    $inc: { lookup_count: 1 },
    $set: { last_lookup_at: new Date() },
  };

  if (normalizedAlias) {
    update.$addToSet = { query_aliases: normalizedAlias };
  }

  await DictionaryEntry.findByIdAndUpdate(entryId, update);
};

const buildCachedDictionaryResult = async (
  cachedEntry: any,
  alias?: string
) => {
  await touchDictionaryCache(cachedEntry._id, alias);

  return {
    model: cachedEntry.model_used ?? "cache",
    cached: true,
    json: cachedEntry.data,
  };
};

const isRetryableDictionaryModelError = (err: any): boolean => {
  const msg = err?.message || err?.error?.message || "";

  return (
    err instanceof SyntaxError ||
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("Empty structured response") ||
    msg.includes("Unterminated string") ||
    msg.includes("Unexpected end of JSON input")
  );
};

const toStringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeDictionaryPartOfSpeech = (value: unknown): string => {
  const raw = toStringValue(value);
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, " ");

  if (!raw) return "Other";
  if (["n", "noun"].includes(compact)) return "N";
  if (["v", "verb"].includes(compact)) return "V";
  if (["adj", "adjective"].includes(compact)) return "Adj";
  if (["adv", "adverb"].includes(compact)) return "Adv";
  if (["prep", "preposition"].includes(compact)) return "Prep";
  if (["conj", "conjunction"].includes(compact)) return "Conj";
  if (["pron", "pronoun"].includes(compact)) return "Pron";
  if (["det", "determiner", "article"].includes(compact)) return "Det";
  if (["interj", "interjection"].includes(compact)) return "Interj";

  if (
    compact.includes("phrase") ||
    compact.includes("idiom") ||
    compact.includes("collocation") ||
    compact.includes("phrasal")
  ) {
    return "Phrase";
  }

  return raw.length > 12 ? "Other" : raw;
};

const normalizeDictionaryPairs = (
  items: any[] | undefined,
  leftKey: string,
  rightKey: string
) => {
  if (!Array.isArray(items)) return [];

  const normalized: Array<Record<string, string>> = [];
  let pending: Record<string, string> = {};

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const left = toStringValue(item[leftKey]);
    const right = toStringValue(item[rightKey]);

    if (left && right) {
      normalized.push({ [leftKey]: left, [rightKey]: right });
      pending = {};
      continue;
    }

    if (left) {
      if (pending[leftKey] && pending[rightKey]) {
        normalized.push(pending);
      }
      pending = { [leftKey]: left };
      continue;
    }

    if (right) {
      if (pending[leftKey]) {
        normalized.push({ ...pending, [rightKey]: right });
        pending = {};
      }
    }
  }

  if (pending[leftKey] && pending[rightKey]) {
    normalized.push(pending);
  }

  return normalized;
};

const normalizeDictionaryTranslations = (items: any[] | undefined) => {
  if (!Array.isArray(items)) return [];

  const normalized: Array<{ partOfSpeech: string; meanings: any[] }> = [];
  let pendingPartOfSpeech = "";

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const partOfSpeech = normalizeDictionaryPartOfSpeech(item.partOfSpeech);
    const meanings = Array.isArray(item.meanings)
      ? item.meanings
        .map((meaning: any) => ({
          en: toStringValue(meaning?.en),
          vi: toStringValue(meaning?.vi),
        }))
        .filter((meaning: any) => meaning.en || meaning.vi)
      : [];

    if (partOfSpeech && meanings.length > 0) {
      normalized.push({ partOfSpeech, meanings });
      pendingPartOfSpeech = "";
      continue;
    }

    if (partOfSpeech) {
      pendingPartOfSpeech = partOfSpeech;
      continue;
    }

    if (meanings.length > 0) {
      normalized.push({
        partOfSpeech: pendingPartOfSpeech || "Other",
        meanings,
      });
      pendingPartOfSpeech = "";
    }
  }

  return normalized;
};

const normalizeDictionaryData = (
  parsed: any,
  fallbackWord: string,
  defaultSource: string
) => {
  const parsedMetadata =
    parsed?.metadata && typeof parsed.metadata === "object"
      ? parsed.metadata
      : {};
  const parsedSource = toStringValue(parsedMetadata.source);
  const source =
    parsedSource && parsedSource !== "dictionaryapi.dev"
      ? parsedSource
      : defaultSource;
  const missingFieldsFilledByAI = Array.isArray(
    parsedMetadata.missingFieldsFilledByAI
  )
    ? parsedMetadata.missingFieldsFilledByAI.map(toStringValue).filter(Boolean)
    : [];
  if (
    defaultSource === AI_GENERATED_DICTIONARY_SOURCE &&
    !missingFieldsFilledByAI.includes("provider_no_entry")
  ) {
    missingFieldsFilledByAI.push("provider_no_entry");
  }

  return {
    ...parsed,
    englishWord: toStringValue(parsed?.englishWord) || fallbackWord,
    phonetic_uk: toStringValue(parsed?.phonetic_uk),
    phonetic_us: toStringValue(parsed?.phonetic_us),
    audio_uk: toStringValue(parsed?.audio_uk),
    audio_us: toStringValue(parsed?.audio_us),
    translations: normalizeDictionaryTranslations(parsed?.translations),
    examples: normalizeDictionaryPairs(parsed?.examples, "en", "vi"),
    synonyms: normalizeDictionaryPairs(parsed?.synonyms, "word", "meaning"),
    antonyms: normalizeDictionaryPairs(parsed?.antonyms, "word", "meaning"),
    word_family: normalizeDictionaryPairs(
      parsed?.word_family,
      "word",
      "partOfSpeech"
    ),
    collocations: normalizeDictionaryPairs(
      parsed?.collocations,
      "phrase",
      "meaning"
    ),
    imageKeywords: Array.isArray(parsed?.imageKeywords)
      ? parsed.imageKeywords.map(toStringValue).filter(Boolean)
      : [],
    metadata: {
      ...parsedMetadata,
      source,
      enrichedByAI: true,
      missingFieldsFilledByAI,
    },
  };
};

const buildDictionaryPromptPayload = (
  rawLookup: DictionaryRawLookupResult
) => ({
  provider: rawLookup.provider,
  language: rawLookup.language,
  query: rawLookup.query,
  lookupKind: rawLookup.lookupKind,
  providerHadData: rawLookup.providerHadData,
  providerError: rawLookup.providerError || "",
  rawData: rawLookup.rawData,
});

const buildDictionaryPrompt = (
  promptTemplate: string,
  rawLookup: DictionaryRawLookupResult
) =>
  promptTemplate.replace(
    "{{DICTIONARY_RAW_DATA}}",
    JSON.stringify(buildDictionaryPromptPayload(rawLookup), null, 2)
  );

const shouldFetchDictionaryImages = (
  normalizedDictionary: ReturnType<typeof normalizeDictionaryData>,
  lookupKind: DictionaryLookupKind
) =>
  lookupKind === "dictionary_entry" &&
  Array.isArray(normalizedDictionary.imageKeywords) &&
  normalizedDictionary.imageKeywords.length > 0;

const fetchDictionaryImagesSafely = async (
  keywords: string[],
  lookupKind: DictionaryLookupKind
) => {
  if (lookupKind !== "dictionary_entry" || keywords.length === 0) return [];

  try {
    return await fetchUnsplashImages(keywords);
  } catch (error: any) {
    console.warn("Dictionary image lookup skipped:", error?.message || error);
    return [];
  }
};

const extractJsonErrorPosition = (message: string): number | null => {
  const match = message.match(/position\s+(\d+)/i);
  if (!match) return null;

  const position = Number(match[1]);
  return Number.isFinite(position) ? position : null;
};

const getTextWindow = (text: string, position: number, radius = 500) => {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);

  return {
    start,
    end,
    excerpt: text.slice(start, end),
  };
};

const parseDictionaryJsonOrThrow = (params: {
  text: string;
  model: string;
  query: string;
  englishWord: string;
  lookupKind: DictionaryLookupKind;
}) => {
  try {
    return JSON.parse(params.text);
  } catch (error: any) {
    const message = error?.message || "Unknown JSON parse error";
    const position = extractJsonErrorPosition(message);
    const aroundError =
      position !== null ? getTextWindow(params.text, position) : null;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `dictionary-invalid-json-${timestamp}-${params.model}.json`;

    const debugPayload = {
      model: params.model,
      query: params.query,
      englishWord: params.englishWord,
      lookupKind: params.lookupKind,
      error: message,
      textLength: params.text.length,
      errorPosition: position,
      aroundError,
      rawText: params.text,
    };

    console.error("[Dictionary JSON parse failed]", {
      model: params.model,
      query: params.query,
      englishWord: params.englishWord,
      lookupKind: params.lookupKind,
      error: message,
      textLength: params.text.length,
      errorPosition: position,
      excerptStart: aroundError?.start,
      excerptEnd: aroundError?.end,
      excerpt: aroundError?.excerpt,
    });

    try {
      saveDebugFile(filename, debugPayload);
    } catch (saveError: any) {
      console.warn(
        "Could not save dictionary invalid JSON debug file:",
        saveError?.message || saveError
      );
    }

    throw error;
  }
};

async function buildDictionaryLookupResult(params: {
  parsed: any;
  englishWord: string;
  normalizedQuery: string;
  rawLookup: DictionaryRawLookupResult;
  model: string;
}) {
  const normalizedEnglishWord = normalizeDictionaryQuery(params.englishWord);
  const defaultSource = params.rawLookup.providerHadData
    ? params.rawLookup.provider
    : AI_GENERATED_DICTIONARY_SOURCE;
  const normalizedDictionary = normalizeDictionaryData(
    params.parsed,
    params.englishWord,
    defaultSource
  );

  const imageKeywords = shouldFetchDictionaryImages(
    normalizedDictionary,
    params.rawLookup.lookupKind
  )
    ? normalizedDictionary.imageKeywords
    : [];
  const images = await fetchDictionaryImagesSafely(
    imageKeywords,
    params.rawLookup.lookupKind
  );
  const dictionaryData = {
    ...normalizedDictionary,
    imageUrls: images.map((img: any) => img.url),
  };

  await DictionaryEntry.findOneAndUpdate(
    { normalized_key: normalizedEnglishWord },
    {
      $set: {
        english_word: dictionaryData.englishWord,
        normalized_key: normalizedEnglishWord,
        data: dictionaryData,
        source_raw: params.rawLookup,
        model_used: params.model,
        last_lookup_at: new Date(),
      },
      $addToSet: {
        query_aliases: { $each: [params.normalizedQuery, normalizedEnglishWord] },
      },
      $inc: { lookup_count: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    model: params.model,
    cached: false,
    json: dictionaryData,
  };
}

export async function dictionaryLookup(query: string) {
  if (!query || !query.trim()) {
    throw new Error("Query tra từ điển không hợp lệ.");
  }

  const normalizedQuery = normalizeDictionaryQuery(query);
  const queryWordCount = countDictionaryQueryWords(normalizedQuery);
  if (queryWordCount > 10) {
    throw new Error("Vui lòng chọn tối đa 10 từ để tra từ điển.");
  }

  const lookupKind = classifyDictionaryLookupKind(queryWordCount);
  const cachedByQuery = await findDictionaryCache(normalizedQuery);
  if (cachedByQuery) {
    return buildCachedDictionaryResult(cachedByQuery, normalizedQuery);
  }

  const promptPath = path.resolve(__dirname, "../configs/dictionary.txt");
  const promptTemplate = fs.readFileSync(promptPath, "utf8");

  const TranslateSchema = {
    type: Type.OBJECT,
    properties: { englishWord: { type: Type.STRING } },
    propertyOrdering: ["englishWord"],
  };

  const buildTranslatePrompt = (input: string) => `
Translate the following word or phrase into English. Return JSON only with the key "englishWord".
Do not add any explanation.

Input: "quả táo" -> Output: {"englishWord":"apple"}
Input to translate: "${input}"
`;

  for (const model of MODELS) {
    try {
      console.log(`🧠 Trying model: ${model}`);

      let englishWord = normalizedQuery;

      if (!isLikelyEnglishDictionaryQuery(query)) {
        const translatePrompt = buildTranslatePrompt(normalizedQuery);

        const translateResult = await ai.models.generateContent({
          model,
          contents: translatePrompt,
          config: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: TranslateSchema,
          },
        });

        if (!translateResult.text) {
          throw new Error("Empty dictionary query translation response.");
        }

        englishWord =
          JSON.parse(translateResult.text).englishWord?.trim() || normalizedQuery;
      }

      console.log("🔤 Detected English word:", englishWord);

      const normalizedEnglishWord = normalizeDictionaryQuery(englishWord);
      const cachedByEnglishWord = await findDictionaryCache(
        normalizedEnglishWord
      );
      if (cachedByEnglishWord) {
        return buildCachedDictionaryResult(
          cachedByEnglishWord,
          normalizedQuery
        );
      }

      const rawLookup = await fetchDictionaryRawData(englishWord, lookupKind);
      const prompt = buildDictionaryPrompt(promptTemplate, rawLookup);

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: DictionarySchema,
        },
      });

      const text = result.text?.trim();
      if (!text) throw new Error("Empty structured response from Gemini.");

      const parsed = parseDictionaryJsonOrThrow({
        text,
        model,
        query: normalizedQuery,
        englishWord,
        lookupKind,
      });
      console.log("📦 Gemini dictionary result:", parsed);
      return buildDictionaryLookupResult({
        parsed,
        englishWord,
        normalizedQuery,
        rawLookup,
        model,
      });
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || "";
      if (isRetryableDictionaryModelError(err)) {
        console.warn(
          `🚧 ${model} did not return valid JSON or is temporarily unavailable, trying next model...`,
          msg
        );
        continue;
      }
      console.error(`❌ Error while calling ${model}:`, msg);
      continue;
    }
  }

  let englishWord = normalizedQuery;
  if (!isLikelyEnglishDictionaryQuery(query)) {
    const translatePrompt = buildTranslatePrompt(normalizedQuery);
    const translateFallback = await generateDeepSeekJsonFallback({
      prompt: translatePrompt,
      jsonSchema: TranslateSchema,
      taskName: "dictionary_query_translation",
      temperature: 0.2,
      maxTokens: 1024,
    });
    englishWord = translateFallback.json?.englishWord?.trim() || normalizedQuery;
  }

  const normalizedEnglishWord = normalizeDictionaryQuery(englishWord);
  const cachedByEnglishWord = await findDictionaryCache(normalizedEnglishWord);
  if (cachedByEnglishWord) {
    return buildCachedDictionaryResult(cachedByEnglishWord, normalizedQuery);
  }

  const rawLookup = await fetchDictionaryRawData(englishWord, lookupKind);
  const prompt = buildDictionaryPrompt(promptTemplate, rawLookup);
  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: DictionarySchema,
    taskName: "dictionary_lookup",
    temperature: 0.4,
    maxTokens: 8192,
  });

  return buildDictionaryLookupResult({
    parsed: fallback.json,
    englishWord,
    normalizedQuery,
    rawLookup,
    model: fallback.model,
  });
}

export const TranslateSchema = {
  type: Type.OBJECT,
  properties: {
    sourceLang: { type: Type.STRING },
    targetLang: { type: Type.STRING },
    originalText: { type: Type.STRING },
    translatedText: { type: Type.STRING },
    translationNotes: { type: Type.STRING },
  },
  required: [
    "sourceLang",
    "targetLang",
    "originalText",
    "translatedText",
    "translationNotes",
  ],
  propertyOrdering: [
    "sourceLang",
    "targetLang",
    "originalText",
    "translatedText",
    "translationNotes",
  ],
};

const replaceAllTemplateVars = (
  template: string,
  values: Record<string, string>
) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{{${key}}}`).join(value),
    template
  );

const normalizeTranslationInput = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const normalizeTranslationResult = (
  parsed: any,
  text: string,
  sourceLang: string,
  targetLang: string
) => ({
  sourceLang,
  targetLang,
  originalText: text,
  translatedText:
    typeof parsed?.translatedText === "string" ? parsed.translatedText.trim() : "",
  translationNotes:
    typeof parsed?.translationNotes === "string"
      ? parsed.translationNotes.trim()
      : "",
});

/**
 * Dịch văn bản giữa hai ngôn ngữ bằng Gemini (chuẩn style backend)
 * - Có fallback giữa các model
 * - Đọc prompt từ file /configs/translate.txt
 * - Trả về { model, json }
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
) {
  if (!text?.trim()) throw new Error("Missing text for translation.");
  const normalizedText = text.trim();
  const normalizedSourceLang = sourceLang?.trim() || "auto";
  const normalizedTargetLang = targetLang?.trim() || "vi";

  // Đọc prompt từ file cấu hình
  const promptPath = path.resolve(__dirname, "../configs/translate.txt");
  if (!fs.existsSync(promptPath))
    throw new Error(`Missing prompt file: ${promptPath}`);

  const promptTemplate = fs.readFileSync(promptPath, "utf8");

  // Replace all placeholders. String.replace only replaces the first match.
  const prompt = replaceAllTemplateVars(promptTemplate, {
    SOURCE_LANG: normalizedSourceLang,
    TARGET_LANG: normalizedTargetLang,
    TEXT: normalizedText,
  });

  // thu lần lượt qua các model
  for (const model of MODELS) {
    try {
      console.log(`🧠 Translating with model: ${model}`);

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: TranslateSchema,
        },
      });

      // Kiem tra và parse kết quả an toàn
      const output = result.text?.trim();
      if (!output) throw new Error("Empty structured response from Gemini.");

      let parsed: any = null;
      try {
        parsed = JSON.parse(output);
      } catch {
        console.warn("⚠️ Không parse được JSON, trả về text thô.");
        parsed = { translatedText: output };
      }

      console.log("📦 Translation result:", parsed);
      if (
        parsed?.originalText &&
        normalizeTranslationInput(parsed.originalText) !==
        normalizeTranslationInput(normalizedText)
      ) {
        throw new Error("Translation response originalText does not match input.");
      }

      const normalizedResult = normalizeTranslationResult(
        parsed,
        normalizedText,
        normalizedSourceLang,
        normalizedTargetLang
      );
      if (!normalizedResult.translatedText) {
        throw new Error("Translation response missing translatedText.");
      }

      return { model, json: normalizedResult };
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || "";
      if (
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("overloaded")
      ) {
        console.warn(`🚧 ${model} bị quá tải, thử model kế tiếp...`);
        continue;
      }
      console.error(`❌ Lỗi khi gọi ${model}:`, msg);
      continue;
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: TranslateSchema,
    taskName: "translate_text",
    temperature: 0.2,
    maxTokens: 4096,
  });
  return {
    model: fallback.model,
    json: normalizeTranslationResult(
      fallback.json,
      normalizedText,
      normalizedSourceLang,
      normalizedTargetLang
    ),
  };
}

export const DictationAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING }, // Tóm tắt tổng quan
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } }, // Điểm mạnh
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } }, // Điểm yếu
    improvement_tips: { type: Type.ARRAY, items: { type: Type.STRING } }, // Gợi ý cải thiện
    recommended_focus: { type: Type.ARRAY, items: { type: Type.STRING } }, // Gợi ý luyện tập
    chart_insights: {
      type: Type.OBJECT,
      properties: {
        accuracy_over_time: { type: Type.ARRAY, items: { type: Type.STRING } },
        common_mistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
        pronunciation_patterns: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    },
  },
  propertyOrdering: [
    "summary",
    "strengths",
    "weaknesses",
    "improvement_tips",
    "recommended_focus",
    "chart_insights",
  ],
};

export const DictationRuleFeedbackSchema = {
  type: Type.OBJECT,
  properties: {
    overall: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    tips: { type: Type.ARRAY, items: { type: Type.STRING } },
    sentenceAccuracyInsights: { type: Type.ARRAY, items: { type: Type.STRING } },
    commonMistakeInsights: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  propertyOrdering: [
    "overall",
    "strengths",
    "weaknesses",
    "tips",
    "sentenceAccuracyInsights",
    "commonMistakeInsights",
  ],
};

export async function generateDictationRuleFeedbackWithAI(ruleResult: any) {
  const prompt = `
You are a feedback writer for a Dictation practice feature.

Use only the ruleResult data below.
Do not create new lessons.
Do not choose recommendations.
Do not infer general TOEIC ability.
Do not mention IRT, mini tests, full tests, or learning paths.
Do not conclude the learner's CEFR level.
Do not say the learner is weak at a tag unless ruleResult explicitly says so.
Do not analyze pronunciation or phonemes when the data only contains word mistakes.

Task:
- Rewrite feedback naturally in Vietnamese.
- Preserve the meaning of templateFeedback and signals.
- Be encouraging but do not overpraise.
- Return JSON that matches the schema.

ruleResult:
${JSON.stringify(ruleResult, null, 2)}
`;

  try {
    console.info("[DictationAI] Gemini writer model call start", {
      model: DICTATION_RULE_GEMINI_MODEL,
      timeoutMs: DICTATION_RULE_GEMINI_TIMEOUT_MS,
    });
    const result = await withAiTimeout(
      ai.models.generateContent({
        model: DICTATION_RULE_GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.25,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: DictationRuleFeedbackSchema,
        },
      }),
      DICTATION_RULE_GEMINI_TIMEOUT_MS,
      `Dictation Gemini writer ${DICTATION_RULE_GEMINI_MODEL}`,
    );

    const text = result.text?.trim();
    if (!text) throw new Error("Empty structured response from Gemini.");
    return {
      provider: "gemini" as const,
      feedback: JSON.parse(text),
    };
  } catch (err: any) {
    const msg = err?.message || err?.error?.message || String(err);
    console.warn(
      `[DictationAI] Gemini writer failed or timed out; switching to DeepSeek. model=${DICTATION_RULE_GEMINI_MODEL} error=${msg}`,
    );
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: DictationRuleFeedbackSchema,
    taskName: "dictation_rule_feedback",
    temperature: 0.25,
    maxTokens: 2048,
    timeoutMs: DICTATION_RULE_DEEPSEEK_TIMEOUT_MS,
  });

  return {
    provider: "deepseek" as const,
    feedback: fallback.json,
  };
}

/**
 * 🧠 Phân tích bài luyện Dictation bằng Gemini
 * @param logs Danh sách DictationAttemptLog từ client (index, accuracy, mistakes, duration,...)
 * @param dictationMeta Thông tin mô tả bài luyện (title, level, sentence count,...)
 */
export async function analyzeDictationWithAI(logs: any[], dictationMeta: any) {
  if (!Array.isArray(logs) || logs.length === 0)
    throw new Error("Missing attempt logs for analysis.");

  // Tính toán thống kê cơ bản
  const avgAccuracy = Math.round(
    logs.reduce((sum, l) => sum + (l.accuracy || 0), 0) / logs.length
  );
  const avgTime = Math.round(
    logs.reduce((sum, l) => sum + (l.duration || 0), 0) / logs.length
  );
  const mistakes = logs.flatMap((l) => l.mistakes || []);
  const totalSentences = logs.length;

  const stats = {
    title: dictationMeta?.title,
    level: dictationMeta?.level,
    totalSentences,
    avgAccuracy,
    avgTime,
    mistakes,
  };

  // Đọc prompt template từ file .txt
  const promptPath = path.resolve(
    __dirname,
    "../configs/dictation_analysis.txt"
  );
  if (!fs.existsSync(promptPath))
    throw new Error(`Missing prompt file: ${promptPath}`);

  const promptTemplate = fs.readFileSync(promptPath, "utf8");

  // Thay placeholder
  const prompt = promptTemplate.replace(
    "{{STATS_JSON}}",
    JSON.stringify(stats, null, 2)
  );

  // Gọi Gemini
  for (const model of MODELS) {
    try {
      console.log(`🧠 Phân tích Dictation với model: ${model}`);
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: DictationAnalysisSchema,
        },
      });

      const text = result.text?.trim();
      if (!text) throw new Error("Empty structured response from Gemini.");

      const parsed = JSON.parse(text);
      console.log("📊 Gemini Dictation Analysis:", parsed);

      return { model, json: parsed };
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || "";
      if (
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("overloaded")
      ) {
        console.warn(`🚧 ${model} quá tải, thử model kế tiếp...`);
        continue;
      }
      console.error(`❌ Lỗi khi gọi ${model}:`, msg);
      continue;
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: DictationAnalysisSchema,
    taskName: "dictation_analysis",
    temperature: 0.4,
    maxTokens: 4096,
  });
  return { model: fallback.model, json: fallback.json };
}

export const ShadowingFeedbackSchema = {
  type: Type.OBJECT,
  properties: {
    transcript_native: { type: Type.STRING },
    transcript_user: { type: Type.STRING },
    similarity_score: { type: Type.NUMBER },
    accuracy_score: { type: Type.NUMBER },
    fluency_score: { type: Type.NUMBER },
    intonation_score: { type: Type.NUMBER },
    pronunciation_feedback: {
      type: Type.OBJECT,
      properties: {
        mispronounced: { type: Type.ARRAY, items: { type: Type.STRING } },
        missing_words: { type: Type.ARRAY, items: { type: Type.STRING } },
        extra_words: { type: Type.ARRAY, items: { type: Type.STRING } },
        word_scores: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              score: { type: Type.NUMBER },
            },
          },
        },
      },
    },

    // 🆕 Căn chỉnh theo câu
    sentence_alignment: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          native_sentence: { type: Type.STRING },
          user_sentence: { type: Type.STRING },
          sentence_similarity: { type: Type.NUMBER },
          word_diffs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                status: { type: Type.STRING }, // matched | missing | extra | mispronounced
                note: { type: Type.STRING },
              },
            },
          },
        },
      },
    },

    // 🆕 Tóm tắt lỗi nổi bật
    highlight_mistakes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          native_part: { type: Type.STRING },
          user_part: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
      },
    },

    comments: { type: Type.STRING },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  propertyOrdering: [
    "transcript_native",
    "transcript_user",
    "similarity_score",
    "accuracy_score",
    "fluency_score",
    "intonation_score",
    "pronunciation_feedback",
    "sentence_alignment",
    "highlight_mistakes",
    "comments",
    "suggestions",
  ],
};

export async function analyzeShadowingByURL(userAudioUrl: string, meta: any) {
  const flaskUrl =
    process.env.FLASK_API_URL || "http://127.0.0.1:5001/api/transcribe_fast";

  // 🧩 Gọi WhisperX cho user audio
  const userRes = await fetch(flaskUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_path: userAudioUrl }),
  });
  const userData = await userRes.json();
  if (!userRes.ok || !userData.transcript)
    throw new Error(userData.error || "User audio transcription failed.");

  const { transcript: userTranscript, duration: userDuration } = userData;
  const nativeTranscript = meta.nativeText;

  // 🧠 Tạo prompt Gemini
  const promptTemplate = fs.readFileSync(
    path.resolve(__dirname, "../configs/shadowing_analysis.txt"),
    "utf8"
  );

  const prompt = promptTemplate
    .replace("{{NATIVE_TRANSCRIPT}}", nativeTranscript)
    .replace("{{USER_TRANSCRIPT}}", userTranscript)
    .replace("{{LEVEL}}", meta.level || "A2")
    .replace("{{SEGMENT_INDEX}}", meta.segmentIndex?.toString() || "0")
    .replace("{{NATIVE_DURATION}}", "0")
    .replace("{{USER_DURATION}}", userDuration?.toString() || "0");

  // 🧠 Gọi Gemini
  for (const model of MODELS) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.4,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: ShadowingFeedbackSchema,
        },
      });

      const text = result.text?.trim();
      if (!text) throw new Error("Empty structured response from Gemini.");
      const parsed = JSON.parse(text);
      return { model, json: parsed };
    } catch (e: any) {
      console.error(`[Gemini Error] ${e.message}`);
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: ShadowingFeedbackSchema,
    taskName: "shadowing_analysis",
    temperature: 0.4,
    maxTokens: 8192,
  });
  return { model: fallback.model, json: fallback.json };
}

export const DefinitionEvaluationSchema = {
  type: Type.OBJECT,
  properties: {
    similarity: { type: Type.NUMBER },
    feedback: { type: Type.STRING },
    is_correct: { type: Type.BOOLEAN },
    standard_definition: { type: Type.STRING },
  },
  propertyOrdering: [
    "similarity",
    "feedback",
    "is_correct",
    "standard_definition",
  ],
};

/**
 * 🧠 Đánh giá định nghĩa từ vựng do học viên viết bằng Gemini
 * @param word Từ vựng cần định nghĩa
 * @param correctDefinition Định nghĩa chuẩn
 * @param studentDefinition Định nghĩa do học viên viết
 */
export async function evaluateDefinitionWithAI(
  word: string,
  correctDefinition: string,
  studentDefinition: string
) {
  if (!word?.trim() || !correctDefinition?.trim() || !studentDefinition?.trim())
    throw new Error("Missing required fields for definition evaluation.");

  // Đọc prompt template từ file
  const promptPath = path.resolve(
    __dirname,
    "../configs/definition_evaluation.txt"
  );
  if (!fs.existsSync(promptPath))
    throw new Error(`Missing prompt file: ${promptPath}`);

  const promptTemplate = fs.readFileSync(promptPath, "utf8");

  // Thay placeholder
  const prompt = promptTemplate
    .replace("{{WORD}}", word)
    .replace("{{CORRECT_DEFINITION}}", correctDefinition)
    .replace("{{STUDENT_DEFINITION}}", studentDefinition);

  // Gọi Gemini với fallback
  for (const model of MODELS) {
    try {
      console.log(`🧠 Đánh giá định nghĩa với model: ${model}`);
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: DefinitionEvaluationSchema,
        },
      });

      const text = result.text?.trim();
      if (!text) throw new Error("Empty structured response from Gemini.");

      const parsed = JSON.parse(text);

      // Đảm bảo có is_correct field
      if (parsed.similarity !== undefined && parsed.is_correct === undefined) {
        parsed.is_correct = parsed.similarity >= 0.65;
      }

      console.log("📊 Gemini Definition Evaluation:", parsed);
      return { model, json: parsed };
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || "";
      if (
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("overloaded") ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("Quota exceeded")
      ) {
        console.warn(`🚧 ${model} không khả dụng hoặc hết quota, thử model kế tiếp...`);
        continue;
      }
      console.error(`❌ Lỗi khi gọi ${model}:`, msg);
      continue;
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: DefinitionEvaluationSchema,
    taskName: "definition_evaluation",
    temperature: 0.3,
    maxTokens: 1024,
  });
  const parsed = fallback.json;
  if (parsed?.similarity !== undefined && parsed.is_correct === undefined) {
    parsed.is_correct = parsed.similarity >= 0.65;
  }
  return { model: fallback.model, json: parsed };
}

export const IrtWeeklyPlannerSchema = {
  type: Type.OBJECT,
  properties: {
    week_number: { type: Type.NUMBER },
    focus_parts: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day_index: { type: Type.NUMBER }, // 1..days_per_week
          sessions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["session_no", "part", "items"],
              properties: {
                session_no: { type: Type.NUMBER },
                part: { type: Type.NUMBER },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["kind", "resource_id", "estimated_time"],
                    properties: {
                      kind: { type: Type.STRING },
                      resource_id: { type: Type.STRING },
                      estimated_time: { type: Type.NUMBER },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    mini_test: {
      type: Type.OBJECT,
      properties: {
        test_id: { type: Type.STRING },
        day_index: { type: Type.NUMBER },
        session_no: { type: Type.NUMBER },
        estimated_time: { type: Type.NUMBER },
      },
    },
    debug_log: { type: Type.STRING },
  },
  propertyOrdering: [
    "week_number",
    "focus_parts",
    "days",
    "mini_test",
    "debug_log",
  ],
};

export function buildIRTWeeklyPlannerPrompt(data: {
  userProfile: any;
  thetaOverall: number;
  classifiedParts: {
    weak_parts: number[];
    medium_parts: number[];
    strong_parts: number[];
    sorted_list: any[];
  };
  timeConstraints: {
    totalWeekMinutes: number;
    weakMinutes: number;
    mediumMinutes: number;
    strongMinutes: number;
    minutesPerDayMin: number;
    minutesPerDayMax: number;
  };
  candidateItems: any;
  miniTest: any;
}) {
  const templatePath = path.resolve(
    __dirname,
    "../configs/irt_weekly_planner.txt"
  );
  const promptTemplate = fs.readFileSync(templatePath, "utf8");

  const prompt = promptTemplate
    .replace("{{USER_PROFILE_JSON}}", JSON.stringify(data.userProfile, null, 2))
    .replace("{{MINITEST_JSON}}", JSON.stringify(data.miniTest, null, 2))
    .replace("{{RAG_ITEMS_JSON}}", JSON.stringify(data.candidateItems, null, 2))
    .replace(
      "{{TOTAL_WEEK_MINUTES}}",
      String(data.timeConstraints.totalWeekMinutes)
    )
    .replace("{{WEAK_MINUTES}}", String(data.timeConstraints.weakMinutes))
    .replace("{{MEDIUM_MINUTES}}", String(data.timeConstraints.mediumMinutes))
    .replace("{{STRONG_MINUTES}}", String(data.timeConstraints.strongMinutes))
    .replace(
      "{{MINUTES_PER_DAY_MIN}}",
      String(data.timeConstraints.minutesPerDayMin)
    )
    .replace(
      "{{MINUTES_PER_DAY_MAX}}",
      String(data.timeConstraints.minutesPerDayMax)
    )
    .replace(
      "{{WEAK_PARTS_JSON}}",
      JSON.stringify(data.classifiedParts.weak_parts, null, 2)
    )
    .replace(
      "{{MEDIUM_PARTS_JSON}}",
      JSON.stringify(data.classifiedParts.medium_parts, null, 2)
    )
    .replace(
      "{{STRONG_PARTS_JSON}}",
      JSON.stringify(data.classifiedParts.strong_parts, null, 2)
    )
    .replace(
      "{{STUDY_DAYS_PER_WEEK}}",
      String(data.userProfile.study_days_per_week)
    );

  return prompt;
}

export async function generateIRTWeeklyPlan(input: any) {
  const prompt = buildIRTWeeklyPlannerPrompt(input);

  for (const model of MODELS) {
    try {
      console.log(`🧠 WeeklyPlanner: thử model ${model}`);

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 62000,
          responseMimeType: "application/json",
          responseSchema: IrtWeeklyPlannerSchema,
          thinkingConfig: {
            thinkingBudget: 1024
          },
        },
      });

      const jsonText = result.text?.trim();
      if (!jsonText) throw new Error("Empty structured response");

      const parsed = JSON.parse(jsonText);

      return { model, json: parsed };
    } catch (err: any) {
      console.warn(`⚠️ Model ${model} error:`, err.message);
      continue;
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: IrtWeeklyPlannerSchema,
    taskName: "irt_weekly_plan",
    temperature: 0.1,
    maxTokens: 62000,
  });
  return { model: fallback.model, json: fallback.json };
}

// ========== MIND MAP GENERATION ==========

export const MindMapNodeSchema: any = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    details: { type: Type.STRING },
    children: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          details: { type: Type.STRING },
          children: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                details: { type: Type.STRING },
                children: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      details: { type: Type.STRING },
                    },
                    propertyOrdering: ["name", "details"],
                  },
                },
              },
              propertyOrdering: ["name", "details", "children"],
            },
          },
        },
        propertyOrdering: ["name", "details", "children"],
      },
    },
  },
  propertyOrdering: ["name", "details", "children"],
};

export async function generateMindMapFromText(text: string) {
  if (!text || text.trim().length < 10) {
    throw new Error("Nội dung quá ngắn để tạo mind map.");
  }

  const prompt = `
Bạn là chuyên gia phân tích và tổ chức thông tin thành Mind Map. 

**⚠️ QUY TẮC QUAN TRỌNG NHẤT:**
- BẮT BUỘC phải xử lý TOÀN BỘ 100% nội dung được cung cấp, KHÔNG ĐƯỢC bỏ sót bất kỳ phần nào
- Nếu nội dung có nhiều section (A, B, 1, 2,...) → TẤT CẢ đều phải xuất hiện trong mind map
- Kiểm tra lại trước khi trả về: đã cover hết nội dung chưa?

**QUY TẮC CHỈ MỤC:**
- Cấp 1 (Root): Không cần chỉ mục - chỉ tên chủ đề tổng
- Cấp 2: Số La Mã hoa: I., II., III., IV., V.
- Cấp 3: Số thường: 1., 2., 3., 4., 5.
- Cấp 4: Chữ cái thường: a., b., c., d., e.
- Cấp 5: Số La Mã thường: i., ii., iii., iv., v.

**XỬ LÝ CÁC LOẠI INPUT:**

📋 **Loại 1: Nội dung CÓ CẤU TRÚC** (có bullet points, số thứ tự, heading)
- Giữ nguyên cấu trúc phân cấp của nội dung gốc
- Chuẩn hóa lại chỉ mục theo quy tắc trên
- Nếu có nhiều section độc lập (A, B hoặc Part 1, Part 2) → tạo children riêng cho mỗi section

📝 **Loại 2: Nội dung KHÔNG CÓ CẤU TRÚC** (đoạn văn liền, 4-10 dòng)
- Phân tích ngữ nghĩa để tìm các ý chính
- Tự tạo cấu trúc phân cấp hợp lý
- Nhóm các ý liên quan thành nhánh con

**ĐỊNH DẠNG OUTPUT:**
- "name": Ngắn gọn 3-7 từ, format "[Chỉ mục] [Tiêu đề]"
- "details": Thông tin bổ sung nếu cần (tùy chọn)
- "children": Mảng các node con

**VÍ DỤ OUTPUT MONG ĐỢI:**
{
  "name": "TOEIC Study Guide",
  "children": [
    {
      "name": "I. Listening Comprehension",
      "children": [
        {
          "name": "1. Part 1: Photographs",
          "children": [
            { "name": "a. Focus Areas", "details": "Action Verbs & Prepositions" },
            { "name": "b. Strategy", "details": "Identify Subject + Verb + Object" }
          ]
        },
        {
          "name": "2. Part 2: Question-Response",
          "children": [
            { "name": "a. WH-Questions" },
            { "name": "b. Yes/No Questions" },
            { "name": "c. Indirect Questions" }
          ]
        }
      ]
    },
    {
      "name": "II. Reading Comprehension",
      "children": [...]
    }
  ]
}

**⚠️ NHẮC LẠI:** Xử lý TOÀN BỘ nội dung bên dưới, không được dừng giữa chừng!

**NỘI DUNG CẦN PHÂN TÍCH:**
"""
${text}
"""

Trả về JSON hợp lệ với đầy đủ tất cả nội dung.
`;

  for (const model of MODELS) {
    try {
      console.log(`🧠 MindMap: đang thử model ${model}`);

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: 16000,
          responseMimeType: "application/json",
          responseSchema: MindMapNodeSchema,
        },
      });

      const jsonText = result.text?.trim();
      if (!jsonText) throw new Error("Không nhận được dữ liệu từ Gemini");

      const parsed = JSON.parse(jsonText);

      // Validate structure
      if (!parsed.name) {
        throw new Error("Invalid mind map structure: missing root name");
      }

      console.log(`✅ MindMap: thành công với model ${model}`);
      return { model, data: parsed };
    } catch (err: any) {
      console.warn(`⚠️ MindMap Model ${model} error:`, err.message);
      continue;
    }
  }

  const fallback = await generateDeepSeekJsonFallback({
    prompt,
    jsonSchema: MindMapNodeSchema,
    taskName: "mind_map",
    temperature: 0.2,
    maxTokens: 16000,
  });
  if (!fallback.json?.name) {
    throw new Error("Invalid mind map structure: missing root name");
  }
  return { model: fallback.model, data: fallback.json };
}

