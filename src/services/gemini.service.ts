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

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-pro",
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

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
          maxOutputTokens: 62000,
          responseMimeType: "application/json",
          responseSchema: ToeicPlanSchema,
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
        parsed = JSON.parse(result.text);
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
      throw err;
    }
  }

  throw new Error(
    "Tất cả model đều quá tải hoặc không khả dụng, vui lòng thử lại sau."
  );
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
        parsed = JSON.parse(result.text);
      } catch (e) {
        console.warn("⚠️ Không parse được JSON, trả về text thô.");
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
      throw err;
    }
  }

  throw new Error(
    "Tất cả model đều quá tải hoặc không khả dụng, vui lòng thử lại sau."
  );
}

export const DictionarySchema = {
  type: Type.OBJECT,
  properties: {
    englishWord: { type: Type.STRING },
    phonetic: { type: Type.STRING },
    phonetics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          audio: { type: Type.STRING },
        },
      },
    },
    translations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          partOfSpeech: { type: Type.STRING }, // N, V, Adj, Adv...
          translatedDefinitions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                en: { type: Type.STRING },
                vi: { type: Type.STRING },
              },
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
            },
          },
          synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
    imageKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  propertyOrdering: [
    "englishWord",
    "phonetic",
    "phonetics",
    "translations",
    "imageKeywords",
  ],
};

// Fetch data from dictionary API
async function fetchDictionaryRawData(word: string) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`
  );
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0)
    throw new Error("No data found for the given word.");
  return data;
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

export async function dictionaryLookup(query: string) {
  const promptPath = path.resolve(__dirname, "../configs/dictionary.txt");
  const promptTemplate = fs.readFileSync(promptPath, "utf8");

  const TranslateSchema = {
    type: Type.OBJECT,
    properties: { englishWord: { type: Type.STRING } },
    propertyOrdering: ["englishWord"],
  };

  for (const model of MODELS) {
    try {
      console.log(`🧠 Trying model: ${model}`);

      // STEP 1: dịch từ tiếng Việt -> tiếng Anh (nếu cần)
      const translatePrompt = `
                Hãy dịch từ hoặc cụm sau sang tiếng Anh, chỉ trả về JSON có key "englishWord".
                Không thêm giải thích nào khác.

                Input: "quả táo" → Output: {"englishWord":"apple"}
                Từ cần dịch: "${query}"
            `;

      const translateResult = await ai.models.generateContent({
        model,
        contents: translatePrompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: TranslateSchema,
        },
      });

      if (!translateResult.text)
        throw new Error("Không nhận được phản hồi dịch.");
      const englishWord =
        JSON.parse(translateResult.text).englishWord?.trim() || query;
      console.log("🔤 Detected English word:", englishWord);

      // STEP 2: lấy toàn bộ dữ liệu gốc từ dictionaryapi.dev
      const rawDictData = await fetchDictionaryRawData(englishWord);

      // STEP 3: gửi sang Gemini để xử lý
      const prompt = promptTemplate.replace(
        "{{DICTIONARY_RAW_DATA}}",
        JSON.stringify(rawDictData, null, 2)
      );

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: DictionarySchema,
        },
      });

      const text = result.text?.trim();
      if (!text) throw new Error("Empty structured response from Gemini.");

      const parsed = JSON.parse(text);
      console.log("📦 Gemini dictionary result:", parsed);

      // STEP 4: Gọi Unsplash lấy ảnh minh họa
      const imageKeywords = parsed.imageUrls || [englishWord];
      const images = await fetchUnsplashImages(imageKeywords);

      return {
        model,
        json: {
          ...parsed,
          imageUrls: images.map((img: any) => img.url),
        },
      };
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || "";
      if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
        console.warn(`🚧 ${model} quá tải, thử model kế tiếp...`);
        continue;
      }
      console.error(`❌ Lỗi khi gọi ${model}:`, msg);
      throw err;
    }
  }

  throw new Error("Tất cả model đều quá tải hoặc lỗi xử lý.");
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
  propertyOrdering: [
    "sourceLang",
    "targetLang",
    "originalText",
    "translatedText",
    "translationNotes",
  ],
};

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

  // Đọc prompt từ file cấu hình
  const promptPath = path.resolve(__dirname, "../configs/translate.txt");
  if (!fs.existsSync(promptPath))
    throw new Error(`Missing prompt file: ${promptPath}`);

  const promptTemplate = fs.readFileSync(promptPath, "utf8");

  // Thay placeholder
  const prompt = promptTemplate
    .replace("{{SOURCE_LANG}}", sourceLang)
    .replace("{{TARGET_LANG}}", targetLang)
    .replace("{{TEXT}}", text);

  // thu lần lượt qua các model
  for (const model of MODELS) {
    try {
      console.log(`🧠 Translating with model: ${model}`);

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.4,
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
      return { model, json: parsed };
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
      throw err;
    }
  }

  throw new Error("Tất cả model Gemini đều quá tải hoặc lỗi xử lý.");
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
      throw err;
    }
  }

  throw new Error("Tất cả model Gemini đều quá tải hoặc lỗi xử lý.");
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

  throw new Error("Tất cả model Gemini đều quá tải hoặc lỗi.");
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
        msg.includes("overloaded")
      ) {
        console.warn(`🚧 ${model} quá tải, thử model kế tiếp...`);
        continue;
      }
      console.error(`❌ Lỗi khi gọi ${model}:`, msg);
      throw err;
    }
  }

  throw new Error("Tất cả model Gemini đều quá tải hoặc lỗi xử lý.");
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

  throw new Error("Tất cả model đều quá tải hoặc lỗi.");
}
