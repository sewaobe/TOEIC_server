import { Types } from "mongoose";
import type { LearningCyclePlanV2 } from "../../types/learning_path_v2";

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
  void input;

  /*
   * Placeholder: sau này chọn question theo input.focus_skill_keys
   * và input.focus_part_types, hiện tại chưa generate test thật.
   */
  return { test_id: new Types.ObjectId() };
};

export const generateFullTestFromPlan = async (
  input: GenerateAssessmentTestFromPlanInput
): Promise<{ test_id: Types.ObjectId }> => {
  void input;

  /*
   * Placeholder: sau này generate full TOEIC test thật,
   * hiện tại chỉ tạo test_id giả để gắn vào DayStudy.
   */
  return { test_id: new Types.ObjectId() };
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
