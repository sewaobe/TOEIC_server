import type {
  SelectBestSkillRoiInputV3,
  SkillRoiDecisionV3,
  SkillRoiPartAbilityInputV3,
  SkillRoiUnitResultV3,
  SkillRoiUserSkillInputV3,
} from "./skill_roi_optimizer.types";

export type SelectedSkillRoiDecisionV3 = Extract<
  SkillRoiDecisionV3,
  { status: "selected" }
>;

export type SimulateSkillRoiRoadmapInputV3 = {
  /** Điểm thực tế của entry test hoặc full test gần nhất. */
  anchor_score: number;
  target_score: number;

  /** Tổng thời gian còn lại cho learning lẫn assessment. */
  available_total_minutes: number;

  /** State đã chuẩn hóa, dùng trực tiếp cho Skill ROI engine. */
  planning_context: SelectBestSkillRoiInputV3;

  /** Chặn vòng lặp mô phỏng không giới hạn. */
  max_cycle_count: number;

  on_progress?: (input: {
    cycle_count: number;
    planned_score: number;
    remaining_minutes: number;
    completed_lesson_manager_count: number;
  }) => void;
};

export type SimulatedSkillRoiCycleV3 = {
  cycle_no: number;
  primary_focus_skill_key: string;
  focus_part_type: number;
  covered_skill_keys: string[];
  selected_units: SkillRoiUnitResultV3[];
  projected_skill_ability_before: number;
  projected_skill_ability_after: number;
  projected_part_ability_before: number;
  projected_part_ability_after: number;
  /** Planned roadmap score based on elapsed study time. */
  planned_score_before: number;
  planned_score_after: number;
  planned_score_gain: number;

  /** Ability-to-score conversion used only for debugging and research. */
  ability_based_score_gain_proxy: number;
  expected_skill_gain: number;
  expected_roi_per_hour: number;
  estimated_learning_minutes: number;
  assessment_type: "mini_test" | "full_test";
  assessment_estimated_minutes: number;
  total_cycle_minutes: number;
  planned_full_test_score?: number;
};

export type SkillRoiRoadmapStopReasonV3 =
  | "target_reached"
  | "time_exhausted"
  | "no_eligible_skill"
  | "no_positive_gain"
  | "max_cycle_count_reached";

export type SimulatedSkillRoiRoadmapV3 = {
  anchor_score: number;
  target_score: number;

  /**
   * Tốc độ tăng điểm cần thiết trên mỗi giờ của toàn bộ lịch trình,
   * bao gồm learning và assessment.
   */
  required_score_gain_per_hour: number | null;
  planned_final_score: number;
  reaches_target: boolean;
  total_learning_minutes: number;
  total_assessment_minutes: number;
  total_used_minutes: number;
  remaining_minutes: number;
  cycle_count: number;
  stop_reason: SkillRoiRoadmapStopReasonV3;

  /** Decision tạo ra cycle đầu tiên của roadmap. */
  first_decision: SelectedSkillRoiDecisionV3 | null;

  cycles: SimulatedSkillRoiCycleV3[];
  final_part_abilities: SkillRoiPartAbilityInputV3[];
  final_skill_abilities: SkillRoiUserSkillInputV3[];
  simulated_completed_lesson_manager_ids: string[];
};
