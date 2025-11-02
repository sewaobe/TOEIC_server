import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { Type } from "@google/genai";
import { writeTotalsReport } from "../utils/planTotals";

const ai = new GoogleGenAI({});

const MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-lite",
  "gemini-2.0-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

export const ToeicPlanSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.OBJECT,
      properties: {
        current_score: { type: Type.INTEGER },
        target_score: { type: Type.INTEGER },
        estimated_hours: { type: Type.INTEGER },
        total_weeks: { type: Type.INTEGER },
        hours_per_day: { type: Type.INTEGER },
        study_days_per_week: { type: Type.INTEGER },
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
          percentage: { type: Type.INTEGER },
          hours: { type: Type.NUMBER },
          weeks: { type: Type.NUMBER },
          methods: {
            type: Type.OBJECT,
            properties: {
              video: { type: Type.INTEGER },
              flashcard: { type: Type.INTEGER },
              dictation: { type: Type.INTEGER },
              shadowing: { type: Type.INTEGER },
              quiz: { type: Type.INTEGER },
              mini_test: { type: Type.INTEGER },
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
          week: { type: Type.INTEGER },
          phase: { type: Type.STRING },
          goal: { type: Type.STRING },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                activity: { type: Type.STRING },
                duration: { type: Type.INTEGER },
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

      // Best-effort: write totals report (text + JSON artifact) for inspection
      try {
        if (parsed && typeof parsed === "object") writeTotalsReport(parsed);
      } catch (e) {
        console.warn("⚠️ Không thể xuất báo cáo tổng thời gian từ service:", e);
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
