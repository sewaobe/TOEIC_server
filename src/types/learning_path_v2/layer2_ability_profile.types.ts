import { AbilityStatus, AbsoluteAbilityLevel, SchedulerTriggerType } from "../../models";
import type { NormalizedTestResultV2 } from "./layer1_test_result.types";

export interface PartAbilityV2 {
  part_type: number;
  ability?: number;
  estimated_score?: number;
  status: AbilityStatus;
  absolute_level?: AbsoluteAbilityLevel;
  confidence?: number;
}

export interface SkillAbilityV2 {
  part_type: number;
  tag: string;
  ability?: number;
  status: AbilityStatus;
  absolute_level?: AbsoluteAbilityLevel;
  confidence?: number;
}

export interface AbilityProfileV2 {
  trigger_type: SchedulerTriggerType;
  part_abilities: PartAbilityV2[];
  skill_abilities: SkillAbilityV2[];
  notes: string[];
}

export interface BuildInitialAbilityProfileInput {
  normalized_result: NormalizedTestResultV2;
}

export interface BuildFullTestAbilityProfileInput {
  normalized_result: NormalizedTestResultV2;
}

export interface UpdateMiniTestAbilitySignalInput {
  normalized_result: NormalizedTestResultV2;
  previous_profile?: AbilityProfileV2;
}
