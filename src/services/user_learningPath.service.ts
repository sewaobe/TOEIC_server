import { Types } from "mongoose";
import {
  UserLearningPath,
  LearningPath,
  WeekStudy,
  DayStudy,
  Lesson,
  ILesson,
  IDayStudy,
  IWeekStudy,
  IUserLearningPath,
  FlashCardPlan,
  DictationPlan,
  QuizPlan,
  ShadowingPlan,
} from "../models"; // ✅ gom từ index

import { getDemoTestTagAccuracyService } from "./user_test.service";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { SessionType } from "../models/enums/SessionType";
import { PartType } from "../models/enums/PartType";
import { mockLessons } from "../mocks/mockLessons";

import util from "util";

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

  // 2. Chọn lesson phù hợp
  const selectedLessons = (await selectLessonsByTagAccuracy(
    tagAccuracy
  )) as ILesson[];
  console.log("Số bài học là:", selectedLessons.length);

  // 3. Phân bổ lesson theo tuần
  const distributed = distributeLessonsByWeek(
    selectedLessons,
    payload.weeklyTotals
  );
  console.log("Bài theo tuần:", JSON.stringify(distributed[0], null, 2));

  // 4. Tạo LearningPath + tất cả WeekStudy + DayStudy
  const lp = await createLearningPathWithWeeks(
    userId,
    "Lộ trình TOEIC",
    "Lộ trình được tạo từ placement test",
    payload.targetScore >= 750 ? "ADVANCED" : "INTERMEDIATE", // ví dụ
    distributed
  );

  // tính toán sơ sơ
  // const daysPerWeek = Object.values(payload.weeklyPlan).filter(
  //   (v) => v > 0
  // ).length;

  const daysPerWeek = 7;
  // const timePerDay = Math.round(
  //   Object.values(payload.weeklyPlan).reduce((a, b) => a + b, 0) / daysPerWeek
  // );

  const timePerDay = 90;
  // Tạo liên kết UserLearningPath
  const userLP = await createUserLearningPath(
    userId,
    (lp._id as Types.ObjectId).toString(),
    payload.targetScore,
    timePerDay, // ví dụ 120 phút/ngày
    daysPerWeek, // ví dụ 6 ngày/tuần
    new Date(payload.endDate)
  );

  console.log("===== USER LEARNING PATH CREATED =====");
  console.log(JSON.stringify(userLP, null, 2));

  return {
    tagAccuracy,
  };
};

export async function selectLessonsByTagAccuracy(
  tagAccuracy: Record<string, number>
): Promise<Partial<ILesson>[]> {
  const lessons: Partial<ILesson>[] = [];

  const allLessons = await Lesson.find().lean<ILesson[]>();
  for (const lesson of allLessons) {
    // Kiểm tra lesson có tag nào match với tagAccuracy
    const matchTag = lesson.tags?.find((tag) => tagAccuracy[tag] !== undefined);

    if (matchTag) {
      const acc = tagAccuracy[matchTag];

      // Rule chọn
      if (acc < 0.4) {
        // yếu → lấy
        lessons.push(lesson);
      } else if (acc >= 0.4 && acc <= 0.6) {
        // trung bình → vẫn lấy
        lessons.push(lesson);
      } else if (acc > 0.6 && acc <= 0.8) {
        // khá → có thể lấy ít (tuỳ logic, ở đây mình lấy nhưng gắn flag "lowPriority")
        lessons.push({ ...lesson, lowPriority: true } as any);
      } else {
        // mạnh > 0.8 → bỏ qua
      }
    }
  }

  // Sắp xếp theo weight tăng dần
  lessons.sort((a, b) => (a.weight || 0) - (b.weight || 0));

  return lessons;
}
function distributeLessonsByWeek(
  lessons: ILesson[],
  weeklyTotals: number[]
): { wed: ILesson[]; thu: ILesson[] }[] {
  const totalWeeks = weeklyTotals.length;
  const weeks: { wed: ILesson[]; thu: ILesson[] }[] = [];
  let cursor = 0;

  // Tính số bài cơ bản + dư
  const basePerWeek = Math.floor(lessons.length / totalWeeks);
  let remainder = lessons.length % totalWeeks;

  for (let w = 0; w < totalWeeks; w++) {
    // số bài tuần này
    let numThisWeek = basePerWeek + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;

    const weekLessons = { wed: [] as ILesson[], thu: [] as ILesson[] };

    if (numThisWeek > 0) {
      // Nếu số bài lẻ → Thứ 4 nhiều hơn 1
      const wedCount = Math.ceil(numThisWeek / 2);
      const thuCount = numThisWeek - wedCount;

      // Gán cho Thứ 4
      for (let i = 0; i < wedCount && cursor < lessons.length; i++) {
        weekLessons.wed.push(lessons[cursor++]);
      }

      // Gán cho Thứ 5
      for (let i = 0; i < thuCount && cursor < lessons.length; i++) {
        weekLessons.thu.push(lessons[cursor++]);
      }
    }

    weeks.push(weekLessons);
  }

  return weeks;
}
export async function createUserLearningPath(
  userId: string,
  learningPathId: string,
  targetScore: number,
  timePerDay: number,
  daysPerWeek: number,
  targetCompletionDate: Date
): Promise<IUserLearningPath> {
  const userObjectId = new Types.ObjectId(userId);
  const learningPathObjectId = new Types.ObjectId(learningPathId);

  const userLearningPath = new UserLearningPath({
    user_id: userObjectId,
    learningPath_id: learningPathObjectId,
    target_score: targetScore,
    time_per_day: timePerDay,
    days_per_week: daysPerWeek,
    target_completion_date: targetCompletionDate,
    current_week: 1,
  });

  await userLearningPath.save();

  return userLearningPath;
}

export async function createLearningPathWithWeeks(
  userId: string,
  title: string,
  description: string,
  level: string,
  distributed: { wed: ILesson[]; thu: ILesson[] }[]
) {
  const userObjectId = new Types.ObjectId(userId);

  // 1. Tạo LearningPath trước
  const learningPath = new LearningPath({
    title,
    description,
    level,
    isActive: true,
    week_studies_id: [],
    created_by: userObjectId,
    created_at: new Date(),
  });
  await learningPath.save();

  // 2. Query tất cả Plans (⚡ bỏ filter user_id, lấy tất cả)
  const [flashcards, dictations, quizzes, shadowings] = await Promise.all([
    FlashCardPlan.find().lean(),
    DictationPlan.find().lean(),
    QuizPlan.find().lean(),
    ShadowingPlan.find().lean(),
  ]);

  // 3. Tạo tuần học
  const weekIds: Types.ObjectId[] = [];

  for (let i = 0; i < distributed.length; i++) {
    const weekNo = i + 1;
    const weekLessons = distributed[i];

    const week = new WeekStudy({
      name: weekNo,
      description: `Tuần ${weekNo}`,
      status: weekNo === 1 ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK,
      accuracy_overall: 0,
      days: [],
    });
    await week.save();

    // 4. Sinh 7 ngày học, truyền list xuống
    const dayStudiesData = generateWeeklyDayStudies(
      week._id,
      weekLessons,
      weekNo,
      { flashcards, dictations, quizzes, shadowings }
    );
    console.log("===CHECK part_type in dayStudiesData===");
    dayStudiesData.forEach((d) =>
      d.sessions.forEach((s) =>
        console.log("typeof:", typeof s.part_type, "value:", s.part_type)
      )
    );
    const dayStudies = await DayStudy.insertMany(dayStudiesData);

    week.days = dayStudies.map((d) => d._id as Types.ObjectId);
    await week.save();

    weekIds.push(week._id as Types.ObjectId);
  }

  // 5. Gắn các tuần vào LearningPath
  learningPath.week_studies_id = weekIds;
  await learningPath.save();

  return learningPath;
}

/// tạo lịch học theo thứ
/**
 * Tạo lịch học cứng 7 ngày:
 * - Thứ 2/3: Flashcard + luyện nghe part 1–4
 * - Thứ 4: Bài học grammar cho part 5 → ngữ pháp + flashcard + làm câu hỏi
 * - Thứ 5: Bài học grammar cho part 6 → ngữ pháp + flashcard + làm câu hỏi
 * - Thứ 6: part 7 → flashcard + làm câu hỏi
 * - Thứ 7: ôn từ vựng + quiz
 * - Chủ nhật: mini test
 */
export function generateWeeklyDayStudies(
  weekId: Types.ObjectId,
  grammarLessons: { wed: ILesson[]; thu: ILesson[] },
  weekIndex: number,
  lists: {
    flashcards: any[];
    dictations: any[];
    quizzes: any[];
    shadowings: any[];
  }
): Omit<IDayStudy, "_id">[] {
  const result: Omit<IDayStudy, "_id">[] = [];

  // helper lấy plan theo part
  const pickPlanId = (arr: any[], part: PartType) => {
    const found = arr.find((p) => String(p.part_type) === String(part));
    return found?._id as Types.ObjectId | undefined;
  };

  // helper tạo session
  const makeSession = (
    no: number,
    part: PartType | null,
    items: { kind: SessionType; activityId?: Types.ObjectId }[]
  ) => ({
    session_no: no,
    status: WeekStudyStatus.LOCK,
    part_type: part,
    items: items.map((it) => {
      let activityId = it.activityId;

      if (!activityId && part) {
        console.log("DEBUG typeof part =", typeof part, "value=", part);

        switch (it.kind) {
          case SessionType.FLASH_CARD:
            activityId = pickPlanId(lists.flashcards, part);
            break;
          case SessionType.DICTATION:
            activityId = pickPlanId(lists.dictations, part);
            break;
          case SessionType.QUIZ:
            activityId = pickPlanId(lists.quizzes, part);
            break;
          case SessionType.SHADOWING:
            activityId = pickPlanId(lists.shadowings, part);
            break;
        }
      }

      return { kind: it.kind, activity_id: activityId };
    }),
  });

  // ===== Thứ 2: Part 1–2 → từ vựng + luyện nghe
  result.push({
    week_id: weekId,
    dayOfWeek: 1,
    status:
      weekIndex === 1 ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      makeSession(1, PartType.PART_1, [
        { kind: SessionType.FLASH_CARD },
        { kind: SessionType.LISTENING },
      ]),
      makeSession(2, PartType.PART_2, [
        { kind: SessionType.FLASH_CARD },
        { kind: SessionType.LISTENING },
      ]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Thứ 3: Part 3–4 → từ vựng + luyện nghe
  result.push({
    week_id: weekId,
    dayOfWeek: 2,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      makeSession(1, PartType.PART_3, [
        { kind: SessionType.FLASH_CARD },
        { kind: SessionType.LISTENING },
      ]),
      makeSession(2, PartType.PART_4, [
        { kind: SessionType.FLASH_CARD },
        { kind: SessionType.LISTENING },
      ]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Thứ 4: Part 5 → ngữ pháp + từ vựng + làm câu hỏi
  result.push({
    week_id: weekId,
    dayOfWeek: 3,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      makeSession(
        1,
        PartType.PART_5,
        grammarLessons.wed.map((lesson) => ({
          kind: SessionType.LESSON,
          activityId: lesson._id as Types.ObjectId,
        }))
      ),
      makeSession(2, PartType.PART_5, [{ kind: SessionType.FLASH_CARD }]),
      makeSession(3, PartType.PART_5, [{ kind: SessionType.PRACTICE }]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Thứ 5: Part 6 → ngữ pháp + từ vựng + làm câu hỏi
  result.push({
    week_id: weekId,
    dayOfWeek: 4,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      makeSession(
        1,
        PartType.PART_6,
        grammarLessons.thu.map((lesson) => ({
          kind: SessionType.LESSON,
          activityId: lesson._id as Types.ObjectId,
        }))
      ),
      makeSession(2, PartType.PART_6, [{ kind: SessionType.FLASH_CARD }]),
      makeSession(3, PartType.PART_6, [{ kind: SessionType.PRACTICE }]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Thứ 6: Part 7 → từ vựng + làm câu hỏi
  result.push({
    week_id: weekId,
    dayOfWeek: 5,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      makeSession(1, PartType.PART_7, [{ kind: SessionType.FLASH_CARD }]),
      makeSession(2, PartType.PART_7, [{ kind: SessionType.PRACTICE }]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Thứ 7: Ôn tập từ vựng + quiz test
  result.push({
    week_id: weekId,
    dayOfWeek: 6,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      makeSession(1, null, [{ kind: SessionType.FLASH_CARD }]),
      makeSession(2, null, [{ kind: SessionType.QUIZ }]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Chủ nhật: Mini test
  result.push({
    week_id: weekId,
    dayOfWeek: 0,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [makeSession(1, null, [{ kind: SessionType.MINI_TEST }])],
    created_at: new Date(),
  } as any);

  return result;
}
