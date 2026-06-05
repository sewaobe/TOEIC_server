import { describe, expect, it } from "@jest/globals";
import {
  allocatePartBudgets,
  buildStrategyRoutePlan,
  buildNextCyclePlan,
  calculateCloseCycleScore,
  calculateNodeGain,
  calculateSkillGroupDistribution,
  calculateTargetSkillGroupDistribution,
  cutLearningCycle,
  getCycleFocusSkillKeys,
  mergePartPathsToRoute,
  optimizePartPath,
} from "../../src/services/learning_path_v2/layer4_route_optimizer.service";
import type {
  LessonManagerRouteNodeV2,
  OptimizedPartPathV2,
  PartAbilityInputV2,
  PlannedRouteUnitV2,
} from "../../src/types/learning_path_v2";

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
    expect(action).toThrow("Layer 4 cần đúng 7 part abilities cho Part 1..7.");
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
    expect(action).toThrow("Thiếu prerequisite node");
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
    expect(action).toThrow("vòng lặp prerequisite");
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

  it("mergePartPathsToRoute -> seven ordered part paths -> preserves order inside each part", () => {
    // Chuẩn bị
    const paths = Array.from({ length: 7 }, (_, index) => {
      const partType = index + 1;
      return createPartPath(partType, [
        createRouteUnit(`p${partType}-a`, { part_type: partType }),
        createRouteUnit(`p${partType}-b`, { part_type: partType }),
      ]);
    });

    // Thực thi
    const result = mergePartPathsToRoute({
      part_paths: paths,
      target_minutes_by_part: Object.fromEntries(paths.map((path) => [path.part_type, 20])),
      total_available_minutes: 200,
    });

    // Kiểm tra
    for (let partType = 1; partType <= 7; partType += 1) {
      const ids = result
        .filter((unit) => unit.part_type === partType)
        .map((unit) => unit.lesson_manager_id);
      expect(ids).toEqual([`p${partType}-a`, `p${partType}-b`]);
    }
  });

  it("mergePartPathsToRoute -> part progress ratio lower -> picks that part next", () => {
    // Chuẩn bị
    const paths = [
      createPartPath(1, [
        createRouteUnit("p1-a", { part_type: 1, planned_minutes: 10 }),
        createRouteUnit("p1-b", { part_type: 1, planned_minutes: 10 }),
      ], 10),
      createPartPath(2, [
        createRouteUnit("p2-a", { part_type: 2, planned_minutes: 10 }),
        createRouteUnit("p2-b", { part_type: 2, planned_minutes: 10 }),
      ], 100),
    ];

    // Thực thi
    const result = mergePartPathsToRoute({
      part_paths: paths,
      target_minutes_by_part: { 1: 10, 2: 100 },
      total_available_minutes: 40,
    });

    // Kiểm tra
    expect(result.map((unit) => unit.lesson_manager_id).slice(0, 3)).toEqual([
      "p1-a",
      "p2-a",
      "p2-b",
    ]);
  });

  it("mergePartPathsToRoute -> tie candidates -> uses deterministic tie breaker", () => {
    // Chuẩn bị
    const paths = [
      createPartPath(1, [
        createRouteUnit("p1-a", { part_type: 1, estimated_gain: 1, planned_minutes: 10 }),
      ]),
      createPartPath(2, [
        createRouteUnit("p2-a", { part_type: 2, estimated_gain: 2, planned_minutes: 10 }),
      ]),
    ];

    // Thực thi
    const result = mergePartPathsToRoute({
      part_paths: paths,
      target_minutes_by_part: { 1: 20, 2: 20 },
      total_available_minutes: 20,
      part_abilities: [
        { part_type: 1, ability: 0.1 },
        { part_type: 2, ability: 0.9 },
      ],
    });

    // Kiểm tra
    expect(result[0].lesson_manager_id).toBe("p2-a");
  });

  it("mergePartPathsToRoute -> next node exceeds total budget -> stops before exceeding budget", () => {
    // Chuẩn bị
    const paths = [
      createPartPath(1, [
        createRouteUnit("p1-a", { part_type: 1, planned_minutes: 10 }),
        createRouteUnit("p1-b", { part_type: 1, planned_minutes: 15 }),
      ]),
    ];

    // Thực thi
    const result = mergePartPathsToRoute({
      part_paths: paths,
      target_minutes_by_part: { 1: 20 },
      total_available_minutes: 20,
    });

    // Kiểm tra
    expect(result.map((unit) => unit.lesson_manager_id)).toEqual(["p1-a"]);
    expect(result.reduce((sum, unit) => sum + unit.planned_minutes, 0)).toBeLessThanOrEqual(20);
  });

  it("buildStrategyRoutePlan -> valid nodes and abilities -> returns flattened route units", () => {
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
    expect(result.route_units.length).toBeGreaterThan(0);
    expect(result.route_units.every((unit, index) => unit.order === index)).toBe(true);
    expect(result.estimated_total_minutes).toBeLessThanOrEqual(100);
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
    expect(result.summary_reasons).toContain(
      "Ưu tiên các Part yếu theo kết quả năng lực hiện tại."
    );
    expect(result.focus_part_types).toEqual([5, 6, 7]);
    expect(result.ability_highlights).toHaveLength(7);
  });

  it("optimizePartPath -> top five runtime candidates exceed budget -> still considers later valid candidate", () => {
    // Chuẩn bị
    // 5 node đầu có weight rất gần ability nên sẽ đứng top 5 runtime candidates.
    // Nhưng mỗi node đều có prerequisite chain quá dài khiến prefix vượt budget.
    // Nếu buildRuntimeStartPaths còn slice(0, 5), hàm sẽ bỏ lỡ node valid thứ 6.
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
    expect(result.nodes.map((node) => node.lesson_manager_id)).toEqual(["valid"]);
    expect(result.total_minutes).toBeLessThanOrEqual(30);
  });

  it("calculateCloseCycleScore -> ideal minutes and good skill count and low next overlap -> returns high score", () => {
    // Chuẩn bị
    const cycleUnits = [
      createRouteUnit("u1", {
        part_type: 5,
        planned_minutes: 100,
        target_tags: ["Word form"],
      }),
      createRouteUnit("u2", {
        part_type: 5,
        planned_minutes: 100,
        target_tags: ["Vocabulary"],
      }),
      createRouteUnit("u3", {
        part_type: 5,
        planned_minutes: 100,
        target_tags: ["Relative clause"],
      }),
    ];
    const nextUnit = createRouteUnit("next", {
      part_type: 5,
      target_tags: ["Tense"],
    });

    // Thực thi
    const result = calculateCloseCycleScore({
      cycle_units: cycleUnits,
      next_unit: nextUnit,
      config: {
        min_cycle_minutes: 120,
        ideal_cycle_minutes: 300,
        max_cycle_minutes: 600,
        close_score_threshold: 0.7,
        mini_test_estimated_minutes: 100,
        full_test_estimated_minutes: 200,
      },
    });

    // Kiểm tra
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it("calculateCloseCycleScore -> next unit has high skill overlap -> lower boundary score", () => {
    // Chuẩn bị
    const cycleUnits = [
      createRouteUnit("u1", {
        part_type: 5,
        planned_minutes: 120,
        target_tags: ["Word form"],
      }),
    ];
    const nextUnit = createRouteUnit("next", {
      part_type: 5,
      target_tags: ["Word form"],
    });

    // Thực thi
    const result = calculateCloseCycleScore({
      cycle_units: cycleUnits,
      next_unit: nextUnit,
      config: {
        min_cycle_minutes: 120,
        ideal_cycle_minutes: 300,
        max_cycle_minutes: 600,
        close_score_threshold: 0.7,
        mini_test_estimated_minutes: 100,
        full_test_estimated_minutes: 200,
      },
    });

    // Kiểm tra
    expect(result.boundary_score).toBe(0);
  });

  it("cutLearningCycle -> cycle below min minutes -> keeps adding units", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 60, target_tags: ["Word form"] }),
      createRouteUnit("u2", { planned_minutes: 70, target_tags: ["Vocabulary"] }),
      createRouteUnit("u3", { planned_minutes: 80, target_tags: ["Tense"] }),
    ];

    // Thực thi
    const result = cutLearningCycle({
      route_units: routeUnits,
      next_route_unit_index: 0,
      config: { min_cycle_minutes: 120, close_score_threshold: 0.1 },
    });

    // Kiểm tra
    expect(result?.route_units.map((unit) => unit.lesson_manager_id)).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("cutLearningCycle -> no next unit -> cuts at route end", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 60, target_tags: ["Word form"] }),
    ];

    // Thực thi
    const result = cutLearningCycle({
      route_units: routeUnits,
      next_route_unit_index: 0,
    });

    // Kiểm tra
    expect(result?.route_units).toHaveLength(1);
    expect(result?.route_unit_end_index).toBe(0);
    expect(result?.next_route_unit_index).toBe(1);
  });

  it("cutLearningCycle -> adding next unit exceeds max minutes -> cuts before next unit", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 260, target_tags: ["Word form"] }),
      createRouteUnit("u2", { planned_minutes: 260, target_tags: ["Vocabulary"] }),
      createRouteUnit("u3", { planned_minutes: 120, target_tags: ["Tense"] }),
    ];

    // Thực thi
    const result = cutLearningCycle({
      route_units: routeUnits,
      next_route_unit_index: 0,
      config: { max_cycle_minutes: 600, close_score_threshold: 1.1 },
    });

    // Kiểm tra
    expect(result?.route_units.map((unit) => unit.lesson_manager_id)).toEqual([
      "u1",
      "u2",
    ]);
    expect(result?.next_route_unit_index).toBe(2);
  });

  it("cutLearningCycle -> high close score -> cuts cycle and returns cursor", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", {
        part_type: 5,
        planned_minutes: 150,
        target_tags: ["Word form"],
      }),
      createRouteUnit("u2", {
        part_type: 5,
        planned_minutes: 150,
        target_tags: ["Vocabulary"],
      }),
      createRouteUnit("u3", { planned_minutes: 150, target_tags: ["Tense"] }),
    ];

    // Thực thi
    const result = cutLearningCycle({
      route_units: routeUnits,
      next_route_unit_index: 0,
      config: { close_score_threshold: 0.7 },
    });

    // Kiểm tra
    expect(result).not.toBeNull();
    expect(result!.next_route_unit_index).toBe(result!.route_unit_end_index + 1);
  });

  it("buildNextCyclePlan -> mini count 0 -> returns learning cycle with mini test", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", {
        part_type: 5,
        planned_minutes: 150,
        target_tags: ["Word form"],
      }),
      createRouteUnit("u2", {
        part_type: 5,
        planned_minutes: 150,
        target_tags: ["Vocabulary"],
      }),
    ];

    // Thực thi
    const result = buildNextCyclePlan({
      route_units: routeUnits,
      next_route_unit_index: 0,
      mini_tests_completed_since_last_full_test: 0,
    });

    // Kiểm tra
    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.assessment.type).toBe("mini_test");
    expect(result.route_units.length).toBeGreaterThan(0);
    if (result.assessment.type !== "mini_test") throw new Error("Expected mini_test");
    expect(result.assessment.focus_skill_keys.length).toBeGreaterThan(0);
    expect(result.assessment.focus_part_types.length).toBeGreaterThan(0);
  });

  it("buildNextCyclePlan -> mini count 2 -> still mini test", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 150, target_tags: ["Word form"] }),
    ];

    // Thực thi
    const result = buildNextCyclePlan({
      route_units: routeUnits,
      next_route_unit_index: 0,
      mini_tests_completed_since_last_full_test: 2,
    });

    // Kiểm tra
    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.assessment.type).toBe("mini_test");
  });

  it("buildNextCyclePlan -> mini count 3 -> returns learning cycle with full test", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 150, target_tags: ["Word form"] }),
      createRouteUnit("u2", { planned_minutes: 150, target_tags: ["Vocabulary"] }),
    ];

    // Thực thi
    const result = buildNextCyclePlan({
      route_units: routeUnits,
      next_route_unit_index: 0,
      mini_tests_completed_since_last_full_test: 3,
    });

    // Kiểm tra
    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.route_units.length).toBeGreaterThan(0);
    expect(result.assessment.type).toBe("full_test");
    expect(result.next_route_unit_index).toBeGreaterThan(0);
  });

  it("buildNextCyclePlan -> route exhausted -> returns route_completed", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 150, target_tags: ["Word form"] }),
    ];

    // Thực thi
    const result = buildNextCyclePlan({
      route_units: routeUnits,
      next_route_unit_index: 1,
      mini_tests_completed_since_last_full_test: 0,
    });

    // Kiểm tra
    expect(result).toEqual({
      plan_type: "route_completed",
      next_route_unit_index: 1,
      route_units: [],
      assessment: null,
      reason: "Route hiện tại đã hết bài học để tạo learning cycle.",
    });
  });

  it("getCycleFocusSkillKeys -> unknown tags -> ignores unknown without crash", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", {
        part_type: 5,
        target_tags: ["Word form", "unknown-skill-tag"],
      }),
    ];

    // Thực thi
    const result = getCycleFocusSkillKeys(routeUnits);

    // Kiểm tra
    expect(result).toEqual(["part5_word_form_question"]);
  });

  it("buildNextCyclePlan -> full test cycle does not return empty checkpoint", () => {
    // Chuẩn bị
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 150, target_tags: ["Word form"] }),
    ];

    // Thực thi
    const result = buildNextCyclePlan({
      route_units: routeUnits,
      next_route_unit_index: 0,
      mini_tests_completed_since_last_full_test: 3,
    });

    // Kiểm tra
    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") throw new Error("Expected learning_cycle");
    expect(result.assessment.type).toBe("full_test");
    expect(result.route_units.length).toBeGreaterThan(0);
  });

  it("buildNextCyclePlan -> mini test cycle cuts learning budget after reserving mini test minutes", () => {
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 600 }),
      createRouteUnit("u2", { planned_minutes: 850 }),
    ];

    const result = buildNextCyclePlan({
      route_units: routeUnits,
      next_route_unit_index: 0,
      mini_tests_completed_since_last_full_test: 0,
      config: {
        min_cycle_minutes: 480,
        ideal_cycle_minutes: 900,
        max_cycle_minutes: 1500,
        mini_test_estimated_minutes: 100,
        full_test_estimated_minutes: 200,
      },
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") return;

    expect(result.assessment.type).toBe("mini_test");
    expect(result.estimated_learning_minutes).toBeLessThanOrEqual(1400);
  });

  it("buildNextCyclePlan -> full test cycle cuts learning budget after reserving full test minutes", () => {
    const routeUnits = [
      createRouteUnit("u1", { planned_minutes: 600 }),
      createRouteUnit("u2", { planned_minutes: 850 }),
    ];

    const result = buildNextCyclePlan({
      route_units: routeUnits,
      next_route_unit_index: 0,
      mini_tests_completed_since_last_full_test: 3,
      config: {
        min_cycle_minutes: 480,
        ideal_cycle_minutes: 900,
        max_cycle_minutes: 1500,
        mini_test_estimated_minutes: 100,
        full_test_estimated_minutes: 200,
      },
    });

    expect(result.plan_type).toBe("learning_cycle");
    if (result.plan_type !== "learning_cycle") return;

    expect(result.assessment.type).toBe("full_test");
    expect(result.estimated_learning_minutes).toBeLessThanOrEqual(1300);
  });
});
