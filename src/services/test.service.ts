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
import {
  createGroupWithNewRelations,
  updateGroupWithRelations,
  deleteGroupWithRelations,
} from "./group.service";
import { pushNotification } from "../utils/pushNotification";
import { pushNotificationToAdmin } from "../utils/pushNotificationToAdmin";

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
    .populate({
      path: "created_by",
      select: "profile.fullname",
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

  // Tính tổng điểm: mỗi câu đúng = 5 điểm, tối đa 990
  const correctCount = detailedAnswers.filter((a) => a.isCorrect).length;
  const score = Math.min(correctCount * 5, 990);

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

  // Cập nhật thống kê cho test
  await Test.findByIdAndUpdate(testId, {
    $inc: { countSubmit: 1 },
  });

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

  // 1️⃣ Truy vấn danh sách test theo trang
  const tests = await Test.aggregate([
    { $match: matchStage },
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
    { $sort: { created_at: -1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        id: "$_id",
        title: 1,
        details: "chưa có",
        score: { $ifNull: [{ $arrayElemAt: ["$userResult.score", 0] }, null] },
        totalComments: "$countComment",
        totalUsers: "$countSubmit",
      },
    },
  ]);

  // 2️⃣ Lấy danh sách _id test để cập nhật countSubmit
  const testIds = tests.map((t) => new Types.ObjectId(t.id));
  if (testIds.length > 0) {
    // Đếm thực tế trong UserTest
    const submitCounts = await UserTest.aggregate([
      {
        $match: {
          test_id: { $in: testIds },
        },
      },
      {
        $group: {
          _id: "$test_id",
          total: { $sum: 1 },
        },
      },
    ]);

    // Cập nhật countSubmit vào bảng Test
    await Promise.all(
      submitCounts.map(async (s) => {
        await Test.updateOne(
          { _id: s._id },
          { $set: { countSubmit: s.total } }
        );
      })
    );
  }

  // 3️⃣ Phân trang tổng số
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
  limit: number = 10,
  search?: string,
  status?: string,
  topic?: string,
  type?: string // ✅ thêm tham số filter loại test
): Promise<{ items: Partial<ITest>[]; total: number; pageCount: number }> => {
  const skip = (page - 1) * limit;

  // 🔍 Xây dựng điều kiện lọc động
  const query: any = {};
  if (search) query.title = { $regex: search, $options: "i" }; // tìm kiếm không phân biệt hoa thường
  if (status) query.status = status;
  if (topic) query.topic = { $regex: topic, $options: "i" };
  // Nếu client truyền `type` thì filter theo type, nếu không truyền thì không giới hạn loại
  if (type) query.type = type;

  // 🧾 Lấy danh sách test + tổng số
  const [tests, total] = await Promise.all([
    Test.find(query)
      .select("title type status topic countComment countSubmit created_at")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Test.countDocuments(query),
  ]);

  // ✅ Chuẩn hóa dữ liệu trả về cho FE
  const items = tests.map((t) => ({
    id: t._id?.toString(),
    title: t.title,
    type: t.type,
    status: t.status,
    topic: t.topic,
    countComment: t.countComment,
    countSubmit: t.countSubmit,
    created_at: t.created_at,
  }));

  return {
    items,
    total,
    pageCount: Math.ceil(total / limit),
  };
};

/**
 * Tạo Test mới kèm Group + Media + Question mới
 */
export const createTest = async (data: Partial<ITest>): Promise<ITest> => {
  // 1. Tạo Test rỗng
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
  // 2. Tạo Group(s)
  const groupIds: Types.ObjectId[] = [];
  for (const g of data.groups ?? []) {
    const group = await createGroupWithNewRelations({
      ...(g as any), // ép kiểu cục bộ
      topic: data.topic,
      created_by: data.created_by,
      test_id: newTest._id,
    });
    groupIds.push(group._id as Types.ObjectId);
  }
  // 3. Cập nhật lại Test với groupIds
  newTest.groups = groupIds;
  await newTest.save();
  // 4. Populate kết quả trả về
  return (await Test.findById(newTest._id)
    .populate({
      path: "groups",
      populate: ["audioUrl", "imagesUrl", "questions"],
    })
    .lean()
    .exec()) as ITest;
};

export const deleteTest = async (id: string): Promise<boolean> => {
  const testId = new Types.ObjectId(id);
  const test = await Test.findById(testId);
  if (!test) return false;
  // Xoá tất cả group liên quan qua service
  const groups = await Group.find({ test_id: testId }).lean();
  for (const g of groups) {
    await deleteGroupWithRelations(g._id);
  }
  // Xoá test cuối cùng
  await Test.findByIdAndDelete(testId);
  return true;
};

// Hàm private: đồng bộ groups theo FE gửi
async function syncGroups(
  testId: Types.ObjectId,
  testObjectId: Types.ObjectId,
  data: Partial<ITest>
): Promise<Types.ObjectId[]> {
  const newGroupIds: Types.ObjectId[] = [];

  for (const g of data.groups ?? []) {
    if (g._id) {
      // Nếu có _id → update group
      const updatedGroup = await updateGroupWithRelations(
        g._id,
        g as any,
        data.created_by
      );
      if (updatedGroup) newGroupIds.push(updatedGroup._id);
    } else {
      // Nếu chưa có _id → tạo mới
      const newGroup = await createGroupWithNewRelations({
        ...(g as any),
        test_id: testObjectId,
        topic: data.topic,
        created_by: data.created_by,
      });
      newGroupIds.push(newGroup._id);
    }
  }

  return newGroupIds;
}

async function finalizeTestWithGroups(
  test: ITest,
  newGroupIds: Types.ObjectId[]
): Promise<ITest> {
  // Gán lại groups
  test.groups = newGroupIds;
  await test.save();

  // Populate để trả về đầy đủ dữ liệu
  const populatedTest = await Test.findById(test._id)
    .populate({
      path: "groups",
      populate: [
        { path: "audioUrl" },
        { path: "imagesUrl" },
        { path: "questions" },
      ],
    })
    .lean();

  return populatedTest as ITest;
}

/**
 * Cập nhật Test + Group + Question + Media theo payload FE gửi
 */
export const updateTest = async (
  id: string,
  data: Partial<ITest>
): Promise<ITest | null> => {
  const testId = new Types.ObjectId(id);

  // 1. Update các field cơ bản của Test
  const test = await Test.findByIdAndUpdate(
    testId,
    {
      title: data.title,
      topic: data.topic,
      status: data.status,
      updated_at: new Date(),
    },
    { new: true }
  );

  if (!test) return null;

  // 2 + 3. Đồng bộ group (refactor ra hàm riêng)
  const newGroupIds = await syncGroups(testId, test._id, data);

  // 4. Xoá group không còn trong FE
  const existingGroups = await Group.find({ test_id: testId }).lean();

  for (let i = 0; i < existingGroups.length; i++) {
    const oldGroup = existingGroups[i];

    const stillExists = newGroupIds.find(
      (id) => id.toString() === oldGroup._id.toString()
    );

    if (!stillExists) {
      await deleteGroupWithRelations(oldGroup._id);
    }
  }

  // 5 + 6. Gán lại groups, save và populate (refactor ra hàm riêng)
  return await finalizeTestWithGroups(test, newGroupIds);
};

export const updateStatusTest = async (
  testId: string,
  status: TestStatus,
  userId: string
) => {
  const test = await Test.findByIdAndUpdate(
    testId,
    { status, updated_at: new Date() },
    { new: true }
  );
  if (!test) {
    throw new Error("Test not found");
  }

  // Chỉ gửi thông báo đến admin khi CTV/user thay đổi status (không phải admin tự thao tác)
  // Nếu muốn gửi thông báo, gọi từ controller sau khi kiểm tra role
  // pushNotificationToAdmin(userId, {
  //   message: `📝 Bài thi "${test.title}" đã được chuyển sang trạng thái "${status}".`,
  //   type: "test",
  //   url: `http://localhost:5174/admin/tests/${test._id}`,
  // });

  return test;
};

export const submitMiniTestService = async (
  userId: string,
  testId: string,
  answers: {
    question_id: string,
    selectedOption: string
  }[],
  duration: number
) => {
  // 1) Lấy danh sách câu hỏi của mini test
  const groups = await Group
    .find({ test_id: testId })
    .select("_id questions")
    .populate({
      path: "questions",
      select: "_id correctAnswer tags irt_discrimination irt_difficulty irt_guessing"
    })
    .lean();

  if (!groups || groups.length === 0) {
    throw new Error("MiniTest not found");
  }

  // Flatten danh sách câu hỏi
  const questionList: any[] = groups.flatMap(g => g.questions);

  // 2) Tính điểm (số câu đúng) + build responses
  let totalCorrect = 0;

  const responses = questionList.map((q: any) => {
    const userAns = answers.find(a => a.question_id === q._id.toString());
    const isCorrect = !!userAns && userAns.selectedOption === q.correctAnswer;

    if (isCorrect) totalCorrect++;

    // Detect part number từ tags, ví dụ: "[Part 3]"
    let partNum: number | null = null;
    for (const t of q.tags || []) {
      const match = t.match(/\[Part (\d+)\]/);
      if (match) {
        partNum = parseInt(match[1]);
        break;
      }
    }

    return {
      questionId: q._id.toString(),
      correct: isCorrect ? 1 : 0,
      a: q.irt_discrimination,
      b: q.irt_difficulty,
      c: q.irt_guessing ?? 0.25,
      part: partNum // 1..7 hoặc null
    };
  });

  // 3) Map sang format answers để lưu theo IUserTest
  const detailedAnswers = questionList.map((q: any) => {
    const userAns = answers.find(a => a.question_id === q._id.toString());
    const selected = userAns?.selectedOption ?? "";
    const isCorrect = selected !== "" && selected === q.correctAnswer;

    return {
      question_id: new Types.ObjectId(q._id),
      selectedOption: selected,
      isCorrect,
    };
  });

  // 4) Tính score mini test (có thể giữ logic giống full-test, mỗi câu đúng = 5 điểm)
  const score = Math.min(totalCorrect * 5, 990);

  // 5) Tính accuracy theo part (dựa trên responses.part)
  const partStats: Record<string, { correct: number; total: number }> = {};
  for (const r of responses) {
    if (!r.part) continue;
    const key = `Part ${r.part}`;
    if (!partStats[key]) partStats[key] = { correct: 0, total: 0 };
    partStats[key].total += 1;
    if (r.correct === 1) partStats[key].correct += 1;
  }

  const parts = Object.entries(partStats).map(([part_name, stat]) => ({
    part_name,
    accuracy: stat.total > 0 ? (stat.correct / stat.total) * 100 : 0,
  }));

  // 6) Lưu vào UserTest
  const userTest = new UserTest({
    user_id: new Types.ObjectId(userId),
    test_id: new Types.ObjectId(testId),
    score,
    answers: detailedAnswers,
    parts,
    completedPart: "mini-test", // hoặc test type tuỳ bạn
    duration,
    submit_at: new Date(),
    // có thể để mặc định theta_overall, theta_parts cho lần sau tính IRT
  });

  const saved = await userTest.save();

  // 7) Cập nhật thống kê cho Test
  await Test.findByIdAndUpdate(testId, {
    $inc: { countSubmit: 1 },
  });

  console.log("=== MINI TEST SUBMISSION ===");
  console.log(`User: ${userId}`);
  console.log(`Test: ${testId}`);
  console.log(`Total Questions: ${responses.length}`);
  console.log(`Total Correct: ${totalCorrect}`);
  console.log("Responses:", responses);

  return {
    userTestId: saved._id,
    userId,
    testId,
    totalCorrect,
    totalQuestions: responses.length,
    responses,
    score,
    detailedAnswers
  };
};