import { simulateIdealSkillRoiRoadmap } from "../../src/services/learning_path_v2/skill_roi_roadmap_simulator.service";
import {
  DEFAULT_SKILL_ROI_POLICY_V3,
} from "../../src/services/learning_path_v2/skill_roi_optimizer.service";
import type { SimulateSkillRoiRoadmapInputV3 } from "../../src/types/learning_path_v2";

const roundToSix = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const baseInput = (): SimulateSkillRoiRoadmapInputV3 => ({
  anchor_score: 500,
  target_score: 990,
  available_total_minutes: 2_000,
  max_cycle_count: 4,
  planning_context: {
    target_score: 990,
    part_abilities: [{ part_type: 5, ability: 0.4 }],
    skill_abilities: [
      {
        skill_key: "part5_word_form_question",
        part_type: 5,
        skill_group: "basic",
        ability: 0.2,
        history_count: 1,
      },
    ],
    lesson_managers: Array.from({ length: 8 }, (_, index) => ({
      id: `unit-${index + 1}`,
      title: `Word form ${index + 1}`,
      part_type: 5,
      unit_type: "skill_drill" as const,
      node_role: "normal" as const,
      target_tags: ["Câu hỏi từ loại"],
      weight: 0.4,
      planned_completion_time: 60,
      next_unit_ids: [],
      prerequisite_unit_ids: [],
      auxiliary_unit_ids: [],
    })),
    completed_lesson_manager_ids: [],
    policy: DEFAULT_SKILL_ROI_POLICY_V3,
  },
});

describe("skill_roi_roadmap_simulator", () => {
  it("mô phỏng ideal branch, cadence ba mini rồi một full test, và không sửa input", () => {
    const input = baseInput();
    const result = simulateIdealSkillRoiRoadmap(input);

    expect(result.cycle_count).toBe(4);
    expect(result.first_decision).not.toBeNull();
    expect(result.first_decision?.primary_focus_skill_key).toBe(
      result.cycles[0].primary_focus_skill_key
    );
    expect(result.stop_reason).toBe("max_cycle_count_reached");
    expect(result.cycles.map((cycle) => cycle.assessment_type)).toEqual([
      "mini_test",
      "mini_test",
      "mini_test",
      "full_test",
    ]);
    expect(result.cycles[3].projected_full_test_score).toBe(
      result.cycles[3].projected_score_after
    );
    expect(result.projected_final_score).toBeGreaterThan(input.anchor_score);
    expect(result.final_skill_abilities[0].ability).toBeGreaterThan(
      input.planning_context.skill_abilities[0].ability
    );
    expect(result.simulated_completed_lesson_manager_ids).toHaveLength(8);
    expect(input.planning_context.completed_lesson_manager_ids).toEqual([]);
    expect(input.planning_context.skill_abilities[0].ability).toBe(0.2);
    expect(input.planning_context.part_abilities[0].ability).toBe(0.4);
    for (const cycle of result.cycles) {
      expect(cycle.projected_score_gain).toBe(
        roundToSix(
          cycle.projected_score_after - cycle.projected_score_before
        )
      );
    }
  });

  it("dừng trước khi tạo cycle nếu không đủ thời gian cho learning và assessment", () => {
    const input = baseInput();
    input.available_total_minutes = 100;

    const result = simulateIdealSkillRoiRoadmap(input);

    expect(result.stop_reason).toBe("time_exhausted");
    expect(result.cycle_count).toBe(0);
    expect(result.first_decision).toBeNull();
    expect(result.total_used_minutes).toBe(0);
    expect(result.projected_final_score).toBe(input.anchor_score);
  });

  it("luôn dùng target_score của simulator khi gọi ROI engine", () => {
    const expectedInput = baseInput();
    expectedInput.max_cycle_count = 1;

    const mismatchedContextInput = baseInput();
    mismatchedContextInput.max_cycle_count = 1;
    mismatchedContextInput.planning_context.target_score = 500;

    const expected = simulateIdealSkillRoiRoadmap(expectedInput);
    const actual = simulateIdealSkillRoiRoadmap(mismatchedContextInput);

    expect(actual.cycles[0].expected_skill_gain).toBe(
      expected.cycles[0].expected_skill_gain
    );
    expect(actual.cycles[0].projected_score_gain).toBe(
      expected.cycles[0].projected_score_gain
    );
  });

  it("lưu score gain thực tế sau khi clamp score tối đa", () => {
    const input = baseInput();
    input.anchor_score = 989;
    input.max_cycle_count = 1;

    const result = simulateIdealSkillRoiRoadmap(input);
    const cycle = result.cycles[0];

    expect(cycle.projected_score_after).toBe(990);
    expect(cycle.projected_score_gain).toBe(
      cycle.projected_score_after - cycle.projected_score_before
    );
    expect(cycle.projected_score_gain).toBe(1);
  });

  it("rejects invalid simulator bounds", () => {
    const input = baseInput();
    input.max_cycle_count = 0;

    expect(() => simulateIdealSkillRoiRoadmap(input)).toThrow(
      "max_cycle_count phải là số nguyên dương."
    );
  });

  it("uses a null required rate when score gain is needed but no time remains", () => {
    const input = baseInput();
    input.available_total_minutes = 0;

    const result = simulateIdealSkillRoiRoadmap(input);

    expect(result.required_score_gain_per_hour).toBeNull();
    expect(result.stop_reason).toBe("time_exhausted");
    expect(result.cycle_count).toBe(0);
  });
});
