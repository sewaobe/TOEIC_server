import { Schema, model, Document, Types } from "mongoose";
import { PartType } from "./enums/PartType";
import {
  UserSkillAbilityStatus,
  UserSkillTrend,
} from "../types/user_skill.type";

export type SchedulerTriggerType =
  | "initial_generation"
  | "mini_test_completion"
  | "full_test_review"
  | "manual";

/**
 * Scheduler chỉ còn một strategy:
 * tối đa hóa ROI dự kiến của skill.
 */
export type SchedulerStrategy = "maximize_skill_roi";

export type SchedulerScenario =
  | "ONBOARDING"
  | "NORMAL_PROGRESS"
  | "PLATEAU"
  | "BEHIND_SCHEDULE"
  | "PRE_DEADLINE"
  | "FULLTEST_MONTHLY";

export type SchedulerDecisionStatus = "applied" | "failed";

export type AbilityStatus = UserSkillAbilityStatus;
export type AbilityTrend = UserSkillTrend;

export interface ISchedulerPartAbilitySnapshot {
  part_type: PartType;
  ability?: number;
  status?: AbilityStatus;
  trend?: AbilityTrend;
}

export interface ISchedulerSkillAbilitySnapshot {
  part_type: PartType;
  skill_key: string;
  ability?: number;
  status?: AbilityStatus;
  trend?: AbilityTrend;
}

export type SchedulerExtraSnapshot = Record<string, unknown>;

export interface ISchedulerInputSnapshot {
  current_score?: number;
  target_score?: number;

  /**
   * Tên field được giữ nguyên để tránh ảnh hưởng code hiện tại.
   * Sau này có thể đổi thành cycle_available_minutes khi cập nhật service.
   */
  weekly_available_minutes?: number;

  test_type?: "entry" | "full" | "mini" | "manual";

  part_abilities?: ISchedulerPartAbilitySnapshot[];
  skill_abilities?: ISchedulerSkillAbilitySnapshot[];

  /**
   * Dữ liệu phụ phục vụ debug và audit.
   *
   * Có thể lưu:
   * - Số skill đã được đánh giá ROI.
   * - Các candidate có ROI cao nhất.
   * - Các skill bị loại vì không có LessonManager phù hợp.
   *
   * Không dùng field này để thay thế các field chính trong snapshot.
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
 * Log quyết định của scheduler.
 *
 * WeekStudy lưu kết quả cycle đã được tạo:
 * - Primary skill.
 * - Covered skills.
 * - Expected gain.
 * - Expected ROI.
 *
 * SchedulerDecisionLog chỉ lưu:
 * - Input tại thời điểm ra quyết định.
 * - Các LessonManager đã chọn.
 * - Trạng thái thực thi.
 * - Lý do, cảnh báo và lỗi.
 */
export interface ISchedulerDecisionLog extends Document {
  user_id: Types.ObjectId;
  learning_path_id: Types.ObjectId;

  /**
   * Strategy option cung cấp roadmap dài hạn khi tạo cycle.
   */
  learning_path_strategy_option_id?: Types.ObjectId;

  /**
   * Cycle trước đó dẫn tới quyết định hiện tại.
   * Thường có giá trị khi trigger là mini_test_completion
   * hoặc full_test_review.
   */
  source_week_id?: Types.ObjectId;

  /**
   * Cycle được tạo ra từ quyết định này.
   *
   * Có thể dùng generated_week_id để truy vấn WeekStudy
   * và lấy primary skill, covered skills, gain và ROI.
   */
  generated_week_id?: Types.ObjectId;

  trigger_type: SchedulerTriggerType;
  scheduler_version: string;

  strategy?: SchedulerStrategy;
  scenario?: SchedulerScenario;

  status: SchedulerDecisionStatus;

  input_snapshot?: ISchedulerInputSnapshot;

  /**
   * Các LessonManager được scheduler chọn.
   *
   * Field này vẫn được lưu trong log để audit ngay cả khi
   * quá trình tạo WeekStudy hoặc DayStudy thất bại giữa chừng.
   */
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
      part_type: {
        type: Number,
        required: true,
        min: 1,
        max: 7,
      },

      ability: {
        type: Number,
        min: 0,
        max: 1,
      },

      status: {
        type: String,
        enum: ["weak", "medium", "strong"],
      },

      trend: {
        type: String,
        enum: ["improving", "stable", "declining"],
      },
    },
    {
      _id: false,
    }
  );

const SchedulerSkillAbilitySnapshotSchema =
  new Schema<ISchedulerSkillAbilitySnapshot>(
    {
      part_type: {
        type: Number,
        required: true,
        min: 1,
        max: 7,
      },

      skill_key: {
        type: String,
        required: true,
        trim: true,
      },

      ability: {
        type: Number,
        min: 0,
        max: 1,
      },

      status: {
        type: String,
        enum: ["weak", "medium", "strong"],
      },

      trend: {
        type: String,
        enum: ["improving", "stable", "declining"],
      },
    },
    {
      _id: false,
    }
  );

const SchedulerInputSnapshotSchema =
  new Schema<ISchedulerInputSnapshot>(
    {
      current_score: {
        type: Number,
      },

      target_score: {
        type: Number,
      },

      weekly_available_minutes: {
        type: Number,
        min: 0,
      },

      test_type: {
        type: String,
        enum: ["entry", "full", "mini", "manual"],
      },

      part_abilities: {
        type: [SchedulerPartAbilitySnapshotSchema],
        default: [],
      },

      skill_abilities: {
        type: [SchedulerSkillAbilitySnapshotSchema],
        default: [],
      },

      extra: {
        type: Schema.Types.Mixed,
        default: undefined,
      },
    },
    {
      _id: false,
    }
  );

const SchedulerOutputSummarySchema =
  new Schema<ISchedulerOutputSummary>(
    {
      planned_minutes: {
        type: Number,
        default: 0,
        min: 0,
      },

      selected_unit_count: {
        type: Number,
        default: 0,
        min: 0,
      },

      generated_day_count: {
        type: Number,
        default: 0,
        min: 0,
      },

      generated_session_count: {
        type: Number,
        default: 0,
        min: 0,
      },

      generated_activity_count: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    {
      _id: false,
    }
  );

const SchedulerDecisionLogSchema =
  new Schema<ISchedulerDecisionLog>(
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

      learning_path_strategy_option_id: {
        type: Schema.Types.ObjectId,
        ref: "LearningPathStrategyOption",
        index: true,
      },

      source_week_id: {
        type: Schema.Types.ObjectId,
        ref: "WeekStudy",
        index: true,
      },

      generated_week_id: {
        type: Schema.Types.ObjectId,
        ref: "WeekStudy",
        index: true,
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

      /**
       * Field này đã tồn tại để hỗ trợ audit.
       * Không dùng để điều khiển nghiệp vụ planner.
       */
      scheduler_version: {
        type: String,
        required: true,
        default: "layer4-v1",
      },

      strategy: {
        type: String,
        enum: ["maximize_skill_roi"],
        default: "maximize_skill_roi",
      },

      scenario: {
        type: String,
        enum: [
          "ONBOARDING",
          "NORMAL_PROGRESS",
          "PLATEAU",
          "BEHIND_SCHEDULE",
          "PRE_DEADLINE",
          "FULLTEST_MONTHLY",
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

      selected_lesson_manager_ids: [
        {
          type: Schema.Types.ObjectId,
          ref: "LessonManager",
        },
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
      timestamps: {
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
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

export const SchedulerDecisionLog =
  model<ISchedulerDecisionLog>(
    "SchedulerDecisionLog",
    SchedulerDecisionLogSchema
  );