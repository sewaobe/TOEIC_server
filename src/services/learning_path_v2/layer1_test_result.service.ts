import type {
  NormalizeFullTestResultInput,
  NormalizeInitialAssessmentInput,
  NormalizeMiniTestResultInput,
  NormalizedTestResultV2,
} from "../../types/learning_path_v2";

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

// Layer 1 normalizes assessment payloads only. It does not calculate ability or call the scheduler.
export const normalizeInitialAssessment = async (
  input: NormalizeInitialAssessmentInput
): Promise<NormalizedTestResultV2> => {
  void input;
  return notImplemented("Layer 1 initial assessment normalization");
};

export const normalizeFullTestResult = async (
  input: NormalizeFullTestResultInput
): Promise<NormalizedTestResultV2> => {
  void input;
  return notImplemented("Layer 1 full test result normalization");
};

export const normalizeMiniTestResult = async (
  input: NormalizeMiniTestResultInput
): Promise<NormalizedTestResultV2> => {
  void input;
  return notImplemented("Layer 1 mini test result normalization");
};
