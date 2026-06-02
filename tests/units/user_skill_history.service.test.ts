import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUserSkillHistory: any = {
  create: jest.fn(),
  find: jest.fn(),
};

jest.mock("../../src/models/user_skill_history.model", () => ({
  UserSkillHistory: mockUserSkillHistory,
}));

import {
  createUserSkillHistory,
  getRecentUserSkillHistories,
} from "../../src/services/user_skill_history.service";
import type { AbilityProfileV2 } from "../../src/types/learning_path_v2/layer2_ability_profile.types";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();
const sourceUserTestId = new Types.ObjectId().toString();
const sourceTestId = new Types.ObjectId().toString();
const submittedAt = new Date("2026-06-01T10:00:00.000Z");

const abilityProfile: AbilityProfileV2 = {
  trigger_type: "initial_generation",
  source_test_result_id: sourceUserTestId,
  part_abilities: [
    {
      part_type: 1,
      ability: 0.8,
      status: "strong",
      absolute_level: "high",
      item_count: 10,
      correct_count: 8,
    },
  ],
  skill_abilities: [
    {
      skill_key: "part1_photos",
      part_type: 1,
      skill_group: "core",
      ability: 0.7,
      status: "strong",
      absolute_level: "medium",
      item_count: 5,
      correct_count: 4,
    },
  ],
  notes: [],
  warnings: [],
};

const createFindChain = (items: any[] = []) => {
  const chain: any = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: (jest.fn() as any).mockResolvedValue(items),
  };

  return chain;
};

describe("learning_path_v2 user skill history service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createUserSkillHistory -> ability profile with parts and skills -> creates history document", async () => {
    // Chuẩn bị
    const createdHistory = { _id: new Types.ObjectId() };
    mockUserSkillHistory.create.mockResolvedValue(createdHistory);

    // Thực thi
    const result = await createUserSkillHistory({
      user_id: userId,
      context_type: "learning_path",
      learning_path_id: learningPathId,
      source_user_test_id: sourceUserTestId,
      source_test_id: sourceTestId,
      trigger_type: "initial_generation",
      ability_profile: abilityProfile,
      submitted_at: submittedAt,
    });

    // Kiểm tra
    expect(result).toBe(createdHistory);
    expect(mockUserSkillHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        context_type: "learning_path",
        trigger_type: "initial_generation",
        submitted_at: submittedAt,
        parts: [
          expect.objectContaining({
            part_type: 1,
            ability: 0.8,
            item_count: 10,
            correct_count: 8,
          }),
        ],
        skills: [
          expect.objectContaining({
            skill_key: "part1_photos",
            part_type: 1,
            skill_group: "core",
            ability: 0.7,
          }),
        ],
      })
    );
  });

  it("createUserSkillHistory -> learning_path context -> stores learning_path_id", async () => {
    // Chuẩn bị
    mockUserSkillHistory.create.mockResolvedValue({ _id: new Types.ObjectId() });

    // Thực thi
    await createUserSkillHistory({
      user_id: userId,
      context_type: "learning_path",
      learning_path_id: learningPathId,
      trigger_type: "initial_generation",
      ability_profile: abilityProfile,
    });

    // Kiểm tra
    expect(mockUserSkillHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_path_id: learningPathId,
      })
    );
  });

  it("getRecentUserSkillHistories -> no limit provided -> uses default limit 5", async () => {
    // Chuẩn bị
    const chain = createFindChain();
    mockUserSkillHistory.find.mockReturnValue(chain);

    // Thực thi
    await getRecentUserSkillHistories({
      user_id: userId,
      context_type: "learning_path",
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it("getRecentUserSkillHistories -> learning_path_id missing -> queries learning_path_id null", async () => {
    // Chuẩn bị
    const chain = createFindChain();
    mockUserSkillHistory.find.mockReturnValue(chain);

    // Thực thi
    await getRecentUserSkillHistories({
      user_id: userId,
      context_type: "learning_path",
    });

    // Kiểm tra
    expect(mockUserSkillHistory.find).toHaveBeenCalledWith({
      user_id: userId,
      context_type: "learning_path",
      learning_path_id: null,
    });
  });

  it("getRecentUserSkillHistories -> query result -> sorts by submitted_at and created_at descending", async () => {
    // Chuẩn bị
    const histories = [{ _id: new Types.ObjectId() }];
    const chain = createFindChain(histories);
    mockUserSkillHistory.find.mockReturnValue(chain);

    // Thực thi
    const result = await getRecentUserSkillHistories({
      user_id: userId,
      context_type: "learning_path",
      learning_path_id: learningPathId,
      limit: 3,
    });

    // Kiểm tra
    expect(result).toBe(histories);
    expect(chain.sort).toHaveBeenCalledWith({
      submitted_at: -1,
      created_at: -1,
    });
  });
});
