import { PipelineStage, Types } from "mongoose";
import { UserTest } from "../models";
import { TestStatus } from "../models/enums/TestStatus";
import { IUserRecentTest } from "../dto/IUserRecentTest";
import { IUserTestHistory } from "../dto/IUserTestHistory";
import { PaginationResult } from "../dto/PaginationResult";

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

export const getUserTestHistoryService = async (
    userId: string,
    testId: string,
    page: number,
    limit: number
): Promise<PaginationResult<IUserTestHistory>> => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10)); // chặn limit quá lớn
    const skip = (safePage - 1) * safeLimit;

    const userObjectId = new Types.ObjectId(userId);
    const testObjectId = new Types.ObjectId(testId);

    const pipeline: PipelineStage[] = [
        { $match: { user_id: userObjectId, test_id: testObjectId } },
        {
            $facet: {
                data: [
                    { $sort: { submit_at: -1 } },
                    {
                        $project: {
                            submit_at: 1,
                            completedPart: 1,
                            score: 1,
                            duration: 1,
                            correctCount: {
                                $size: {
                                    $filter: {
                                        input: "$answers",
                                        as: "answer",
                                        cond: { $eq: ["$$answer.isCorrect", true] }
                                    }
                                }
                            },
                            questionCount: {
                                $size: "$answers"
                            }
                        }
                    },
                    { $skip: skip },
                    { $limit: safeLimit }
                ],
                meta: [
                    { $count: "total" }
                ]
            }
        },
        {
            $addFields: {
                total: { $ifNull: [{ $arrayElemAt: ["$meta.total", 0] }, 0] }
            }
        },
        { $project: { meta: 0 } }
    ];

    const agg = await UserTest.aggregate(pipeline).exec();
    const first = agg[0] || { data: [], total: 0 };

    const total = first.total as number;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    return {
        data: first.data as IUserTestHistory[],
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages,
            hasNext: safePage < totalPages,
            hasPrev: safePage > 1
        }
    };
}




export interface ITagAccuracy {
  tag: string;
  correct: number;
  total: number;
  accuracy: number; // correct / total
}
export const getDemoTestTagAccuracyService = async (
  userId: string
): Promise<ITagAccuracy[]> => {
  const userObjectId = new Types.ObjectId(userId);

  // Lấy demo_test mới nhất
  const demoTest = await UserTest.findOne({
    user_id: userObjectId,
    completedPart: "demo_test",
  })
    .sort({ submit_at: -1 })
    .populate({
      path: "answers.question_id",
      select: "tags", // Question có trường tags: string[]
    })
    .lean();

  if (!demoTest) return [];

  // Gom kết quả theo tag
  const tagMap: Record<string, { correct: number; total: number }> = {};

  for (const ans of demoTest.answers) {
    const q: any = ans.question_id;
    if (!q || !q.tags) continue;

    for (const tag of q.tags) {
      if (!tagMap[tag]) tagMap[tag] = { correct: 0, total: 0 };
      tagMap[tag].total += 1;
      if (ans.isCorrect) tagMap[tag].correct += 1;
    }
  }

  // Convert sang array
  const result: ITagAccuracy[] = Object.entries(tagMap).map(([tag, val]) => ({
    tag,
    correct: val.correct,
    total: val.total,
    accuracy: val.total > 0 ? val.correct / val.total : 0,
  }));

  return result;
};