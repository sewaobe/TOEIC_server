import {
  selectBestSkillRoiOpportunityForForecast,
} from "./skill_roi_optimizer.service";
import type {
  SimulateSkillRoiRoadmapInputV3,
  SelectedSkillRoiDecisionV3,
  SimulatedSkillRoiCycleV3,
  SimulatedSkillRoiRoadmapV3,
} from "../../types/learning_path_v2";

const MINI_TEST_ESTIMATED_MINUTES = 60;
const FULL_TEST_ESTIMATED_MINUTES = 120;
const FULL_TEST_AFTER_MINI_TEST_COUNT = 3;

const roundToSix = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

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
  const availableHours = availableTotalMinutes / 60;
  const remainingScoreGap = Math.max(0, input.target_score - input.anchor_score);
  const requiredScoreGainPerHour =
    remainingScoreGap === 0
      ? 0
      : availableHours > 0
        ? remainingScoreGap / availableHours
        : null;

  let plannedScore = input.anchor_score;
  let remainingMinutes = availableTotalMinutes;
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

    if (decision.status !== "selected") {
      stopReason = "no_eligible_skill";
      break;
    }

    if (decision.expected_skill_gain <= 0) {
      stopReason = "no_positive_gain";
      break;
    }

    const totalCycleMinutes =
      decision.estimated_learning_minutes + assessmentEstimatedMinutes;

    if (!firstDecision) {
      firstDecision = decision;
    }

    const plannedScoreBefore = roundToSix(plannedScore);

    applyDecisionToSimulatedState({
      decision,
      simulatedPartAbilities,
      simulatedSkillAbilities,
    });
    for (const unit of decision.selected_units) {
      simulatedCompletedIds.add(unit.lesson_manager_id);
    }

    remainingMinutes -= totalCycleMinutes;

    const usedMinutes = availableTotalMinutes - remainingMinutes;
    const plannedScoreAfter =
      requiredScoreGainPerHour === null
        ? input.anchor_score
        : roundToSix(
          Math.min(
            input.target_score,
            input.anchor_score +
              requiredScoreGainPerHour * (usedMinutes / 60)
          )
        );
    const plannedScoreGain = roundToSix(
      plannedScoreAfter - plannedScoreBefore
    );

    plannedScore = plannedScoreAfter;

    cycles.push({
      cycle_no: cycles.length + 1,
      primary_focus_skill_key: decision.primary_focus_skill_key,
      focus_part_type: decision.focus_part_type,
      covered_skill_keys: decision.covered_skill_keys,
      selected_units: decision.selected_units.map((unit) => ({ ...unit })),
      projected_skill_ability_before:
        decision.projected_skill_ability_before,
      projected_skill_ability_after:
        decision.projected_skill_ability_after,
      projected_part_ability_before:
        decision.projected_part_ability_before,
      projected_part_ability_after:
        decision.projected_part_ability_after,
      planned_score_before: plannedScoreBefore,
      planned_score_after: plannedScoreAfter,
      planned_score_gain: plannedScoreGain,
      ability_based_score_gain_proxy: decision.projected_score_gain,
      expected_skill_gain: decision.expected_skill_gain,
      expected_roi_per_hour: decision.expected_roi_per_hour,
      estimated_learning_minutes: decision.estimated_learning_minutes,
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
