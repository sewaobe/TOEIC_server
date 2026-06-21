import { Schema, model, Document, Types } from "mongoose";
import { PartType } from "./enums/PartType";
import type {
  LessonManagerNodeRole,
  LessonManagerUnitType,
} from "./lesson_manager.model";

/**
 * Hệ thống chỉ còn một strategy:
 * tối đa hóa ROI dự kiến của skill.
 */
export type LearningPathStrategyType = "maximize_skill_roi";

export type LearningPathStrategyOptionStatus =
  | "pending_selection"
  | "selected"
  | "dismissed"
  | "expired";

export type LearningPathStrategyOptionTrigger =
  | "initial_generation"
  | "full_test_review"
  | "mini_test_completion"
  | "manual_adjustment";

export type LearningPathScenarioSnapshot =
  | "ONBOARDING"
  | "NORMAL_PROGRESS"
  | "PLATEAU"
  | "FULLTEST_MONTHLY"
  | "PRE_DEADLINE"
  | "BEHIND_SCHEDULE";

export interface ILearningPathStrategyRoadmapUnit {
  lesson_manager_id: Types.ObjectId;

  /**
   * Snapshot thông tin chính của LessonManager tại thời điểm tạo route.
   * Option cũ vẫn có thể hiển thị đúng nếu LessonManager thay đổi sau này.
   */
  title: string;
  part_type: PartType;

  score_band?: {
    from: number;
    to: number;
  };

  unit_type: LessonManagerUnitType;

  /**
   * Entry và target được xác định tại runtime.
   * node_role chỉ biểu diễn node thông thường hoặc node hỗ trợ.
   */
  node_role: LessonManagerNodeRole;

  /**
   * Các skill được LessonManager nhắm tới.
   * Các skill trong mảng này có vai trò ngang nhau.
   */
  target_tags: string[];

  /**
   * Thứ tự của LessonManager trong roadmap thuộc Part.
   * Đây không phải thứ tự activity bên trong LessonManager.
   */
  order: number;

  /**
   * Thời lượng dự kiến của LessonManager, đơn vị phút.
   */
  planned_minutes: number;

  /**
   * Gain ước lượng của unit.
   * Đây là giá trị nội bộ, không phải điểm TOEIC.
   */
  estimated_gain?: number;

  /**
   * Lý do ngắn gọn giải thích vì sao unit xuất hiện trong roadmap.
   */
  reason?: string;

  unit_source?: "strategy" | "alternative";
  source_reason?: string;
}

export interface ILearningPathStrategyPartRoadmap {
  part_type: PartType;

  /**
   * Vị trí LessonManager tiếp theo chưa được sử dụng trong roadmap.
   */
  cursor_index: number;

  /**
   * Tổng thời lượng dự kiến của roadmap thuộc Part này.
   */
  target_minutes: number;

  /**
   * Tổng gain ước lượng của roadmap thuộc Part này.
   */
  estimated_gain: number;

  /**
   * Roadmap hiện tại có dự kiến đi tới vùng target hay không.
   */
  reaches_target: boolean;

  units: ILearningPathStrategyRoadmapUnit[];
}

export interface ILearningPathStrategyOption extends Document {
  _id: Types.ObjectId;

  user_id: Types.ObjectId;
  learning_path_id: Types.ObjectId;

  /**
   * Sự kiện tạo strategy option.
   */
  trigger_type: LearningPathStrategyOptionTrigger;

  /**
   * UserTest tạo ra strategy option này.
   */
  source_user_test_id?: Types.ObjectId | null;

  /**
   * Cycle nguồn liên quan đến lần tạo lại strategy, nếu có.
   */
  source_week_study_id?: Types.ObjectId | null;

  strategy: LearningPathStrategyType;
  scenario: LearningPathScenarioSnapshot;
  status: LearningPathStrategyOptionStatus;

  /**
   * Thông tin tổng quan để frontend hiển thị strategy hiện tại.
   */
  title: string;
  description?: string;

  /**
   * Các Part và skill đáng chú ý trong roadmap dài hạn.
   *
   * Đây không phải focus thực tế của một cycle.
   * Focus thực tế được lưu trong WeekStudy.
   */
  focus_part_types: PartType[];
  focus_skill_keys: string[];

  /**
   * Ước lượng tổng thể của roadmap dài hạn.
   */
  estimated_total_minutes: number;
  estimated_gain: number;

  /**
   * Roadmap dự kiến có thể đi tới target trong thời gian hiện có hay không.
   */
  reaches_target: boolean;

  /**
   * Bảy roadmap riêng cho bảy TOEIC Part.
   * Đây là dự báo dài hạn, không phải lịch học cố định.
   */
  part_roadmaps: ILearningPathStrategyPartRoadmap[];

  /**
   * Các lý do tổng quan dùng để giải thích strategy.
   */
  summary_reasons: string[];

  selected_at?: Date;
  created_at: Date;
  updated_at?: Date;
}

const LearningPathStrategyRoadmapUnitSchema =
  new Schema<ILearningPathStrategyRoadmapUnit>(
    {
      lesson_manager_id: {
        type: Schema.Types.ObjectId,
        ref: "LessonManager",
        required: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
      },

      part_type: {
        type: Number,
        enum: Object.values(PartType).filter(
          (value) => typeof value === "number"
        ),
        required: true,
      },

      score_band: {
        from: {
          type: Number,
        },
        to: {
          type: Number,
        },
      },

      unit_type: {
        type: String,
        enum: [
          "foundation",
          "skill_drill",
          "mixed_practice",
          "exam_practice",
          "remedial",
        ],
        required: true,
      },

      node_role: {
        type: String,
        enum: ["normal", "support"],
        required: true,
      },

      target_tags: {
        type: [String],
        default: [],
      },

      order: {
        type: Number,
        required: true,
        min: 0,
      },

      planned_minutes: {
        type: Number,
        required: true,
        min: 0,
      },

      estimated_gain: {
        type: Number,
        min: 0,
      },

      reason: {
        type: String,
        default: "",
      },

      unit_source: {
        type: String,
        enum: ["strategy", "alternative"],
        default: "strategy",
      },

      source_reason: {
        type: String,
        default: "",
      },
    },
    {
      _id: false,
    }
  );

const LearningPathStrategyPartRoadmapSchema =
  new Schema<ILearningPathStrategyPartRoadmap>(
    {
      part_type: {
        type: Number,
        enum: Object.values(PartType).filter(
          (value) => typeof value === "number"
        ),
        required: true,
      },

      cursor_index: {
        type: Number,
        default: 0,
        min: 0,
      },

      target_minutes: {
        type: Number,
        default: 0,
        min: 0,
      },

      estimated_gain: {
        type: Number,
        default: 0,
        min: 0,
      },

      reaches_target: {
        type: Boolean,
        default: false,
      },

      units: {
        type: [LearningPathStrategyRoadmapUnitSchema],
        default: [],
      },
    },
    {
      _id: false,
    }
  );

const LearningPathStrategyOptionSchema =
  new Schema<ILearningPathStrategyOption>(
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

      trigger_type: {
        type: String,
        enum: [
          "initial_generation",
          "full_test_review",
          "mini_test_completion",
          "manual_adjustment",
        ],
        required: true,
        index: true,
      },

      source_user_test_id: {
        type: Schema.Types.ObjectId,
        ref: "UserTest",
        default: null,
        index: true,
      },

      source_week_study_id: {
        type: Schema.Types.ObjectId,
        ref: "WeekStudy",
        default: null,
        index: true,
      },

      strategy: {
        type: String,
        enum: ["maximize_skill_roi"],
        required: true,
        default: "maximize_skill_roi",
        index: true,
      },

      scenario: {
        type: String,
        enum: [
          "ONBOARDING",
          "NORMAL_PROGRESS",
          "PLATEAU",
          "FULLTEST_MONTHLY",
          "PRE_DEADLINE",
          "BEHIND_SCHEDULE",
        ],
        required: true,
        index: true,
      },

      status: {
        type: String,
        enum: ["pending_selection", "selected", "dismissed", "expired"],
        required: true,
        default: "pending_selection",
        index: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
      },

      description: {
        type: String,
        default: "",
      },

      focus_part_types: {
        type: [Number],
        default: [],
        validate: {
          validator: (values: number[]) =>
            values.every((part) => part >= 1 && part <= 7),
          message:
            "focus_part_types chỉ được chứa TOEIC Part từ 1 đến 7.",
        },
      },

      focus_skill_keys: {
        type: [String],
        default: [],
        index: true,
      },

      estimated_total_minutes: {
        type: Number,
        required: true,
        min: 0,
      },

      estimated_gain: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      reaches_target: {
        type: Boolean,
        required: true,
        default: false,
      },

      part_roadmaps: {
        type: [LearningPathStrategyPartRoadmapSchema],
        default: [],
      },

      summary_reasons: {
        type: [String],
        default: [],
      },

      selected_at: {
        type: Date,
      },
    },
    {
      timestamps: {
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    }
  );

LearningPathStrategyOptionSchema.index({
  learning_path_id: 1,
  status: 1,
  created_at: -1,
});

LearningPathStrategyOptionSchema.index({
  learning_path_id: 1,
  trigger_type: 1,
  source_user_test_id: 1,
  strategy: 1,
});

/**
 * Mỗi LearningPath chỉ có một strategy option đang được áp dụng.
 */
LearningPathStrategyOptionSchema.index(
  {
    learning_path_id: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "selected",
    },
  }
);

export const LearningPathStrategyOption =
  model<ILearningPathStrategyOption>(
    "LearningPathStrategyOption",
    LearningPathStrategyOptionSchema
  );