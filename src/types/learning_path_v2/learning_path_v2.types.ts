import { SchedulerStrategy, SchedulerTriggerType } from "../../models";

export type LearningPathV2Id = string;

export interface LearningPathV2BaseInput {
  user_id: LearningPathV2Id;
  learning_path_id?: LearningPathV2Id;
  target_score?: number;
  weekly_available_minutes?: number;
  requested_at?: Date;
}

export interface BuildInitialLearningPathPlanInput
  extends LearningPathV2BaseInput {
  trigger_type: "initial_generation";
  initial_assessment: Record<string, unknown>;
}

export interface BuildFullTestLearningPathPlanInput
  extends LearningPathV2BaseInput {
  trigger_type: "full_test_review";
  full_test_result: Record<string, unknown>;
}

export interface BuildMiniTestNextWeekPlanInput
  extends LearningPathV2BaseInput {
  trigger_type: "mini_test_completion";
  mini_test_result: Record<string, unknown>;
  active_strategy?: SchedulerStrategy;
  active_week_id?: LearningPathV2Id;
}

export interface LearningPathV2PlaceholderOutput {
  trigger_type: SchedulerTriggerType;
  warnings: string[];
}
