import { Schema, model, Document, Types } from "mongoose";

export type SchedulerTriggerType =
  | "initial_generation"
  | "mini_test_completion"
  | "full_test_review"
  | "manual";

/**
 * Strategy = cách scheduler chấm điểm candidate LessonManager nodes.
 * Cùng một bộ input, mỗi strategy chỉ khác trọng số ưu tiên.
 */
export type SchedulerStrategy = "recommended" | "balanced" | "opportunity";

export type SchedulerScenario =
  | "normal_progress"
  | "ahead_of_plan"
  | "behind_plan"
  | "weak_after_mini_test"
  | "fail_light"
  | "fail_heavy"
  | "plateau";

export type SchedulerDecisionStatus = "applied" | "failed";

/**
 * status = nhóm tương đối sau khi sort trong chính user đó.
 * Không phải năng lực tuyệt đối.
 */
export type AbilityStatus = "weak" | "medium" | "strong";

/**
 * absolute_level = mức năng lực tuyệt đối theo ngưỡng.
 * Ví dụ: status="strong" nhưng absolute_level="low" nghĩa là
 * part/skill đó mạnh tương đối trong user này, nhưng vẫn yếu theo chuẩn chung.
 */
export type AbsoluteAbilityLevel = "very_low" | "low" | "medium" | "high";

export type SkillGroup = "basic" | "core" | "advanced";

export interface ISchedulerPartAbilitySnapshot {
  part_type: number;
  ability: number;
  estimated_score?: number;
  status: AbilityStatus;
  absolute_level?: AbsoluteAbilityLevel;
  confidence?: number;
}

export interface ISchedulerSkillAbilitySnapshot {
  part_type: number;
  tag: string;
  ability: number;
  status: AbilityStatus;
  absolute_level?: AbsoluteAbilityLevel;
  confidence?: number;
  skill_group?: SkillGroup;
}

export type SchedulerExtraSnapshot = Record<string, unknown>;

export interface ISchedulerInputSnapshot {
  current_score?: number;
  target_score?: number;
  weekly_available_minutes?: number;
  test_type?: "full" | "mini" | "manual";

  part_abilities?: ISchedulerPartAbilitySnapshot[];
  skill_abilities?: ISchedulerSkillAbilitySnapshot[];

  completed_lesson_manager_ids?: Types.ObjectId[];

  /**
   * Dữ liệu phụ để debug/audit.
   * Không dùng thay cho part_abilities hoặc skill_abilities.
   */
  extra?: SchedulerExtraSnapshot;
}

export interface ISchedulerOutputSummary {
  planned_minutes?: number;
  selected_unit_count?: number;
  generated_day_count?: number;
  generated_session_count?: number;
  generated_activity_count?: number;
}

/**
 * Log quyết định của Layer 4 Scheduler.
 * Dùng để audit/debug vì sao scheduler chọn các LessonManager nodes đó.
 */
export interface ISchedulerDecisionLog extends Document {
  user_id: Types.ObjectId;
  learning_path_id: Types.ObjectId;

  source_week_id?: Types.ObjectId;
  generated_week_id?: Types.ObjectId;

  trigger_type: SchedulerTriggerType;
  scheduler_version: string;

  strategy?: SchedulerStrategy;
  scenario?: SchedulerScenario;

  status: SchedulerDecisionStatus;

  input_snapshot?: ISchedulerInputSnapshot;

  candidate_lesson_manager_ids?: Types.ObjectId[];
  selected_lesson_manager_ids?: Types.ObjectId[];

  output_summary?: ISchedulerOutputSummary;

  reasons: string[];
  warnings: string[];

  error_message?: string;

  created_by?: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const SchedulerPartAbilitySnapshotSchema =
  new Schema<ISchedulerPartAbilitySnapshot>(
    {
      part_type: { type: Number, required: true },
      ability: { type: Number, required: true },
      estimated_score: { type: Number },
      status: {
        type: String,
        enum: ["weak", "medium", "strong"],
        required: true,
      },
      absolute_level: {
        type: String,
        enum: ["very_low", "low", "medium", "high"],
      },
      confidence: { type: Number },
    },
    { _id: false }
  );

const SchedulerSkillAbilitySnapshotSchema =
  new Schema<ISchedulerSkillAbilitySnapshot>(
    {
      part_type: { type: Number, required: true },
      tag: { type: String, required: true },
      ability: { type: Number, required: true },
      status: {
        type: String,
        enum: ["weak", "medium", "strong"],
        required: true,
      },
      absolute_level: {
        type: String,
        enum: ["very_low", "low", "medium", "high"],
      },
      confidence: { type: Number },
      skill_group: {
        type: String,
        enum: ["basic", "core", "advanced"],
      },
    },
    { _id: false }
  );

const SchedulerInputSnapshotSchema = new Schema<ISchedulerInputSnapshot>(
  {
    current_score: { type: Number },
    target_score: { type: Number },
    weekly_available_minutes: { type: Number },
    test_type: {
      type: String,
      enum: ["full", "mini", "manual"],
    },

    part_abilities: {
      type: [SchedulerPartAbilitySnapshotSchema],
      default: [],
    },

    skill_abilities: {
      type: [SchedulerSkillAbilitySnapshotSchema],
      default: [],
    },

    completed_lesson_manager_ids: [
      { type: Schema.Types.ObjectId, ref: "LessonManager" },
    ],

    extra: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  { _id: false }
);

const SchedulerOutputSummarySchema = new Schema<ISchedulerOutputSummary>(
  {
    planned_minutes: { type: Number, default: 0 },
    selected_unit_count: { type: Number, default: 0 },
    generated_day_count: { type: Number, default: 0 },
    generated_session_count: { type: Number, default: 0 },
    generated_activity_count: { type: Number, default: 0 },
  },
  { _id: false }
);

const SchedulerDecisionLogSchema = new Schema<ISchedulerDecisionLog>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    learning_path_id: {
      type: Schema.Types.ObjectId,
      ref: "LearningPath",
      required: true,
      index: true,
    },

    source_week_id: {
      type: Schema.Types.ObjectId,
      ref: "WeekStudy",
    },

    generated_week_id: {
      type: Schema.Types.ObjectId,
      ref: "WeekStudy",
    },

    trigger_type: {
      type: String,
      enum: [
        "initial_generation",
        "mini_test_completion",
        "full_test_review",
        "manual",
      ],
      required: true,
      index: true,
    },

    scheduler_version: {
      type: String,
      required: true,
      default: "layer4-v1",
    },

    strategy: {
      type: String,
      enum: ["recommended", "balanced", "opportunity"],
    },

    scenario: {
      type: String,
      enum: [
        "normal_progress",
        "ahead_of_plan",
        "behind_plan",
        "weak_after_mini_test",
        "fail_light",
        "fail_heavy",
        "plateau",
      ],
    },

    status: {
      type: String,
      enum: ["applied", "failed"],
      required: true,
      index: true,
    },

    input_snapshot: {
      type: SchedulerInputSnapshotSchema,
      default: undefined,
    },

    candidate_lesson_manager_ids: [
      { type: Schema.Types.ObjectId, ref: "LessonManager" },
    ],

    selected_lesson_manager_ids: [
      { type: Schema.Types.ObjectId, ref: "LessonManager" },
    ],

    output_summary: {
      type: SchedulerOutputSummarySchema,
      default: undefined,
    },

    reasons: {
      type: [String],
      default: [],
    },

    warnings: {
      type: [String],
      default: [],
    },

    error_message: {
      type: String,
      default: "",
    },

    created_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

SchedulerDecisionLogSchema.index({
  learning_path_id: 1,
  created_at: -1,
});

SchedulerDecisionLogSchema.index({
  user_id: 1,
  trigger_type: 1,
  created_at: -1,
});

export const SchedulerDecisionLog = model<ISchedulerDecisionLog>(
  "SchedulerDecisionLog",
  SchedulerDecisionLogSchema
);