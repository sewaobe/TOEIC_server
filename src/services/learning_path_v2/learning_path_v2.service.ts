import type {
  AbilityProfileV2,
  BuildStrategyRoutePlanOutputV2,
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
  LearningPathScenarioV2,
  LearningPathStrategyV2,
  LessonManagerRouteNodeV2,
  LearningScenarioDecisionV2,
  NormalizedTestResultV2,
  PartAbilityInputV2,
  SkillAbilityInputV2,
} from "../../types/learning_path_v2";
import { Types } from "mongoose";
import {
  GroupUser,
  LearningPath,
  LearningPathStrategyOption,
  LessonManager,
  UserProgress,
} from "../../models";
import type { IUserTest } from "../../models";
import type { ILearningPath } from "../../models/learning_path.model";
import { CERFLevel } from "../../models/topic_vocabulary.model";
import type {
  ILearningPathStrategyOption,
  LearningPathScenarioSnapshot,
  LearningPathStrategyOptionStatus,
  LearningPathStrategyOptionTrigger,
} from "../../models/learning_path_strategy_option.model";
import type { ILessonManager } from "../../models/lesson_manager.model";
import type { IUserSkill } from "../../models/user_skill.model";
import type { IUserSkillHistory } from "../../models/user_skill_history.model";
import { normalizeTestResult } from "./layer1_test_result.service";
import { buildAbilityProfile } from "./layer2_ability_profile.service";
import { getLatestUserTestBySubmitType } from "../user_test.service";
import { UserTestSubmitType } from "../../models/enums/UserTestSubmitType";
import { ensureMentorAssignedForUser } from "../mentor_assignment.service";
import { createUserSkillHistory } from "../user_skill_history.service";
import {
  getUserSkillSnapshot,
  updateUserSkillFromHistory,
} from "../user_skill.service";
import { createNextLearningPathCycle } from "../week_study.service";
import { evaluateLearningPathScenario } from "./layer3_strategy_decision.service";
import { buildStrategyRoutePlan } from "./layer4_route_optimizer.service";
import { logLearningPathV2DebugSafe } from "./learning_path_v2_debug_logger";
import { createSchedulerDecisionLog } from "./scheduler_decision_log.service";

import { DayStudy, WeekStudy } from "../../models";
import type { IDayStudy } from "../../models/day_study.model";
import type { IWeekStudy } from "../../models/week_study.model";
import { WeekStudyStatus } from "../../models/enums/WeekStudyStatus";

export type LearningPathV2AbilityPipelineInput =
  | BuildInitialLearningPathPlanInput
  | BuildFullTestLearningPathPlanInput
  | BuildMiniTestNextWeekPlanInput;

export interface LearningPathV2AbilityPipelineOutput {
  normalized_result: NormalizedTestResultV2;
  user_test: IUserTest;
  ability_profile: AbilityProfileV2;
  user_skill_history: IUserSkillHistory;
  user_skill: IUserSkill;
  scenario_decision: LearningScenarioDecisionV2;
  layer4_result?: {
    strategy_options?: ILearningPathStrategyOption[];
    selected_strategy_option?: ILearningPathStrategyOption | null;
    cycle_result?: Awaited<ReturnType<typeof createNextLearningPathCycle>> | null;
  };
}

type Layer4PipelineResult = NonNullable<
  LearningPathV2AbilityPipelineOutput["layer4_result"]
>;

type StrategyOptionPayloadInput = {
  plan: BuildStrategyRoutePlanOutputV2;
  user_id: string;
  learning_path_id: string;
  trigger_type: LearningPathStrategyOptionTrigger;
  source_user_test_id: Types.ObjectId;
  source_week_study_id?: string | null;
  status: LearningPathStrategyOptionStatus;
  title: string;
  description: string;
  scenario: LearningPathScenarioSnapshot;
};

type RouteFrontierForLayer4 = {
  completed_unit_ids: string[];
  start_unit_ids_by_part: Record<number, string[]>;
};

const PART_TYPES = [1, 2, 3, 4, 5, 6, 7];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toValidUserObjectId = (userId: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("user_id khong hop le.");
  }

  return new Types.ObjectId(userId);
};

const getLatestActiveLearningPathForUser = async (
  userId: string
): Promise<ILearningPath | null> => {
  return LearningPath.findOne({
    user_id: toValidUserObjectId(userId),
    isActive: true,
  }).sort({ created_at: -1 });
};

export const upsertLearningPathV2Setup = async (input: {
  user_id: string;
  target_score: number;
  target_completion_date: Date;
  time_per_day: number;
  days_per_week: number;
}): Promise<{ learning_path: ILearningPath }> => {
  const userObjectId = toValidUserObjectId(input.user_id);

  if (!Number.isFinite(input.target_score) || input.target_score <= 0) {
    throw new Error("target_score khong hop le.");
  }

  if (
    !(input.target_completion_date instanceof Date) ||
    Number.isNaN(input.target_completion_date.getTime())
  ) {
    throw new Error("target_completion_date khong hop le.");
  }

  if (!Number.isFinite(input.time_per_day) || input.time_per_day <= 0) {
    throw new Error("time_per_day khong hop le.");
  }

  if (
    !Number.isFinite(input.days_per_week) ||
    input.days_per_week < 1 ||
    input.days_per_week > 7
  ) {
    throw new Error("days_per_week khong hop le.");
  }

  /*
   * Setup only stores the user's target/time configuration from /plan.
   * WeekStudy/DayStudy are not created at this step.
   */
  const existing = await getLatestActiveLearningPathForUser(input.user_id);

  if ((existing?.week_study_ids?.length ?? 0) > 0) {
    throw new Error(
      "Lo trinh da duoc tao cycle, khong the sua setup truc tiep."
    );
  }

  const setupPayload = {
    target_score: input.target_score,
    target_completion_date: input.target_completion_date,
    time_per_day: input.time_per_day,
    days_per_week: input.days_per_week,
    updated_at: new Date(),
  };

  if (existing) {
    existing.set(setupPayload);
    await existing.save();
    return { learning_path: existing };
  }

  const learningPath = await LearningPath.create({
    user_id: userObjectId,
    title: "Lo trinh TOEIC Smart",
    description: "Lo trinh ca nhan hoa bang LearningPath v2",
    level: CERFLevel.B1,
    isActive: true,
    ...setupPayload,
    current_week: 1,
    week_study_ids: [],
    created_by: userObjectId,
    created_at: new Date(),
  });

  return { learning_path: learningPath };
};

export const getLearningPathV2GenerationContext = async (input: {
  user_id: string;
}) => {
  const learningPath = await getLatestActiveLearningPathForUser(input.user_id);
  const latestInitialTest = await getLatestUserTestBySubmitType({
    user_id: input.user_id,
    submit_type: UserTestSubmitType.INITIAL_ASSESSMENT,
  });

  const missing_requirements: string[] = [];

  if (!learningPath) {
    missing_requirements.push("learning_path_setup");
  }

  if (!latestInitialTest) {
    missing_requirements.push("initial_assessment");
  }

  if (learningPath && !learningPath.target_completion_date) {
    missing_requirements.push("target_completion_date");
  }

  if (
    learningPath &&
    (!learningPath.time_per_day || !learningPath.days_per_week)
  ) {
    missing_requirements.push("time_setup");
  }

  /*
   * Used by /programs before the user clicks generate:
   * FE can display the latest entry-test result and current LearningPath setup.
   */
  return {
    learning_path: learningPath,
    latest_initial_test: latestInitialTest,
    can_generate: missing_requirements.length === 0,
    missing_requirements,
  };
};

export const ensureLearningPathV2MentorAssigned = async (input: {
  user_id: string;
  learning_path_id: string;
  current_score?: number;
  target_score?: number;
}) => {
  const userObjectId = toValidUserObjectId(input.user_id);
  const learningPathObjectId = toObjectId(input.learning_path_id);

  let group = await GroupUser.findOne({ students: userObjectId });

  if (!group?.mentor_id) {
    const assignedMentorId = await ensureMentorAssignedForUser(userObjectId);

    if (!assignedMentorId) {
      throw new Error(
        "Nguoi dung chua duoc gan mentor va khong tim thay CTV phu hop."
      );
    }

    group = await GroupUser.findOne({ students: userObjectId });
  }

  if (!group?.mentor_id) {
    throw new Error(
      "Nguoi dung chua duoc gan mentor va khong tim thay CTV phu hop."
    );
  }

  await GroupUser.updateOne(
    { students: userObjectId },
    { $set: { learningPath_id: learningPathObjectId } }
  );

  const hasCurrentScore = Number.isFinite(input.current_score);
  const hasTargetScore = Number.isFinite(input.target_score);

  const setPayload = {
    mentor_id: group.mentor_id,
    updated_at: new Date(),
    ...(hasCurrentScore ? { current_score: input.current_score } : {}),
    ...(hasTargetScore ? { target_score: input.target_score } : {}),
  };

  const setOnInsertPayload = {
    user_id: userObjectId,
    learningPath_id: learningPathObjectId,
    completed_lessons: 0,
    total_lessons: 0,
    completion_rate: 0,
    total_study_time: 0,
    streak_days: 0,
    longest_streak: 0,
    status: "active",

    // Chỉ default 0 khi field KHÔNG được set ở $set.
    ...(!hasCurrentScore ? { current_score: 0 } : {}),
    ...(!hasTargetScore ? { target_score: 0 } : {}),
  };

  await UserProgress.findOneAndUpdate(
    {
      user_id: userObjectId,
      learningPath_id: learningPathObjectId,
    },
    {
      $set: setPayload,
      $setOnInsert: setOnInsertPayload,
    },
    { upsert: true, new: true }
  );

  return { mentor_id: group.mentor_id };
};

const toObjectId = (id: string | Types.ObjectId): Types.ObjectId =>
  id instanceof Types.ObjectId ? id : new Types.ObjectId(id);

const idsToStrings = (ids?: Types.ObjectId[]): string[] =>
  (ids ?? []).map((id) => id.toString());

const clampAbility = (value: number): number => Math.min(1, Math.max(0, value));

export const calculateTotalAvailableMinutesForRoute = (input: {
  now: Date;
  target_completion_date?: Date | null;
  time_per_day?: number;
  days_per_week?: number;
}): number => {
  if (!input.time_per_day || input.time_per_day <= 0) {
    throw new Error("LearningPath chưa có time_per_day để tính route budget.");
  }

  if (input.target_completion_date && input.target_completion_date > input.now) {
    const daysRemaining = Math.ceil(
      (input.target_completion_date.getTime() - input.now.getTime()) / ONE_DAY_MS
    );
    const daysPerWeek = Math.min(Math.max(input.days_per_week ?? 7, 1), 7);
    const activeDaysApprox = (daysRemaining * daysPerWeek) / 7;
    return Math.round(activeDaysApprox * input.time_per_day);
  }

  // Fallback khi LearningPath chưa có deadline hoặc deadline đã qua.
  return Math.round(30 * input.time_per_day);
};

const loadLearningPathForScheduler = async (input: {
  learning_path_id: string;
  user_id: string;
}): Promise<ILearningPath> => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath để tạo route Layer 4.");
  }

  return learningPath;
};

export const extractPartAbilitiesForLayer4 = (input: {
  user_skill: IUserSkill;
}): PartAbilityInputV2[] => {
  const abilities = (input.user_skill.parts ?? [])
    .filter((part) => PART_TYPES.includes(part.part_type))
    .map((part) => ({
      part_type: part.part_type,
      ability: clampAbility(part.ability),
    }))
    .sort((a, b) => a.part_type - b.part_type);

  const hasExactParts =
    abilities.length === 7 &&
    PART_TYPES.every((partType, index) => abilities[index]?.part_type === partType);

  if (!hasExactParts) {
    throw new Error("UserSkill chưa đủ ability 7 Part để tạo route Layer 4.");
  }

  return abilities;
};

export const extractSkillAbilitiesForLayer4 = (input: {
  user_skill: IUserSkill;
}): SkillAbilityInputV2[] => {
  return (input.user_skill.parts ?? []).flatMap((part) =>
    (part.skills ?? [])
      .filter(
        (skill) =>
          typeof skill.skill_key === "string" &&
          skill.skill_key.length > 0 &&
          typeof skill.ability === "number" &&
          Number.isFinite(skill.ability)
      )
      .map((skill) => ({
        part_type: part.part_type,
        skill_key: skill.skill_key,
        ability: clampAbility(skill.ability),
        status: skill.status,
      }))
  );
};

const loadLessonManagerRouteNodes = async (): Promise<LessonManagerRouteNodeV2[]> => {
  const nodes = await LessonManager.find({
    status: { $in: ["approved", "open"] },
  });

  return (nodes as ILessonManager[]).map((node) => ({
    id: String(node._id),
    title: node.title,
    part_type: node.part_type,
    score_band: node.score_band,
    unit_type: node.unit_type,
    node_role: node.node_role,
    target_tags: node.target_tags ?? [],
    weight: node.weight,
    planned_completion_time: node.planned_completion_time,
    next_unit_ids: idsToStrings(node.next_unit_ids),
    prerequisite_unit_ids: idsToStrings(node.prerequisite_unit_ids),
    auxiliary_unit_ids: idsToStrings(node.auxiliary_unit_ids),
    status: node.status,
  }));
};

const toStrategyOptionScenario = (
  scenario: LearningPathScenarioV2
): LearningPathScenarioSnapshot => {
  if (
    scenario === "ONBOARDING" ||
    scenario === "FULLTEST_MONTHLY" ||
    scenario === "PRE_DEADLINE" ||
    scenario === "BEHIND_SCHEDULE"
  ) {
    return scenario;
  }

  throw new Error("Scenario không hợp lệ để tạo strategy option sau full test.");
};

const mapRoutePlanToStrategyOptionPayload = (input: StrategyOptionPayloadInput) => ({
  user_id: toObjectId(input.user_id),
  learning_path_id: toObjectId(input.learning_path_id),
  trigger_type: input.trigger_type,
  source_user_test_id: input.source_user_test_id,
  source_week_study_id: input.source_week_study_id
    ? toObjectId(input.source_week_study_id)
    : null,
  strategy: input.plan.strategy,
  scenario: input.scenario,
  status: input.status,
  title: input.title,
  description: input.description,
  focus_part_types: input.plan.focus_part_types,
  focus_skill_keys: input.plan.focus_skill_keys,
  estimated_total_minutes: input.plan.estimated_total_minutes,
  estimated_gain: input.plan.estimated_gain,
  reaches_target: input.plan.reaches_target,
  part_roadmaps: input.plan.part_roadmaps.map((roadmap) => ({
    part_type: roadmap.part_type,
    cursor_index: roadmap.cursor_index,
    target_minutes: roadmap.target_minutes,
    estimated_gain: roadmap.estimated_gain,
    reaches_target: roadmap.reaches_target,
    units: roadmap.units.map((unit) => ({
      lesson_manager_id: toObjectId(unit.lesson_manager_id),
      title: unit.title,
      part_type: unit.part_type,
      score_band: unit.score_band,
      unit_type: unit.unit_type,
      node_role: unit.node_role,
      target_tags: unit.target_tags,
      order: unit.order,
      planned_minutes: unit.planned_minutes,
      estimated_gain: unit.estimated_gain,
      reason: unit.reason,
    })),
  })),
  summary_reasons: input.plan.summary_reasons,
  selected_at: input.status === "selected" ? new Date() : undefined,
});

const deriveRouteFrontierFromStrategyOption = (
  option?: ILearningPathStrategyOption | null
): RouteFrontierForLayer4 => {
  const completedUnitIds: string[] = [];
  const startUnitIdsByPart: Record<number, string[]> = {};

  for (const roadmap of option?.part_roadmaps ?? []) {
    const units = roadmap.units ?? [];
    const cursorIndex = Math.min(
      Math.max(0, roadmap.cursor_index ?? 0),
      units.length
    );

    for (const unit of units.slice(0, cursorIndex)) {
      if (unit.lesson_manager_id) {
        completedUnitIds.push(String(unit.lesson_manager_id));
      }
    }

    const nextUnit = units[cursorIndex];
    if (nextUnit?.lesson_manager_id) {
      startUnitIdsByPart[roadmap.part_type] = [
        String(nextUnit.lesson_manager_id),
      ];
    }
  }

  return {
    completed_unit_ids: Array.from(new Set(completedUnitIds)),
    start_unit_ids_by_part: startUnitIdsByPart,
  };
};

const buildRoutePlanForStrategy = async (input: {
  learningPath: ILearningPath;
  userSkill: IUserSkill;
  strategy: LearningPathStrategyV2;
  scenario: LearningPathScenarioV2;
  now: Date;
  completed_unit_ids?: string[];
  start_unit_ids_by_part?: Record<number, string[]>;
}): Promise<BuildStrategyRoutePlanOutputV2> => {
  /*
   * Layer 4 cần route budget tổng. MVP dùng time_per_day + target_completion_date,
   * chưa xét lịch học chi tiết từng thứ.
   */
  const totalAvailableMinutes = calculateTotalAvailableMinutesForRoute({
    now: input.now,
    target_completion_date: input.learningPath.target_completion_date,
    time_per_day: input.learningPath.time_per_day,
    days_per_week: input.learningPath.days_per_week,
  });
  const partAbilities = extractPartAbilitiesForLayer4({
    user_skill: input.userSkill,
  });
  const skillAbilities = extractSkillAbilitiesForLayer4({
    user_skill: input.userSkill,
  });
  const lessonManagerNodes = await loadLessonManagerRouteNodes();

  return buildStrategyRoutePlan({
    strategy: input.strategy,
    scenario: input.scenario,
    target_score: input.learningPath.target_score ?? 0,
    total_available_minutes: totalAvailableMinutes,
    part_abilities: partAbilities,
    skill_abilities: skillAbilities,
    lesson_manager_nodes: lessonManagerNodes,
    completed_unit_ids: input.completed_unit_ids,
    start_unit_ids_by_part: input.start_unit_ids_by_part,
  });
};

const countCycleActivities = (dayStudies?: IDayStudy[]) => {
  const days = dayStudies ?? [];

  return {
    generated_day_count: days.length,
    generated_session_count: days.reduce(
      (sum, day) => sum + (day.sessions?.length ?? 0),
      0
    ),
    generated_activity_count: days.reduce(
      (sum, day) =>
        sum +
        (day.sessions ?? []).reduce(
          (sessionSum, session) => sessionSum + (session.items?.length ?? 0),
          0
        ),
      0
    ),
  };
};

const mapUserSkillPartsToSchedulerSnapshot = (userSkill: IUserSkill) =>
  (userSkill.parts ?? []).map((part) => ({
    part_type: part.part_type,
    ability: part.ability,
    status: part.status,
    trend: part.trend,
  }));

const mapUserSkillSkillsToSchedulerSnapshot = (userSkill: IUserSkill) =>
  (userSkill.parts ?? []).flatMap((part) =>
    (part.skills ?? []).map((skill) => ({
      part_type: part.part_type,
      skill_key: skill.skill_key,
      ability: skill.ability,
      status: skill.status,
      trend: skill.trend,
    }))
  );

const sumDayStudyPlannedMinutes = (dayStudies?: IDayStudy[]): number => {
  return (dayStudies ?? []).reduce((daySum, day) => {
    const sessions = day.sessions ?? [];

    return (
      daySum +
      sessions.reduce((sessionSum, session) => {
        if (typeof session.planned_minutes === "number") {
          return sessionSum + session.planned_minutes;
        }

        return (
          sessionSum +
          (session.items ?? []).reduce(
            (itemSum, item) => itemSum + (item.estimated_minutes ?? 0),
            0
          )
        );
      }, 0)
    );
  }, 0);
};

const createInitialSelectedOptionAndCycle = async (input: {
  originalInput: LearningPathV2AbilityPipelineInput;
  learningPath: ILearningPath;
  userTest: IUserTest;
  userSkill: IUserSkill;
  normalizedResult: NormalizedTestResultV2;
}): Promise<Layer4PipelineResult> => {
  const plan = await buildRoutePlanForStrategy({
    learningPath: input.learningPath,
    userSkill: input.userSkill,
    strategy: "recommended",
    scenario: "ONBOARDING",
    now: input.normalizedResult.submitted_at ?? new Date(),
  });

  await LearningPathStrategyOption.updateMany(
    {
      learning_path_id: input.originalInput.learning_path_id,
      user_id: input.originalInput.user_id,
      status: "selected",
    },
    { $set: { status: "expired" } }
  );

  /*
   * Initial generation auto-select recommended để user có cycle đầu tiên ngay,
   * không cần chọn option.
   */
  const selectedOption = await LearningPathStrategyOption.create(
    mapRoutePlanToStrategyOptionPayload({
      plan,
      user_id: input.originalInput.user_id,
      learning_path_id: input.originalInput.learning_path_id,
      trigger_type: "initial_generation",
      source_user_test_id: input.userTest._id,
      status: "selected",
      title: "Lộ trình khởi đầu được đề xuất",
      description: "Hệ thống tự chọn lộ trình recommended sau entry test.",
      scenario: "ONBOARDING",
    })
  );

  const cycleResult = await createNextLearningPathCycle({
    user_id: input.originalInput.user_id,
    learning_path_id: input.originalInput.learning_path_id,
    now: input.normalizedResult.submitted_at ?? new Date(),
  });

  if (cycleResult.status === "cycle_created" && selectedOption) {
    const cycleDayStudyMinutes = sumDayStudyPlannedMinutes(
      cycleResult.day_studies
    );

    try {
      await createSchedulerDecisionLog({
        user_id: input.originalInput.user_id,
        learning_path_id: input.originalInput.learning_path_id,
        learning_path_strategy_option_id: String(selectedOption._id),
        trigger_type: "initial_generation",
        generated_week_id: String(cycleResult.week_study._id),
        strategy: selectedOption.strategy,
        scenario: selectedOption.scenario,
        status: "applied",
        reasons: selectedOption.summary_reasons ?? [],
        warnings: [],
        input_snapshot: {
          current_score: input.userTest.score,
          target_score: input.learningPath.target_score,
          weekly_available_minutes: cycleDayStudyMinutes,
          test_type: "entry",
          part_abilities: mapUserSkillPartsToSchedulerSnapshot(input.userSkill),
          skill_abilities: mapUserSkillSkillsToSchedulerSnapshot(input.userSkill),
          extra: {
            source_user_test_id: String(input.userTest._id),
            source_test_id: String(input.userTest.test_id),
            target_completion_date: input.learningPath.target_completion_date,
          },
        },
        selected_lesson_manager_ids: cycleResult.plan.selected_roadmap_units.map(
          (unit) => unit.lesson_manager_id
        ),
        output_summary: {
          planned_minutes: cycleDayStudyMinutes,
          selected_unit_count: cycleResult.plan.selected_roadmap_units.length,
          ...countCycleActivities(cycleResult.day_studies),
        },
        created_by: input.originalInput.user_id,
      });
    } catch (error) {
      logLearningPathV2DebugSafe("scheduler_decision_log.create_failed", {
        stage: "scheduler_decision_log",
        user_id: input.originalInput.user_id,
        learning_path_id: input.originalInput.learning_path_id,
        trigger_type: "initial_generation",
        selected_strategy_option_id: selectedOption._id,
        week_study_id: cycleResult.week_study._id,
        error,
      });
    }
  }

  return {
    strategy_options: [selectedOption],
    selected_strategy_option: selectedOption,
    cycle_result: cycleResult,
  };
};

const createFullTestPendingOptions = async (input: {
  originalInput: LearningPathV2AbilityPipelineInput;
  learningPath: ILearningPath;
  userTest: IUserTest;
  userSkill: IUserSkill;
  scenarioDecision: LearningScenarioDecisionV2;
  normalizedResult: NormalizedTestResultV2;
}): Promise<Layer4PipelineResult> => {
  input.learningPath.mini_tests_completed_since_last_full_test = 0;
  input.learningPath.last_full_test_user_test_id = input.userTest._id;
  input.learningPath.last_full_test_submitted_at = input.userTest.submit_at;
  await input.learningPath.save();

  /*
 * Phải lấy selected option cũ trước khi expire để giữ route frontier.
 * Full test tạo 3 option mới, nhưng không reset route từ đầu.
 */
  const previousSelectedOption = await LearningPathStrategyOption.findOne({
    learning_path_id: input.originalInput.learning_path_id,
    user_id: input.originalInput.user_id,
    status: "selected",
  }).sort({ selected_at: -1, created_at: -1 });

  const routeFrontier = deriveRouteFrontierFromStrategyOption(
    previousSelectedOption
  );

  logLearningPathV2DebugSafe("layer4.full_test_route_frontier", {
    stage: "layer4",
    learning_path_id: input.originalInput.learning_path_id,
    user_id: input.originalInput.user_id,
    previous_strategy_option_id: previousSelectedOption?._id?.toString(),
    completed_unit_count: routeFrontier.completed_unit_ids.length,
    start_unit_ids_by_part: routeFrontier.start_unit_ids_by_part,
  });

  /*
 * Sau full test, route cũ không còn là active route nữa.
 * User phải chọn 1 trong 3 option pending mới rồi hệ thống mới tạo cycle tiếp theo.
 * Vì vậy selected cũ và pending cũ đều chuyển expired trước khi tạo batch mới.
 */
  await LearningPathStrategyOption.updateMany(
    {
      learning_path_id: input.originalInput.learning_path_id,
      user_id: input.originalInput.user_id,
      status: { $in: ["selected", "pending_selection"] },
    },
    { $set: { status: "expired" } }
  );

  const scenario = toStrategyOptionScenario(input.scenarioDecision.scenario);
  const strategies: LearningPathStrategyV2[] = [
    "recommended",
    "balanced",
    "opportunity",
  ];

  const payloads = await Promise.all(
    strategies.map(async (strategy) => {
      const plan = await buildRoutePlanForStrategy({
        learningPath: input.learningPath,
        userSkill: input.userSkill,
        strategy,
        scenario,
        now: input.normalizedResult.submitted_at ?? new Date(),
        completed_unit_ids: routeFrontier.completed_unit_ids,
        start_unit_ids_by_part: routeFrontier.start_unit_ids_by_part,
      });

      return mapRoutePlanToStrategyOptionPayload({
        plan,
        user_id: input.originalInput.user_id,
        learning_path_id: input.originalInput.learning_path_id,
        trigger_type: "full_test_review",
        source_user_test_id: input.userTest._id,
        source_week_study_id: input.originalInput.week_study_id ?? null,
        status: "pending_selection",
        title: `Lựa chọn ${strategy}`,
        description: "Route được tạo sau full test để user tự chọn.",
        scenario,
      });
    })
  );

  /*
   * Full test review tạo 3 option pending để user tự chọn. Chỉ sau khi user chọn
   * option mới tạo cycle tiếp theo.
   */
  const strategyOptions = await LearningPathStrategyOption.create(payloads);

  return {
    strategy_options: Array.isArray(strategyOptions)
      ? strategyOptions
      : [strategyOptions],
    selected_strategy_option: null,
    cycle_result: null,
  };
};

const handleMiniTestCompletionCycle = async (input: {
  originalInput: LearningPathV2AbilityPipelineInput;
  learningPath: ILearningPath;
  userTest: IUserTest;
}): Promise<Layer4PipelineResult> => {
  /*
   * Mini test không tạo lại route option. Nó chỉ cập nhật counter và tiếp tục
   * active graph đã chọn.
   */
  input.learningPath.mini_tests_completed_since_last_full_test =
    (input.learningPath.mini_tests_completed_since_last_full_test ?? 0) + 1;
  await input.learningPath.save();

  const cycleResult = await createNextLearningPathCycle({
    user_id: input.originalInput.user_id,
    learning_path_id: input.originalInput.learning_path_id,
    now: input.userTest.submit_at,
  });

  return {
    selected_strategy_option: cycleResult.strategy_option,
    cycle_result: cycleResult,
  };
};

const summarizeNormalizedResultForLog = (result: NormalizedTestResultV2) => {
  const answers = Array.isArray(result.answers) ? result.answers : [];
  const partResults = Array.isArray(result.part_results)
    ? result.part_results
    : [];

  return {
    test_id: result.test_id,
    test_result_id: result.test_result_id,
    test_type: result.test_type,
    source: result.source,
    submitted_at: result.submitted_at,
    elapsed_seconds: result.elapsed_seconds,
    raw_score: result.raw_score,
    accuracy: result.accuracy,
    answers_count: answers.length,
    part_results_count: partResults.length,
    sample_answers: answers.slice(0, 3).map((answer) => ({
      question_id: answer.question_id,
      part_type: answer.part_type,
      is_correct: answer.is_correct,
      irt_difficulty: answer.irt_difficulty,
      skill_keys: answer.skill_keys?.slice(0, 5) ?? [],
    })),
    metadata_summary: {
      missing_question_metadata_count:
        result.metadata?.missing_question_metadata_count,
      missing_irt_difficulty_count: result.metadata?.missing_irt_difficulty_count,
      skill_enrichment_warnings: result.metadata?.skill_enrichment_warnings,
    },
  };
};

const summarizeAbilityProfileForLog = (profile: AbilityProfileV2) => {
  const partAbilities = Array.isArray(profile.part_abilities)
    ? profile.part_abilities
    : [];
  const skillAbilities = Array.isArray(profile.skill_abilities)
    ? profile.skill_abilities
    : [];

  return {
    source_test_result_id: profile.source_test_result_id,
    part_abilities_count: partAbilities.length,
    skill_abilities_count: skillAbilities.length,
    part_abilities: partAbilities.map((part) => ({
      part_type: part.part_type,
      ability: part.ability,
      status: part.status,
      item_count: part.item_count,
      correct_count: part.correct_count,
    })),
    weak_skill_keys_sample: skillAbilities
      .filter((skill) => skill.status === "weak")
      .slice(0, 10)
      .map((skill) => skill.skill_key),
    warnings: profile.warnings,
  };
};

const summarizeLayer4ResultForLog = (result?: Layer4PipelineResult) => {
  const cycleResult = result?.cycle_result;
  const cycleCreated = cycleResult?.status === "cycle_created";
  const plan = cycleCreated ? cycleResult.plan : undefined;
  const dayStudies = cycleCreated && Array.isArray(cycleResult.day_studies)
    ? cycleResult.day_studies
    : [];

  return {
    strategy_options_count: result?.strategy_options?.length ?? 0,
    selected_strategy_option_id: result?.selected_strategy_option?._id,
    selected_strategy: result?.selected_strategy_option?.strategy,
    selected_status: result?.selected_strategy_option?.status,
    cycle_status: cycleResult?.status,
    week_study_id: cycleCreated ? cycleResult.week_study?._id : null,
    day_studies_count: dayStudies.length,
    assessment_type: plan?.assessment?.type,
    selected_roadmap_positions: plan?.selected_roadmap_positions,
  };
};

/**
 * Pipeline chạy Layer 1/2/3 rồi nối sang Layer 4 theo trigger.
 * - initial_generation: tạo selected recommended option và cycle đầu tiên.
 * - full_test_review: tạo 3 pending options để user chọn.
 * - mini_test_completion: tiếp tục selected route và tạo cycle kế tiếp.
 *
 * WeekStudy service hiện đã tạo DayStudy và gắn placeholder assessment test.
 * Pipeline này không tạo UserTest mới; UserTest đã được tạo ở flow submit test.
 */
export const runLearningPathV2AbilityPipeline = async (
  input: LearningPathV2AbilityPipelineInput
): Promise<LearningPathV2AbilityPipelineOutput> => {
  const rawResult = input.raw_result;
  const userTest = input.source_user_test;

  logLearningPathV2DebugSafe("pipeline.start", {
    stage: "pipeline",
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    trigger_type: input.trigger_type,
    source_user_test_id: userTest._id,
    source_test_id: userTest.test_id,
    source_submit_at: userTest.submit_at,
    raw_answers_count: Array.isArray(rawResult.answers)
      ? rawResult.answers.length
      : 0,
    raw_parts_count: Array.isArray(rawResult.parts) ? rawResult.parts.length : 0,
  });

  try {

    // Layer 1 chuẩn hóa test result thô thành dữ liệu answer-level để các layer sau dùng chung.
    const normalizedResult = await normalizeTestResult({
      trigger_type: input.trigger_type,
      user_id: input.user_id,
      test_id: typeof rawResult.test_id === "string" ? rawResult.test_id : undefined,
      raw_result: rawResult,
    });

    logLearningPathV2DebugSafe("pipeline.normalized_result", {
      stage: "layer1",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      ...summarizeNormalizedResultForLog(normalizedResult),
    });

    // Lấy UserSkill snapshot cũ trước khi update để Layer 3 so sánh old/new focus skills.
    const oldUserSkill = await getUserSkillSnapshot({
      user_id: input.user_id,
      context_type: "learning_path",
      learning_path_id: input.learning_path_id,
    });

    // Layer 2 tính ability từ question-level answers, không dùng part_results làm ability.
    const abilityProfile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    logLearningPathV2DebugSafe("pipeline.ability_profile", {
      stage: "layer2",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      ...summarizeAbilityProfileForLog(abilityProfile),
    });

    // UserSkillHistory lưu ability signal theo từng lần submit để phục vụ trend và audit.
    const userSkillHistory = await createUserSkillHistory({
      user_id: input.user_id,
      context_type: "learning_path",
      learning_path_id: input.learning_path_id,
      source_user_test_id: String(userTest._id),
      source_test_id: normalizedResult.test_id,
      trigger_type: normalizedResult.trigger_type,
      ability_profile: abilityProfile,
      submitted_at: normalizedResult.submitted_at,
    });

    // UserSkill là snapshot đã merge bằng EWMA + trend slope từ history mới nhất.
    const userSkill = await updateUserSkillFromHistory(userSkillHistory);

    // Layer 3 quyết scenario dựa trên trigger, deadline, pace và focus skill delta.
    const scenarioDecision = await evaluateLearningPathScenario({
      trigger_type: normalizedResult.trigger_type,
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      learning_path_created_at: input.learning_path_created_at,
      target_completion_date: input.target_completion_date,
      old_user_skill: oldUserSkill,
      new_user_skill: userSkill,
      week_study_id: input.week_study_id,
      source_user_test_id: String(userTest._id),
      actual_submit_at: userTest.submit_at,
    });

    logLearningPathV2DebugSafe("pipeline.scenario_decision", {
      stage: "layer3",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      scenario: scenarioDecision.scenario,
      pre_deadline: scenarioDecision.pre_deadline,
      pace_status: scenarioDecision.pace_status,
      delay_days: scenarioDecision.delay_days,
      focus_delta: scenarioDecision.focus_delta,
      comparable_focus_skill_count:
        scenarioDecision.comparable_focus_skill_count,
      newly_measured_focus_skill_count:
        scenarioDecision.newly_measured_focus_skill_count,
      focus_part_types: scenarioDecision.focus_part_types,
      focus_skill_keys_sample: scenarioDecision.focus_skill_keys?.slice(0, 10),
    });

    const learningPath = await loadLearningPathForScheduler({
      learning_path_id: input.learning_path_id,
      user_id: input.user_id,
    });

    let layer4Result: Layer4PipelineResult | undefined;

    switch (normalizedResult.trigger_type) {
      case "initial_generation":
        // Entry test xong thì tự chọn recommended route và tạo cycle đầu tiên.
        layer4Result = await createInitialSelectedOptionAndCycle({
          originalInput: input,
          learningPath,
          userTest,
          userSkill,
          normalizedResult,
        });
        break;

      case "full_test_review":
        // Full test chỉ tạo 3 option pending, không auto tạo WeekStudy.
        layer4Result = await createFullTestPendingOptions({
          originalInput: input,
          learningPath,
          userTest,
          userSkill,
          scenarioDecision,
          normalizedResult,
        });
        break;

      case "mini_test_completion":
        // Mini test tiếp tục selected route hiện tại và tạo cycle kế tiếp.
        layer4Result = await handleMiniTestCompletionCycle({
          originalInput: input,
          learningPath,
          userTest,
        });
        break;

      default:
        layer4Result = undefined;
    }

    logLearningPathV2DebugSafe("pipeline.layer4_result", {
      stage: "layer4",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      ...summarizeLayer4ResultForLog(layer4Result),
    });

    return {
      normalized_result: normalizedResult,
      user_test: userTest,
      ability_profile: abilityProfile,
      user_skill_history: userSkillHistory,
      user_skill: userSkill,
      scenario_decision: scenarioDecision,
      layer4_result: layer4Result,
    };
  } catch (error) {
    logLearningPathV2DebugSafe("pipeline.error", {
      stage: "pipeline",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      source_user_test_id: userTest._id,
      error,
    });
    throw error;
  }
};


type LearningPathV2ReadInput = {
  user_id: string;
  learning_path_id: string;
};

type CurrentCycleResponse = {
  week_study: IWeekStudy;
  day_studies: IDayStudy[];
};

type CurrentLearningPathCycleV2Result = {
  learning_path: ILearningPath;
  selected_strategy_option: ILearningPathStrategyOption | null;
  current_cycle: CurrentCycleResponse | null;
};

type LearningPathV2OverviewResult = CurrentLearningPathCycleV2Result & {
  pending_strategy_options: ILearningPathStrategyOption[];
  week_studies: IWeekStudy[];
};

const loadActiveLearningPath = async (
  input: LearningPathV2ReadInput
): Promise<ILearningPath> => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath.");
  }

  return learningPath;
};

const findCurrentWeekStudy = async (
  learningPath: ILearningPath
): Promise<IWeekStudy | null> => {
  const weekStudyIds = learningPath.week_study_ids ?? [];

  if (weekStudyIds.length === 0) {
    return null;
  }

  const currentWeekStudy = await WeekStudy.findOne({
    _id: { $in: weekStudyIds },
    status: WeekStudyStatus.IN_PROGRESS,
  }).sort({ no: -1 });

  if (currentWeekStudy) {
    return currentWeekStudy;
  }

  return WeekStudy.findOne({
    _id: { $in: weekStudyIds },
  }).sort({ no: -1 });
};

const loadDayStudiesForWeek = (weekStudy: IWeekStudy): Promise<IDayStudy[]> =>
  DayStudy.find({ week_id: weekStudy._id }).sort({ dayOfWeek: 1 });

const loadSelectedStrategyOptionForWeek = async (input: {
  user_id: string;
  learning_path_id: string;
  week_study: IWeekStudy | null;
}): Promise<ILearningPathStrategyOption | null> => {
  if (!input.week_study?.learning_path_strategy_option_id) {
    return null;
  }

  return LearningPathStrategyOption.findOne({
    _id: input.week_study.learning_path_strategy_option_id,
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });
};

export const getCurrentLearningPathCycleV2 = async (
  input: LearningPathV2ReadInput
): Promise<CurrentLearningPathCycleV2Result> => {
  const learningPath = await loadActiveLearningPath(input);
  const weekStudy = await findCurrentWeekStudy(learningPath);
  const dayStudies = weekStudy ? await loadDayStudiesForWeek(weekStudy) : [];
  const selectedStrategyOption = await loadSelectedStrategyOptionForWeek({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    week_study: weekStudy,
  });

  return {
    learning_path: learningPath,
    selected_strategy_option: selectedStrategyOption,
    current_cycle: weekStudy
      ? {
        week_study: weekStudy,
        day_studies: dayStudies,
      }
      : null,
  };
};

export const getLearningPathV2Overview = async (
  input: LearningPathV2ReadInput
): Promise<LearningPathV2OverviewResult> => {
  const learningPath = await loadActiveLearningPath(input);
  const weekStudyIds = learningPath.week_study_ids ?? [];

  const selectedOption = await LearningPathStrategyOption.findOne({
    learning_path_id: input.learning_path_id,
    user_id: input.user_id,
    status: "selected",
  }).sort({ created_at: -1 });

  const pendingOptions = await LearningPathStrategyOption.find({
    learning_path_id: input.learning_path_id,
    user_id: input.user_id,
    status: "pending_selection",
  }).sort({ created_at: -1 });

  const weekStudies =
    weekStudyIds.length > 0
      ? await WeekStudy.find({ _id: { $in: weekStudyIds } }).sort({ no: 1 })
      : [];

  const currentWeekStudy =
    [...weekStudies]
      .reverse()
      .find((week) => week.status === WeekStudyStatus.IN_PROGRESS) ??
    weekStudies[weekStudies.length - 1] ??
    null;

  const dayStudies = currentWeekStudy
    ? await loadDayStudiesForWeek(currentWeekStudy)
    : [];

  return {
    learning_path: learningPath,
    selected_strategy_option: selectedOption,
    pending_strategy_options: pendingOptions,
    week_studies: weekStudies,
    current_cycle: currentWeekStudy
      ? {
        week_study: currentWeekStudy,
        day_studies: dayStudies,
      }
      : null,
  };
};

