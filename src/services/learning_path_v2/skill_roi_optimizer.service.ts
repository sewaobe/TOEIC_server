import {
  DayStudy,
  LearningPath,
  LessonManager,
  UserSkill,
} from "../../models";
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
  SkillRoiSkillGroupV3,
  SkillRoiUnitResultV3,
  SkillRoiUserSkillInputV3,
} from "../../types/learning_path_v2";

/**
 * Phân phối ưu tiên skill group theo target score.
 *
 * Đây là soft priority, không phải quota cứng.
 */
export const getTargetSkillGroupDistribution = (
  targetScore: number
): Record<SkillRoiSkillGroupV3, number> => {
  if (targetScore <= 500) {
    return {
      basic: 0.5,
      core: 0.4,
      advanced: 0.1,
    };
  }

  if (targetScore <= 700) {
    return {
      basic: 0.25,
      core: 0.55,
      advanced: 0.2,
    };
  }

  if (targetScore <= 850) {
    return {
      basic: 0.15,
      core: 0.45,
      advanced: 0.4,
    };
  }

  return {
    basic: 0.1,
    core: 0.35,
    advanced: 0.55,
  };
};

export const DEFAULT_SKILL_ROI_POLICY_V3: SkillRoiPolicyV3 = {
  min_lesson_manager_count: 2,
  max_lesson_manager_count: 4,
  max_learning_minutes: 240,
  minimum_unit_roi_per_hour: 0,
  max_ability_distance: 0.25,
  /*
   * Main learning và roadmap dự kiến chỉ đi qua các bài học chính.
   * remedial/exam_practice được để cho remediation hoặc giai đoạn luyện đề riêng,
   * tránh việc roadmap dài hạn trộn bài chữa hổng/luyện đề vào luồng học nền tảng.
   */
  allowed_unit_types: ["foundation", "skill_drill", "mixed_practice"],
};

const roundToSix = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const isAbility = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

/**
 * Tỷ trọng của từng TOEIC Part trong section tương ứng.
 */
const TOEIC_PART_SCORE_WEIGHT: Record<number, number> = {
  1: 0.06,
  2: 0.25,
  3: 0.39,
  4: 0.3,
  5: 0.3,
  6: 0.16,
  7: 0.54,
};

/** Mỗi section có thang điểm từ 5 đến 495. */
const TOEIC_SECTION_SCORE_RANGE = 490;

const clampAbility = (value: number): number =>
  Math.min(1, Math.max(0, value));

type PartAbilityMap = Record<number, number>;

export type ProjectedToeicScore = {
  listening_ability: number;
  reading_ability: number;
  projected_listening_score: number;
  projected_reading_score: number;
  projected_total_score: number;
};

const clampProjectedAbility = (value: number | undefined): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? Number(value) : 0));

const roundToNearest5 = (value: number): number =>
  Math.round(value / 5) * 5;

const abilityToSectionScore = (ability: number): number => {
  const score = 5 + clampProjectedAbility(ability) * TOEIC_SECTION_SCORE_RANGE;
  return Math.min(495, Math.max(5, roundToNearest5(score)));
};

export const calculateProjectedToeicScore = (
  abilities: PartAbilityMap
): ProjectedToeicScore => {
  const listeningAbility =
    clampProjectedAbility(abilities[1]) * TOEIC_PART_SCORE_WEIGHT[1] +
    clampProjectedAbility(abilities[2]) * TOEIC_PART_SCORE_WEIGHT[2] +
    clampProjectedAbility(abilities[3]) * TOEIC_PART_SCORE_WEIGHT[3] +
    clampProjectedAbility(abilities[4]) * TOEIC_PART_SCORE_WEIGHT[4];

  const readingAbility =
    clampProjectedAbility(abilities[5]) * TOEIC_PART_SCORE_WEIGHT[5] +
    clampProjectedAbility(abilities[6]) * TOEIC_PART_SCORE_WEIGHT[6] +
    clampProjectedAbility(abilities[7]) * TOEIC_PART_SCORE_WEIGHT[7];

  const projectedListeningScore = abilityToSectionScore(listeningAbility);
  const projectedReadingScore = abilityToSectionScore(readingAbility);

  return {
    listening_ability: listeningAbility,
    reading_ability: readingAbility,
    projected_listening_score: projectedListeningScore,
    projected_reading_score: projectedReadingScore,
    projected_total_score: projectedListeningScore + projectedReadingScore,
  };
};

const getSkillCountOfPart = (partType: number): number =>
  TOEIC_SKILL_DEFINITIONS.filter(
    (definition) => definition.part_type === partType
  ).length;

type ProjectSkillGainToScoreResult = {
  projected_part_ability_before: number;
  projected_part_ability_after: number;
  projected_part_ability_gain: number;
  projected_score_gain: number;
};

/**
 * Quy đổi gain của một skill sang Part ability và TOEIC total-score delta.
 * Khi chưa có dữ liệu thực nghiệm theo từng skill, các skill cùng Part có
 * trọng số ngang nhau.
 */
const projectSkillGainToToeicScore = (input: {
  partType: number;
  currentPartAbility: number;
  projectedSkillGain: number;
}): ProjectSkillGainToScoreResult => {
  const skillCount = getSkillCountOfPart(input.partType);
  const partScoreWeight = TOEIC_PART_SCORE_WEIGHT[input.partType];

  if (skillCount <= 0 || typeof partScoreWeight !== "number") {
    throw new Error(
      `Không thể quy đổi projected gain cho TOEIC Part ${input.partType}.`
    );
  }

  const projectedPartAbilityBefore = roundToSix(
    clampAbility(input.currentPartAbility)
  );
  const rawProjectedPartGain = input.projectedSkillGain / skillCount;
  const projectedPartAbilityAfter = roundToSix(
    clampAbility(projectedPartAbilityBefore + rawProjectedPartGain)
  );
  const projectedPartAbilityGain = roundToSix(
    projectedPartAbilityAfter - projectedPartAbilityBefore
  );
  const projectedScoreGain = roundToSix(
    projectedPartAbilityGain *
    partScoreWeight *
    TOEIC_SECTION_SCORE_RANGE
  );

  return {
    projected_part_ability_before: projectedPartAbilityBefore,
    projected_part_ability_after: projectedPartAbilityAfter,
    projected_part_ability_gain: projectedPartAbilityGain,
    projected_score_gain: projectedScoreGain,
  };
};

const normalizedSkillKeysByNode =
  new WeakMap<
    SkillRoiLessonManagerInputV3,
    string[]
  >();

const getNormalizedSkillKeys = (
  node: SkillRoiLessonManagerInputV3
): string[] => {
  const cached =
    normalizedSkillKeysByNode.get(node);

  if (cached) {
    return cached;
  }

  const normalizedSkillKeys =
    normalizeToeicSkillTags(
      node.target_tags,
      node.part_type
    ).map((skill) => skill.key);

  normalizedSkillKeysByNode.set(
    node,
    normalizedSkillKeys
  );

  return normalizedSkillKeys;
};

const lessonManagersBySkillCache =
  new WeakMap<
    SkillRoiLessonManagerInputV3[],
    Map<
      string,
      SkillRoiLessonManagerInputV3[]
    >
  >();

const getLessonManagersBySkill = (
  lessonManagers:
    SkillRoiLessonManagerInputV3[]
): Map<
  string,
  SkillRoiLessonManagerInputV3[]
> => {
  const cached =
    lessonManagersBySkillCache.get(
      lessonManagers
    );

  if (cached) {
    return cached;
  }

  const result = new Map<
    string,
    SkillRoiLessonManagerInputV3[]
  >();

  for (
    const lessonManager of lessonManagers
  ) {
    const skillKeys =
      getNormalizedSkillKeys(
        lessonManager
      );

    for (const skillKey of skillKeys) {
      const current =
        result.get(skillKey) ?? [];

      current.push(lessonManager);
      result.set(skillKey, current);
    }
  }

  lessonManagersBySkillCache.set(
    lessonManagers,
    result
  );

  return result;
};

/**
 * Một tổ hợp LessonManager có khả năng trở thành package của cycle.
 *
 * Tổ hợp không bắt buộc phải tạo thành một path liên tục trong graph.
 * next/prerequisite/auxiliary chỉ được dùng để đánh giá mức liên hệ
 * và sắp xếp thứ tự học sau khi package được chọn.
 */
export type SkillPackageCombinationV3 = {
  nodes: SkillRoiLessonManagerInputV3[];
  total_minutes: number;
};

/**
 * Package sau khi các LessonManager đã được tính gain và ROI.
 *
 * relation_count và relation_quality chỉ là thông tin nội bộ
 * để phá hòa giữa các package có ROI tương đương.
 *
 * Hai field này không được cộng vào expected gain hoặc ROI.
 */
export type SkillPackageV3 = {
  units: SkillRoiUnitResultV3[];
  estimated_learning_minutes: number;

  projected_skill_ability_before: number;
  projected_skill_ability_after: number;

  expected_skill_gain: number;
  expected_roi_per_hour: number;
  relation_count: number;
  relation_quality: number;
};

export type FindBestSkillPackageResultV3 = {
  bestValidPackage?: SkillPackageV3;
  bestPartialPackage?: SkillPackageV3;

  /**
   * Tên field được giữ để tương thích với code/debug hiện tại.
   *
   * Sau khi graph edge không còn là hard constraint,
   * giá trị này là số LessonManager phù hợp có thể được đưa vào tổ hợp.
   */
  reachableUnitCount: number;
};

/**
 * Tính expected gain và ROI riêng của một LessonManager
 * đối với skill đang được đánh giá.
 */
const toUnitResult = (input: {
  skillAbility: number;
  partAbility: number;
  groupPriority: number;
  node: SkillRoiLessonManagerInputV3;
}): SkillRoiUnitResultV3 => {
  const normalizedSkillKeys = getNormalizedSkillKeys(
    input.node
  );

  const difficultyFit = Math.max(
    0,
    1 - Math.abs(input.node.weight - input.partAbility)
  );

  /**
   * Các target skill trong cùng LessonManager có vai trò ngang nhau.
   *
   * Ví dụ LessonManager chứa 2 skill thì một nửa expected gain
   * của LessonManager được quy cho focus skill đang xét.
   */
  const focusSkillShare =
    1 / normalizedSkillKeys.length;

  const expectedSkillGain =
    (1 - input.skillAbility) *
    input.groupPriority *
    difficultyFit *
    focusSkillShare;

  const plannedHours =
    input.node.planned_completion_time / 60;

  const roiPerHour =
    plannedHours > 0
      ? expectedSkillGain / plannedHours
      : 0;

  return {
    lesson_manager_id: input.node.id,
    title: input.node.title,
    part_type: input.node.part_type,
    unit_type: input.node.unit_type,
    normalized_skill_keys: normalizedSkillKeys,
    planned_minutes:
      input.node.planned_completion_time,
    difficulty_fit: roundToSix(difficultyFit),
    focus_skill_share: roundToSix(
      focusSkillShare
    ),
    expected_skill_gain: roundToSix(
      expectedSkillGain
    ),
    roi_per_hour: roundToSix(roiPerHour),
    reason:
      "Chứa primary skill, phù hợp ability Part và có ROI MVP hợp lệ.",
  };
};

/**
 * Kiểm tra hai LessonManager có mối liên hệ được admin khai báo hay không.
 *
 * Mối liên hệ chỉ dùng như recommendation:
 * - next: bài thường phù hợp để học tiếp;
 * - prerequisite: bài thường nên học trước;
 * - auxiliary: bài bổ trợ có liên quan.
 *
 * Không có quan hệ vẫn được phép nằm chung một package.
 */
const areNodesRelated = (
  left: SkillRoiLessonManagerInputV3,
  right: SkillRoiLessonManagerInputV3
): boolean => {
  const leftToRight =
    left.next_unit_ids.includes(right.id) ||
    left.prerequisite_unit_ids.includes(
      right.id
    ) ||
    left.auxiliary_unit_ids.includes(right.id);

  const rightToLeft =
    right.next_unit_ids.includes(left.id) ||
    right.prerequisite_unit_ids.includes(
      left.id
    ) ||
    right.auxiliary_unit_ids.includes(left.id);

  return leftToRight || rightToLeft;
};

/**
 * Đếm số cặp LessonManager có quan hệ nội bộ trong package.
 *
 * Mỗi cặp chỉ được tính một lần, dù chúng có đồng thời
 * next, prerequisite và auxiliary relation.
 */
const calculatePackageRelationStats = (
  nodes: SkillRoiLessonManagerInputV3[]
): {
  relationCount: number;
  relationQuality: number;
} => {
  let relationCount = 0;
  let totalPairCount = 0;

  for (
    let leftIndex = 0;
    leftIndex < nodes.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < nodes.length;
      rightIndex += 1
    ) {
      totalPairCount += 1;

      if (
        areNodesRelated(
          nodes[leftIndex],
          nodes[rightIndex]
        )
      ) {
        relationCount += 1;
      }
    }
  }

  const relationQuality =
    totalPairCount > 0
      ? relationCount / totalPairCount
      : 0;

  return {
    relationCount,
    relationQuality: roundToSix(
      relationQuality
    ),
  };
};

/**
 * Thêm một directed recommendation edge dùng để sắp xếp package.
 *
 * - next: node hiện tại -> node tiếp theo;
 * - prerequisite: prerequisite -> node hiện tại.
 *
 * Auxiliary không mang ý nghĩa thứ tự nên không tạo directed edge.
 */
const addRecommendationEdge = (input: {
  fromId: string;
  toId: string;
  selectedNodeIds: Set<string>;
  outgoingByNodeId: Map<string, Set<string>>;
  incomingCountByNodeId: Map<string, number>;
}): void => {
  if (input.fromId === input.toId) {
    return;
  }

  if (
    !input.selectedNodeIds.has(input.fromId) ||
    !input.selectedNodeIds.has(input.toId)
  ) {
    return;
  }

  const outgoing =
    input.outgoingByNodeId.get(input.fromId);

  if (!outgoing || outgoing.has(input.toId)) {
    return;
  }

  outgoing.add(input.toId);

  input.incomingCountByNodeId.set(
    input.toId,
    (input.incomingCountByNodeId.get(
      input.toId
    ) ?? 0) + 1
  );
};

/**
 * Sắp xếp các LessonManager sau khi package đã được chọn.
 *
 * Ưu tiên:
 * 1. Quan hệ prerequisite nằm trước bài phụ thuộc.
 * 2. Quan hệ next giữ đúng hướng được admin khai báo.
 * 3. Các node không có thứ tự rõ ràng được xếp theo weight tăng dần.
 * 4. ID được dùng để kết quả luôn deterministic.
 *
 * Nếu dữ liệu graph có cycle, những node còn lại được xếp
 * theo weight và ID thay vì làm scheduler thất bại.
 */
export const orderPackageNodesByRecommendations = (
  nodes: SkillRoiLessonManagerInputV3[]
): SkillRoiLessonManagerInputV3[] => {
  const nodeById = new Map(
    nodes.map((node) => [node.id, node])
  );

  const selectedNodeIds = new Set(
    nodeById.keys()
  );

  const outgoingByNodeId = new Map<
    string,
    Set<string>
  >();

  const incomingCountByNodeId =
    new Map<string, number>();

  for (const node of nodes) {
    outgoingByNodeId.set(node.id, new Set());
    incomingCountByNodeId.set(node.id, 0);
  }

  for (const node of nodes) {
    /**
     * next_unit_ids thể hiện bài thường phù hợp
     * để học sau node hiện tại.
     */
    for (const nextId of node.next_unit_ids) {
      addRecommendationEdge({
        fromId: node.id,
        toId: nextId,
        selectedNodeIds,
        outgoingByNodeId,
        incomingCountByNodeId,
      });
    }

    /**
     * Nếu node khai báo prerequisite P,
     * thứ tự gợi ý là P trước node.
     *
     * Đây chỉ là thứ tự trong trường hợp P cũng được chọn;
     * scheduler không bắt buộc phải thêm P vào package.
     */
    for (
      const prerequisiteId of
      node.prerequisite_unit_ids
    ) {
      addRecommendationEdge({
        fromId: prerequisiteId,
        toId: node.id,
        selectedNodeIds,
        outgoingByNodeId,
        incomingCountByNodeId,
      });
    }
  }

  const compareNodes = (
    left: SkillRoiLessonManagerInputV3,
    right: SkillRoiLessonManagerInputV3
  ): number =>
    left.weight - right.weight ||
    left.id.localeCompare(right.id);

  const readyNodes = nodes
    .filter(
      (node) =>
        (incomingCountByNodeId.get(node.id) ??
          0) === 0
    )
    .sort(compareNodes);

  const orderedNodes: SkillRoiLessonManagerInputV3[] =
    [];

  const orderedNodeIds = new Set<string>();

  while (readyNodes.length > 0) {
    const currentNode = readyNodes.shift();

    if (!currentNode) {
      break;
    }

    if (orderedNodeIds.has(currentNode.id)) {
      continue;
    }

    orderedNodes.push(currentNode);
    orderedNodeIds.add(currentNode.id);

    const outgoingIds =
      outgoingByNodeId.get(currentNode.id) ??
      new Set<string>();

    for (const outgoingId of outgoingIds) {
      const nextIncomingCount =
        (incomingCountByNodeId.get(outgoingId) ??
          0) - 1;

      incomingCountByNodeId.set(
        outgoingId,
        nextIncomingCount
      );

      if (nextIncomingCount !== 0) {
        continue;
      }

      const outgoingNode =
        nodeById.get(outgoingId);

      if (
        outgoingNode &&
        !orderedNodeIds.has(outgoingNode.id)
      ) {
        readyNodes.push(outgoingNode);
        readyNodes.sort(compareNodes);
      }
    }
  }

  /**
   * Nếu graph có cycle hoặc edge không nhất quán,
   * scheduler vẫn giữ package và sắp phần còn lại
   * theo độ khó thay vì loại toàn bộ package.
   */
  const remainingNodes = nodes
    .filter(
      (node) => !orderedNodeIds.has(node.id)
    )
    .sort(compareNodes);

  return [...orderedNodes, ...remainingNodes];
};

/**
 * Sinh tất cả tổ hợp LessonManager có thể dùng cho một skill.
 *
 * Hàm này chỉ xử lý:
 * - số lượng LessonManager tối đa;
 * - tổng thời gian tối đa.
 *
 * Hàm không:
 * - kiểm tra prerequisite như hard constraint;
 * - yêu cầu next edge;
 * - tính gain;
 * - tính ROI;
 * - chọn package tốt nhất.
 */
export const buildSkillPackageCombinations = (
  input: {
    nodes: SkillRoiLessonManagerInputV3[];
    maxLessonManagerCount: number;
    maxLearningMinutes: number;
  }
): SkillPackageCombinationV3[] => {
  const sortedNodes = [...input.nodes].sort(
    (left, right) =>
      left.id.localeCompare(right.id)
  );

  const combinations: SkillPackageCombinationV3[] =
    [];

  const visit = (
    startIndex: number,
    selectedNodes: SkillRoiLessonManagerInputV3[],
    selectedMinutes: number
  ): void => {
    for (
      let index = startIndex;
      index < sortedNodes.length;
      index += 1
    ) {
      const node = sortedNodes[index];

      const nextMinutes =
        selectedMinutes +
        node.planned_completion_time;

      /**
       * Không cắt một LessonManager.
       * Nếu thêm nguyên node làm vượt cycle budget,
       * chỉ bỏ tổ hợp chứa node này.
       */
      if (
        nextMinutes >
        input.maxLearningMinutes
      ) {
        continue;
      }

      const nextNodes = [
        ...selectedNodes,
        node,
      ];

      combinations.push({
        nodes: nextNodes,
        total_minutes: nextMinutes,
      });

      if (
        nextNodes.length >=
        input.maxLessonManagerCount
      ) {
        continue;
      }

      visit(
        index + 1,
        nextNodes,
        nextMinutes
      );
    }
  };

  visit(0, [], 0);

  return combinations;
};

/**
 * Chuyển một tổ hợp node thành package ROI hoàn chỉnh.
 */
const buildSkillPackage = (input: {
  nodes: SkillRoiLessonManagerInputV3[];

  unitResultByNodeId: Map<
    string,
    SkillRoiUnitResultV3
  >;

  currentSkillAbility: number;
  groupPriority: number;
}): SkillPackageV3 => {
  /**
   * Graph chỉ dùng để sắp xếp thứ tự học.
   * Sau khi có thứ tự, gain của từng unit được tính tuần tự:
   *
   * Unit 1: X  → X1
   * Unit 2: X1 → X2
   * Unit 3: X2 → X3
   */
  const orderedNodes =
    orderPackageNodesByRecommendations(
      input.nodes
    );

  let projectedAbility =
    input.currentSkillAbility;

  const units = orderedNodes.map((node) => {
    const baseUnit =
      input.unitResultByNodeId.get(node.id);

    if (!baseUnit) {
      throw new Error(
        `Không tìm thấy ROI result của LessonManager ${node.id}.`
      );
    }

    /**
     * Làm tròn trạng thái đầu vào trước khi tính unit.
     *
     * Việc này bảo đảm:
     * projected_after của unit trước
     * luôn bằng projected_before của unit sau.
     */
    const projectedAbilityBefore =
      roundToSix(projectedAbility);

    const rawUnitGain =
      (1 - projectedAbilityBefore) *
      input.groupPriority *
      baseUnit.difficulty_fit *
      baseUnit.focus_skill_share;

    const projectedAbilityAfter =
      roundToSix(
        Math.min(
          1,
          projectedAbilityBefore +
          rawUnitGain
        )
      );

    /**
     * Gain được tính trực tiếp từ hai trạng thái
     * đã làm tròn để dữ liệu luôn khớp tuyệt đối.
     */
    const projectedUnitGain =
      roundToSix(
        projectedAbilityAfter -
        projectedAbilityBefore
      );

    const unitLearningHours =
      baseUnit.planned_minutes / 60;

    const unitRoiPerHour =
      unitLearningHours > 0
        ? projectedUnitGain /
        unitLearningHours
        : 0;

    /**
     * Unit tiếp theo bắt đầu đúng từ trạng thái
     * kết thúc của unit hiện tại.
     */
    projectedAbility =
      projectedAbilityAfter;

    return {
      ...baseUnit,

      projected_skill_ability_before:
        projectedAbilityBefore,

      projected_skill_ability_after:
        projectedAbilityAfter,

      expected_skill_gain:
        projectedUnitGain,

      roi_per_hour:
        roundToSix(unitRoiPerHour),
    };

  });

  const estimatedLearningMinutes =
    units.reduce(
      (sum, unit) =>
        sum + unit.planned_minutes,
      0
    );

  const projectedSkillAbilityBefore =
    roundToSix(
      input.currentSkillAbility
    );

  const projectedSkillAbilityAfter =
    roundToSix(projectedAbility);

  /**
   * Gain package được tính từ trạng thái đầu
   * và trạng thái cuối đã làm tròn.
   */
  const expectedSkillGain =
    roundToSix(
      projectedSkillAbilityAfter -
      projectedSkillAbilityBefore
    );

  const expectedRoiPerHour =
    estimatedLearningMinutes > 0
      ? expectedSkillGain /
      (estimatedLearningMinutes / 60)
      : 0;


  const relationStats =
    calculatePackageRelationStats(
      input.nodes
    );

  return {
    units,

    projected_skill_ability_before:
      projectedSkillAbilityBefore,

    projected_skill_ability_after:
      projectedSkillAbilityAfter,

    estimated_learning_minutes:
      estimatedLearningMinutes,

    expected_skill_gain:
      expectedSkillGain,

    expected_roi_per_hour:
      roundToSix(expectedRoiPerHour),

    relation_count:
      relationStats.relationCount,

    relation_quality:
      relationStats.relationQuality,
  };
};

const getPackageKey = (
  candidate: SkillPackageV3
): string =>
  candidate.units
    .map((unit) => unit.lesson_manager_id)
    .join("|");

/**
 * So sánh hai package hợp lệ của cùng một skill.
 *
 * Graph không làm tăng expected gain hay ROI.
 * Nó chỉ được dùng sau ROI để ưu tiên package
 * có tính liên tục sư phạm tốt hơn.
 */
const compareValidPackages = (
  left: SkillPackageV3,
  right: SkillPackageV3
): number =>
  right.expected_roi_per_hour -
  left.expected_roi_per_hour ||
  right.relation_quality -
  left.relation_quality ||
  right.relation_count -
  left.relation_count ||
  right.expected_skill_gain -
  left.expected_skill_gain ||
  left.estimated_learning_minutes -
  right.estimated_learning_minutes ||
  getPackageKey(left).localeCompare(
    getPackageKey(right)
  );

/**
 * Khi chưa tạo đủ learning dose,
 * giữ lại package dở tốt nhất để debug.
 */
const comparePartialPackages = (
  left: SkillPackageV3,
  right: SkillPackageV3
): number =>
  right.units.length -
  left.units.length ||
  right.expected_roi_per_hour -
  left.expected_roi_per_hour ||
  right.relation_quality -
  left.relation_quality ||
  right.expected_skill_gain -
  left.expected_skill_gain ||
  left.estimated_learning_minutes -
  right.estimated_learning_minutes ||
  getPackageKey(left).localeCompare(
    getPackageKey(right)
  );

const emptyCandidate = (input: {
  skill: SkillRoiUserSkillInputV3;
  partAbility: number;
  groupPriority: number;
  rejectionReason:
  SkillRoiCandidateRejectionReasonV3;
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
  target_group_priority:
    input.groupPriority,

  projected_skill_ability_before:
    input.selectedPackage
      ?.projected_skill_ability_before ??
    input.skill.ability,

  projected_skill_ability_after:
    input.selectedPackage
      ?.projected_skill_ability_after ??
    input.skill.ability,

  projected_part_ability_before:
    input.partAbility,

  projected_part_ability_after:
    input.partAbility,

  projected_score_gain: 0,

  selected_units:
    input.selectedPackage?.units ?? [],

  estimated_learning_minutes:
    input.selectedPackage
      ?.estimated_learning_minutes ?? 0,

  expected_skill_gain:
    input.selectedPackage
      ?.expected_skill_gain ?? 0,

  expected_roi_per_hour: 0,

  available_unit_count:
    input.availableUnitCount ?? 0,

  rejection_reason:
    input.rejectionReason,
});

/**
 * Lọc LessonManager có thể phục vụ skill đang xét.
 *
 * Graph edge không được kiểm tra ở bước này.
 */
const isMatchingNodeForSkill = (input: {
  node: SkillRoiLessonManagerInputV3;
  skill: SkillRoiUserSkillInputV3;
  partAbility: number;
  policy: SkillRoiPolicyV3;
  completedIds: Set<string>;
}): boolean => {
  if (
    input.node.part_type !==
    input.skill.part_type
  ) {
    return false;
  }

  if (
    input.completedIds.has(input.node.id)
  ) {
    return false;
  }

  if (
    input.policy.allowed_unit_types &&
    !input.policy.allowed_unit_types.includes(input.node.unit_type)
  ) {
    return false;
  }

  if (
    input.node.planned_completion_time <= 0
  ) {
    return false;
  }

  /**
   * Một LessonManager dài hơn toàn bộ cycle budget
   * không thể tham gia bất kỳ package nào.
   */
  if (
    input.node.planned_completion_time >
    input.policy.max_learning_minutes
  ) {
    return false;
  }

  if (
    Math.abs(
      input.node.weight -
      input.partAbility
    ) >
    input.policy.max_ability_distance
  ) {
    return false;
  }

  return true;
};

/**
 * Tính ROI cho tất cả tổ hợp rồi chọn package tốt nhất của một skill.
 *
 * Hàm này không duyệt graph.
 * next/prerequisite/auxiliary chỉ được đọc để:
 * - tính relation quality;
 * - sắp xếp thứ tự các unit trong package.
 */
export const selectBestPackageFromCombinations = (
  input: {
    combinations: SkillPackageCombinationV3[];
    skill: SkillRoiUserSkillInputV3;
    partAbility: number;
    groupPriority: number;
    policy: SkillRoiPolicyV3;
  }
): FindBestSkillPackageResultV3 => {
  const unitResultByNodeId = new Map<
    string,
    SkillRoiUnitResultV3
  >();

  const allNodeIds = new Set<string>();

  /**
   * Một LessonManager có thể xuất hiện trong nhiều tổ hợp.
   *
   * Các thông tin tĩnh của node như difficulty fit,
   * focus skill share và planned time chỉ cần chuẩn bị một lần.
   *
   * Gain và ROI thực tế của unit sẽ được tính lại
   * theo vị trí của unit trong từng package.
   */
  for (const combination of input.combinations) {
    for (const node of combination.nodes) {
      allNodeIds.add(node.id);

      if (
        unitResultByNodeId.has(node.id)
      ) {
        continue;
      }

      unitResultByNodeId.set(
        node.id,
        toUnitResult({
          skillAbility: input.skill.ability,
          partAbility: input.partAbility,
          groupPriority:
            input.groupPriority,
          node,
        })
      );
    }
  }

  let bestValidPackage: SkillPackageV3 | undefined;
  let bestPartialPackage: SkillPackageV3 | undefined;

  for (
    const combination of input.combinations
  ) {
    const candidatePackage =
      buildSkillPackage({
        nodes: combination.nodes,
        unitResultByNodeId,
        currentSkillAbility:
          input.skill.ability,
        groupPriority:
          input.groupPriority,
      });

    const hasUnitBelowMinimumRoi =
      candidatePackage.units.some(
        (unit) =>
          unit.roi_per_hour <
          input.policy.minimum_unit_roi_per_hour
      );

    if (hasUnitBelowMinimumRoi) {
      continue;
    }

    if (
      candidatePackage.units.length >=
      input.policy
        .min_lesson_manager_count &&
      candidatePackage.units.length <=
      input.policy
        .max_lesson_manager_count
    ) {
      if (
        !bestValidPackage ||
        compareValidPackages(candidatePackage, bestValidPackage) < 0
      ) {
        bestValidPackage = candidatePackage;
      }
      continue;
    }

    if (
      !bestPartialPackage ||
      comparePartialPackages(candidatePackage, bestPartialPackage) < 0
    ) {
      bestPartialPackage = candidatePackage;
    }
  }

  return {
    bestValidPackage,
    bestPartialPackage,

    reachableUnitCount: allNodeIds.size,
  };
};

/**
 * Điều phối hai bước độc lập cho một skill:
 *
 * 1. Sinh các tổ hợp LessonManager phù hợp.
 * 2. Tính ROI và chọn package tốt nhất.
 */
export const findBestPackageForSkill = (
  input: {
    skill: SkillRoiUserSkillInputV3;
    partAbility: number;
    groupPriority: number;
    matchingNodes: SkillRoiLessonManagerInputV3[];
    policy: SkillRoiPolicyV3;
  }
): FindBestSkillPackageResultV3 => {
  const combinations =
    buildSkillPackageCombinations({
      nodes: input.matchingNodes,
      maxLessonManagerCount:
        input.policy
          .max_lesson_manager_count,
      maxLearningMinutes:
        input.policy.max_learning_minutes,
    });

  return selectBestPackageFromCombinations({
    combinations,
    skill: input.skill,
    partAbility: input.partAbility,
    groupPriority: input.groupPriority,
    policy: input.policy,
  });
};

/**
 * Pure Skill ROI engine.
 *
 * Engine không gọi Mongoose và không ghi database.
 *
 * Flow:
 * 1. Đánh giá từng skill.
 * 2. Tìm LessonManager phù hợp với skill.
 * 3. Sinh tổ hợp 2–4 LessonManager.
 * 4. Tính package gain và ROI.
 * 5. Giữ package tốt nhất của từng skill.
 * 6. So sánh ROI giữa các skill.
 * 7. Trả skill và package chiến thắng.
 */
export const selectBestSkillRoiOpportunity = (
  input: SelectBestSkillRoiInputV3
): SkillRoiDecisionV3 => {
  const policy = input.policy;

  const targetDistribution =
    getTargetSkillGroupDistribution(
      input.target_score
    );

  const completedIds = new Set(
    input.completed_lesson_manager_ids
  );

  const lessonManagersBySkill =
    getLessonManagersBySkill(
      input.lesson_managers
    );

  const partAbilityByPart = new Map(
    input.part_abilities.map((part) => [
      part.part_type,
      part.ability,
    ])
  );

  const candidates: SkillRoiCandidateV3[] =
    [];

  for (const skill of input.skill_abilities) {
    const taxonomy =
      TOEIC_SKILL_DEFINITIONS.find(
        (item) =>
          item.key === skill.skill_key
      );

    const partAbility =
      partAbilityByPart.get(
        skill.part_type
      );

    const groupPriority =
      targetDistribution[
      skill.skill_group
      ];

    /**
     * Taxonomy là nguồn chuẩn cho:
     * - skill key;
     * - TOEIC Part;
     * - skill group.
     */
    if (
      !taxonomy ||
      taxonomy.part_type !==
      skill.part_type ||
      taxonomy.skill_group !==
      skill.skill_group ||
      !isAbility(skill.ability)
    ) {
      candidates.push(
        emptyCandidate({
          skill,
          partAbility:
            partAbility ?? 0,
          groupPriority,
          rejectionReason:
            "skill_not_in_taxonomy",
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
          rejectionReason:
            "missing_part_ability",
        })
      );

      continue;
    }

    if (skill.ability >= 0.999999) {
      candidates.push(
        emptyCandidate({
          skill,
          partAbility,
          groupPriority,
          rejectionReason: "skill_saturated",
        })
      );
      continue;
    }

    /**
     * Mọi LessonManager phù hợp đều có thể trở thành candidate.
     *
     * Không kiểm tra:
     * - prerequisite đã hoàn thành hay chưa;
     * - có next edge hay không;
     * - có auxiliary edge hay không.
     */
    const matchingNodes =
      (
        lessonManagersBySkill.get(
          skill.skill_key
        ) ?? []
      ).filter((node) =>
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
          rejectionReason:
            "no_matching_lesson_manager",
        })
      );

      continue;
    }

    const packageResult =
      findBestPackageForSkill({
        skill,
        partAbility,
        groupPriority,
        matchingNodes,
        policy,
      });

    if (
      !packageResult.bestValidPackage
    ) {
      candidates.push(
        emptyCandidate({
          skill,
          partAbility,
          groupPriority,
          availableUnitCount:
            matchingNodes.length,
          selectedPackage:
            packageResult
              .bestPartialPackage,
          rejectionReason:
            "insufficient_learning_package",
        })
      );

      continue;
    }

    const bestPackage = packageResult.bestValidPackage;
    const scoreProjection = projectSkillGainToToeicScore({
      partType: skill.part_type,
      currentPartAbility: partAbility,
      projectedSkillGain: bestPackage.expected_skill_gain,
    });

    candidates.push({
      skill_key: skill.skill_key,
      part_type: skill.part_type,
      skill_group: skill.skill_group,
      current_ability: skill.ability,
      part_ability: partAbility,
      trend: skill.trend,
      history_count:
        skill.history_count,
      target_group_priority:
        groupPriority,

      selected_units:
        packageResult
          .bestValidPackage.units,

      estimated_learning_minutes:
        packageResult
          .bestValidPackage
          .estimated_learning_minutes,

      expected_skill_gain:
        packageResult
          .bestValidPackage
          .expected_skill_gain,

      expected_roi_per_hour:
        packageResult
          .bestValidPackage
          .expected_roi_per_hour,

      available_unit_count:
        matchingNodes.length,

      projected_skill_ability_before:
        packageResult
          .bestValidPackage
          .projected_skill_ability_before,

      projected_skill_ability_after:
        bestPackage
          .projected_skill_ability_after,

      projected_part_ability_before:
        scoreProjection.projected_part_ability_before,

      projected_part_ability_after:
        scoreProjection.projected_part_ability_after,

      projected_score_gain:
        scoreProjection.projected_score_gain,
    });
  }

  /**
   * Mỗi skill đã có package tốt nhất trước khi đến đây.
   *
   * Bước này chỉ so sánh các skill;
   * không tạo lại package và không chạy graph traversal.
   */
  const eligible = candidates
    .filter(
      (candidate) =>
        !candidate.rejection_reason
    )
    .sort(
      (left, right) =>
        right.expected_roi_per_hour -
        left.expected_roi_per_hour ||
        right.expected_skill_gain -
        left.expected_skill_gain ||
        left.estimated_learning_minutes -
        right.estimated_learning_minutes ||
        left.current_ability -
        right.current_ability ||
        left.skill_key.localeCompare(
          right.skill_key
        )
    );

  if (eligible.length === 0) {
    return {
      status: "no_eligible_skill",
      evaluated_skill_count:
        input.skill_abilities.length,
      eligible_skill_count: 0,
      candidates,
      reason:
        "Không có skill nào tạo được package LessonManager hợp lệ.",
    };
  }

  const winner = eligible[0];

  /**
   * Covered skills là các skill khác cùng xuất hiện
   * trong các LessonManager của package chiến thắng.
   */
  const coveredSkillKeys = Array.from(
    new Set(
      winner.selected_units.flatMap(
        (unit) =>
          unit.normalized_skill_keys
      )
    )
  )
    .filter(
      (key) =>
        key !== winner.skill_key
    )
    .filter((key) =>
      TOEIC_SKILL_DEFINITIONS.some(
        (item) =>
          item.key === key &&
          item.part_type ===
          winner.part_type
      )
    )
    .sort();

  return {
    status: "selected",
    evaluated_skill_count:
      input.skill_abilities.length,
    eligible_skill_count:
      eligible.length,

    primary_focus_skill_key:
      winner.skill_key,

    focus_part_type:
      winner.part_type,

    covered_skill_keys:
      coveredSkillKeys,

    selected_units:
      winner.selected_units,

    estimated_learning_minutes:
      winner.estimated_learning_minutes,

    expected_skill_gain:
      winner.expected_skill_gain,

    expected_roi_per_hour:
      winner.expected_roi_per_hour,

    candidates,

    projected_skill_ability_before:
      winner.projected_skill_ability_before,

    projected_skill_ability_after:
      winner.projected_skill_ability_after,

    projected_part_ability_before:
      winner.projected_part_ability_before,

    projected_part_ability_after:
      winner.projected_part_ability_after,

    projected_score_gain:
      winner.projected_score_gain,
  };
};

/**
 * Builds one package greedily for long-running roadmap forecasts. Unlike the
 * exact selector, it never materializes every 1..N LessonManager combination.
 */
const findBestForecastPackageForSkill = (input: {
  skill: SkillRoiUserSkillInputV3;
  partAbility: number;
  groupPriority: number;
  matchingNodes: SkillRoiLessonManagerInputV3[];
  policy: SkillRoiPolicyV3;
}): FindBestSkillPackageResultV3 => {
  let projectedAbility = input.skill.ability;
  let selectedMinutes = 0;
  const remainingNodes = [...input.matchingNodes];
  const selectedNodes: SkillRoiLessonManagerInputV3[] = [];
  let bestValidPackage: SkillPackageV3 | undefined;
  let bestPartialPackage: SkillPackageV3 | undefined;

  while (
    selectedNodes.length < input.policy.max_lesson_manager_count &&
    remainingNodes.length > 0
  ) {
    const choices = remainingNodes
      .map((node, index) => ({
        index,
        unit: toUnitResult({
          skillAbility: projectedAbility,
          partAbility: input.partAbility,
          groupPriority: input.groupPriority,
          node,
        }),
      }))
      .filter(({ unit }) =>
        selectedMinutes + unit.planned_minutes <= input.policy.max_learning_minutes &&
        unit.roi_per_hour >= input.policy.minimum_unit_roi_per_hour
      )
      .sort((left, right) =>
        right.unit.roi_per_hour - left.unit.roi_per_hour ||
        right.unit.expected_skill_gain - left.unit.expected_skill_gain ||
        left.unit.planned_minutes - right.unit.planned_minutes ||
        left.unit.lesson_manager_id.localeCompare(right.unit.lesson_manager_id)
      );

    const best = choices[0];
    if (!best) break;

    const [node] = remainingNodes.splice(best.index, 1);
    selectedNodes.push(node);
    selectedMinutes += best.unit.planned_minutes;

    const unitResultByNodeId = new Map(
      selectedNodes.map((selectedNode) => [
        selectedNode.id,
        toUnitResult({
          skillAbility: input.skill.ability,
          partAbility: input.partAbility,
          groupPriority: input.groupPriority,
          node: selectedNode,
        }),
      ])
    );
    const candidatePackage = buildSkillPackage({
      nodes: selectedNodes,
      unitResultByNodeId,
      currentSkillAbility: input.skill.ability,
      groupPriority: input.groupPriority,
    });

    projectedAbility = candidatePackage.projected_skill_ability_after;

    if (selectedNodes.length >= input.policy.min_lesson_manager_count) {
      if (
        !bestValidPackage ||
        compareValidPackages(candidatePackage, bestValidPackage) < 0
      ) {
        bestValidPackage = candidatePackage;
      }
    } else {
      bestPartialPackage = candidatePackage;
    }
  }

  return {
    bestValidPackage,
    bestPartialPackage,
    reachableUnitCount: input.matchingNodes.length,
  };
};

/** Fast greedy selector used only by simulated forecast cycles after cycle 1. */
export const selectBestSkillRoiOpportunityForForecast = (
  input: SelectBestSkillRoiInputV3
): SkillRoiDecisionV3 => {
  const policy = input.policy;
  const targetDistribution = getTargetSkillGroupDistribution(input.target_score);
  const completedIds = new Set(input.completed_lesson_manager_ids);
  const lessonManagersBySkill =
    getLessonManagersBySkill(
      input.lesson_managers
    );
  const partAbilityByPart = new Map(input.part_abilities.map((part) => [part.part_type, part.ability]));
  const candidates: SkillRoiCandidateV3[] = [];

  for (const skill of input.skill_abilities) {
    const taxonomy = TOEIC_SKILL_DEFINITIONS.find((item) => item.key === skill.skill_key);
    const partAbility = partAbilityByPart.get(skill.part_type);
    const groupPriority = targetDistribution[skill.skill_group];

    if (!taxonomy || taxonomy.part_type !== skill.part_type || taxonomy.skill_group !== skill.skill_group || !isAbility(skill.ability)) {
      candidates.push(emptyCandidate({ skill, partAbility: partAbility ?? 0, groupPriority, rejectionReason: "skill_not_in_taxonomy" }));
      continue;
    }
    if (!isAbility(partAbility)) {
      candidates.push(emptyCandidate({ skill, partAbility: 0, groupPriority, rejectionReason: "missing_part_ability" }));
      continue;
    }
    if (skill.ability >= 0.999999) {
      candidates.push(emptyCandidate({ skill, partAbility, groupPriority, rejectionReason: "skill_saturated" }));
      continue;
    }

    const matchingNodes =
      (
        lessonManagersBySkill.get(
          skill.skill_key
        ) ?? []
      ).filter((node) =>
        isMatchingNodeForSkill({
          node,
          skill,
          partAbility,
          policy,
          completedIds,
        })
      );
    if (matchingNodes.length === 0) {
      candidates.push(emptyCandidate({ skill, partAbility, groupPriority, rejectionReason: "no_matching_lesson_manager" }));
      continue;
    }

    const packageResult = findBestForecastPackageForSkill({ skill, partAbility, groupPriority, matchingNodes, policy });
    const bestPackage = packageResult.bestValidPackage;
    if (!bestPackage) {
      candidates.push(emptyCandidate({
        skill, partAbility, groupPriority, availableUnitCount: matchingNodes.length,
        selectedPackage: packageResult.bestPartialPackage,
        rejectionReason: "insufficient_learning_package",
      }));
      continue;
    }

    const scoreProjection = projectSkillGainToToeicScore({
      partType: skill.part_type,
      currentPartAbility: partAbility,
      projectedSkillGain: bestPackage.expected_skill_gain,
    });
    candidates.push({
      skill_key: skill.skill_key, part_type: skill.part_type, skill_group: skill.skill_group,
      current_ability: skill.ability, part_ability: partAbility, trend: skill.trend,
      history_count: skill.history_count, target_group_priority: groupPriority,
      selected_units: bestPackage.units, estimated_learning_minutes: bestPackage.estimated_learning_minutes,
      expected_skill_gain: bestPackage.expected_skill_gain, expected_roi_per_hour: bestPackage.expected_roi_per_hour,
      available_unit_count: matchingNodes.length,
      projected_skill_ability_before: bestPackage.projected_skill_ability_before,
      projected_skill_ability_after: bestPackage.projected_skill_ability_after,
      projected_part_ability_before: scoreProjection.projected_part_ability_before,
      projected_part_ability_after: scoreProjection.projected_part_ability_after,
      projected_score_gain: scoreProjection.projected_score_gain,
    });
  }

  const eligible = candidates.filter((candidate) => !candidate.rejection_reason).sort((left, right) =>
    right.expected_roi_per_hour - left.expected_roi_per_hour ||
    right.expected_skill_gain - left.expected_skill_gain ||
    left.estimated_learning_minutes - right.estimated_learning_minutes ||
    left.current_ability - right.current_ability ||
    left.skill_key.localeCompare(right.skill_key)
  );
  if (eligible.length === 0) {
    return { status: "no_eligible_skill", evaluated_skill_count: input.skill_abilities.length, eligible_skill_count: 0, candidates, reason: "Không có skill nào tạo được package LessonManager hợp lệ." };
  }

  const winner = eligible[0];
  const coveredSkillKeys = Array.from(new Set(winner.selected_units.flatMap((unit) => unit.normalized_skill_keys)))
    .filter((key) => key !== winner.skill_key)
    .filter((key) => TOEIC_SKILL_DEFINITIONS.some((item) => item.key === key && item.part_type === winner.part_type))
    .sort();
  return {
    status: "selected", evaluated_skill_count: input.skill_abilities.length, eligible_skill_count: eligible.length,
    primary_focus_skill_key: winner.skill_key, focus_part_type: winner.part_type, covered_skill_keys: coveredSkillKeys,
    selected_units: winner.selected_units, estimated_learning_minutes: winner.estimated_learning_minutes,
    expected_skill_gain: winner.expected_skill_gain, expected_roi_per_hour: winner.expected_roi_per_hour, candidates,
    projected_skill_ability_before: winner.projected_skill_ability_before,
    projected_skill_ability_after: winner.projected_skill_ability_after,
    projected_part_ability_before: winner.projected_part_ability_before,
    projected_part_ability_after: winner.projected_part_ability_after,
    projected_score_gain: winner.projected_score_gain,
  };
};

/**
 * Resolver chỉ đọc state hiện tại và tạo input
 * cho pure Skill ROI engine.
 */
export const buildSkillRoiPlanningContext =
  async (input: {
    user_id: string;
    learning_path_id: string;
    policy?: SkillRoiPolicyV3;
  }): Promise<SelectBestSkillRoiInputV3> => {
    const learningPath =
      await LearningPath.findOne({
        _id: input.learning_path_id,
        user_id: input.user_id,
        isActive: true,
      }).lean();

    if (!learningPath) {
      throw new Error(
        "Không tìm thấy LearningPath đang hoạt động."
      );
    }

    const userSkill =
      await UserSkill.findOne({
        user_id: input.user_id,
        context_type: "learning_path",
        learning_path_id:
          input.learning_path_id,
      }).lean();

    if (!userSkill) {
      throw new Error(
        "Không tìm thấy UserSkill của LearningPath."
      );
    }

    const nodes =
      (await LessonManager.find({
        status: {
          $in: ["approved", "open"],
        },
      }).lean()) as unknown as ILessonManager[];

    const dayStudies =
      (await DayStudy.find({
        week_id: {
          $in:
            learningPath.week_study_ids ??
            [],
        },
      }).lean()) as unknown as IDayStudy[];

    const completed =
      new Set<string>();

    /**
     * Checkpoint 3 đã thống nhất:
     *
     * 1 LessonManager
     * = 1 DayStudy
     * = 1 Session.
     *
     * LessonManager chỉ được xem là hoàn thành
     * khi DayStudy tương ứng đã hoàn thành.
     */
    for (const day of dayStudies) {
      if (
        day.status !==
        WeekStudyStatus.COMPLETED
      ) {
        continue;
      }

      for (
        const session of day.sessions ?? []
      ) {
        if (session.lesson_manager_id) {
          completed.add(
            String(
              session.lesson_manager_id
            )
          );
        }
      }
    }

    return {
      target_score:
        learningPath.target_score ?? 0,

      part_abilities:
        (userSkill.parts ?? []).map(
          (part) => ({
            part_type: part.part_type,
            ability: part.ability,
            status: part.status,
            trend: part.trend,
          })
        ),

      skill_abilities:
        (userSkill.parts ?? []).flatMap(
          (part) =>
            (part.skills ?? []).flatMap(
              (skill) => {
                const taxonomy =
                  TOEIC_SKILL_DEFINITIONS.find(
                    (item) =>
                      item.key ===
                      skill.skill_key
                  );

                const skillGroup =
                  skill.skill_group ??
                  taxonomy?.skill_group;

                /**
                 * Không tự mặc định về core.
                 * Nếu taxonomy không xác định được group,
                 * skill không được đưa vào ROI input.
                 */
                if (!skillGroup) {
                  return [];
                }

                return [
                  {
                    skill_key:
                      skill.skill_key,
                    part_type:
                      part.part_type,
                    skill_group:
                      skillGroup,
                    ability:
                      skill.ability,
                    status:
                      skill.status,
                    trend: skill.trend,
                    history_count:
                      skill.history_count ??
                      0,
                  },
                ];
              }
            )
        ),

      lesson_managers: nodes.map(
        (node) => ({
          id: String(node._id),
          title: node.title,
          part_type: node.part_type,
          score_band: node.score_band,
          unit_type: node.unit_type,
          node_role: node.node_role,
          target_tags:
            node.target_tags ?? [],
          weight: node.weight,
          planned_completion_time:
            node.planned_completion_time,
          next_unit_ids:
            (node.next_unit_ids ?? []).map(
              String
            ),
          prerequisite_unit_ids:
            (
              node.prerequisite_unit_ids ??
              []
            ).map(String),
          auxiliary_unit_ids:
            (
              node.auxiliary_unit_ids ?? []
            ).map(String),
        })
      ),

      completed_lesson_manager_ids:
        Array.from(completed),

      policy:
        input.policy ??
        DEFAULT_SKILL_ROI_POLICY_V3,
    };
  };
