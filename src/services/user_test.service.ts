import { PipelineStage, Types } from "mongoose";
import { Group, IUserTest, UserTest } from "../models";
import { UserTestSubmitType } from "../models/enums/UserTestSubmitType";
import { TestStatus } from "../models/enums/TestStatus";
import { IUserRecentTest } from "../dto/IUserRecentTest";
import { IUserTestHistory } from "../dto/IUserTestHistory";
import { PaginationResult } from "../dto/PaginationResult";
import type {
  NormalizedTestResultV2,
  RawUserTestLikeInput,
} from "../types/learning_path_v2";

export interface CreateLearningPathUserTestInput {
  user_id: string;
  test_id: string;
  normalized_result: NormalizedTestResultV2;
}

export const buildCompletedPartFromNormalizedResult = (
  normalizedResult: NormalizedTestResultV2
): string => {
  const partTypes = new Set<number>();

  for (const part of normalizedResult.part_results) {
    if (part.part_type !== undefined) {
      partTypes.add(part.part_type);
    }
  }

  if (partTypes.size === 0) {
    for (const answer of normalizedResult.answers) {
      if (answer.part_type !== undefined) {
        partTypes.add(answer.part_type);
      }
    }
  }

  return [...partTypes]
    .sort((a, b) => a - b)
    .map((partType) => `Part ${partType}`)
    .join(",");
};

export const getLatestUserTestBySubmitType = async (input: {
  user_id: string;
  submit_type: UserTestSubmitType;
}): Promise<IUserTest | null> => {
  const userIdCandidates: unknown[] = [input.user_id];

  /*
   * Support both string and ObjectId user_id because historical UserTest
   * documents are not guaranteed to use one consistent type.
   */
  if (Types.ObjectId.isValid(input.user_id)) {
    userIdCandidates.push(new Types.ObjectId(input.user_id));
  }

  return UserTest.findOne({
    user_id: { $in: userIdCandidates },
    submit_type: input.submit_type,
  }).sort({ submit_at: -1 });
};

export const buildRawUserTestLikeInputFromUserTest = async (
  userTest: IUserTest
): Promise<RawUserTestLikeInput> => {
  const questionIds = (userTest.answers ?? [])
    .map((answer) => answer.question_id)
    .filter(Boolean);

  const groups = await Group.find({
    questions: { $in: questionIds },
  })
    .select("_id part questions")
    .populate({
      path: "questions",
      select: "_id tags irt_difficulty weight correctAnswer",
    })
    .lean();

  const questionMetaMap = new Map<
    string,
    {
      part_type?: number;
      tags: string[];
      irt_difficulty: number;
    }
  >();

  for (const group of groups as any[]) {
    for (const question of group.questions ?? []) {
      questionMetaMap.set(String(question._id), {
        part_type: group.part,
        tags: Array.isArray(question.tags) ? question.tags : [],
        irt_difficulty:
          typeof question.irt_difficulty === "number"
            ? question.irt_difficulty
            : typeof question.weight === "number"
              ? question.weight
              : 0,
      });
    }
  }

  return {
    test_id: String(userTest.test_id),
    submitted_at: userTest.submit_at,
    score: userTest.score,
    duration: userTest.duration,
    completedPart: userTest.completedPart,
    parts: userTest.parts,
    answers: (userTest.answers ?? []).map((answer) => {
      const questionId = String(answer.question_id);
      const meta = questionMetaMap.get(questionId);

      return {
        question_id: questionId,
        selected_option: answer.selectedOption,
        is_correct: answer.isCorrect,
        part_type: meta?.part_type,
        tags: meta?.tags ?? [],
        irt_difficulty: meta?.irt_difficulty ?? 0,
      };
    }),
  };
};

export const getRecentUserTestsService = async (
  userId: string,
  limit: number = 3
): Promise<IUserRecentTest[]> => {
  const userObjectId = userId;

  const recentTests = await UserTest.aggregate<IUserRecentTest>([
    // L?c b�i l�m c?a user
    { $match: { user_id: userObjectId } },

    // Sort b�i l�m g?n nh?t
    { $sort: { submit_at: -1 } },
    { $limit: limit },

    // Join Test d? l?y th�ng tin d? thi
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
    // Ch?n field c?n thi?t d? tr? v?
    {
      $project: {
        _id: 0,
        test_id: "$test._id",
        title: "$test.title",
        type: "$test.type",
        status: "$test.status",
        topic: "$test.topic",
        created_at: "$test.created_at",
        score: 1, // score c?a user
        submit_at: 1, // th?i gian submit
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
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10)); // ch?n limit qu� l?n
  const skip = (safePage - 1) * safeLimit;

  const userObjectId = userId;
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
              parts: 1, // Thêm parts để có độ chính xác từng phần
              correctCount: {
                $size: {
                  $filter: {
                    input: "$answers",
                    as: "answer",
                    cond: { $eq: ["$$answer.isCorrect", true] },
                  },
                },
              },
              questionCount: {
                $size: "$answers",
              },
            },
          },
          { $skip: skip },
          { $limit: safeLimit },
        ],
        meta: [{ $count: "total" }],
      },
    },
    {
      $addFields: {
        total: { $ifNull: [{ $arrayElemAt: ["$meta.total", 0] }, 0] },
      },
    },
    { $project: { meta: 0 } },
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
      hasPrev: safePage > 1,
    },
  };
};

export interface ITagAccuracy {
  tag: string;
  correct: number;
  total: number;
  accuracy: number; // correct / total
}

export const getDemoTestTagAccuracyService = async (
  userId: string
): Promise<Record<string, number>> => {
  const userObjectId = new Types.ObjectId(userId);

  // L?y demo_test m?i nh?t
  const demoTest = await UserTest.findOne({
    user_id: userObjectId,
    completedPart: "demo_test",
  })
    .sort({ submit_at: -1 })
    .populate({
      path: "answers.question_id",
      select: "tags", // Question c� tru?ng tags: string[]
    })
    .lean();

  if (!demoTest) return {};

  // Gom k?t qu? theo tag
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

  // Convert sang Record<string, number>
  const tagAccuracy: Record<string, number> = {};
  for (const [tag, val] of Object.entries(tagMap)) {
    tagAccuracy[tag] = val.total > 0 ? val.correct / val.total : 0;
  }

  return tagAccuracy;
};


const mapAnswer = (ans: any, idx: number) => {
  const qid = ans.question_id?._id ?? ans.question_id;

  return {
    question_id: qid.toString(),
    question_no: idx + 1,
    selectedOption: ans.selectedOption,
    isCorrect: ans.isCorrect,
    correctAnswer: ans.question_id.correctAnswer,
    tags: ans.question_id.tags || [],
  };
};

export const getTestHistoryDetailService = async (historyId: string) => {
  const historyObjectId = new Types.ObjectId(historyId);

  // Tìm lịch sử bài test
  const history = await UserTest.findById(historyObjectId)
    .populate({
      path: "answers.question_id",
      select: "name tags correctAnswer", // chỉ lấy trường tags để tối ưu
    })
    .lean<IUserTest & { answers: any[] }>()
    .exec();

  if (!history) {
    throw new Error("Không tìm thấy lịch sử bài test");
  }

  // Map answers sang format RawAnswer
  const rawAnswers = history.answers.map((ans, idx) => mapAnswer(ans, idx));

  return {
    score: history.score,
    answers: rawAnswers,
    completedPart: history.completedPart,
    duration: history.duration,
    submit_at: history.submit_at,
  };
};

export const updatedThetaInUserTestService = async (
  theta_parts: Record<number, number>,
  theta_overall: number,
  userTestId: string
) => {
  const userTestObjectId = new Types.ObjectId(userTestId);
  // sanitize inputs to avoid writing NaN into numeric fields
  const safeThetaOverall = Number.isFinite(theta_overall) ? theta_overall : 0;
  const safeThetaParts: Record<number, number> = {};
  for (let p = 1; p <= 7; p++) {
    const v = theta_parts[p];
    safeThetaParts[p] = Number.isFinite(v) ? v : 0;
  }

  if (!Number.isFinite(theta_overall)) {
    console.warn(
      `⚠️ updatedThetaInUserTestService: theta_overall is not finite for userTest=${userTestId}. Coercing to 0.`
    );
  }

  const updated = await UserTest.updateOne(
    { _id: userTestObjectId },
    { theta_parts: safeThetaParts, theta_overall: safeThetaOverall }
  ).exec();

  return updated;
};


export const claimUserTestService = async (
  resultId: string,
  userId: string
) => {
  const resultIdObject = new Types.ObjectId(resultId);
  const record = await UserTest.findOneAndUpdate(
    {
      _id: resultIdObject,
      user_id: "guest"
    },
    {
      $set: {
        user_id: userId
      }
    },
    { new: true }
  )

  return record;
}
