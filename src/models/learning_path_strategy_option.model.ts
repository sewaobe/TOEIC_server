import { Schema, model, Document, Types } from "mongoose";
import { PartType } from "./enums/PartType";
import type {
  LessonManagerNodeRole,
  LessonManagerUnitType,
} from "./lesson_manager.model";

export type LearningPathStrategyType =
  | "recommended"
  | "balanced"
  | "opportunity";

export type LearningPathStrategyOptionStatus =
  | "pending_selection"
  | "selected"
  | "dismissed"
  | "expired";

export type LearningPathStrategyOptionTrigger =
  | "initial_generation"
  | "full_test_review";

export type LearningPathScenarioSnapshot =
  | "ONBOARDING"
  | "FULLTEST_MONTHLY"
  | "PRE_DEADLINE"
  | "BEHIND_SCHEDULE";

export interface ILearningPathStrategyRoadmapUnit {
  lesson_manager_id: Types.ObjectId;

  /**
   * Snapshot thông tin chính của LessonManager tại thời điểm scheduler tạo route.
   * Lưu snapshot để sau này LessonManager đổi tên/tag thì option cũ vẫn hiển thị ổn.
   */
  title: string;
  part_type: PartType;
  score_band?: {
    from: number;
    to: number;
  };
  unit_type: LessonManagerUnitType;
  /**
   * node_role chỉ còn normal/support trong snapshot route.
   * Entry/target là khái niệm runtime, không phải trạng thái cố định của LessonManager.
   */
  node_role: LessonManagerNodeRole;
  target_tags: string[];

  /**
   * Thứ tự unit trong route được gợi ý.
   * Đây là thứ tự tổng quát của lộ trình, không phải order activity bên trong unit.
   */
  order: number;

  /**
   * Thời lượng dự kiến của unit, đơn vị phút.
   * Lấy từ LessonManager.planned_completion_time tại thời điểm tạo option.
   */
  planned_minutes: number;

  /**
   * Gain ước lượng của unit trong context strategy/scenario hiện tại.
   * Field này phục vụ giải thích và so sánh option, không phải điểm thật của user.
   */
  estimated_gain?: number;

  /**
   * Lý do ngắn để FE giải thích vì sao unit này nằm trong route.
   * Ví dụ: "Part 5 đang yếu", "Phù hợp target 600", "Core skill có gain cao".
   */
  reason?: string;
}

export interface ILearningPathStrategyPartRoadmap {
  part_type: PartType;
  cursor_index: number;
  target_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;
  units: ILearningPathStrategyRoadmapUnit[];
}

export interface ILearningPathStrategyOption extends Document {
  _id: Types.ObjectId;

  user_id: Types.ObjectId;
  learning_path_id: Types.ObjectId;

  /**
   * Trigger tạo option.
   * initial_generation chỉ tạo recommended và auto selected.
   * full_test_review tạo 3 option pending để user chọn.
   */
  trigger_type: LearningPathStrategyOptionTrigger;

  /**
   * Bài test tạo ra option này.
   * Entry/full test đều được lưu vào UserTest trước khi scheduler tạo option.
   */
  source_user_test_id?: Types.ObjectId | null;

  /**
   * Full test option có thể gắn với WeekCycle hiện tại nếu có.
   * Không bắt buộc vì entry/onboarding chưa có WeekStudy cũ.
   */
  source_week_study_id?: Types.ObjectId | null;

  strategy: LearningPathStrategyType;
  scenario: LearningPathScenarioSnapshot;

  status: LearningPathStrategyOptionStatus;

  /**
   * Tổng quan để FE hiển thị card option.
   */
  title: string;
  description?: string;

  /**
   * Các Part/skill trọng tâm của route.
   * WeekStudy sau này sẽ lấy một phần từ đây để tạo focus_part_types/focus_skill_keys cho từng cycle.
   */
  focus_part_types: PartType[];
  focus_skill_keys: string[];

  /**
   * Ước lượng tổng route option.
   * reaches_target = false không phải lỗi; nghĩa là budget hiện tại chưa đủ tới target node,
   * hệ thống chọn prefix có gain tốt nhất trong thời gian user có.
   */
  estimated_total_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;

    /**
   * part_roadmaps là 7 roadmap riêng cho 7 TOEIC Part tại thời điểm tạo strategy.
   * Đây là định hướng dài hạn theo từng Part, không phải lịch học tuyến tính cố định.
   * Beam Search sẽ chọn cycle tiếp theo từ các roadmap này.
   */
  part_roadmaps: ILearningPathStrategyPartRoadmap[];

  /**
   * Lý do tổng quan cho option.
   * Ví dụ: "Ưu tiên Part 5/6/7 vì đang yếu", "Target 600 nên tập trung core skills".
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
      enum: Object.values(PartType).filter((value) => typeof value === "number"),
      required: true,
    },

    score_band: {
      from: { type: Number },
      to: { type: Number },
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
  },
    { _id: false }
  );

const LearningPathStrategyPartRoadmapSchema =
  new Schema<ILearningPathStrategyPartRoadmap>(
    {
      part_type: {
        type: Number,
        enum: Object.values(PartType).filter((value) => typeof value === "number"),
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
    { _id: false }
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
        enum: ["initial_generation", "full_test_review"],
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
        enum: ["recommended", "balanced", "opportunity"],
        required: true,
        index: true,
      },

      scenario: {
        type: String,
        enum: [
          "ONBOARDING",
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
          message: "focus_part_types chỉ được chứa TOEIC Part từ 1 đến 7.",
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
        min: 0,
        default: 0,
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
      timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    }
  );

/**
 * Query chính:
 * - Lấy các option pending sau full test để user chọn.
 * - Lấy selected option gần nhất để mini test tiếp tục active path.
 */
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
 * Một LearningPath chỉ nên có một selected option active tại một thời điểm.
 * Các option cũ nên được chuyển expired/dismissed trước khi chọn option mới.
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


