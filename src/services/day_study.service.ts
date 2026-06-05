// src/services/day_study.service.ts
import { Types } from "mongoose";
import {
  DayStudy,
  IDayStudy,
  LearningPath,
  LearningPathStrategyOption,
  LessonManager,
  WeekStudy,
} from "../models";
import type { IRouteUnitSnapshot } from "../models/learning_path_strategy_option.model";
import type { ILessonManager, RecommendedActivity } from "../models/lesson_manager.model";
import type { IWeekStudy } from "../models/week_study.model";
import { SessionType } from "../models/enums/SessionType";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";

type CreateDayStudiesForWeekStudyCycleInput = {
  user_id: string;
  learning_path_id: string;
  week_study_id: string;
};

type CreateDayStudiesForWeekStudyCycleResult = {
  week_study: IWeekStudy;
  day_studies: IDayStudy[];
};

type PlannedActivityTask = {
  route_unit_index: number;
  lesson_manager_id: Types.ObjectId;
  lesson_manager_title: string;
  part_type: number;
  scheduler_reason?: string;
  kind: SessionType;
  activity_id?: Types.ObjectId;
  estimated_minutes: number;
  is_required: boolean;
  order: number;
};

type DayBucket = {
  items: PlannedActivityTask[];
  plannedMinutes: number;
};

export const mapActivityTypeToSessionType = (
  activityType: RecommendedActivity["activity_type"]
): SessionType => {
  switch (activityType) {
    case "lesson":
      return SessionType.LESSON;
    case "vocabulary":
      return SessionType.FLASH_CARD;
    case "dictation":
      return SessionType.DICTATION;
    case "shadowing":
      return SessionType.SHADOWING;
    case "quiz":
      return SessionType.QUIZ;
    default:
      throw new Error(`Không hỗ trợ activity_type: ${activityType}`);
  }
};

export const buildPlannedActivityTasks = (input: {
  route_units: IRouteUnitSnapshot[];
  route_unit_start_index: number;
  lesson_manager_by_id: Map<string, ILessonManager>;
}): PlannedActivityTask[] => {
  const tasks: PlannedActivityTask[] = [];

  input.route_units.forEach((routeUnit, offset) => {
    const lessonManagerId = routeUnit.lesson_manager_id.toString();
    const lessonManager = input.lesson_manager_by_id.get(lessonManagerId);

    if (!lessonManager) {
      throw new Error(`Không tìm thấy LessonManager trong route unit: ${lessonManagerId}`);
    }

    const absoluteRouteUnitIndex = input.route_unit_start_index + offset;
    const activities = [...(lessonManager.recommended_activity_order ?? [])].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0)
    );

    if (activities.length === 0) {
      /*
       * Fallback này để route không bị mất khỏi DayStudy nếu LessonManager
       * chưa có recommended_activity_order.
       */
      tasks.push({
        route_unit_index: absoluteRouteUnitIndex,
        lesson_manager_id: routeUnit.lesson_manager_id,
        lesson_manager_title: routeUnit.title,
        part_type: routeUnit.part_type,
        scheduler_reason: routeUnit.reason ?? "",
        kind: SessionType.LESSON,
        estimated_minutes:
          routeUnit.planned_minutes || lessonManager.planned_completion_time || 0,
        is_required: true,
        order: 0,
      });
      return;
    }

    activities.forEach((activity, activityIndex) => {
      tasks.push({
        route_unit_index: absoluteRouteUnitIndex,
        lesson_manager_id: routeUnit.lesson_manager_id,
        lesson_manager_title: routeUnit.title,
        part_type: routeUnit.part_type,
        scheduler_reason: routeUnit.reason ?? "",
        kind: mapActivityTypeToSessionType(activity.activity_type),
        activity_id: activity.activity_id,
        estimated_minutes: activity.estimated_minutes,
        is_required: activity.is_required ?? true,
        order: activity.order ?? activityIndex,
      });
    });
  });

  return tasks;
};

export const packActivityTasksIntoDayBuckets = (
  tasks: PlannedActivityTask[],
  dailyBudgetMinutes: number
): DayBucket[] => {
  const buckets: DayBucket[] = [];
  let currentBucket: DayBucket = { items: [], plannedMinutes: 0 };

  const closeCurrentBucket = (): void => {
    if (currentBucket.items.length > 0) buckets.push(currentBucket);
    currentBucket = { items: [], plannedMinutes: 0 };
  };

  for (const task of tasks) {
    /*
     * Không cắt giữa activity vì activity là đơn vị tracking completion nhỏ nhất.
     * Nếu activity đầu ngày lớn hơn budget thì vẫn cho overflow trong một DayStudy.
     */
    if (currentBucket.items.length === 0) {
      currentBucket.items.push(task);
      currentBucket.plannedMinutes += task.estimated_minutes;
      continue;
    }

    if (currentBucket.plannedMinutes + task.estimated_minutes <= dailyBudgetMinutes) {
      currentBucket.items.push(task);
      currentBucket.plannedMinutes += task.estimated_minutes;
      continue;
    }

    closeCurrentBucket();
    currentBucket.items.push(task);
    currentBucket.plannedMinutes += task.estimated_minutes;
  }

  closeCurrentBucket();
  return buckets;
};

const buildLearningDayPayload = (input: {
  week_id: Types.ObjectId;
  stage_no: number;
  bucket: DayBucket;
}) => {
  const dayStatus =
    input.stage_no === 1 ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK;
  const groupedTasks = new Map<string, PlannedActivityTask[]>();
  const groupOrder: string[] = [];

  for (const task of input.bucket.items) {
    const key = task.lesson_manager_id.toString();
    if (!groupedTasks.has(key)) {
      groupedTasks.set(key, []);
      groupOrder.push(key);
    }
    groupedTasks.get(key)!.push(task);
  }

  /*
   * dayOfWeek hiện được dùng như số thứ tự Ngày trong cycle, không phải thứ trong tuần.
   * LessonManager có thể trải qua nhiều DayStudy nếu các activity của nó nằm ở nhiều ngày khác nhau.
   */
  const isFirstDay = input.stage_no === 1;

  return {
    week_id: input.week_id,
    dayOfWeek: input.stage_no,
    status: isFirstDay ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK,
    accuracy_overall: 0,
    sessions: groupOrder.map((lessonManagerId, index) => {
      const tasks = groupedTasks.get(lessonManagerId)!;
      const firstTask = tasks[0];

      const isFirstSession = isFirstDay && index === 0;
      const sessionStatus = isFirstSession
        ? WeekStudyStatus.IN_PROGRESS
        : WeekStudyStatus.LOCK;

      return {
        session_no: index + 1,
        accuracy: 0,
        status: sessionStatus,
        part_type: firstTask.part_type,
        lesson_manager_id: firstTask.lesson_manager_id,
        lesson_manager_title: firstTask.lesson_manager_title,
        planned_minutes: tasks.reduce(
          (sum, task) => sum + task.estimated_minutes,
          0
        ),
        actual_minutes: 0,
        scheduler_reason: firstTask.scheduler_reason ?? "",
        items: tasks.map((task, itemIndex) => {
          const isFirstItem = isFirstSession && itemIndex === 0;

          return {
            kind: task.kind,
            activity_id: task.activity_id,
            status: isFirstItem
              ? WeekStudyStatus.IN_PROGRESS
              : WeekStudyStatus.LOCK,
            source_lesson_manager_id: task.lesson_manager_id,
            estimated_minutes: task.estimated_minutes,
            is_required: task.is_required,
            order: itemIndex + 1,
          };
        }),
      };
    }),
  };
};

const getAssessmentSessionType = (
  assessmentType: IWeekStudy["assessment_type"]
): SessionType => {
  if (assessmentType === "mini_test") return SessionType.MINI_TEST;
  if (assessmentType === "full_test") return SessionType.FULL_TEST;
  throw new Error("WeekStudy chưa có assessment cuối cycle để tạo DayStudy.");
};

const buildAssessmentDayPayload = (input: {
  week_id: Types.ObjectId;
  stage_no: number;
  assessment_type: IWeekStudy["assessment_type"];
  assessment_estimated_minutes: number;
  has_learning_days: boolean;
}) => {
  const kind = getAssessmentSessionType(input.assessment_type);
  const status = input.has_learning_days
    ? WeekStudyStatus.LOCK
    : WeekStudyStatus.IN_PROGRESS;

  /*
   * Assessment cuối cycle là DayStudy riêng, chưa generate đề thật.
   */
  return {
    week_id: input.week_id,
    dayOfWeek: input.stage_no,
    status,
    accuracy_overall: 0,
    sessions: [
      {
        session_no: 1,
        accuracy: 0,
        status,
        planned_minutes: input.assessment_estimated_minutes,
        actual_minutes: 0,
        scheduler_reason:
          input.assessment_type === "mini_test"
            ? "Mini test cuối cycle để kiểm tra focus skills."
            : "Full test cuối cycle để đánh giá tổng thể.",
        items: [
          {
            kind,
            status,
            estimated_minutes: input.assessment_estimated_minutes,
            is_required: true,
            order: 1,
          },
        ],
      },
    ],
  };
};

/**
 * Lấy chi tiết DayStudy + populate lessons
 */
export const getDayStudyByIdService = async (dayId: string) => {
  const day = await DayStudy.findById(dayId).select("accuracy_overall sessions -_id");

  if (!day) throw new Error("Không tìm thấy ngày học");

  return day;
};

export const createDayStudiesForWeekStudyCycle = async (
  input: CreateDayStudiesForWeekStudyCycleInput
): Promise<CreateDayStudiesForWeekStudyCycleResult> => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath để tạo DayStudy.");
  }
  if (!learningPath.time_per_day || learningPath.time_per_day <= 0) {
    throw new Error("LearningPath chưa có time_per_day để chia DayStudy.");
  }

  const weekStudy = await WeekStudy.findOne({
    _id: input.week_study_id,
  });

  if (!weekStudy) {
    throw new Error("Không tìm thấy WeekStudy để tạo DayStudy.");
  }
  if (weekStudy.days && weekStudy.days.length > 0) {
    throw new Error("WeekStudy đã có DayStudy, không tạo lại.");
  }
  if (!weekStudy.learning_path_strategy_option_id) {
    throw new Error("WeekStudy chưa có strategy option để tạo DayStudy.");
  }
  if (
    typeof weekStudy.route_unit_start_index !== "number" ||
    typeof weekStudy.route_unit_end_index !== "number"
  ) {
    throw new Error("WeekStudy chưa có route unit range để tạo DayStudy.");
  }
  if (
    !weekStudy.assessment_type ||
    !weekStudy.assessment_estimated_minutes ||
    weekStudy.assessment_estimated_minutes <= 0
  ) {
    throw new Error("WeekStudy chưa có assessment cuối cycle để tạo DayStudy.");
  }

  const strategyOption = await LearningPathStrategyOption.findOne({
    _id: weekStudy.learning_path_strategy_option_id,
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });

  if (!strategyOption) {
    throw new Error("Không tìm thấy strategy option của WeekStudy.");
  }

  const startIndex = weekStudy.route_unit_start_index;
  const endIndex = weekStudy.route_unit_end_index;
  const routeUnits = strategyOption.route_units ?? [];

  if (
    startIndex < 0 ||
    endIndex < 0 ||
    startIndex > endIndex ||
    startIndex >= routeUnits.length ||
    endIndex >= routeUnits.length
  ) {
    throw new Error("Route unit range của WeekStudy không hợp lệ.");
  }

  const cycleRouteUnits = routeUnits.slice(startIndex, endIndex + 1);
  const lessonManagerIds = cycleRouteUnits.map((unit) => unit.lesson_manager_id);
  const lessonManagers = await LessonManager.find({
    _id: { $in: lessonManagerIds },
  });
  const lessonManagerById = new Map(
    (lessonManagers as ILessonManager[]).map((lessonManager) => [
      String(lessonManager._id),
      lessonManager,
    ])
  );

  const tasks = buildPlannedActivityTasks({
    route_units: cycleRouteUnits,
    route_unit_start_index: startIndex,
    lesson_manager_by_id: lessonManagerById,
  });
  const dayBuckets = packActivityTasksIntoDayBuckets(
    tasks,
    learningPath.time_per_day
  );

  const learningDayPayloads = dayBuckets.map((bucket, index) =>
    buildLearningDayPayload({
      week_id: weekStudy._id,
      stage_no: index + 1,
      bucket,
    })
  );
  const assessmentPayload = buildAssessmentDayPayload({
    week_id: weekStudy._id,
    stage_no: learningDayPayloads.length + 1,
    assessment_type: weekStudy.assessment_type,
    assessment_estimated_minutes: weekStudy.assessment_estimated_minutes,
    has_learning_days: learningDayPayloads.length > 0,
  });

  /*
   * DayStudy service không gọi Layer 4 và không đổi route cursor. Layer 4 đã cắt cycle;
   * service này chỉ persist lịch học theo stage và assessment metadata.
   */
  const createdDayStudies = await DayStudy.create([
    ...learningDayPayloads,
    assessmentPayload,
  ]);
  const dayStudies = Array.isArray(createdDayStudies)
    ? createdDayStudies
    : [createdDayStudies];

  weekStudy.days = dayStudies.map((day) => day._id as Types.ObjectId);
  await weekStudy.save();

  return {
    week_study: weekStudy,
    day_studies: dayStudies,
  };
};

export async function completeActivityAndUnlockNext(
  dayStudyId: string | Types.ObjectId,
  completedActivityId: string | Types.ObjectId
): Promise<IDayStudy | null> {
  const currentDay = await DayStudy.findById(dayStudyId);

  if (!currentDay) {
    console.error(`[Error] Không tìm thấy DayStudy với ID: ${dayStudyId}`);
    return null;
  }

  let currentSessionIndex = -1;
  let currentItemIndex = -1;

  for (let i = 0; i < currentDay.sessions.length; i++) {
    const itemIdx = currentDay.sessions[i].items.findIndex(
      item => item.activity_id?.toString() === completedActivityId.toString()
    );
    if (itemIdx !== -1) {
      currentSessionIndex = i;
      currentItemIndex = itemIdx;
      break;
    }
  }

  if (currentSessionIndex === -1) {
    console.error(`[Error] Không tìm thấy activity_id ${completedActivityId} trong DayStudy.`);
    return null;
  }

  const currentSession = currentDay.sessions[currentSessionIndex];
  currentSession.items[currentItemIndex].status = WeekStudyStatus.COMPLETED;

  const nextItemIndex = currentItemIndex + 1;
  if (nextItemIndex < currentSession.items.length) {
    currentSession.items[nextItemIndex].status = WeekStudyStatus.IN_PROGRESS;
  } else {
    currentSession.status = WeekStudyStatus.COMPLETED;

    const nextSessionIndex = currentSessionIndex + 1;
    if (nextSessionIndex < currentDay.sessions.length) {
      const nextSession = currentDay.sessions[nextSessionIndex];
      nextSession.status = WeekStudyStatus.IN_PROGRESS;
      if (nextSession.items.length > 0) {
        nextSession.items[0].status = WeekStudyStatus.IN_PROGRESS;
      }
    } else {
      // Đánh dấu ngày hiện tại là hoàn thành
      currentDay.status = WeekStudyStatus.COMPLETED;

      // Tìm và mở khóa DayStudy của ngày tiếp theo
      const nextDayStudy = await DayStudy.findOne({
        week_id: currentDay.week_id, // Cùng week_id
        dayOfWeek: { $gt: currentDay.dayOfWeek } // dayOfWeek lớn hơn ngày hiện tại
      }).sort({ dayOfWeek: 1 }); // Sắp xếp để lấy ngày gần nhất

      if (nextDayStudy) {
        nextDayStudy.status = WeekStudyStatus.IN_PROGRESS;

        // Mở khóa luôn session và item đầu tiên của ngày mới để người dùng có thể bắt đầu ngay
        if (nextDayStudy.sessions.length > 0) {
          nextDayStudy.sessions[0].status = WeekStudyStatus.IN_PROGRESS;
          if (nextDayStudy.sessions[0].items.length > 0) {
            nextDayStudy.sessions[0].items[0].status = WeekStudyStatus.IN_PROGRESS;
          }
        }

        // Lưu lại thay đổi của ngày tiếp theo
        await nextDayStudy.save();
        console.log(`Đã mở khóa ngày học tiếp theo (DayOfWeek: ${nextDayStudy.dayOfWeek})!`);
      } else {
        // Nếu không còn ngày nào, có thể bạn muốn cập nhật trạng thái của cả tuần học
        console.log("Bạn đã hoàn thành tất cả các ngày trong tuần!");
        // Ví dụ: await WeekStudy.findByIdAndUpdate(currentDay.week_id, { status: 'completed' });
      }
    }
  }
  // Lưu lại thay đổi của ngày hiện tại
  return await currentDay.save();
}
