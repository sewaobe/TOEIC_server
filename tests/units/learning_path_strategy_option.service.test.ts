import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLearningPathStrategyOption: any = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
};

jest.mock("../../src/models/learning_path_strategy_option.model", () => ({
  LearningPathStrategyOption: mockLearningPathStrategyOption,
}));

const mockCreateNextLearningPathCycle = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/services/week_study.service", () => ({
  createNextLearningPathCycle: mockCreateNextLearningPathCycle,
}));

import {
  createFullTestStrategyOptions,
  createInitialRecommendedOption,
  expirePendingStrategyOptions,
  getActiveLearningPathStrategyOption,
  getPendingStrategyOptions,
  selectLearningPathStrategyOption,
} from "../../src/services/learning_path_strategy_option.service";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();
const optionId = new Types.ObjectId().toString();
const sourceUserTestId = new Types.ObjectId().toString();
const sourceWeekStudyId = new Types.ObjectId().toString();
const lessonManagerId = new Types.ObjectId().toString();

const createFindSortChain = (rows: unknown[]) => ({
  sort: (jest.fn() as any).mockResolvedValue(rows),
});

const createOption = (strategy = "recommended", overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  user_id: new Types.ObjectId(userId),
  learning_path_id: new Types.ObjectId(learningPathId),
  source_user_test_id: new Types.ObjectId(sourceUserTestId),
  trigger_type: "full_test_review",
  strategy,
  status: "pending_selection",
  selected_at: undefined as Date | undefined,
  save: (jest.fn() as any).mockResolvedValue(undefined),
  ...overrides,
});

const createRouteUnit = (overrides: Record<string, unknown> = {}) => ({
  lesson_manager_id: lessonManagerId,
  title: "Part 5 foundation",
  part_type: 5,
  score_band: { from: 400, to: 600 },
  unit_type: "foundation" as const,
  node_role: "normal" as const,
  target_tags: ["part5_word_form"],
  order: 0,
  planned_minutes: 30,
  estimated_gain: 0.1,
  reason: "Củng cố nền tảng Part 5",
  ...overrides,
});

const createPayload = (overrides: Record<string, unknown> = {}) => ({
  user_id: userId,
  learning_path_id: learningPathId,
  source_user_test_id: sourceUserTestId,
  source_week_study_id: sourceWeekStudyId,
  title: "Recommended route",
  description: "Route đề xuất",
  focus_part_types: [5],
  focus_skill_keys: ["part5_word_form"],
  estimated_total_minutes: 90,
  estimated_gain: 0.25,
  reaches_target: true,
  part_roadmaps: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
    part_type: partType,
    cursor_index: 0,
    target_minutes: partType === 5 ? 90 : 0,
    estimated_gain: partType === 5 ? 0.25 : 0,
    reaches_target: partType === 5,
    units: partType === 5 ? [createRouteUnit()] : [],
  })),
  summary_reasons: ["Part 5 đang yếu"],
  ability_highlights: [
    {
      part_type: 5,
      skill_key: "part5_word_form",
      label_vi: "Từ loại",
      ability: 0.4,
      status: "weak",
      trend: "stable",
      reason: "Cần luyện thêm",
    },
  ],
  ...overrides,
});

const createFullTestOptions = () => [
  createPayload({ strategy: "balanced", title: "Balanced" }),
  createPayload({ strategy: "opportunity", title: "Opportunity" }),
  createPayload({ strategy: "recommended", title: "Recommended" }),
];

describe("learning path strategy option service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLearningPathStrategyOption.updateMany.mockResolvedValue({
      modifiedCount: 1,
    });
    mockLearningPathStrategyOption.create.mockImplementation((payload: any) => {
      if (Array.isArray(payload)) {
        return Promise.resolve(
          payload.map((item) => createOption(item.strategy, item))
        );
      }
      return Promise.resolve(createOption(payload.strategy, payload));
    });
    mockLearningPathStrategyOption.find.mockReturnValue(createFindSortChain([]));
    mockLearningPathStrategyOption.findOne.mockResolvedValue(null);
    mockLearningPathStrategyOption.findOneAndUpdate.mockResolvedValue(null);
    mockCreateNextLearningPathCycle.mockResolvedValue({
      status: "cycle_created",
      week_study: { _id: new Types.ObjectId() },
      strategy_option: { _id: new Types.ObjectId(), status: "selected" },
    });
  });

  it("createInitialRecommendedOption -> valid onboarding route -> creates selected recommended option", async () => {
    // Chuẩn bị
    const selectedAt = new Date("2026-06-01T00:00:00.000Z");
    const input = createPayload({ selected_at: selectedAt });

    // Thực thi
    const result = await createInitialRecommendedOption(input as any);

    // Kiểm tra
    expect(mockLearningPathStrategyOption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_type: "initial_generation",
        strategy: "recommended",
        scenario: "ONBOARDING",
        status: "selected",
        selected_at: selectedAt,
        part_roadmaps: expect.any(Array),
      })
    );
    const createPayloadInput = mockLearningPathStrategyOption.create.mock.calls[0][0];
    expect(createPayloadInput.part_roadmaps).toHaveLength(7);
    expect(createPayloadInput.part_roadmaps.map((roadmap: any) => roadmap.part_type)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(createPayloadInput.part_roadmaps.every((roadmap: any) => roadmap.cursor_index === 0)).toBe(true);
    expect(result.status).toBe("selected");
  });

  it("createInitialRecommendedOption -> existing selected option -> expires old selected before creating new selected", async () => {
    // Chuẩn bị
    const input = createPayload();

    // Thực thi
    await createInitialRecommendedOption(input as any);

    // Kiểm tra
    expect(mockLearningPathStrategyOption.updateMany).toHaveBeenCalledWith(
      {
        learning_path_id: new Types.ObjectId(learningPathId),
        status: "selected",
      },
      { $set: { status: "expired" } }
    );
    expect(mockLearningPathStrategyOption.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockLearningPathStrategyOption.create.mock.invocationCallOrder[0]
    );
  });

  it("createInitialRecommendedOption -> invalid learning_path_id -> throws clear error", async () => {
    // Chuẩn bị
    const input = createPayload({ learning_path_id: "bad-id" });

    // Thực thi
    const action = createInitialRecommendedOption(input as any);

    // Kiểm tra
    await expect(action).rejects.toThrow("learning_path_id");
  });

  it("createFullTestStrategyOptions -> exactly three valid strategies -> creates pending options", async () => {
    // Chuẩn bị
    const input = {
      user_id: userId,
      learning_path_id: learningPathId,
      source_user_test_id: sourceUserTestId,
      source_week_study_id: sourceWeekStudyId,
      options: createFullTestOptions(),
    };

    // Thực thi
    const result = await createFullTestStrategyOptions(input as any);

    // Kiểm tra
    expect(mockLearningPathStrategyOption.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          trigger_type: "full_test_review",
          scenario: "FULLTEST_MONTHLY",
          status: "pending_selection",
        }),
      ])
    );
    expect(result.map((option) => option.strategy)).toEqual([
      "recommended",
      "balanced",
      "opportunity",
    ]);
  });

  it("createFullTestStrategyOptions -> missing one strategy -> throws clear error", async () => {
    // Chuẩn bị
    const input = {
      user_id: userId,
      learning_path_id: learningPathId,
      source_user_test_id: sourceUserTestId,
      options: [
        createPayload({ strategy: "recommended" }),
        createPayload({ strategy: "balanced" }),
      ],
    };

    // Thực thi
    const action = createFullTestStrategyOptions(input as any);

    // Kiểm tra
    await expect(action).rejects.toThrow("3 strategy option");
  });

  it("createFullTestStrategyOptions -> duplicate strategy -> throws clear error", async () => {
    // Chuẩn bị
    const input = {
      user_id: userId,
      learning_path_id: learningPathId,
      source_user_test_id: sourceUserTestId,
      options: [
        createPayload({ strategy: "recommended" }),
        createPayload({ strategy: "recommended" }),
        createPayload({ strategy: "opportunity" }),
      ],
    };

    // Thực thi
    const action = createFullTestStrategyOptions(input as any);

    // Kiểm tra
    await expect(action).rejects.toThrow("strategy");
  });

  it("createFullTestStrategyOptions -> old selected and pending options exist -> expires old options", async () => {
    // Chuẩn bị
    const input = {
      user_id: userId,
      learning_path_id: learningPathId,
      source_user_test_id: sourceUserTestId,
      options: createFullTestOptions(),
    };

    // Thực thi
    await createFullTestStrategyOptions(input as any);

    // Kiểm tra
    expect(mockLearningPathStrategyOption.updateMany).toHaveBeenCalledWith(
      {
        user_id: new Types.ObjectId(userId),
        learning_path_id: new Types.ObjectId(learningPathId),
        status: { $in: ["selected", "pending_selection"] },
      },
      { $set: { status: "expired" } }
    );
  });

  it("getPendingStrategyOptions -> pending options exist -> returns options sorted recommended balanced opportunity", async () => {
    // Chuẩn bị
    mockLearningPathStrategyOption.find.mockReturnValue(
      createFindSortChain([
        createOption("opportunity"),
        createOption("recommended"),
        createOption("balanced"),
      ])
    );

    // Thực thi
    const result = await getPendingStrategyOptions({ learning_path_id: learningPathId });

    // Kiểm tra
    expect(result.map((option) => option.strategy)).toEqual([
      "recommended",
      "balanced",
      "opportunity",
    ]);
  });

  it("getPendingStrategyOptions -> source_user_test_id provided -> filters by source test", async () => {
    // Chuẩn bị
    mockLearningPathStrategyOption.find.mockReturnValue(createFindSortChain([]));

    // Thực thi
    await getPendingStrategyOptions({
      learning_path_id: learningPathId,
      source_user_test_id: sourceUserTestId,
    });

    // Kiểm tra
    expect(mockLearningPathStrategyOption.find).toHaveBeenCalledWith(
      expect.objectContaining({
        source_user_test_id: new Types.ObjectId(sourceUserTestId),
      })
    );
  });

  it("selectLearningPathStrategyOption -> pending full test option -> selects option and creates cycle", async () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const targetOption = createOption("recommended", {
      _id: new Types.ObjectId(optionId),
      status: "pending_selection",
    });
    mockLearningPathStrategyOption.findOne.mockResolvedValue(targetOption);
    mockLearningPathStrategyOption.updateMany
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 2 });

    const result = await selectLearningPathStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
      now,
    });

    expect(mockLearningPathStrategyOption.updateMany.mock.calls[0][0]).toEqual({
      user_id: new Types.ObjectId(userId),
      learning_path_id: new Types.ObjectId(learningPathId),
      status: "selected",
      _id: { $ne: new Types.ObjectId(optionId) },
    });
    expect(targetOption.status).toBe("selected");
    expect(targetOption.selected_at).toBe(now);
    expect(targetOption.save).toHaveBeenCalled();
    expect(mockCreateNextLearningPathCycle).toHaveBeenCalledWith({
      user_id: userId,
      learning_path_id: learningPathId,
      now,
    });
    expect(result.selected_strategy_option).toBe(targetOption);
    expect(result.cycle_result).toBeTruthy();
  });

  it("selectLearningPathStrategyOption -> no pending option -> throws Vietnamese error", async () => {
    mockLearningPathStrategyOption.findOne.mockResolvedValue(null);

    const action = selectLearningPathStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    await expect(action).rejects.toThrow("pending");
  });

  it("selectLearningPathStrategyOption -> option trigger initial_generation -> throws", async () => {
    mockLearningPathStrategyOption.findOne.mockResolvedValue(
      createOption("recommended", {
        _id: new Types.ObjectId(optionId),
        trigger_type: "initial_generation",
      })
    );

    const action = selectLearningPathStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    await expect(action).rejects.toThrow("full test");
    expect(mockCreateNextLearningPathCycle).not.toHaveBeenCalled();
  });

  it("selectLearningPathStrategyOption -> dismissed siblings uses same source_user_test_id", async () => {
    const targetOption = createOption("balanced", {
      _id: new Types.ObjectId(optionId),
    });
    mockLearningPathStrategyOption.findOne.mockResolvedValue(targetOption);

    await selectLearningPathStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    expect(mockLearningPathStrategyOption.updateMany.mock.calls[1]).toEqual([
      {
        user_id: new Types.ObjectId(userId),
        learning_path_id: new Types.ObjectId(learningPathId),
        status: "pending_selection",
        trigger_type: "full_test_review",
        source_user_test_id: new Types.ObjectId(sourceUserTestId),
        _id: { $ne: new Types.ObjectId(optionId) },
      },
      { $set: { status: "dismissed" } },
    ]);
  });

  it("selectLearningPathStrategyOption -> expires selected option but not target option", async () => {
    const targetOption = createOption("opportunity", {
      _id: new Types.ObjectId(optionId),
    });
    mockLearningPathStrategyOption.findOne.mockResolvedValue(targetOption);

    await selectLearningPathStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    expect(mockLearningPathStrategyOption.updateMany.mock.calls[0][0]).toEqual({
      user_id: new Types.ObjectId(userId),
      learning_path_id: new Types.ObjectId(learningPathId),
      status: "selected",
      _id: { $ne: new Types.ObjectId(optionId) },
    });
  });

  it("selectLearningPathStrategyOption -> createNextLearningPathCycle called after save", async () => {
    const targetOption = createOption("recommended", {
      _id: new Types.ObjectId(optionId),
    });
    mockLearningPathStrategyOption.findOne.mockResolvedValue(targetOption);

    await selectLearningPathStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    expect(targetOption.save.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateNextLearningPathCycle.mock.invocationCallOrder[0]
    );
  });

  it("selectLearningPathStrategyOption -> returns counts", async () => {
    const targetOption = createOption("recommended", {
      _id: new Types.ObjectId(optionId),
    });
    mockLearningPathStrategyOption.findOne.mockResolvedValue(targetOption);
    mockLearningPathStrategyOption.updateMany
      .mockResolvedValueOnce({ modifiedCount: 3 })
      .mockResolvedValueOnce({ modifiedCount: 2 });

    const result = await selectLearningPathStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    expect(result.expired_previous_selected_count).toBe(3);
    expect(result.dismissed_strategy_options_count).toBe(2);
  });

  it("getActiveLearningPathStrategyOption -> selected option exists -> returns selected option", async () => {
    // Chuẩn bị
    const selected = createOption("recommended", { status: "selected" });
    mockLearningPathStrategyOption.findOne.mockReturnValue(createFindSortChain(selected as any));

    // Thực thi
    const result = await getActiveLearningPathStrategyOption({
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    expect(result).toBe(selected);
  });

  it("getActiveLearningPathStrategyOption -> no selected option -> returns null", async () => {
    // Chuẩn bị
    mockLearningPathStrategyOption.findOne.mockReturnValue(createFindSortChain(null as any));

    // Thực thi
    const result = await getActiveLearningPathStrategyOption({
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    expect(result).toBeNull();
  });

  it("expirePendingStrategyOptions -> pending options exist -> marks them expired", async () => {
    // Chuẩn bị
    mockLearningPathStrategyOption.updateMany.mockResolvedValue({ modifiedCount: 3 });

    // Thực thi
    const result = await expirePendingStrategyOptions({
      learning_path_id: learningPathId,
      source_user_test_id: sourceUserTestId,
    });

    // Kiểm tra
    expect(mockLearningPathStrategyOption.updateMany).toHaveBeenCalledWith(
      {
        learning_path_id: new Types.ObjectId(learningPathId),
        status: "pending_selection",
        source_user_test_id: new Types.ObjectId(sourceUserTestId),
      },
      { $set: { status: "expired" } }
    );
    expect(result).toBe(3);
  });
});



