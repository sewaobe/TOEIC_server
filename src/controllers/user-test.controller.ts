import { NextFunction, Request, Response } from 'express';
import { getRecentUserTestsService } from './../services/user_test.service';

export const getRecentUserTests = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 3;
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                status: 'fail',
                message: 'Unauthorized: User not found in token',
            });
            return;
        }

        const recentTests = await getRecentUserTestsService(userId, limit);

        res.status(200).json({
            status: 'success',
            message: `Lấy danh sách ${limit} bài làm gần nhất thành công`,
            data: recentTests,
        });
    } catch (error) {
        next(error);
    }
};
