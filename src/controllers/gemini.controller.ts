import { NextFunction, Request, Response } from "express";
import { generateToeicPlan } from "../services/gemini.service";
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
