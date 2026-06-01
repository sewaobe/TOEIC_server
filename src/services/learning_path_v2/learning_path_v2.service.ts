import type {
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
  FullTestStrategyPlansV2,
  PlannedWeekV2,
} from "../../types/learning_path_v2";

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

// One LearningPath is the user program container; new weeks are appended to the same LearningPath.
// This orchestrator will connect Layer 1-4, persistence, and read-only decision context later.
export const buildInitialLearningPathPlan = async (
  input: BuildInitialLearningPathPlanInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("LearningPath v2 initial generation pipeline");
};

// Full tests produce strategic path options; persistence of a selected path remains separate.
export const buildFullTestLearningPathPlan = async (
  input: BuildFullTestLearningPathPlanInput
): Promise<FullTestStrategyPlansV2> => {
  void input;
  return notImplemented("LearningPath v2 full test review pipeline");
};

// Mini tests adjust the next week using the selected main strategy/path context.
export const buildMiniTestNextWeekPlan = async (
  input: BuildMiniTestNextWeekPlanInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("LearningPath v2 mini test completion pipeline");
};
