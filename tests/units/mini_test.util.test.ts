import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { TestStatus } from "../../src/models/enums/TestStatus";
import { TestType } from "../../src/models/enums/TestType";

const mockGroup: any = {
  find: jest.fn(),
  insertMany: jest.fn(),
  updateMany: jest.fn(),
};
const mockTest: any = {
  create: jest.fn(),
};
const mockUserSkill: any = {
  findOne: jest.fn(),
};
const mockNormalizeToeicSkillTags = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/models/group.model", () => ({
  Group: mockGroup,
}));

jest.mock("../../src/models/test.model", () => ({
  Test: mockTest,
}));

jest.mock("../../src/models/user_skill.model", () => ({
  UserSkill: mockUserSkill,
}));

jest.mock("../../src/utils/toeic_skill.util", () => ({
  normalizeToeicSkillTags: mockNormalizeToeicSkillTags,
}));

import { generateLearningPathMiniTest } from "../../src/utils/mini_test.util";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();

const createLeanQuery = (rows: unknown[]) => {
  const query: any = {
    select: jest.fn(),
    populate: jest.fn(),
    lean: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  query.lean.mockResolvedValue(rows);
  return query;
};

const createUserSkillLeanQuery = (value: unknown) => ({
  lean: (jest.fn() as any).mockResolvedValue(value),
});

const createQuestions = (count: number, tag: string, difficulty: number) =>
  Array.from({ length: count }, (_, index) => ({
    _id: new Types.ObjectId(),
    tags: [tag],
    irt_difficulty: difficulty + index * 0.001,
  }));

const createGroup = (
  part: number,
  count: number,
  tag: string,
  difficulty: number
) => ({
  _id: new Types.ObjectId(),
  part,
  audioUrl: new Types.ObjectId(),
  imagesUrl: [],
  transcriptEnglish: "",
  transcriptTranslation: "",
  questions: createQuestions(count, tag, difficulty),
});

const groupsByPart = new Map<number, any[]>();

const setupGroups = () => {
  groupsByPart.clear();
  groupsByPart.set(1, [
    createGroup(1, 28, "focus_p1", -1.8),
    createGroup(1, 8, "weak_p1", -1.7),
    createGroup(1, 4, "strong_p1", -1.6),
  ]);
  groupsByPart.set(2, [
    createGroup(2, 25, "focus_p2", 0),
    createGroup(2, 7, "weak_p2", 0.1),
    createGroup(2, 3, "strong_p2", 0.2),
  ]);
  groupsByPart.set(3, [
    createGroup(3, 17, "focus_p3", 1.4),
    createGroup(3, 5, "weak_p3", 1.5),
    createGroup(3, 3, "strong_p3", 1.6),
  ]);
};

const createUserSkillSnapshot = () => ({
  parts: [
    {
      part_type: 1,
      ability: 0.2,
      skills: [
        { skill_key: "focus_p1", status: "weak" },
        { skill_key: "weak_p1", status: "weak" },
        { skill_key: "strong_p1", status: "strong" },
      ],
    },
    {
      part_type: 2,
      ability: 0.5,
      skills: [
        { skill_key: "focus_p2", status: "weak" },
        { skill_key: "weak_p2", status: "weak" },
        { skill_key: "strong_p2", status: "strong" },
      ],
    },
    {
      part_type: 3,
      ability: 0.8,
      skills: [
        { skill_key: "focus_p3", status: "weak" },
        { skill_key: "weak_p3", status: "weak" },
        { skill_key: "strong_p3", status: "strong" },
      ],
    },
  ],
});

describe("mini_test.util", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGroups();
    mockUserSkill.findOne.mockReturnValue(
      createUserSkillLeanQuery(createUserSkillSnapshot())
    );
    mockGroup.find.mockImplementation((query: any) =>
      createLeanQuery(groupsByPart.get(query.part) ?? [])
    );
    mockNormalizeToeicSkillTags.mockImplementation((tags: string[]) =>
      tags.map((tag) => ({ key: tag }))
    );
    mockGroup.insertMany.mockImplementation((docs: any[]) =>
      Promise.resolve(
        docs.map((doc) => ({
          _id: new Types.ObjectId(),
          ...doc,
        }))
      )
    );
    mockTest.create.mockImplementation((payload: any) =>
      Promise.resolve({ _id: new Types.ObjectId(), ...payload })
    );
    mockGroup.updateMany.mockResolvedValue({ modifiedCount: 9 });
  });

  it("generateLearningPathMiniTest -> creates APPROVED mini test from 3 focus parts with about 20 questions per part", async () => {
    const result = await generateLearningPathMiniTest({
      user_id: userId,
      learning_path_id: learningPathId,
      cycle_no: 2,
      focus_part_types: [1, 2, 3],
      focus_skill_keys: ["focus_p1", "focus_p2", "focus_p3"],
    });

    expect(mockUserSkill.findOne).toHaveBeenCalledWith({
      user_id: new Types.ObjectId(userId),
      context_type: "learning_path",
      learning_path_id: new Types.ObjectId(learningPathId),
    });
    expect(mockGroup.find).toHaveBeenCalledWith({ part: 1 });
    expect(mockGroup.find).toHaveBeenCalledWith({ part: 2 });
    expect(mockGroup.find).toHaveBeenCalledWith({ part: 3 });
    expect(mockGroup.insertMany).toHaveBeenCalledTimes(1);
    const clonedDocs = mockGroup.insertMany.mock.calls[0][0];
    expect(clonedDocs.length).toBeGreaterThanOrEqual(3);
    const totalQuestions = clonedDocs.reduce(
      (sum: number, doc: any) => sum + (doc.questions?.length ?? 0),
      0
    );
    expect(totalQuestions).toBeGreaterThanOrEqual(60);
    expect(totalQuestions).toBeLessThanOrEqual(90);
    expect(mockTest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Learning Path Mini Test - Cycle 2",
        type: TestType.MINI_TEST,
        status: TestStatus.APPROVED,
        topic: "LearningPath v2 mini test 70/20/10",
        created_by: new Types.ObjectId(userId),
      })
    );
    expect(mockGroup.updateMany).toHaveBeenCalledWith(
      { _id: { $in: mockTest.create.mock.calls[0][0].groups } },
      { $set: { test_id: result._id } }
    );
  });

  it("generateLearningPathMiniTest -> supports 2 rolling focus parts", async () => {
    const result = await generateLearningPathMiniTest({
      user_id: userId,
      learning_path_id: learningPathId,
      cycle_no: 1,
      focus_part_types: [1, 2],
      focus_skill_keys: ["focus_p1"],
    });

    expect(result.status).toBe(TestStatus.APPROVED);
    const clonedDocs = mockGroup.insertMany.mock.calls[0][0];
    const totalQuestions = clonedDocs.reduce(
      (sum: number, doc: any) => sum + (doc.questions?.length ?? 0),
      0
    );
    expect(totalQuestions).toBeGreaterThanOrEqual(40);
    expect(totalQuestions).toBeLessThanOrEqual(70);
    expect(mockGroup.find).toHaveBeenCalledWith({ part: 1 });
    expect(mockGroup.find).toHaveBeenCalledWith({ part: 2 });
    expect(mockGroup.find).not.toHaveBeenCalledWith({ part: 3 });
  });
});
