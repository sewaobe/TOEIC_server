export type SkillRoiSkillGroupV3 = "basic" | "core" | "advanced";

export type SkillRoiLessonManagerUnitTypeV3 =
  | "foundation"
  | "skill_drill"
  | "mixed_practice"
  | "exam_practice"
  | "remedial";

export type SkillRoiPolicyV3 = {
  max_learning_minutes: number;
  min_lesson_manager_count: number;
  max_lesson_manager_count: number;
  max_ability_distance: number;
  minimum_unit_roi_per_hour: number;
  allowed_unit_types?: SkillRoiLessonManagerUnitTypeV3[];
};

export type SkillRoiUserSkillInputV3 = {
  skill_key: string;
  part_type: number;
  skill_group: SkillRoiSkillGroupV3;
  ability: number;
  status?: "weak" | "medium" | "strong";
  trend?: "improving" | "stable" | "declining";
  history_count: number;
};

export type SkillRoiPartAbilityInputV3 = {
  part_type: number;
  ability: number;
  status?: "weak" | "medium" | "strong";
  trend?: "improving" | "stable" | "declining";
};

export type SkillRoiLessonManagerInputV3 = {
  id: string;
  title: string;
  part_type: number;
  score_band?: {
    from?: number;
    to?: number;
  };
  unit_type: SkillRoiLessonManagerUnitTypeV3;
  node_role: "normal" | "support";
  target_tags: string[];
  weight: number;
  planned_completion_time: number;
  next_unit_ids: string[];
  prerequisite_unit_ids: string[];
  auxiliary_unit_ids: string[];
};

export type SelectBestSkillRoiInputV3 = {
  target_score: number;
  part_abilities: SkillRoiPartAbilityInputV3[];
  skill_abilities: SkillRoiUserSkillInputV3[];
  lesson_managers: SkillRoiLessonManagerInputV3[];
  completed_lesson_manager_ids: string[];
  policy: SkillRoiPolicyV3;
};

export type SkillRoiUnitResultV3 = {
  lesson_manager_id: string;
  title: string;
  part_type: number;
  unit_type: SkillRoiLessonManagerUnitTypeV3;
  normalized_skill_keys: string[];
  planned_minutes: number;
  difficulty_fit: number;
  focus_skill_share: number;
  expected_skill_gain: number;
  roi_per_hour: number;
  reason: string;


  projected_skill_ability_before?: number;
  projected_skill_ability_after?: number;
};

export type SkillRoiCandidateRejectionReasonV3 =
  | "skill_not_in_taxonomy"
  | "missing_part_ability"
  | "skill_saturated"
  | "no_matching_lesson_manager"
  | "no_reachable_lesson_manager"
  | "insufficient_learning_package";

export type SkillRoiCandidateV3 = {
  skill_key: string;
  part_type: number;
  skill_group: SkillRoiSkillGroupV3;
  current_ability: number;
  part_ability: number;
  trend?: "improving" | "stable" | "declining";
  history_count: number;
  target_group_priority: number;
  selected_units: SkillRoiUnitResultV3[];
  estimated_learning_minutes: number;
  expected_skill_gain: number;
  expected_roi_per_hour: number;
  available_unit_count: number;
  rejection_reason?: SkillRoiCandidateRejectionReasonV3;

  projected_skill_ability_before: number;
  projected_skill_ability_after: number;

  projected_part_ability_before: number;
  projected_part_ability_after: number;

  /**
   * Số điểm TOEIC tổng dự kiến tăng thêm do package này.
   * Đây là projected delta, không phải điểm thi chính thức.
   */
  projected_score_gain: number;
};

export type SkillRoiDecisionV3 =
  | {
    status: "selected";
    evaluated_skill_count: number;
    eligible_skill_count: number;
    primary_focus_skill_key: string;
    focus_part_type: number;
    covered_skill_keys: string[];
    selected_units: SkillRoiUnitResultV3[];
    estimated_learning_minutes: number;
    expected_skill_gain: number;
    expected_roi_per_hour: number;
    candidates: SkillRoiCandidateV3[];
    projected_skill_ability_before: number;
    projected_skill_ability_after: number;
    projected_part_ability_before: number;
    projected_part_ability_after: number;
    projected_score_gain: number;
  }
  | {
    status: "no_eligible_skill";
    evaluated_skill_count: number;
    eligible_skill_count: 0;
    candidates: SkillRoiCandidateV3[];
    reason: string;
  };
