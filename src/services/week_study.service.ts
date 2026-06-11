import type { Types } from "mongoose";
import {
  LearningPath,
  LearningPathStrategyOption,
  WeekStudy,
} from "../models";
import type { ILearningPath } from "../models/learning_path.model";
import type {
  ILearningPathStrategyOption,
  ILearningPathStrategyPartRoadmap,
} from "../models/learning_path_strategy_option.model";
import type { IDayStudy } from "../models/day_study.model";
import type { IWeekStudy } from "../models/week_study.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { buildNextCycleByBeamSearch } from "./learning_path_v2/layer4_route_optimizer.service";
import { createDayStudiesForWeekStudyCycle } from "./day_study.service";
import { generateAssessmentTestFromPlan } from "./learning_path_v2/learning_path_assessment.service";
import { logLearningPathV2DebugSafe } from "./learning_path_v2/learning_path_v2_debug_logger";
import type {
  LearningCyclePlanV2,
  LearningPathStrategyPartRoadmapV2,
  RouteCompletedPlanV2,
} from "../types/learning_path_v2";
import { StrategyCyclePreview, StrategyCyclePreviewGroup, StrategyCyclePreviewUnit } from "../types/learning_strategies.type";

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
        ReturnType<typeof generateAssessmentTestFromPlan>
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

  const estimatedDays =
    input.time_per_day && input.time_per_day > 0
      ? Math.max(1, Math.ceil(totalMinutes / input.time_per_day))
      : 7;

  void input.days_per_week;

  return new Date(input.now.getTime() + estimatedDays * 24 * 60 * 60 * 1000);
};

const toOptionalScoreBand = (
  scoreBand?: { from?: number; to?: number }
): { from: number; to: number } | undefined => {
  if (scoreBand?.from === undefined || scoreBand?.to === undefined) {
    return undefined;
  }

  return { from: scoreBand.from, to: scoreBand.to };
};

const mapPartRoadmapsForBeamSearch = (
  partRoadmaps: ILearningPathStrategyPartRoadmap[]
): LearningPathStrategyPartRoadmapV2[] =>
  partRoadmaps.map((roadmap) => ({
    part_type: roadmap.part_type,
    cursor_index: roadmap.cursor_index ?? 0,
    target_minutes: roadmap.target_minutes ?? 0,
    estimated_gain: roadmap.estimated_gain ?? 0,
    reaches_target: roadmap.reaches_target ?? false,
    units: (roadmap.units ?? []).map((unit) => ({
      lesson_manager_id: unit.lesson_manager_id.toString(),
      title: unit.title,
      part_type: roadmap.part_type,
      score_band: toOptionalScoreBand(unit.score_band),
      unit_type: unit.unit_type,
      node_role: unit.node_role,
      target_tags: unit.target_tags,
      order: unit.order,
      planned_minutes: unit.planned_minutes,
      estimated_gain: unit.estimated_gain ?? 0,
      reason: unit.reason ?? "",
    })),
  }));

const updatePartRoadmapCursorsFromPositions = (
  partRoadmaps: ILearningPathStrategyPartRoadmap[],
  selectedRoadmapPositions: LearningCyclePlanV2["selected_roadmap_positions"]
): void => {
  for (const position of selectedRoadmapPositions) {
    const roadmap = partRoadmaps.find(
      (item) => item.part_type === position.part_type
    );
    if (!roadmap) continue;

    roadmap.cursor_index = Math.min(
      (roadmap.cursor_index ?? 0) + position.selected_count,
      roadmap.units?.length ?? 0
    );
  }
};

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

  logLearningPathV2DebugSafe("cycle.create.start", {
    stage: "cycle",
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    now,
  });

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

  if (!selectedOption.part_roadmaps || selectedOption.part_roadmaps.length === 0) {
    throw new Error(
      "Strategy option đang chọn chưa có part_roadmaps để tạo cycle."
    );
  }

  const plan = buildNextCycleByBeamSearch({
    part_roadmaps: mapPartRoadmapsForBeamSearch(selectedOption.part_roadmaps),
    strategy: selectedOption.strategy,
    scenario: selectedOption.scenario,
    focus_part_types: selectedOption.focus_part_types ?? [],
    mini_tests_completed_since_last_full_test:
      learningPath.mini_tests_completed_since_last_full_test ?? 0,
  });

  if (plan.plan_type === "route_completed") {
    logLearningPathV2DebugSafe("cycle.create.done", {
      stage: "cycle",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      status: "route_completed",
      strategy_option_id: selectedOption._id,
    });

    return {
      status: "route_completed",
      plan,
      week_study: null,
      strategy_option: selectedOption,
      day_studies: [],
    };
  }

  const weekNo = getWeekStudyNo(learningPath);
  const assessmentResult = await generateAssessmentTestFromPlan({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    cycle_no: weekNo,
    assessment: plan.assessment,
    focus_skill_keys: plan.focus_skill_keys,
    focus_part_types: plan.focus_part_types,
  });

  const weekStudyPayload = {
    no: weekNo,
    description: `Cycle ${weekNo}: ${
      plan.assessment.type === "full_test"
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
    assessment_type: plan.assessment.type,
    assessment_estimated_minutes: plan.assessment.estimated_minutes,
  };

  const weekStudy = await WeekStudy.create(weekStudyPayload);

  appendWeekStudyId(learningPath, weekStudy._id);
  await learningPath.save();

  const dayStudyResult = await createDayStudiesForWeekStudyCycle({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    week_study_id: String(weekStudy._id),
    assessment_test_id: assessmentResult.test_id,
    cycle_units: plan.selected_roadmap_units,
  });

  /*
   * Beam Search tiêu thụ roadmap theo cursor riêng của từng Part.
   * Khi cycle đã được persist thành công, cursor_index mới được tăng.
   * Cách này tránh skip unit và tránh phụ thuộc vào route index tuyến tính cũ.
   */
  updatePartRoadmapCursorsFromPositions(
    selectedOption.part_roadmaps,
    plan.selected_roadmap_positions
  );
  await selectedOption.save();

  logLearningPathV2DebugSafe("cycle.create.done", {
    stage: "cycle",
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    status: "cycle_created",
    week_study_id: weekStudy._id,
    week_no: weekStudy.no,
    strategy_option_id: selectedOption._id,
    day_studies_count: dayStudyResult.day_studies.length,
    assessment_type: plan.assessment.type,
    assessment_estimated_minutes: plan.assessment.estimated_minutes,
    selected_roadmap_positions: plan.selected_roadmap_positions,
    estimated_learning_minutes: plan.estimated_learning_minutes,
    focus_part_types: plan.focus_part_types,
    focus_skill_keys_sample: plan.focus_skill_keys.slice(0, 10),
    beam_search_debug: plan.beam_search_debug,
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

const getPartLabel = (partType: number): string => {
  if (partType === 1) return "Part 1";
  if (partType === 2) return "Part 2: Hỏi – Đáp";
  if (partType === 3) return "Part 3: Conversations";
  if (partType === 4) return "Part 4: Talks";
  if (partType === 5) return "Part 5: Incomplete Sentences";
  if (partType === 6) return "Part 6: Text Completion";
  if (partType === 7) return "Part 7: Reading Comprehension";
  return `Part ${partType}`;
};

const groupPreviewUnitsByPart = (
  units: StrategyCyclePreviewUnit[]
): StrategyCyclePreviewGroup[] => {
  const groupMap = new Map<number, StrategyCyclePreviewUnit[]>();

  for (const unit of units) {
    const current = groupMap.get(unit.part_type) ?? [];
    current.push(unit);
    groupMap.set(unit.part_type, current);
  }

  return [...groupMap.entries()]
    .sort(([leftPart], [rightPart]) => leftPart - rightPart)
    .map(([partType, partUnits]) => ({
      part_type: partType,
      part_label: getPartLabel(partType),
      total_minutes: partUnits.reduce(
        (sum, unit) => sum + (unit.planned_minutes ?? 0),
        0
      ),
      unit_count: partUnits.length,
      units: partUnits,
    }));
};

export const previewNextLearningPathCycleFromStrategyOption = async (input: {
  user_id: string;
  learning_path_id: string;
  strategy_option_id: string;
}): Promise<StrategyCyclePreview> => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath đang hoạt động để preview cycle.");
  }

  const strategyOption = await LearningPathStrategyOption.findOne({
    _id: input.strategy_option_id,
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });

  if (!strategyOption) {
    throw new Error("Không tìm thấy strategy option để preview cycle.");
  }

  if (!strategyOption.part_roadmaps || strategyOption.part_roadmaps.length === 0) {
    throw new Error("Strategy option chưa có part_roadmaps để preview cycle.");
  }

  const plan = buildNextCycleByBeamSearch({
    part_roadmaps: mapPartRoadmapsForBeamSearch(strategyOption.part_roadmaps),
    strategy: strategyOption.strategy,
    scenario: strategyOption.scenario,
    focus_part_types: strategyOption.focus_part_types ?? [],
    mini_tests_completed_since_last_full_test:
      learningPath.mini_tests_completed_since_last_full_test ?? 0,
  });

  if (plan.plan_type === "route_completed") {
    return {
      status: "route_completed",
      title: "Roadmap đã hoàn tất",
      description: "Tất cả Part roadmap đã hết bài học để tạo cycle mới.",
      assessment_type: null,
      assessment_estimated_minutes: 0,
      estimated_learning_minutes: 0,
      focus_part_types: [],
      focus_skill_keys: [],
      groups: [],
      route_completed_reason: plan.reason,
    };
  }

  const units: StrategyCyclePreviewUnit[] = plan.selected_roadmap_units.map(
    (unit) => ({
      lesson_manager_id: String(unit.lesson_manager_id),
      title: unit.title,
      part_type: unit.part_type,
      unit_type: unit.unit_type,
      target_tags: unit.target_tags ?? [],
      planned_minutes: unit.planned_minutes ?? 0,
      estimated_gain: unit.estimated_gain ?? 0,
      reason: unit.reason ?? "",
    })
  );

  return {
    status: "preview_available",
    title: "Cycle dự kiến nếu chọn chiến lược này",
    description:
      "Đây là preview cycle đầu tiên nếu user chọn strategy option này. Cycle chính thức chỉ được tạo sau khi user xác nhận chọn.",
    assessment_type: plan.assessment.type,
    assessment_estimated_minutes: plan.assessment.estimated_minutes,
    estimated_learning_minutes: plan.estimated_learning_minutes,
    focus_part_types: plan.focus_part_types,
    focus_skill_keys: plan.focus_skill_keys,
    groups: groupPreviewUnitsByPart(units),
  };
};
