import { NextFunction, Request, Response } from "express";
import { dictionaryLookup, generateToeicPlan, translateText } from "../services/gemini.service";
import { ApiResponse } from "../utils/ApiResponse";

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