import mongoose, { Schema, Document, Types } from "mongoose";
import { CERFLevel } from "./topic_vocabulary.model";

/**
 * Interface cho Feedback của buổi học
 */
export interface ILessonFeedback {
  day_study_id: Types.ObjectId;
  rating: number; // 1-5
  reasons: string[];
  comment?: string;
  is_positive: boolean; // true nếu rating >= 4
  created_at: Date;
}

export interface ILearningPath extends Document {
  title: string;
  description: string;
  level: CERFLevel;
  user_id?: Types.ObjectId;
  target_score?: number;
  time_per_day?: number;
  days_per_week?: number;
  target_completion_date?: Date;
  current_week?: number;
  week_study_ids?: Types.ObjectId[];
  additional_week_studies?: Types.ObjectId[];
  feedbacks?: ILessonFeedback[];
  /**
   * Trạng thái nghiệp vụ của lộ trình. Không xóa document khi hết hạn để
   * giữ lịch sử học và lý do kết thúc lộ trình.
   */
  status: "active" | "completed" | "expired";
  /** Mã/lý do chuyển trạng thái, ví dụ: inactivity_over_14_days. */
  reason?: string | null;
  /**
   * Legacy compatibility flag. Với lộ trình mới, giá trị này luôn đồng bộ
   * với status === "active".
   */
  isActive: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId;
  /**
 * Số mini test user đã hoàn thành kể từ lần full test gần nhất.
 * Layer 4 dùng counter này để biết cycle tiếp theo gắn mini test hay full test.
 * Rule hiện tại: 3 mini test xong thì cycle kế tiếp kết thúc bằng full test.
 */
  mini_tests_completed_since_last_full_test: number;

  /**
   * UserTest của lần full test gần nhất.
   * Dùng để audit và reset chu kỳ mini/full test.
   */
  last_full_test_user_test_id?: Types.ObjectId | null;

  /**
   * Thời điểm user submit full test gần nhất.
   */
  last_full_test_submitted_at?: Date | null;
}

/**
 * Sub-schema cho Feedback
 */
const LessonFeedbackSchema = new Schema<ILessonFeedback>(
  {
    day_study_id: {
      type: Schema.Types.ObjectId,
      ref: "DayStudy",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reasons: {
      type: [String],
      default: [],
    },
    comment: {
      type: String,
      maxlength: 500,
    },
    is_positive: {
      type: Boolean,
      required: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const LearningPathSchema = new Schema<ILearningPath>({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  level: { type: String, enum: Object.values(CERFLevel), required: true },
  user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
  target_score: { type: Number, default: 0 },
  time_per_day: { type: Number, default: 0 },
  days_per_week: { type: Number, default: 0 },
  target_completion_date: { type: Date, default: null },
  current_week: { type: Number, default: 1 },
  week_study_ids: [
    { type: Schema.Types.ObjectId, ref: "WeekStudy", default: [] },
  ],
  additional_week_studies: [
    { type: Schema.Types.ObjectId, ref: "WeekStudy", default: [] },
  ],
  feedbacks: {
    type: [LessonFeedbackSchema],
    default: [],
  },
  status: {
    type: String,
    enum: ["active", "completed", "expired"],
    default: "active",
    required: true,
    index: true,
  },
  reason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 500,
  },
  isActive: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
  mini_tests_completed_since_last_full_test: {
    type: Number,
    default: 0,
    min: 0,
  },

  last_full_test_user_test_id: {
    type: Schema.Types.ObjectId,
    ref: "UserTest",
    default: null,
    index: true,
  },

  last_full_test_submitted_at: {
    type: Date,
    default: null,
    index: true,
  },
});

export const LearningPath = mongoose.model<ILearningPath>(
  "LearningPath",
  LearningPathSchema
);
