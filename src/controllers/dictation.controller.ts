import { NextFunction, Request, Response } from "express"
import { ApiResponse } from "../utils/ApiResponse";
import { createDictationService, deleteDictationService, getAllDictationService, updateDictationService } from "../services/dictation.service";
import { IDictation } from "../models/dictation.model";


export const getAllDictationController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await getAllDictationService(page, limit);

        res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách nghe chép chỉnh tả thành công!")
        )
    } catch (err) {
        next(err)
    }
}

export const createDictationController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const payload: IDictation = req.body;
        const result = await createDictationService(payload);

        res.status(200).json(
            ApiResponse.success(result, "Thêm nghe chép chính tả thành công")
        )
    } catch (err) {
        next(err)
    }
}

export const updateDictationController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dictationId = req.params.id;
        const payload = req.body;

        // Kiểm tra ID hợp lệ
        if (!dictationId || dictationId.length !== 24) {
            return res
                .status(400)
                .json(ApiResponse.fail("ID không hợp lệ hoặc thiếu ID trong request"));
        }

        const result = await updateDictationService(payload, dictationId);

        if (!result) {
            return res
                .status(404)
                .json(ApiResponse.fail("Không tìm thấy bài nghe cần cập nhật"));
        }

        res.status(200).json(
            ApiResponse.success(result, "Sửa nghe chép chính tả thành công")
        )
    } catch (err: any) {

        if (err.name === "ValidationError") {
            return res
                .status(400)
                .json(ApiResponse.fail("Dữ liệu không hợp lệ: " + err.message));
        }

        next(err)
    }
}

export const deleteDictationController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dictationId = req.params.id;
        if (!dictationId || dictationId.length !== 24) {
            return res
                .status(400)
                .json(ApiResponse.fail("ID không hợp lệ hoặc thiếu trong request"));
        }

        const deleted = await deleteDictationService(dictationId);

        if (!deleted) {
            return res
                .status(404)
                .json(ApiResponse.fail("Không tìm thấy bài nghe cần xóa"));
        }

        res.status(200).json(
            ApiResponse.success(null, "Xóa bài nghe chép chính tả thành công")
        );
    } catch (err) {
        next(err)
    }
}