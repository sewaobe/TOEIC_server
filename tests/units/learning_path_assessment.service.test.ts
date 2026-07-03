import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGenerateLearningPathMiniTest = jest.fn<(...args: any[]) => any>();
const mockSelectLearningPathFullTest = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/utils/mini_test.util", () => ({
  generateLearningPathMiniTest: mockGenerateLearningPathMiniTest,
}));

jest.mock("../../src/utils/full_test.util", () => ({
  selectLearningPathFullTest: mockSelectLearningPathFullTest,
}));

import {
  generateAssessmentTestFromPlan,
  generateFullTestFromPlan,
  generateMiniTestFromPlan,
} from "../../src/services/learning_path_v2/learning_path_assessment.service";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();

const createInput = (assessmentType: "mini_test" | "full_test") =>
  ({
    user_id: userId,
    learning_path_id: learningPathId,
    cycle_no: 4,
    assessment:
      assessmentType === "mini_test"
        ? {
            type: "mini_test",
            estimated_minutes: 100,
            focus_part_types: [1, 2, 3],
            focus_skill_keys: ["part1_people_photo"],
          }
        : {
            type: "full_test",
            estimated_minutes: 200,
          },
    focus_part_types: [1, 2, 3],
    focus_skill_keys: ["part1_people_photo"],
  } as any);

describe("learning_path_assessment.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generateMiniTestFromPlan -> delegates to LearningPath mini test generator", async () => {
    const testId = new Types.ObjectId();
    mockGenerateLearningPathMiniTest.mockResolvedValue({ _id: testId });

    const result = await generateMiniTestFromPlan(createInput("mini_test"));

    expect(mockGenerateLearningPathMiniTest).toHaveBeenCalledWith({
      user_id: userId,
      learning_path_id: learningPathId,
      cycle_no: 4,
      focus_part_types: [1, 2, 3],
      focus_skill_keys: ["part1_people_photo"],
    });
    expect(result).toEqual({ test_id: testId });
  });

  it("generateFullTestFromPlan -> delegates to full test selector", async () => {
    const testId = new Types.ObjectId();
    mockSelectLearningPathFullTest.mockResolvedValue({ _id: testId });

    const result = await generateFullTestFromPlan(createInput("full_test"));

    expect(mockSelectLearningPathFullTest).toHaveBeenCalledWith({
      user_id: userId,
      learning_path_id: learningPathId,
    });
    expect(result).toEqual({ test_id: testId });
  });

  it("generateAssessmentTestFromPlan -> uses mini generator for mini_test assessment", async () => {
    const testId = new Types.ObjectId();
    mockGenerateLearningPathMiniTest.mockResolvedValue({ _id: testId });

    const result = await generateAssessmentTestFromPlan(createInput("mini_test"));

    expect(result.test_id).toBe(testId);
    expect(mockGenerateLearningPathMiniTest).toHaveBeenCalledTimes(1);
    expect(mockSelectLearningPathFullTest).not.toHaveBeenCalled();
  });

  it("generateAssessmentTestFromPlan -> uses full selector for full_test assessment", async () => {
    const testId = new Types.ObjectId();
    mockSelectLearningPathFullTest.mockResolvedValue({ _id: testId });

    const result = await generateAssessmentTestFromPlan(createInput("full_test"));

    expect(result.test_id).toBe(testId);
    expect(mockSelectLearningPathFullTest).toHaveBeenCalledTimes(1);
    expect(mockGenerateLearningPathMiniTest).not.toHaveBeenCalled();
  });
});
