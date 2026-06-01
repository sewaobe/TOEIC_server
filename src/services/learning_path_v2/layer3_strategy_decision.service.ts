import type {
  DecideFullTestStrategyOptionsInput,
  DecideInitialStrategyOptionsInput,
  DecideMiniTestScenarioInput,
  MiniTestScenarioDecisionV2,
  StrategyDecisionContextV2,
} from "../../types/learning_path_v2";

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

// Layer 3 frames strategy/scenario decisions. It does not create WeekStudy or DayStudy plans.
export const decideInitialStrategyOptions = async (
  input: DecideInitialStrategyOptionsInput
): Promise<StrategyDecisionContextV2> => {
  void input;
  return notImplemented("Layer 3 initial strategy options");
};

export const decideFullTestStrategyOptions = async (
  input: DecideFullTestStrategyOptionsInput
): Promise<StrategyDecisionContextV2> => {
  void input;
  return notImplemented("Layer 3 full test strategy options");
};

export const decideMiniTestScenario = async (
  input: DecideMiniTestScenarioInput
): Promise<MiniTestScenarioDecisionV2> => {
  void input;
  return notImplemented("Layer 3 mini test scenario decision");
};
