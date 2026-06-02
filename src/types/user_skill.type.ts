export type UserSkillAbilityStatus = "weak" | "medium" | "strong";
export type UserSkillAbsoluteAbilityLevel =
  | "very_low"
  | "low"
  | "medium"
  | "high";
export type UserSkillGroup = "basic" | "core" | "advanced";
export type UserSkillContextType = "learning_path" | "free_practice";
export type UserSkillTrend = "improving" | "stable" | "declining";
export type UserSkillHistoryTriggerType =
  | "initial_generation"
  | "full_test_review"
  | "mini_test_completion"
  | "free_practice";