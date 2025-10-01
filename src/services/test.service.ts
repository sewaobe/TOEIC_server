import {
  Test,
  Group,
  IGroup,
  ITest,
  IQuestion,
  Comment,
  UserTest,
  Media,
  Question,
} from "../models";
import { Types } from "mongoose";
import { TestStatus } from "../models/enums/TestStatus";

export const getFullTest = async (testId: string): Promise<any | null> => {
  const test = await Test.findById(testId)
    .populate("audioListen", "url")
    .populate({
      path: "groups",
      model: "Group",
      populate: [
        { path: "audioUrl", select: "url" },
        { path: "imagesUrl", select: "url" },
        { path: "questions" }, // populate Question
      ],
    })
    .lean();

  if (!test) return null;
  const groups = test.groups as IGroup[];
  // ⚡ convert từ test.groups[] → test.questions Map như cũ
  const questions: Record<string, any> = {};

  for (const group of groups) {
    const partName = `Part ${group.part}`;
    if (!questions[partName]) {
      questions[partName] = { groups: [] };
    }
    questions[partName].groups.push(group);
  }

  return {
    ...test,
    questions,
  };
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
    const data = test.questions["Part " + p];
    if (data) selected["Part " + p] = data;
  });

  return {
    ...test,
    questions: selected,
  };
};

// Submit test
export const submitTest = async (
  userId: string,
  testId: string,
  answers: { question_id: string; selectedOption: string }[],
  duration: number,
  completedPart?: string
) => {
  const test = await getFullTest(testId);
  if (!test) throw new Error("Test not found");

  // Map lưu số câu đúng từng part
  const partStats: Record<string, { correct: number; total: number }> = {};

  const detailedAnswers = answers.map((a) => {
    let correct = false;

    // ✅ duyệt qua object bằng Object.entries thay vì .entries()
    for (const [partName, partData] of Object.entries(
      test.questions as Record<string, { groups: IGroup[] }>
    )) {
      if (!partData.groups) continue;

      for (const group of partData.groups) {
        for (const qRaw of group.questions || []) {
          const question = qRaw as unknown as IQuestion;

          if (question._id!.toString() === a.question_id) {
            correct = question.correctAnswer === a.selectedOption[0];

            // Cập nhật stats cho part
            if (!partStats[partName])
              partStats[partName] = { correct: 0, total: 0 };
            partStats[partName].total += 1;
            if (correct) partStats[partName].correct += 1;

            break;
          }
        }
        if (correct) break;
      }
      if (correct) break;
    }

    return {
      question_id: new Types.ObjectId(a.question_id),
      selectedOption: a.selectedOption[0],
      isCorrect: correct,
    };
  });

  // Tính tổng điểm
  const score =
    (detailedAnswers.filter((a) => a.isCorrect).length /
      detailedAnswers.length) *
    990;

  // Chuyển stats thành parts array
  const parts = Object.entries(partStats).map(([part_name, stat]) => ({
    part_name,
    accuracy: stat.total > 0 ? (stat.correct / stat.total) * 100 : 0,
  }));

  // Lưu vào DB
  const userTest = new UserTest({
    user_id: new Types.ObjectId(userId),
    test_id: new Types.ObjectId(testId),
    score,
    answers: detailedAnswers,
    parts,
    completedPart: completedPart || "",
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
                  { $in: ["$completedPart", ["full-test", "demo_test"]] },
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
        totalUsers: {
          $ifNull: [{ $arrayElemAt: ["$totalUsers.count", 0] }, 0],
        },
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
    .limit(limit);
};

export const getTestDetail = async (testId: string, userId?: string) => {
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
export const getAllTests = async (
  page: number = 1,
  limit: number = 10
): Promise<{ tests: Partial<ITest>[]; total: number }> => {
  const skip = (page - 1) * limit;

  const [tests, total] = await Promise.all([
    Test.find({})
      .select("title type status topic countComment countSubmit created_at")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Test.countDocuments(),
  ]);

  return { tests, total };
};

export const createTest = async (data: Partial<ITest>): Promise<ITest> => {
  // 1. Tạo Test rỗng trước
  const newTest = new Test({
    title: data.title,
    audioListen: [],
    groups: [],
    type: data.type || "full-test",
    status: data.status || "draft",
    topic: data.topic || "",
    countComment: 0,
    countSubmit: 0,
    created_by: data.created_by ? new Types.ObjectId(data.created_by) : null,
    updated_at: new Date(),
  });

  await newTest.save();

  const groupIds: Types.ObjectId[] = [];

  // 2. Duyệt qua groups từ FE
  if (data.groups && data.groups.length > 0) {
    for (const g of data.groups as any[]) {
      //2.1 Audio
      let audioMediaId: Types.ObjectId | null = null;
      if (g.audioUrl && g.audioUrl.url) {
        const audioMedia = await Media.create({
          url: g.audioUrl.url,
          type: g.audioUrl.type || "AUDIO",
          transcript: "",
          topic: data.topic || "",
        });
        audioMediaId = audioMedia._id as Types.ObjectId; // ✅ ép kiểu
      }

      //2.2 Images
      const imageMediaIds: Types.ObjectId[] = [];
      if (g.imagesUrl && g.imagesUrl.length > 0) {
        for (const img of g.imagesUrl) {
          const imageMedia = await Media.create({
            url: img.url,
            type: img.type || "IMAGE",
            transcript: "",
            topic: data.topic || "",
          });
          imageMediaIds.push(imageMedia._id as Types.ObjectId); // ✅ ép kiểu
        }
      }

      // 2.3 Tạo Questions
      const questionIds: Types.ObjectId[] = [];
      if (g.questions && g.questions.length > 0) {
        for (let i = 0; i < g.questions.length; i++) {
          const q = g.questions[i];
          const question = await Question.create({
            name: q.name || `Question ${i + 1}`,
            textQuestion: q.textQuestion || "",
            choices: q.choices || {},
            correctAnswer: q.correctAnswer || "",
            explanation: q.explanation || "",
            tags: q.tags || [],
            planned_time: q.planned_time || 0,
            created_by: data.created_by
              ? new Types.ObjectId(data.created_by)
              : null,
            created_at: new Date(),
            updated_at: new Date(),
          });
          questionIds.push(question._id);
        }
      }

      // 2.4 Tạo Group
      const group = await Group.create({
        test_id: newTest._id,
        part: g.partIndex,
        type: g.type || "TEST",
        audioUrl: audioMediaId,
        imagesUrl: imageMediaIds,
        transcriptEnglish: g.transcriptEnglish || "",
        transcriptTranslation: g.transcriptTranslation || "",
        questions: questionIds,
        created_at: new Date(),
        updated_at: new Date(),
      });

      groupIds.push(group._id);
    }
  }

  // 3. Cập nhật lại Test với groupIds
  newTest.groups = groupIds;
  await newTest.save();

  // 4. Populate kết quả trả về
  return (await Test.findById(newTest._id)
    .populate({
      path: "groups",
      populate: [
        { path: "audioUrl" },
        { path: "imagesUrl" },
        { path: "questions" },
      ],
    })
    .lean()
    .exec()) as ITest;
};
