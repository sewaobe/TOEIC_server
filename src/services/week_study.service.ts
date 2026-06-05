import type { Types } from "mongoose";
import {
  LearningPath,
  LearningPathStrategyOption,
  WeekStudy,
} from "../models";
import type { ILearningPath } from "../models/learning_path.model";
import type {
  ILearningPathStrategyOption,
  IRouteUnitSnapshot,
} from "../models/learning_path_strategy_option.model";
import type { IDayStudy } from "../models/day_study.model";
import type { IWeekStudy } from "../models/week_study.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import {
  buildNextCyclePlan,
} from "./learning_path_v2/layer4_route_optimizer.service";
import { createDayStudiesForWeekStudyCycle } from "./day_study.service";
import { generateAssessmentTestFromWeekCycle } from "./learning_path_v2/learning_path_assessment.service";
import type {
  LearningCyclePlanV2,
  PlannedRouteUnitV2,
  RouteCompletedPlanV2,
} from "../types/learning_path_v2";

type CreateNextLearningPathCycleInput = {
  user_id: string;
  learning_path_id: string;
  now?: Date;
};

type CreateNextLearningPathCycleResult =
  | {
    status: "cycle_created";
    plan: LearningCyclePlanV2;
    week_study: IWeekStudy;
    strategy_option: ILearningPathStrategyOption;
    day_studies: IDayStudy[];
    assessment_result: Awaited<
      ReturnType<typeof generateAssessmentTestFromWeekCycle>
    >;
  }
  | {
    status: "route_completed";
    plan: RouteCompletedPlanV2;
    week_study: null;
    strategy_option: ILearningPathStrategyOption;
    day_studies: [];
  };

export const calculateExpectedCompletionAt = (input: {
  now: Date;
  estimated_learning_minutes: number;
  assessment_estimated_minutes: number;
  time_per_day?: number;
  days_per_week?: number;
}): Date => {
  const totalMinutes =
    input.estimated_learning_minutes + input.assessment_estimated_minutes;

  /*
   * expected_completion_at là deadline dự kiến để Layer 3 so với submit_at.
   * MVP tính theo time_per_day, chưa xét lịch nghỉ chi tiết days_per_week.
   */
  const estimatedDays =
    input.time_per_day && input.time_per_day > 0
      ? Math.max(1, Math.ceil(totalMinutes / input.time_per_day))
      : 7;

  void input.days_per_week;

  return new Date(input.now.getTime() + estimatedDays * 24 * 60 * 60 * 1000);
};

const mapRouteUnitsForCyclePlan = (
  routeUnits: IRouteUnitSnapshot[]
): PlannedRouteUnitV2[] =>
  routeUnits.map((unit) => ({
    lesson_manager_id: unit.lesson_manager_id.toString(),
    title: unit.title,
    part_type: unit.part_type,
    score_band: unit.score_band,
    unit_type: unit.unit_type,
    node_role: unit.node_role,
    target_tags: unit.target_tags,
    order: unit.order,
    planned_minutes: unit.planned_minutes,
    estimated_gain: unit.estimated_gain ?? 0,
    reason: unit.reason ?? "",
  }));

const getWeekStudyNo = (learningPath: ILearningPath): number =>
  (learningPath.week_study_ids?.length ?? 0) + 1;

const appendWeekStudyId = (
  learningPath: ILearningPath,
  weekStudyId: Types.ObjectId
): void => {
  learningPath.week_study_ids = learningPath.week_study_ids ?? [];
  learningPath.week_study_ids.push(weekStudyId);
};

export const createNextLearningPathCycle = async (
  input: CreateNextLearningPathCycleInput
): Promise<CreateNextLearningPathCycleResult> => {
  const now = input.now ?? new Date();
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath đang hoạt động.");
  }

  const selectedOption = await LearningPathStrategyOption.findOne({
    learning_path_id: input.learning_path_id,
    user_id: input.user_id,
    status: "selected",
  }).sort({ created_at: -1 });

  if (!selectedOption) {
    throw new Error(
      "Không tìm thấy strategy option đang được chọn cho LearningPath."
    );
  }

  if (!selectedOption.route_units || selectedOption.route_units.length === 0) {
    throw new Error(
      "Strategy option đang chọn chưa có route_units để tạo cycle."
    );
  }

  /*
   * week_study.service.ts chỉ persist cycle, không quyết route.
   * Layer 4 buildNextCyclePlan chỉ trả plan thuần; service này mới tạo WeekStudy.
   * LearningPath mini/full counter không update ở đây, chỉ đọc để quyết mini_test hay full_test.
   */
  const plan = buildNextCyclePlan({
    route_units: mapRouteUnitsForCyclePlan(selectedOption.route_units),
    next_route_unit_index: selectedOption.next_route_unit_index ?? 0,
    mini_tests_completed_since_last_full_test:
      learningPath.mini_tests_completed_since_last_full_test ?? 0,
  });

  if (plan.plan_type === "route_completed") {
    return {
      status: "route_completed",
      plan,
      week_study: null,
      strategy_option: selectedOption,
      day_studies: [],
    };
  }

  const weekNo = getWeekStudyNo(learningPath);
  const weekStudyPayload = {
    no: weekNo,
    description: `Cycle ${weekNo}: ${plan.assessment.type === "full_test"
        ? "Học và làm full test"
        : "Học và làm mini test"
      }`,
    status: WeekStudyStatus.IN_PROGRESS,
    accuracy_overall: 0,
    days: [],
    expected_completion_at: calculateExpectedCompletionAt({
      now,
      estimated_learning_minutes: plan.estimated_learning_minutes,
      assessment_estimated_minutes: plan.assessment.estimated_minutes,
      time_per_day: learningPath.time_per_day,
      days_per_week: learningPath.days_per_week,
    }),
    focus_skill_keys: plan.focus_skill_keys,
    focus_part_types: plan.focus_part_types,
    learning_path_strategy_option_id: selectedOption._id,
    route_unit_start_index: plan.route_unit_start_index,
    route_unit_end_index: plan.route_unit_end_index,
    assessment_type: plan.assessment.type,
    assessment_estimated_minutes: plan.assessment.estimated_minutes,
  };

  /*
  * Full test không phải checkpoint rỗng; full test là assessment cuối cycle thứ 4.
  * Service này tạo WeekStudy cycle, cập nhật cursor, append vào LearningPath,
  * sau đó gọi DayStudy service để tạo các stage Ngày 1..N.
  * Service này vẫn chưa generate mini/full test thật
  * Nó chỉ gọi assessment service để tạo placeholder test_id và gắn vào DayStudy assessment item.
  */
  const weekStudy = await WeekStudy.create(weekStudyPayload);

  selectedOption.next_route_unit_index = plan.next_route_unit_index;
  await selectedOption.save();

  appendWeekStudyId(learningPath, weekStudy._id);
  await learningPath.save();

  /*
   * DayStudy được tạo sau khi WeekStudy cycle đã persist xong. WeekStudy service không
   * tự chia activity; nó gọi DayStudy service để biến cycle thành các stage Ngày 1..N.
   * Nếu bước tạo DayStudy lỗi, cycle đã được tạo nhưng FE chưa có lịch stage; checkpoint
   * sau có thể thêm recovery endpoint nếu cần.
   */
  const dayStudyResult = await createDayStudiesForWeekStudyCycle({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    week_study_id: String(weekStudy._id),
  });

  const assessmentResult = await generateAssessmentTestFromWeekCycle({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    week_study_id: String(weekStudy._id),
  });

  return {
    status: "cycle_created",
    plan,
    week_study: weekStudy,
    strategy_option: selectedOption,
    day_studies: dayStudyResult.day_studies,
    assessment_result: assessmentResult,
  };
};
