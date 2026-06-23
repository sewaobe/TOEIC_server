import {
  DEFAULT_SKILL_ROI_POLICY_V3,
  selectBestSkillRoiOpportunity,
} from "../../src/services/learning_path_v2/skill_roi_optimizer.service";
import type { SelectBestSkillRoiInputV3 } from "../../src/types/learning_path_v2";

const createUnit = (
  overrides: Partial<SelectBestSkillRoiInputV3["lesson_managers"][number]> &
    Pick<SelectBestSkillRoiInputV3["lesson_managers"][number], "id" | "title">
): SelectBestSkillRoiInputV3["lesson_managers"][number] => ({
  id: overrides.id,
  title: overrides.title,
  part_type: overrides.part_type ?? 5,
  unit_type: overrides.unit_type ?? "skill_drill",
  node_role: overrides.node_role ?? "normal",
  target_tags: overrides.target_tags ?? ["Câu hỏi từ loại"],
  weight: overrides.weight ?? 0.4,
  planned_completion_time: overrides.planned_completion_time ?? 60,
  next_unit_ids: overrides.next_unit_ids ?? [],
  prerequisite_unit_ids: overrides.prerequisite_unit_ids ?? [],
  auxiliary_unit_ids: overrides.auxiliary_unit_ids ?? [],
});

const baseInput = (): SelectBestSkillRoiInputV3 => ({
  target_score: 600,
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
  lesson_managers: [
    createUnit({
      id: "unit-1",
      title: "Word form nền tảng",
      unit_type: "foundation",
      next_unit_ids: ["unit-2"],
    }),
    createUnit({
      id: "unit-2",
      title: "Word form luyện tập",
      target_tags: ["Câu hỏi từ loại", "Tính từ"],
      weight: 0.45,
      prerequisite_unit_ids: ["unit-1"],
    }),
  ],
  completed_lesson_manager_ids: [],
  policy: DEFAULT_SKILL_ROI_POLICY_V3,
});

describe("skill_roi_optimizer", () => {
  it("chọn primary skill và package đi theo next_unit_ids", () => {
    const result = selectBestSkillRoiOpportunity(baseInput());

    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;

    expect(result.primary_focus_skill_key).toBe(
      "part5_word_form_question"
    );
    expect(result.selected_units.map((unit) => unit.lesson_manager_id)).toEqual([
      "unit-1",
      "unit-2",
    ]);
    expect(result.covered_skill_keys).toEqual(["part5_adjective"]);
    expect(result.projected_part_ability_before).toBe(0.4);
    expect(result.projected_part_ability_after).toBe(0.420865);
    expect(result.projected_score_gain).toBe(3.067155);

    expect(result.candidates[0]).toMatchObject({
      projected_part_ability_before: 0.4,
      projected_part_ability_after: 0.420865,
      projected_score_gain: 3.067155,
    });
  });

  it("giữ package một unit và gain để debug nhưng không cho cạnh tranh", () => {
    const input = baseInput();
    input.lesson_managers = input.lesson_managers.slice(0, 1);

    const result = selectBestSkillRoiOpportunity(input);

    expect(result.status).toBe("no_eligible_skill");
    expect(result.candidates[0].rejection_reason).toBe(
      "insufficient_learning_package"
    );
    expect(
      result.candidates[0].selected_units.map(
        (unit) => unit.lesson_manager_id
      )
    ).toEqual(["unit-1"]);
    expect(result.candidates[0].expected_skill_gain).toBeGreaterThan(0);
    expect(result.candidates[0].expected_roi_per_hour).toBe(0);
    expect(result.candidates[0].projected_part_ability_before).toBe(0.4);
    expect(result.candidates[0].projected_part_ability_after).toBe(0.4);
    expect(result.candidates[0].projected_score_gain).toBe(0);
  });

  it("không loại skill ability cao nếu package vẫn hợp lệ", () => {
    const input = baseInput();
    input.skill_abilities[0].ability = 0.95;

    const result = selectBestSkillRoiOpportunity(input);

    expect(result.status).toBe("selected");
  });

  it("không chọn start node ROI cao nhưng bị cụt nếu có path khác tạo được package", () => {
    const input = baseInput();
    input.lesson_managers = [
      createUnit({
        id: "dead-end",
        title: "Bài ngắn ROI cao nhưng cụt",
        planned_completion_time: 20,
      }),
      createUnit({
        id: "path-1",
        title: "Đường học hợp lệ 1",
        planned_completion_time: 60,
        next_unit_ids: ["path-2"],
      }),
      createUnit({
        id: "path-2",
        title: "Đường học hợp lệ 2",
        planned_completion_time: 60,
        prerequisite_unit_ids: ["path-1"],
      }),
    ];

    const result = selectBestSkillRoiOpportunity(input);

    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;

    expect(result.selected_units.map((unit) => unit.lesson_manager_id)).toEqual([
      "path-1",
      "path-2",
    ]);
  });

  it("đánh giá toàn bộ branch và chọn package có ROI tổng tốt nhất", () => {
    const input = baseInput();
    input.lesson_managers = [
      createUnit({
        id: "root",
        title: "Root",
        planned_completion_time: 60,
        next_unit_ids: ["short-branch", "long-branch-1"],
      }),
      createUnit({
        id: "short-branch",
        title: "Nhánh ngắn",
        weight: 0.4,
        planned_completion_time: 120,
        prerequisite_unit_ids: ["root"],
      }),
      createUnit({
        id: "long-branch-1",
        title: "Nhánh dài 1",
        weight: 0.5,
        planned_completion_time: 60,
        prerequisite_unit_ids: ["root"],
        next_unit_ids: ["long-branch-2"],
      }),
      createUnit({
        id: "long-branch-2",
        title: "Nhánh dài 2",
        weight: 0.4,
        planned_completion_time: 30,
        prerequisite_unit_ids: ["long-branch-1"],
      }),
    ];

    const result = selectBestSkillRoiOpportunity(input);

    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;

    expect(result.selected_units.map((unit) => unit.lesson_manager_id)).toEqual([
      "root",
      "long-branch-1",
      "long-branch-2",
    ]);
  });

  it("không tạo package vượt quá max_learning_minutes", () => {
    const input = baseInput();
    input.policy = {
      ...DEFAULT_SKILL_ROI_POLICY_V3,
      max_learning_minutes: 100,
    };
    input.lesson_managers = [
      createUnit({
        id: "unit-1",
        title: "Unit 1",
        planned_completion_time: 60,
        next_unit_ids: ["unit-2"],
      }),
      createUnit({
        id: "unit-2",
        title: "Unit 2",
        planned_completion_time: 60,
        prerequisite_unit_ids: ["unit-1"],
      }),
    ];

    const result = selectBestSkillRoiOpportunity(input);

    expect(result.status).toBe("no_eligible_skill");
    expect(result.candidates[0].selected_units).toHaveLength(1);
    expect(result.candidates[0].estimated_learning_minutes).toBe(60);
  });

  it("trả kết quả deterministic khi các package bằng điểm", () => {
    const input = baseInput();
    input.lesson_managers = [
      createUnit({
        id: "a-1",
        title: "A1",
        next_unit_ids: ["a-2"],
      }),
      createUnit({
        id: "a-2",
        title: "A2",
        prerequisite_unit_ids: ["a-1"],
      }),
      createUnit({
        id: "b-1",
        title: "B1",
        next_unit_ids: ["b-2"],
      }),
      createUnit({
        id: "b-2",
        title: "B2",
        prerequisite_unit_ids: ["b-1"],
      }),
    ];

    const result = selectBestSkillRoiOpportunity(input);

    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;

    expect(result.selected_units.map((unit) => unit.lesson_manager_id)).toEqual([
      "a-1",
      "a-2",
    ]);
  });
});
