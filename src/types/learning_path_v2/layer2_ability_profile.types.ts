import type { AbilityStatus } from "../../models";
import type { UserSkillAbsoluteAbilityLevel } from "../user_skill.type";

/** Alias công khai để Layer 2 không phụ thuộc vào SchedulerDecisionLog. */
export type AbsoluteAbilityLevel = UserSkillAbsoluteAbilityLevel;
import type {
  NormalizedTestResultV2,
  ToeicSkillGroupV2,
} from "./layer1_test_result.types";

export interface PartAbilityV2 {
  part_type: number;
  ability: number;
  status: AbilityStatus;
  absolute_level: AbsoluteAbilityLevel;
  item_count: number;
  correct_count: number;
}

export interface SkillAbilityV2 {
  skill_key: string;
  part_type?: number;
  skill_group?: ToeicSkillGroupV2;
  ability: number;
  status: AbilityStatus;
  absolute_level: AbsoluteAbilityLevel;
  item_count: number;
  correct_count: number;
}

export interface AbilityProfileV2 {
  trigger_type: NormalizedTestResultV2["trigger_type"];
  source_test_result_id?: string;
  part_abilities: PartAbilityV2[];
  skill_abilities: SkillAbilityV2[];
  notes: string[];
  warnings: string[];
}

export interface BuildAbilityProfileInput {
  normalized_result: NormalizedTestResultV2;
}
