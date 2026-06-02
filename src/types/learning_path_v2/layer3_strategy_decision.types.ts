import type { IUserSkill } from "../../models/user_skill.model";
import type { LearningPathV2Layer1TriggerType } from "./layer1_test_result.types";

export type LearningPathScenarioV2 =
  | "ONBOARDING"
  | "NORMAL_PROGRESS"
  | "PLATEAU"
  | "BEHIND_SCHEDULE"
  | "PRE_DEADLINE"
  | "FULLTEST_MONTHLY";

export type LearningPaceStatusV2 = "ahead" | "on_track" | "late";

export interface EvaluateLearningPathScenarioInput {
  trigger_type: LearningPathV2Layer1TriggerType;
  user_id: string;
  learning_path_id: string;
  learning_path_created_at: Date;
  target_completion_date: Date;
  old_user_skill?: IUserSkill | null;
  new_user_skill?: IUserSkill | null;
  week_study_id?: string;
  source_user_test_id?: string;
  actual_submit_at?: Date;
}

export interface LearningScenarioDecisionV2 {
  trigger_type: LearningPathV2Layer1TriggerType;
  scenario: LearningPathScenarioV2;
  pre_deadline: boolean;
  pace_status?: LearningPaceStatusV2;
  delay_days?: number;
  focus_delta?: number;
  comparable_focus_skill_count?: number;
  newly_measured_focus_skill_count?: number;
  focus_skill_keys?: string[];
  focus_part_types?: number[];
}
