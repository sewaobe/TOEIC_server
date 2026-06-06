import { SchedulerStrategy, SchedulerTriggerType } from "../../models";
import type { IUserTest } from "../../models/user_test.model";
import type { RawUserTestLikeInput } from "./layer1_test_result.types";

export type LearningPathV2Id = string;

export interface LearningPathV2BaseInput {
  user_id: LearningPathV2Id;
  learning_path_id: LearningPathV2Id;
  source_user_test: IUserTest;
  raw_result: RawUserTestLikeInput;
  learning_path_created_at: Date;
  target_completion_date: Date;
  week_study_id?: LearningPathV2Id;
  target_score?: number;
  weekly_available_minutes?: number;
  requested_at?: Date;
}

export interface BuildInitialLearningPathPlanInput
  extends LearningPathV2BaseInput {
  trigger_type: "initial_generation";
}

export interface BuildFullTestLearningPathPlanInput
  extends LearningPathV2BaseInput {
  trigger_type: "full_test_review";
}

export interface BuildMiniTestNextWeekPlanInput
  extends LearningPathV2BaseInput {
  trigger_type: "mini_test_completion";
  week_study_id: LearningPathV2Id;
  active_strategy?: SchedulerStrategy;
  active_week_id?: LearningPathV2Id;
}

export interface LearningPathV2PlaceholderOutput {
  trigger_type: SchedulerTriggerType;
  warnings: string[];
}
