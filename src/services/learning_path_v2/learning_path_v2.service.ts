import type {
  AbilityProfileV2,
  BuildStrategyRoutePlanOutputV2,
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
  FullTestStrategyPlansV2,
  LearningPathScenarioV2,
  LearningPathStrategyV2,
  LessonManagerRouteNodeV2,
  LearningScenarioDecisionV2,
  NormalizedTestResultV2,
  PartAbilityInputV2,
  PlannedWeekV2,
  RawUserTestLikeInput,
} from "../../types/learning_path_v2";
import { Types } from "mongoose";
import { LearningPath, LearningPathStrategyOption, LessonManager } from "../../models";
import type { IUserTest } from "../../models";
import type { ILearningPath } from "../../models/learning_path.model";
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
import { createLearningPathUserTestService } from "../user_test.service";
import { createUserSkillHistory } from "../user_skill_history.service";
import {
  getUserSkillSnapshot,
  updateUserSkillFromHistory,
} from "../user_skill.service";
import { createNextLearningPathCycle } from "../week_study.service";
import { evaluateLearningPathScenario } from "./layer3_strategy_decision.service";
import { buildStrategyRoutePlan } from "./layer4_route_optimizer.service";

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

const PART_TYPES = [1, 2, 3, 4, 5, 6, 7];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

const getRawResultFromPipelineInput = (
  input: LearningPathV2AbilityPipelineInput
): RawUserTestLikeInput => {
  switch (input.trigger_type) {
    case "initial_generation":
      return input.initial_assessment;
    case "full_test_review":
      return input.full_test_result;
    case "mini_test_completion":
      return input.mini_test_result;
    default:
      return notImplemented("Unknown LearningPath v2 trigger");
  }
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
  route_units: input.plan.route_units.map((unit) => ({
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
  summary_reasons: input.plan.summary_reasons,
  ability_highlights: input.plan.ability_highlights.map((highlight) => ({
    ...highlight,
    reason: "Snapshot năng lực tại thời điểm tạo route.",
  })),
  next_route_unit_index: 0,
  selected_at: input.status === "selected" ? new Date() : undefined,
});

const buildRoutePlanForStrategy = async (input: {
  learningPath: ILearningPath;
  userSkill: IUserSkill;
  strategy: LearningPathStrategyV2;
  scenario: LearningPathScenarioV2;
  now: Date;
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
  const lessonManagerNodes = await loadLessonManagerRouteNodes();

  return buildStrategyRoutePlan({
    strategy: input.strategy,
    scenario: input.scenario,
    target_score: input.learningPath.target_score ?? 0,
    total_available_minutes: totalAvailableMinutes,
    part_abilities: partAbilities,
    lesson_manager_nodes: lessonManagerNodes,
  });
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

/**
 * Pipeline chạy Layer 1/2/3 rồi nối sang Layer 4 theo trigger.
 * - initial_generation: tạo selected recommended option và cycle đầu tiên.
 * - full_test_review: tạo 3 pending options để user chọn.
 * - mini_test_completion: tiếp tục selected route và tạo cycle kế tiếp.
 * Checkpoint này chưa tạo DayStudy và chưa generate mini/full test thật.
 */
export const runLearningPathV2AbilityPipeline = async (
  input: LearningPathV2AbilityPipelineInput
): Promise<LearningPathV2AbilityPipelineOutput> => {
  const rawResult = getRawResultFromPipelineInput(input);

  // Layer 1 chuẩn hóa test result thô thành dữ liệu answer-level để các layer sau dùng chung.
  const normalizedResult = await normalizeTestResult({
    trigger_type: input.trigger_type,
    user_id: input.user_id,
    test_id: typeof rawResult.test_id === "string" ? rawResult.test_id : undefined,
    raw_result: rawResult,
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

  // UserTest lưu bài test đã submit trong LearningPath v2, không phải ability snapshot.
  const userTest = await createLearningPathUserTestService({
    user_id: input.user_id,
    test_id: normalizedResult.test_id,
    normalized_result: normalizedResult,
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

  return {
    normalized_result: normalizedResult,
    user_test: userTest,
    ability_profile: abilityProfile,
    user_skill_history: userSkillHistory,
    user_skill: userSkill,
    scenario_decision: scenarioDecision,
    layer4_result: layer4Result,
  };
};

// Future full planning function. runLearningPathV2AbilityPipeline is the current implemented pipeline up to ability/user skill.
export const buildInitialLearningPathPlan = async (
  input: BuildInitialLearningPathPlanInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("LearningPath v2 initial generation pipeline");
};

// Future full planning function for strategy options; persistence of a selected path remains separate.
export const buildFullTestLearningPathPlan = async (
  input: BuildFullTestLearningPathPlanInput
): Promise<FullTestStrategyPlansV2> => {
  void input;
  return notImplemented("LearningPath v2 full test review pipeline");
};

// Future full planning function for mini-test adjustment. Ability snapshot is already handled by runLearningPathV2AbilityPipeline.
export const buildMiniTestNextWeekPlan = async (
  input: BuildMiniTestNextWeekPlanInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("LearningPath v2 mini test completion pipeline");
};
