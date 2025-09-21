import { NextFunction, Request, Response } from 'express';
import { getRecentUserTestsService, getTestHistoryDetailService, getUserTestHistoryService } from './../services/user_test.service';
import { ApiResponse } from '../utils/ApiResponse';
import { IUserRecentTest } from '../dto/IUserRecentTest';
import { Types } from 'mongoose';
import { IUserTestHistory } from '../dto/IUserTestHistory';
import { PaginationResult } from '../dto/PaginationResult';

export const getRecentUserTests = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 3;
        const userId = req.user._id;

        const recentTests: IUserRecentTest[] = await getRecentUserTestsService(userId, limit);

        if (recentTests.length === 0) {
            res.status(200).json(ApiResponse.success<IUserRecentTest[]>([], "Bạn chưa làm bài thi nào gần đây"))
            return;
        }
        res.status(200).json(ApiResponse.success<IUserRecentTest[]>(recentTests, `Lấy danh sách ${limit} bài làm gần nhất thành công`));
    } catch (error) {
        next(error);
    }
};


export const getUserTestHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user._id.toString();
        const { testId } = req.params;
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 4);

        if (!testId) {
            res.status(404).json(ApiResponse.fail("Không tìm thấy lịch sử bài kiểm tra!"));
            return;
        }

        if (!Number.isFinite(page) || page < 1 || !Number.isFinite(limit) || limit < 1) {
            res.status(400).json(ApiResponse.fail("Tham số page/limit không hợp lệ."));
            return;
        }

        // Service trả về PaginationResult<IUserTestHistory>
        const result: PaginationResult<IUserTestHistory> =
            await getUserTestHistoryService(userId, testId, page, limit);

        // Nếu không có dữ liệu
        if (!result.data.length) {
            res
                .status(200)
                .json(
                    ApiResponse.success<PaginationResult<IUserTestHistory>>(
                        { ...result, data: [] },
                        "Bạn chưa có lịch sử làm bài kiểm tra này!"
                    )
                );
            return;
        }

        res
            .status(200)
            .json(
                ApiResponse.success<PaginationResult<IUserTestHistory>>(
                    result,
                    `Lấy lịch sử làm bài của bài kiểm tra ${testId} thành công`
                )
            );
    } catch (error) {
        next(error);
    }
};

export const getTestHistoryDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { historyId } = req.params;

        if (!historyId) {
            res.status(404).json(ApiResponse.fail("Không tìm thấy lịch sử chi tiết bài kiểm tra!"));
            return;
        }
        const result = await getTestHistoryDetailService(historyId);
        if (!result) {
            res.status(404)
                .json(ApiResponse.fail("Không tìm thấy lịch sử bài kiểm tra!"));
            return;
        }

        res.status(200)
            .json(ApiResponse.success(result, "Lấy chi tiết lịch sử làm bài thành công"));

    }
    catch (error) {
        next(error);
    }
}