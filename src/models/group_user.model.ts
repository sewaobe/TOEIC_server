import mongoose, { Schema, Document, Types } from "mongoose";

export interface IGroupUser extends Document {
  name: string;
  mentor_id: Types.ObjectId;
  students: Types.ObjectId[];
  learningPath_id?: Types.ObjectId;
  average_progress?: number;
  average_score?: number;
  active_students?: number;
  total_students?: number;
  created_at: Date;
}

const GroupUserSchema = new Schema<IGroupUser>({
  name: { type: String, required: true },
  mentor_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  students: [{ type: Schema.Types.ObjectId, ref: "User" }],
  learningPath_id: { type: Schema.Types.ObjectId, ref: "LearningPath" },
  average_progress: Number,
  average_score: Number,
  active_students: Number,
  total_students: Number,
  created_at: { type: Date, default: Date.now },
});

export const GroupUser = mongoose.model<IGroupUser>("GroupUser", GroupUserSchema);
