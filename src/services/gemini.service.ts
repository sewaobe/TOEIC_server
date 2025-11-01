import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { Type } from "@google/genai";

const ai = new GoogleGenAI({});

const MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
];

export const ToeicPlanSchema = { type: Type.OBJECT, properties: { summary: { type: Type.OBJECT, properties: { current_score: { type: Type.INTEGER }, target_score: { type: Type.INTEGER }, estimated_hours: { type: Type.INTEGER }, total_weeks: { type: Type.INTEGER }, hours_per_day: { type: Type.INTEGER }, study_days_per_week: { type: Type.INTEGER }, start_date: { type: Type.STRING }, end_date: { type: Type.STRING }, warning: { type: Type.STRING }, }, propertyOrdering: ["current_score", "target_score", "estimated_hours", "total_weeks", "hours_per_day", "study_days_per_week", "start_date", "end_date", "warning",], }, phase_overview: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { phase: { type: Type.STRING }, percentage: { type: Type.INTEGER }, hours: { type: Type.NUMBER }, weeks: { type: Type.NUMBER }, methods: { type: Type.OBJECT, properties: { video: { type: Type.INTEGER }, flashcard: { type: Type.INTEGER }, dictation: { type: Type.INTEGER }, shadowing: { type: Type.INTEGER }, quiz: { type: Type.INTEGER }, mini_test: { type: Type.INTEGER }, }, propertyOrdering: ["video", "flashcard", "dictation", "shadowing", "quiz", "mini_test",], }, focus_topics: { type: Type.ARRAY, items: { type: Type.STRING }, }, }, propertyOrdering: ["phase", "percentage", "hours", "weeks", "methods", "focus_topics",], }, }, schedule_by_week: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { week: { type: Type.INTEGER }, phase: { type: Type.STRING }, goal: { type: Type.STRING }, days: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { date: { type: Type.STRING }, activity: { type: Type.STRING }, duration: { type: Type.INTEGER }, topic: { type: Type.STRING }, }, propertyOrdering: ["date", "activity", "duration", "topic"], }, }, }, propertyOrdering: ["week", "phase", "goal", "days"], }, }, }, propertyOrdering: ["summary", "phase_overview", "schedule_by_week"], };

export async function generateToeicPlan(userInput: any) {
    const templatePath = path.resolve(__dirname, "../configs/toeic-plan.txt");
    const promptTemplate = fs.readFileSync(templatePath, "utf8");

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
                    temperature: 0.3,
                    maxOutputTokens: 32000,
                    responseMimeType: "application/json",
                    responseSchema: ToeicPlanSchema,
                },
            });

            if (!result.text) throw new Error("Empty structured response");

            console.log(
                "🧩 Raw Gemini output (first 300 chars):",
                result.text.slice(0, 300)
            );

            // ✅ Parse JSON kết quả an toàn
            let parsed: any = null;
            try {
                parsed = JSON.parse(result.text);
            } catch (e) {
                console.warn("⚠️ Không parse được JSON, trả về text thô.");
            }

            return { model, json: parsed };
        } catch (err: any) {
            const msg = err?.message || err?.error?.message || "";
            if (
                msg.includes("503") ||
                msg.includes("overloaded") ||
                msg.includes("UNAVAILABLE") ||
                err?.error?.code === 503
            ) {
                console.warn(`🚧 ${model} bị quá tải, thử model kế tiếp...`);
                continue;
            }
            console.error(`❌ Lỗi khi gọi ${model}:`, msg);
            throw err;
        }
    }

    throw new Error("Tất cả model đều quá tải, vui lòng thử lại sau vài phút.");
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
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
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
        const desc = `${img.description || ""} ${img.alt_description || ""}`.toLowerCase();
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

            if (!translateResult.text) throw new Error("Không nhận được phản hồi dịch.");
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