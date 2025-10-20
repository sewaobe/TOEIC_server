import mongoose, { Schema, Document, Types } from "mongoose";
import { CERFLevel } from "./topic_vocabulary.model";

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
  isActive: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId;
}

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
  isActive: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
});

export const LearningPath = mongoose.model<ILearningPath>(
  "LearningPath",
  LearningPathSchema
);
