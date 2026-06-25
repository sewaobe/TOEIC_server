import { describe, expect, it } from "@jest/globals";
import {
  allocatePartBudgets,
  buildStrategyRoutePlan,
  buildNextCycleByBeamSearch,
  calculateNodeGain,
  calculateSkillGroupDistribution,
  calculateTargetSkillGroupDistribution,
  optimizePartPath,
} from "../../src/services/learning_path_v2/layer4_route_optimizer.service";
import type {
  LearningPathStrategyPartRoadmapV2,
  LessonManagerRouteNodeV2,
  OptimizedPartPathV2,
  PartAbilityInputV2,
  PlannedRouteUnitV2,
} from "../../src/types/learning_path_v2";
import * as debugLogger from "../../src/services/learning_path_v2/learning_path_v2_debug_logger";

const partAbilities: PartAbilityInputV2[] = [
  { part_type: 1, ability: 0.7 },
  { part_type: 2, ability: 0.6 },
  { part_type: 3, ability: 0.5 },
  { part_type: 4, ability: 0.4 },
  { part_type: 5, ability: 0.3 },
  { part_type: 6, ability: 0.2 },
  { part_type: 7, ability: 0.1 },
];

const createNode = (
  id: string,
  overrides: Partial<LessonManagerRouteNodeV2> = {}
): LessonManagerRouteNodeV2 => ({
  id,
  title: id,
  part_type: 5,
  unit_type: "skill_drill",
  node_role: "normal",
  target_tags: ["Word form"],
  weight: 0.4,
  planned_completion_time: 10,
  next_unit_ids: [],
  prerequisite_unit_ids: [],
  auxiliary_unit_ids: [],
  ...overrides,
});

const createRouteUnit = (
  lessonManagerId: string,
  overrides: Partial<PlannedRouteUnitV2> = {}
): PlannedRouteUnitV2 => ({
  lesson_manager_id: lessonManagerId,
  title: lessonManagerId,
  part_type: 1,
  unit_type: "skill_drill",
  node_role: "normal",
  target_tags: ["Word form"],
  order: 0,
  planned_minutes: 10,
  estimated_gain: 1,
  reason: "test",
  ...overrides,
});

const createPartPath = (
  partType: number,
  nodes: PlannedRouteUnitV2[],
  targetMinutes = 20
): OptimizedPartPathV2 => ({
  part_type: partType,
  target_minutes: targetMinutes,
  total_minutes: nodes.reduce((sum, node) => sum + node.planned_minutes, 0),
  estimated_gain: nodes.reduce((sum, node) => sum + node.estimated_gain, 0),
  reaches_target: nodes.some(
    (node) =>
      node.score_band &&
      node.score_band.from <= 600 &&
      600 <= node.score_band.to
  ),
  nodes,
});

const createBeamRoadmaps = (
  overridesByPart: Record<number, Partial<LearningPathStrategyPartRoadmapV2>> = {}
): LearningPathStrategyPartRoadmapV2[] =>
  [1, 2, 3, 4, 5, 6, 7].map((partType) => {
    const units = [0, 1, 2].map((index) =>
      createRouteUnit(`p${partType}u${index}`, {
        part_type: partType,
        order: index,
        planned_minutes: 80,
        estimated_gain: partType === 2 || partType === 3 || partType === 6 ? 2 : 1,
        target_tags:
          partType === 2
            ? ["What question"]
            : partType === 3
              ? ["Main idea"]
              : partType === 6
                ? ["Word form"]
                : ["Word form"],
      })
    );

    return {
      part_type: partType,
      cursor_index: 0,
      target_minutes: 240,
      estimated_gain: units.reduce((sum, unit) => sum + unit.estimated_gain, 0),
      reaches_target: false,
      units,
      ...overridesByPart[partType],
    };
  });

const smallBeamConfig = {
  beam_width: 8,
  max_expansion_steps: 6,
  max_focus_part_types: 3,
  max_focus_skill_keys: 7,
  max_non_focus_part_types: 1,
  non_focus_part_penalty: 1.5,
  non_focus_unit_penalty: 0.6,
  min_learning_minutes: 120,
  ideal_learning_minutes: 240,
  max_learning_minutes: 360,
  mini_test_estimated_minutes: 0,
  full_test_estimated_minutes: 0,
};


describe("layer4_route_optimizer.service", () => {
  it("allocatePartBudgets -> recommended strategy -> allocates 60 30 10 across weak medium strong", () => {
    // Chuẩn bị
    const input = {
      strategy: "recommended" as const,
      total_available_minutes: 5400,
      part_abilities: partAbilities,
    };

    // Thực thi
    const result = allocatePartBudgets(input);

    // Kiểm tra
    expect(result.filter((item) => item.bucket === "weak")).toEqual([
      { part_type: 5, bucket: "weak", target_minutes: 1080, ability: 0.3 },
      { part_type: 6, bucket: "weak", target_minutes: 1080, ability: 0.2 },
      { part_type: 7, bucket: "weak", target_minutes: 1080, ability: 0.1 },
    ]);
    expect(result.find((item) => item.part_type === 3)?.target_minutes).toBe(810);
    expect(result.find((item) => item.part_type === 1)?.target_minutes).toBe(270);
  });

  it("allocatePartBudgets -> balanced strategy -> allocates 45 35 20", () => {
    // Chuẩn bị
    const input = {
      strategy: "balanced" as const,
      total_available_minutes: 5400,
      part_abilities: partAbilities,
    };

    // Thực thi
    const result = allocatePartBudgets(input);

    // Kiểm tra
    expect(result.find((item) => item.part_type === 7)?.target_minutes).toBe(810);
    expect(result.find((item) => item.part_type === 3)?.target_minutes).toBe(945);
    expect(result.find((item) => item.part_type === 1)?.target_minutes).toBe(540);
  });

  it("allocatePartBudgets -> opportunity strategy -> allocates 30 50 20", () => {
    // Chuẩn bị
    const input = {
      strategy: "opportunity" as const,
      total_available_minutes: 5400,
      part_abilities: partAbilities,
    };

    // Thực thi
    const result = allocatePartBudgets(input);

    // Kiểm tra
    expect(result.find((item) => item.part_type === 7)?.target_minutes).toBe(540);
    expect(result.find((item) => item.part_type === 3)?.target_minutes).toBe(1350);
    expect(result.find((item) => item.part_type === 1)?.target_minutes).toBe(540);
  });

  it("allocatePartBudgets -> missing 7 parts -> throws clear error", () => {
    // Chuẩn bị
    const input = {
      strategy: "recommended" as const,
      total_available_minutes: 5400,
      part_abilities: partAbilities.slice(0, 6),
    };

    // Thực thi
    const action = () => allocatePartBudgets(input);

    // Kiểm tra
    expect(action).toThrow("Layer 4");
  });

  it("allocatePartBudgets -> equal abilities -> still produces deterministic buckets", () => {
    // Chuẩn bị
    const equalAbilities = partAbilities.map((part) => ({ ...part, ability: 0.5 }));

    // Thực thi
    const result = allocatePartBudgets({
      strategy: "recommended",
      total_available_minutes: 700,
      part_abilities: equalAbilities,
    });

    // Kiểm tra
    expect(result.map((item) => [item.part_type, item.bucket])).toEqual([
      [1, "weak"],
      [2, "weak"],
      [3, "weak"],
      [4, "medium"],
      [5, "medium"],
      [6, "strong"],
      [7, "strong"],
    ]);
  });

  it("calculateSkillGroupDistribution -> multiple target tags -> uses all tags not only first tag", () => {
    // Chuẩn bị
    const tags = ["Word form", "Vocabulary", "Relative clause"];

    // Thực thi
    const result = calculateSkillGroupDistribution(tags, 5);

    // Kiểm tra
    expect(result).toEqual({
      basic: 1 / 3,
      core: 1 / 3,
      advanced: 1 / 3,
    });
  });

  it("calculateTargetSkillGroupDistribution -> target 600 -> returns 25 55 20", () => {
    // Chuẩn bị
    const targetScore = 600;

    // Thực thi
    const result = calculateTargetSkillGroupDistribution(targetScore);

    // Kiểm tra
    expect(result).toEqual({ basic: 0.25, core: 0.55, advanced: 0.2 });
  });

  it("calculateNodeGain -> onboarding node near ability -> gives higher gain than too-hard node", () => {
    // Chuẩn bị
    const nearNode = createNode("near", { weight: 0.42, unit_type: "foundation" });
    const hardNode = createNode("hard", { weight: 0.95, unit_type: "foundation" });

    // Thực thi
    const nearGain = calculateNodeGain({
      node: nearNode,
      scenario: "ONBOARDING",
      strategy: "recommended",
      target_score: 500,
      part_ability: 0.4,
    });
    const hardGain = calculateNodeGain({
      node: hardNode,
      scenario: "ONBOARDING",
      strategy: "recommended",
      target_score: 500,
      part_ability: 0.4,
    });

    // Kiểm tra
    expect(nearGain).toBeGreaterThan(hardGain);
  });

  it("calculateNodeGain -> pre-deadline exam practice -> gives higher gain than foundation", () => {
    // Chuẩn bị
    const examNode = createNode("exam", {
      unit_type: "exam_practice",
      planned_completion_time: 10,
    });
    const foundationNode = createNode("foundation", {
      unit_type: "foundation",
      planned_completion_time: 10,
    });

    // Thực thi
    const examGain = calculateNodeGain({
      node: examNode,
      scenario: "PRE_DEADLINE",
      strategy: "balanced",
      target_score: 800,
      part_ability: 0.4,
    });
    const foundationGain = calculateNodeGain({
      node: foundationNode,
      scenario: "PRE_DEADLINE",
      strategy: "balanced",
      target_score: 800,
      part_ability: 0.4,
    });

    // Kiểm tra
    expect(examGain).toBeGreaterThan(foundationGain);
  });

  it("calculateNodeGain -> behind schedule shorter efficient node -> favors efficiency", () => {
    // Chuẩn bị
    const shortNode = createNode("short", { planned_completion_time: 5 });
    const longNode = createNode("long", { planned_completion_time: 30 });

    // Thực thi
    const shortGain = calculateNodeGain({
      node: shortNode,
      scenario: "BEHIND_SCHEDULE",
      strategy: "balanced",
      target_score: 650,
      part_ability: 0.4,
    });
    const longGain = calculateNodeGain({
      node: longNode,
      scenario: "BEHIND_SCHEDULE",
      strategy: "balanced",
      target_score: 650,
      part_ability: 0.4,
    });

    // Kiểm tra
    expect(shortGain).toBeGreaterThan(longGain);
  });

  it("optimizePartPath -> ability near middle node weight -> starts near matching weight instead of lowest root node", () => {
    // Chuẩn bị
    const nodes = [
      createNode("a", { weight: 0.1, next_unit_ids: ["b"] }),
      createNode("b", { weight: 0.35 }),
      createNode("c", { weight: 0.6 }),
    ];

    // Thực thi
    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 30,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.58,
      nodes_of_part: nodes,
    });

    // Kiểm tra
    expect(result.nodes[0]?.lesson_manager_id).toBe("c");
  });

  it("optimizePartPath -> runtime start candidate has prerequisites -> prepends prerequisite chain", () => {
    // Chuẩn bị
    const nodes = [
      createNode("a", { weight: 0.1, next_unit_ids: ["b"] }),
      createNode("b", {
        weight: 0.35,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["c"],
      }),
      createNode("c", { weight: 0.6, prerequisite_unit_ids: ["b"] }),
    ];

    // Thực thi
    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 40,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.6,
      nodes_of_part: nodes,
    });

    // Kiểm tra
    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual(["a", "b", "c"]);
  });

  it("optimizePartPath -> completed prerequisite -> does not prepend completed prerequisite", () => {
    // Chuẩn bị
    const nodes = [
      createNode("a", { weight: 0.1, next_unit_ids: ["b"] }),
      createNode("b", {
        weight: 0.35,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["c"],
      }),
      createNode("c", { weight: 0.6, prerequisite_unit_ids: ["b"] }),
    ];

    // Thực thi
    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 40,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.6,
      nodes_of_part: nodes,
      completed_unit_ids: ["a"],
    });

    // Kiểm tra
    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual(["b", "c"]);
  });

  it("optimizePartPath -> missing prerequisite node -> throws Vietnamese error", () => {
    // Chuẩn bị
    const nodes = [createNode("c", { weight: 0.6, prerequisite_unit_ids: ["missing-id"] })];

    // Thực thi
    const action = () =>
      optimizePartPath({
        part_type: 5,
        part_budget_minutes: 30,
        scenario: "NORMAL_PROGRESS",
        strategy: "balanced",
        target_score: 600,
        part_ability: 0.6,
        nodes_of_part: nodes,
      });

    // Kiểm tra
    expect(action).toThrow("prerequisite node");
  });

  it("optimizePartPath -> prerequisite cycle -> throws Vietnamese error", () => {
    // Chuẩn bị
    const nodes = [
      createNode("a", { weight: 0.6, prerequisite_unit_ids: ["b"] }),
      createNode("b", { weight: 0.55, prerequisite_unit_ids: ["a"] }),
    ];

    // Thực thi
    const action = () =>
      optimizePartPath({
        part_type: 5,
        part_budget_minutes: 30,
        scenario: "NORMAL_PROGRESS",
        strategy: "balanced",
        target_score: 600,
        part_ability: 0.6,
        nodes_of_part: nodes,
      });

    // Kiểm tra
    expect(action).toThrow("prerequisite");
  });

  it("optimizePartPath -> score_band covers target_score -> reaches_target true", () => {
    // Chuẩn bị
    const nodes = [
      createNode("a", {
        weight: 0.6,
        score_band: { from: 590, to: 620 },
      }),
    ];

    // Thực thi
    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 30,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.6,
      nodes_of_part: nodes,
    });

    // Kiểm tra
    expect(result.reaches_target).toBe(true);
  });

  it("optimizePartPath -> node weight closest to ability but prefix exceeds budget -> skips that prefix and chooses valid alternative", () => {
    // Chuẩn bị
    const nodes = [
      createNode("a", {
        weight: 0.1,
        planned_completion_time: 20,
        next_unit_ids: ["b"],
      }),
      createNode("b", {
        weight: 0.35,
        planned_completion_time: 20,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["c"],
      }),
      createNode("c", {
        weight: 0.6,
        planned_completion_time: 20,
        prerequisite_unit_ids: ["b"],
      }),
      createNode("d", { weight: 0.52, planned_completion_time: 10 }),
    ];

    // Thực thi
    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 30,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.6,
      nodes_of_part: nodes,
    });

    // Kiểm tra
    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual(["d"]);
    expect(result.total_minutes).toBeLessThanOrEqual(30);
  });

  it("optimizePartPath -> graph has cycle -> does not loop forever", () => {
    // Chuẩn bị
    const nodes = [
      createNode("a", { weight: 0.4, next_unit_ids: ["b"] }),
      createNode("b", {
        weight: 0.45,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["a"],
      }),
    ];

    // Thực thi
    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 100,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.4,
      nodes_of_part: nodes,
    });

    // Kiểm tra
    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual(["a", "b"]);
  });

  it("optimizePartPath -> next candidate expands missing prerequisite closure inside route", () => {
    const nodes = [
      createNode("a", { weight: 0.1, next_unit_ids: ["b"] }),
      createNode("b", {
        weight: 0.2,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["c"],
      }),
      createNode("c", {
        weight: 0.3,
        prerequisite_unit_ids: ["b"],
        next_unit_ids: ["d", "f"],
      }),
      createNode("m", { weight: 0.45 }),
      createNode("e", {
        weight: 0.55,
        prerequisite_unit_ids: ["m"],
      }),
      createNode("d", {
        weight: 0.9,
        prerequisite_unit_ids: ["e"],
      }),
      createNode("f", {
        weight: 0.35,
        prerequisite_unit_ids: ["c"],
      }),
    ];

    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 80,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.4,
      nodes_of_part: nodes,
      start_unit_ids: ["a"],
    });

    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual([
      "a",
      "b",
      "c",
      "m",
      "e",
      "d",
    ]);
  });

  it("optimizePartPath -> missing prerequisite closure exceeding budget falls back to best reachable terminal route", () => {
    const nodes = [
      createNode("a", { weight: 0.1, next_unit_ids: ["b"] }),
      createNode("b", {
        weight: 0.2,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["c"],
      }),
      createNode("c", {
        weight: 0.3,
        prerequisite_unit_ids: ["b"],
        next_unit_ids: ["d", "f"],
      }),
      createNode("m", { weight: 0.45 }),
      createNode("e", {
        weight: 0.55,
        prerequisite_unit_ids: ["m"],
      }),
      createNode("d", {
        weight: 0.9,
        prerequisite_unit_ids: ["e"],
      }),
      createNode("f", {
        weight: 0.35,
        prerequisite_unit_ids: ["c"],
      }),
    ];

    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 45,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.4,
      nodes_of_part: nodes,
      start_unit_ids: ["a"],
    });

    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual([
      "a",
      "b",
      "c",
      "f",
    ]);
    expect(result.total_minutes).toBeLessThanOrEqual(45);
  });

  it("optimizePartPath -> target reached terminal path stops before later expansions", () => {
    const nodes = [
      createNode("a", {
        weight: 0.2,
        next_unit_ids: ["b"],
      }),
      createNode("b", {
        weight: 0.3,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["c"],
        score_band: { from: 590, to: 620 },
      }),
      createNode("c", {
        weight: 0.95,
        prerequisite_unit_ids: ["b"],
      }),
    ];

    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 100,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.3,
      nodes_of_part: nodes,
      start_unit_ids: ["a"],
    });

    expect(result.reaches_target).toBe(true);
    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual(["a", "b"]);
  });

  it("optimizePartPath -> debug log includes terminal candidate paths and marks best path", () => {
    const logSpy = jest.spyOn(debugLogger, "logLearningPathV2DebugSafe");
    logSpy.mockClear();
    const nodes = [
      createNode("a", { weight: 0.1, next_unit_ids: ["b"] }),
      createNode("b", {
        weight: 0.2,
        prerequisite_unit_ids: ["a"],
        next_unit_ids: ["c"],
      }),
      createNode("c", {
        weight: 0.3,
        prerequisite_unit_ids: ["b"],
        next_unit_ids: ["d", "f"],
      }),
      createNode("m", { weight: 0.45 }),
      createNode("e", {
        weight: 0.55,
        prerequisite_unit_ids: ["m"],
      }),
      createNode("d", {
        weight: 0.9,
        prerequisite_unit_ids: ["e"],
      }),
      createNode("f", {
        weight: 0.35,
        prerequisite_unit_ids: ["c"],
      }),
    ];

    optimizePartPath({
      part_type: 5,
      part_budget_minutes: 80,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.4,
      nodes_of_part: nodes,
      start_unit_ids: ["a"],
    });

    const candidateLogCall = logSpy.mock.calls.find(
      ([event]) => event === "layer4.part_path.all_candidate_paths"
    );

    expect(candidateLogCall).toBeTruthy();
    const payload = candidateLogCall?.[1] as {
      terminal_path_count: number;
      best_path_ids: string[];
      paths: Array<{
        is_best: boolean;
        stop_reason: string;
        nodes: Array<{ lesson_manager_id: string }>;
      }>;
    };

    expect(payload.terminal_path_count).toBe(2);
    expect(payload.best_path_ids).toEqual(["a", "b", "c", "m", "e", "d"]);
    expect(payload.paths[0]).toEqual(
      expect.objectContaining({
        is_best: true,
        stop_reason: "no_expandable_next",
      })
    );
    expect(payload.paths.map((path) =>
      path.nodes.map((node) => node.lesson_manager_id)
    )).toEqual(
      expect.arrayContaining([
        ["a", "b", "c", "m", "e", "d"],
        ["a", "b", "c", "f"],
      ])
    );

    logSpy.mockRestore();
  });

  it("optimizePartPath -> debug log only keeps top 20 candidate paths", () => {
    const logSpy = jest.spyOn(debugLogger, "logLearningPathV2DebugSafe");
    logSpy.mockClear();

    const nodes: LessonManagerRouteNodeV2[] = [
      createNode("s", {
        weight: 0.2,
        next_unit_ids: Array.from({ length: 30 }, (_, index) => `n${index}`),
      }),
      ...Array.from({ length: 30 }, (_, index) =>
        createNode(`n${index}`, {
          weight: 0.3 + index * 0.01,
          prerequisite_unit_ids: ["s"],
          next_unit_ids: [],
        })
      ),
    ];

    optimizePartPath({
      part_type: 5,
      part_budget_minutes: 100,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.4,
      nodes_of_part: nodes,
      start_unit_ids: ["s"],
    });

    const candidateLogCall = logSpy.mock.calls.find(
      ([event]) => event === "layer4.part_path.all_candidate_paths"
    );

    expect(candidateLogCall).toBeTruthy();

    const payload = candidateLogCall?.[1] as {
      terminal_path_count: number;
      logged_path_count: number;
      debug_path_limit: number;
      paths: unknown[];
    };

    expect(payload.terminal_path_count).toBeGreaterThan(20);
    expect(payload.debug_path_limit).toBe(20);
    expect(payload.logged_path_count).toBeLessThanOrEqual(20);
    expect(payload.paths.length).toBeLessThanOrEqual(20);

    logSpy.mockRestore();
  });





  it("buildStrategyRoutePlan -> valid nodes and abilities -> returns 7 part roadmaps", () => {
    // Chuẩn bị
    const nodes = partAbilities.map((part) =>
      createNode(`p${part.part_type}-a`, {
        part_type: part.part_type,
        node_role: "normal",
      })
    );

    // Thực thi
    const result = buildStrategyRoutePlan({
      strategy: "recommended",
      scenario: "ONBOARDING",
      target_score: 600,
      total_available_minutes: 100,
      part_abilities: partAbilities,
      lesson_manager_nodes: nodes,
    });

    // Kiểm tra
    expect(result.part_roadmaps).toHaveLength(7);
    expect(result.part_roadmaps.flatMap((roadmap) => roadmap.units).length).toBeGreaterThan(0);
    expect(
      result.part_roadmaps.every((roadmap) =>
        roadmap.units.every((unit, index) => unit.order === index)
      )
    ).toBe(true);
    expect(result.estimated_total_minutes).toBeLessThanOrEqual(100);
  });

  it("buildStrategyRoutePlan -> target_score 510 -> part_roadmaps do not exceed target boundary", () => {
    const nodes = partAbilities.flatMap((part) => {
      const partType = part.part_type;

      return [
        createNode(`p${partType}-a`, {
          part_type: partType,
          weight: 0.1,
          score_band: { from: 420, to: 460 },
          next_unit_ids: [`p${partType}-b`],
        }),
        createNode(`p${partType}-b`, {
          part_type: partType,
          weight: 0.35,
          score_band: { from: 460, to: 500 },
          prerequisite_unit_ids: [`p${partType}-a`],
          next_unit_ids: [`p${partType}-c`],
        }),
        createNode(`p${partType}-c`, {
          part_type: partType,
          weight: 0.5,
          score_band: { from: 500, to: 530 },
          prerequisite_unit_ids: [`p${partType}-b`],
          next_unit_ids: [`p${partType}-d`],
        }),
        createNode(`p${partType}-d`, {
          part_type: partType,
          weight: 0.65,
          score_band: { from: 530, to: 560 },
          prerequisite_unit_ids: [`p${partType}-c`],
          next_unit_ids: [`p${partType}-e`],
        }),
        createNode(`p${partType}-e`, {
          part_type: partType,
          weight: 0.9,
          score_band: { from: 810, to: 830 },
          prerequisite_unit_ids: [`p${partType}-d`],
        }),
      ];
    });

    const result = buildStrategyRoutePlan({
      strategy: "recommended",
      scenario: "ONBOARDING",
      target_score: 510,
      total_available_minutes: 700,
      part_abilities: partAbilities,
      lesson_manager_nodes: nodes,
    });

    const roadmapUnits = result.part_roadmaps.flatMap((roadmap) => roadmap.units);

    expect(
      roadmapUnits.every((unit) => {
        if (!unit.score_band) return true;
        return (unit.score_band.from ?? 0) <= 510;
      })
    ).toBe(true);
    expect(roadmapUnits.some((unit) => unit.score_band?.from === 500)).toBe(
      true
    );
    expect(roadmapUnits.some((unit) => unit.score_band?.from === 530)).toBe(
      false
    );
    expect(roadmapUnits.some((unit) => unit.score_band?.from === 810)).toBe(
      false
    );
    expect(result.reaches_target).toBe(true);
  });

  it("buildStrategyRoutePlan -> recommended strategy -> output has summary reasons and focus metadata", () => {
    // Chuẩn bị
    const nodes = partAbilities.map((part) =>
      createNode(`p${part.part_type}-a`, {
        part_type: part.part_type,
        node_role: "normal",
      })
    );

    // Thực thi
    const result = buildStrategyRoutePlan({
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      target_score: 600,
      total_available_minutes: 100,
      part_abilities: partAbilities,
      lesson_manager_nodes: nodes,
    });

    // Kiểm tra
    expect(result.summary_reasons.some((reason) => reason.includes("Part"))).toBe(true);
    expect(result.focus_part_types).toEqual([5, 6, 7]);
    expect(result.part_roadmaps).toHaveLength(7);
    expect(result).not.toHaveProperty("ability_highlights");
  });

  it("buildStrategyRoutePlan -> focus_skill_keys only come from focus_part_types", () => {
    const customPartAbilities: PartAbilityInputV2[] = [
      { part_type: 1, ability: 0.7 },
      { part_type: 2, ability: 0.1 },
      { part_type: 3, ability: 0.2 },
      { part_type: 4, ability: 0.8 },
      { part_type: 5, ability: 0.9 },
      { part_type: 6, ability: 0.3 },
      { part_type: 7, ability: 0.6 },
    ];
    const nodes = customPartAbilities.map((part) =>
      createNode(`p${part.part_type}-a`, {
        part_type: part.part_type,
        target_tags:
          part.part_type === 5
            ? ["part5_to_infinitive"]
            : [`part${part.part_type}_word_form_question`],
      })
    );

    const result = buildStrategyRoutePlan({
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      target_score: 600,
      total_available_minutes: 100,
      part_abilities: customPartAbilities,
      lesson_manager_nodes: nodes,
    });

    expect(result.focus_part_types).toEqual([2, 3, 6]);
    expect(result.focus_skill_keys).not.toContain("part5_to_infinitive");
  });

  it("optimizePartPath -> runtime start candidates are limited to top five", () => {
    // Chuẩn bị
    // 5 node đầu có weight rất gần ability nên sẽ đứng top 5 runtime candidates.
    // Nhưng mỗi node đều có prerequisite chain quá dài khiến prefix vượt budget.
    // Candidate thứ 6 fit budget nhưng bị bỏ qua vì không nằm trong top 5 runtime starts.
    const nodes = [
      createNode("p1", {
        weight: 0.1,
        planned_completion_time: 20,
      }),
      createNode("c1", {
        weight: 0.6,
        planned_completion_time: 20,
        prerequisite_unit_ids: ["p1"],
      }),

      createNode("p2", {
        weight: 0.11,
        planned_completion_time: 20,
      }),
      createNode("c2", {
        weight: 0.59,
        planned_completion_time: 20,
        prerequisite_unit_ids: ["p2"],
      }),

      createNode("p3", {
        weight: 0.12,
        planned_completion_time: 20,
      }),
      createNode("c3", {
        weight: 0.58,
        planned_completion_time: 20,
        prerequisite_unit_ids: ["p3"],
      }),

      createNode("p4", {
        weight: 0.13,
        planned_completion_time: 20,
      }),
      createNode("c4", {
        weight: 0.57,
        planned_completion_time: 20,
        prerequisite_unit_ids: ["p4"],
      }),

      createNode("p5", {
        weight: 0.14,
        planned_completion_time: 20,
      }),
      createNode("c5", {
        weight: 0.56,
        planned_completion_time: 20,
        prerequisite_unit_ids: ["p5"],
      }),

      // Candidate thứ 6 xa ability hơn một chút, nhưng fit budget.
      createNode("valid", {
        weight: 0.5,
        planned_completion_time: 10,
      }),
    ];

    // Thực thi
    const result = optimizePartPath({
      part_type: 5,
      part_budget_minutes: 30,
      scenario: "NORMAL_PROGRESS",
      strategy: "balanced",
      target_score: 600,
      part_ability: 0.6,
      nodes_of_part: nodes,
    });

    // Kiểm tra
    expect(result.nodes).toEqual([]);
    expect(result.total_minutes).toBe(0);
  });

  it("buildNextCycleByBeamSearch -> selects focused units from part roadmaps", () => {
    const result = buildNextCycleByBeamSearch({
      part_roadmaps: createBeamRoadmaps(),
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      focus_part_types: [2, 3, 6],
      mini_tests_completed_since_last_full_test: 0,
      config: smallBeamConfig,
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.assessment.type).toBe("mini_test");
    expect(result.selected_roadmap_units.length).toBeGreaterThan(0);
    expect(result.selected_roadmap_units.some((unit) => [2, 3, 6].includes(unit.part_type))).toBe(true);
    expect(result.focus_part_types.every((partType) => [2, 3, 6].includes(partType))).toBe(true);
    expect(result.selected_roadmap_positions.length).toBeGreaterThan(0);
    expect(result.beam_search_debug?.candidate_count).toBeGreaterThan(0);
  });

  it("buildNextCycleByBeamSearch -> penalizes non-focus parts even when total parts is within max", () => {
    const roadmaps = createBeamRoadmaps({
      2: {
        units: [
          createRouteUnit("p2-focus", {
            part_type: 2,
            planned_minutes: 80,
            estimated_gain: 2,
          }),
        ],
      },
      3: {
        units: [
          createRouteUnit("p3-focus", {
            part_type: 3,
            planned_minutes: 80,
            estimated_gain: 2,
          }),
        ],
      },
      5: {
        units: [
          createRouteUnit("p5-non-focus", {
            part_type: 5,
            planned_minutes: 80,
            estimated_gain: 3,
          }),
        ],
      },
      7: {
        units: [
          createRouteUnit("p7-non-focus", {
            part_type: 7,
            planned_minutes: 80,
            estimated_gain: 3,
          }),
        ],
      },
    });

    const result = buildNextCycleByBeamSearch({
      part_roadmaps: roadmaps,
      strategy: "recommended",
      scenario: "ONBOARDING",
      focus_part_types: [2, 3, 6],
      mini_tests_completed_since_last_full_test: 0,
      config: {
        ...smallBeamConfig,
        max_expansion_steps: 3,
        max_learning_minutes: 240,
      },
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    const nonFocusParts = result.focus_part_types.filter(
      (part) => ![2, 3, 6].includes(part)
    );
    expect(nonFocusParts.length).toBeLessThanOrEqual(1);
    expect(result.focus_part_types.some((part) => [2, 3, 6].includes(part))).toBe(true);
  });

  it("buildNextCycleByBeamSearch -> rewards coverage across focus parts", () => {
    const roadmaps = createBeamRoadmaps({
      1: { units: [] },
      2: { units: [] },
      3: {
        units: [
          createRouteUnit("p3-coverage", {
            part_type: 3,
            planned_minutes: 80,
            estimated_gain: 1.6,
            target_tags: ["Main idea"],
          }),
        ],
      },
      4: { units: [] },
      5: { units: [] },
      6: {
        units: [
          createRouteUnit("p6-high-1", {
            part_type: 6,
            planned_minutes: 80,
            estimated_gain: 2,
            target_tags: ["Word form"],
          }),
          createRouteUnit("p6-high-2", {
            part_type: 6,
            planned_minutes: 80,
            estimated_gain: 2,
            target_tags: ["Vocabulary"],
          }),
        ],
      },
      7: {
        units: [
          createRouteUnit("p7-high-1", {
            part_type: 7,
            planned_minutes: 80,
            estimated_gain: 2,
            target_tags: ["Inference"],
          }),
          createRouteUnit("p7-high-2", {
            part_type: 7,
            planned_minutes: 80,
            estimated_gain: 2,
            target_tags: ["Information"],
          }),
        ],
      },
    });

    const result = buildNextCycleByBeamSearch({
      part_roadmaps: roadmaps,
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      focus_part_types: [3, 6, 7],
      mini_tests_completed_since_last_full_test: 0,
      config: {
        ...smallBeamConfig,
        beam_width: 8,
        max_expansion_steps: 4,
        max_focus_part_types: 3,
        min_learning_minutes: 160,
        ideal_learning_minutes: 240,
        max_learning_minutes: 320,
      },
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.selected_roadmap_units.map((unit) => unit.part_type)).toEqual(
      expect.arrayContaining([3, 6, 7])
    );
    expect(result.focus_part_types).toEqual([3, 6, 7]);
    expect(result.beam_search_debug).toEqual(
      expect.objectContaining({
        focus_part_coverage_ratio: 1,
        focus_score: expect.any(Number),
        focus_unit_score: expect.any(Number),
        focus_part_coverage_score: expect.any(Number),
        time_score: expect.any(Number),
        spread_penalty: expect.any(Number),
      })
    );
  });

  it("buildNextCycleByBeamSearch -> does not exceed max_focus_part_types", () => {
    const result = buildNextCycleByBeamSearch({
      part_roadmaps: createBeamRoadmaps(),
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      focus_part_types: [2, 3, 6],
      mini_tests_completed_since_last_full_test: 0,
      config: {
        ...smallBeamConfig,
        max_focus_part_types: 3,
        max_expansion_steps: 10,
        min_learning_minutes: 320,
        ideal_learning_minutes: 360,
        max_learning_minutes: 420,
      },
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.focus_part_types.length).toBeLessThanOrEqual(3);
  });

  it("buildNextCycleByBeamSearch -> keeps earlier high-score terminal state instead of forcing extra weak expansion", () => {
    const result = buildNextCycleByBeamSearch({
      part_roadmaps: createBeamRoadmaps({
        1: { units: [] },
        2: {
          units: [
            createRouteUnit("p2-terminal-focus", {
              part_type: 2,
              planned_minutes: 120,
              estimated_gain: 3,
            }),
          ],
        },
        3: {
          units: [
            createRouteUnit("p3-terminal-focus", {
              part_type: 3,
              planned_minutes: 120,
              estimated_gain: 3,
            }),
          ],
        },
        4: { units: [] },
        5: {
          units: [
            createRouteUnit("p5-weak-extra", {
              part_type: 5,
              planned_minutes: 80,
              estimated_gain: 0.1,
            }),
          ],
        },
        6: {
          units: [
            createRouteUnit("p6-terminal-focus", {
              part_type: 6,
              planned_minutes: 120,
              estimated_gain: 3,
            }),
          ],
        },
        7: { units: [] },
      }),
      strategy: "recommended",
      scenario: "ONBOARDING",
      focus_part_types: [2, 3, 6],
      mini_tests_completed_since_last_full_test: 0,
      config: {
        ...smallBeamConfig,
        beam_width: 8,
        max_expansion_steps: 4,
        max_focus_part_types: 4,
        min_learning_minutes: 300,
        ideal_learning_minutes: 360,
        max_learning_minutes: 520,
        non_focus_unit_penalty: 2,
      },
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.selected_roadmap_units.map((unit) => unit.part_type)).toEqual(
      expect.arrayContaining([2, 3, 6])
    );
    expect(result.selected_roadmap_units.some((unit) => unit.part_type === 5)).toBe(false);
    expect(result.focus_part_types).toEqual([2, 3, 6]);
  });

  it("buildNextCycleByBeamSearch -> respects existing per-part cursor", () => {
    const result = buildNextCycleByBeamSearch({
      part_roadmaps: createBeamRoadmaps({
        2: { cursor_index: 1 },
      }),
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      focus_part_types: [2],
      mini_tests_completed_since_last_full_test: 0,
      config: smallBeamConfig,
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    const selectedIds = result.selected_roadmap_units.map((unit) => unit.lesson_manager_id);
    expect(selectedIds).not.toContain("p2u0");
    expect(result.selected_roadmap_positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          part_type: 2,
          from_cursor_index: 1,
        }),
      ])
    );
  });

  it("buildNextCycleByBeamSearch -> mini count 3 returns full test", () => {
    const result = buildNextCycleByBeamSearch({
      part_roadmaps: createBeamRoadmaps(),
      strategy: "balanced",
      scenario: "NORMAL_PROGRESS",
      focus_part_types: [2, 3, 6],
      mini_tests_completed_since_last_full_test: 3,
      config: smallBeamConfig,
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.assessment.type).toBe("full_test");
  });

  it("buildNextCycleByBeamSearch -> exhausted roadmaps return route_completed", () => {
    const roadmaps = createBeamRoadmaps().map((roadmap) => ({
      ...roadmap,
      cursor_index: roadmap.units.length,
    }));

    const result = buildNextCycleByBeamSearch({
      part_roadmaps: roadmaps,
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      focus_part_types: [2, 3, 6],
      mini_tests_completed_since_last_full_test: 0,
      config: smallBeamConfig,
    });

    expect(result).toEqual({
      plan_type: "route_completed",
      selected_roadmap_units: [],
      assessment: null,
      reason: "Tất cả Part roadmap đã hết bài học để tạo cycle.",
    });
  });

  it("buildNextCycleByBeamSearch -> reserves assessment minutes from learning budget", () => {
    const roadmaps = createBeamRoadmaps({
      2: {
        units: [
          createRouteUnit("p2-large-1", { part_type: 2, planned_minutes: 600, estimated_gain: 5 }),
          createRouteUnit("p2-large-2", { part_type: 2, planned_minutes: 850, estimated_gain: 5 }),
        ],
      },
    });

    const result = buildNextCycleByBeamSearch({
      part_roadmaps: roadmaps,
      strategy: "recommended",
      scenario: "NORMAL_PROGRESS",
      focus_part_types: [2],
      mini_tests_completed_since_last_full_test: 0,
      config: {
        ...smallBeamConfig,
        min_learning_minutes: 480,
        ideal_learning_minutes: 900,
        max_learning_minutes: 1500,
        mini_test_estimated_minutes: 100,
      },
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.assessment.type).toBe("mini_test");
    expect(result.estimated_learning_minutes).toBeLessThanOrEqual(1400);
  });
});




