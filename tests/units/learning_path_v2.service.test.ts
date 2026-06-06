import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLearningPath: any = {
  findOne: jest.fn(),
};

const mockLearningPathStrategyOption: any = {
  create: jest.fn(),
  updateMany: jest.fn(),
};

const mockLessonManager: any = {
  find: jest.fn(),
};

jest.mock("../../src/models", () => ({
  LearningPath: mockLearningPath,
  LearningPathStrategyOption: mockLearningPathStrategyOption,
  LessonManager: mockLessonManager,
}));

const mockNormalizeTestResult = jest.fn<(...args: any[]) => any>();
const mockBuildAbilityProfile = jest.fn<(...args: any[]) => any>();
const mockCreateUserSkillHistory = jest.fn<(...args: any[]) => any>();
const mockGetUserSkillSnapshot = jest.fn<(...args: any[]) => any>();
const mockUpdateUserSkillFromHistory = jest.fn<(...args: any[]) => any>();
const mockEvaluateLearningPathScenario = jest.fn<(...args: any[]) => any>();
const mockCreateNextLearningPathCycle = jest.fn<(...args: any[]) => any>();
const mockBuildStrategyRoutePlan = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/services/learning_path_v2/layer1_test_result.service", () => ({
  normalizeTestResult: mockNormalizeTestResult,
}));

jest.mock("../../src/services/learning_path_v2/layer2_ability_profile.service", () => ({
  buildAbilityProfile: mockBuildAbilityProfile,
}));

jest.mock("../../src/services/user_skill_history.service", () => ({
  createUserSkillHistory: mockCreateUserSkillHistory,
}));

jest.mock("../../src/services/user_skill.service", () => ({
  getUserSkillSnapshot: mockGetUserSkillSnapshot,
  updateUserSkillFromHistory: mockUpdateUserSkillFromHistory,
}));

jest.mock("../../src/services/learning_path_v2/layer3_strategy_decision.service", () => ({
  evaluateLearningPathScenario: mockEvaluateLearningPathScenario,
}));

jest.mock("../../src/services/week_study.service", () => ({
  createNextLearningPathCycle: mockCreateNextLearningPathCycle,
}));

jest.mock("../../src/services/learning_path_v2/layer4_route_optimizer.service", () => ({
  buildStrategyRoutePlan: mockBuildStrategyRoutePlan,
}));

import {
  calculateTotalAvailableMinutesForRoute,
  extractPartAbilitiesForLayer4,
  runLearningPathV2AbilityPipeline,
} from "../../src/services/learning_path_v2/learning_path_v2.service";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();
const userTestId = new Types.ObjectId();
const sourceTestId = new Types.ObjectId();
const weekStudyId = new Types.ObjectId().toString();
const submittedAt = new Date("2026-01-15T00:00:00.000Z");

const createInput = (trigger_type: string, overrides: Record<string, unknown> = {}) =>
  ({
    trigger_type,
    user_id: userId,
    learning_path_id: learningPathId,
    source_user_test: {
      _id: userTestId,
      test_id: sourceTestId,
      submit_at: submittedAt,
    },
    raw_result: {
      test_id: sourceTestId.toString(),
      submitted_at: submittedAt,
    },
    learning_path_created_at: new Date("2026-01-01T00:00:00.000Z"),
    target_completion_date: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  } as any);

const createLearningPath = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(learningPathId),
  user_id: new Types.ObjectId(userId),
  target_score: 700,
  time_per_day: 120,
  days_per_week: 5,
  target_completion_date: new Date("2026-03-01T00:00:00.000Z"),
  mini_tests_completed_since_last_full_test: 1,
  last_full_test_user_test_id: null,
  last_full_test_submitted_at: null,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  save: (jest.fn() as any).mockResolvedValue(undefined),
  ...overrides,
});

const createUserSkill = (parts: number[] = [1, 2, 3, 4, 5, 6, 7]) =>
  ({
    parts: parts.map((partType) => ({
      part_type: partType,
      ability: partType / 10,
      status: "medium",
      absolute_level: "medium",
      skills: [],
    })),
  } as any);

const createLessonManagerNode = (partType: number) => ({
  _id: new Types.ObjectId(),
  title: `Part ${partType} foundation`,
  part_type: partType,
  score_band: { from: 400, to: 700 },
  unit_type: "foundation",
  node_role: "normal",
  target_tags: [`part_${partType}_skill`],
  weight: 0.4,
  planned_completion_time: 60,
  next_unit_ids: [],
  prerequisite_unit_ids: [],
  auxiliary_unit_ids: [],
  status: "approved",
});

const createRoutePlan = (strategy: string, scenario = "ONBOARDING") => ({
  strategy,
  scenario,
  estimated_total_minutes: 120,
  estimated_gain: 0.5,
  reaches_target: false,
  focus_part_types: [1, 2],
  focus_skill_keys: ["part_1_skill"],
  route_units: [
    {
      lesson_manager_id: new Types.ObjectId().toString(),
      title: "Part 1 foundation",
      part_type: 1,
      score_band: { from: 400, to: 700 },
      unit_type: "foundation",
      node_role: "normal",
      target_tags: ["part_1_skill"],
      order: 0,
      planned_minutes: 120,
      estimated_gain: 0.5,
      reason: "Phù hợp route hiện tại.",
    },
  ],
  summary_reasons: ["Ưu tiên Part yếu."],
  ability_highlights: [{ part_type: 1, ability: 0.1, status: "weak" }],
});

const setupBaseMocks = (triggerType: string) => {
  const learningPath = createLearningPath();
  const userSkill = createUserSkill();
  const userTest = {
    _id: userTestId,
    test_id: sourceTestId,
    submit_at: submittedAt,
  };

  mockNormalizeTestResult.mockResolvedValue({
    trigger_type: triggerType,
    test_id: new Types.ObjectId().toString(),
    submitted_at: submittedAt,
  });
  mockGetUserSkillSnapshot.mockResolvedValue(null);
  mockBuildAbilityProfile.mockResolvedValue({ parts: [] });
  mockCreateUserSkillHistory.mockResolvedValue({ _id: new Types.ObjectId() });
  mockUpdateUserSkillFromHistory.mockResolvedValue(userSkill);
  mockEvaluateLearningPathScenario.mockResolvedValue({
    trigger_type: triggerType,
    scenario:
      triggerType === "initial_generation" ? "ONBOARDING" : "FULLTEST_MONTHLY",
    pre_deadline: false,
  });
  mockLearningPath.findOne.mockResolvedValue(learningPath);
  mockLessonManager.find.mockResolvedValue(
    [1, 2, 3, 4, 5, 6, 7].map(createLessonManagerNode)
  );
  mockBuildStrategyRoutePlan.mockImplementation((input: any) =>
    createRoutePlan(input.strategy, input.scenario)
  );
  mockLearningPathStrategyOption.updateMany.mockResolvedValue({ modifiedCount: 0 });
  mockLearningPathStrategyOption.create.mockImplementation((payload: any) => {
    if (Array.isArray(payload)) {
      return Promise.resolve(
        payload.map((item) => ({ _id: new Types.ObjectId(), ...item }))
      );
    }

    return Promise.resolve({ _id: new Types.ObjectId(), ...payload });
  });
  mockCreateNextLearningPathCycle.mockResolvedValue({
    status: "cycle_created",
    week_study: { _id: new Types.ObjectId() },
    strategy_option: { _id: new Types.ObjectId(), status: "selected" },
  });

  return { learningPath, userSkill, userTest };
};

describe("learning_path_v2.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runLearningPathV2AbilityPipeline -> initial_generation creates selected recommended option and first cycle", async () => {
    setupBaseMocks("initial_generation");

    const output = await runLearningPathV2AbilityPipeline(
      createInput("initial_generation")
    );

    expect(mockLearningPathStrategyOption.create).toHaveBeenCalledTimes(1);
    expect(mockLearningPathStrategyOption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: "recommended",
        status: "selected",
        trigger_type: "initial_generation",
        scenario: "ONBOARDING",
        next_route_unit_index: 0,
      })
    );
    expect(mockCreateNextLearningPathCycle).toHaveBeenCalledTimes(1);
    expect(output.layer4_result?.selected_strategy_option).toBeTruthy();
    expect(output.layer4_result?.cycle_result).toBeTruthy();
  });

  it("runLearningPathV2AbilityPipeline -> full_test_review creates 3 pending options and does not create cycle", async () => {
    const { learningPath } = setupBaseMocks("full_test_review");

    const output = await runLearningPathV2AbilityPipeline(
      createInput("full_test_review", { week_study_id: weekStudyId })
    );

    expect(mockLearningPathStrategyOption.create).toHaveBeenCalledTimes(1);
    const payloads = mockLearningPathStrategyOption.create.mock.calls[0][0];
    expect(payloads).toHaveLength(3);
    expect(payloads.map((payload: any) => payload.strategy)).toEqual([
      "recommended",
      "balanced",
      "opportunity",
    ]);
    expect(payloads.every((payload: any) => payload.status === "pending_selection")).toBe(
      true
    );
    expect(mockCreateNextLearningPathCycle).not.toHaveBeenCalled();
    expect(learningPath.mini_tests_completed_since_last_full_test).toBe(0);
    expect(learningPath.last_full_test_user_test_id).toBe(userTestId);
    expect(learningPath.last_full_test_submitted_at).toBe(submittedAt);
    expect(learningPath.save).toHaveBeenCalled();
    expect(output.layer4_result?.strategy_options).toHaveLength(3);
    expect(output.layer4_result?.cycle_result).toBeNull();
  });

  it("runLearningPathV2AbilityPipeline -> mini_test_completion increments counter and creates next cycle", async () => {
    const { learningPath } = setupBaseMocks("mini_test_completion");

    await runLearningPathV2AbilityPipeline(
      createInput("mini_test_completion", { week_study_id: weekStudyId })
    );

    expect(learningPath.mini_tests_completed_since_last_full_test).toBe(2);
    expect(learningPath.save).toHaveBeenCalled();
    expect(mockCreateNextLearningPathCycle).toHaveBeenCalledTimes(1);
    expect(mockLearningPathStrategyOption.create).not.toHaveBeenCalled();
  });

  it("initial_generation -> missing learning path throws Vietnamese error", async () => {
    setupBaseMocks("initial_generation");
    mockLearningPath.findOne.mockResolvedValue(null);

    await expect(
      runLearningPathV2AbilityPipeline(createInput("initial_generation"))
    ).rejects.toThrow("Không tìm thấy LearningPath để tạo route Layer 4.");
  });

  it("full_test_review -> missing 7 part abilities throws Vietnamese error", async () => {
    setupBaseMocks("full_test_review");
    mockUpdateUserSkillFromHistory.mockResolvedValue(createUserSkill([1, 2, 3]));

    await expect(
      runLearningPathV2AbilityPipeline(createInput("full_test_review"))
    ).rejects.toThrow("UserSkill chưa đủ ability 7 Part để tạo route Layer 4.");
  });

  it("calculateTotalAvailableMinutesForRoute -> uses target_completion_date/time_per_day", () => {
    const result = calculateTotalAvailableMinutesForRoute({
      now: new Date("2026-01-01T00:00:00.000Z"),
      target_completion_date: new Date("2026-01-15T00:00:00.000Z"),
      time_per_day: 120,
      days_per_week: 5,
    });

    expect(result).toBe(1200);
  });

  it("full_test_review -> unsupported scenario snapshot throws Vietnamese error", async () => {
    setupBaseMocks("full_test_review");
    mockEvaluateLearningPathScenario.mockResolvedValue({
      trigger_type: "full_test_review",
      scenario: "NORMAL_PROGRESS",
      pre_deadline: false,
    });

    await expect(
      runLearningPathV2AbilityPipeline(createInput("full_test_review"))
    ).rejects.toThrow("Scenario không hợp lệ để tạo strategy option sau full test.");
  });

  it("extractPartAbilitiesForLayer4 -> normalizes abilities to 0..1", () => {
    const result = extractPartAbilitiesForLayer4({
      user_skill: {
        parts: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
          part_type: partType,
          ability: partType === 1 ? -0.2 : partType === 7 ? 1.2 : 0.5,
          status: "medium",
          absolute_level: "medium",
          skills: [],
        })),
      } as any,
    });

    expect(result[0].ability).toBe(0);
    expect(result[6].ability).toBe(1);
  });
});
