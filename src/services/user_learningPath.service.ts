import { Types } from "mongoose";
import { UserLearningPath } from "../models/user_learningPath.model";
import { LearningPath } from "../models/learning_path.model";
import { WeekStudy } from "../models/week_study.model";
import { DayStudy } from "../models/day_study.model";
import { getDemoTestTagAccuracyService } from "./user_test.service";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { SessionType } from "../models/enums/SessionType";
import { mockLessons } from "../mocks/mockLessons";

interface CreateLearningPathPayload {
  methods: string[];
  targetScore: number;
  endDate: string; // ISO string từ FE
  weeklyTotals: number[];
  weeklyPlan: Record<string, number>;
}

/* ========== LẤY LỘ TRÌNH HIỆN TẠI ========== */
export const getUserLearningPathService = async (userId: string) => {
  const userObjectId = new Types.ObjectId(userId);

  return await UserLearningPath.findOne({ user_id: userObjectId })
    .populate({
      path: "learningPath_id",
      populate: [
        {
          path: "week_studies_id",
          populate: { path: "days" },
        },
        {
          path: "additional_week_studies",
          populate: { path: "days" },
        },
      ],
    })
    .lean();
};

/* ========== TẠO LỘ TRÌNH HỌC MỚI ========== */
export const createLearningPathService = async (
  userId: string,
  payload: CreateLearningPathPayload
) => {
  if (!userId) throw new Error("UserId is required");
  const userObjectId = new Types.ObjectId(userId);

  // 1. Phân tích demo test → lấy điểm yếu theo tag
  const tagAccuracy = await getDemoTestTagAccuracyService(userId);

  // Tách weak / medium / strong
  const weakTags = tagAccuracy
    .filter((t) => t.accuracy < 0.6)
    .map((t) => t.tag);
  const mediumTags = tagAccuracy
    .filter((t) => t.accuracy >= 0.6 && t.accuracy <= 0.8)
    .map((t) => t.tag);

  // Lấy lesson từ mock theo tag
  const weakLessons = mockLessons.filter((l) =>
    l.tags?.some((tag) => weakTags.includes(tag))
  );
  const mediumLessons = mockLessons.filter((l) =>
    l.tags?.some((tag) => mediumTags.includes(tag))
  );
  // Lesson ưu tiên: Weak trước → Medium sau
  const prioritizedLessons = [...weakLessons, ...mediumLessons];

  // 2. Tính toán phân bổ lesson
  const totalWeeks = payload.weeklyTotals.length;
  const lessonWeeks = Math.floor(totalWeeks * (2 / 3)); // số tuần học bài
  const lessonsPerWeek = Math.ceil(prioritizedLessons.length / lessonWeeks);

  let lessonCursor = 0;
  const weekIds: Types.ObjectId[] = [];

  // 3. Tạo tuần & ngày
  for (let i = 0; i < totalWeeks; i++) {
    const week = new WeekStudy({
      name: i + 1,
      description: `Tuần ${i + 1}`,
      status: WeekStudyStatus.LOCK,
      accuracy_overall: 0,
      days: [],
    });

    const days: Types.ObjectId[] = [];

    for (let day = 0; day < 7; day++) {
      let sessions: any[] = [];

      // 🚀 Chia lesson theo tuần
      let lessonsToday: any[] = [];

      if (day === 0 && i < lessonWeeks) {
        // 👉 chỉ dồn lesson vào ngày đầu tuần
        const start = lessonCursor;
        const end = Math.min(start + lessonsPerWeek, prioritizedLessons.length);
        lessonsToday = prioritizedLessons.slice(start, end);
        lessonCursor = end;
      }

      // Nếu có bài thì thêm session học bài
      if (lessonsToday.length > 0) {
        sessions.push({
          session_no: 1,
          status: WeekStudyStatus.LOCK,
          items: lessonsToday.map((lesson) => ({
            kind: SessionType.LESSON,
            lesson_id: lesson._id, // ✅ dùng _id giả từ mockLessons
            question_id: null,
          })),
        });
        console.log("lessonsToday",lessonsToday[0]._id as Types.ObjectId)
      }

      const dayStudy = new DayStudy({
        week_id: week._id,
        dayOfWeek: day,
        status: WeekStudyStatus.LOCK,
        accuracy_overall: 0,
        sessions,
      });

      await dayStudy.save();
      days.push(dayStudy._id as Types.ObjectId);
    }

    week.days = days;
    await week.save();
    weekIds.push(week._id);
  }

  // 4. Tạo LearningPath
  const learningPath = new LearningPath({
    user_id: userObjectId,
    methods: payload.methods,
    targetScore: payload.targetScore,
    endDate: payload.endDate,
    week_studies_id: weekIds,
    additional_week_studies: [],
  });
  await learningPath.save();

  // 5. Gắn vào UserLearningPath
  const userLearningPath = new UserLearningPath({
    user_id: userObjectId,
    learningPath_id: learningPath._id,
  });
  await userLearningPath.save();

  // 6. Populate full để trả về
  const fullLearningPath = await UserLearningPath.findOne({
    user_id: userObjectId,
  })
    .sort({ createdAt: -1 }) // lấy bản mới nhất
    .populate({
      path: "learningPath_id",
      populate: [
        { path: "week_studies_id", populate: { path: "days" } },
        { path: "additional_week_studies", populate: { path: "days" } },
      ],
    })
    .lean();

  return {
    learningPath: fullLearningPath,
    tagAccuracy,
  };
};
