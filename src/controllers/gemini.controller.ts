import { NextFunction, Request, Response } from "express";
import { analyzeDictationWithAI, analyzeShadowingByURL, dictionaryLookup, generateToeicPlan, translateText } from "../services/gemini.service";
import { ApiResponse } from "../utils/ApiResponse";
import { Shadowing } from "../models/shadowing.model";

export async function generateToeicPlanController(req: Request, res: Response, next: NextFunction) {
    try {
        const userInput = req.body;

        // Gọi service xử lý Gemini
        const plan = await generateToeicPlan(userInput);

        return res.status(200).json(
            ApiResponse.success(plan, "Tạo kế hoạch TOEIC thành công!")
        );
    } catch (error: any) {
        next(error);
    }
}

export const dictionaryController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { query } = req.body;

        const result = await dictionaryLookup(query);

        return res.status(200).json(
            ApiResponse.success(result, "Tra cứu từ điển thành công!")
        );
    } catch (error: any) {
        next(error);
    }
};

export const translateController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { text, sourceLang, targetLang } = req.body;
        const result = await translateText(text, sourceLang, targetLang);
        return res.status(200).json(
            ApiResponse.success(result, "Dịch văn bản thành công!")
        );
    } catch (error) {
        next(error);
    }
};

export const analyzeDictationController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { logs, dictation } = req.body

        if (!logs || !Array.isArray(logs) || !dictation) {
            return res.status(400).json(ApiResponse.fail("Thiếu dữ liệu logs hoặc dictation."))
        }

        const result = await analyzeDictationWithAI(logs, dictation)

        return res.status(200).json(
            ApiResponse.success(result, "Phân tích bài luyện Dictation thành công!")
        )
    } catch (error) {
        next(error)
    }
}

export const analyzeShadowingController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { user_audio_url, level, segmentIndex, shadowing } = req.body;

        const shadowingId = shadowing?._id;

        if (!user_audio_url || shadowingId === undefined)
            return res.status(400).json(ApiResponse.fail("Thiếu dữ liệu âm thanh hoặc bài shadowing."));

        const shadowingData = await Shadowing.findById(shadowingId);
        if (!shadowingData)
            return res.status(404).json(ApiResponse.fail("Không tìm thấy bài shadowing."));

        const segment = shadowingData.timings[segmentIndex];
        if (!segment)
            return res.status(400).json(ApiResponse.fail(`Không tìm thấy segment index ${segmentIndex}.`));

        const meta = {
            level: level || shadowingData.level,
            segmentIndex,
            nativeText: segment.text,
        };

        const result = await analyzeShadowingByURL(user_audio_url, meta);
        return res.status(200).json(ApiResponse.success(result, "✅ Phân tích thành công!"));
    } catch (err) {
        next(err);
    }
};


