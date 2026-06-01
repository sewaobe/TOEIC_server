import type {
  AbilityProfileV2,
  BuildFullTestAbilityProfileInput,
  BuildInitialAbilityProfileInput,
  UpdateMiniTestAbilitySignalInput,
} from "../../types/learning_path_v2";

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

// Layer 2 builds ability signals from normalized results. IRT integration belongs here later.
export const buildInitialAbilityProfile = async (
  input: BuildInitialAbilityProfileInput
): Promise<AbilityProfileV2> => {
  void input;
  return notImplemented("Layer 2 initial ability profile");
};

export const buildFullTestAbilityProfile = async (
  input: BuildFullTestAbilityProfileInput
): Promise<AbilityProfileV2> => {
  void input;
  return notImplemented("Layer 2 full test ability profile");
};

export const updateMiniTestAbilitySignal = async (
  input: UpdateMiniTestAbilitySignalInput
): Promise<AbilityProfileV2> => {
  void input;
  return notImplemented("Layer 2 mini test ability signal update");
};
