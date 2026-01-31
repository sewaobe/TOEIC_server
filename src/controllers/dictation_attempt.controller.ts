import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { createDictationAttempt } from "../services/dictation_attempt.service";
import { IDictationAttempt } from "../models";

export const createDictationAttemptController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            return res
                .status(401)
                .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
        }

        const userId = req.user._id;
        const { data, dictation_id } = req.body;

        const result = await createDictationAttempt(data, userId, dictation_id);

        res.status(200).json(
            ApiResponse.success(result, "Tạo mới dictation attempt thành công")
        )
    } catch (err) {
        next(err)
    }
}