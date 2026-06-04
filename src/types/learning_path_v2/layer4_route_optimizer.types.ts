import type { ToeicSkillGroupV2 } from "./layer1_test_result.types";
import type { LearningPathScenarioV2 } from "./layer3_strategy_decision.types";

export type LearningPathStrategyV2 =
  | "recommended"
  | "balanced"
  | "opportunity";

export type RoutePartBucketV2 = "weak" | "medium" | "strong";

export type RouteSkillGroupV2 = ToeicSkillGroupV2;

export type LessonManagerRouteUnitTypeV2 =
  | "foundation"
  | "skill_drill"
  | "mixed_practice"
  | "exam_practice"
  | "remedial";

export type LessonManagerRouteNodeRoleV2 =
  | "normal"
  | "support";

export interface LessonManagerRouteNodeV2 {
  id: string;
  title: string;
  part_type: number;
  score_band?: { from: number; to: number };
  unit_type: LessonManagerRouteUnitTypeV2;
  node_role: LessonManagerRouteNodeRoleV2;
  target_tags: string[];
  weight: number;
  planned_completion_time: number;
  next_unit_ids: string[];
  prerequisite_unit_ids: string[];
  auxiliary_unit_ids: string[];
  status?: string;
}

export interface PartAbilityInputV2 {
  part_type: number;
  ability: number;
}

export interface PartBudgetAllocationV2 {
  part_type: number;
  bucket: RoutePartBucketV2;
  target_minutes: number;
  ability: number;
}

export interface PlannedRouteUnitV2 {
  lesson_manager_id: string;
  title: string;
  part_type: number;
  score_band?: { from: number; to: number };
  unit_type: LessonManagerRouteUnitTypeV2;
  node_role: LessonManagerRouteNodeRoleV2;
  target_tags: string[];
  order: number;
  planned_minutes: number;
  estimated_gain: number;
  reason: string;
}

export interface OptimizedPartPathV2 {
  part_type: number;
  target_minutes: number;
  total_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;
  nodes: PlannedRouteUnitV2[];
}

export interface BuildStrategyRoutePlanInputV2 {
  strategy: LearningPathStrategyV2;
  scenario: LearningPathScenarioV2;
  target_score: number;
  total_available_minutes: number;
  part_abilities: PartAbilityInputV2[];
  lesson_manager_nodes: LessonManagerRouteNodeV2[];
  completed_unit_ids?: string[];
  start_unit_ids_by_part?: Record<number, string[]>;
}

export interface BuildStrategyRoutePlanOutputV2 {
  strategy: LearningPathStrategyV2;
  scenario: LearningPathScenarioV2;
  estimated_total_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;
  focus_part_types: number[];
  focus_skill_keys: string[];
  route_units: PlannedRouteUnitV2[];
  summary_reasons: string[];
  ability_highlights: object[];
}

export interface SkillGroupDistributionV2 {
  basic: number;
  core: number;
  advanced: number;
}

export type CycleAssessmentV2 =
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

export type LearningCyclePlanV2 = {
  plan_type: "learning_cycle";
  route_unit_start_index: number;
  route_unit_end_index: number;
  next_route_unit_index: number;
  route_units: PlannedRouteUnitV2[];
  focus_skill_keys: string[];
  focus_part_types: number[];
  estimated_learning_minutes: number;
  assessment: CycleAssessmentV2;
};

export type RouteCompletedPlanV2 = {
  plan_type: "route_completed";
  next_route_unit_index: number;
  route_units: [];
  assessment: null;
  reason: string;
};

export type NextCyclePlanV2 = LearningCyclePlanV2 | RouteCompletedPlanV2;

export type CycleCutConfigV2 = {
  min_cycle_minutes: number;
  ideal_cycle_minutes: number;
  max_cycle_minutes: number;
  close_score_threshold: number;
  mini_test_estimated_minutes: number;
  full_test_estimated_minutes: number;
};

export type BuildNextCyclePlanInputV2 = {
  route_units: PlannedRouteUnitV2[];
  next_route_unit_index: number;
  mini_tests_completed_since_last_full_test: number;
  config?: Partial<CycleCutConfigV2>;
};
