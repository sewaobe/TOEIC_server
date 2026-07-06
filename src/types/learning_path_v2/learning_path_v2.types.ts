import { SchedulerStrategy, SchedulerTriggerType } from "../../models";
import type {
  LessonManagerNodeRole,
  LessonManagerUnitType,
} from "../../models/lesson_manager.model";
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
  debug_scenario_override?: "PLATEAU";
  active_strategy?: SchedulerStrategy;
  active_week_id?: LearningPathV2Id;
}

export interface LearningPathV2PlaceholderOutput {
  trigger_type: SchedulerTriggerType;
  warnings: string[];
}

export type LearningPathCycleAssessmentV2 =
  | {
      type: "mini_test";
      estimated_minutes: number;
      focus_skill_keys: string[];
      focus_part_types: number[];
    }
  | {
      type: "full_test";
      estimated_minutes: number;
    };

/**
 * Unit học đã được scheduler ROI chọn cho một cycle thật.
 * Tên type giữ hậu tố V2 để không phá contract cũ, nhưng nguồn chọn hiện tại
 * là Skill ROI engine chứ không còn là Layer4 route optimizer.
 */
export interface PlannedRouteUnitV2 {
  lesson_manager_id: string;
  title: string;
  part_type: number;
  score_band?: { from: number; to: number };
  unit_type: LessonManagerUnitType;
  node_role: LessonManagerNodeRole;
  target_tags: string[];
  order: number;
  planned_minutes: number;
  estimated_gain: number;
  reason: string;
  unit_source?: "strategy" | "alternative";
  source_reason?: string;
}

export type LearningCyclePlanV2 = {
  plan_type: "learning_cycle";
  selected_roadmap_units: PlannedRouteUnitV2[];
  selected_roadmap_positions: Array<{
    part_type: number;
    from_cursor_index: number;
    to_cursor_index: number;
    selected_count: number;
  }>;
  focus_skill_keys: string[];
  focus_part_types: number[];
  estimated_learning_minutes: number;
  assessment: LearningPathCycleAssessmentV2;
  beam_search_debug?: {
    selected_score: number;
    focus_score: number;
    focus_unit_score: number;
    focus_part_coverage_score: number;
    focus_part_coverage_ratio: number;
    time_score: number;
    spread_penalty: number;
    candidate_count: number;
    reason: string;
  };
};
