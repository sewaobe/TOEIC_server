import type { Types } from "mongoose";
import {
  DayStudy,
  LearningPath,
  LearningPathStrategyOption,
  LessonManager,
  UserSkill,
  WeekStudy,
} from "../models";
import type { ILearningPath } from "../models/learning_path.model";
import type {
  ILearningPathStrategyOption,
  ILearningPathStrategyPartRoadmap,
} from "../models/learning_path_strategy_option.model";
import type { ILessonManager } from "../models/lesson_manager.model";
import type { IUserSkill, IUserSkillPart } from "../models/user_skill.model";
import type { IDayStudy } from "../models/day_study.model";
import type { IWeekStudy } from "../models/week_study.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { TestStatus } from "../models/enums/TestStatus";
import { buildNextCycleByBeamSearch } from "./learning_path_v2/layer4_route_optimizer.service";
import { createDayStudiesForWeekStudyCycle } from "./day_study.service";
import { generateAssessmentTestFromPlan } from "./learning_path_v2/learning_path_assessment.service";
import { logLearningPathV2DebugSafe } from "./learning_path_v2/learning_path_v2_debug_logger";
import { normalizeToeicSkillTags } from "../utils/toeic_skill.util";
import type {
  LearningCyclePlanV2,
  LearningPathScenarioV2,
  LearningPathStrategyPartRoadmapV2,
  RouteCompletedPlanV2,
} from "../types/learning_path_v2";
import { StrategyCyclePreview, StrategyCyclePreviewGroup, StrategyCyclePreviewUnit } from "../types/learning_strategies.type";
import { Types as MongooseTypes } from "mongoose";

type CreateNextLearningPathCycleInput = {
  user_id: string;
  learning_path_id: string;
  now?: Date;
  cycle_focus_part_types?: number[];
  cycle_focus_skill_keys?: string[];
  mini_tests_completed_since_last_full_test_override?: number;
  scenario_override?: LearningPathScenarioV2;
  user_skill?: IUserSkill | null;
};

/** Giữ guard cục bộ để tránh vòng phụ thuộc giữa WeekStudy service và pipeline orchestrator. */
const assertLearningPathV3CycleCreationReady = (): void => {
  throw new Error("Skill ROI scheduler chưa sẵn sàng.");
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

const toObjectId = (id: string | Types.ObjectId): Types.ObjectId =>
  id instanceof MongooseTypes.ObjectId
    ? id
    : new MongooseTypes.ObjectId(id);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const uniqueNumbers = (values?: number[]): number[] =>
  (values ?? []).filter(
    (value, index, list) =>
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 7 &&
      list.indexOf(value) === index
  );

const uniqueStrings = (values?: string[]): string[] =>
  (values ?? []).filter(
    (value, index, list) =>
      typeof value === "string" &&
      value.length > 0 &&
      list.indexOf(value) === index
  );

const sortPartsByWeakestAbility = (parts: IUserSkillPart[]): IUserSkillPart[] =>
  [...parts]
    .filter(
      (part) =>
        Number.isInteger(part.part_type) &&
        part.part_type >= 1 &&
        part.part_type <= 7
    )
    .sort((left, right) => {
      const abilityDelta = (left.ability ?? 1) - (right.ability ?? 1);
      if (abilityDelta !== 0) return abilityDelta;
      return left.part_type - right.part_type;
    });

const getWeakSkillKeysForPart = (part?: IUserSkillPart | null): string[] =>
  [...(part?.skills ?? [])]
    .filter(
      (skill) =>
        typeof skill.skill_key === "string" && skill.skill_key.length > 0
    )
    .sort((left, right) => {
      const abilityDelta = (left.ability ?? 1) - (right.ability ?? 1);
      if (abilityDelta !== 0) return abilityDelta;
      return left.skill_key.localeCompare(right.skill_key);
    })
    .map((skill) => skill.skill_key);

const hasAvailableRoadmapUnit = (
  roadmap?: ILearningPathStrategyPartRoadmap | null
): boolean =>
  Boolean(roadmap && (roadmap.cursor_index ?? 0) < (roadmap.units?.length ?? 0));

const collectRoadmapLessonManagerIds = (
  selectedOption: ILearningPathStrategyOption
): Set<string> => {
  const ids = new Set<string>();

  for (const roadmap of selectedOption.part_roadmaps ?? []) {
    for (const unit of roadmap.units ?? []) {
      if (unit.lesson_manager_id) {
        ids.add(String(unit.lesson_manager_id));
      }
    }
  }

  return ids;
};

const collectUsedLessonManagerIdsFromCycleHistory = async (
  learningPath: ILearningPath
): Promise<Set<string>> => {
  const weekStudyIds = learningPath.week_study_ids ?? [];
  if (weekStudyIds.length === 0) return new Set();

  const dayStudies = await DayStudy.find({
    week_id: { $in: weekStudyIds },
  })
    .select("sessions.lesson_manager_id sessions.items.source_lesson_manager_id")
    .lean<IDayStudy[]>();

  const ids = new Set<string>();

  for (const day of dayStudies) {
    for (const session of day.sessions ?? []) {
      if (session.lesson_manager_id) {
        ids.add(String(session.lesson_manager_id));
      }

      for (const item of session.items ?? []) {
        if (item.source_lesson_manager_id) {
          ids.add(String(item.source_lesson_manager_id));
        }
      }
    }
  }

  return ids;
};

const scoreBandDistance = (
  node: ILessonManager,
  targetScore: number
): number => {
  const from = node.score_band?.from ?? 0;
  const to = node.score_band?.to ?? 0;

  if (from <= targetScore && targetScore <= to) return 0;
  if (targetScore < from) return from - targetScore;
  return targetScore - to;
};

const countMatchingWeakSkillTags = (
  node: ILessonManager,
  partType: number,
  weakSkillKeys: string[]
): number => {
  if (weakSkillKeys.length === 0) return 0;

  const weakSet = new Set(weakSkillKeys);
  return normalizeToeicSkillTags(node.target_tags ?? [], partType).filter((tag) =>
    weakSet.has(tag.key)
  ).length;
};

const sortAlternativeCandidates = (input: {
  candidates: ILessonManager[];
  part: IUserSkillPart;
  targetScore: number;
  weakSkillKeys: string[];
}): ILessonManager[] =>
  [...input.candidates].sort((left, right) => {
    const leftAbilityDistance = Math.abs(
      (left.weight ?? 0) - clamp01(input.part.ability)
    );
    const rightAbilityDistance = Math.abs(
      (right.weight ?? 0) - clamp01(input.part.ability)
    );
    if (leftAbilityDistance !== rightAbilityDistance) {
      return leftAbilityDistance - rightAbilityDistance;
    }

    const leftTagMatches = countMatchingWeakSkillTags(
      left,
      input.part.part_type,
      input.weakSkillKeys
    );
    const rightTagMatches = countMatchingWeakSkillTags(
      right,
      input.part.part_type,
      input.weakSkillKeys
    );
    if (leftTagMatches !== rightTagMatches) {
      return rightTagMatches - leftTagMatches;
    }

    const leftBandDistance = scoreBandDistance(left, input.targetScore);
    const rightBandDistance = scoreBandDistance(right, input.targetScore);
    if (leftBandDistance !== rightBandDistance) {
      return leftBandDistance - rightBandDistance;
    }

    return String(left._id).localeCompare(String(right._id));
  });

const findAlternativeLessonManagerForPart = async (input: {
  part: IUserSkillPart;
  learningPath: ILearningPath;
  excludedLessonManagerIds: Set<string>;
}): Promise<ILessonManager | null> => {
  const targetScore = input.learningPath.target_score ?? 0;
  const weakSkillKeys = getWeakSkillKeysForPart(input.part);

  const candidates = await LessonManager.find({
    part_type: input.part.part_type,
    status: { $in: [TestStatus.APPROVED, TestStatus.OPEN] },
    "score_band.from": { $lte: targetScore },
    _id: {
      $nin: [...input.excludedLessonManagerIds].map((id) => toObjectId(id)),
    },
  }).lean<ILessonManager[]>();

  if (candidates.length === 0) return null;

  const findWithinAbilityDistance = (maxDistance: number) =>
    candidates.filter(
      (node) =>
        Math.abs((node.weight ?? 0) - clamp01(input.part.ability)) <= maxDistance
    );

  const nearCandidates = findWithinAbilityDistance(0.25);
  const relaxedCandidates =
    nearCandidates.length > 0 ? nearCandidates : findWithinAbilityDistance(0.35);
  if (relaxedCandidates.length === 0) return null;

  return (
    sortAlternativeCandidates({
      candidates: relaxedCandidates,
      part: input.part,
      targetScore,
      weakSkillKeys,
    })[0] ?? null
  );
};

const appendAlternativeUnitToRoadmap = (input: {
  selectedOption: ILearningPathStrategyOption;
  partType: number;
  node: ILessonManager;
}): void => {
  let roadmap = input.selectedOption.part_roadmaps.find(
    (item) => item.part_type === input.partType
  );

  if (!roadmap) {
    input.selectedOption.part_roadmaps.push({
      part_type: input.partType,
      cursor_index: 0,
      target_minutes: 0,
      estimated_gain: 0,
      reaches_target: false,
      units: [],
    });
    roadmap =
      input.selectedOption.part_roadmaps[
        input.selectedOption.part_roadmaps.length - 1
      ];
  }

  roadmap.units = roadmap.units ?? [];
  roadmap.units.push({
    lesson_manager_id: toObjectId(String(input.node._id)),
    title: input.node.title,
    part_type: input.partType,
    score_band: input.node.score_band,
    unit_type: input.node.unit_type,
    node_role: input.node.node_role,
    target_tags: input.node.target_tags ?? [],
    order: roadmap.units.length,
    planned_minutes: input.node.planned_completion_time ?? 0,
    estimated_gain: 0,
    reason: "Bài thay thế cùng Part, cùng band điểm và gần năng lực hiện tại.",
    unit_source: "alternative",
    source_reason: "main_roadmap_exhausted",
  });
};

const loadUserSkillForCycle = async (input: {
  user_id: string;
  learning_path_id: string;
  providedUserSkill?: IUserSkill | null;
}): Promise<IUserSkill | null> => {
  if (input.providedUserSkill) return input.providedUserSkill;

  return UserSkill.findOne({
    user_id: toObjectId(input.user_id),
    context_type: "learning_path",
    learning_path_id: toObjectId(input.learning_path_id),
  });
};

const resolveRollingCycleFocus = async (input: {
  user_id: string;
  learning_path_id: string;
  learningPath: ILearningPath;
  selectedOption: ILearningPathStrategyOption;
  userSkill?: IUserSkill | null;
  explicitPartTypes?: number[];
  explicitSkillKeys?: string[];
}): Promise<{
  focus_part_types: number[];
  focus_skill_keys: string[];
  alternatives_added: number;
}> => {
  const explicitPartTypes = uniqueNumbers(input.explicitPartTypes).slice(0, 3);
  const explicitSkillKeys = uniqueStrings(input.explicitSkillKeys).slice(0, 7);

  if (explicitPartTypes.length > 0) {
    return {
      focus_part_types: explicitPartTypes,
      focus_skill_keys: explicitSkillKeys,
      alternatives_added: 0,
    };
  }

  const userSkill = await loadUserSkillForCycle({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    providedUserSkill: input.userSkill,
  });

  if (!userSkill) {
    return {
      focus_part_types: uniqueNumbers(input.selectedOption.focus_part_types).slice(0, 3),
      focus_skill_keys: uniqueStrings(input.selectedOption.focus_skill_keys).slice(0, 7),
      alternatives_added: 0,
    };
  }

  const excludedIds = collectRoadmapLessonManagerIds(input.selectedOption);
  const usedIds = await collectUsedLessonManagerIdsFromCycleHistory(input.learningPath);
  usedIds.forEach((id) => excludedIds.add(id));

  const focusPartTypes: number[] = [];
  const focusSkillKeys: string[] = [];
  let alternativesAdded = 0;

  for (const part of sortPartsByWeakestAbility(userSkill.parts ?? [])) {
    if (focusPartTypes.length >= 3) break;

    const roadmap = input.selectedOption.part_roadmaps.find(
      (item) => item.part_type === part.part_type
    );

    if (!hasAvailableRoadmapUnit(roadmap)) {
      const alternative = await findAlternativeLessonManagerForPart({
        part,
        learningPath: input.learningPath,
        excludedLessonManagerIds: excludedIds,
      });

      if (!alternative) continue;

      appendAlternativeUnitToRoadmap({
        selectedOption: input.selectedOption,
        partType: part.part_type,
        node: alternative,
      });
      excludedIds.add(String(alternative._id));
      alternativesAdded += 1;
    }

    focusPartTypes.push(part.part_type);

    for (const skillKey of getWeakSkillKeysForPart(part)) {
      if (focusSkillKeys.length >= 7) break;
      if (!focusSkillKeys.includes(skillKey)) {
        focusSkillKeys.push(skillKey);
      }
    }
  }

  return {
    focus_part_types: focusPartTypes,
    focus_skill_keys: focusSkillKeys,
    alternatives_added: alternativesAdded,
  };
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
      unit_source: unit.unit_source ?? "strategy",
      source_reason: unit.source_reason ?? "",
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
  /**
   * Planner đa Part cũ không được phép sinh WeekStudy theo model V3.
   * Checkpoint ROI sẽ thay phần thân hàm này bằng Skill ROI optimizer.
   */
  assertLearningPathV3CycleCreationReady();

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

  const rollingFocus = await resolveRollingCycleFocus({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    learningPath,
    selectedOption,
    userSkill: input.user_skill,
    explicitPartTypes: input.cycle_focus_part_types,
    explicitSkillKeys: input.cycle_focus_skill_keys,
  });

  if (rollingFocus.alternatives_added > 0) {
    await selectedOption.save();
  }

  if (rollingFocus.focus_part_types.length === 0) {
    const plan: RouteCompletedPlanV2 = {
      plan_type: "route_completed",
      selected_roadmap_units: [],
      assessment: null,
      reason:
        "Không còn bài học phù hợp cho các Part yếu hiện tại sau khi thử main roadmap và bài thay thế.",
    };

    logLearningPathV2DebugSafe("cycle.create.done", {
      stage: "cycle",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      status: "route_completed",
      reason: plan.reason,
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

  const plan = buildNextCycleByBeamSearch({
    part_roadmaps: mapPartRoadmapsForBeamSearch(selectedOption.part_roadmaps),
    strategy: selectedOption.strategy,
    scenario: input.scenario_override ?? selectedOption.scenario,
    focus_part_types: rollingFocus.focus_part_types,
    focus_skill_keys: rollingFocus.focus_skill_keys,
    mini_tests_completed_since_last_full_test:
      input.mini_tests_completed_since_last_full_test_override ??
      learningPath.mini_tests_completed_since_last_full_test ??
      0,
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
    // Adapter tạm chỉ để code cũ compile; guard ở đầu service ngăn planner đa Part chạy thực tế.
    primary_focus_skill_key: plan.focus_skill_keys[0] ?? "",
    covered_skill_keys: plan.focus_skill_keys.slice(1),
    focus_part_type: plan.focus_part_types[0] ?? 0,
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
    primary_focus_skill_key: plan.focus_skill_keys[0] ?? "",
    covered_skill_keys: plan.focus_skill_keys.slice(1),
    focus_part_type: plan.focus_part_types[0] ?? 0,
    cycle_mode: "main_learning" as const,
    expected_skill_gain: plan.selected_roadmap_units.reduce(
      (sum, unit) => sum + (unit.estimated_gain ?? 0),
      0
    ),
    expected_roi_per_hour:
      plan.estimated_learning_minutes > 0
        ? plan.selected_roadmap_units.reduce(
            (sum, unit) => sum + (unit.estimated_gain ?? 0),
            0
          ) / (plan.estimated_learning_minutes / 60)
        : 0,
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

  const rollingFocus = await resolveRollingCycleFocus({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    learningPath,
    selectedOption: strategyOption,
  });

  if (rollingFocus.alternatives_added > 0) {
    await strategyOption.save();
  }

  if (rollingFocus.focus_part_types.length === 0) {
    return {
      status: "route_completed",
      title: "Roadmap đã hoàn tất",
      description: "Không còn bài học phù hợp để tạo cycle mới.",
      assessment_type: null,
      assessment_estimated_minutes: 0,
      estimated_learning_minutes: 0,
      primary_focus_skill_key: null,
      covered_skill_keys: [],
      focus_part_type: null,
      groups: [],
      route_completed_reason:
        "Không còn bài học phù hợp cho các Part yếu hiện tại sau khi thử main roadmap và bài thay thế.",
    };
  }

  const plan = buildNextCycleByBeamSearch({
    part_roadmaps: mapPartRoadmapsForBeamSearch(strategyOption.part_roadmaps),
    strategy: strategyOption.strategy,
    scenario: strategyOption.scenario,
    focus_part_types: rollingFocus.focus_part_types,
    focus_skill_keys: rollingFocus.focus_skill_keys,
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
      primary_focus_skill_key: null,
      covered_skill_keys: [],
      focus_part_type: null,
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
      unit_source: unit.unit_source,
      source_reason: unit.source_reason,
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
    primary_focus_skill_key: plan.focus_skill_keys[0] ?? null,
    covered_skill_keys: plan.focus_skill_keys.slice(1),
    focus_part_type: plan.focus_part_types[0] ?? null,
    groups: groupPreviewUnitsByPart(units),
  };
};
