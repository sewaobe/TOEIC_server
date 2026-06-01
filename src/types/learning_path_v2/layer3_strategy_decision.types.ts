import { SchedulerScenario, SchedulerStrategy } from "../../models";
import type { AbilityProfileV2 } from "./layer2_ability_profile.types";

export interface StrategyOptionV2 {
  strategy: SchedulerStrategy;
  title: string;
  reasons: string[];
  warnings: string[];
}

export interface StrategyDecisionContextV2 {
  options: StrategyOptionV2[];
  reasons: string[];
  warnings: string[];
}

export interface MiniTestScenarioDecisionV2 {
  scenario: SchedulerScenario;
  active_strategy?: SchedulerStrategy;
  reasons: string[];
  warnings: string[];
}

export interface DecideInitialStrategyOptionsInput {
  ability_profile: AbilityProfileV2;
}

export interface DecideFullTestStrategyOptionsInput {
  ability_profile: AbilityProfileV2;
}

export interface DecideMiniTestScenarioInput {
  ability_profile: AbilityProfileV2;
  active_strategy?: SchedulerStrategy;
}
