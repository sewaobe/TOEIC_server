import type { SchedulerTriggerType } from "../../models";
import type {
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
} from "./learning_path_v2.types";

export type LearningPathV2Layer1TriggerType = Extract<
  SchedulerTriggerType,
  "initial_generation" | "full_test_review" | "mini_test_completion"
>;

export type NormalizedTestTypeV2 =
  | "entry_test"
  | "full_test"
  | "practice"
  | "demo_test"
  | "mini_test";

export type NormalizedTestResultSourceV2 =
  | "overview_test"
  | "lesson_mini_test"
  | "manual";

export type ToeicSkillGroupV2 = "basic" | "core" | "advanced";

export interface NormalizedToeicSkillV2 {
  key: string;
  label_vi: string;
  raw_tag: string;
  part_type: number;
  skill_group: ToeicSkillGroupV2;
}

// Dạng câu trả lời đã được chuẩn hóa sau Layer 1.
export interface NormalizedTestAnswerV2 {
  question_id: string;
  selected_option?: string;
  correct_answer?: string;
  is_correct?: boolean;
  part_type?: number;
  tags?: string[];
  raw_tags?: string[];
  skills?: NormalizedToeicSkillV2[];
  skill_keys?: string[];
  response_time_seconds?: number;
}

// Tóm tắt độ chính xác theo Part nếu dữ liệu thô có cung cấp.
export interface NormalizedPartResultV2 {
  part_type?: number;
  part_name?: string;
  total_questions?: number;
  correct_count?: number;
  accuracy: number;
}

// Shape adapter chỉ dùng trong Layer 1 để đọc object giống UserTest.
// Đây không phải model lưu DB và không thay thế UserTest hiện tại.
export interface RawUserTestLikeInput {
  _id?: unknown;
  id?: unknown;
  user_test_id?: unknown;
  test_result_id?: unknown;
  user_id?: unknown;
  test_id?: unknown;
  score?: unknown;
  raw_score?: unknown;
  answers?: unknown;
  parts?: unknown;
  part_results?: unknown;
  completedPart?: unknown;
  completed_part?: unknown;
  duration?: unknown;
  elapsed_seconds?: unknown;
  submit_at?: unknown;
  submitted_at?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// Output chuẩn của Layer 1 cho Layer 2. Không chứa ability.
export interface NormalizedTestResultV2 {
  trigger_type: LearningPathV2Layer1TriggerType;
  user_id: string;
  test_id: string;
  test_result_id?: string;
  test_type: NormalizedTestTypeV2;
  source: NormalizedTestResultSourceV2;
  submitted_at?: Date;
  elapsed_seconds?: number;
  raw_score?: number;
  accuracy?: number;
  answers: NormalizedTestAnswerV2[];
  part_results: NormalizedPartResultV2[];
  metadata: Record<string, unknown>;
}

export type NormalizeInitialAssessmentInput =
  BuildInitialLearningPathPlanInput;

export type NormalizeFullTestResultInput = BuildFullTestLearningPathPlanInput;

export type NormalizeMiniTestResultInput = BuildMiniTestNextWeekPlanInput;
