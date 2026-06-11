import { Types } from "mongoose";
import type { LearningCyclePlanV2 } from "../../types/learning_path_v2";
import { selectLearningPathFullTest } from "../../utils/full_test.util";
import { generateLearningPathMiniTest } from "../../utils/mini_test.util";

export type GenerateAssessmentTestFromPlanInput = {
  user_id: string;
  learning_path_id: string;
  cycle_no: number;
  assessment: LearningCyclePlanV2["assessment"];
  focus_skill_keys: string[];
  focus_part_types: number[];
};

export type GenerateAssessmentTestResult = {
  test_id: Types.ObjectId;
};

export const generateMiniTestFromPlan = async (
  input: GenerateAssessmentTestFromPlanInput
): Promise<{ test_id: Types.ObjectId }> => {
  const miniTest = await generateLearningPathMiniTest({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    cycle_no: input.cycle_no,
    focus_skill_keys: input.focus_skill_keys,
    focus_part_types: input.focus_part_types,
  });

  return { test_id: miniTest._id };
};

export const generateFullTestFromPlan = async (
  input: GenerateAssessmentTestFromPlanInput
): Promise<{ test_id: Types.ObjectId }> => {
  const fullTest = await selectLearningPathFullTest({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });

  return { test_id: fullTest._id };
};

export const generateAssessmentTestFromPlan = async (
  input: GenerateAssessmentTestFromPlanInput
): Promise<GenerateAssessmentTestResult> => {
  /*
   * assessment.type quyết định generate mini/full test. test_id được truyền
   * vào create DayStudy để assessment item có activity_id ngay từ đầu.
   * Hiện tại đây là placeholder generation, chưa tạo test thật.
   */
  const generated =
    input.assessment.type === "mini_test"
      ? await generateMiniTestFromPlan(input)
      : await generateFullTestFromPlan(input);

  return {
    test_id: generated.test_id,
  };
};
