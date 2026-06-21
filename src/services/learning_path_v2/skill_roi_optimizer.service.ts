import { DayStudy, LearningPath, LessonManager, UserSkill } from "../../models";
import type { IDayStudy } from "../../models/day_study.model";
import type { ILessonManager } from "../../models/lesson_manager.model";
import { WeekStudyStatus } from "../../models/enums/WeekStudyStatus";
import {
  normalizeToeicSkillTags,
  TOEIC_SKILL_DEFINITIONS,
} from "../../utils/toeic_skill.util";
import type {
  SelectBestSkillRoiInputV3,
  SkillRoiCandidateRejectionReasonV3,
  SkillRoiCandidateV3,
  SkillRoiDecisionV3,
  SkillRoiLessonManagerInputV3,
  SkillRoiPolicyV3,
  SkillRoiUnitResultV3,
  SkillRoiUserSkillInputV3,
} from "../../types/learning_path_v2";
import type { SkillRoiSkillGroupV3 } from "../../types/learning_path_v2";

export const getTargetSkillGroupDistribution = (
  targetScore: number
): Record<SkillRoiSkillGroupV3, number> => {
  if (targetScore <= 500) return { basic: 0.5, core: 0.4, advanced: 0.1 };
  if (targetScore <= 700) return { basic: 0.25, core: 0.55, advanced: 0.2 };
  if (targetScore <= 850) return { basic: 0.15, core: 0.45, advanced: 0.4 };
  return { basic: 0.1, core: 0.35, advanced: 0.55 };
};

export const DEFAULT_SKILL_ROI_POLICY_V3: SkillRoiPolicyV3 = {
  min_lesson_manager_count: 2,
  max_lesson_manager_count: 4,
  max_learning_minutes: 240,
  minimum_unit_roi_per_hour: 0,
  max_ability_distance: 0.25,
};

const roundToSix = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const isAbility = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

const getNormalizedSkillKeys = (
  node: SkillRoiLessonManagerInputV3
): string[] =>
  normalizeToeicSkillTags(node.target_tags, node.part_type).map(
    (skill) => skill.key
  );

/**
 * Kết quả một đường đi cục bộ trong LessonManager graph.
 * DFS chỉ trả node và tổng thời gian, không biết gì về ROI.
 */
export type SkillGraphPathV3 = {
  nodes: SkillRoiLessonManagerInputV3[];
  total_minutes: number;
};

/**
 * Package sau khi một graph path đã được quy đổi sang gain và ROI.
 */
export type SkillPackageV3 = {
  units: SkillRoiUnitResultV3[];
  estimated_learning_minutes: number;
  expected_skill_gain: number;
  expected_roi_per_hour: number;
};

export type FindBestSkillPackageResultV3 = {
  bestValidPackage?: SkillPackageV3;
  bestPartialPackage?: SkillPackageV3;
  reachableUnitCount: number;
};

const toUnitResult = (input: {
  skillAbility: number;
  partAbility: number;
  groupPriority: number;
  node: SkillRoiLessonManagerInputV3;
}): SkillRoiUnitResultV3 => {
  const normalizedSkillKeys = getNormalizedSkillKeys(input.node);
  const difficultyFit = Math.max(
    0,
    1 - Math.abs(input.node.weight - input.partAbility)
  );

  // Các target skill trong LessonManager có vai trò ngang nhau.
  // Hàm normalize đã loại trùng skill key trước khi tính tỷ trọng.
  const focusSkillShare = 1 / normalizedSkillKeys.length;

  const expectedSkillGain =
    (1 - input.skillAbility) *
    input.groupPriority *
    difficultyFit *
    focusSkillShare;

  const roiPerHour =
    expectedSkillGain / (input.node.planned_completion_time / 60);

  return {
    lesson_manager_id: input.node.id,
    title: input.node.title,
    part_type: input.node.part_type,
    unit_type: input.node.unit_type,
    normalized_skill_keys: normalizedSkillKeys,
    planned_minutes: input.node.planned_completion_time,
    difficulty_fit: roundToSix(difficultyFit),
    focus_skill_share: roundToSix(focusSkillShare),
    expected_skill_gain: roundToSix(expectedSkillGain),
    roi_per_hour: roundToSix(roiPerHour),
    reason:
      "Phù hợp ability Part, chứa primary skill và có ROI MVP hợp lệ.",
  };
};

const buildSkillPackage = (
  units: SkillRoiUnitResultV3[]
): SkillPackageV3 => {
  const estimatedLearningMinutes = units.reduce(
    (sum, unit) => sum + unit.planned_minutes,
    0
  );

  const expectedSkillGain = units.reduce(
    (sum, unit) => sum + unit.expected_skill_gain,
    0
  );

  const expectedRoiPerHour =
    estimatedLearningMinutes > 0
      ? expectedSkillGain / (estimatedLearningMinutes / 60)
      : 0;

  return {
    units,
    estimated_learning_minutes: estimatedLearningMinutes,
    expected_skill_gain: roundToSix(expectedSkillGain),
    expected_roi_per_hour: roundToSix(expectedRoiPerHour),
  };
};

const getPackageKey = (candidate: SkillPackageV3): string =>
  candidate.units.map((unit) => unit.lesson_manager_id).join("|");

/**
 * So sánh hai package hợp lệ của cùng một skill.
 * ROI là tiêu chí chính; gain và thời lượng chỉ dùng để phá hòa.
 */
const compareValidPackages = (
  left: SkillPackageV3,
  right: SkillPackageV3
): number =>
  right.expected_roi_per_hour - left.expected_roi_per_hour ||
  right.expected_skill_gain - left.expected_skill_gain ||
  left.estimated_learning_minutes - right.estimated_learning_minutes ||
  getPackageKey(left).localeCompare(getPackageKey(right));

/**
 * Khi chưa tạo đủ learning dose, giữ lại package dở tốt nhất để debug.
 * Ưu tiên package gần đạt số LessonManager tối thiểu nhất.
 */
const comparePartialPackages = (
  left: SkillPackageV3,
  right: SkillPackageV3
): number =>
  right.units.length - left.units.length ||
  right.expected_roi_per_hour - left.expected_roi_per_hour ||
  right.expected_skill_gain - left.expected_skill_gain ||
  left.estimated_learning_minutes - right.estimated_learning_minutes ||
  getPackageKey(left).localeCompare(getPackageKey(right));

const emptyCandidate = (input: {
  skill: SkillRoiUserSkillInputV3;
  partAbility: number;
  groupPriority: number;
  rejectionReason: SkillRoiCandidateRejectionReasonV3;
  availableUnitCount?: number;
  selectedPackage?: SkillPackageV3;
}): SkillRoiCandidateV3 => ({
  skill_key: input.skill.skill_key,
  part_type: input.skill.part_type,
  skill_group: input.skill.skill_group,
  current_ability: input.skill.ability,
  part_ability: input.partAbility,
  trend: input.skill.trend,
  history_count: input.skill.history_count,
  target_group_priority: input.groupPriority,
  selected_units: input.selectedPackage?.units ?? [],
  estimated_learning_minutes:
    input.selectedPackage?.estimated_learning_minutes ?? 0,
  expected_skill_gain: input.selectedPackage?.expected_skill_gain ?? 0,

  // Package chưa đủ learning dose vẫn giữ units và gain để debug,
  // nhưng ROI package bằng 0 để không bao giờ tham gia cạnh tranh giữa các skill.
  expected_roi_per_hour: 0,
  available_unit_count: input.availableUnitCount ?? 0,
  rejection_reason: input.rejectionReason,
});

const prerequisitesSatisfied = (
  node: SkillRoiLessonManagerInputV3,
  satisfiedIds: Set<string>
): boolean =>
  node.prerequisite_unit_ids.every((id) => satisfiedIds.has(id));

const isMatchingNodeForSkill = (input: {
  node: SkillRoiLessonManagerInputV3;
  skill: SkillRoiUserSkillInputV3;
  partAbility: number;
  policy: SkillRoiPolicyV3;
  completedIds: Set<string>;
}): boolean => {
  if (input.node.part_type !== input.skill.part_type) return false;
  if (input.completedIds.has(input.node.id)) return false;
  if (input.node.planned_completion_time <= 0) return false;

  if (
    Math.abs(input.node.weight - input.partAbility) >
    input.policy.max_ability_distance
  ) {
    return false;
  }

  return getNormalizedSkillKeys(input.node).includes(input.skill.skill_key);
};

/**
 * Duyệt LessonManager graph bằng DFS để sinh toàn bộ path cục bộ cho một skill.
 *
 * Hàm này chỉ xử lý cấu trúc graph và hard constraints:
 * - prerequisite;
 * - next_unit_ids;
 * - chống cycle;
 * - số LessonManager tối đa;
 * - tổng thời gian tối đa.
 *
 * Hàm không tính gain, không tính ROI và không chọn package tốt nhất.
 */
export const findSkillPathsByDfs = (input: {
  matchingNodes: SkillRoiLessonManagerInputV3[];
  nodesById: Map<string, SkillRoiLessonManagerInputV3>;
  completedIds: Set<string>;
  maxLessonManagerCount: number;
  maxLearningMinutes: number;
}): SkillGraphPathV3[] => {
  const matchingNodeIds = new Set(
    input.matchingNodes.map((node) => node.id)
  );
  const pathsByKey = new Map<string, SkillGraphPathV3>();

  const visit = (
    node: SkillRoiLessonManagerInputV3,
    currentPath: SkillRoiLessonManagerInputV3[],
    currentMinutes: number
  ): void => {
    // Không cho cùng một node xuất hiện hai lần trong một path.
    // Đây là safety guard nếu dữ liệu graph vô tình chứa vòng lặp.
    if (currentPath.some((item) => item.id === node.id)) {
      return;
    }

    // Prerequisite được xem là hard constraint.
    // Một prerequisite hợp lệ khi đã hoàn thành trước cycle
    // hoặc đã xuất hiện trong phần path đang được duyệt.
    const satisfiedIds = new Set<string>([
      ...input.completedIds,
      ...currentPath.map((item) => item.id),
    ]);

    if (!prerequisitesSatisfied(node, satisfiedIds)) {
      return;
    }

    const nextMinutes =
      currentMinutes + node.planned_completion_time;

    // Không cắt LessonManager. Nếu thêm nguyên unit làm vượt ngân sách,
    // toàn bộ nhánh từ node này bị dừng.
    if (nextMinutes > input.maxLearningMinutes) {
      return;
    }

    const nextPath = [...currentPath, node];
    const pathKey = nextPath.map((item) => item.id).join("|");

    // Lưu mọi prefix hợp lệ thay vì chỉ lưu terminal path.
    // Prefix một node phục vụ debug package chưa đủ learning dose;
    // prefix từ hai node trở lên có thể trở thành cycle hợp lệ.
    pathsByKey.set(pathKey, {
      nodes: nextPath,
      total_minutes: nextMinutes,
    });

    // Cycle hiện tại chỉ được chứa tối đa số LessonManager theo policy.
    // Graph dài hạn vẫn còn nguyên và sẽ được tính lại ở cycle sau.
    if (nextPath.length >= input.maxLessonManagerCount) {
      return;
    }

    // DFS chỉ đi theo cạnh next_unit_ids và chỉ giữ successor
    // thuộc tập LessonManager đã được lọc cho focus skill hiện tại.
    for (const nextId of node.next_unit_ids) {
      if (!matchingNodeIds.has(nextId)) {
        continue;
      }

      const nextNode = input.nodesById.get(nextId);
      if (!nextNode) {
        continue;
      }

      visit(nextNode, nextPath, nextMinutes);
    }
  };

  const startNodes = input.matchingNodes
    .filter((node) =>
      prerequisitesSatisfied(node, input.completedIds)
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  // Không chấm ROI để chọn start node. Mọi start node đủ prerequisite
  // đều được duyệt, tránh bỏ mất một path có ROI toàn package tốt hơn.
  for (const startNode of startNodes) {
    visit(startNode, [], 0);
  }

  return [...pathsByKey.values()];
};

/**
 * Chuyển các graph path thành package ROI và chọn package tốt nhất cho một skill.
 *
 * Hàm này không duyệt graph. Công thức ROI có thể thay đổi mà không ảnh hưởng DFS.
 */
export const selectBestPackageFromPaths = (input: {
  paths: SkillGraphPathV3[];
  skill: SkillRoiUserSkillInputV3;
  partAbility: number;
  groupPriority: number;
  policy: SkillRoiPolicyV3;
}): FindBestSkillPackageResultV3 => {
  const unitResultByNodeId = new Map<
    string,
    SkillRoiUnitResultV3
  >();
  const validPackages: SkillPackageV3[] = [];
  const partialPackages: SkillPackageV3[] = [];
  const reachableUnitIds = new Set<string>();

  const getUnitResult = (
    node: SkillRoiLessonManagerInputV3
  ): SkillRoiUnitResultV3 => {
    // Một LessonManager có thể xuất hiện trong nhiều graph path.
    // Cache giúp cùng một node chỉ tính gain/ROI một lần cho user state hiện tại.
    const cached = unitResultByNodeId.get(node.id);
    if (cached) {
      return cached;
    }

    const result = toUnitResult({
      skillAbility: input.skill.ability,
      partAbility: input.partAbility,
      groupPriority: input.groupPriority,
      node,
    });

    unitResultByNodeId.set(node.id, result);
    return result;
  };

  for (const path of input.paths) {
    // DFS chỉ sinh path; toàn bộ gain và ROI được quy đổi tại đây.
    const units = path.nodes.map((node) => {
      reachableUnitIds.add(node.id);
      return getUnitResult(node);
    });

    // Policy MVP hiện đặt ngưỡng bằng 0. Khi policy tăng trong tương lai,
    // package có bất kỳ unit nào dưới ngưỡng sẽ không được sử dụng.
    const hasUnitBelowMinimumRoi = units.some(
      (unit) =>
        unit.roi_per_hour <
        input.policy.minimum_unit_roi_per_hour
    );

    if (hasUnitBelowMinimumRoi) {
      continue;
    }

    const candidatePackage = buildSkillPackage(units);

    if (
      units.length >= input.policy.min_lesson_manager_count &&
      units.length <= input.policy.max_lesson_manager_count
    ) {
      // Chỉ package đủ learning dose mới được phép cạnh tranh giữa các skill.
      validPackages.push(candidatePackage);
      continue;
    }

    // Package chưa đủ learning dose vẫn được giữ để debug.
    // Khi đưa vào rejected candidate, ROI package sẽ bị đặt về 0.
    partialPackages.push(candidatePackage);
  }

  return {
    bestValidPackage: [...validPackages].sort(compareValidPackages)[0],
    bestPartialPackage: [...partialPackages].sort(comparePartialPackages)[0],
    reachableUnitCount: reachableUnitIds.size,
  };
};

/**
 * Điều phối hai bước độc lập cho một skill:
 * 1. DFS sinh các graph path hợp lệ.
 * 2. ROI evaluator chấm và chọn package tốt nhất.
 */
export const findBestPackageForSkill = (input: {
  skill: SkillRoiUserSkillInputV3;
  partAbility: number;
  groupPriority: number;
  matchingNodes: SkillRoiLessonManagerInputV3[];
  nodesById: Map<string, SkillRoiLessonManagerInputV3>;
  completedIds: Set<string>;
  policy: SkillRoiPolicyV3;
}): FindBestSkillPackageResultV3 => {
  const paths = findSkillPathsByDfs({
    matchingNodes: input.matchingNodes,
    nodesById: input.nodesById,
    completedIds: input.completedIds,
    maxLessonManagerCount:
      input.policy.max_lesson_manager_count,
    maxLearningMinutes: input.policy.max_learning_minutes,
  });

  return selectBestPackageFromPaths({
    paths,
    skill: input.skill,
    partAbility: input.partAbility,
    groupPriority: input.groupPriority,
    policy: input.policy,
  });
};

/**
 * Engine thuần: không gọi Mongoose và không ghi bất kỳ model nào.
 * Mỗi skill được chấm bằng package tốt nhất của chính skill đó;
 * sau cùng mới so sánh ROI giữa các skill để chọn cycle tiếp theo.
 */
export const selectBestSkillRoiOpportunity = (
  input: SelectBestSkillRoiInputV3
): SkillRoiDecisionV3 => {
  const policy = input.policy;
  const targetDistribution = getTargetSkillGroupDistribution(
    input.target_score
  );
  const nodesById = new Map(
    input.lesson_managers.map((node) => [node.id, node])
  );
  const completedIds = new Set(input.completed_lesson_manager_ids);
  const partAbilityByPart = new Map(
    input.part_abilities.map((part) => [part.part_type, part.ability])
  );
  const candidates: SkillRoiCandidateV3[] = [];

  for (const skill of input.skill_abilities) {
    const taxonomy = TOEIC_SKILL_DEFINITIONS.find(
      (item) => item.key === skill.skill_key
    );
    const partAbility = partAbilityByPart.get(skill.part_type);
    const groupPriority = targetDistribution[skill.skill_group];

    // Taxonomy là nguồn chuẩn cho skill key, Part và skill group.
    // Input sai taxonomy không được phép đi tiếp vào graph planner.
    if (
      !taxonomy ||
      taxonomy.part_type !== skill.part_type ||
      taxonomy.skill_group !== skill.skill_group ||
      !isAbility(skill.ability)
    ) {
      candidates.push(
        emptyCandidate({
          skill,
          partAbility: partAbility ?? 0,
          groupPriority,
          rejectionReason: "skill_not_in_taxonomy",
        })
      );
      continue;
    }

    if (!isAbility(partAbility)) {
      candidates.push(
        emptyCandidate({
          skill,
          partAbility: 0,
          groupPriority,
          rejectionReason: "missing_part_ability",
        })
      );
      continue;
    }

    // Đây mới chỉ là bước lọc candidate node cho skill.
    // Việc chọn path/package tốt nhất diễn ra sau bằng DFS + ROI evaluator.
    const matchingNodes = input.lesson_managers.filter((node) =>
      isMatchingNodeForSkill({
        node,
        skill,
        partAbility,
        policy,
        completedIds,
      })
    );

    if (matchingNodes.length === 0) {
      candidates.push(
        emptyCandidate({
          skill,
          partAbility,
          groupPriority,
          rejectionReason: "no_matching_lesson_manager",
        })
      );
      continue;
    }

    const packageResult = findBestPackageForSkill({
      skill,
      partAbility,
      groupPriority,
      matchingNodes,
      nodesById,
      completedIds,
      policy,
    });

    if (!packageResult.bestValidPackage) {
      candidates.push(
        emptyCandidate({
          skill,
          partAbility,
          groupPriority,
          availableUnitCount: matchingNodes.length,
          selectedPackage: packageResult.bestPartialPackage,
          rejectionReason:
            packageResult.reachableUnitCount === 0
              ? "no_reachable_lesson_manager"
              : "insufficient_learning_package",
        })
      );
      continue;
    }

    candidates.push({
      skill_key: skill.skill_key,
      part_type: skill.part_type,
      skill_group: skill.skill_group,
      current_ability: skill.ability,
      part_ability: partAbility,
      trend: skill.trend,
      history_count: skill.history_count,
      target_group_priority: groupPriority,
      selected_units: packageResult.bestValidPackage.units,
      estimated_learning_minutes:
        packageResult.bestValidPackage.estimated_learning_minutes,
      expected_skill_gain:
        packageResult.bestValidPackage.expected_skill_gain,
      expected_roi_per_hour:
        packageResult.bestValidPackage.expected_roi_per_hour,
      available_unit_count: matchingNodes.length,
    });
  }

  const eligible = candidates
    .filter((candidate) => !candidate.rejection_reason)
    .sort(
      (left, right) =>
        right.expected_roi_per_hour - left.expected_roi_per_hour ||
        right.expected_skill_gain - left.expected_skill_gain ||
        left.estimated_learning_minutes -
        right.estimated_learning_minutes ||
        left.current_ability - right.current_ability ||
        left.skill_key.localeCompare(right.skill_key)
    );

  if (eligible.length === 0) {
    return {
      status: "no_eligible_skill",
      evaluated_skill_count: input.skill_abilities.length,
      eligible_skill_count: 0,
      candidates,
      reason: "Không có skill nào tạo được package LessonManager hợp lệ.",
    };
  }

  // Package đã được chọn xong trước khi đến đây.
  // Sau khi skill thắng ROI, không chạy DFS lần nữa; selected_units đi thẳng sang cycle.
  const winner = eligible[0];

  const coveredSkillKeys = Array.from(
    new Set(
      winner.selected_units.flatMap(
        (unit) => unit.normalized_skill_keys
      )
    )
  )
    .filter((key) => key !== winner.skill_key)
    .filter((key) =>
      TOEIC_SKILL_DEFINITIONS.some(
        (item) =>
          item.key === key && item.part_type === winner.part_type
      )
    )
    .sort();

  return {
    status: "selected",
    evaluated_skill_count: input.skill_abilities.length,
    eligible_skill_count: eligible.length,
    primary_focus_skill_key: winner.skill_key,
    focus_part_type: winner.part_type,
    covered_skill_keys: coveredSkillKeys,
    selected_units: winner.selected_units,
    estimated_learning_minutes: winner.estimated_learning_minutes,
    expected_skill_gain: winner.expected_skill_gain,
    expected_roi_per_hour: winner.expected_roi_per_hour,
    candidates,
  };
};

/**
 * Resolver chỉ đọc state hiện tại để tạo input cho pure ROI engine.
 * Checkpoint 2 chưa tạo StrategyOption, WeekStudy, DayStudy hoặc assessment mới.
 */
export const buildSkillRoiPlanningContext = async (input: {
  user_id: string;
  learning_path_id: string;
  policy?: SkillRoiPolicyV3;
}): Promise<SelectBestSkillRoiInputV3> => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  }).lean();

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath đang hoạt động.");
  }

  const userSkill = await UserSkill.findOne({
    user_id: input.user_id,
    context_type: "learning_path",
    learning_path_id: input.learning_path_id,
  }).lean();

  if (!userSkill) {
    throw new Error("Không tìm thấy UserSkill của LearningPath.");
  }

  const nodes = (await LessonManager.find({
    status: { $in: ["approved", "open"] },
  }).lean()) as unknown as ILessonManager[];

  const dayStudies = (await DayStudy.find({
    week_id: { $in: learningPath.week_study_ids ?? [] },
  }).lean()) as unknown as IDayStudy[];

  const completed = new Set<string>();

  // Logic completion này giữ tương thích với dữ liệu hiện tại.
  // Checkpoint 3 sẽ thống nhất 1 LessonManager = 1 DayStudy = 1 Session,
  // khi đó resolver có thể xác định completion trực tiếp từ DayStudy.
  for (const day of dayStudies) {
    for (const session of day.sessions ?? []) {
      if (
        day.status === WeekStudyStatus.COMPLETED ||
        session.status === WeekStudyStatus.COMPLETED
      ) {
        if (session.lesson_manager_id) {
          completed.add(String(session.lesson_manager_id));
        }

        for (const item of session.items ?? []) {
          if (item.source_lesson_manager_id) {
            completed.add(String(item.source_lesson_manager_id));
          }
        }
      }
    }
  }

  return {
    target_score: learningPath.target_score ?? 0,
    part_abilities: (userSkill.parts ?? []).map((part) => ({
      part_type: part.part_type,
      ability: part.ability,
    })),
    skill_abilities: (userSkill.parts ?? []).flatMap((part) =>
      (part.skills ?? []).flatMap((skill) => {
        const taxonomy = TOEIC_SKILL_DEFINITIONS.find(
          (item) => item.key === skill.skill_key
        );
        const skillGroup = skill.skill_group ?? taxonomy?.skill_group;

        // Không tự mặc định về core vì có thể làm sai target group priority.
        // Skill thiếu group và không có taxonomy tương ứng sẽ không vào ROI input.
        if (!skillGroup) return [];

        return [
          {
            skill_key: skill.skill_key,
            part_type: part.part_type,
            skill_group: skillGroup,
            ability: skill.ability,
            trend: skill.trend,
            history_count: skill.history_count ?? 0,
          },
        ];
      })
    ),
    lesson_managers: nodes.map((node) => ({
      id: String(node._id),
      title: node.title,
      part_type: node.part_type,
      unit_type: node.unit_type,
      node_role: node.node_role,
      target_tags: node.target_tags ?? [],
      weight: node.weight,
      planned_completion_time: node.planned_completion_time,
      next_unit_ids: (node.next_unit_ids ?? []).map(String),
      prerequisite_unit_ids: (node.prerequisite_unit_ids ?? []).map(String),
      auxiliary_unit_ids: (node.auxiliary_unit_ids ?? []).map(String),
    })),
    completed_lesson_manager_ids: Array.from(completed),
    policy: input.policy ?? DEFAULT_SKILL_ROI_POLICY_V3,
  };
};
