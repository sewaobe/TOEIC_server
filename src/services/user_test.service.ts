import { Types } from "mongoose";
import { UserTest, IUserTest, Test, Comment } from "../models";

export const getRecentUserTestsService = async (
    userId: string,
    limit: number = 3
): Promise<any[]> => {
    const userObjectId = new Types.ObjectId(userId);

    const recentTests = await UserTest.aggregate([
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

        // Join UserTest để đếm số người đã làm bài đó
        {
            $lookup: {
                from: "usertests",
                localField: "test._id",
                foreignField: "test_id",
                as: "allUserTests",
            },
        },
        { $addFields: { totalUsers: { $size: "$allUserTests" } } },

        // Join Comment để đếm số comment
        {
            $lookup: {
                from: "comments",
                localField: "test._id",
                foreignField: "test_id",
                as: "comments",
            },
        },
        { $addFields: { totalComments: { $size: "$comments" } } },

        // Chọn field cần thiết để trả về
        {
            $project: {
                _id: 0,
                test_id: "$test._id",
                title: "$test.title",
                type: "$test.type",
                status: "$test.status",
                created_at: "$test.created_at",
                score: 1, // score của user
                submit_at: 1, // thời gian submit
                totalUsers: 1,
                totalComments: 1,
            },
        },
    ]);

    return recentTests;
};
