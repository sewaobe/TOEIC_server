import {
  normalizeToeicSkillTag,
  normalizeToeicSkillTags,
  TOEIC_SKILL_DEFINITIONS,
} from "../../utils/toeic_skill.util";
import type {
  BeamSearchCycleConfigV2,
  BeamSearchCycleStateV2,
  BuildNextCycleByBeamSearchInputV2,
  BuildStrategyRoutePlanInputV2,
  BuildStrategyRoutePlanOutputV2,
  LearningPathScenarioV2,
  LearningPathStrategyPartRoadmapV2,
  LearningPathStrategyV2,
  LessonManagerRouteNodeV2,
  NextCyclePlanV2,
  OptimizedPartPathV2,
  PartAbilityInputV2,
  PartBudgetAllocationV2,
  PlannedRouteUnitV2,
  RoutePartBucketV2,
  SkillGroupDistributionV2,
} from "../../types/learning_path_v2";
import { logLearningPathV2DebugSafe } from "./learning_path_v2_debug_logger";

type AllocationQuota = Record<RoutePartBucketV2, number>;

type CalculateNodeGainInput = {
  node: LessonManagerRouteNodeV2;
  scenario: LearningPathScenarioV2;
  strategy: LearningPathStrategyV2;
  target_score: number;
  part_ability: number;
  skill_group_distribution?: SkillGroupDistributionV2;
  completed_unit_ids?: string[];
  focus_skill_keys?: string[];
};

type OptimizePartPathInput = {
  part_type: number;
  part_budget_minutes: number;
  scenario: LearningPathScenarioV2;
  strategy: LearningPathStrategyV2;
  target_score: number;
  part_ability: number;
  nodes_of_part: LessonManagerRouteNodeV2[];
  completed_unit_ids?: string[];
  start_unit_ids?: string[];
};


type RuntimeStartScoreInput = {
  node: LessonManagerRouteNodeV2;
  part_ability: number;
  scenario: LearningPathScenarioV2;
  strategy: LearningPathStrategyV2;
};

type ResolvePrerequisiteChainInput = {
  node: LessonManagerRouteNodeV2;
  nodeById: Map<string, LessonManagerRouteNodeV2>;
  completedIds: Set<string>;
};

type BuildRuntimeStartPathsInput = {
  nodes: LessonManagerRouteNodeV2[];
  nodeById: Map<string, LessonManagerRouteNodeV2>;
  completedIds: Set<string>;
  start_unit_ids?: string[];
  part_ability: number;
  scenario: LearningPathScenarioV2;
  strategy: LearningPathStrategyV2;
};

const PART_TYPES = [1, 2, 3, 4, 5, 6, 7];

const STRATEGY_QUOTAS: Record<LearningPathStrategyV2, AllocationQuota> = {
  recommended: { weak: 0.6, medium: 0.3, strong: 0.1 },
  balanced: { weak: 0.45, medium: 0.35, strong: 0.2 },
  opportunity: { weak: 0.3, medium: 0.5, strong: 0.2 },
};

export const DEFAULT_BEAM_SEARCH_CYCLE_CONFIG: BeamSearchCycleConfigV2 = {
  beam_width: 8,
  max_expansion_steps: 20,
  max_focus_part_types: 3,
  max_focus_skill_keys: 7,
  min_learning_minutes: 480,
  ideal_learning_minutes: 900,
  max_learning_minutes: 1500,
  mini_test_estimated_minutes: 100,
  full_test_estimated_minutes: 200,

  /*
   * max_focus_part_types giới hạn độ rộng tổng của cycle.
   * max_non_focus_part_types giới hạn số Part phụ được chen vào để duy trì kỹ năng.
   * Nếu không có penalty này, Beam Search có thể chọn đủ 3 Part nhưng lại là 2 Part ngoài focus.
   */
  max_non_focus_part_types: 1,
  non_focus_part_penalty: 1.5,
  non_focus_unit_penalty: 0.6,
};

const SCENARIO_UNIT_TYPE_MULTIPLIER: Record<
  LearningPathScenarioV2,
  Partial<Record<LessonManagerRouteNodeV2["unit_type"], number>>
> = {
  ONBOARDING: { foundation: 1.2, skill_drill: 1.05, mixed_practice: 0.95 },
  NORMAL_PROGRESS: { skill_drill: 1.15, mixed_practice: 1.15, foundation: 0.95 },
  PLATEAU: { remedial: 1.25, mixed_practice: 1.05, skill_drill: 1.05 },
  BEHIND_SCHEDULE: { skill_drill: 1.1, mixed_practice: 1.15, remedial: 1.1 },
  PRE_DEADLINE: { exam_practice: 1.3, mixed_practice: 1.2, remedial: 1.15 },
  FULLTEST_MONTHLY: {
    foundation: 1,
    skill_drill: 1,
    mixed_practice: 1.05,
    exam_practice: 1.05,
    remedial: 1,
  },
};

const roundToTwo = (value: number): number => Math.round(value * 100) / 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const calculateAbilityWeightDistance = (
  nodeWeight: number,
  partAbility: number
): number => {
  /*
   * part_ability và LessonManager.weight cùng scale 0 -> 1.
   * Vì cùng scale normalized, khoảng cách tuyệt đối là tín hiệu rõ nhất để biết node có vừa năng lực hiện tại hay không.
   */
  return Math.abs(nodeWeight - partAbility);
};

export const calculateRuntimeStartScore = (
  input: RuntimeStartScoreInput
): number => {
  const abilityDistance = calculateAbilityWeightDistance(
    input.node.weight,
    input.part_ability
  );
  const abilityFit = Math.max(0, 1 - abilityDistance);
  let score = abilityFit;

  /*
   * Runtime start node được tính theo từng user, không lưu cố định trong DB.
   * part_ability và node.weight cùng scale 0 -> 1, nên runtime start ưu tiên node có weight gần ability hiện tại.
   * score_band là metadata TOEIC raw band để hiển thị/target_score, không so trực tiếp với part_ability normalized.
   */
  if (input.scenario === "ONBOARDING" || input.strategy === "recommended") {
    if (input.node.weight <= input.part_ability + 0.15) score += 0.08;
    if (input.node.weight > input.part_ability + 0.25) score -= 0.12;
  }

  if (input.strategy === "opportunity" && input.node.weight >= input.part_ability - 0.1) {
    score += 0.06;
  }

  return clamp(score, 0, 1.2);
};

const getTargetScoreDistribution = (targetScore: number): SkillGroupDistributionV2 => {
  if (targetScore <= 500) return { basic: 0.5, core: 0.4, advanced: 0.1 };
  if (targetScore <= 700) return { basic: 0.25, core: 0.55, advanced: 0.2 };
  if (targetScore <= 850) return { basic: 0.15, core: 0.45, advanced: 0.4 };
  return { basic: 0.1, core: 0.35, advanced: 0.55 };
};

export const calculateTargetSkillGroupDistribution = (
  targetScore: number
): SkillGroupDistributionV2 => getTargetScoreDistribution(targetScore);

const resolveSkillGroupsFromTags = (
  targetTags: string[],
  partType?: number
): Array<keyof SkillGroupDistributionV2> => {
  const groups: Array<keyof SkillGroupDistributionV2> = [];

  for (const tag of targetTags) {
    const normalizedSkill = normalizeToeicSkillTag(tag, partType);
    if (normalizedSkill) {
      groups.push(normalizedSkill.skill_group);
      continue;
    }

    const definition = TOEIC_SKILL_DEFINITIONS.find(
      (item) =>
        item.key === tag && (partType === undefined || item.part_type === partType)
    );
    if (definition) groups.push(definition.skill_group);
  }

  return groups;
};

export const calculateSkillGroupDistribution = (
  targetTags: string[],
  partType?: number
): SkillGroupDistributionV2 => {
  const initial: SkillGroupDistributionV2 = { basic: 0, core: 0, advanced: 0 };
  const groups = resolveSkillGroupsFromTags(targetTags, partType);
  if (groups.length === 0) return initial;

  for (const group of groups) {
    initial[group] += 1 / groups.length;
  }

  return initial;
};

const calculateSkillGroupFit = (
  nodeDistribution: SkillGroupDistributionV2,
  targetDistribution: SkillGroupDistributionV2
): number => {
  const knownRatio =
    nodeDistribution.basic + nodeDistribution.core + nodeDistribution.advanced;
  if (knownRatio === 0) return 0.5;

  return (
    nodeDistribution.basic * targetDistribution.basic +
    nodeDistribution.core * targetDistribution.core +
    nodeDistribution.advanced * targetDistribution.advanced
  );
};

const calculateStrategyMultiplier = (
  strategy: LearningPathStrategyV2,
  node: LessonManagerRouteNodeV2,
  partAbility: number
): number => {
  if (strategy === "balanced") return 1;
  if (strategy === "recommended") {
    return node.weight <= partAbility + 0.15 ? 1.08 : 0.96;
  }
  return node.weight >= partAbility - 0.1 ? 1.08 : 0.96;
};

const getScenarioReason = (scenario: LearningPathScenarioV2): string => {
  switch (scenario) {
    case "ONBOARDING":
      return "Layer 4 dựng route khởi đầu theo graph và prerequisite; không dựa vào node_role entry/target cố định.";
    case "NORMAL_PROGRESS":
      return "Layer 4 đang đi route chính nên ưu tiên skill drill và mixed practice.";
    case "PLATEAU":
      return "Layer 4 đang xử lý plateau nên remedial/support được chấm điểm cao hơn.";
    case "BEHIND_SCHEDULE":
      return "Layer 4 đang đi sau tiến độ nên ưu tiên gain theo phút và tránh unit dài ít tác động.";
    case "PRE_DEADLINE":
      return "Layer 4 gần deadline nên ưu tiên mixed practice, exam practice và remedial.";
    case "FULLTEST_MONTHLY":
      return "Layer 4 review full test theo công thức trung tính, strategy quyết định trọng tâm.";
  }
};

export const calculateNodeGain = (input: CalculateNodeGainInput): number => {
  const nodeDistribution =
    input.skill_group_distribution ??
    calculateSkillGroupDistribution(input.node.target_tags, input.node.part_type);
  const targetDistribution = getTargetScoreDistribution(input.target_score);

  const difficultyFit = Math.max(
    0,
    1 - Math.abs(input.node.weight - input.part_ability)
  );
  const skillGroupFit = calculateSkillGroupFit(nodeDistribution, targetDistribution);
  const unitMultiplier =
    SCENARIO_UNIT_TYPE_MULTIPLIER[input.scenario][input.node.unit_type] ?? 1;
  const strategyMultiplier = calculateStrategyMultiplier(
    input.strategy,
    input.node,
    input.part_ability
  );
  const focusBonus =
    input.focus_skill_keys?.some((key) => input.node.target_tags.includes(key))
      ? 1.08
      : 1;
  const difficultyMultiplier =
    input.scenario === "ONBOARDING"
      ? Math.max(0.05, difficultyFit * difficultyFit)
      : Math.max(0.25, 0.65 + difficultyFit * 0.35);
  const isEfficiencyScenario =
    input.scenario === "BEHIND_SCHEDULE" ||
    input.scenario === "PRE_DEADLINE";

  const efficiencyMultiplier = isEfficiencyScenario
    ? 0.7 + 0.6 * (60 / (60 + Math.max(1, input.node.planned_completion_time)))
    : 1;

  /*
   * Layer 4 không tính ability và không quyết scenario; hai giá trị đó đã là input từ Layer trước.
   * Công thức gain chỉ dùng để so sánh node trong cùng Part graph, không cố mô phỏng điểm TOEIC thật.
   * Mỗi scenario có multiplier riêng để ý đồ nghiệp vụ rõ ràng nhưng vẫn tránh overfit.
   * ONBOARDING phạt node quá xa ability mạnh hơn vì route khởi đầu cần vừa sức trước khi đẩy độ khó.
   * node_role không còn dùng để mark entry/target; support vẫn giữ ý nghĩa remedial/auxiliary nhưng không nhân gain riêng theo role.
   */
  const gain =
    input.node.weight *
    (0.65 + difficultyFit * 0.85 + skillGroupFit * 0.45) *
    difficultyMultiplier *
    unitMultiplier *
    strategyMultiplier *
    focusBonus *
    efficiencyMultiplier;

  return roundToTwo(gain);
};

const validatePartAbilities = (
  partAbilities: PartAbilityInputV2[]
): PartAbilityInputV2[] => {
  const sorted = [...partAbilities].sort((a, b) => a.part_type - b.part_type);
  const hasExactParts =
    sorted.length === 7 &&
    PART_TYPES.every((partType, index) => sorted[index]?.part_type === partType);

  if (!hasExactParts) {
    throw new Error("Layer 4 cần đúng 7 part abilities cho Part 1..7.");
  }

  return sorted;
};

/**
 * A0. Phân bổ thời gian học cho từng TOEIC Part dựa vào tổng thời gian học và strategy đã chọn.
 */
export const allocatePartBudgets = (input: {
  strategy: LearningPathStrategyV2;
  total_available_minutes: number;
  part_abilities: PartAbilityInputV2[];
}): PartBudgetAllocationV2[] => {
  const abilities = validatePartAbilities(input.part_abilities);
  const sortedByAbility = [...abilities].sort(
    (a, b) => a.ability - b.ability || a.part_type - b.part_type
  );
  const bucketByPart = new Map<number, RoutePartBucketV2>();

  sortedByAbility.forEach((part, index) => {
    const bucket: RoutePartBucketV2 =
      index < 3 ? "weak" : index < 5 ? "medium" : "strong";
    bucketByPart.set(part.part_type, bucket);
  });

  const quota = STRATEGY_QUOTAS[input.strategy];
  const partsByBucket: Record<RoutePartBucketV2, PartAbilityInputV2[]> = {
    weak: [],
    medium: [],
    strong: [],
  };
  abilities.forEach((part) => partsByBucket[bucketByPart.get(part.part_type)!].push(part));

  /*
   * A0 chỉ phân bổ thời lượng theo strategy; Layer 4 không tự tính ability và không quyết scenario.
   * Split đều trong bucket là MVP để tránh tự bịa ability-gap weighting.
   * Sau này có thể đổi sang ability-gap distribution khi có policy rõ hơn.
   */
  return abilities.map((part) => {
    const bucket = bucketByPart.get(part.part_type)!;
    const targetMinutes =
      (input.total_available_minutes * quota[bucket]) /
      partsByBucket[bucket].length;

    return {
      part_type: part.part_type,
      bucket,
      target_minutes: roundToTwo(targetMinutes),
      ability: part.ability,
    };
  });
};

const isNodeWithinTargetBoundary = (
  node: LessonManagerRouteNodeV2,
  targetScore: number
): boolean => {
  if (!Number.isFinite(targetScore) || targetScore <= 0) {
    throw new Error("target_score khong hop le de toi uu route.");
  }

  if (!node.score_band) return true;

  return node.score_band.from <= targetScore;
};

const isNodeCoveringTarget = (
  node: LessonManagerRouteNodeV2,
  targetScore: number
): boolean =>
  /*
   * target là runtime theo target_score; không dùng node_role vì cùng một node có thể là target của user này
   * nhưng chỉ là node giữa đường của user khác. score_band là raw TOEIC band metadata, dùng để display và target coverage.
   */
  Boolean(
    node.score_band &&
    node.score_band.from <= targetScore &&
    targetScore <= node.score_band.to
  );

const toPlannedRouteUnit = (
  node: LessonManagerRouteNodeV2,
  order: number,
  gain: number,
  reason: string
): PlannedRouteUnitV2 => ({
  lesson_manager_id: node.id,
  title: node.title,
  part_type: node.part_type,
  score_band: node.score_band,
  unit_type: node.unit_type,
  node_role: node.node_role,
  target_tags: node.target_tags,
  order,
  planned_minutes: node.planned_completion_time,
  estimated_gain: gain,
  reason,
});

const prerequisitesSatisfied = (
  node: LessonManagerRouteNodeV2,
  completedIds: Set<string>,
  currentPathIds: Set<string>
): boolean =>
  node.prerequisite_unit_ids.every(
    (id) => completedIds.has(id) || currentPathIds.has(id)
  );

export const resolvePrerequisiteChain = (
  input: ResolvePrerequisiteChainInput
): LessonManagerRouteNodeV2[] => {
  const orderedPrerequisites: LessonManagerRouteNodeV2[] = [];
  const addedIds = new Set<string>();

  const collect = (node: LessonManagerRouteNodeV2, visitingIds: Set<string>): void => {
    if (visitingIds.has(node.id)) {
      throw new Error("Phát hiện vòng lặp prerequisite trong LessonManager graph.");
    }

    const nextVisitingIds = new Set(visitingIds);
    nextVisitingIds.add(node.id);

    for (const prerequisiteId of node.prerequisite_unit_ids) {
      if (input.completedIds.has(prerequisiteId)) continue;

      const prerequisiteNode = input.nodeById.get(prerequisiteId);
      if (!prerequisiteNode) {
        throw new Error(
          `Thiếu prerequisite node trong LessonManager graph: ${prerequisiteId}`
        );
      }

      collect(prerequisiteNode, nextVisitingIds);
      if (!addedIds.has(prerequisiteNode.id)) {
        orderedPrerequisites.push(prerequisiteNode);
        addedIds.add(prerequisiteNode.id);
      }
    }
  };

  /*
   * prerequisite_unit_ids là hard constraint và không được skip.
   * Nếu start candidate còn thiếu prerequisite, Layer 4 prepend prerequisite chain trước khi duyệt tiếp graph.
   */
  collect(input.node, new Set());

  return orderedPrerequisites;
};

export const buildRuntimeStartPaths = (
  input: BuildRuntimeStartPathsInput
): LessonManagerRouteNodeV2[][] => {
  const buildPathForNode = (node: LessonManagerRouteNodeV2): LessonManagerRouteNodeV2[] => [
    ...resolvePrerequisiteChain({
      node,
      nodeById: input.nodeById,
      completedIds: input.completedIds,
    }),
    node,
  ];

  if (input.start_unit_ids && input.start_unit_ids.length > 0) {
    const explicitStartPaths = input.start_unit_ids
      .map((id) => input.nodeById.get(id))
      .filter((node): node is LessonManagerRouteNodeV2 => Boolean(node))
      .map((node) => buildPathForNode(node));

    if (explicitStartPaths.length > 0) return explicitStartPaths;
  }

  const scoredCandidates = input.nodes
    .filter((node) => !input.completedIds.has(node.id))
    .map((node) => ({
      node,
      score: calculateRuntimeStartScore({
        node,
        part_ability: input.part_ability,
        scenario: input.scenario,
        strategy: input.strategy,
      }),
      distance: calculateAbilityWeightDistance(node.weight, input.part_ability),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.node.weight !== b.node.weight) return a.node.weight - b.node.weight;
      return a.node.id.localeCompare(b.node.id);
    });

  /*
   * weight là numeric signal chính để match ability hiện tại.
   * Chọn candidate gần ability không có nghĩa là bỏ qua bài nền trước đó; missing prerequisites luôn được prepend.
   */
  const startPaths = scoredCandidates.map((candidate) =>
    buildPathForNode(candidate.node)
  );

  if (startPaths.length > 0) return startPaths;

  return input.nodes
    .filter((node) => node.prerequisite_unit_ids.length === 0)
    .sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id))
    .map((node) => [node]);
};

type PathState = {
  nodes: LessonManagerRouteNodeV2[];
  totalMinutes: number;
  totalGain: number;
  reachesTarget: boolean;
};

const comparePathState = (candidate: PathState, current: PathState): PathState => {
  const targetBonus = candidate.reachesTarget ? Math.min(0.25, candidate.totalGain * 0.05) : 0;
  const currentBonus = current.reachesTarget ? Math.min(0.25, current.totalGain * 0.05) : 0;
  const candidateScore = candidate.totalGain + targetBonus;
  const currentScore = current.totalGain + currentBonus;

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }
  if (candidate.totalMinutes !== current.totalMinutes) {
    return candidate.totalMinutes < current.totalMinutes ? candidate : current;
  }
  const candidateIds = candidate.nodes.map((node) => node.id).join("|");
  const currentIds = current.nodes.map((node) => node.id).join("|");
  return candidateIds < currentIds ? candidate : current;
};

/**
 * Layer 4 không giả định mỗi band đều có entry/target.
 * Start node được tính runtime: ưu tiên start_unit_ids, sau đó chọn node có weight gần part_ability.
 * Nếu start candidate còn thiếu prerequisite thì prepend prerequisite chain trước khi duyệt tiếp.
 * Target node được tính runtime bằng score_band bao phủ target_score.
 */
export const optimizePartPath = (
  input: OptimizePartPathInput
): OptimizedPartPathV2 => {
  const completedIds = new Set(input.completed_unit_ids ?? []);
  const nodes = input.nodes_of_part
    .filter(
      (node) =>
        node.part_type === input.part_type &&
        node.planned_completion_time >= 0 &&
        !completedIds.has(node.id) &&
        isNodeWithinTargetBoundary(node, input.target_score)
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const startPaths = buildRuntimeStartPaths({
    nodes,
    nodeById,
    completedIds,
    start_unit_ids: input.start_unit_ids,
    part_ability: input.part_ability,
    scenario: input.scenario,
    strategy: input.strategy,
  });

  /*
   * A1 duyệt graph riêng từng Part theo next_unit_ids, không ghép 7 graph thành graph vật lý.
   * Time budget là hard constraint; target node chỉ là hướng/bonus, không phải cam kết phải đạt.
   * Nếu budget quá nhỏ, hàm trả về prefix reachable có gain tốt nhất trong budget.
   */
  let best: PathState = {
    nodes: [],
    totalMinutes: 0,
    totalGain: 0,
    reachesTarget: false,
  };

  const initializePrefixState = (
    prefix: LessonManagerRouteNodeV2[]
  ): PathState | null => {
    let totalMinutes = 0;
    let totalGain = 0;
    let reachesTarget = false;
    const currentPathIds = new Set<string>();

    /*
     * Prefix là prerequisite chain + runtime start candidate.
     * prerequisite_unit_ids vẫn được kiểm tra lại như safety check để không bao giờ skip hard constraint.
     */
    for (const node of prefix) {
      if (!prerequisitesSatisfied(node, completedIds, currentPathIds)) {
        return null;
      }

      totalMinutes += node.planned_completion_time;
      if (totalMinutes > input.part_budget_minutes) return null;

      totalGain = roundToTwo(
        totalGain +
          calculateNodeGain({
            node,
            scenario: input.scenario,
            strategy: input.strategy,
            target_score: input.target_score,
            part_ability: input.part_ability,
            completed_unit_ids: input.completed_unit_ids,
          })
      );
      reachesTarget =
        reachesTarget || isNodeCoveringTarget(node, input.target_score);
      currentPathIds.add(node.id);
    }

    return { nodes: prefix, totalMinutes, totalGain, reachesTarget };
  };

  const walk = (
    node: LessonManagerRouteNodeV2,
    path: LessonManagerRouteNodeV2[],
    visited: Set<string>,
    totalMinutes: number,
    totalGain: number,
    reachesTarget: boolean
  ): void => {
    if (visited.has(node.id)) return;

    const currentPathIds = new Set(path.map((item) => item.id));
    if (!prerequisitesSatisfied(node, completedIds, currentPathIds)) return;

    const nextMinutes = totalMinutes + node.planned_completion_time;
    if (nextMinutes > input.part_budget_minutes) return;

    const gain = calculateNodeGain({
      node,
      scenario: input.scenario,
      strategy: input.strategy,
      target_score: input.target_score,
      part_ability: input.part_ability,
      completed_unit_ids: input.completed_unit_ids,
    });
    const nextPath = [...path, node];
    const nextState: PathState = {
      nodes: nextPath,
      totalMinutes: nextMinutes,
      totalGain: roundToTwo(totalGain + gain),
      reachesTarget:
        reachesTarget || isNodeCoveringTarget(node, input.target_score),
    };

    best = comparePathState(nextState, best);

    if (isNodeCoveringTarget(node, input.target_score)) return;

    const nextVisited = new Set(visited);
    nextVisited.add(node.id);
    for (const nextId of node.next_unit_ids) {
      const nextNode = nodeById.get(nextId);
      if (nextNode) {
        walk(
          nextNode,
          nextPath,
          nextVisited,
          nextState.totalMinutes,
          nextState.totalGain,
          nextState.reachesTarget
        );
      }
    }
  };

  for (const prefix of startPaths) {
    const prefixState = initializePrefixState(prefix);
    if (!prefixState || prefix.length === 0) continue;

    best = comparePathState(prefixState, best);
    if (prefixState.reachesTarget) continue;

    const lastNode = prefix[prefix.length - 1];
    const visited = new Set(prefix.map((node) => node.id));
    for (const nextId of lastNode.next_unit_ids) {
      const nextNode = nodeById.get(nextId);
      if (nextNode) {
        walk(
          nextNode,
          prefix,
          visited,
          prefixState.totalMinutes,
          prefixState.totalGain,
          prefixState.reachesTarget
        );
      }
    }
  }

  const plannedNodes = best.nodes.map((node, index) => {
    const gain = calculateNodeGain({
      node,
      scenario: input.scenario,
      strategy: input.strategy,
      target_score: input.target_score,
      part_ability: input.part_ability,
      completed_unit_ids: input.completed_unit_ids,
    });

    return toPlannedRouteUnit(node, index, gain, getScenarioReason(input.scenario));
  });

  return {
    part_type: input.part_type,
    target_minutes: input.part_budget_minutes,
    total_minutes: best.totalMinutes,
    estimated_gain: roundToTwo(best.totalGain),
    reaches_target: best.reachesTarget,
    nodes: plannedNodes,
  };
};

const mergeBeamSearchConfig = (
  config?: Partial<BeamSearchCycleConfigV2>
): BeamSearchCycleConfigV2 => ({
  ...DEFAULT_BEAM_SEARCH_CYCLE_CONFIG,
  ...(config ?? {}),
});

export const sumPlannedMinutes = (units: PlannedRouteUnitV2[]): number =>
  units.reduce((sum, unit) => sum + unit.planned_minutes, 0);

const getUnitSkillKeys = (unit: PlannedRouteUnitV2): string[] =>
  normalizeToeicSkillTags(unit.target_tags, unit.part_type).map(
    (skill) => skill.key
  );

const cloneSelectedCountsByPart = (
  counts: Map<number, number>
): Map<number, number> => new Map(counts);

const getNextCandidatesFromRoadmaps = (input: {
  part_roadmaps: LearningPathStrategyPartRoadmapV2[];
  selected_counts_by_part: Map<number, number>;
}): PlannedRouteUnitV2[] => {
  const candidates: PlannedRouteUnitV2[] = [];

  for (const roadmap of input.part_roadmaps) {
    const selectedCount = input.selected_counts_by_part.get(roadmap.part_type) ?? 0;
    const cursor = roadmap.cursor_index + selectedCount;
    const unit = roadmap.units[cursor];

    if (!unit) continue;

    candidates.push({
      ...unit,
      part_type: roadmap.part_type,
      order: candidates.length,
      score_band:
        unit.score_band?.from !== undefined && unit.score_band?.to !== undefined
          ? { from: unit.score_band.from, to: unit.score_band.to }
          : undefined,
    });
  }

  return candidates;
};

const scoreBeamSearchState = (input: {
  selectedRoadmapUnits: PlannedRouteUnitV2[];
  focus_part_types: number[];
  ideal_learning_minutes: number;
  max_focus_part_types: number;
  max_focus_skill_keys: number;
  max_non_focus_part_types: number;
  non_focus_part_penalty: number;
  non_focus_unit_penalty: number;
}): Omit<BeamSearchCycleStateV2, "selected_roadmap_units" | "total_minutes" | "estimated_gain"> => {
  const selectedRoadmapUnits = input.selectedRoadmapUnits;
  const totalMinutes = sumPlannedMinutes(selectedRoadmapUnits);
  const focusSet = new Set(input.focus_part_types);
  const focusCount = selectedRoadmapUnits.filter((unit) => focusSet.has(unit.part_type)).length;
  const focusRatio =
    selectedRoadmapUnits.length > 0 ? focusCount / selectedRoadmapUnits.length : 0;
  const partTypes = Array.from(
    new Set(selectedRoadmapUnits.map((unit) => unit.part_type))
  ).sort((a, b) => a - b);
  const skillKeys = Array.from(
    new Set(selectedRoadmapUnits.flatMap((unit) => getUnitSkillKeys(unit)))
  );
  const nonFocusPartTypes = partTypes.filter(
    (partType) => !focusSet.has(partType)
  );
  const nonFocusUnitCount = selectedRoadmapUnits.filter(
    (unit) => !focusSet.has(unit.part_type)
  ).length;
  const gainScore = selectedRoadmapUnits.reduce(
    (sum, unit) => sum + unit.estimated_gain,
    0
  );
  const focusScore = focusRatio * 2;
  const timeScore =
    input.ideal_learning_minutes > 0
      ? 1 -
        Math.min(
          1,
          Math.abs(totalMinutes - input.ideal_learning_minutes) /
            input.ideal_learning_minutes
        )
      : 0;
  const partSpreadPenalty = Math.max(
    0,
    partTypes.length - input.max_focus_part_types
  ) * 1.2;
  const skillSpreadPenalty = Math.max(
    0,
    skillKeys.length - input.max_focus_skill_keys
  ) * 0.5;
  const nonFocusPartPenalty =
    Math.max(0, nonFocusPartTypes.length - input.max_non_focus_part_types) *
    input.non_focus_part_penalty;
  const nonFocusUnitPenalty =
    nonFocusUnitCount * input.non_focus_unit_penalty;
  const spreadPenalty =
    partSpreadPenalty +
    skillSpreadPenalty +
    nonFocusPartPenalty +
    nonFocusUnitPenalty;

  return {
    score: roundToTwo(gainScore + focusScore + timeScore - spreadPenalty),
    focus_score: roundToTwo(focusScore),
    time_score: roundToTwo(timeScore),
    spread_penalty: roundToTwo(spreadPenalty),
    skill_keys: skillKeys,
    part_types: partTypes,
  };
};

type BeamSearchInternalState = BeamSearchCycleStateV2 & {
  selected_counts_by_part: Map<number, number>;
};

const toBeamSearchState = (
  selectedRoadmapUnits: PlannedRouteUnitV2[],
  selectedCountsByPart: Map<number, number>,
  input: {
    focus_part_types: number[];
    ideal_learning_minutes: number;
    max_focus_part_types: number;
    max_focus_skill_keys: number;
    max_non_focus_part_types: number;
    non_focus_part_penalty: number;
    non_focus_unit_penalty: number;
  }
): BeamSearchInternalState => {
  const orderedUnits = selectedRoadmapUnits.map((unit, index) => ({
    ...unit,
    order: index,
  }));
  const scoreDetail = scoreBeamSearchState({
    selectedRoadmapUnits: orderedUnits,
    focus_part_types: input.focus_part_types,
    ideal_learning_minutes: input.ideal_learning_minutes,
    max_focus_part_types: input.max_focus_part_types,
    max_focus_skill_keys: input.max_focus_skill_keys,
    max_non_focus_part_types: input.max_non_focus_part_types,
    non_focus_part_penalty: input.non_focus_part_penalty,
    non_focus_unit_penalty: input.non_focus_unit_penalty,
  });

  return {
    selected_roadmap_units: orderedUnits,
    total_minutes: sumPlannedMinutes(orderedUnits),
    estimated_gain: roundToTwo(
      orderedUnits.reduce((sum, unit) => sum + unit.estimated_gain, 0)
    ),
    ...scoreDetail,
    selected_counts_by_part: selectedCountsByPart,
  };
};

const compareBeamSearchStates = (
  left: BeamSearchInternalState,
  right: BeamSearchInternalState
): number => {
  if (left.score !== right.score) return right.score - left.score;
  if (left.total_minutes !== right.total_minutes) {
    return right.total_minutes - left.total_minutes;
  }
  return left.selected_roadmap_units
    .map((unit) => unit.lesson_manager_id)
    .join("|")
    .localeCompare(
      right.selected_roadmap_units.map((unit) => unit.lesson_manager_id).join("|")
    );
};

const beamSearchStateKey = (state: BeamSearchInternalState): string =>
  state.selected_roadmap_units
    .map((unit) => unit.lesson_manager_id)
    .join("|");

/*
 * Beam Search tạo cycle theo rolling horizon: hệ thống chỉ chọn cycle kế tiếp
 * từ 7 Part roadmap hiện tại. Không tạo lịch cố định cho toàn bộ khóa học,
 * vì sau mini/full test UserSkill và strategy có thể thay đổi.
 */
export const buildNextCycleByBeamSearch = (
  input: BuildNextCycleByBeamSearchInputV2
): NextCyclePlanV2 => {
  const config = mergeBeamSearchConfig(input.config);
  const shouldUseFullTest = input.mini_tests_completed_since_last_full_test >= 3;
  const assessmentEstimatedMinutes = shouldUseFullTest
    ? config.full_test_estimated_minutes
    : config.mini_test_estimated_minutes;
  const learningConfig = {
    min: Math.max(240, config.min_learning_minutes - assessmentEstimatedMinutes),
    ideal: Math.max(360, config.ideal_learning_minutes - assessmentEstimatedMinutes),
    max: Math.max(480, config.max_learning_minutes - assessmentEstimatedMinutes),
  };
  const partRoadmaps = [...input.part_roadmaps].sort(
    (a, b) => a.part_type - b.part_type
  );
  const hasAvailableUnit = partRoadmaps.some(
    (roadmap) => roadmap.cursor_index < roadmap.units.length
  );

  if (!hasAvailableUnit) {
    return {
      plan_type: "route_completed",
      selected_roadmap_units: [],
      assessment: null,
      reason: "Tất cả Part roadmap đã hết bài học để tạo cycle.",
    };
  }

  let candidateCount = 0;
  let states: BeamSearchInternalState[] = [
    toBeamSearchState([], new Map(), {
      focus_part_types: input.focus_part_types,
      ideal_learning_minutes: learningConfig.ideal,
      max_focus_part_types: config.max_focus_part_types,
      max_focus_skill_keys: config.max_focus_skill_keys,
      max_non_focus_part_types: config.max_non_focus_part_types,
      non_focus_part_penalty: config.non_focus_part_penalty,
      non_focus_unit_penalty: config.non_focus_unit_penalty,
    }),
  ];
  const completedStates: BeamSearchInternalState[] = [];
  const completedStateKeys = new Set<string>();
  const collectCompletedState = (state: BeamSearchInternalState): void => {
    if (state.selected_roadmap_units.length === 0) return;

    const key = beamSearchStateKey(state);
    if (completedStateKeys.has(key)) return;

    completedStateKeys.add(key);
    completedStates.push(state);
  };

  for (let step = 0; step < config.max_expansion_steps; step += 1) {
    const expanded: BeamSearchInternalState[] = [];

    for (const state of states) {
      /*
       * Một state đã đủ thời lượng và focus tốt có thể là cycle tốt nhất.
       * Vì vậy Beam Search phải giữ lại các state trung gian như terminal candidates,
       * không được bắt buộc mở rộng đến khi hết bước hoặc hết candidate.
       */
      collectCompletedState(state);

      const candidates = getNextCandidatesFromRoadmaps({
        part_roadmaps: partRoadmaps,
        selected_counts_by_part: state.selected_counts_by_part,
      });

      for (const candidate of candidates) {
        const nextMinutes = state.total_minutes + candidate.planned_minutes;
        if (
          state.selected_roadmap_units.length > 0 &&
          nextMinutes > learningConfig.max
        ) {
          continue;
        }
        const nextPartTypes = new Set([
          ...state.part_types,
          candidate.part_type,
        ]);
        const wouldExceedPartLimit =
          nextPartTypes.size > config.max_focus_part_types;
        if (
          wouldExceedPartLimit &&
          state.selected_roadmap_units.length > 0
        ) {
          continue;
        }

        const nextCounts = cloneSelectedCountsByPart(state.selected_counts_by_part);
        nextCounts.set(
          candidate.part_type,
          (nextCounts.get(candidate.part_type) ?? 0) + 1
        );
        expanded.push(
          toBeamSearchState(
            [...state.selected_roadmap_units, candidate],
            nextCounts,
            {
              focus_part_types: input.focus_part_types,
              ideal_learning_minutes: learningConfig.ideal,
              max_focus_part_types: config.max_focus_part_types,
              max_focus_skill_keys: config.max_focus_skill_keys,
              max_non_focus_part_types: config.max_non_focus_part_types,
              non_focus_part_penalty: config.non_focus_part_penalty,
              non_focus_unit_penalty: config.non_focus_unit_penalty,
            }
          )
        );
        candidateCount += 1;
      }
    }

    if (expanded.length === 0) break;
    expanded.forEach(collectCompletedState);
    states = expanded.sort(compareBeamSearchStates).slice(0, config.beam_width);
  }

  const candidateFinalStates =
    completedStates.length > 0
      ? completedStates
      : states.filter((state) => state.selected_roadmap_units.length > 0);
  const validStates = candidateFinalStates.filter(
    (state) => state.total_minutes >= learningConfig.min
  );
  const best = [...(validStates.length > 0 ? validStates : candidateFinalStates)].sort(
    compareBeamSearchStates
  )[0];

  if (!best) {
    return {
      plan_type: "route_completed",
      selected_roadmap_units: [],
      assessment: null,
      reason: "Không còn unit khả dụng trong các Part roadmap để tạo cycle.",
    };
  }

  const selectedRoadmapPositions = partRoadmaps
    .map((roadmap) => {
      const selectedCount = best.selected_counts_by_part.get(roadmap.part_type) ?? 0;
      return {
        part_type: roadmap.part_type,
        from_cursor_index: roadmap.cursor_index,
        to_cursor_index: roadmap.cursor_index + selectedCount - 1,
        selected_count: selectedCount,
      };
    })
    .filter((item) => item.selected_count > 0);
  const selectedSkillKeys = best.skill_keys.slice(0, config.max_focus_skill_keys);
  const selectedPartTypes = best.part_types.slice(0, config.max_focus_part_types);

  logLearningPathV2DebugSafe("layer4.beam_search_cycle", {
    stage: "layer4",
    strategy: input.strategy,
    scenario: input.scenario,
    focus_part_types: input.focus_part_types,
    selected_part_types: selectedPartTypes,
    selected_skill_keys_sample: selectedSkillKeys.slice(0, 10),
    selected_roadmap_units_count: best.selected_roadmap_units.length,
    estimated_learning_minutes: best.total_minutes,
    selected_score: best.score,
    candidate_count: candidateCount,
    selected_roadmap_positions: selectedRoadmapPositions,
  });

  return {
    plan_type: "learning_cycle",
    selected_roadmap_units: best.selected_roadmap_units.map((unit, index) => ({
      ...unit,
      order: index,
    })),
    selected_roadmap_positions: selectedRoadmapPositions,
    focus_skill_keys: selectedSkillKeys,
    focus_part_types: selectedPartTypes,
    estimated_learning_minutes: best.total_minutes,
    assessment: shouldUseFullTest
      ? {
          type: "full_test",
          estimated_minutes: config.full_test_estimated_minutes,
        }
      : {
          type: "mini_test",
          estimated_minutes: config.mini_test_estimated_minutes,
          focus_skill_keys: selectedSkillKeys,
          focus_part_types: selectedPartTypes,
        },
    beam_search_debug: {
      selected_score: best.score,
      candidate_count: candidateCount,
      reason:
        "Beam Search chọn cycle từ 7 Part roadmap theo focus, gain, thời lượng và độ tập trung.",
    },
  };
};

const groupNodesByPart = (
  nodes: LessonManagerRouteNodeV2[]
): Record<number, LessonManagerRouteNodeV2[]> =>
  nodes.reduce<Record<number, LessonManagerRouteNodeV2[]>>((groups, node) => {
    groups[node.part_type] = groups[node.part_type] ?? [];
    groups[node.part_type].push(node);
    return groups;
  }, {});

const mapPartPathsToRoadmaps = (
  partPaths: OptimizedPartPathV2[]
): LearningPathStrategyPartRoadmapV2[] =>
  partPaths
    .map((path) => ({
      part_type: path.part_type,
      cursor_index: 0,
      target_minutes: path.target_minutes,
      estimated_gain: path.estimated_gain,
      reaches_target: path.reaches_target,
      units: path.nodes.map((unit, index) => ({
        ...unit,
        order: index,
      })),
    }))
    .sort((a, b) => a.part_type - b.part_type);
const getSummaryReasons = (
  strategy: LearningPathStrategyV2
): string[] => {
  const strategyReason: Record<LearningPathStrategyV2, string> = {
    recommended: "Ưu tiên các Part yếu theo kết quả năng lực hiện tại.",
    balanced: "Cân bằng giữa Part yếu và các Part cần duy trì.",
    opportunity: "Ưu tiên vùng có khả năng tăng điểm nhanh hơn.",
  };

  return [
    strategyReason[strategy],
    "Target score hiện tại quyết định tỷ lệ basic/core/advanced.",
  ];
};

export const buildStrategyRoutePlan = (
  input: BuildStrategyRoutePlanInputV2
): BuildStrategyRoutePlanOutputV2 => {
  const allocations = allocatePartBudgets({
    strategy: input.strategy,
    total_available_minutes: input.total_available_minutes,
    part_abilities: input.part_abilities,
  });
  const nodesByPart = groupNodesByPart(input.lesson_manager_nodes);

  const partPaths = allocations.map((allocation) => {
    return optimizePartPath({
      part_type: allocation.part_type,
      part_budget_minutes: allocation.target_minutes,
      scenario: input.scenario,
      strategy: input.strategy,
      target_score: input.target_score,
      part_ability: allocation.ability,
      nodes_of_part: nodesByPart[allocation.part_type] ?? [],
      completed_unit_ids: input.completed_unit_ids,
      start_unit_ids: input.start_unit_ids_by_part?.[allocation.part_type],
    });
  });

  const partRoadmaps = mapPartPathsToRoadmaps(partPaths);
  const allRoadmapUnits = partRoadmaps.flatMap((roadmap) => roadmap.units);
  const focusPartTypes = allocations
    .filter((allocation) => allocation.bucket === "weak")
    .map((allocation) => allocation.part_type)
    .sort((a, b) => a - b);
  const focusPartTypeSet = new Set(focusPartTypes);
  const focusSkillKeys = Array.from(
    new Set(
      partRoadmaps
        .filter((roadmap) => focusPartTypeSet.has(roadmap.part_type))
        .flatMap((roadmap) =>
          roadmap.units.flatMap((unit) =>
            normalizeToeicSkillTags(unit.target_tags, unit.part_type).map(
              (skill) => skill.key
            )
          )
        )
    )
  );

  const reachedTargetPartCount = partPaths.filter(
    (path) => path.reaches_target
  ).length;

    /*
   * buildStrategyRoutePlan chỉ tạo strategy snapshot gồm 7 Part roadmaps.
   * Đây là định hướng dài hạn theo từng Part, không phải một route tổng tuyến tính.
   */
  const output: BuildStrategyRoutePlanOutputV2 = {
    strategy: input.strategy,
    scenario: input.scenario,
    estimated_total_minutes: allRoadmapUnits.reduce(
      (sum, unit) => sum + unit.planned_minutes,
      0
    ),
    estimated_gain: roundToTwo(
      allRoadmapUnits.reduce((sum, unit) => sum + unit.estimated_gain, 0)
    ),
    reaches_target: reachedTargetPartCount === 7,
    focus_part_types: focusPartTypes,
    focus_skill_keys: focusSkillKeys,
    part_roadmaps: partRoadmaps,
    summary_reasons: getSummaryReasons(input.strategy),
    ability_highlights: allocations.map((allocation) => ({
      part_type: allocation.part_type,
      bucket: allocation.bucket,
      ability: allocation.ability,
      target_minutes: allocation.target_minutes,
    })),
  };

  logLearningPathV2DebugSafe("layer4.selected_roadmap_units", {
    stage: "layer4",
    strategy: input.strategy,
    scenario: input.scenario,
    target_score: input.target_score,
    total_available_minutes: input.total_available_minutes,
    lesson_manager_nodes_count: input.lesson_manager_nodes.length,
    part_paths_count: partPaths.length,
    part_roadmaps_count: output.part_roadmaps.length,
    selected_roadmap_units_count: allRoadmapUnits.length,
    estimated_total_minutes: output.estimated_total_minutes,
    estimated_gain: output.estimated_gain,
    reaches_target: output.reaches_target,
    focus_part_types: output.focus_part_types,
    focus_skill_keys_sample: output.focus_skill_keys.slice(0, 10),
    ability_highlights: output.ability_highlights,
    selected_roadmap_units_sample: allRoadmapUnits.slice(0, 5).map((unit) => ({
      lesson_manager_id: unit.lesson_manager_id,
      part_type: unit.part_type,
      unit_type: unit.unit_type,
      planned_minutes: unit.planned_minutes,
      estimated_gain: unit.estimated_gain,
      order: unit.order,
    })),
  });

  return output;
};











