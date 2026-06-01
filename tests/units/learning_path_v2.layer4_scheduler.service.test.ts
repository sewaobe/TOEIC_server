import {
  buildFullTestLearningPathPlan,
  buildInitialLearningPathPlan,
  buildMiniTestNextWeekPlan,
} from "../../src/services/learning_path_v2/learning_path_v2.service";
import {
  buildFullTestStrategyPlans,
  buildInitialWeekPlan,
  buildMiniTestNextWeekPlan as buildMiniTestNextWeekPlanFromLayer4,
} from "../../src/services/learning_path_v2/layer4_scheduler.service";
import {
  persistInitialLearningPathPlan,
  persistMiniTestNextWeekPlan,
  persistSelectedFullTestPlan,
} from "../../src/services/learning_path_v2/learning_path_v2_persistence.service";

const notImplementedMessage = "Not implemented";

describe("LearningPath v2 skeleton", () => {
  it("exports the three orchestrator entry points", () => {
    expect(typeof buildInitialLearningPathPlan).toBe("function");
    expect(typeof buildFullTestLearningPathPlan).toBe("function");
    expect(typeof buildMiniTestNextWeekPlan).toBe("function");
  });

  it("throws explicit NotImplemented errors for orchestrator placeholders", async () => {
    await expect(
      buildInitialLearningPathPlan({
        trigger_type: "initial_generation",
        user_id: "user-1",
        initial_assessment: {},
      })
    ).rejects.toThrow(notImplementedMessage);

    await expect(
      buildFullTestLearningPathPlan({
        trigger_type: "full_test_review",
        user_id: "user-1",
        full_test_result: {},
      })
    ).rejects.toThrow(notImplementedMessage);

    await expect(
      buildMiniTestNextWeekPlan({
        trigger_type: "mini_test_completion",
        user_id: "user-1",
        mini_test_result: {},
      })
    ).rejects.toThrow(notImplementedMessage);
  });

  it("throws explicit NotImplemented errors for Layer 4 placeholders", async () => {
    const ability_profile = {
      trigger_type: "initial_generation" as const,
      part_abilities: [],
      skill_abilities: [],
      notes: [],
    };

    await expect(
      buildInitialWeekPlan({
        ability_profile,
        strategy_context: { options: [], reasons: [], warnings: [] },
      })
    ).rejects.toThrow(notImplementedMessage);

    await expect(
      buildFullTestStrategyPlans({
        ability_profile,
        strategy_context: { options: [], reasons: [], warnings: [] },
      })
    ).rejects.toThrow(notImplementedMessage);

    await expect(
      buildMiniTestNextWeekPlanFromLayer4({
        ability_profile,
        scenario_decision: {
          scenario: "normal_progress",
          reasons: [],
          warnings: [],
        },
      })
    ).rejects.toThrow(notImplementedMessage);
  });

  it("throws explicit NotImplemented errors for persistence placeholders", async () => {
    const planned_week = {
      planned_days: [],
      selected_units: [],
      total_planned_minutes: 0,
      reasons: [],
      warnings: [],
    };

    await expect(
      persistInitialLearningPathPlan({
        request: {
          trigger_type: "initial_generation",
          user_id: "user-1",
          initial_assessment: {},
        },
        planned_week,
      })
    ).rejects.toThrow(notImplementedMessage);

    await expect(
      persistSelectedFullTestPlan({
        request: {
          trigger_type: "full_test_review",
          user_id: "user-1",
          full_test_result: {},
        },
        strategy: "recommended",
        strategy_plans: { plans: [], reasons: [], warnings: [] },
      })
    ).rejects.toThrow(notImplementedMessage);

    await expect(
      persistMiniTestNextWeekPlan({
        request: {
          trigger_type: "mini_test_completion",
          user_id: "user-1",
          mini_test_result: {},
        },
        planned_week,
      })
    ).rejects.toThrow(notImplementedMessage);
  });
});
