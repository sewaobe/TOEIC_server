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

export type AbilityStatusV2 = "weak" | "medium" | "strong";

export interface SkillAbilityInputV2 {
  part_type: number;
  skill_key: string;
  ability: number;
  status?: AbilityStatusV2;
}

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
  unit_source?: "strategy" | "alternative";
  source_reason?: string;
}

export interface LearningPathStrategyRoadmapUnitV2 {
  lesson_manager_id: string;
  title: string;
  part_type: number;
  score_band?: { from?: number; to?: number };
  unit_type: LessonManagerRouteUnitTypeV2;
  node_role: LessonManagerRouteNodeRoleV2;
  target_tags: string[];
  order: number;
  planned_minutes: number;
  estimated_gain: number;
  reason: string;
  unit_source?: "strategy" | "alternative";
  source_reason?: string;
}

export interface LearningPathStrategyPartRoadmapV2 {
  part_type: number;
  cursor_index: number;
  target_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;
  units: LearningPathStrategyRoadmapUnitV2[];
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
  skill_abilities?: SkillAbilityInputV2[];
}

export interface BuildStrategyRoutePlanOutputV2 {
  strategy: LearningPathStrategyV2;
  scenario: LearningPathScenarioV2;
  estimated_total_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;
  focus_part_types: number[];
  focus_skill_keys: string[];
  part_roadmaps: LearningPathStrategyPartRoadmapV2[];
  summary_reasons: string[];
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

export interface BeamSearchCycleConfigV2 {
  beam_width: number;
  max_expansion_steps: number;
  max_focus_part_types: number;
  max_focus_skill_keys: number;
  max_non_focus_part_types: number;
  non_focus_part_penalty: number;
  non_focus_unit_penalty: number;
  min_learning_minutes: number;
  ideal_learning_minutes: number;
  max_learning_minutes: number;
  mini_test_estimated_minutes: number;
  full_test_estimated_minutes: number;
}

export interface BeamSearchCycleStateV2 {
  selected_roadmap_units: PlannedRouteUnitV2[];
  total_minutes: number;
  estimated_gain: number;
  focus_score: number;
  focus_unit_score: number;
  focus_part_coverage_score: number;
  focus_part_coverage_ratio: number;
  time_score: number;
  spread_penalty: number;
  score: number;
  part_types: number[];
  skill_keys: string[];
}

export interface BuildNextCycleByBeamSearchInputV2 {
  part_roadmaps: LearningPathStrategyPartRoadmapV2[];
  strategy: LearningPathStrategyV2;
  scenario: LearningPathScenarioV2;
  focus_part_types: number[];
  focus_skill_keys?: string[];
  mini_tests_completed_since_last_full_test: number;
  config?: Partial<BeamSearchCycleConfigV2>;
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
  assessment: CycleAssessmentV2;
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

export type RouteCompletedPlanV2 = {
  plan_type: "route_completed";
  selected_roadmap_units: [];
  assessment: null;
  reason: string;
};

export type NextCyclePlanV2 = LearningCyclePlanV2 | RouteCompletedPlanV2;

