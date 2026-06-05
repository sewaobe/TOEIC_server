import { Types } from "mongoose";
import {
  ILearningPathStrategyOption,
  LearningPathScenarioSnapshot,
  LearningPathStrategyOption,
  LearningPathStrategyOptionStatus,
  LearningPathStrategyOptionTrigger,
  LearningPathStrategyType,
} from "../models/learning_path_strategy_option.model";
import type {
  LessonManagerNodeRole,
  LessonManagerUnitType,
} from "../models/lesson_manager.model";
import { createNextLearningPathCycle } from "./week_study.service";

type StrategyAbilityStatus = "weak" | "medium" | "strong";
type StrategyAbilityTrend = "improving" | "stable" | "declining";

export type RouteUnitOptionInput = {
  lesson_manager_id: string;
  title: string;
  part_type: number;
  score_band?: { from: number; to: number };
  unit_type: LessonManagerUnitType;
  node_role: LessonManagerNodeRole;
  target_tags: string[];
  order: number;
  planned_minutes: number;
  estimated_gain?: number;
  reason?: string;
};

export type StrategyAbilityHighlightInput = {
  part_type?: number;
  skill_key?: string;
  label_vi?: string;
  ability?: number;
  status?: StrategyAbilityStatus;
  trend?: StrategyAbilityTrend;
  reason: string;
};

export type CreateStrategyOptionPayload = {
  user_id: string;
  learning_path_id: string;
  trigger_type: LearningPathStrategyOptionTrigger;
  source_user_test_id?: string | null;
  source_week_study_id?: string | null;
  strategy: LearningPathStrategyType;
  scenario: LearningPathScenarioSnapshot;
  status?: LearningPathStrategyOptionStatus;
  title: string;
  description?: string;
  focus_part_types: number[];
  focus_skill_keys: string[];
  estimated_total_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;
  route_units: RouteUnitOptionInput[];
  summary_reasons: string[];
  ability_highlights: StrategyAbilityHighlightInput[];
  selected_at?: Date;
};

export type CreateInitialRecommendedOptionInput = Omit<
  CreateStrategyOptionPayload,
  "trigger_type" | "strategy" | "scenario" | "status"
>;

type FullTestStrategyOptionPayload = Omit<
  CreateStrategyOptionPayload,
  | "user_id"
  | "learning_path_id"
  | "trigger_type"
  | "source_user_test_id"
  | "source_week_study_id"
  | "status"
> & {
  scenario?: LearningPathScenarioSnapshot;
};

export type CreateFullTestStrategyOptionsInput = {
  user_id: string;
  learning_path_id: string;
  source_user_test_id: string;
  source_week_study_id?: string | null;
  options: FullTestStrategyOptionPayload[];
};

type GetPendingStrategyOptionsInput = {
  learning_path_id: string;
  source_user_test_id?: string;
};

type SelectLearningPathStrategyOptionInput = {
  user_id?: string;
  learning_path_id: string;
  strategy_option_id?: string;
  option_id?: string;
  now?: Date;
};

type SelectLearningPathStrategyOptionResult = {
  selected_strategy_option: ILearningPathStrategyOption;
  dismissed_strategy_options_count: number;
  expired_previous_selected_count: number;
  cycle_result: Awaited<ReturnType<typeof createNextLearningPathCycle>>;
  status?: string;
};

type GetActiveLearningPathStrategyOptionInput = {
  learning_path_id: string;
};

type ExpirePendingStrategyOptionsInput = {
  learning_path_id: string;
  source_user_test_id?: string;
};

const STRATEGY_ORDER: LearningPathStrategyType[] = [
  "recommended",
  "balanced",
  "opportunity",
];

const toObjectId = (value: string, fieldName: string): Types.ObjectId => {
  assertObjectId(value, fieldName);
  return new Types.ObjectId(value);
};

const optionalObjectId = (
  value: string | null | undefined,
  fieldName: string
): Types.ObjectId | null => {
  if (value === undefined || value === null) return null;
  return toObjectId(value, fieldName);
};

export const assertObjectId = (value: string, fieldName: string): void => {
  if (!Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} không phải ObjectId hợp lệ.`);
  }
};

export const normalizeRouteUnits = (routeUnits: RouteUnitOptionInput[]) => {
  if (!Array.isArray(routeUnits)) {
    throw new Error("route_units phải là danh sách unit hợp lệ.");
  }

  return routeUnits.map((unit, index) => {
    const order = Number(unit.order);
    const plannedMinutes = Number(unit.planned_minutes);

    if (!Number.isFinite(order)) {
      throw new Error(`route_units[${index}].order phải là số hợp lệ.`);
    }
    if (!Number.isFinite(plannedMinutes) || plannedMinutes < 0) {
      throw new Error(
        `route_units[${index}].planned_minutes phải là số không âm.`
      );
    }

    return {
      ...unit,
      lesson_manager_id: toObjectId(
        unit.lesson_manager_id,
        `route_units[${index}].lesson_manager_id`
      ),
      order,
      planned_minutes: plannedMinutes,
      target_tags: Array.isArray(unit.target_tags) ? unit.target_tags : [],
    };
  });
};

export const sortOptionsByStrategy = <T extends { strategy: LearningPathStrategyType }>(
  options: T[]
): T[] =>
  [...options].sort(
    (left, right) =>
      STRATEGY_ORDER.indexOf(left.strategy) - STRATEGY_ORDER.indexOf(right.strategy)
  );

export const validateThreeStrategies = (
  options: Array<{ strategy: LearningPathStrategyType }>
): void => {
  if (options.length !== 3) {
    throw new Error("FULLTEST_MONTHLY phải có đúng 3 strategy option.");
  }

  const strategies = options.map((option) => option.strategy);
  const uniqueStrategies = new Set(strategies);
  if (uniqueStrategies.size !== strategies.length) {
    throw new Error("Danh sách strategy option không được trùng strategy.");
  }

  const hasAllStrategies = STRATEGY_ORDER.every((strategy) =>
    uniqueStrategies.has(strategy)
  );
  if (!hasAllStrategies) {
    throw new Error(
      "FULLTEST_MONTHLY phải gồm đủ recommended, balanced và opportunity."
    );
  }
};

const getModifiedCount = (result: unknown): number => {
  if (typeof result === "object" && result !== null && "modifiedCount" in result) {
    const modifiedCount = (result as { modifiedCount?: unknown }).modifiedCount;
    return typeof modifiedCount === "number" ? modifiedCount : 0;
  }
  if (typeof result === "object" && result !== null && "nModified" in result) {
    const nModified = (result as { nModified?: unknown }).nModified;
    return typeof nModified === "number" ? nModified : 0;
  }
  return 0;
};

const buildCreatePayload = (
  input: CreateStrategyOptionPayload,
  overrides: {
    trigger_type: LearningPathStrategyOptionTrigger;
    strategy: LearningPathStrategyType;
    scenario: LearningPathScenarioSnapshot;
    status: LearningPathStrategyOptionStatus;
    selected_at?: Date;
  }
) => ({
  user_id: toObjectId(input.user_id, "user_id"),
  learning_path_id: toObjectId(input.learning_path_id, "learning_path_id"),
  trigger_type: overrides.trigger_type,
  source_user_test_id: optionalObjectId(
    input.source_user_test_id,
    "source_user_test_id"
  ),
  source_week_study_id: optionalObjectId(
    input.source_week_study_id,
    "source_week_study_id"
  ),
  strategy: overrides.strategy,
  scenario: overrides.scenario,
  status: overrides.status,
  title: input.title,
  description: input.description ?? "",
  focus_part_types: input.focus_part_types ?? [],
  focus_skill_keys: input.focus_skill_keys ?? [],
  estimated_total_minutes: input.estimated_total_minutes,
  estimated_gain: input.estimated_gain,
  reaches_target: input.reaches_target,
  route_units: normalizeRouteUnits(input.route_units ?? []),
  summary_reasons: input.summary_reasons ?? [],
  ability_highlights: input.ability_highlights ?? [],
  selected_at: overrides.selected_at,
});

/**
 * StrategyOption lưu snapshot route để user xem/chọn, không phải WeekStudy/DayStudy đã được tạo.
 * Service này chưa chạy graph optimizer; nó chỉ lưu kết quả optimizer truyền vào.
 */
export const createInitialRecommendedOption = async (
  input: CreateInitialRecommendedOptionInput
): Promise<ILearningPathStrategyOption> => {
  const learningPathId = toObjectId(input.learning_path_id, "learning_path_id");
  const selectedAt = input.selected_at ?? new Date();

  /**
   * ONBOARDING chỉ tạo recommended và auto selected vì entry test không có màn hình
   * so sánh 3 lộ trình. Trước khi chọn option mới, selected option cũ phải chuyển expired
   * để không đụng unique partial index một selected option trên mỗi LearningPath.
   */
  await LearningPathStrategyOption.updateMany(
    { learning_path_id: learningPathId, status: "selected" },
    { $set: { status: "expired" } }
  );

  return LearningPathStrategyOption.create(
    buildCreatePayload(
      {
        ...input,
        trigger_type: "initial_generation",
        strategy: "recommended",
        scenario: "ONBOARDING",
      },
      {
        trigger_type: "initial_generation",
        strategy: "recommended",
        scenario: "ONBOARDING",
        status: "selected",
        selected_at: selectedAt,
      }
    )
  );
};

export const createFullTestStrategyOptions = async (
  input: CreateFullTestStrategyOptionsInput
): Promise<ILearningPathStrategyOption[]> => {
  const learningPathId = toObjectId(input.learning_path_id, "learning_path_id");
  validateThreeStrategies(input.options);

  const userId = toObjectId(input.user_id, "user_id");

  /**
   * FULLTEST_MONTHLY tạo batch route mới sau full test.
   * Route selected cũ không còn active nữa, còn pending cũ là batch lỗi thời.
   * Vì vậy cả selected/pending cũ đều chuyển expired trước khi tạo 3 option mới.
   */
  await LearningPathStrategyOption.updateMany(
    {
      user_id: userId,
      learning_path_id: learningPathId,
      status: { $in: ["selected", "pending_selection"] },
    },
    { $set: { status: "expired" } }
  );
  
  const createPayloads = sortOptionsByStrategy(input.options).map((option) =>
    buildCreatePayload(
      {
        ...option,
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        trigger_type: "full_test_review",
        source_user_test_id: input.source_user_test_id,
        source_week_study_id: input.source_week_study_id,
        scenario: option.scenario ?? "FULLTEST_MONTHLY",
      },
      {
        trigger_type: "full_test_review",
        strategy: option.strategy,
        scenario: option.scenario ?? "FULLTEST_MONTHLY",
        status: "pending_selection",
      }
    )
  );

  const createdOptions = await LearningPathStrategyOption.create(createPayloads);
  return sortOptionsByStrategy(createdOptions);
};

export const getPendingStrategyOptions = async (
  input: GetPendingStrategyOptionsInput
): Promise<ILearningPathStrategyOption[]> => {
  const query: Record<string, unknown> = {
    learning_path_id: toObjectId(input.learning_path_id, "learning_path_id"),
    status: "pending_selection",
  };
  if (input.source_user_test_id) {
    query.source_user_test_id = toObjectId(
      input.source_user_test_id,
      "source_user_test_id"
    );
  }

  const options = await LearningPathStrategyOption.find(query).sort({
    created_at: -1,
  });
  return sortOptionsByStrategy(options);
};

export const selectLearningPathStrategyOption = async (
  input: SelectLearningPathStrategyOptionInput
): Promise<SelectLearningPathStrategyOptionResult> => {
  const now = input.now ?? new Date();
  const learningPathId = toObjectId(input.learning_path_id, "learning_path_id");
  if (!input.user_id) {
    throw new Error("user_id là bắt buộc khi chọn strategy option.");
  }
  const strategyOptionId = input.strategy_option_id ?? input.option_id;
  if (!strategyOptionId) {
    throw new Error("strategy_option_id là bắt buộc khi chọn strategy option.");
  }
  const userId = toObjectId(input.user_id, "user_id");
  const optionId = toObjectId(strategyOptionId, "strategy_option_id");

  const option = await LearningPathStrategyOption.findOne({
    _id: optionId,
    user_id: userId,
    learning_path_id: learningPathId,
    status: "pending_selection",
  });
  if (!option) {
    throw new Error("Không tìm thấy strategy option pending để chọn.");
  }
  if (option.trigger_type !== "full_test_review") {
    throw new Error("Chỉ strategy option sau full test mới cần user chọn.");
  }
  if (option.status !== "pending_selection") {
    throw new Error("Chỉ có thể chọn option đang pending_selection.");
  }

  /**
   * Khi chọn option mới, selected option cũ phải được chuyển expired trước rồi mới set
   * option mới thành selected. Mini test dùng selected option gần nhất để đi tiếp active
   * main path, còn sibling pending cùng source test được dismissed vì user đã chọn xong.
   */
  /*
   * expired = route cũ không còn active sau khi user chọn route mới.
   * MongoDB standalone hiện chưa dùng transaction; service ghi tuần tự và tầng gọi
   * API sẽ cần guard active cycle nếu expose endpoint sau này.
   */
  const expiredResult = await LearningPathStrategyOption.updateMany(
    {
      user_id: userId,
      learning_path_id: learningPathId,
      status: "selected",
      _id: { $ne: option._id },
    },
    { $set: { status: "expired" } }
  );

  /*
   * selected = option user chọn để tiếp tục active route.
   * Service này không tạo DayStudy và không generate test thật.
   */
  option.status = "selected";
  option.selected_at = now;
  option.next_route_unit_index = option.next_route_unit_index ?? 0;
  await option.save();

  /*
   * dismissed = option cùng batch full test nhưng user không chọn.
   */
  const dismissedResult = await LearningPathStrategyOption.updateMany(
    {
      user_id: userId,
      learning_path_id: learningPathId,
      status: "pending_selection",
      trigger_type: option.trigger_type,
      source_user_test_id: option.source_user_test_id,
      _id: { $ne: option._id },
    },
    { $set: { status: "dismissed" } }
  );

  /*
   * createNextLearningPathCycle chỉ chạy sau khi target option đã selected.
   */
  const cycleResult = await createNextLearningPathCycle({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    now,
  });

  return {
    selected_strategy_option: option,
    dismissed_strategy_options_count: getModifiedCount(dismissedResult),
    expired_previous_selected_count: getModifiedCount(expiredResult),
    cycle_result: cycleResult,
  };
};

export const getActiveLearningPathStrategyOption = async (
  input: GetActiveLearningPathStrategyOptionInput
): Promise<ILearningPathStrategyOption | null> => {
  /**
   * Route units là snapshot của LessonManager tại thời điểm scheduler tạo option.
   * Mini test đọc selected option gần nhất để tiếp tục route chính, không tự dựng lại graph.
   */
  return LearningPathStrategyOption.findOne({
    learning_path_id: toObjectId(input.learning_path_id, "learning_path_id"),
    status: "selected",
  }).sort({ selected_at: -1, created_at: -1 });
};

export const expirePendingStrategyOptions = async (
  input: ExpirePendingStrategyOptionsInput
): Promise<number> => {
  const query: Record<string, unknown> = {
    learning_path_id: toObjectId(input.learning_path_id, "learning_path_id"),
    status: "pending_selection",
  };
  if (input.source_user_test_id) {
    query.source_user_test_id = toObjectId(
      input.source_user_test_id,
      "source_user_test_id"
    );
  }

  const result = await LearningPathStrategyOption.updateMany(query, {
    $set: { status: "expired" },
  });
  return getModifiedCount(result);
};
