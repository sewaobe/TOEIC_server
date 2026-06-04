import { Types } from "mongoose";
import { WeekStudy } from "../../models/week_study.model";
import type { IUserSkill } from "../../models/user_skill.model";
import type {
  EvaluateLearningPathScenarioInput,
  LearningPaceStatusV2,
  LearningScenarioDecisionV2,
} from "../../types/learning_path_v2";

export interface PaceStatusResult {
  pace_status: LearningPaceStatusV2;
  delay_days: number;
}

export interface FocusSkillDeltaResult {
  focus_delta?: number;
  comparable_focus_skill_count: number;
  newly_measured_focus_skill_count: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const FOCUS_DELTA_PROGRESS_THRESHOLD = 0.03;

const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const assertValidDate = (value: Date, fieldName: string): void => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`Layer 3 cần ${fieldName} hợp lệ.`);
  }
};

const findSkillAbility = (
  userSkill: IUserSkill | null | undefined,
  skillKey: string
): number | undefined => {
  for (const part of userSkill?.parts ?? []) {
    const skill = part.skills?.find((item) => item.skill_key === skillKey);
    if (skill) {
      return skill.ability;
    }
  }

  return undefined;
};

const getWeekStudyForScenario = async (weekStudyId: string) => {
  if (!Types.ObjectId.isValid(weekStudyId)) {
    throw new Error("Layer 3 cần week_study_id hợp lệ.");
  }

  const weekStudy = await WeekStudy.findById(weekStudyId)
    .select("expected_completion_at focus_skill_keys focus_part_types")
    .lean();

  if (!weekStudy) {
    throw new Error("Không tìm thấy WeekStudy để đánh giá Layer 3.");
  }

  return weekStudy;
};

/**
 * BEHIND_SCHEDULE dựa trên pace late so với WeekStudy.expected_completion_at.
 * Chỉ so theo ngày lịch để tránh user submit trễ vài giờ trong cùng ngày bị xem là late.
 */
export const calculatePaceStatus = (
  expectedCompletionAt: Date,
  actualSubmitAt: Date
): PaceStatusResult => {
  assertValidDate(expectedCompletionAt, "WeekStudy.expected_completion_at");
  assertValidDate(actualSubmitAt, "actual_submit_at");

  const expectedDay = startOfLocalDay(expectedCompletionAt);
  const actualDay = startOfLocalDay(actualSubmitAt);
  const delayDays = Math.round(
    (actualDay.getTime() - expectedDay.getTime()) / DAY_IN_MS
  );

  if (delayDays < 0) {
    return { pace_status: "ahead", delay_days: delayDays };
  }

  if (delayDays > 0) {
    return { pace_status: "late", delay_days: delayDays };
  }

  return { pace_status: "on_track", delay_days: 0 };
};

/**
 * PRE_DEADLINE ưu tiên cao vì gần hạn thì chiến thuật học phải đổi sang review/mixed/test practice.
 * Ngưỡng gần hạn là max(14 ngày, 20% tổng thời lượng learning path).
 */
export const isPreDeadline = (
  learningPathCreatedAt: Date,
  targetCompletionDate: Date,
  now: Date = new Date()
): boolean => {
  assertValidDate(learningPathCreatedAt, "learning_path_created_at");
  assertValidDate(targetCompletionDate, "target_completion_date");
  assertValidDate(now, "now");

  const totalDays =
    (startOfLocalDay(targetCompletionDate).getTime() -
      startOfLocalDay(learningPathCreatedAt).getTime()) /
    DAY_IN_MS;

  // totalDays <= 0 là dữ liệu LearningPath không hợp lệ: deadline phải sau ngày tạo.
  if (totalDays <= 0) {
    throw new Error("LearningPath target_completion_date phải sau learning_path_created_at.");
  }

  const remainingDays =
    (startOfLocalDay(targetCompletionDate).getTime() -
      startOfLocalDay(now).getTime()) /
    DAY_IN_MS;
  const thresholdDays = Math.max(14, totalDays * 0.2);

  return remainingDays <= thresholdDays;
};

/**
 * Mini test không nhìn toàn bộ UserSkill, chỉ nhìn focus_skill_keys của WeekCycle.
 * Thiếu skill trong old UserSkill không lỗi vì có thể là skill mới chưa có baseline.
 * Thiếu skill trong new UserSkill là lỗi dữ liệu vì cycle focus skill đó nhưng sau submit không có signal mới.
 */
export const calculateFocusSkillDelta = (
  oldUserSkill: IUserSkill | null | undefined,
  newUserSkill: IUserSkill | null | undefined,
  focusSkillKeys: string[]
): FocusSkillDeltaResult => {
  if (!newUserSkill) {
    throw new Error("Layer 3 cần new_user_skill để đánh giá mini test.");
  }

  const comparableOldAbilities: number[] = [];
  const comparableNewAbilities: number[] = [];
  let newlyMeasuredFocusSkillCount = 0;

  for (const skillKey of focusSkillKeys) {
    const newAbility = findSkillAbility(newUserSkill, skillKey);
    if (newAbility === undefined) {
      throw new Error(
        `Layer 3 thiếu skill "${skillKey}" trong new_user_skill sau mini test.`
      );
    }

    const oldAbility = findSkillAbility(oldUserSkill, skillKey);
    if (oldAbility === undefined) {
      newlyMeasuredFocusSkillCount += 1;
      continue;
    }

    comparableOldAbilities.push(oldAbility);
    comparableNewAbilities.push(newAbility);
  }

  const comparableFocusSkillCount = comparableOldAbilities.length;
  if (comparableFocusSkillCount === 0) {
    return {
      focus_delta: undefined,
      comparable_focus_skill_count: 0,
      newly_measured_focus_skill_count: newlyMeasuredFocusSkillCount,
    };
  }

  const oldAverage =
    comparableOldAbilities.reduce((sum, ability) => sum + ability, 0) /
    comparableFocusSkillCount;
  const newAverage =
    comparableNewAbilities.reduce((sum, ability) => sum + ability, 0) /
    comparableFocusSkillCount;

  return {
    focus_delta: newAverage - oldAverage,
    comparable_focus_skill_count: comparableFocusSkillCount,
    newly_measured_focus_skill_count: newlyMeasuredFocusSkillCount,
  };
};

/**
 * Layer 3 quyết scenario, không chọn bài học và không tạo schedule.
 * Output không có notes/warnings/reasons; thiếu dữ liệu bắt buộc thì throw rõ ràng để orchestrator xử lý.
 */
export const evaluateLearningPathScenario = async (
  input: EvaluateLearningPathScenarioInput
): Promise<LearningScenarioDecisionV2> => {
  // Entry test luôn là ONBOARDING vì nó chỉ khởi tạo route đầu tiên, chưa cần pace hay focus delta.
  if (input.trigger_type === "initial_generation") {
    return {
      trigger_type: input.trigger_type,
      scenario: "ONBOARDING",
      pre_deadline: false,
      pace_status: "on_track",
      delay_days: 0,
    };
  }

  const preDeadline = isPreDeadline(
    input.learning_path_created_at,
    input.target_completion_date
  );
  if (preDeadline) {
    return {
      trigger_type: input.trigger_type,
      scenario: "PRE_DEADLINE",
      pre_deadline: true,
    };
  }

  let paceResult: PaceStatusResult | undefined;
  let weekStudy:
    | {
        expected_completion_at?: Date;
        focus_skill_keys?: string[];
        focus_part_types?: number[];
      }
    | null
    | undefined;

  if (input.week_study_id && input.actual_submit_at) {
    weekStudy = await getWeekStudyForScenario(input.week_study_id);
    if (!weekStudy.expected_completion_at) {
      throw new Error("WeekStudy.expected_completion_at là bắt buộc để tính pace.");
    }

    paceResult = calculatePaceStatus(
      weekStudy.expected_completion_at,
      input.actual_submit_at
    );

    if (paceResult.pace_status === "late") {
      return {
        trigger_type: input.trigger_type,
        scenario: "BEHIND_SCHEDULE",
        pre_deadline: false,
        ...paceResult,
        focus_skill_keys: weekStudy.focus_skill_keys ?? [],
        focus_part_types: weekStudy.focus_part_types ?? [],
      };
    }
  }

  if (input.trigger_type === "full_test_review") {
    return {
      trigger_type: input.trigger_type,
      scenario: "FULLTEST_MONTHLY",
      pre_deadline: false,
      ...paceResult,
    };
  }

  if (!input.week_study_id) {
    throw new Error("Layer 3 cần week_study_id cho mini_test_completion.");
  }
  if (!input.actual_submit_at) {
    throw new Error("Layer 3 cần actual_submit_at cho mini_test_completion.");
  }
  if (!input.new_user_skill) {
    throw new Error("Layer 3 cần new_user_skill cho mini_test_completion.");
  }

  weekStudy = weekStudy ?? (await getWeekStudyForScenario(input.week_study_id));
  if (!weekStudy.expected_completion_at) {
    throw new Error("WeekStudy.expected_completion_at là bắt buộc để tính pace.");
  }

  paceResult =
    paceResult ??
    calculatePaceStatus(weekStudy.expected_completion_at, input.actual_submit_at);
  if (paceResult.pace_status === "late") {
    return {
      trigger_type: input.trigger_type,
      scenario: "BEHIND_SCHEDULE",
      pre_deadline: false,
      ...paceResult,
      focus_skill_keys: weekStudy.focus_skill_keys ?? [],
      focus_part_types: weekStudy.focus_part_types ?? [],
    };
  }

  const focusSkillKeys = weekStudy.focus_skill_keys ?? [];
  if (focusSkillKeys.length === 0) {
    throw new Error("WeekStudy.focus_skill_keys là bắt buộc để đánh giá mini test.");
  }

  // focus_delta dùng average ability cũ/mới của các focus skill có đủ baseline.
  const focusDelta = calculateFocusSkillDelta(
    input.old_user_skill,
    input.new_user_skill,
    focusSkillKeys
  );
  const hasComparableBaseline = focusDelta.comparable_focus_skill_count > 0;
  const isProgressing =
    !hasComparableBaseline ||
    (focusDelta.focus_delta ?? 0) >= FOCUS_DELTA_PROGRESS_THRESHOLD;

  return {
    trigger_type: input.trigger_type,
    scenario: isProgressing ? "NORMAL_PROGRESS" : "PLATEAU",
    pre_deadline: false,
    ...paceResult,
    ...focusDelta,
    focus_skill_keys: focusSkillKeys,
    focus_part_types: weekStudy.focus_part_types ?? [],
  };
};
