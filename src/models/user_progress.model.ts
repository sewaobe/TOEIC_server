import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Mô hình thống kê tiến độ học tập của người dùng
 */
export interface IUserProgress extends Document {
  user_id: Types.ObjectId; // Học viên
  learningPath_id: Types.ObjectId; // Lộ trình học hiện tại
  completed_lessons: number; // Số bài học đã hoàn thành
  total_lessons: number; // Tổng số bài học trong lộ trình
  completion_rate: number; // Tỷ lệ hoàn thành (%)
  total_study_time: number; // Tổng thời gian học (phút)
  streak_days: number; // Số ngày học liên tiếp
  longest_streak: number; // Kỷ lục streak
  last_study_date?: Date; // Ngày học gần nhất
  current_score: number; // Điểm hiện tại
  target_score: number; // Điểm mục tiêu
  updated_at: Date; // Thời gian cập nhật gần nhất

  // 🧩 Thông tin bổ sung
  mentor_id?: Types.ObjectId; // Người hướng dẫn (CTV/Admin)
  notes?: string[]; // Ghi chú từ mentor
}

const UserProgressSchema = new Schema<IUserProgress>({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  learningPath_id: { type: Schema.Types.ObjectId, ref: "LearningPath" },
  completed_lessons: { type: Number, default: 0 },
  total_lessons: { type: Number, default: 0 },
  completion_rate: { type: Number, default: 0 },
  total_study_time: { type: Number, default: 0 },
  streak_days: { type: Number, default: 0 },
  longest_streak: { type: Number, default: 0 },
  last_study_date: { type: Date, default: null },
  current_score: { type: Number, default: 0 },
  target_score: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },

  // 🧩 Thông tin bổ sung
  mentor_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
  notes: { type: [String], default: [] },
});

// ✅ Export model
export const UserProgress = mongoose.model<IUserProgress>(
  "UserProgress",
  UserProgressSchema
);
