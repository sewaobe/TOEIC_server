import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";

/**
 * Chế độ học của cycle hiện tại.
 *
 * - main_learning: học nội dung chính theo graph.
 * - remediation: học bổ trợ khi skill chưa tiến bộ như kỳ vọng.
 * - review: ôn lại nội dung đã học.
 * - mixed_practice: luyện tập kết hợp nhiều dạng bài trong cùng Part.
 * - exam_practice: luyện tập theo cấu trúc gần với đề thi thật.
 */
export type LearningCycleMode =
  | "main_learning"
  | "remediation"
  | "review"
  | "mixed_practice"
  | "exam_practice";

export interface IWeekStudy extends Document {
  _id: Types.ObjectId;

  /**
   * Số thứ tự của cycle trong LearningPath.
   * Tên field `no` được giữ nguyên để không ảnh hưởng các service hiện tại.
   */
  no: number;

  description: string;
  status: WeekStudyStatus;
  started_at?: Date;
  ended_at?: Date;
  accuracy_overall: number;

  additional_lessons?: {
    lesson_id: Types.ObjectId;
    completed: boolean;
  }[];

  additional_tests?: {
    test_id: Types.ObjectId;
    accuracy: number;
    completed_at?: Date;
  }[];

  /**
   * Các DayStudy thuộc cycle này.
   * DayStudy chỉ chia activity theo thời lượng học mỗi ngày.
   */
  days: Types.ObjectId[];

  /**
   * Thời điểm dự kiến user hoàn thành cycle.
   * Layer 3 có thể dùng field này để đánh giá tiến độ.
   */
  expected_completion_at: Date;

  /**
   * Skill có ROI cao nhất và là lý do chính để scheduler tạo cycle.
   */
  primary_focus_skill_key: string;

  /**
   * Các skill được học kèm do cùng xuất hiện trong target_tags
   * của những LessonManager được chọn.
   *
   * Mảng này không bao gồm primary_focus_skill_key.
   */
  covered_skill_keys: string[];

  /**
   * TOEIC Part chứa primary_focus_skill_key.
   * Một skill-focused cycle chỉ tập trung vào một Part.
   */
  focus_part_type: number;

  /**
   * Cách scheduler triển khai cycle dựa trên trạng thái hiện tại của skill.
   */
  cycle_mode: LearningCycleMode;

  /**
   * Mức tăng ability dự kiến của primary skill sau cycle.
   * Đây là giá trị nội bộ, không phải điểm TOEIC.
   */
  expected_skill_gain: number;

  /**
   * Hiệu quả học dự kiến của primary skill trên mỗi giờ.
   *
   * Công thức:
   * expected_skill_gain / số giờ học dự kiến.
   */
  expected_roi_per_hour: number;

  /**
   * Strategy option cung cấp roadmap dài hạn cho cycle này.
   */
  learning_path_strategy_option_id?: Types.ObjectId | null;

  /**
   * Assessment kết thúc cycle.
   */
  assessment_type?: "mini_test" | "full_test" | null;

  /**
   * Thời lượng dự kiến của assessment cuối cycle, đơn vị phút.
   */
  assessment_estimated_minutes?: number;

  created_at: Date;
  updated_at?: Date;
}

const WeekStudySchema = new Schema<IWeekStudy>(
  {
    no: {
      type: Number,
      required: true,
      index: true,
      min: 1,
    },

    description: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      required: true,
      index: true,
    },

    started_at: {
      type: Date,
    },

    ended_at: {
      type: Date,
    },

    accuracy_overall: {
      type: Number,
      default: 0,
      min: 0,
    },

    additional_lessons: [
      {
        lesson_id: {
          type: Schema.Types.ObjectId,
          ref: "Lesson",
          required: true,
        },
        completed: {
          type: Boolean,
          default: false,
        },
      },
    ],

    additional_tests: [
      {
        test_id: {
          type: Schema.Types.ObjectId,
          ref: "Test",
          required: true,
        },
        accuracy: {
          type: Number,
          default: 0,
          min: 0,
        },
        completed_at: {
          type: Date,
        },
      },
    ],

    days: [
      {
        type: Schema.Types.ObjectId,
        ref: "DayStudy",
      },
    ],

    expected_completion_at: {
      type: Date,
      required: true,
      index: true,
    },

    primary_focus_skill_key: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    covered_skill_keys: {
      type: [String],
      default: [],
    },

    focus_part_type: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
      index: true,
    },

    cycle_mode: {
      type: String,
      enum: [
        "main_learning",
        "remediation",
        "review",
        "mixed_practice",
        "exam_practice",
      ],
      required: true,
      default: "main_learning",
      index: true,
    },

    expected_skill_gain: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    expected_roi_per_hour: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    learning_path_strategy_option_id: {
      type: Schema.Types.ObjectId,
      ref: "LearningPathStrategyOption",
      default: null,
      index: true,
    },

    assessment_type: {
      type: String,
      enum: ["mini_test", "full_test"],
      default: null,
      index: true,
    },

    assessment_estimated_minutes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

WeekStudySchema.index({
  primary_focus_skill_key: 1,
  status: 1,
  created_at: -1,
});

export const WeekStudy = model<IWeekStudy>(
  "WeekStudy",
  WeekStudySchema
);