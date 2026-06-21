import { Types } from "mongoose";
import { selectLearningPathFullTest } from "../../utils/full_test.util";
import { generateLearningPathMiniTest } from "../../utils/mini_test.util";

export type LearningPathAssessmentPlanV3 = {
  type: "mini_test" | "full_test";
  estimated_minutes: number;
};

export type GenerateAssessmentTestFromPlanInput = {
  user_id: string;
  learning_path_id: string;
  cycle_no: number;
  assessment: LearningPathAssessmentPlanV3;
  primary_focus_skill_key: string;
  covered_skill_keys: string[];
  focus_part_type: number;
};

export type GenerateAssessmentTestResult = {
  test_id: Types.ObjectId;
};

export const generateMiniTestFromPlan = async (
  input: GenerateAssessmentTestFromPlanInput
): Promise<GenerateAssessmentTestResult> => {
  const miniTest = await generateLearningPathMiniTest({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    cycle_no: input.cycle_no,
    primary_focus_skill_key: input.primary_focus_skill_key,
    covered_skill_keys: input.covered_skill_keys,
    focus_part_type: input.focus_part_type,
  });

  return { test_id: miniTest._id };
};

export const generateFullTestFromPlan = async (
  input: GenerateAssessmentTestFromPlanInput
): Promise<GenerateAssessmentTestResult> => {
  const fullTest = await selectLearningPathFullTest({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });

  return { test_id: fullTest._id };
};

export const generateAssessmentTestFromPlan = async (
  input: GenerateAssessmentTestFromPlanInput
): Promise<GenerateAssessmentTestResult> => {
  // Mini test dùng primary/covered skills của cycle hiện tại.
  // Full test chỉ cần context LearningPath để đo lại toàn bộ 7 Part.
  return input.assessment.type === "mini_test"
    ? generateMiniTestFromPlan(input)
    : generateFullTestFromPlan(input);
};
