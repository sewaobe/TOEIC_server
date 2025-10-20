import {
  User,
  UserActivity,
  UserTest,
  GroupUser,
  UserLearningPath,
  LearningPath,
  UserProgress,
} from "../models";

/**
 * 🧩 Lấy danh sách học viên (Student[])
 */

export const getStudentsService = async (
  page: number,
  limit: number,
  search: string,
  status: string,
  targetScore: number
) => {
  const skip = (page - 1) * limit;
  const pipeline: any[] = [];

  // 1️⃣ Join với User collection thật
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "user_id",
      foreignField: "_id",
      as: "user",
    },
  });

  // Flatten user
  pipeline.push({ $unwind: "$user" });

  // 2️⃣ Join thêm learningPath và mentor nếu cần
  pipeline.push({
    $lookup: {
      from: "learningpaths",
      localField: "learningPath_id",
      foreignField: "_id",
      as: "learningPath",
    },
  });
  pipeline.push({ $unwind: { path: "$learningPath", preserveNullAndEmptyArrays: true } });

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "mentor_id",
      foreignField: "_id",
      as: "mentor",
    },
  });
  pipeline.push({ $unwind: { path: "$mentor", preserveNullAndEmptyArrays: true } });

  // 3️⃣ Bộ lọc tìm kiếm (tên hoặc email)
  const match: any = {};
  if (search) {
    match.$or = [
      { "user.profile.fullname": { $regex: search, $options: "i" } },
      { "user.email": { $regex: search, $options: "i" } },
    ];
  }

  // 🎯 Lọc theo targetScore
  if (targetScore > 0) {
    match.target_score = { $gte: targetScore };
  }

  pipeline.push({ $match: match });

  // 4️⃣ Lọc theo trạng thái (trước hoặc sau match đều được)
  if (status && status !== "all") {
    pipeline.push({
      $match: {
        $expr: {
          $switch: {
            branches: [
              { case: { $eq: [status, "completed"] }, then: { $gte: ["$completion_rate", 100] } },
              {
                case: { $eq: [status, "active"] },
                then: { $and: [{ $gt: ["$completion_rate", 0] }, { $lt: ["$completion_rate", 100] }] },
              },
              { case: { $eq: [status, "inactive"] }, then: { $eq: ["$completion_rate", 0] } },
            ],
            default: true,
          },
        },
      },
    });
  }

  // 5️⃣ Tổng số kết quả
  const totalCountPipeline = [...pipeline, { $count: "total" }];
  const totalResult = await UserProgress.aggregate(totalCountPipeline);
  const total = totalResult[0]?.total || 0;

  // 6️⃣ Phân trang
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // 7️⃣ Thực thi
  const stats = await UserProgress.aggregate(pipeline);

  // 8️⃣ Format kết quả
  const items = stats.map((s: any) => {
    const completionRate = s.completion_rate || 0;
    const totalLessons = s.total_lessons || 100;
    const completedLessons = Math.round((completionRate / 100) * totalLessons);
    const computedStatus =
      completionRate >= 100
        ? "completed"
        : completionRate > 0
        ? "active"
        : "inactive";

    return {
      id: String(s.user?._id),
      name: s.user?.profile?.fullname || "Chưa có tên",
      email: s.user?.email || "—",
      avatar: s.user?.profile?.avatar || "",
      status: computedStatus,
      enrollDate: s.user?.created_at?.toISOString() || "",
      lastActive: s.user?.updated_at?.toISOString() || "",
      currentLevel: s.learningPath?.level || "A2",
      targetScore: s.target_score || 600,
      currentScore: s.current_score || 0,
      learningPath: (s.learningPath?.level || "standard").toLowerCase(),
      completedLessons,
      totalLessons,
      studyStreak: s.streak_days || 0,
      totalStudyTime: s.total_study_time || 0,
      assignedMentor: s.mentor?.profile?.fullname || "Chưa phân công",
      tags:
        completionRate >= 80
          ? ["xuất sắc"]
          : completionRate >= 50
          ? ["tiến bộ tốt"]
          : ["cần hỗ trợ"],
    };
  });

  return {
    items,
    total,
    pageCount: Math.ceil(total / limit),
  };
};

/**
 * 🧠 Lấy chi tiết học viên (StudentDetail)
 */
export const getStudentDetailService = async (id: string) => {
  const user = await User.findById(id).lean();
  const stat = await UserProgress.findOne({ user_id: id })
    .populate("learningPath_id")
    .populate("mentor_id")
    .lean();

  if (!user || !stat) return null;

  const lp = stat.learningPath_id as any;

  // 🔹 Cấu hình lộ trình từ UserLearningPath
  const userLP = await UserLearningPath.findOne({ user_id: id })
    .populate("learningPath_id")
    .lean();

  const learningPathConfig = userLP
    ? {
        lessonsPerWeek: userLP.days_per_week || 3,
        hoursPerDay: userLP.time_per_day || 1,
        focusAreas:
          lp?.title?.toLowerCase().includes("vocab") ||
          lp?.title?.toLowerCase().includes("grammar")
            ? ["Vocabulary", "Grammar"]
            : ["Listening", "Reading"],
        startDate:
          userLP.target_completion_date instanceof Date
            ? userLP.target_completion_date.toISOString().split("T")[0]
            : user?.created_at?.toISOString().split("T")[0] || "",
        targetDate:
          userLP.target_completion_date instanceof Date
            ? userLP.target_completion_date.toISOString().split("T")[0]
            : "",
      }
    : {
        lessonsPerWeek: 3,
        hoursPerDay: 1,
        focusAreas: ["Listening", "Reading"],
        startDate: user?.created_at?.toISOString().split("T")[0] || "",
        targetDate: "",
      };

  // 🔹 Lấy tiến độ tổng hợp (không populate WeekStudy vì không cần)
  const progressDocs = await UserProgress.find({ user_id: id })
    .sort({ created_at: 1 })
    .lean();

  const progressHistory = progressDocs.map((p: any) => ({
    date:
      p.created_at instanceof Date
        ? p.created_at.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
    listening: p.listening_score || 0,
    reading: p.reading_score || 0,
    vocabulary: p.vocabulary_score || 0,
    grammar: p.grammar_score || 0,
  }));

  // 🔹 Hoạt động học tập & bài test
  // 🔹 Lấy hoạt động học tập & bài test (có populate Test để lấy tên)
  const activities = await UserActivity.find({ user_id: id })
    .sort({ timestamp: -1 })
    .limit(5)
    .lean();

  const tests = await UserTest.find({ user_id: id })
    .populate("test_id", "title type topic") // ✅ lấy tiêu đề bài test
    .sort({ submit_at: -1 })
    .limit(5)
    .lean();

  // ✅ Gộp cả 2 loại hoạt động lại
  const recentActivities = [
    ...activities.map((a: any) => ({
      id: String(a._id),
      type: a.type || "lesson_complete",
      title: a.title || "Hoạt động học tập",
      description: a.description || "Không có mô tả",
      timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : "",
      metadata: a.metadata || {},
    })),

    ...tests.map((t: any) => ({
      id: String(t._id),
      type: "test_submit",
      title: `Nộp bài kiểm tra: ${
        (t.test_id as any)?.title || "Bài thi không rõ tên"
      }`,
      description: (t.test_id as any)?.topic
        ? `Chủ đề: ${(t.test_id as any)?.topic}`
        : "",

      timestamp: t.submit_at instanceof Date ? t.submit_at.toISOString() : "",
      metadata: {
        score: t.score ?? 0,
        duration: t.duration ?? 0,
        totalQuestions: t.answers?.length ?? 0,
        testId: (t.test_id as any)?._id || null,
        testType: (t.test_id as any)?.type || "",
      },
    })),
  ].slice(0, 8);

  return {
    id: String(user._id),
    name: user?.profile?.fullname || "Chưa có tên",
    email: user?.email || "",
    avatar: user?.profile?.avatar || "",
    status:
      stat.completion_rate >= 100
        ? "completed"
        : stat.completion_rate > 0
        ? "active"
        : "inactive",
    enrollDate:
      user?.created_at instanceof Date ? user.created_at.toISOString() : "",
    lastActive:
      user?.updated_at instanceof Date ? user.updated_at.toISOString() : "",
    currentLevel: lp?.level || "A2",
    targetScore: stat.target_score || 600,
    currentScore: stat.current_score || 0,
    learningPath: (lp?.level || "standard").toLowerCase(),
    completedLessons: Math.round(
      ((stat.completion_rate || 0) / 100) * (stat.total_lessons || 100)
    ),
    totalLessons: stat.total_lessons || 100,
    studyStreak: stat.streak_days || 0,
    totalStudyTime: stat.total_study_time || 0,
    assignedMentor:
      (stat.mentor_id as any)?.profile?.fullname || "Chưa phân công",
    tags:
      stat.completion_rate >= 80
        ? ["xuất sắc"]
        : stat.completion_rate >= 50
        ? ["tiến bộ tốt"]
        : ["cần hỗ trợ"],
    learningPathConfig,
    progressHistory,
    recentActivities,
    notes:
      stat.notes?.join(", ") ||
      "Học viên đang trong tiến trình học tập, cần theo dõi thêm.",
  };
};

/**
 * 📊 Báo cáo nhóm học viên (GroupReport[])
 */
export const getGroupReportsService = async () => {
  const groups = await GroupUser.find().populate("mentor_id").lean();

  return groups.map((g: any) => {
    const mentor = g.mentor_id as any;
    const total = g.students?.length || 0;
    const active = g.active_students || Math.round(total * 0.8);
    const completionRate = total ? Math.round((active / total) * 100) : 0;

    return {
      groupName: g.name || "Nhóm học viên",
      mentorName: mentor?.profile?.fullname || "Chưa phân công",
      totalStudents: total,
      activeStudents: active,
      averageProgress: g.average_progress || 0,
      averageScore: g.average_score || 0,
      completionRate,
    };
  });
};
