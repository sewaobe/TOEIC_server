import { SchedulerTriggerType } from "../../models";
import type {
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
} from "./learning_path_v2.types";

export interface NormalizedTestResultV2 {
  trigger_type: SchedulerTriggerType;
  user_id: string;
  raw_result_ref?: string;
  normalized_payload: Record<string, unknown>;
}

export type NormalizeInitialAssessmentInput =
  BuildInitialLearningPathPlanInput;

export type NormalizeFullTestResultInput = BuildFullTestLearningPathPlanInput;

export type NormalizeMiniTestResultInput = BuildMiniTestNextWeekPlanInput;
