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
import { generateAssessmentTestFromWeekCycle } from "./learning_path_v2/learning_path_assessment.service";
import { logLearningPathV2DebugSafe } from "./learning_path_v2/learning_path_v2_debug_logger";
import type {
  LearningCyclePlanV2,
  LearningPathStrategyPartRoadmapV2,
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
    cycle_units: plan.selected_roadmap_units,
  });

  const assessmentResult = await generateAssessmentTestFromWeekCycle({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    week_study_id: String(weekStudy._id),
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



