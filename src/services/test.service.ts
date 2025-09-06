import { Test, ITest, UserTest, IQuestion, Comment } from "../models";
import { Types } from "mongoose";
import { TestStatus } from "../models/enums/TestStatus";

// services/test.service.ts
export const getFullTest = async (testId: string): Promise<ITest | null> => {
  return Test.findById(testId)
    .populate("audioListen", "url")
    .populate("questions.$*.groups.audioUrl", "url")
    .populate("questions.$*.groups.imagesUrl", "url")
    .populate("questions.$*.groups.questions");
};

export const getPart = async (testId: string, partName: string) => {
  const test = await getFullTest(testId);
  if (!test) return null;

  return {
    ...test.toObject(),
    questions: {
      ["Part " + partName]: test.questions.get("Part " + partName),
    },
  };
};

export const getParts = async (testId: string, partNames: string[]) => {
  const test = await getFullTest(testId);
  if (!test) return null;

  const selected: Record<string, any> = {};
  partNames.forEach((p) => {
    const data = test.questions.get("Part " + p);
    if (data) selected["Part " + p] = data;
  });

  return {
    ...test.toObject(),
    questions: selected,
  };
};


// Submit test
export const submitTest = async (
  userId: string,
  testId: string,
  answers: { question_id: string; selectedOption: string }[],
  duration: number, 
  completedPart?: string,
) => {
  const test = await getFullTest(testId);
  if (!test) throw new Error("Test not found");

  const detailedAnswers = answers.map((a) => {
    let correct = false;

    // Duyệt từng part trong Map
    test.questions.forEach((partData, partName) => {
      if (!partData.groups || partData.groups.length === 0) {
        console.log("No groups in part:", partName);
        return;
      }

      // Duyệt từng group trong part
      for (const group of partData.groups) {
        // Duyệt từng question trong group
        for (const q of group.questions || []) {
          const question = q as unknown as IQuestion; // cast qua unknown trước
          if (question._id!.toString() === a.question_id) {
            correct = question.correctAnswer === a.selectedOption[0];
            break;
          }
        }

        if (correct) break; // đã tìm thấy question, thoát group
      }
      if (correct) return; // đã tìm thấy question, thoát part
    });

    return {
      question_id: new Types.ObjectId(a.question_id),
      selectedOption: a.selectedOption[0],
      isCorrect: correct,
    };
  });

  // Tính điểm
  const score =
    (detailedAnswers.filter((a) => a.isCorrect).length /
      detailedAnswers.length) *
    990;
  console.log('điểm là', score)
  // Lưu UserTest
  const userTest = new UserTest({
    user_id: new Types.ObjectId(userId),
    test_id: new Types.ObjectId(testId),
    score,
    answers: detailedAnswers,
    completedPart,
    duration,
    submit_at: new Date(),
  });

  await userTest.save();

  return { score, answers: detailedAnswers };
};

export const getTestsWithScoreAndSearch = async (
  userId: string,
  page: number,
  limit: number,
  search?: string
) => {
  const skip = (page - 1) * limit;

  const matchStage = search
    ? { title: { $regex: new RegExp(search, "i") } }
    : {};

  const tests = await Test.aggregate([
    { $match: matchStage },

    // Lấy kết quả cá nhân (cao nhất)
    {
      $lookup: {
        from: "usertests",
        let: { testId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$test_id", "$$testId"] },
                  { $eq: ["$user_id", new Types.ObjectId(userId)] },
                ],
              },
            },
          },
          { $sort: { score: -1 } },
          { $limit: 1 },
        ],
        as: "userResult",
      },
    },

    // Tổng số người làm bài test (distinct user_id)
    {
      $lookup: {
        from: "usertests",
        let: { testId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$test_id", "$$testId"] } } },
          // { $group: { _id: "$user_id" } }, // group để loại trùng user
          { $count: "count" },
        ],
        as: "totalUsers",
      },
    },

    // Tổng số comment
    {
      $lookup: {
        from: "comments",
        let: { testId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$test_id", "$$testId"] } } },
          { $count: "count" },
        ],
        as: "totalComments",
      },
    },

    { $sort: { createdAt: -1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },

    {
      $project: {
        _id: 0,
        id: "$_id",
        title: 1,
        details: "chưa có",
        score: { $ifNull: [{ $arrayElemAt: ["$userResult.score", 0] }, null] },
        totalUsers: { $ifNull: [{ $arrayElemAt: ["$totalUsers.count", 0] }, 0] },
        totalComments: {
          $ifNull: [{ $arrayElemAt: ["$totalComments.count", 0] }, 0],
        },
      },
    },
  ]);

  const totalTests = await Test.countDocuments(matchStage);
  const totalPages = Math.ceil(totalTests / limit);

  return { tests, totalTests, totalPages };
};


export const getLatestTest = async (limit: number = 5): Promise<ITest[]> => {
  return await Test.find({ status: TestStatus.OPEN })
    .select("title type status topic countComment countSubmit create_at")
    .sort({ create_at: -1 })
    .limit(limit)
};

export const getTestDetail = async (
  testId: string,
  userId?: string,
) => {
  const test = await Test.findById(testId)
    .select("_id title audioListen createdAt")
    .populate("audioListen", "url")
    .lean();

  if (!test) return null;

  const totalUsers = await UserTest.countDocuments({
    test_id: new Types.ObjectId(testId),
  });

  const totalComments = await Comment.countDocuments({
    test_id: new Types.ObjectId(testId),
  });

  // highest score của user hiện tại
  let highestScore = null;
  if (userId) {
    const best = await UserTest.findOne({
      test_id: new Types.ObjectId(testId),
      user_id: new Types.ObjectId(userId),
    })
      .sort({ score: -1 })
      .lean();
    highestScore = best ? best.score : null;
  }


  return {
    ...test,
    totalUsers,
    totalComments,
    highestScore,
  };
};
