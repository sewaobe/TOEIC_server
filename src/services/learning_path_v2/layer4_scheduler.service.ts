import type {
  BuildFullTestStrategyPlansInput,
  BuildInitialWeekPlanInput,
  BuildMiniTestNextWeekPlanSchedulerInput,
  FullTestStrategyPlansV2,
  PlannedWeekV2,
} from "../../types/learning_path_v2";

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

// Layer 4 plans study blocks only. It does not calculate ability, persist data, or write logs.
// Future scheduling must support splitting one LessonManager across days and continuing unfinished units.
export const buildInitialWeekPlan = async (
  input: BuildInitialWeekPlanInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("Layer 4 initial week scheduler");
};

export const buildFullTestStrategyPlans = async (
  input: BuildFullTestStrategyPlansInput
): Promise<FullTestStrategyPlansV2> => {
  void input;
  return notImplemented("Layer 4 full test strategy plan scheduler");
};

export const buildMiniTestNextWeekPlan = async (
  input: BuildMiniTestNextWeekPlanSchedulerInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("Layer 4 mini test next week scheduler");
};
