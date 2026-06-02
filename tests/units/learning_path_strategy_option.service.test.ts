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
  strategy,
  status: "pending_selection",
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
  route_units: [createRouteUnit()],
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
      })
    );
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
    await expect(action).rejects.toThrow("learning_path_id không phải ObjectId hợp lệ.");
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
    await expect(action).rejects.toThrow("đúng 3 strategy option");
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
    await expect(action).rejects.toThrow("không được trùng strategy");
  });

  it("createFullTestStrategyOptions -> old pending options exist -> expires old pending options", async () => {
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
        learning_path_id: new Types.ObjectId(learningPathId),
        status: "pending_selection",
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

  it("selectLearningPathStrategyOption -> pending option -> expires old selected and selects new option", async () => {
    // Chuẩn bị
    mockLearningPathStrategyOption.findOne.mockResolvedValue(
      createOption("recommended", { _id: new Types.ObjectId(optionId) })
    );
    mockLearningPathStrategyOption.findOneAndUpdate.mockResolvedValue(
      createOption("recommended", {
        _id: new Types.ObjectId(optionId),
        status: "selected",
      })
    );

    // Thực thi
    const result = await selectLearningPathStrategyOption({
      learning_path_id: learningPathId,
      option_id: optionId,
    });

    // Kiểm tra
    expect(mockLearningPathStrategyOption.updateMany.mock.calls[0][0]).toEqual({
      learning_path_id: new Types.ObjectId(learningPathId),
      status: "selected",
      _id: { $ne: new Types.ObjectId(optionId) },
    });
    expect(mockLearningPathStrategyOption.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(optionId), learning_path_id: new Types.ObjectId(learningPathId) },
      { $set: { status: "selected", selected_at: expect.any(Date) } },
      { new: true }
    );
    expect(result.status).toBe("selected");
  });

  it("selectLearningPathStrategyOption -> selected option already selected -> returns existing selected option", async () => {
    // Chuẩn bị
    const selected = createOption("recommended", { status: "selected" });
    mockLearningPathStrategyOption.findOne.mockResolvedValue(selected);

    // Thực thi
    const result = await selectLearningPathStrategyOption({
      learning_path_id: learningPathId,
      option_id: optionId,
    });

    // Kiểm tra
    expect(result).toBe(selected);
    expect(mockLearningPathStrategyOption.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("selectLearningPathStrategyOption -> option not found -> throws clear error", async () => {
    // Chuẩn bị
    mockLearningPathStrategyOption.findOne.mockResolvedValue(null);

    // Thực thi
    const action = selectLearningPathStrategyOption({
      learning_path_id: learningPathId,
      option_id: optionId,
    });

    // Kiểm tra
    await expect(action).rejects.toThrow("Không tìm thấy strategy option cần chọn.");
  });

  it("selectLearningPathStrategyOption -> sibling pending options -> dismisses siblings from same source test", async () => {
    // Chuẩn bị
    mockLearningPathStrategyOption.findOne.mockResolvedValue(
      createOption("balanced", { _id: new Types.ObjectId(optionId) })
    );
    mockLearningPathStrategyOption.findOneAndUpdate.mockResolvedValue(
      createOption("balanced", {
        _id: new Types.ObjectId(optionId),
        status: "selected",
      })
    );

    // Thực thi
    await selectLearningPathStrategyOption({
      learning_path_id: learningPathId,
      option_id: optionId,
    });

    // Kiểm tra
    expect(mockLearningPathStrategyOption.updateMany.mock.calls[1]).toEqual([
      {
        learning_path_id: new Types.ObjectId(learningPathId),
        source_user_test_id: new Types.ObjectId(sourceUserTestId),
        status: "pending_selection",
        _id: { $ne: new Types.ObjectId(optionId) },
      },
      { $set: { status: "dismissed" } },
    ]);
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
