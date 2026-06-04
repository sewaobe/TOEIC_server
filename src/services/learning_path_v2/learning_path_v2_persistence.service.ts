import { SchedulerStrategy } from "../../models";
import type {
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
  FullTestStrategyPlansV2,
  PlannedWeekV2,
} from "../../types/learning_path_v2";

export interface PersistInitialLearningPathPlanInput {
  request: BuildInitialLearningPathPlanInput;
  planned_week: PlannedWeekV2;
}

export interface PersistSelectedFullTestPlanInput {
  request: BuildFullTestLearningPathPlanInput;
  strategy: SchedulerStrategy;
  strategy_plans: FullTestStrategyPlansV2;
}

export interface PersistMiniTestNextWeekPlanInput {
  request: BuildMiniTestNextWeekPlanInput;
  planned_week: PlannedWeekV2;
}

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

// Persistence converts planned blocks into LearningPath/WeekStudy/DayStudy later. No DB writes in this checkpoint.
export const persistInitialLearningPathPlan = async (
  input: PersistInitialLearningPathPlanInput
): Promise<never> => {
  void input;
  return notImplemented("LearningPath v2 initial plan persistence");
};

export const persistSelectedFullTestPlan = async (
  input: PersistSelectedFullTestPlanInput
): Promise<never> => {
  void input;
  return notImplemented("LearningPath v2 selected full test plan persistence");
};

export const persistMiniTestNextWeekPlan = async (
  input: PersistMiniTestNextWeekPlanInput
): Promise<never> => {
  void input;
  return notImplemented("LearningPath v2 mini test next week persistence");
};
