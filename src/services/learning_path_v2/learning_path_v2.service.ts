import type {
  AbilityProfileV2,
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
  FullTestStrategyPlansV2,
  NormalizedTestResultV2,
  PlannedWeekV2,
  RawUserTestLikeInput,
} from "../../types/learning_path_v2";
import type { IUserTest } from "../../models";
import type { IUserSkill } from "../../models/user_skill.model";
import type { IUserSkillHistory } from "../../models/user_skill_history.model";
import { normalizeTestResult } from "./layer1_test_result.service";
import { buildAbilityProfile } from "./layer2_ability_profile.service";
import { createLearningPathUserTestService } from "../user_test.service";
import { createUserSkillHistory } from "../user_skill_history.service";
import { updateUserSkillFromHistory } from "../user_skill.service";

export type LearningPathV2AbilityPipelineInput =
  | BuildInitialLearningPathPlanInput
  | BuildFullTestLearningPathPlanInput
  | BuildMiniTestNextWeekPlanInput;

export interface LearningPathV2AbilityPipelineOutput {
  normalized_result: NormalizedTestResultV2;
  user_test: IUserTest;
  ability_profile: AbilityProfileV2;
  user_skill_history: IUserSkillHistory;
  user_skill: IUserSkill;
}

const notImplemented = (methodName: string): never => {
  throw new Error(
    `Not implemented: ${methodName} will be added in a later LearningPath v2 checkpoint`
  );
};

const getRawResultFromPipelineInput = (
  input: LearningPathV2AbilityPipelineInput
): RawUserTestLikeInput => {
  switch (input.trigger_type) {
    case "initial_generation":
      return input.initial_assessment;
    case "full_test_review":
      return input.full_test_result;
    case "mini_test_completion":
      return input.mini_test_result;
    default:
      return notImplemented("Unknown LearningPath v2 trigger");
  }
};

/**
 * Pipeline hiện tại chỉ chạy đến ability/user skill.
 * Layer 1 chuẩn hóa kết quả test, Layer 2 tính ability từ question-level answers,
 * UserSkillHistory lưu ability signal từng lần submit và UserSkill là snapshot tổng hợp bằng EWMA + trend slope.
 * Pipeline này chưa tạo scenario và chưa schedule tuần mới.
 */
export const runLearningPathV2AbilityPipeline = async (
  input: LearningPathV2AbilityPipelineInput
): Promise<LearningPathV2AbilityPipelineOutput> => {
  const rawResult = getRawResultFromPipelineInput(input);

  const normalizedResult = await normalizeTestResult({
    trigger_type: input.trigger_type,
    user_id: input.user_id,
    test_id: typeof rawResult.test_id === "string" ? rawResult.test_id : undefined,
    raw_result: rawResult,
  });

  const abilityProfile = await buildAbilityProfile({
    normalized_result: normalizedResult,
  });

  const userTest = await createLearningPathUserTestService({
    user_id: input.user_id,
    test_id: normalizedResult.test_id,
    normalized_result: normalizedResult,
  });

  const userSkillHistory = await createUserSkillHistory({
    user_id: input.user_id,
    context_type: "learning_path",
    learning_path_id: input.learning_path_id ?? null,
    source_user_test_id: String(userTest._id),
    source_test_id: normalizedResult.test_id,
    trigger_type: normalizedResult.trigger_type,
    ability_profile: abilityProfile,
    submitted_at: normalizedResult.submitted_at,
  });

  const userSkill = await updateUserSkillFromHistory(userSkillHistory);

  return {
    normalized_result: normalizedResult,
    user_test: userTest,
    ability_profile: abilityProfile,
    user_skill_history: userSkillHistory,
    user_skill: userSkill,
  };
};

// Future full planning function. runLearningPathV2AbilityPipeline is the current implemented pipeline up to ability/user skill.
export const buildInitialLearningPathPlan = async (
  input: BuildInitialLearningPathPlanInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("LearningPath v2 initial generation pipeline");
};

// Future full planning function for strategy options; persistence of a selected path remains separate.
export const buildFullTestLearningPathPlan = async (
  input: BuildFullTestLearningPathPlanInput
): Promise<FullTestStrategyPlansV2> => {
  void input;
  return notImplemented("LearningPath v2 full test review pipeline");
};

// Future full planning function for mini-test adjustment. Ability snapshot is already handled by runLearningPathV2AbilityPipeline.
export const buildMiniTestNextWeekPlan = async (
  input: BuildMiniTestNextWeekPlanInput
): Promise<PlannedWeekV2> => {
  void input;
  return notImplemented("LearningPath v2 mini test completion pipeline");
};
