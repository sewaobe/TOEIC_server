import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUserStat extends Document {
  user_id: Types.ObjectId;
  learningPath_id: Types.ObjectId;
  completed_lessons: number;
  total_lessons: number;
  completion_rate: number;
  total_study_time: number;
  streak_days: number;
  current_score: number;
  target_score: number;
  updated_at: Date;

  // 🧩 Thêm mới
  mentor_id?: Types.ObjectId; // người quản lý (CTV/Admin)
  notes?: string[]; // ghi chú từ mentor
}

const UserStatSchema = new Schema<IUserStat>({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  learningPath_id: { type: Schema.Types.ObjectId, ref: "LearningPath" },
  completed_lessons: { type: Number, default: 0 },
  total_lessons: { type: Number, default: 0 },
  completion_rate: { type: Number, default: 0 },
  total_study_time: { type: Number, default: 0 },
  streak_days: { type: Number, default: 0 },
  current_score: { type: Number, default: 0 },
  target_score: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },

  // 🧩 Thêm mới
  mentor_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
  notes: { type: [String], default: [] },
});

export const UserStat = mongoose.model<IUserStat>("UserStat", UserStatSchema);
