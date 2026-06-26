import {
  selectBestSkillRoiOpportunityForForecast,
} from "./skill_roi_optimizer.service";
import type {
  SimulateSkillRoiRoadmapInputV3,
  SelectedSkillRoiDecisionV3,
  SimulatedSkillRoiCycleV3,
  SimulatedSkillRoiRoadmapV3,
  SkillRoiLessonManagerInputV3,
  SkillRoiPartAbilityInputV3,
  SkillRoiUnitResultV3,
  SkillRoiUserSkillInputV3,
} from "../../types/learning_path_v2";
import {
  normalizeToeicSkillTags,
  TOEIC_SKILL_DEFINITIONS,
} from "../../utils/toeic_skill.util";

const MINI_TEST_ESTIMATED_MINUTES = 60;
const FULL_TEST_ESTIMATED_MINUTES = 120;
const FULL_TEST_AFTER_MINI_TEST_COUNT = 3;

const roundToSix = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

type ExamPracticeSimulationDecision = {
  focus_part_type: number;
  primary_focus_skill_key: string;
  covered_skill_keys: string[];
  selected_units: SkillRoiUnitResultV3[];
  estimated_learning_minutes: number;
  expected_roi_per_hour: number;
  projected_skill_ability_before: number;
  projected_part_ability_before: number;
};

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, value));

const normalizeScoreBand = (
  scoreBand: SkillRoiLessonManagerInputV3["score_band"]
): { from: number; to: number } | null => {
  if (
    !scoreBand ||
    !Number.isFinite(scoreBand.from) ||
    !Number.isFinite(scoreBand.to)
  ) {
    return null;
  }

  return {
    from: Number(scoreBand.from),
    to: Number(scoreBand.to),
  };
};

const calculateScoreBandFit = (
  node: SkillRoiLessonManagerInputV3,
  targetScore: number
): number => {
  const scoreBand = normalizeScoreBand(node.score_band);
  if (!scoreBand) {
    return 0.5;
  }

  if (targetScore >= scoreBand.from && targetScore <= scoreBand.to) {
    return 1;
  }

  const distance =
    targetScore < scoreBand.from
      ? scoreBand.from - targetScore
      : targetScore - scoreBand.to;

  return clamp01(1 - distance / 300);
};

const findWeakestSkillInPart = (
  skills: SkillRoiUserSkillInputV3[],
  partType: number
): SkillRoiUserSkillInputV3 | undefined =>
  skills
    .filter((skill) => skill.part_type === partType)
    .sort((left, right) => left.ability - right.ability)[0];

const getFallbackSkillKeyForPart = (partType: number): string =>
  TOEIC_SKILL_DEFINITIONS.find((skill) => skill.part_type === partType)?.key ??
  `part_${partType}_exam_practice`;

const buildExamPracticeUnitResult = (input: {
  node: SkillRoiLessonManagerInputV3;
  partAbility: number;
  rankScore: number;
}): SkillRoiUnitResultV3 => {
  const normalizedSkillKeys = normalizeToeicSkillTags(
    input.node.target_tags,
    input.node.part_type
  ).map((skill) => skill.key);

  const difficultyFit = clamp01(1 - Math.abs(input.node.weight - input.partAbility));

  return {
    lesson_manager_id: input.node.id,
    title: input.node.title,
    part_type: input.node.part_type,
    unit_type: input.node.unit_type,
    normalized_skill_keys: normalizedSkillKeys,
    planned_minutes: input.node.planned_completion_time,
    difficulty_fit: roundToSix(difficultyFit),
    focus_skill_share: normalizedSkillKeys.length > 0 ? 1 : 0,
    expected_skill_gain: 0,
    roi_per_hour: roundToSix(input.rankScore),
    reason:
      "Main-learning đã hết bài phù hợp; chuyển sang exam practice trong simulation để duy trì thời lượng luyện tập theo kế hoạch.",
  };
};

const selectExamPracticeOpportunityForForecast = (input: {
  planningContext: SimulateSkillRoiRoadmapInputV3["planning_context"];
  targetScore: number;
  remainingLearningMinutes: number;
  simulatedPartAbilities: SkillRoiPartAbilityInputV3[];
  simulatedSkillAbilities: SkillRoiUserSkillInputV3[];
  simulatedCompletedIds: Set<string>;
}): ExamPracticeSimulationDecision | null => {
  const maxLearningMinutes = Math.min(
    input.planningContext.policy.max_learning_minutes,
    input.remainingLearningMinutes
  );
  const maxLessonManagerCount =
    input.planningContext.policy.max_lesson_manager_count;

  const ranked = input.planningContext.lesson_managers
    .filter(
      (node) =>
        node.unit_type === "exam_practice" &&
        !input.simulatedCompletedIds.has(node.id) &&
        Number.isFinite(node.planned_completion_time) &&
        node.planned_completion_time > 0 &&
        node.planned_completion_time <= maxLearningMinutes
    )
    .map((node) => {
      const partAbility =
        input.simulatedPartAbilities.find(
          (part) => part.part_type === node.part_type
        )?.ability ?? 0;
      const partNeed = 1 - clamp01(partAbility);
      const bandFit = calculateScoreBandFit(node, input.targetScore);
      const difficultyFit = clamp01(1 - Math.abs(node.weight - partAbility));
      const rankScore =
        partNeed * 0.45 + bandFit * 0.35 + difficultyFit * 0.2;

      return {
        node,
        partAbility,
        rankScore,
      };
    })
    .sort((left, right) => {
      if (right.rankScore !== left.rankScore) {
        return right.rankScore - left.rankScore;
      }

      return (
        left.node.planned_completion_time -
        right.node.planned_completion_time
      );
    });

  const selectedUnits: SkillRoiUnitResultV3[] = [];
  let selectedMinutes = 0;

  for (const candidate of ranked) {
    if (selectedUnits.length >= maxLessonManagerCount) {
      break;
    }

    if (
      selectedMinutes + candidate.node.planned_completion_time >
      maxLearningMinutes
    ) {
      continue;
    }

    selectedUnits.push(
      buildExamPracticeUnitResult({
        node: candidate.node,
        partAbility: candidate.partAbility,
        rankScore: candidate.rankScore,
      })
    );
    selectedMinutes += candidate.node.planned_completion_time;
  }

  if (selectedUnits.length === 0) {
    return null;
  }

  const focusPartType = selectedUnits[0].part_type;
  const focusPartAbility =
    input.simulatedPartAbilities.find((part) => part.part_type === focusPartType)
      ?.ability ?? 0;
  const weakestSkill = findWeakestSkillInPart(
    input.simulatedSkillAbilities,
    focusPartType
  );
  const primaryFocusSkillKey =
    weakestSkill?.skill_key ?? getFallbackSkillKeyForPart(focusPartType);
  const coveredSkillKeys = Array.from(
    new Set(selectedUnits.flatMap((unit) => unit.normalized_skill_keys))
  ).filter((skillKey) => skillKey !== primaryFocusSkillKey);

  return {
    focus_part_type: focusPartType,
    primary_focus_skill_key: primaryFocusSkillKey,
    covered_skill_keys: coveredSkillKeys,
    selected_units: selectedUnits,
    estimated_learning_minutes: selectedMinutes,
    expected_roi_per_hour: roundToSix(
      ranked[0]?.rankScore ? ranked[0].rankScore : 0
    ),
    projected_skill_ability_before: weakestSkill?.ability ?? 0,
    projected_part_ability_before: focusPartAbility,
  };
};

const estimateAssessmentReserveMinutes = (maxCycleCount: number): number => {
  let miniTestCount = 0;
  let reserveMinutes = 0;

  for (let index = 0; index < maxCycleCount; index += 1) {
    const assessmentType =
      miniTestCount >= FULL_TEST_AFTER_MINI_TEST_COUNT
        ? "full_test"
        : "mini_test";

    reserveMinutes +=
      assessmentType === "full_test"
        ? FULL_TEST_ESTIMATED_MINUTES
        : MINI_TEST_ESTIMATED_MINUTES;

    miniTestCount =
      assessmentType === "full_test" ? 0 : miniTestCount + 1;
  }

  return reserveMinutes;
};

const applyDecisionToSimulatedState = (input: {
  decision: SelectedSkillRoiDecisionV3;
  simulatedPartAbilities: SimulateSkillRoiRoadmapInputV3["planning_context"]["part_abilities"];
  simulatedSkillAbilities: SimulateSkillRoiRoadmapInputV3["planning_context"]["skill_abilities"];
}): void => {
  const primarySkill = input.simulatedSkillAbilities.find(
    (skill) => skill.skill_key === input.decision.primary_focus_skill_key
  );
  if (!primarySkill) {
    throw new Error(
      `Không tìm thấy simulated skill ${input.decision.primary_focus_skill_key}.`
    );
  }

  const focusPart = input.simulatedPartAbilities.find(
    (part) => part.part_type === input.decision.focus_part_type
  );
  if (!focusPart) {
    throw new Error(
      `Không tìm thấy simulated Part ${input.decision.focus_part_type}.`
    );
  }

  primarySkill.ability = input.decision.projected_skill_ability_after;
  focusPart.ability = input.decision.projected_part_ability_after;
};

/**
 * Simulates the ideal branch where every selected package achieves its
 * projected ability gain. It has no database or persistence side effects.
 */
export const simulateIdealSkillRoiRoadmap = async (
  input: SimulateSkillRoiRoadmapInputV3
): Promise<SimulatedSkillRoiRoadmapV3> => {
  if (
    !Number.isFinite(input.anchor_score) ||
    input.anchor_score < 0 ||
    input.anchor_score > 990
  ) {
    throw new Error("anchor_score phải nằm trong khoảng 0–990.");
  }

  if (
    !Number.isFinite(input.target_score) ||
    input.target_score < 0 ||
    input.target_score > 990
  ) {
    throw new Error("target_score phải nằm trong khoảng 0–990.");
  }

  if (
    !Number.isFinite(input.available_total_minutes) ||
    input.available_total_minutes < 0
  ) {
    throw new Error("available_total_minutes không hợp lệ.");
  }

  if (!Number.isInteger(input.max_cycle_count) || input.max_cycle_count <= 0) {
    throw new Error("max_cycle_count phải là số nguyên dương.");
  }

  const simulatedPartAbilities = input.planning_context.part_abilities.map(
    (part) => ({ ...part })
  );
  const simulatedSkillAbilities = input.planning_context.skill_abilities.map(
    (skill) => ({ ...skill })
  );
  const simulatedCompletedIds = new Set(
    input.planning_context.completed_lesson_manager_ids
  );
  const cycles: SimulatedSkillRoiCycleV3[] = [];
  const availableTotalMinutes = input.available_total_minutes;
  /*
   * Score pacing chỉ tính giờ học tạo tiến bộ.
   * Mini Test / Full Test vẫn chiếm lịch, nhưng chỉ đo lường nên không cộng vào
   * requiredScoreGainPerHour hoặc plannedScoreAfter.
   */
  const assessmentReserveMinutes = Math.min(
    availableTotalMinutes,
    estimateAssessmentReserveMinutes(input.max_cycle_count)
  );
  const availableLearningMinutes = Math.max(
    0,
    availableTotalMinutes - assessmentReserveMinutes
  );
  const availableLearningHours = availableLearningMinutes / 60;
  const remainingScoreGap = Math.max(0, input.target_score - input.anchor_score);
  const requiredScoreGainPerHour =
    remainingScoreGap === 0
      ? 0
      : availableLearningHours > 0
        ? remainingScoreGap / availableLearningHours
        : null;

  let plannedScore = input.anchor_score;
  let remainingMinutes = availableTotalMinutes;
  let usedLearningMinutes = 0;
  let miniTestCount = 0;
  let firstDecision: SelectedSkillRoiDecisionV3 | null = null;
  let stopReason: SimulatedSkillRoiRoadmapV3["stop_reason"] =
    "max_cycle_count_reached";

  while (
    cycles.length < input.max_cycle_count &&
    plannedScore < input.target_score &&
    remainingMinutes > 0
  ) {
    const assessmentType =
      miniTestCount >= FULL_TEST_AFTER_MINI_TEST_COUNT
        ? "full_test"
        : "mini_test";
    const assessmentEstimatedMinutes =
      assessmentType === "full_test"
        ? FULL_TEST_ESTIMATED_MINUTES
        : MINI_TEST_ESTIMATED_MINUTES;
    const remainingLearningMinutes =
      remainingMinutes - assessmentEstimatedMinutes;

    if (remainingLearningMinutes <= 0) {
      stopReason = "time_exhausted";
      break;
    }

    const cyclePolicy = {
      ...input.planning_context.policy,
      max_learning_minutes: Math.min(
        input.planning_context.policy.max_learning_minutes,
        remainingLearningMinutes
      ),
    };
    const decisionInput = {
      ...input.planning_context,
      target_score: input.target_score,
      part_abilities: simulatedPartAbilities,
      skill_abilities: simulatedSkillAbilities,
      completed_lesson_manager_ids: Array.from(simulatedCompletedIds),
      policy: cyclePolicy,
    };
    const decision = selectBestSkillRoiOpportunityForForecast(
      decisionInput
    );

    const examPracticeDecision =
      decision.status === "selected"
        ? null
        : selectExamPracticeOpportunityForForecast({
          planningContext: decisionInput,
          targetScore: input.target_score,
          remainingLearningMinutes,
          simulatedPartAbilities,
          simulatedSkillAbilities,
          simulatedCompletedIds,
        });

    if (decision.status !== "selected" && !examPracticeDecision) {
      stopReason = "no_eligible_skill";
      break;
    }

    if (decision.status === "selected" && decision.expected_skill_gain <= 0) {
      stopReason = "no_positive_gain";
      break;
    }

    const selectedUnits =
      decision.status === "selected"
        ? decision.selected_units
        : examPracticeDecision!.selected_units;
    const estimatedLearningMinutes =
      decision.status === "selected"
        ? decision.estimated_learning_minutes
        : examPracticeDecision!.estimated_learning_minutes;
    const totalCycleMinutes =
      estimatedLearningMinutes + assessmentEstimatedMinutes;

    if (!firstDecision && decision.status === "selected") {
      firstDecision = decision;
    }

    const plannedScoreBefore = roundToSix(plannedScore);

    if (decision.status === "selected") {
      applyDecisionToSimulatedState({
        decision,
        simulatedPartAbilities,
        simulatedSkillAbilities,
      });
    }

    for (const unit of selectedUnits) {
      simulatedCompletedIds.add(unit.lesson_manager_id);
    }

    remainingMinutes -= totalCycleMinutes;
    usedLearningMinutes += estimatedLearningMinutes;

    const plannedScoreAfter =
      requiredScoreGainPerHour === null
        ? input.anchor_score
        : roundToSix(
          Math.min(
            input.target_score,
            input.anchor_score +
              requiredScoreGainPerHour * (usedLearningMinutes / 60)
          )
        );
    const plannedScoreGain = roundToSix(
      plannedScoreAfter - plannedScoreBefore
    );

    plannedScore = plannedScoreAfter;

    cycles.push({
      cycle_no: cycles.length + 1,
      primary_focus_skill_key:
        decision.status === "selected"
          ? decision.primary_focus_skill_key
          : examPracticeDecision!.primary_focus_skill_key,
      focus_part_type:
        decision.status === "selected"
          ? decision.focus_part_type
          : examPracticeDecision!.focus_part_type,
      covered_skill_keys:
        decision.status === "selected"
          ? decision.covered_skill_keys
          : examPracticeDecision!.covered_skill_keys,
      selected_units: selectedUnits.map((unit) => ({ ...unit })),
      projected_skill_ability_before:
        decision.status === "selected"
          ? decision.projected_skill_ability_before
          : examPracticeDecision!.projected_skill_ability_before,
      projected_skill_ability_after:
        decision.status === "selected"
          ? decision.projected_skill_ability_after
          : examPracticeDecision!.projected_skill_ability_before,
      projected_part_ability_before:
        decision.status === "selected"
          ? decision.projected_part_ability_before
          : examPracticeDecision!.projected_part_ability_before,
      projected_part_ability_after:
        decision.status === "selected"
          ? decision.projected_part_ability_after
          : examPracticeDecision!.projected_part_ability_before,
      planned_score_before: plannedScoreBefore,
      planned_score_after: plannedScoreAfter,
      planned_score_gain: plannedScoreGain,
      ability_based_score_gain_proxy:
        decision.status === "selected" ? decision.projected_score_gain : 0,
      expected_skill_gain:
        decision.status === "selected" ? decision.expected_skill_gain : 0,
      expected_roi_per_hour:
        decision.status === "selected"
          ? decision.expected_roi_per_hour
          : examPracticeDecision!.expected_roi_per_hour,
      estimated_learning_minutes: estimatedLearningMinutes,
      assessment_type: assessmentType,
      assessment_estimated_minutes: assessmentEstimatedMinutes,
      total_cycle_minutes: totalCycleMinutes,
      ...(assessmentType === "full_test"
        ? { planned_full_test_score: plannedScoreAfter }
        : {}),
    });

    if (cycles.length % 10 === 0) {
      input.on_progress?.({
        cycle_count: cycles.length,
        planned_score: plannedScore,
        remaining_minutes: remainingMinutes,
        completed_lesson_manager_count: simulatedCompletedIds.size,
      });
    }

    if (cycles.length % 5 === 0) {
      await yieldToEventLoop();
    }

    miniTestCount =
      assessmentType === "full_test" ? 0 : miniTestCount + 1;
  }

  if (plannedScore >= input.target_score) {
    stopReason = "target_reached";
  } else if (remainingMinutes <= 0) {
    stopReason = "time_exhausted";
  }

  const totalUsedMinutes = availableTotalMinutes - remainingMinutes;
  const totalLearningMinutes = cycles.reduce(
    (total, cycle) => total + cycle.estimated_learning_minutes,
    0
  );
  const totalAssessmentMinutes = cycles.reduce(
    (total, cycle) => total + cycle.assessment_estimated_minutes,
    0
  );

  return {
    anchor_score: input.anchor_score,
    target_score: input.target_score,
    required_score_gain_per_hour: requiredScoreGainPerHour,
    planned_final_score: plannedScore,
    reaches_target: plannedScore >= input.target_score,
    total_learning_minutes: totalLearningMinutes,
    total_assessment_minutes: totalAssessmentMinutes,
    total_used_minutes: totalUsedMinutes,
    remaining_minutes: remainingMinutes,
    cycle_count: cycles.length,
    stop_reason: stopReason,
    first_decision: firstDecision,
    cycles,
    final_part_abilities: simulatedPartAbilities,
    final_skill_abilities: simulatedSkillAbilities,
    simulated_completed_lesson_manager_ids: Array.from(simulatedCompletedIds),
  };
};
