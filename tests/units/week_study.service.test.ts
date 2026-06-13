import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLearningPath: any = {
  findOne: jest.fn(),
};

const mockLearningPathStrategyOption: any = {
  findOne: jest.fn(),
};

const mockWeekStudy: any = {
  create: jest.fn(),
};

const mockDayStudy: any = {
  find: jest.fn(),
};

const mockLessonManager: any = {
  find: jest.fn(),
};

const mockUserSkill: any = {
  findOne: jest.fn(),
};

jest.mock("../../src/models", () => ({
  DayStudy: mockDayStudy,
  LearningPath: mockLearningPath,
  LearningPathStrategyOption: mockLearningPathStrategyOption,
  LessonManager: mockLessonManager,
  UserSkill: mockUserSkill,
  WeekStudy: mockWeekStudy,
}));

const mockCreateDayStudiesForWeekStudyCycle = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/services/day_study.service", () => ({
  createDayStudiesForWeekStudyCycle: mockCreateDayStudiesForWeekStudyCycle,
}));

const mockGenerateAssessmentTestFromPlan = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/services/learning_path_v2/learning_path_assessment.service", () => ({
  generateAssessmentTestFromPlan: mockGenerateAssessmentTestFromPlan,
}));

import {
  calculateExpectedCompletionAt,
  createNextLearningPathCycle,
  previewNextLearningPathCycleFromStrategyOption,
} from "../../src/services/week_study.service";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();
const optionId = new Types.ObjectId();
const lessonManagerId = new Types.ObjectId();

const createFindOneSortChain = (value: unknown) => ({
  sort: (jest.fn() as any).mockResolvedValue(value),
});

const createRouteUnit = (overrides: Record<string, unknown> = {}) => ({
  lesson_manager_id: lessonManagerId,
  title: "Part 5 word form",
  part_type: 5,
  score_band: { from: 400, to: 600 },
  unit_type: "foundation",
  node_role: "normal",
  target_tags: ["Word form"],
  order: 0,
  planned_minutes: 150,
  estimated_gain: 0.2,
  reason: "Củng cố Part 5",
  ...overrides,
});

const createLearningPath = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(learningPathId),
  user_id: new Types.ObjectId(userId),
  week_study_ids: [],
  time_per_day: 120,
  days_per_week: 5,
  mini_tests_completed_since_last_full_test: 0,
  last_full_test_user_test_id: null,
  last_full_test_submitted_at: null,
  save: (jest.fn() as any).mockResolvedValue(undefined),
  ...overrides,
});

const createUserSkill = (parts: Array<{ part_type: number; ability: number }>) => ({
  parts: parts.map((part) => ({
    ...part,
    status: "weak",
    absolute_level: "low",
    trend: "stable",
    skills: [
      {
        skill_key: `part_${part.part_type}_weak_skill`,
        ability: part.ability,
        status: "weak",
        absolute_level: "low",
      },
    ],
  })),
});

const createSelectedOption = (overrides: Record<string, unknown> = {}) => ({
  _id: optionId,
  user_id: new Types.ObjectId(userId),
  learning_path_id: new Types.ObjectId(learningPathId),
  status: "selected",
  strategy: "recommended",
  scenario: "NORMAL_PROGRESS",
  focus_part_types: [5],
  part_roadmaps: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
    part_type: partType,
    cursor_index: 0,
    target_minutes: partType === 5 ? 450 : 0,
    estimated_gain: partType === 5 ? 0.6 : 0,
    reaches_target: false,
    units:
      partType === 5
        ? [
            createRouteUnit({ order: 0, planned_minutes: 150, target_tags: ["Word form"] }),
            createRouteUnit({ order: 1, planned_minutes: 150, target_tags: ["Vocabulary"] }),
            createRouteUnit({ order: 2, planned_minutes: 150, target_tags: ["Tense"] }),
          ]
        : [],
  })),
  save: (jest.fn() as any).mockResolvedValue(undefined),
  ...overrides,
});

describe("week_study.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLearningPath.findOne.mockResolvedValue(createLearningPath());
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(createSelectedOption())
    );
    mockUserSkill.findOne.mockResolvedValue(null);
    mockDayStudy.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: (jest.fn() as any).mockResolvedValue([]),
      }),
    });
    mockLessonManager.find.mockReturnValue({
      lean: (jest.fn() as any).mockResolvedValue([]),
    });
    mockWeekStudy.create.mockImplementation((payload: any) =>
      Promise.resolve({
        _id: new Types.ObjectId(),
        ...payload,
      })
    );
    mockCreateDayStudiesForWeekStudyCycle.mockImplementation((input: any) =>
      Promise.resolve({
        week_study: { _id: new Types.ObjectId(input.week_study_id) },
        day_studies: [
          { _id: new Types.ObjectId(), dayOfWeek: 1 },
          { _id: new Types.ObjectId(), dayOfWeek: 2 },
        ],
      })
    );
    mockGenerateAssessmentTestFromPlan.mockResolvedValue({
      test_id: new Types.ObjectId(),
    });
  });

  it("createNextLearningPathCycle -> selected option and mini count 0 -> creates WeekStudy with mini_test", async () => {
    // Chuẩn bị
    const learningPath = createLearningPath({
      mini_tests_completed_since_last_full_test: 0,
    });
    const selectedOption = createSelectedOption();
    mockLearningPath.findOne.mockResolvedValue(learningPath);
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(selectedOption)
    );

    // Thực thi
    const result = await createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    // Kiểm tra
    expect(result.status).toBe("cycle_created");
    expect(mockWeekStudy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assessment_type: "mini_test",
        assessment_estimated_minutes: 60,
        learning_path_strategy_option_id: selectedOption._id,
        focus_part_types: [5],
        status: "in_progress",
        days: [],
        accuracy_overall: 0,
      })
    );
    const createdPayload = mockWeekStudy.create.mock.calls[0][0];
    expect(createdPayload.focus_skill_keys.length).toBeGreaterThan(0);
    expect(selectedOption.part_roadmaps.find((roadmap: any) => roadmap.part_type === 5)!.cursor_index).toBeGreaterThan(0);
    expect(selectedOption.save).toHaveBeenCalled();
    expect(learningPath.week_study_ids).toHaveLength(1);
    expect(learningPath.save).toHaveBeenCalled();
    if (result.status !== "cycle_created") throw new Error("Expected cycle_created");
    expect(mockCreateDayStudiesForWeekStudyCycle).toHaveBeenCalledWith({
      user_id: userId,
      learning_path_id: learningPathId,
      week_study_id: String(result.week_study._id),
      assessment_test_id: result.assessment_result.test_id,
      cycle_units: expect.any(Array),
    });
    expect(mockGenerateAssessmentTestFromPlan).toHaveBeenCalledWith({
      user_id: userId,
      learning_path_id: learningPathId,
      cycle_no: 1,
      assessment: expect.objectContaining({ type: "mini_test" }),
      focus_part_types: expect.any(Array),
      focus_skill_keys: expect.any(Array),
    });
    expect(
      mockGenerateAssessmentTestFromPlan.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockWeekStudy.create.mock.invocationCallOrder[0]
    );
    expect(result.day_studies.length).toBeGreaterThan(0);
    expect(result.assessment_result.test_id).toBeInstanceOf(Types.ObjectId);
  });

  it("createNextLearningPathCycle -> mini count 3 -> creates WeekStudy with full_test", async () => {
    // Chuẩn bị
    const learningPath = createLearningPath({
      mini_tests_completed_since_last_full_test: 3,
    });
    const selectedOption = createSelectedOption();
    mockLearningPath.findOne.mockResolvedValue(learningPath);
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(selectedOption)
    );

    // Thực thi
    const result = await createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    expect(result.status).toBe("cycle_created");
    if (result.status !== "cycle_created") throw new Error("Expected cycle_created");
    expect(result.plan.plan_type).toBe("learning_cycle");
    expect(result.plan.selected_roadmap_units.length).toBeGreaterThan(0);
    expect(result.plan.assessment.type).toBe("full_test");
    expect(mockWeekStudy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assessment_type: "full_test",
        assessment_estimated_minutes: 120,
      })
    );
    expect(selectedOption.part_roadmaps.find((roadmap: any) => roadmap.part_type === 5)!.cursor_index).toBeGreaterThan(0);
    expect(mockCreateDayStudiesForWeekStudyCycle).toHaveBeenCalledTimes(1);
    expect(mockGenerateAssessmentTestFromPlan).toHaveBeenCalledTimes(1);
    expect(
      mockGenerateAssessmentTestFromPlan.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockWeekStudy.create.mock.invocationCallOrder[0]
    );
    expect(result.day_studies.length).toBeGreaterThan(0);
    expect(result.assessment_result.test_id).toBeInstanceOf(Types.ObjectId);
  });

  it("createNextLearningPathCycle -> uses latest UserSkill rolling focus instead of selected option focus", async () => {
    const selectedOption = createSelectedOption({
      focus_part_types: [5],
      part_roadmaps: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
        part_type: partType,
        cursor_index: 0,
        target_minutes: [2, 5].includes(partType) ? 250 : 0,
        estimated_gain: [2, 5].includes(partType) ? 0.4 : 0,
        reaches_target: false,
        units: [2, 5].includes(partType)
          ? [
              createRouteUnit({
                lesson_manager_id: new Types.ObjectId(),
                part_type: partType,
                planned_minutes: 250,
                target_tags: [`part_${partType}_weak_skill`],
              }),
            ]
          : [],
      })),
    });
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(selectedOption)
    );
    mockUserSkill.findOne.mockResolvedValue(
      createUserSkill([
        { part_type: 1, ability: 0.1 },
        { part_type: 2, ability: 0.2 },
        { part_type: 3, ability: 0.3 },
        { part_type: 4, ability: 0.4 },
        { part_type: 5, ability: 0.5 },
        { part_type: 6, ability: 0.6 },
        { part_type: 7, ability: 0.7 },
      ])
    );

    const result = await createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    expect(result.status).toBe("cycle_created");
    expect(mockWeekStudy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        focus_part_types: [2, 5],
      })
    );
    expect(mockGenerateAssessmentTestFromPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        focus_part_types: [2, 5],
      })
    );
  });

  it("createNextLearningPathCycle -> alternative node prioritizes current ability before target score", async () => {
    const abilityCloseNodeId = new Types.ObjectId();
    const targetCloseNodeId = new Types.ObjectId();
    const selectedOption = createSelectedOption({
      part_roadmaps: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
        part_type: partType,
        cursor_index: 0,
        target_minutes: partType === 5 ? 250 : 0,
        estimated_gain: partType === 5 ? 0.4 : 0,
        reaches_target: false,
        units:
          partType === 5
            ? [
                createRouteUnit({
                  lesson_manager_id: new Types.ObjectId(),
                  part_type: 5,
                  planned_minutes: 250,
                  target_tags: ["part_5_weak_skill"],
                }),
              ]
            : [],
      })),
    });
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(selectedOption)
    );
    mockUserSkill.findOne.mockResolvedValue(
      createUserSkill([
        { part_type: 2, ability: 0.2 },
        { part_type: 5, ability: 0.5 },
      ])
    );
    mockLessonManager.find.mockReturnValue({
      lean: (jest.fn() as any).mockResolvedValue([
        {
          _id: targetCloseNodeId,
          title: "Target close but too hard",
          part_type: 2,
          score_band: { from: 650, to: 750 },
          unit_type: "foundation",
          node_role: "normal",
          target_tags: ["part_2_weak_skill"],
          weight: 0.8,
          planned_completion_time: 250,
          next_unit_ids: [],
          prerequisite_unit_ids: [],
          auxiliary_unit_ids: [],
          status: "approved",
        },
        {
          _id: abilityCloseNodeId,
          title: "Ability close alternative",
          part_type: 2,
          score_band: { from: 300, to: 450 },
          unit_type: "foundation",
          node_role: "normal",
          target_tags: ["part_2_weak_skill"],
          weight: 0.22,
          planned_completion_time: 250,
          next_unit_ids: [],
          prerequisite_unit_ids: [],
          auxiliary_unit_ids: [],
          status: "approved",
        },
      ]),
    });

    const result = await createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    expect(result.status).toBe("cycle_created");
    const part2Roadmap = selectedOption.part_roadmaps.find(
      (roadmap: any) => roadmap.part_type === 2
    ) as any;
    expect(String(part2Roadmap.units[0].lesson_manager_id)).toBe(
      String(abilityCloseNodeId)
    );
    expect(part2Roadmap.units[0].unit_source).toBe("alternative");
  });

  it("createNextLearningPathCycle -> route exhausted -> returns route_completed and does not create WeekStudy", async () => {
    // Chuẩn bị
    const learningPath = createLearningPath();
    const selectedOption = createSelectedOption({
      part_roadmaps: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
        part_type: partType,
        cursor_index: partType === 5 ? 3 : 0,
        target_minutes: partType === 5 ? 450 : 0,
        estimated_gain: partType === 5 ? 0.6 : 0,
        reaches_target: false,
        units:
          partType === 5
            ? [
                createRouteUnit({ order: 0, planned_minutes: 150, target_tags: ["Word form"] }),
                createRouteUnit({ order: 1, planned_minutes: 150, target_tags: ["Vocabulary"] }),
                createRouteUnit({ order: 2, planned_minutes: 150, target_tags: ["Tense"] }),
              ]
            : [],
      })),
    });
    mockLearningPath.findOne.mockResolvedValue(learningPath);
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(selectedOption)
    );

    // Thực thi
    const result = await createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    expect(result.status).toBe("route_completed");
    expect(mockWeekStudy.create).not.toHaveBeenCalled();
    expect(mockCreateDayStudiesForWeekStudyCycle).not.toHaveBeenCalled();
    expect(mockGenerateAssessmentTestFromPlan).not.toHaveBeenCalled();
    expect(result.day_studies).toEqual([]);
    expect(selectedOption.save).not.toHaveBeenCalled();
    expect(learningPath.save).not.toHaveBeenCalled();
  });

  it("createNextLearningPathCycle -> no learning path -> throws Vietnamese error", async () => {
    // Chuẩn bị
    mockLearningPath.findOne.mockResolvedValue(null);

    // Thực thi
    const action = createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    await expect(action).rejects.toThrow("LearningPath");
  });

  it("createNextLearningPathCycle -> no selected option -> throws Vietnamese error", async () => {
    // Chuẩn bị
    mockLearningPath.findOne.mockResolvedValue(createLearningPath());
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(null)
    );

    // Thực thi
    const action = createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    await expect(action).rejects.toThrow("LearningPath");
  });

  it("createNextLearningPathCycle -> selected option has empty part_roadmaps -> throws Vietnamese error", async () => {
    // Chuẩn bị
    mockLearningPath.findOne.mockResolvedValue(createLearningPath());
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(createSelectedOption({ part_roadmaps: [] }))
    );

    // Thực thi
    const action = createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    await expect(action).rejects.toThrow("part_roadmaps");
  });

  it("calculateExpectedCompletionAt -> uses time_per_day to estimate deadline", () => {
    // Chuẩn bị
    const now = new Date("2026-01-01T00:00:00.000Z");

    // Thực thi
    const result = calculateExpectedCompletionAt({
      now,
      estimated_learning_minutes: 240,
      assessment_estimated_minutes: 100,
      time_per_day: 120,
    });

    // Kiểm tra
    expect(result.toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });

  it("calculateExpectedCompletionAt -> fallback 7 days when no time_per_day", () => {
    // Chuẩn bị
    const now = new Date("2026-01-01T00:00:00.000Z");

    // Thực thi
    const result = calculateExpectedCompletionAt({
      now,
      estimated_learning_minutes: 240,
      assessment_estimated_minutes: 100,
    });

    // Kiểm tra
    expect(result.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("createNextLearningPathCycle -> selected option cursor starts from existing part roadmap cursor", async () => {
    // Chuẩn bị
    const selectedOption = createSelectedOption({
      part_roadmaps: [1, 2, 3, 4, 5, 6, 7].map((partType) => ({
        part_type: partType,
        cursor_index: partType === 5 ? 2 : 0,
        target_minutes: partType === 5 ? 450 : 0,
        estimated_gain: partType === 5 ? 0.6 : 0,
        reaches_target: false,
        units:
          partType === 5
            ? [
                createRouteUnit({ order: 0, planned_minutes: 150, target_tags: ["Word form"] }),
                createRouteUnit({ order: 1, planned_minutes: 150, target_tags: ["Vocabulary"] }),
                createRouteUnit({ order: 2, planned_minutes: 150, target_tags: ["Tense"] }),
              ]
            : [],
      })),
    });
    mockLearningPathStrategyOption.findOne.mockReturnValue(
      createFindOneSortChain(selectedOption)
    );

    // Thực thi
    const result = await createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    if (result.status !== "cycle_created") throw new Error("Expected cycle_created");
    expect(result.plan.selected_roadmap_units[0].target_tags).toEqual(["Tense"]);
  });

  it("createNextLearningPathCycle -> does not update mini/full counter", async () => {
    // Chuẩn bị
    const lastFullTestUserTestId = new Types.ObjectId();
    const lastFullTestSubmittedAt = new Date("2026-01-01T00:00:00.000Z");
    const learningPath = createLearningPath({
      mini_tests_completed_since_last_full_test: 3,
      last_full_test_user_test_id: lastFullTestUserTestId,
      last_full_test_submitted_at: lastFullTestSubmittedAt,
    });
    mockLearningPath.findOne.mockResolvedValue(learningPath);

    // Thực thi
    await createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    expect(learningPath.mini_tests_completed_since_last_full_test).toBe(3);
    expect(learningPath.last_full_test_user_test_id).toBe(lastFullTestUserTestId);
    expect(learningPath.last_full_test_submitted_at).toBe(lastFullTestSubmittedAt);
  });

  it("createNextLearningPathCycle -> DayStudy generation throws -> propagates error", async () => {
    // Chuẩn bị
    mockCreateDayStudiesForWeekStudyCycle.mockRejectedValue(new Error("DayStudy failed"));

    // Thực thi
    const action = createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    await expect(action).rejects.toThrow("DayStudy failed");
  });

  it("createNextLearningPathCycle -> assessment generation throws -> propagates error", async () => {
    // Chuẩn bị
    mockGenerateAssessmentTestFromPlan.mockRejectedValue(
      new Error("Assessment failed")
    );

    // Thực thi
    const action = createNextLearningPathCycle({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    // Kiểm tra
    await expect(action).rejects.toThrow("Assessment failed");
  });

  it("previewNextLearningPathCycleFromStrategyOption -> không save option, không tạo WeekStudy/DayStudy", async () => {
    // Chuẩn bị
    const learningPath = createLearningPath({
      mini_tests_completed_since_last_full_test: 0,
    });
    const strategyOption = createSelectedOption({
      _id: optionId,
      status: "pending_selection",
    });
    const initialCursor = strategyOption.part_roadmaps.find(
      (roadmap: any) => roadmap.part_type === 5
    )!.cursor_index;
    mockLearningPath.findOne.mockResolvedValue(learningPath);
    mockLearningPathStrategyOption.findOne.mockResolvedValue(strategyOption);

    // Thực thi
    const result = await previewNextLearningPathCycleFromStrategyOption({
      user_id: userId,
      learning_path_id: learningPathId,
      strategy_option_id: String(optionId),
    });

    // Kiểm tra
    expect(result.status).toBe("preview_available");
    expect(result.assessment_type).toBe("mini_test");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toEqual(
      expect.objectContaining({
        part_type: 5,
        total_minutes: 450,
        unit_count: 3,
      })
    );
    expect(mockWeekStudy.create).not.toHaveBeenCalled();
    expect(mockCreateDayStudiesForWeekStudyCycle).not.toHaveBeenCalled();
    expect(mockGenerateAssessmentTestFromPlan).not.toHaveBeenCalled();
    expect(strategyOption.save).not.toHaveBeenCalled();
    expect(learningPath.save).not.toHaveBeenCalled();
    expect(
      strategyOption.part_roadmaps.find((roadmap: any) => roadmap.part_type === 5)!
        .cursor_index
    ).toBe(initialCursor);
  });
});







