import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUserLearningPath extends Document {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  learningPath_id: Types.ObjectId;
  target_score: number;
  time_per_day: number;
  days_per_week: number;
  target_completion_date: Date;
  current_week: number;
  created_at: Date;   // ✅ thêm - ngày học viên bắt đầu lộ trình
  updated_at: Date;   // ✅ thêm - để theo dõi lần chỉnh sửa gần nhất
}

const UserLearningPathSchema = new Schema<IUserLearningPath>({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  learningPath_id: { type: Schema.Types.ObjectId, ref: "LearningPath", required: true },

  target_score: { type: Number, default: 0 },
  time_per_day: { type: Number, default: 0 },
  days_per_week: { type: Number, default: 0 },
  target_completion_date: { type: Date },
  current_week: { type: Number, default: 1 },

  // ✅ tự động thêm timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// ✅ middleware tự cập nhật updated_at mỗi lần save
UserLearningPathSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

export const UserLearningPath = mongoose.model<IUserLearningPath>(
  "UserLearningPath",
  UserLearningPathSchema
);
