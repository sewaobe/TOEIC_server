import { NextFunction, Request, Response } from "express";
import {
  analyzeDictationWithAI,
  dictionaryLookup,
  generateToeicPlan,
  translateText,
} from "../services/gemini.service";
import { buildLearningPathFromGemini } from "../services/learningPath.generator";
import { ApiResponse } from "../utils/ApiResponse";

export async function generateToeicPlanController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userInput = req.body;

    // Gọi service xử lý Gemini
    const plan = await generateToeicPlan(userInput);

    // Nếu có user (token), tự động sinh LearningPath + metadata
    let learningPathResult = null;
    const userId = req.user?._id?.toString();
    if (userId) {
      try {
        // pass parsed plan to avoid calling Gemini twice
        const parsed = plan?.json || plan?.json;
        learningPathResult = await buildLearningPathFromGemini(
          userId,
          userInput,
          {
            title: userInput?.title,
            targetScore: userInput?.target_score,
            endDate: userInput?.deadline,
          },
          parsed
        );
      } catch (err: any) {
        // Không block response chính nếu việc tạo lộ trình thất bại
        console.warn(
          "Không thể tạo learning path tự động:",
          err?.message || err
        );
      }
    }

    return res
      .status(200)
      .json(
        ApiResponse.success(
          { plan, learningPath: learningPathResult },
          "Tạo kế hoạch TOEIC thành công!"
        )
      );
  } catch (error: any) {
    next(error);
  }
}

export const dictionaryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { query } = req.body;

    const result = await dictionaryLookup(query);

    return res
      .status(200)
      .json(ApiResponse.success(result, "Tra cứu từ điển thành công!"));
  } catch (error: any) {
    next(error);
  }
};

export const translateController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    const result = await translateText(text, sourceLang, targetLang);
    return res
      .status(200)
      .json(ApiResponse.success(result, "Dịch văn bản thành công!"));
  } catch (error) {
    next(error);
  }
};

export const analyzeDictationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { logs, dictation } = req.body;

    if (!logs || !Array.isArray(logs) || !dictation) {
      return res
        .status(400)
        .json(ApiResponse.fail("Thiếu dữ liệu logs hoặc dictation."));
    }

    const result = await analyzeDictationWithAI(logs, dictation);

    return res
      .status(200)
      .json(
        ApiResponse.success(result, "Phân tích bài luyện Dictation thành công!")
      );
  } catch (error) {
    next(error);
  }
};
