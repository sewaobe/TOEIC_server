import { Types } from "mongoose";
import { UserTest } from "../models";
import { TestStatus } from "../models/enums/TestStatus";
import { IUserRecentTest } from "../dto/IUserRecentTest";

export const getRecentUserTestsService = async (
    userId: string,
    limit: number = 3
): Promise<IUserRecentTest[]> => {
    const userObjectId = new Types.ObjectId(userId);

    const recentTests = await UserTest.aggregate<IUserRecentTest>([
        // Lọc bài làm của user
        { $match: { user_id: userObjectId } },

        // Sort bài làm gần nhất
        { $sort: { submit_at: -1 } },
        { $limit: limit },

        // Join Test để lấy thông tin đề thi
        {
            $lookup: {
                from: "tests",
                localField: "test_id",
                foreignField: "_id",
                as: "test",
            },
        },
        { $unwind: "$test" },
        { $match: { "test.status": TestStatus.OPEN } },
        // Chọn field cần thiết để trả về
        {
            $project: {
                _id: 0,
                test_id: "$test._id",
                title: "$test.title",
                type: "$test.type",
                status: "$test.status",
                topic: "$test.topic",
                created_at: "$test.created_at",
                score: 1, // score của user
                submit_at: 1, // thời gian submit
                countSubmit: "$test.countSubmit",
                countComment: "$test.countComment",
            },
        },
    ]);

    return recentTests;
};
