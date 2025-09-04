import { NextFunction, Request, Response } from 'express';
import { getRecentUserTestsService } from './../services/user_test.service';
import { ApiResponse } from '../utils/apiResponse';
import { IUserRecentTest } from '../dto/IUserRecentTest';

export const getRecentUserTests = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 3;
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json(ApiResponse.fail("Không tìm thấy token của người dùng!"));
            return;
        }

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
