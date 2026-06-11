import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";

export interface IWeekStudy extends Document {
  _id: Types.ObjectId;
  no: number; // tuần thứ mấy
  description: string;
  status: WeekStudyStatus;
  started_at?: Date;
  ended_at?: Date;
  accuracy_overall: number;

  additional_lessons?: {
    lesson_id: Types.ObjectId;   // bài học bổ sung
    completed: boolean;          // đã học xong hay chưa
  }[];

  additional_tests?: {
    test_id: Types.ObjectId;     // mini-test hoặc full-test
    accuracy: number;            // % đúng
    completed_at?: Date;         // ngày hoàn thành test
  }[];

  days: Types.ObjectId[];        // liên kết tới DayStudy
  /**
 * Thời điểm dự kiến user hoàn thành WeekCycle này.
 * Layer 3 dùng field này để so với submit_at của mini test.
 */
  expected_completion_at: Date;

  /**
   * Các skill chính mà WeekCycle này được thiết kế để luyện.
   * Mini test cuối cycle sẽ được đánh giá chủ yếu dựa trên nhóm skill này.
   */
  focus_skill_keys: string[];

  /**
   * Các TOEIC part chính mà WeekCycle này tập trung.
   * Field này giúp scheduler/debug biết cycle đang nhắm vào Part nào.
   */
  focus_part_types: number[];
  /**
   * Strategy option đang được dùng để tạo cycle này.
   */
  learning_path_strategy_option_id?: Types.ObjectId | null;

  /**
   * Assessment cuối cycle.
   * Cycle 1/2/3 thường là mini_test.
   * Cycle 4 là full_test.
   */
  assessment_type?: "mini_test" | "full_test" | null;

  /**
   * Thời lượng dự kiến của assessment cuối cycle.
   * MVP: mini_test = 100 phút, full_test = 200 phút.
   */
  assessment_estimated_minutes?: number;
  created_at: Date;
  updated_at?: Date;
}

const WeekStudySchema = new Schema<IWeekStudy>(
  {
    no: { type: Number, required: true, index: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      required: true,
      index: true,
    },
    started_at: { type: Date },
    ended_at: { type: Date },
    accuracy_overall: { type: Number, default: 0 },

    additional_lessons: [
      {
        lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson" },
        completed: { type: Boolean, default: false },
      },
    ],

    additional_tests: [
      {
        test_id: { type: Schema.Types.ObjectId, ref: "Test" },
        accuracy: { type: Number, default: 0 },
        completed_at: { type: Date },
      },
    ],

    days: [{ type: Schema.Types.ObjectId, ref: "DayStudy" }],
    // Deadline dự kiến của WeekCycle. Layer 3 bắt buộc dùng field này để tính ahead/on_track/late.
    expected_completion_at: {
      type: Date,
      required: true,
      index: true,
    },

    // Skill trọng tâm của cycle, do Layer 4 scheduler ghi khi tạo WeekStudy.
    focus_skill_keys: {
      type: [String],
      default: [],
    },

    // TOEIC Part trọng tâm của cycle, dùng để debug và hỗ trợ scenario/scheduler.
    focus_part_types: {
      type: [Number],
      default: [],
      validate: {
        validator: (values: number[]) =>
          values.every((part) => part >= 1 && part <= 7),
        message: "focus_part_types chỉ được chứa TOEIC Part từ 1 đến 7.",
      },
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
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export const WeekStudy = model<IWeekStudy>("WeekStudy", WeekStudySchema);


