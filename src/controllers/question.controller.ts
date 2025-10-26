import { NextFunction, Request, Response } from "express";
import { getQuestionDetailById } from "../services/question.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getQuestionByIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const test_id  = req.query.test_id as string;
        const { question_id } = req.params;
        if (!question_id || !test_id) {
            res.status(400).json(
                ApiResponse.fail("Thiếu tham số question_id hoặc test_id.")
            );
            return;
        }

        const questionDetail = await getQuestionDetailById(question_id, test_id);
        if (!questionDetail) {
            res.status(404).json(ApiResponse.fail("Không tìm thấy câu hỏi."));
            return;
        }

        res
            .status(200)
            .json(ApiResponse.success(questionDetail, "Lấy thông tin câu hỏi thành công."));

    } catch (err) {
        next(err);
    }
}