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

export interface IRouteUnitSnapshot {
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

export interface IStrategyAbilityHighlight {
  /**
   * Dùng để hiển thị các bằng chứng chính từ UserSkill tại thời điểm tạo option.
   * Đây không thay thế UserSkill, chỉ là snapshot nhẹ cho user hiểu vì sao route được gợi ý.
   */
  part_type?: PartType;
  skill_key?: string;
  label_vi?: string;
  ability?: number;
  status?: "weak" | "medium" | "strong";
  trend?: "improving" | "stable" | "declining";
  reason: string;
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
   * Route tổng quát mà user có thể xem trước.
   * Đây là snapshot path, không phải WeekStudy/DayStudy đã persist.
   */
  route_units: IRouteUnitSnapshot[];

  /**
   * Lý do tổng quan cho option.
   * Ví dụ: "Ưu tiên Part 5/6/7 vì đang yếu", "Target 600 nên tập trung core skills".
   */
  summary_reasons: string[];

  /**
   * Bằng chứng năng lực chính tại thời điểm tạo option.
   * Giúp user tin tưởng vì sao hệ thống gợi ý route này.
   */
  ability_highlights: IStrategyAbilityHighlight[];

  /**
   * Index tiếp theo trong route_units mà Layer 4 tầng C sẽ dùng để tạo cycle mới.
   * Field này được update ngay khi tạo WeekStudy/cycle thành công.
   *
   * Ví dụ:
   * - 0: chưa cấp phát unit nào từ route.
   * - 3: các route_units[0..2] đã được cấp phát vào cycle trước.
   */
  next_route_unit_index: number;

  selected_at?: Date;
  created_at: Date;
  updated_at?: Date;
}

const RouteUnitSnapshotSchema = new Schema<IRouteUnitSnapshot>(
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

const StrategyAbilityHighlightSchema = new Schema<IStrategyAbilityHighlight>(
  {
    part_type: {
      type: Number,
      enum: Object.values(PartType).filter((value) => typeof value === "number"),
    },

    skill_key: {
      type: String,
      default: "",
      index: true,
    },

    label_vi: {
      type: String,
      default: "",
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

    reason: {
      type: String,
      required: true,
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

      route_units: {
        type: [RouteUnitSnapshotSchema],
        default: [],
      },

      summary_reasons: {
        type: [String],
        default: [],
      },

      ability_highlights: {
        type: [StrategyAbilityHighlightSchema],
        default: [],
      },

      selected_at: {
        type: Date,
      },
      next_route_unit_index: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
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
