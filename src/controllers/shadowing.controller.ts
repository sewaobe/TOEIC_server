import { NextFunction, Request, Response } from "express"
import { ApiResponse } from "../utils/ApiResponse";
import { IShadowing } from "../models/shadowing.model";
import { createShadowingService, deleteShadowingService, getAllShadowingService, updateShadowingService } from "../services/shadowing.service";


export const getAllShadowingController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await getAllShadowingService(page, limit);

        res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách shadowing thành công!")
        )
    } catch (err) {
        next(err)
    }
}

export const createShadowingController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const payload: IShadowing = req.body;
        const result = await createShadowingService(payload);

        res.status(200).json(
            ApiResponse.success(result, "Thêm shadowing thành công")
        )
    } catch (err) {
        next(err)
    }
}

export const updateShadowingController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const shadowingId = req.params.id;
        const payload = req.body;

        // Kiểm tra ID hợp lệ
        if (!shadowingId || shadowingId.length !== 24) {
            return res
                .status(400)
                .json(ApiResponse.fail("ID không hợp lệ hoặc thiếu ID trong request"));
        }

        const result = await updateShadowingService(payload, shadowingId);

        if (!result) {
            return res
                .status(404)
                .json(ApiResponse.fail("Không tìm thấy bài shadowing cần cập nhật"));
        }

        res.status(200).json(
            ApiResponse.success(result, "Sửa shadowing thành công")
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

export const deleteShadowingController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const shadowingId = req.params.id;
        if (!shadowingId || shadowingId.length !== 24) {
            return res
                .status(400)
                .json(ApiResponse.fail("ID không hợp lệ hoặc thiếu trong request"));
        }

        const deleted = await deleteShadowingService(shadowingId);

        if (!deleted) {
            return res
                .status(404)
                .json(ApiResponse.fail("Không tìm thấy bài shadowing cần xóa"));
        }

        res.status(200).json(
            ApiResponse.success(null, "Xóa bài shadowing thành công")
        );
    } catch (err) {
        next(err)
    }
}