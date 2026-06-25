import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { TestStatus } from "../../src/models/enums/TestStatus";
import { TestType } from "../../src/models/enums/TestType";

const mockTest: any = {
  find: jest.fn(),
};
const mockUserSkill: any = {
  findOne: jest.fn(),
};
const mockUserTest: any = {
  aggregate: jest.fn(),
};

jest.mock("../../src/models/group.model", () => ({
  Group: {},
}));

jest.mock("../../src/models/test.model", () => ({
  Test: mockTest,
}));

jest.mock("../../src/models/user_skill.model", () => ({
  UserSkill: mockUserSkill,
}));

jest.mock("../../src/models/user_test.model", () => ({
  UserTest: mockUserTest,
}));

import { selectLearningPathFullTest } from "../../src/utils/full_test.util";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();

const createLeanQuery = (rows: unknown[]) => {
  const query: any = {
    populate: jest.fn(),
    lean: jest.fn(),
  };
  query.populate.mockReturnValue(query);
  query.lean.mockResolvedValue(rows);
  return query;
};

const createUserSkillLeanQuery = (value: unknown) => ({
  lean: (jest.fn() as any).mockResolvedValue(value),
});

const createQuestions = (count: number, difficulty: number) =>
  Array.from({ length: count }, () => ({
    _id: new Types.ObjectId(),
    irt_difficulty: difficulty,
  }));

const createFullTest = (id: Types.ObjectId, difficultyByPart: Record<number, number>) => ({
  _id: id,
  type: TestType.FULL_TEST,
  status: TestStatus.OPEN,
  groups: [1, 2, 3, 4, 5, 6, 7].map((part) => ({
    _id: new Types.ObjectId(),
    part,
    questions: createQuestions(5, difficultyByPart[part] ?? 0),
  })),
});

const createUserSkillSnapshot = () => ({
  parts: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
    part_type: partType,
    ability: 0.5,
  })),
});

describe("full_test.util", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSkill.findOne.mockReturnValue(
      createUserSkillLeanQuery(createUserSkillSnapshot())
    );
  });

  it("selectLearningPathFullTest -> prefers tests with the lowest attempt count before fit score", async () => {
    const repeatedBetterFitTestId = new Types.ObjectId();
    const freshWorseFitTestId = new Types.ObjectId();
    const repeatedBetterFitTest = createFullTest(repeatedBetterFitTestId, {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
    });
    const freshWorseFitTest = createFullTest(freshWorseFitTestId, {
      1: 2,
      2: 2,
      3: 2,
      4: 2,
      5: 2,
      6: 2,
      7: 2,
    });
    mockTest.find.mockReturnValue(
      createLeanQuery([repeatedBetterFitTest, freshWorseFitTest])
    );
    mockUserTest.aggregate.mockResolvedValue([
      { _id: repeatedBetterFitTestId, count: 1 },
    ]);

    const result = await selectLearningPathFullTest({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    expect(mockTest.find).toHaveBeenCalledWith({
      type: TestType.FULL_TEST,
      status: TestStatus.OPEN,
    });
    expect(mockUserSkill.findOne).toHaveBeenCalledWith({
      user_id: new Types.ObjectId(userId),
      context_type: "learning_path",
      learning_path_id: new Types.ObjectId(learningPathId),
    });
    expect(result._id).toBe(freshWorseFitTestId);
  });

  it("selectLearningPathFullTest -> when all tests are in the same round, chooses best part-level fit", async () => {
    const betterFitTestId = new Types.ObjectId();
    const worseFitTestId = new Types.ObjectId();
    const betterFitTest = createFullTest(betterFitTestId, {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
    });
    const worseFitTest = createFullTest(worseFitTestId, {
      1: -2,
      2: -2,
      3: -2,
      4: -2,
      5: -2,
      6: -2,
      7: -2,
    });
    mockTest.find.mockReturnValue(createLeanQuery([worseFitTest, betterFitTest]));
    mockUserTest.aggregate.mockResolvedValue([
      { _id: betterFitTestId, count: 1 },
      { _id: worseFitTestId, count: 1 },
    ]);

    const result = await selectLearningPathFullTest({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    expect(result._id).toBe(betterFitTestId);
  });
});
