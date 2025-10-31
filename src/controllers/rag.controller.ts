import { NextFunction, Request, Response } from "express";
import { getContextById, retrieveContext } from "../retriever/retriever";
import { generateAnswer } from "../core/llm";
import { ApiResponse } from "../utils/ApiResponse";
import { ingestQuestion } from "../ingest/ingest_question";

export const handleAskQuestionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { query, questionId } = req.body;

        if (!query) {
            return res.status(400).json(ApiResponse.fail("Thiếu tham số `query`."));
        }

        // Bước 1: Lấy context
        let contextResult = null;
        if (questionId) {
            contextResult = await getContextById(questionId);
        } else {
            contextResult = await retrieveContext(query);
        }

        if (!contextResult || !contextResult.context?.trim()) {
            return res.json(ApiResponse.success("Mình chưa có thông tin cho câu này 🤔"));
        }

        // Bước 2: Gọi Gemini API sinh câu trả lời
        const answer = await generateAnswer(query, contextResult.context);

        // Bước 3: Trả phản hồi
        return res.status(200).json(
            ApiResponse.success(
                {
                    answer,
                    mode: contextResult.type, // semantic hoặc by_id
                    sources: contextResult.metadatas,
                },
                "Trả lời câu hỏi thành công"
            )
        );
    } catch (error) {
        next(error);
    }
}

/**
 * Nạp dữ liệu Question từ MongoDB vào ChromaDB
 */
export const handleIngestQuestionController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await ingestQuestion();
        res.status(200).json(ApiResponse.success(null, "Nạp dữ liệu Question vào Chroma thành công"));
    } catch (error) {
        next(error);
    }
};