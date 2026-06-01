import { SchedulerScenario, SchedulerStrategy } from "../../models";
import type { AbilityProfileV2 } from "./layer2_ability_profile.types";
import type {
  MiniTestScenarioDecisionV2,
  StrategyDecisionContextV2,
} from "./layer3_strategy_decision.types";

export type DayOfWeekV2 = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlannedStudyBlockSource =
  | "new_unit"
  | "continued_unit"
  | "review"
  | "mini_test";

export interface PlannedStudyBlockBase {
  activity_type: string;
  activity_id: string;
  estimated_minutes: number;
  order: number;
  is_required: boolean;
}

export interface PlannedLessonManagerStudyBlock
  extends PlannedStudyBlockBase {
  source: "new_unit" | "continued_unit";
  lesson_manager_id: string;
}

export interface PlannedAuxiliaryStudyBlock extends PlannedStudyBlockBase {
  source: "review" | "mini_test";
  lesson_manager_id?: string;
}

export type PlannedStudyBlock =
  | PlannedLessonManagerStudyBlock
  | PlannedAuxiliaryStudyBlock;

export interface PlannedLessonManagerUnit {
  lesson_manager_id: string;
  strategy?: SchedulerStrategy;
  scenario?: SchedulerScenario;
  estimated_minutes?: number;
  reasons: string[];
  warnings: string[];
}

export interface PlannedDayV2 {
  dayOfWeek: DayOfWeekV2;
  daily_available_minutes: number;
  planned_minutes: number;
  blocks: PlannedStudyBlock[];
}

export interface PlannedWeekV2 {
  planned_days: PlannedDayV2[];
  selected_units: PlannedLessonManagerUnit[];
  total_planned_minutes: number;
  reasons: string[];
  warnings: string[];
}

export interface BuildInitialWeekPlanInput {
  ability_profile: AbilityProfileV2;
  strategy_context: StrategyDecisionContextV2;
}

export interface BuildFullTestStrategyPlansInput {
  ability_profile: AbilityProfileV2;
  strategy_context: StrategyDecisionContextV2;
}

export interface FullTestStrategyPlansV2 {
  plans: Array<{
    strategy: SchedulerStrategy;
    planned_week: PlannedWeekV2;
  }>;
  reasons: string[];
  warnings: string[];
}

export interface BuildMiniTestNextWeekPlanSchedulerInput {
  ability_profile: AbilityProfileV2;
  scenario_decision: MiniTestScenarioDecisionV2;
}
