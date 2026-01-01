import {
  User,
  UserActivity,
  UserTest,
  GroupUser,
  LearningPath,
  UserProgress,
} from "../models";

// thresholds (days)
const AT_RISK_DAYS = 7;
const INACTIVE_DAYS = 21;

function startOfDayUTC(d?: Date | string | null) {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function daysBetweenDates(d1?: Date | string | null, d2?: Date | string | null) {
  if (!d1 || !d2) return Infinity;
  const a = startOfDayUTC(d1)!.getTime();
  const b = startOfDayUTC(d2)!.getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * 🧩 Lấy danh sách học viên (Student[])
 */

export const getStudentsService = async (
  page: number,
  limit: number,
  search: string,
  status: string,
  targetScore: number,
  mentorId: string
) => {
  const skip = (page - 1) * limit;

  // 🎯 Lấy danh sách students thuộc group của CTV hiện tại
  const groupDoc = await GroupUser.findOne({ mentor_id: mentorId }).lean();
  if (!groupDoc || !groupDoc.students || groupDoc.students.length === 0) {
    console.log(`🔍 Không tìm thấy group cho mentor ${mentorId}`);
    return {
      items: [],
      total: 0,
      pageCount: 0,
    };
  }

  const studentIds = groupDoc.students; // Array of ObjectId
  console.log(`🔍 Found ${studentIds.length} students in group:`, studentIds);

  // 🔍 Kiểm tra xem có UserProgress nào cho các students này không
  const progressCount = await UserProgress.countDocuments({
    user_id: { $in: studentIds },
  });
  console.log(
    `🔍 Found ${progressCount} UserProgress records for these students`
  );

  // 🛠️ Nếu thiếu UserProgress cho một số students, tạo records từ LearningPath
  if (progressCount < studentIds.length) {
    const existingProgressUserIds = await UserProgress.find({
      user_id: { $in: studentIds },
    }).distinct("user_id");

    const missingUserIds = studentIds.filter(
      (id) =>
        !existingProgressUserIds.some(
          (existing) => existing.toString() === id.toString()
        )
    );

    console.log(
      `🛠️ Creating UserProgress from LearningPath for ${missingUserIds.length} students:`,
      missingUserIds
    );

    // 📋 Lấy LearningPath cho các students thiếu (user-specific)
    const learningPaths = await LearningPath.find({
      user_id: { $in: missingUserIds },
    }).lean();

    // Tạo UserProgress từ thông tin LearningPath thật
    const defaultProgressRecords = await Promise.all(
      missingUserIds.map(async (userId) => {
        const learningPath = learningPaths.find(
          (lp) => lp.user_id?.toString() === userId.toString()
        );

        // Lấy thông tin từ LearningPath hoặc fallback mặc định
        const targetScore = learningPath?.target_score || 600;
        const totalLessons = (learningPath?.week_study_ids?.length || 10) * 7; // Tính từ số tuần * 7 ngày

        return {
          user_id: userId,
          learningPath_id: learningPath?._id || null,
          completion_rate: 0,
          total_lessons: totalLessons,
          target_score: targetScore,
          current_score: 0,
          streak_days: 0,
          total_study_time: 0,
          listening_score: 0,
          reading_score: 0,
          vocabulary_score: 0,
          grammar_score: 0,
          created_at: new Date(),
          updated_at: new Date(),
        };
      })
    );

    if (defaultProgressRecords.length > 0) {
      await UserProgress.insertMany(defaultProgressRecords);
      console.log(
        `✅ Created ${defaultProgressRecords.length} UserProgress records from LearningPath data`
      );
    }
  }

  const pipeline: any[] = [];

  // 1️⃣ Filter chỉ lấy students trong group của CTV hiện tại
  pipeline.push({
    $match: {
      user_id: { $in: studentIds },
    },
  });

  // 2️⃣ Group theo user_id để tránh duplicate (lấy progress record mới nhất)
  pipeline.push({
    $sort: { user_id: 1, created_at: -1 },
  });

  pipeline.push({
    $group: {
      _id: "$user_id",
      latestProgress: { $first: "$$ROOT" },
    },
  });

  pipeline.push({
    $replaceRoot: { newRoot: "$latestProgress" },
  });

  // 3️⃣ Join với User collection thật
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

  // 4️⃣ Join thêm learningPath và mentor nếu cần
  pipeline.push({
    $lookup: {
      from: "learningpaths",
      localField: "learningPath_id",
      foreignField: "_id",
      as: "learningPath",
    },
  });
  pipeline.push({
    $unwind: { path: "$learningPath", preserveNullAndEmptyArrays: true },
  });

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "mentor_id",
      foreignField: "_id",
      as: "mentor",
    },
  });
  pipeline.push({
    $unwind: { path: "$mentor", preserveNullAndEmptyArrays: true },
  });

  // 5️⃣ Bộ lọc tìm kiếm (tên hoặc email)
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

  // 6️⃣ Lọc theo trạng thái (ưu tiên dùng trường `status` trong UserProgress nếu có)
  if (status && status !== "all") {
    // If client filters by status string, match the stored `status` field.
    pipeline.push({
      $match: {
        status: status,
      },
    });
  }

  // 7️⃣ Tổng số kết quả (sau khi đã group và filter)
  const totalCountPipeline = [...pipeline, { $count: "total" }];
  const totalResult = await UserProgress.aggregate(totalCountPipeline);
  const total = totalResult[0]?.total || 0;

  // 8️⃣ Phân trang
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // 9️⃣ Thực thi
  const stats = await UserProgress.aggregate(pipeline);

  // 🔟 Format kết quả
  const items = stats.map((s: any) => {
    const completionRate = s.completion_rate || 0;
    const totalLessons = s.total_lessons || 100;
    const completedLessons = Math.round((completionRate / 100) * totalLessons);

    // derive status from last activity and completion if persisted status is not authoritative
    const lastStudy = s.last_study_date ? new Date(s.last_study_date) : null;
    const gapDays = lastStudy ? daysBetweenDates(lastStudy, new Date()) : Infinity;

    let derivedStatus: string;
    if (completionRate >= 100) {
      derivedStatus = "completed";
    } else if (!lastStudy) {
      // no record of activity
      derivedStatus = completionRate > 0 ? "active" : "inactive";
    } else if (gapDays >= INACTIVE_DAYS) {
      derivedStatus = "inactive";
    } else if (gapDays >= AT_RISK_DAYS) {
      derivedStatus = "at_risk";
    } else {
      derivedStatus = "active";
    }

    // respect explicit persisted states that should be authoritative (paused, inactive, completed)
    const persisted = s.status;
    const computedStatus = persisted && ["paused", "inactive", "completed"].includes(persisted)
      ? persisted
      : derivedStatus;
    console.log("🧑‍🎓 Student:", s);
    return {
      id: String(s.user?._id),
      name: s.user?.profile?.fullname || "Chưa có tên",
      email: s.user?.email || "—",
      avatar: s.user?.profile?.avatar || "",
      status: computedStatus,
      enrollDate: s.user?.created_at?.toISOString() || "",
      lastActive: s.last_study_date || "",
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

  // 🔹 Tìm UserProgress, nếu không có thì tạo từ LearningPath
  let stat = await UserProgress.findOne({ user_id: id })
    .populate("learningPath_id")
    .populate("mentor_id")
    .lean();

  if (!user) return null;

  // 🔹 Lấy LearningPath trực tiếp để có thông tin
  const learningPath = await LearningPath.findOne({ user_id: id }).lean();

  // 🛠️ Nếu không có UserProgress, tạo từ LearningPath
  if (!stat && learningPath) {
    const newProgress = {
      user_id: id,
      learningPath_id: learningPath._id || null,
      completion_rate: 0,
      total_lessons: (learningPath.week_study_ids?.length || 10) * 7,
      target_score: learningPath.target_score || 600,
      current_score: 0,
      streak_days: 0,
      total_study_time: 0,
      listening_score: 0,
      reading_score: 0,
      vocabulary_score: 0,
      grammar_score: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const createdStat = await UserProgress.create(newProgress);
    stat = await UserProgress.findById(createdStat._id)
      .populate("learningPath_id")
      .populate("mentor_id")
      .lean();

    console.log(
      `✅ Created UserProgress for student ${id} from LearningPath data`
    );
  }

  if (!stat) return null;

  const lp = stat.learningPath_id as any;

  // 🔹 Cấu hình lộ trình từ LearningPath
  const learningPathConfig = learningPath
    ? {
        lessonsPerWeek: learningPath.days_per_week || 3,
        hoursPerDay: learningPath.time_per_day || 1,
        focusAreas:
          lp?.title?.toLowerCase().includes("vocab") ||
          lp?.title?.toLowerCase().includes("grammar")
            ? ["Vocabulary", "Grammar"]
            : ["Listening", "Reading"],
        startDate: user?.created_at?.toISOString().split("T")[0] || "",
        targetDate:
          learningPath.target_completion_date instanceof Date
            ? learningPath.target_completion_date.toISOString().split("T")[0]
            : "",
      }
    : {
        lessonsPerWeek: 3,
        hoursPerDay: 1,
        focusAreas:
          lp?.title?.toLowerCase().includes("vocab") ||
          lp?.title?.toLowerCase().includes("grammar")
            ? ["Vocabulary", "Grammar"]
            : ["Listening", "Reading"],
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

  // compute derived status for detail view too
  const lastStudy = stat.last_study_date ? new Date(stat.last_study_date) : null;
  const gapDays = lastStudy ? daysBetweenDates(lastStudy, new Date()) : Infinity;
  let derivedStatusDetail: string;
  if ((stat.completion_rate || 0) >= 100) derivedStatusDetail = "completed";
  else if (!lastStudy) derivedStatusDetail = (stat.completion_rate || 0) > 0 ? "active" : "inactive";
  else if (gapDays >= INACTIVE_DAYS) derivedStatusDetail = "inactive";
  else if (gapDays >= AT_RISK_DAYS) derivedStatusDetail = "at_risk";
  else derivedStatusDetail = "active";

  const statusToReturn = stat.status && ["paused", "inactive", "completed"].includes(stat.status)
    ? stat.status
    : derivedStatusDetail;

  return {
    id: String(user._id),
    name: user?.profile?.fullname || "Chưa có tên",
    email: user?.email || "",
    avatar: user?.profile?.avatar || "",
    status: statusToReturn,
    enrollDate:
      user?.created_at instanceof Date ? user.created_at.toISOString() : "",
    lastActive:
      stat?.last_study_date instanceof Date
        ? stat.last_study_date.toISOString()
        : user?.updated_at instanceof Date
        ? user.updated_at.toISOString()
        : "",
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
