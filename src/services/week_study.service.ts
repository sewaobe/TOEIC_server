import { Types } from "mongoose";
import { WeekStudy } from "../models";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import type {
  IWeekStudy,
  LearningCycleMode,
} from "../models/week_study.model";

const calculateExpectedCompletionAt = (input: {
  now: Date;
  estimated_learning_minutes: number;
  assessment_estimated_minutes: number;
  time_per_day?: number;
}): Date => {
  const totalMinutes =
    input.estimated_learning_minutes + input.assessment_estimated_minutes;
  const estimatedDays =
    input.time_per_day && input.time_per_day > 0
      ? Math.max(1, Math.ceil(totalMinutes / input.time_per_day))
      : Math.max(1, Math.ceil(totalMinutes / 60));

  return new Date(input.now.getTime() + estimatedDays * 24 * 60 * 60 * 1000);
};

const buildSkillRoiCycleDescription = (input: {
  cycle_no: number;
  cycle_mode: LearningCycleMode;
  primary_focus_skill_key: string;
  remediation_attempt?: 1 | 2;
  remediation_limit_reached: boolean;
  excluded_skill_key?: string;
}): string => {
  if (input.cycle_mode === "remediation") {
    return `Cycle ${input.cycle_no}: remediation ${input.primary_focus_skill_key} lần ${input.remediation_attempt}/2`;
  }

  if (input.remediation_limit_reached) {
    return `Cycle ${input.cycle_no}: chuyển từ ${input.excluded_skill_key} sang ${input.primary_focus_skill_key}`;
  }

  return `Cycle ${input.cycle_no}: tập trung ${input.primary_focus_skill_key}`;
};

export const createSkillRoiWeekStudy = async (input: {
  cycle_no: number;
  now: Date;
  time_per_day?: number;
  estimated_learning_minutes: number;
  assessment_estimated_minutes: number;
  primary_focus_skill_key: string;
  covered_skill_keys: string[];
  focus_part_type: number;
  cycle_mode: LearningCycleMode;
  remediation_attempt?: 1 | 2;
  remediation_limit_reached: boolean;
  excluded_skill_key?: string;
  expected_skill_gain: number;
  expected_roi_per_hour: number;
  learning_path_strategy_option_id?: Types.ObjectId | null;
  assessment_type: "mini_test" | "full_test";
}): Promise<IWeekStudy> => {
  /*
   * WeekStudy service chỉ chịu trách nhiệm persist cycle-level state.
   * Quyết định chọn skill/package vẫn thuộc Skill ROI scheduler.
   */
  return WeekStudy.create({
    no: input.cycle_no,
    description: buildSkillRoiCycleDescription({
      cycle_no: input.cycle_no,
      cycle_mode: input.cycle_mode,
      primary_focus_skill_key: input.primary_focus_skill_key,
      remediation_attempt: input.remediation_attempt,
      remediation_limit_reached: input.remediation_limit_reached,
      excluded_skill_key: input.excluded_skill_key,
    }),
    status: WeekStudyStatus.IN_PROGRESS,
    accuracy_overall: 0,
    days: [],
    expected_completion_at: calculateExpectedCompletionAt({
      now: input.now,
      estimated_learning_minutes: input.estimated_learning_minutes,
      assessment_estimated_minutes: input.assessment_estimated_minutes,
      time_per_day: input.time_per_day,
    }),
    primary_focus_skill_key: input.primary_focus_skill_key,
    covered_skill_keys: input.covered_skill_keys,
    focus_part_type: input.focus_part_type,
    cycle_mode: input.cycle_mode,
    expected_skill_gain: input.expected_skill_gain,
    expected_roi_per_hour: input.expected_roi_per_hour,
    learning_path_strategy_option_id:
      input.learning_path_strategy_option_id ?? null,
    assessment_type: input.assessment_type,
    assessment_estimated_minutes: input.assessment_estimated_minutes,
  });
};