import { WeekStudyStatus } from "./../models/enums/WeekStudyStatus";
import { Types } from "mongoose";
import {
  UserLearningPath,
  LearningPath,
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
  WeekStudy,
  UserProgress,
  QuizAttempt,
  DictationAttempt,
  ShadowingAttempt,
  FlashCardAttempt,
} from "../models"; // ✅ gom từ index
import { generateToeicPlan } from "./gemini.service";
import { buildLearningPathFromGemini } from "./learningPath.generator";

import { getDemoTestTagAccuracyService } from "./user_test.service";
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
          path: "week_study_ids",
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

  // New flow: Always generate plan via Gemini and build the full learning path from AI output.
  // We reuse the generator logic in learningPath.generator.ts which will find-or-create
  // minimal metadata (Lesson, Quiz, Shadowing, Dictation, TopicVocabulary, Plans)
  // and then create LearningPath, WeekStudy and DayStudy documents.

  // Prepare a compact user input object to send to Gemini
  const userInput = {
    methods: payload.methods,
    targetScore: payload.targetScore,
    weeklyTotals: payload.weeklyTotals,
    weeklyPlan: payload.weeklyPlan,
    endDate: payload.endDate,
  };

  // Call Gemini to get structured plan (the gemini.service writes artifacts to toeic_outputs)
  const gen = await generateToeicPlan(userInput);
  const parsed = gen?.json ?? null;

  // Build learning path from parsed Gemini result (generator will create any missing metadata)
  const result = await buildLearningPathFromGemini(
    userId,
    userInput,
    {
      title: `Lộ trình TOEIC (AI)`,
      targetScore: payload.targetScore,
      endDate: payload.endDate,
    },
    parsed
  );

  return result;
};

export async function selectLessonsByTagAccuracy(
  tagAccuracy: Record<string, number>
): Promise<Partial<ILesson>[]> {
  const lessons: Partial<ILesson>[] = [];

  const allLessons = await Lesson.find().lean<ILesson[]>();
  for (const lesson of allLessons) {
    // Kiểm tra lesson có tag nào match với tagAccuracy
    // const matchTag = lesson.tags?.find((tag) => tagAccuracy[tag] !== undefined);
    const matchTag = "grammar"; // giả sử tất cả lesson đều có tag "grammar" để test
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

  const [flashcards, dictations, quizes, shadowings] = await Promise.all([
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

      { flashcards, dictations, quizes, shadowings }
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
  // learningPath.week_studies_id = weekIds;
  // Attach created week IDs to the learning path so FE can render weeks/days
  learningPath.week_study_ids = weekIds;
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
    quizes: any[];
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
    items: {
      kind: SessionType;
      activityId?: Types.ObjectId;
      status?: WeekStudyStatus;
    }[],
    status: WeekStudyStatus = WeekStudyStatus.LOCK
  ) => ({
    session_no: no,
    status: status,
    part_type: part,
    items: items.map((it) => {
      let activityId = it.activityId;

      if (!activityId && part) {
        switch (it.kind) {
          case SessionType.FLASH_CARD:
            activityId = pickPlanId(lists.flashcards, part);
            break;
          case SessionType.DICTATION:
            activityId = pickPlanId(lists.dictations, part);
            break;
          case SessionType.QUIZ:
            activityId = pickPlanId(lists.quizes, part);
            break;
          case SessionType.SHADOWING:
            activityId = pickPlanId(lists.shadowings, part);
            break;
        }
      }

      return {
        kind: it.kind,
        activity_id: activityId,
        status: it.status ? it.status : WeekStudyStatus.LOCK,
      };
    }),
  });

  // helper tạo sessions xen kẽ lesson + quiz, rồi thêm flashcard cuối
  const makeLessonQuizSessions = (part: PartType, lessons: ILesson[]) => {
    const sessions: any[] = [];

    lessons.forEach((lesson, idx) => {
      sessions.push(
        makeSession(idx + 1, part, [
          {
            kind: SessionType.LESSON,
            activityId: lesson._id as Types.ObjectId,
          },
          { kind: SessionType.QUIZ },
        ])
      );
    });

    // thêm flashcard cuối
    sessions.push(
      makeSession(sessions.length + 1, part, [{ kind: SessionType.FLASH_CARD }])
    );

    return sessions;
  };

  // ===== Thứ 2: Part 1–2 → từ vựng + luyện nghe
  result.push({
    week_id: weekId,
    dayOfWeek: 1,
    status:
      weekIndex === 1 ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      makeSession(1, PartType.PART_1, [
        { kind: SessionType.FLASH_CARD, status: WeekStudyStatus.IN_PROGRESS },
        { kind: SessionType.SHADOWING },
        { kind: SessionType.DICTATION },
      ]),
      ,
      makeSession(2, PartType.PART_2, [
        { kind: SessionType.FLASH_CARD },
        { kind: SessionType.SHADOWING },
        { kind: SessionType.DICTATION },
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
        { kind: SessionType.SHADOWING },
        { kind: SessionType.DICTATION },
      ]),
      makeSession(2, PartType.PART_4, [
        { kind: SessionType.FLASH_CARD },
        { kind: SessionType.SHADOWING },
        { kind: SessionType.DICTATION },
      ]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Thứ 4: Part 5 → xen kẽ lesson + quiz, thêm flashcard
  result.push({
    week_id: weekId,
    dayOfWeek: 3,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,

    sessions: makeLessonQuizSessions(PartType.PART_5, grammarLessons.wed),
    created_at: new Date(),
  } as any);

  // ===== Thứ 5: Part 6 → xen kẽ lesson + quiz, thêm flashcard
  result.push({
    week_id: weekId,
    dayOfWeek: 4,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,

    sessions: makeLessonQuizSessions(PartType.PART_6, grammarLessons.thu),
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
      makeSession(2, PartType.PART_7, [{ kind: SessionType.QUIZ }]),
    ],
    created_at: new Date(),
  } as any);

  // ===== Thứ 7: Ôn tập tổng hợp flashcard + quiz test
  result.push({
    week_id: weekId,
    dayOfWeek: 6,
    status: WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: [
      {
        session_no: 1,
        status: WeekStudyStatus.LOCK,
        part_type: null,
        items: lists.flashcards.map((fc) => ({
          kind: SessionType.FLASH_CARD,
          activity_id: fc._id as Types.ObjectId,
        })),
      },
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

/* ========== LẤY LEARNING PROGRESS ========== */
export const getLearningProgressService = async (userId: string) => {
  const userObjectId = new Types.ObjectId(userId);

  // 1. Tìm LearningPath của user
  const learningPath = await LearningPath.findOne({ 
    user_id: userObjectId,
    isActive: true 
  })
    .populate({
      path: "week_study_ids",
      populate: {
        path: "days",
        model: "DayStudy",
      },
    })
    .lean();

  if (!learningPath) {
    throw new Error("Không tìm thấy lộ trình học");
  }

  // 2. Lấy UserProgress để có thống kê tổng quan
  const userProgress = await UserProgress.findOne({
    user_id: userObjectId,
    learningPath_id: learningPath._id,
  }).lean();

  // 3. Tính toán progress cho từng tuần
  const weeks = await Promise.all(
    (learningPath.week_study_ids as any[]).map(async (week: any) => {
      // Đếm số ngày đã hoàn thành trong tuần
      const completedDays = week.days.filter(
        (day: any) => day.status === WeekStudyStatus.COMPLETED
      ).length;
      const totalDays = week.days.length;

      return {
        _id: week._id.toString(),
        week_no: week.no,
        status: week.status,
        progress: totalDays > 0 ? (completedDays / totalDays) * 100 : 0,
        accuracy: week.accuracy_overall || 0,
        started_at: week.started_at,
        ended_at: week.ended_at,
        is_current: week.no === learningPath.current_week,
        days: week.days.map((d: any) => ({
          _id: d._id.toString(),
          dayOfWeek: d.dayOfWeek,
          status: d.status,
        })),
      };
    })
  );

  return {
    overview: {
      completed_lessons: userProgress?.completed_lessons || 0,
      total_lessons: userProgress?.total_lessons || 0,
      completion_rate: userProgress?.completion_rate || 0,
      total_study_time: userProgress?.total_study_time || 0,
      streak_days: userProgress?.streak_days || 0,
      current_score: userProgress?.current_score || 0,
      target_score: learningPath.target_score || 0,
    },
    weeks: weeks,
    current_week: learningPath.current_week || 1,
  };
};

/* ========== LẤY CHI TIẾT 1 TUẦN ========== */
export const getWeekDetailService = async (weekId: string, userId: string) => {
  const userObjectId = new Types.ObjectId(userId);
  const weekObjectId = new Types.ObjectId(weekId);

  const week = await WeekStudy.findById(weekObjectId).populate("days").lean();

  if (!week) {
    throw new Error("Không tìm thấy tuần học");
  }

  // Tính toán cho từng ngày
  const days = await Promise.all(
    (week.days as any[]).map(async (day: any) => {
      // Đếm số sessions đã hoàn thành
      const completedSessions = day.sessions.filter(
        (s: any) => s.status === WeekStudyStatus.COMPLETED
      ).length;
      const totalSessions = day.sessions.length;

      // Chi tiết từng session
      const sessionsDetail = await Promise.all(
        day.sessions.map(async (session: any) => {
          // Kiểm tra từng item trong session đã hoàn thành chưa
          const itemsStatus = await Promise.all(
            session.items.map(async (item: any) => {
              let completed = false;

              // Kiểm tra completion theo từng loại
              switch (item.kind) {
                case SessionType.QUIZ:
                  completed = !!(await QuizAttempt.exists({
                    user_id: userObjectId,
                    quiz_id: item.activity_id,
                  }));
                  break;
                case SessionType.DICTATION:
                  completed = !!(await DictationAttempt.exists({
                    user_id: userObjectId,
                    dictation_id: item.activity_id,
                  }));
                  break;
                case SessionType.SHADOWING:
                  completed = !!(await ShadowingAttempt.exists({
                    user_id: userObjectId,
                    shadowing_id: item.activity_id,
                  }));
                  break;
                case SessionType.FLASH_CARD:
                  completed = !!(await FlashCardAttempt.exists({
                    user_id: userObjectId,
                    flashcard_plan_id: item.activity_id,
                  }));
                  break;
                // lesson và mini_test không cần check attempt
              }

              return {
                kind: item.kind,
                activity_id: item.activity_id,
                status: item.status,
                completed: completed,
              };
            })
          );

          return {
            session_no: session.session_no,
            status: session.status,
            part_type: session.part_type,
            items: itemsStatus,
          };
        })
      );

      return {
        dayOfWeek: day.dayOfWeek,
        status: day.status,
        accuracy: day.accuracy_overall || 0,
        progress: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
        sessions: sessionsDetail,
      };
    })
  );

  return {
    week_no: week.no,
    description: week.description,
    status: week.status,
    accuracy: week.accuracy_overall || 0,
    days: days,
  };
};

/* ========== LẤY CHI TIẾT NGÀY HỌC ========== */
export const getDayDetailService = async (
  dayId: string,
  userId: string,
  date?: string
) => {
  const userObjectId = new Types.ObjectId(userId);
  const dayObjectId = new Types.ObjectId(dayId);

  const day = await DayStudy.findById(dayObjectId).lean();

  if (!day) {
    throw new Error("Không tìm thấy ngày học");
  }

  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

  // Lấy tất cả attempts trong ngày
  const [quizAttempts, dictationAttempts, shadowingAttempts, flashcardAttempts] = await Promise.all([
    QuizAttempt.find({
      user_id: userObjectId,
      started_at: { $gte: startOfDay, $lte: endOfDay },
    }).lean(),
    DictationAttempt.find({
      user_id: userObjectId,
      created_at: { $gte: startOfDay, $lte: endOfDay },
    }).lean(),
    ShadowingAttempt.find({
      user_id: userObjectId,
      created_at: { $gte: startOfDay, $lte: endOfDay },
    }).lean(),
    FlashCardAttempt.find({
      user_id: userObjectId,
      created_at: { $gte: startOfDay, $lte: endOfDay },
    }).lean(),
  ]);

  // Build sessions từ attempts
  interface SessionData {
    start: string;
    end: string;
    activity: string;
    focus: number;
    understanding: number;
    correct: number;
    total: number;
    duration: number;
  }

  const sessions: SessionData[] = [];

  quizAttempts.forEach((attempt: any) => {
    const duration = attempt.finished_at
      ? Math.floor((new Date(attempt.finished_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)
      : 0;
    sessions.push({
      start: new Date(attempt.started_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      end: attempt.finished_at ? new Date(attempt.finished_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
      activity: 'Quiz',
      focus: 8,
      understanding: 4,
      correct: attempt.answers.filter((a: any) => a.correct).length,
      total: attempt.answers.length,
      duration: duration,
    });
  });

  dictationAttempts.forEach((attempt: any) => {
    sessions.push({
      start: new Date(attempt.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      end: '',
      activity: 'Dictation',
      focus: 7,
      understanding: 4,
      correct: Math.floor((attempt.accuracy / 100) * (attempt.answers?.length || 0)),
      total: attempt.answers?.length || 0,
      duration: Math.floor(attempt.duration / 60) || 0,
    });
  });

  shadowingAttempts.forEach((attempt: any) => {
    sessions.push({
      start: new Date(attempt.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      end: '',
      activity: 'Shadowing',
      focus: 8,
      understanding: 5,
      correct: attempt.accuracy_score || 0,
      total: 100,
      duration: 15,
    });
  });

  flashcardAttempts.forEach((attempt: any) => {
    sessions.push({
      start: new Date(attempt.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      end: '',
      activity: 'Flashcards',
      focus: 7,
      understanding: 4,
      correct: attempt.correct_count || 0,
      total: attempt.total_cards || 0,
      duration: 20,
    });
  });

  // Tính metrics
  const dayMinutesActual = sessions.reduce((sum, s) => sum + s.duration, 0);
  const dayMinutesPlanned = 90; // default
  const dailyEfficiency = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.focus, 0) / sessions.length * 10)
    : 0;

  return {
    day_of_week: day.dayOfWeek,
    status: day.status,
    accuracy: day.accuracy_overall || 0,
    sessions: sessions,
    metrics: {
      dayMinutesActual,
      dayMinutesPlanned,
      dailyEfficiency,
    },
  };
};

/* ========== LẤY THỐNG KÊ TUẦN ========== */
export const getWeekStatsService = async (weekId: string, userId: string) => {
  const userObjectId = new Types.ObjectId(userId);
  const weekObjectId = new Types.ObjectId(weekId);

  const week = await WeekStudy.findById(weekObjectId).populate("days").lean();

  if (!week) {
    throw new Error("Không tìm thấy tuần học");
  }

  // Tính thời gian học cho từng ngày trong tuần
  const weeklyActualPerDay: number[] = [];
  const weeklyPlannedPerDay: number[] = [90, 90, 90, 90, 90, 60, 60]; // default plan

  for (const day of week.days as any[]) {
    // Đếm số minutes thực tế cho ngày này
    // Tạm thời dùng sessions count * 30 minutes
    const sessionsCompleted = day.sessions.filter(
      (s: any) => s.status === WeekStudyStatus.COMPLETED
    ).length;
    weeklyActualPerDay.push(sessionsCompleted * 30);
  }

  const weekActual = weeklyActualPerDay.reduce((sum, m) => sum + m, 0);
  const weekPlanned = weeklyPlannedPerDay.reduce((sum, m) => sum + m, 0);

  return {
    week_no: week.no,
    weekActual,
    weekPlanned,
    weeklyActualPerDay,
    weeklyPlannedPerDay,
  };
};

/* ========== LẤY DỮ LIỆU TÍCH LŨY (CUMULATIVE) ========== */
export const getCumulativeStatsService = async (userId: string) => {
  const userObjectId = new Types.ObjectId(userId);

  const learningPath = await LearningPath.findOne({
    user_id: userObjectId,
    isActive: true,
  })
    .populate("week_study_ids")
    .lean();

  if (!learningPath) {
    throw new Error("Không tìm thấy lộ trình học");
  }

  const weeks = learningPath.week_study_ids as any[];
  const cumulativePlanned: number[] = [];
  const cumulativeActual: number[] = [];

  let totalPlanned = 0;
  let totalActual = 0;

  weeks.forEach((week, index) => {
    // Planned: 6.5h per week (assumption)
    totalPlanned += 6.5;
    cumulativePlanned.push(totalPlanned);

    // Actual: based on completed status
    const hoursThisWeek = week.status === WeekStudyStatus.COMPLETED ? 6 : 
                          week.status === WeekStudyStatus.IN_PROGRESS ? 3 : 0;
    totalActual += hoursThisWeek;
    cumulativeActual.push(totalActual);
  });

  return {
    cumulativePlanned,
    cumulativeActual,
  };
};
