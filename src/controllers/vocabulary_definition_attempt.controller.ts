import { NextFunction, Request, Response } from "express";
import { createVocabularyDefinitionAttemptService, getVocabularyDefinitionAttemptsByUserService } from "../services/vocabulary_definition_attempt.service";
import { ApiResponse } from "../utils/ApiResponse";

export const createVocabularyDefinitionAttemptController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const data = req.body; // Giả sử body chứa mảng các attempt

        const result = await createVocabularyDefinitionAttemptService(data, userId);

        res.status(201).json(
            ApiResponse.success(result, "Tạo mới các lần thử định nghĩa từ vựng thành công.")
        )
    } catch (err) {
        next(err);
    }
}

export const getVocabularyDefinitionAttemptsByUserController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await getVocabularyDefinitionAttemptsByUserService(userId, page, limit);

        res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách các lần thử định nghĩa từ vựng thành công.")
        )
    } catch (err) {
        next(err);
    }
}